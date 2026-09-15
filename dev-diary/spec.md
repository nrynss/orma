# Orma — technical specification

Companion to [product.md](product.md), which decides what Orma is and why. This
document describes what gets built.

---

## 1. Stack

| Layer | Choice |
|---|---|
| Database, auth, storage, cron, functions | Supabase, free plan, one project |
| Front end | SvelteKit on Cloudflare Workers |
| Calls | CALL-E Developer API |
| Speech to text and prose | Gemini via Vertex AI |
| Email | Resend, HTTP API |
| Telegram | Bot API, webhook mode |

```
 Browser ──► orma.nryn.dev      (SvelteKit, Cloudflare Worker)
                │
                └──► orma-api.nryn.dev (front door Worker)
                        │
                        ├──► Supabase PostgREST  (reads and writes under RLS)
                        ├──► Supabase Auth       (magic link, Telegram bridge)
                        └──► Supabase Functions

 pg_cron ──every minute──► fn:tick ──► CALL-E  POST /v1/goals/{id}/runs
 CALL-E ──webhook──► fn:calle-webhook ──re-fetch──► CALL-E GET run
 Telegram ──webhook──► fn:telegram
 Agents ──MCP──► fn:mcp
 pg_cron ──weekly──► fn:analysis ──► Vertex AI
```

`orma-api.nryn.dev` is a Cloudflare proxy in front of the Supabase functions
host, so the webhook and MCP URLs are Orma's own and survive a project change.

---

## 2. Data model

All tables live in `public`, all are keyed by `user_id`, and all have row-level
security enabled. `auth.users` is Supabase's.

```sql
profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  display_name        text not null,
  phone_e164          text check (phone_e164 ~ '^\+[1-9]\d{7,14}$'),
  phone_confirmed_at  timestamptz,
  timezone            text not null default 'Asia/Kolkata',
  telegram_chat_id    bigint unique,
  email_receipts      boolean not null default false,
  telegram_receipts   boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
)
```

`display_name` is not optional. Unset, the agent cannot answer the first question
anyone asks.

```sql
consents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  kind          text not null,          -- outbound_calls | recording
  text_version  text not null,          -- the exact wording shown
  granted_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  source        text not null           -- web | telegram
)

slots (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  local_time   time not null,
  weekdays     smallint[] not null default '{1,2,3,4,5,6,7}',
  part_of_day  text not null,           -- morning | midday | evening
  active       boolean not null default true,
  created_at   timestamptz not null default now()
)

items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  text            text not null,
  status          text not null default 'open',   -- open | retired | done
  since_date      date,                            -- user-stated, optional
  source          text not null,                   -- call | telegram | mcp | web
  seeded          boolean not null default false,
  created_at      timestamptz not null default now(),
  retired_at      timestamptz,
  retired_reason  text
)

item_mentions (
  id              bigserial primary key,
  item_id         uuid not null references items(id) on delete cascade,
  call_run_id     uuid references call_runs(id) on delete set null,
  offset_seconds  integer,
  created_at      timestamptz not null default now()
)

commitments (
  id                      uuid primary key default gen_random_uuid(),
  item_id                 uuid not null references items(id) on delete cascade,
  user_id                 uuid not null references profiles(id) on delete cascade,
  call_run_id             uuid references call_runs(id) on delete set null,
  due                     timestamptz,
  evidence_offset_seconds integer not null,
  created_at              timestamptz not null default now()
)
```

`item_mentions` is a row per mention, not a counter, so "you have mentioned this
three times" is inspectable and the evidence offset points at the moment it was
said.

```sql
call_runs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  slot_id           uuid references slots(id) on delete set null,
  local_date        date not null,
  part_of_day       text not null,
  scheduled_for     timestamptz not null,
  state             text not null default 'scheduled',
  disposition       text,
  mood              text,                            -- from the result
  poll_after        timestamptz,
  idempotency_key   text not null unique,
  calle_call_id     text,
  calle_confidence  jsonb,                           -- score and label, as returned
  calle_failure     jsonb,                           -- failure_code and message, verbatim
  briefing          jsonb,                           -- exactly what was sent
  dry_run           boolean not null default false,
  billable          boolean not null default false,
  claimed_at        timestamptz,
  dispatched_at     timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz not null default now()
)

call_events (
  id           bigserial primary key,
  call_run_id  uuid not null references call_runs(id) on delete cascade,
  at           timestamptz not null default now(),
  kind         text not null,
  detail       jsonb
)

transcripts (
  call_run_id  uuid primary key references call_runs(id) on delete cascade,
  turns        jsonb not null,     -- [{speaker, offset_seconds, text}]
  raw          jsonb,
  fetched_at   timestamptz not null default now()
)

results (
  call_run_id  uuid primary key references call_runs(id) on delete cascade,
  structured   jsonb,              -- null when validation failed
  valid        boolean not null,
  error        text,
  fetched_at   timestamptz not null default now()
)

pattern_reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  facts         jsonb not null,    -- computed by SQL
  prose         text not null,     -- phrased by the model over facts
  created_at    timestamptz not null default now()
)

deliveries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles(id) on delete cascade,
  channel      text not null,      -- telegram | email
  kind         text not null,      -- post_call | pattern
  call_run_id  uuid references call_runs(id) on delete set null,
  payload      jsonb not null,
  sent_at      timestamptz,
  error        text
)

webhook_events (
  event_id     text primary key,   -- CALL-E-Event-Id, for de-duplication
  received_at  timestamptz not null default now(),
  type         text
)
```

`call_events` is the operator timeline. Supabase logs are organised per
invocation and a single call spans several, so this table is how anyone answers
"what happened at 8am". It is also the demo video's one shot of visible
machinery.

---

## 3. Call run lifecycle

```
 scheduled ──claim──► claimed ──dispatch──► dispatched
      │                                          │
      │                                          ▼
      │                                   awaiting_result
      │                                     │     │     │
      ▼                                     ▼     ▼     ▼
  canceled                           completed  no_result  failed
```

**States.** `scheduled`, `claimed`, `dispatched`, `awaiting_result`, and the
terminal set `completed`, `no_result`, `failed`, `canceled`.

**Dispositions**, written by Orma when a run reaches a terminal state:

| Disposition | Written when | Redial | Billed |
|---|---|---|---|
| `answered_extracted` | run `completed`, `result` non-null | never | yes |
| `answered_no_result` | `call.result_validation_failed`, or `completed` with a null `result` | never | yes |
| `not_answered` | run `failed`; `error.code` stored verbatim | never | no |
| `canceled` | run `canceled` | never | no |

Items on a `not_answered` day stay open and appear in the next briefing, because
nothing retired them.

---

## 4. The scheduler

### Materialisation

A `pg_cron` job at 00:10 UTC materialises the next 48 hours of `call_runs` from
active slots, converting `local_time` in the profile's timezone into an absolute
`scheduled_for`. Materialising rather than computing due-ness on the fly means
the schedule is visible in the UI, a slot change has an obvious effect, and
daylight and travel changes are resolved once.

### The tick

`pg_cron` invokes `fn:tick` every minute. Claiming happens in SQL, so overlapping
ticks are harmless.

```sql
with due as (
  select id
    from call_runs
   where state = 'scheduled'
     and scheduled_for <= now()
   order by scheduled_for
     for update skip locked
   limit 20
)
update call_runs c
   set state = 'claimed', claimed_at = now()
  from due
 where c.id = due.id
returning c.*;
```

The same tick advances runs whose `poll_after` has passed and finalises runs that
reached a terminal state. Every pass writes to `call_events`.

Exactly-once dispatch is enforced by `SKIP LOCKED` plus the unique
`idempotency_key`. Orma must never double-dial a person, and this is where that
is guaranteed.

### Idempotency key

Derived from a durable workflow event and persisted before the request is sent,
as the CALL-E API requires:

```
orma:{user_id}:{local_date}:{part_of_day}:v1
```

An exact replay returns the original run with 201. The same key with changed
inputs returns 409, which is logged loudly as a bug and never worked around with
a new key.

---

## 5. CALL-E integration

### Endpoints

All paths carry a `/v1` prefix. Auth is a bearer token.

```
POST /v1/calls                                  Idempotency-Key header
GET  /v1/calls/{call_id}
GET  /v1/calls/{call_id}/events
```

Orma composes each call rather than running a published Goal. Goals cannot be
created over the API, so a Goal would put the prompt in a console rather than in
the repository, and it would freeze the task text while only scalar variables
vary. Orma's whole premise is that the instruction changes every day. The request
shape and the result schema are in [docs/calle-call.md](../docs/calle-call.md).

The trade is voice region and callee locale, which a Goal pins and this route
takes from account defaults. If Indian numbers come through wrong, the fallback
is a console Goal and `POST /v1/goals/{goal_id}/runs`.

### The briefing

The briefing is substituted into the task template before the request is built:

| Variable | Example |
|---|---|
| `user_name` | `Narayan` |
| `lead_line` | `You've mentioned the dentist three times. It's been 34 days.` |
| `open_items` | `dentist; visa renewal; call Amma` |
| `last_call_summary` | `Yesterday you said you'd book it by Friday.` |
| `slot_local_time` | `08:00` |

Every count and age in those strings is computed by SQL. The model phrases them,
it never derives them. `lead_line` is assembled from `item_mentions` and
`since_date` before the request is built, and the exact `briefing` is stored on
the run, so any claim made on a call traces back to the row that produced it.

### Following the call

Webhook first, polling as reconciliation. A run in `awaiting_result` carries
`poll_after`, set 60 seconds after dispatch and then 10 seconds per pass.
Whichever path arrives first wins and the other is a no-op, because the event id
and the run state make both idempotent.

Follow-up advances across ticks rather than sitting in a loop, because a free
Edge Function allows 150 seconds of wall clock and 2 seconds of CPU per request.

### Handling the webhook

CALL-E webhooks carry no signature. The only identifier is a `CALL-E-Event-Id`
header matching `^evt_[A-Za-z0-9_-]+$`, which is a de-duplication key. The body
is therefore a notification, never a fact:

1. Reject unless the request carries Orma's own secret in the path.
2. Record the event id. If it was seen before, return 200 and stop.
3. Re-fetch the authoritative run from CALL-E with the bearer token.
4. Act only on what the re-fetch returned.

No item, call or billing state is ever mutated from webhook body content. Event
types are `call.completed`, `call.failed` and `call.result_validation_failed`.

### Result handling

A run's `error` carries a `code` to branch on and a `message` for operators. A
non-null `error` is final and mutually exclusive with `result`. Both are stored
verbatim on the run.

`structured_result` is null-or-correct. On null, Orma falls back to the raw
transcript for analysis, flags the run for repair, records `answered_no_result`,
and sends the receipt anyway. The user never learns that extraction failed.

Result fields, per product.md §4: `captured_items`, `retired_items`,
`commitments`, `slot_change_requested` with `slot_change_time`, and `mood`. `slot_change_request` is a proposal
only; Orma owns the slot and confirms the change itself. `mood` is copied onto
`call_runs.mood`.

---

## 6. Function surface

| Function | Trigger | Does |
|---|---|---|
| `tick` | `pg_cron`, every minute | Claim, dispatch, poll, finalise |
| `materialise` | `pg_cron`, nightly | Build the next 48 hours of runs |
| `calle-webhook` | CALL-E | De-duplicate, re-fetch, record |
| `telegram` | Telegram | Capture text and voice, deliver receipts |
| `mcp` | Agents | The six tools, stateless HTTP |
| `auth-telegram` | Browser | Verify widget hash, mint a session |
| `analysis` | `pg_cron`, weekly | Compute facts, phrase report, deliver |

Shared code lives in `supabase/functions/_shared/` and is imported directly
rather than called over HTTP, which avoids the function-to-function rate limit.

---

## 7. Auth

Both paths mint the same Supabase JWT, so every row-level security policy is
written once.

**Email magic link** is native, with Resend configured as the sender. Supabase's
built-in mailer is rate limited to a handful of messages an hour, and Edge
Functions block outbound ports 25 and 587, so all mail goes over an HTTP API.

**Telegram** is a bridge. `fn:auth-telegram` verifies the Login Widget payload by
computing `HMAC-SHA256` over the data-check string with `SHA256(bot_token)` as
the key, comparing it against `hash`, and rejecting payloads older than a short
window. It then finds or creates the user and mints a session in two steps:

1. `auth.admin.generateLink({ type: 'magiclink', email })`, service role only,
   which produces the one-time token without sending mail.
2. `auth.verifyOtp({ token_hash, type: 'email' })`, which accepts a bare token
   hash and returns a session.

Nothing is signed in the database. The bridge earns its place twice: it is
identity, and it is the Start press that lets the bot message the user at all.

### Row-level security

Every table carries `user_id` and one policy shape:

```sql
alter table items enable row level security;

create policy items_owner on items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

Functions use the service role and bypass RLS. `call_events`, `transcripts`,
`results` and `webhook_events` are readable by their owner and writable only by
the service role.

---

## 8. Telegram

Webhook mode, with a secret token in the path. grammY runs natively on Deno.

**Text capture** inserts an item and replies with what it recorded.

**Voice capture** acknowledges immediately, downloads the Opus file, sends it to
Gemini, then edits its own message with the transcribed text and a confirm
control. The acknowledgement comes first so the bot never goes silent while the
model works.

**Receipts only, never prompts.** Telegram carries the post-call summary, what
was captured and retired, and the pattern report. It never asks for anything.

---

## 9. MCP server

Streamable HTTP in stateless mode, served at `orma-api.nryn.dev/mcp`.

Tools, per product.md §2: `add_item`, `list_items`, `retire_item`, `set_slot`,
`get_last_call`, `get_patterns`.

`retire_item` is destructive, so it records who retired it and through which
surface, and it is reversible from the web app. Authorisation is the caller's
Supabase JWT, and every tool runs under the same RLS as the browser.

---

## 10. Analysis

Two stages.

**SQL computes the facts.** Mention counts, ages from `since_date`, streaks,
which items survive longest, how long items sit before being retired, and the
distribution of `mood` across the period. All of it lands in
`pattern_reports.facts` as data.

**The model phrases them.** Gemini receives the facts and writes the prose. It is
given no transcripts and no ability to count. If a number in the prose is not in
the facts row, the report is regenerated.

The report goes out in writing over Telegram or email. The call carries a line or
two of it, never the whole thing.

---

## 11. Front end

SvelteKit with the Cloudflare adapter. The landing page is server rendered, so a
first-time visitor sees content rather than a spinner.

| Route | Rendering | Content |
|---|---|---|
| `/` | SSR | What Orma is, the thesis, one synthetic call demo, labelled, played in the browser |
| `/login` | SSR | Magic link form and the Telegram widget |
| `/app` | CSR | Next call, today's open items, last call summary |
| `/app/items` | CSR | The list, retire, restore, set a since-date |
| `/app/history` | CSR | Calls, summaries, mood, transcripts with offsets |
| `/app/patterns` | CSR | Pattern reports, including the mood trend |
| `/app/settings` | CSR | Phone, consent, timezone, slots, receipt channels |
| `/app/timeline` | CSR | Operator view of `call_events`, own account only |

Mood is shown as a small marker on each call in history and as a trend line on
the patterns page. It is never editable, because it is what the call heard.

The signed-in app talks to PostgREST directly under row-level security. There is
no bespoke CRUD API to write, test or secure.

---

## 12. Deployment

Two Cloudflare Workers and one Supabase project. No server, no container.

| What | Where | Deploy |
|---|---|---|
| Web app | `orma.nryn.dev` | `npm run deploy` in `web/` |
| Front door | `orma-api.nryn.dev` | `npm run deploy` in `proxy/` |
| Database, auth, functions | project `orma`, `ap-south-1` | `supabase db push`, `supabase functions deploy` |

Cloudflare folded Pages into Workers, so the app ships as a Worker with a static
asset binding rather than as a Pages project. `web/wrangler.jsonc` pins the
account id, because account listing fails for this login.

Three things bite whoever touches this next.

**Never add `CLOUDFLARE_API_TOKEN` to `.env`.** Wrangler auto-loads a project
`.env` and prefers that name over the OAuth login, and every deploy then fails
with an authentication error that blames the login. The zone-scoped DNS token is
`CF_DNS_API_TOKEN` for exactly this reason.

**`.assetsignore` is regenerated by the build script.** The asset directory is
rebuilt on every build, and without that file the deploy refuses, because
`_worker.js` would be published as a public asset.

**Every hostname stays one level deep.** Cloudflare's free certificate covers
`nryn.dev` and `*.nryn.dev` and nothing deeper, so a two-level name fails its
TLS handshake with no certificate at all.

**Secrets** live in three places and are committed to none of them.

| Copy | Holds | Read by |
|---|---|---|
| `.env` | everything | local tooling, `set -a; . ./.env` |
| GitHub variables and secrets | everything, split by whether printing it is safe | cloud agents, Codespaces, workflows |
| Supabase function secrets | what functions need | the deployed Edge Functions |

`scripts/bootstrap-env.sh` rebuilds `.env` from the environment, so an agent that
never sees the local file can still run. `.github/workflows/_env-example.yml`
carries the `env:` block that maps every name to `vars.` or `secrets.`.

A secret value cannot be read back out of GitHub; listing shows names only. Change
one and you change it in all three places.

Names must not start with `SUPABASE_`, which is reserved by the platform.

```
# Runtime
ORMA_API_URL
ORMA_DRY_RUN
ORMA_ENV
ORMA_OWNER_PHONE
ORMA_PUBLIC_URL
ORMA_WEBHOOK_SECRET
# CALL-E
CALLE_API_BASE
CALLE_API_KEY
# Telegram
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
# Vertex AI
GEMINI_MODEL
GOOGLE_APPLICATION_CREDENTIALS_JSON
GOOGLE_VERTEX_LOCATION
GOOGLE_VERTEX_PROJECT
# Email
RESEND_API_KEY
RESEND_FROM
```

**Keeping it alive through judging.** Judging opens 30 September and closes
13 October, sixteen days after submissions close. A free Supabase project pauses
after seven days of low activity, and a paused project stops `pg_cron`, which
stops the calls. A GitHub Actions workflow runs daily and makes one request
against PostgREST to register measured activity. It takes no backup.

## 13. Dry run, consent and cancellation

**Dry run is a first-class mode**, set per run on `call_runs.dry_run` and
globally by an environment flag. In dry run the dispatcher assembles the exact
request body, writes it to `call_events`, synthesises a terminal state, and calls
nobody. It is how the pipeline is rehearsed and how the demo is tested without
spending a call.

**Consent** is a row, not a checkbox: the exact wording shown, when it was
granted, through which surface, and when it was revoked. No call is dispatched
for a profile without a live `outbound_calls` consent and a confirmed number.

**Cancellation.** A user can cancel today's call, pause all calls, or delete the
account. Cancelling sets `canceled` on scheduled runs. Deleting cascades
everything.

**Numbers are masked** in every sample, log line and README example.

---

## 14. Seed data

The demo needs an item older than the run of real use can produce. Seeded rows
carry `seeded = true`, the seed script lives in the repository and is runnable,
the README states which rows were seeded, and the demo video captions it on
screen. Everything after the seed is real: the calls happen, the mentions
accumulate, and the retirement in the demo is a live state change.
