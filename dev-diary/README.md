# Development Diary: Phase Handoffs

This document outlines the work breakdown for **Orma**.

Reference specifications:
- [`product.md`](product.md): What Orma is, why it is a phone call, and the rules that cannot bend.
- [`spec.md`](spec.md): Stack, schema, state machines, and everything that gets built.
- [`feedback.md`](feedback.md): Every piece of CALL-E friction, written as it is hit. Feeds T8.7.

Where a phase document and specification conflict, the specification wins. Record discrepancies in the handoff log.

Each document provides complete context for an engineer starting cold.

**Current status:** P0 and P1 are complete. Schema, policies, types, fixtures,
validation and local seed data are frozen.

P0 is complete. What exists is listed in [PHASE-0-ground.md](PHASE-0-ground.md): the repository, the Supabase project with its extensions and secrets, the deployed app and front door, the bot, verified email, and a proven CALL-E path. Start at P1.

---

## Swarm Coordination Rule

> **Phase-level dependencies are advisory. Task-level dependencies are binding.**

Do not delay work for an entire phase to finish. If task `T6.3` requires only `T1.1` and `T5.3`, start immediately when those tasks complete.

**A call costs money and rings a real phone.** Task `T1.4` records one real CALL-E run of each terminal shape into `testdata/`, and `T2.8` builds the dry-run dispatcher. Tasks marked `fixture-ok` run against those recordings and never place a call. Only `T1.4`, `T2.5` and Phase P8 need live CALL-E.

This allows almost the whole system to be built offline. The web app, the MCP server, the Telegram bot and the analysis pass all develop against fixtures and a local Supabase.

---

## Phase Graph

| Phase | Document | Requires | Runs parallel with | Blocks |
|---|---|---|---|---|
| **P0** Ground | [PHASE-0-ground.md](PHASE-0-ground.md) | none | — | done |
| **P1** Schema and contracts | [PHASE-1-contracts.md](PHASE-1-contracts.md) | none | P0 | P2, P3, P4, P5, P7 |
| **P2** Call engine | [PHASE-2-call-engine.md](PHASE-2-call-engine.md) | P1 | P3, P4, P5, P7 | P7, P8 |
| **P3** Telegram | [PHASE-3-telegram.md](PHASE-3-telegram.md) | T1.1, T1.2 | P2, P4, P5, P6 | P7 (delivery), P8 |
| **P4** MCP server | [PHASE-4-mcp.md](PHASE-4-mcp.md) | T1.1, T1.2, T1.3 | P2, P3, P5, P6 | P8 |
| **P5** Auth and web shell | [PHASE-5-auth-shell.md](PHASE-5-auth-shell.md) | T1.2 | P2, P3, P4, P7 | P6, P8 |
| **P6** Web app | [PHASE-6-web-app.md](PHASE-6-web-app.md) | T5.3, soft P2 | P2, P3, P4, P7 | P8 |
| **P7** Analysis and receipts | [PHASE-7-analysis.md](PHASE-7-analysis.md) | T1.1, T3.4, soft P2 | P4, P6 | P8 |
| **P8** Ship | [PHASE-8-ship.md](PHASE-8-ship.md) | P2, P3, P4, P5, P6, P7 | none | final submission |

```text
  P0 done
     │
  P1 contracts ─┬─▶ P2 call engine ─┬─▶ P7 analysis ─┐
                ├─▶ P3 telegram ────┘                │
                ├─▶ P4 mcp ─────────────────────────┤
                │                                    ├─▶ P8 ship
                └─▶ P5 auth shell ─▶ P6 web app ────┘
```

P1 is the only bottleneck left. Once the schema and the CALL-E fixtures freeze,
all five tracks run at once.

---

## Parallel Tracks

Five tracks run concurrently without path conflicts, all of them opening on a
task inside P1.

| Track | Phase | Opens on | Live CALL-E? | First task | Readiness |
|---|---|---|---|---|---|
| **A: Call engine** | P2 | T1.5 | Only T2.5 | T2.1 | Everything else runs against the `testdata/` recordings. |
| **B: Telegram** | P3 | T1.2 | No | T3.1 | Bot is registered. Needs Gemini, not CALL-E. |
| **C: MCP** | P4 | T1.3 | No | T4.1 | Pure database work behind the same RLS as the browser. |
| **D: Analysis** | P7 | T1.1 | No | T7.1 | Facts are SQL over fixture rows. |
| **E: Auth and web** | P5 | T1.2 | No | T5.1 | App and front door are deployed. Point it at `ORMA_API_URL`. |

Prioritise track A. Nothing in the demo exists without it, and it is the only
track that has to keep running for days before submission. Track E is the one to
hand to whoever is blocked, since it shares no files with the other four.

---

## Task Pattern

Every task in the phase documents follows this template:

```markdown
### T2.4: Dispatch to CALL-E ★
requires:   T1.4, T2.3
fixture-ok: yes
size:       M · frontier
owns:       supabase/functions/_shared/calle.ts
status:     not-started
```

- **requires:** Binding task identifiers.
- **fixture-ok:** Whether the task can be completed without placing a real call.
- **size:** Scope estimation, from XS to XL.
- **class:** Which agent to send. Light, mid, or frontier.
- **owns:** File paths exclusively managed by this task.
- **status:** Current task state.

A star (★) marks tasks on the critical demo path.

---

## Developer Guidelines

1. **Claim before starting:** Update status to `claimed:<id>` in the corresponding phase document.
2. **Respect file ownership:** Do not edit files outside your assigned `owns` path.
3. **Freeze contracts after P1:** The Goal's published run spec and the database schema change together or not at all. Update `testdata/` alongside any type modification.
4. **Never place a call you did not mean to place.** Default every local and test run to dry mode. A call costs money and rings a real phone.
5. **Counts and ages come from SQL.** The model phrases them. If a number appears in a call or a report, a row produced it.
6. **Never trust a webhook body.** Record the event id, re-fetch the run, act on the re-fetch.
7. **Destructive actions carry evidence.** A retirement records the transcript offset where it was said.
8. **Mask numbers** in every sample, log line and document.
9. **Document handoffs:** Update the handoff log when finishing a phase or task.

---

### The two traps this project has

**Double-dialling.** The scheduler is the only component that can cost money and embarrass the product at the same time. Exactly-once dispatch is enforced twice over: a `FOR UPDATE SKIP LOCKED` claim so two ticks cannot take the same run, and a unique `idempotency_key` so a retried request cannot produce a second call. Neither is optional, and neither is a substitute for the other. A 409 from CALL-E means the key was reused with different inputs, which is a bug to fix rather than a condition to work around.

**Numbers the model made up.** "Three times" and "34 days" are the product. If the model is ever given the raw material to count, it will eventually count wrong on a call, and nobody will catch it because it sounds right. Counts are computed in SQL, rendered into scalar variables, and stored on the run before dispatch. The same rule governs the pattern report: if a number in the prose is not in the facts row, regenerate.

---

## Scope and Execution

All tasks defined across these documents will ship.

We size tasks for full completion rather than approximate implementation. If a task proves unwieldy, split it into subtasks and document the change in the handoff log.

If external blockers arise, record the root cause clearly in the handoff log and notify dependent tasks.

---

## Critical Path

The demonstration depends on this unbroken execution sequence:

```
Schema and RLS (T1.1, T1.2) -> Record CALL-E fixtures (T1.4)
  -> Materialise runs (T2.1) -> Assemble the briefing from SQL (T2.2)
  -> Claim and dispatch (T2.3, T2.4) -> Reconcile (T2.5, T2.6)
  -> Ingest result, write mentions and retirements (T2.7)
  -> Seed the aged item (T8.1) -> Run real calls across days (T8.2)
  -> Record the demo (T8.5)
```

Protect this core flow above auxiliary features. The line "You've mentioned the dentist three times, it's been 34 days" is produced by T2.2 reading rows written by T2.7, and everything else in the submission is scaffolding around it.

---

## Status Board

| Phase | Tasks complete | Status |
|---|---|---|
| P0 | 2 / 2 | **Complete.** App at orma.nryn.dev, front door at orma-api.nryn.dev. |
| P1 | 7 / 7 | Complete. Contracts are frozen. |
| P2 | 5 / 9 | T2.1 through T2.4 and T2.6 complete. T2.8 and T2.9 remain in progress. T2.5 and T2.7 are not started. |
| P3 | 5 / 5 | **P3 e2e clean.** Capture, link, and voice are wired on the live webhook. |
| P4 | 0 / 3 | T4.1 can start. |
| P5 | 0 / 4 | T5.1 can start. |
| P6 | 0 / 6 | Not started. Blocked on T5.3. |
| P7 | 0 / 4 | Not started. Soft-blocked on P2. T3.4 delivery is ready. |
| P8 | 0 / 7 | Not started. T8.2 starts as soon as T2.4 dispatches, not when P8 opens. |

---

## Handoff Log

Entries are appended, never edited. One per task or phase close, dated, naming
what changed, what it unblocked, and anything the next agent should not have to
work out again.

The phase documents carry only remaining work, so this log is the only record of
what closed and why.

### 2026-09-11 · Setup, before P0 was scoped

**Repository.** `github.com/nrynss/orma`, private, default branch `main`.
`.env`, build output and credential files ignored. A secret scan runs over the
staged diff before each push, not after.

**Supabase project `orma`**, ref `pyuubklpkhjngiqqwypf`, `ap-south-1`, free plan,
Postgres 17.6, linked to the repository. It takes the second and last free
project slot, so `openai-devdays` cannot be resumed while it is active.

**`pg_cron 1.6.4` and `pg_net 0.20.4` installed.** Neither ships enabled on a
fresh project, unlike the older `native-builder` image. The scheduler cannot
exist without them, so never assume they are present.

**Telegram bot `@orma_tele_bot`** registered, with description and command menu
set. No webhook yet, which T3.1 does. Unblocks P3.

**Email on `send.nryn.dev`**, verified in `ap-northeast-1`, with DKIM, SPF,
feedback MX and return-path CNAME written into Cloudflare. Running on a
sending-only Resend key; the full-access key used to register the domain was
revoked and confirmed dead. Unblocks T5.1 and T7.3.

**Vertex AI over a service account**, `orma-vertex@nryn-personal`, role
`aiplatform.user`, model `gemini-3.8-flash`. An AI Studio API key was tried
first and is unusable: it authenticates but every call reports depleted
prepayment credits, which `gcloud` cannot change even with GCP billing enabled.
That key was deleted. Deno cannot use application default credentials, so the
service account JSON is the credential. IAM took about thirty seconds to
propagate before the first 403 cleared.

### 2026-09-11 · CALL-E path proven

One real call, `call_tQA8nz1WGj9vfO30PxTosA`, 86 seconds, completed. Masked
payloads committed to `testdata/calle/`, which is most of what T1.4 needs.

**The route changed.** The OpenAPI contract has no Goal creation endpoint, so
Orma composes each call with `POST /v1/calls` rather than running a published
Goal. That keeps the prompt in the repository and lets the instruction change
every day, which a Goal's frozen task text would not. The trade is voice region
and locale, which now come from account defaults.

**Three risks retired.** Arrays of object items are accepted and extracted.
Transcript turns carry `speaker`, `offset_seconds` and `text`, and an extracted
`evidence_offset_seconds` matched the turn it pointed at. The default region
reaches an Indian number.

**The call itself was poor, and that produced a product change.** It opened cold
on the lead line to a caller who did not know who was speaking, over bad audio,
then went silent for ten seconds. It also skipped the walk and the exit, and
captured an unconfirmed word as an item. `product.md` §3 now has six steps rather
than five: landing is a step, in two beats, and nothing that matters is said
before a caller confirms they can hear.

### 2026-09-11 · P0 complete

**T0.1 Cloudflare front door.** `orma.nryn.dev` serves the SvelteKit app and
`orma-api.nryn.dev` proxies the whole Supabase API. Both deploy with
`npm run deploy` in `web/` and `proxy/`. Unblocks P5 and P6.

Three things cost time and are now written into the phase file. Cloudflare has
folded Pages into Workers, so the app ships as a Worker with a static asset
binding. Wrangler auto-loads a project `.env` and prefers a
`CLOUDFLARE_API_TOKEN` there over the OAuth login, which is why the zone token is
named `CF_DNS_API_TOKEN`. And `.assetsignore` must be regenerated by the build
script, because the asset directory is rebuilt every time.

**T0.2 Reaching the project.** Closed by routing around it rather than fixing it.
The network still resolves `*.supabase.co` to the wrong address. The front door
rewrites the Host header and passes every Supabase path through, so requests
resolve to Cloudflare and are fetched on Cloudflare's network. Verified by
reading a real row back through the proxy while the same request to the project
host still failed; the probe table was dropped afterwards.

**Use `ORMA_API_URL` everywhere, never the project host.** Every hostname stays
one level deep: `api.orma.nryn.dev` was tried first and failed its TLS handshake,
because the free certificate covers `nryn.dev` and `*.nryn.dev` and nothing
deeper.

### 2026-09-11 · Documents reconciled after P0

Closing P0 left task ids that P1 and P5 still required, and three documents still
described a Pages project. The call engine phase was the worst of it: T2.4 still
told an agent to post to the goal-run endpoint with scalar variables, and the
schema still carried `calle_goal_run_id` and `calle_run_spec`, which exist only
on that route. All corrected, and the dangling-reference and task-count checks
pass.

### 2026-09-11 · Secrets reachable from anywhere

Every value in `.env` now also lives on the repository, so a cloud agent, a
Codespace or a workflow can run without the local file. Configuration is in
GitHub **variables** and credentials are in **secrets**, split so a workflow can
print what it is doing without printing a key.

`scripts/bootstrap-env.sh` rebuilds `.env` from the environment and refuses,
naming the gaps, if anything is missing. Verified by a round trip against the
real file. `.github/workflows/_env-example.yml` is the canonical `env:` block and
is not a running workflow.

Three copies now exist: the local file, GitHub, and the Supabase function
secrets the deployed functions actually read. **Change one and you change all
three.** A secret value cannot be read back out of GitHub, so listing shows names
only.

### 2026-09-11 · CALL-E feedback opened

[`feedback.md`](feedback.md) now collects every piece of friction with CALL-E, and
the agent protocol makes writing it an obligation in the session it is hit rather
than a task at the end.

Seeded with nine entries from today. Two are worth leading the survey with:
webhooks carry no signature at all, only a de-duplication id, and no call
disposition is reported, which is what forced missed-call handling out of the
product. Four smaller ones cover Goals being uncreatable over the API, the calls
route having no locale control, the reference index printing navigation labels as
paths, and an under-specified result-schema boundary that cost a real call to
settle.

A tenth entry followed on Narayan's prompting, and it may be the most
commercially consequential of the set: numbers are purchasable in the United
States and Brazil only, so India-bound calls come from an uncontrolled line. The
only clean mitigation for a spam label is the callee saving the number, and that
needs a number that is yours and the same tomorrow. T5.4 is amended to say what
is true rather than invent one.

The last entry records what worked, because the survey rewards specifics in both
directions. The extraction grading its own call unprompted is the unusual one.

### 2026-09-11 · T1.1 and T1.4 complete

**T1.1 Core migrations.** The thirteen contract tables, constraints, indexes,
and `profiles.updated_at` trigger are frozen. An isolated database runner proves
the phone check and idempotency key reject invalid rows. It also proves the tick
uses `call_runs_state_scheduled_for_idx`. This unblocks T1.2 and T1.3.

**T1.4 CALL-E fixtures.** The masked completed, events, transcript, and failed
payloads now load through the typed fixture loader. The failed probe made one
accepted CallTask. It ended `call_failed` after no answer. The vocabulary lives
in `docs/calle-call.md`, and provider friction is recorded in `feedback.md`.
This unblocks T1.5.

### 2026-09-11 · T1.2, T1.3 and T1.5 complete

**T1.2 Row-level security.** Every contract table has RLS enabled. Independent
two-user probes found no cross-user read, update, or delete path. Anonymous
probes read zero rows from all thirteen tables. This unblocks T1.6 and P3.

**T1.3 Generated types.** Both consumers now share types generated from the
linked live schema. The check regenerates into a temporary file and fails before
overwriting either consumer when generation fails. This unblocks P4.

**T1.5 Result validation.** The calls result parser accepts only a complete,
valid object. It records a reason and returns null for every invalid result.
Retirements without evidence offsets are rejected. This unblocks T2.7.

### 2026-09-11 · T1.1a complete

**T1.1a Scheduler extension migration history.** The local history now carries
the exact remote versions for `pg_cron` and `pg_net`. Independent catalogue and
migration-list checks matched their versions and schemas. The approved RLS
migration then applied without repairing live history.

### 2026-09-11 · P1 complete

**T1.6 Local seed and reset.** An isolated reset creates a password-sign-in
profile with slots, four items, a completed run, transcript, mentions,
commitment, result and events. The seeded run uses `answered_extracted`, and its
stored result parses through T1.5. Independent review found zero residue after
the seed contract remediation.

**P1 closure.** The linked project has the core schema and RLS migration. Local
history matches its scheduler extensions. Generated types represent the live
schema. T2.1, T2.2, T2.3, T3.1, T4.1 and T5.1 now have their binding upstreams.

### 2026-09-11 · Spam flagging accepted as a risk

The originating line rotates. Every CALL-E call comes from a different number,
and they arrive flagged as likely spam on Android. Confirmed by observation, not
inferred.

That removes the save-the-contact mitigation rather than weakening it, so it has
been cut from T5.4 rather than softened. Onboarding now sets the expectation
instead: the call comes from a number you will not recognise, at the time you
chose, and your phone may warn you. Answer it anyway. A user who was told is far
more likely to answer than one who was surprised, and that is the only lever
left.

**Narayan accepted this as a risk.** It is not solved and will not be before
submission.

Two consequences. T8.5 cannot pre-save a contact for the demo, so the video
either starts after the call is answered or shows the warning and says the line.
Staging a saved contact is out, because it cannot happen for a real user. And
T8.2 collects the distinct numbers across the week, since a list of them is
better evidence for `feedback.md` issue 9 than our description of the problem.

Issue 9 also gained a hypothesis worth more than the complaint: rotation may be
causing the classification rather than failing to prevent it. A number that
places one call and is never seen again, from a pool, to a stranger, is close to
the signature these classifiers are built to catch, and reputation cannot accrue
to a line that is discarded after one use.

### 2026-09-12 · T3.3 complete

**T3.3 Voice capture.** `supabase/functions/telegram/voice.ts` acks first,
transcribes through Vertex Gemini, edits the ack with the transcript and Confirm,
and stores Opus under `item-audio` with `audio_url` via `ORMA_API_URL`.

Round 1 found H: after a successful insert, a throwing `editMessage` showed
`VOICE_FAIL_TEXT` while the item existed. Remediation separates insert success
from edit. On edit failure the helper sends a follow-up success message with
Confirm, or leaves the ack, and still returns `captured`. Round 2 APPROVE with
zero residue. Pins: `deno test --allow-read supabase/functions/telegram/voice.ts`
(29 passed).

Contract gaps remain for T3.1 (`captureVoiceNote` wiring and env), a T1.1
migration for `items.audio_url` plus bucket `item-audio`, and regenerated types.
Unblocks nothing new on the critical path. T3.4 receipts can start from T3.1.

### 2026-09-12 · T3.4 complete

**T3.4 Receipt delivery.** Shared `deliver-telegram.ts` sends post-call and
pattern receipts over Telegram with injected fetch. Disabled receipts skip with
no row. Round 1 APPROVE. Unblocks T7.3 and T7.4. P3 is now 5 / 5.

### 2026-09-12 · P3 e2e clean

**Live webhook wiring.** `telegram/index.ts` now calls `completeLink`,
`captureTextMessage`, and `captureVoiceNote`. Bare `/start` still uses
`START_LINK_PROMPT` from `link.ts`. `voice_ok:` answers so Confirm does not spin.

**Schema file on phase-3.** `20260912130243_telegram_link_audio.sql` matches
live: `telegram_link_tokens` with owner RLS, nullable `items.audio_url`, and
private bucket `item-audio`. Do not re-apply. Live already has this name.

**Types.** Both `database.types.ts` copies include `telegram_link_tokens` and
`items.audio_url`. Regenerated from the live project.

**Receipt.** Thin `receipt.ts` builds captured and retired texts and calls
`deliverPostCallTelegram`. T7.3 still owns `deliverPatternTelegram`. T7.4 still
owns a fuller post-ingestion receipt.

**Settings.** `web/src/lib/telegram-link.ts` and `web/src/routes/app/settings/+page.svelte`
mint and unlink through `ORMA_API_URL`. T5.3 session client is not landed, so
mint needs a signed-in JWT until that shell exists.

P3 e2e is clean for capture, link, and voice wiring. See
`adversarial-review/p3-e2e-round2.md`.

### 2026-09-12 · P1 closure review clean on merged main

P1 was re-reviewed after P3 merged. The review restored the local copy of the
Telegram audio and linking migration, regenerated both database type consumers,
and hardened `public.set_updated_at` with `search_path = ''`.

Round 4 APPROVE found zero C, H, M, or L findings. Linked migration history
matches through `20260912131612`. Fresh type generation passes, and both copies
include `graphql_public`. The security advisor no longer reports a mutable
function search path. It retains only the known `pg_net` advisory.

### 2026-09-12 · T2.1 complete

**T2.1 Materialise runs.** The nightly materialiser builds a visible 48-hour
window from active slots. It converts local slot times with DST handling and
uses durable idempotency keys. Deactivating a slot removes only its future
scheduled runs.

`materialise-runs` schedules at 00:10 UTC. It reads its named secret key from
Vault at execution. The function authorizes that key in its handler before any
database read. Six Deno checks passed. Round 3 APPROVE found zero findings.

The operator must add `ORMA_MATERIALISE_SECRET_KEY` to database Vault before
deploying the scheduler. The repository inventory and bootstrap now name it.
T2.3 can start.

### 2026-09-12 · T2.6 complete

**T2.6 Webhook receiver.** `calle-webhook` de-duplicates a CALL-E event in
`webhook_events`, claims it with one conditional `PATCH`, re-fetches the
authoritative call, and acts only on that re-fetch. The webhook body is a
notification and never a fact.

Five gates run in order. A non-POST gets 405, a missing path secret 401, a
missing `call-e-event-id` header 400, a body over 128 KiB 413, and a
non-terminal type 400. The claim moves both `type` and `received_at`, so a row
stranded in `refreshing` is reclaimed after a five minute lease. A failed
re-fetch releases the event to `pending` and returns 500, because a 200 would
lose the event for good.

A matched run gains a `webhook_received` row and a `refetched` row. The
`refetched` row carries the authoritative state taken from the re-fetch. No
body value may populate `state`. The only body values that reach a stored row
are the event id, the call id and the terminal type.

Sixteen in-file checks pass. Each of the five gates and both timeline writes has
a pin that fails when its code is reverted. Round 6 APPROVE found zero findings
at every severity, with a zero-residue claim against rounds 1 through 5.

The fixtures are three `*.documented.json` contract files and one
`*.recorded.json` file. The recorded one is a real provider delivery captured at
an independent sink, with its phone masked. The documented ones cover the two
terminal types never observed live. All four drive the same handler.

Deployed as `calle-webhook` version 2 with `verify_jwt` false. A live probe
against the deployed function returned 401 without the secret, 400 without the
header, 400 for a non-terminal type, 405 for a GET, and 200 for a byte-identical
replay of the recorded body. The replay inserted one event and the second send
re-fetched nothing.

**The live delivery to our endpoint is blocked on CALL-E.** CALL-E delivers a
terminal event to an independent public sink. It has never delivered a POST to
`orma-api.nryn.dev`, across a real call, a control call and a receiver that
logged every method and path before any gate. The endpoint is reachable from six
check-host nodes and accepts a replay, so the fault is not ours to fix. The
evidence is `dev-diary/feedback.md` issue 13 and
`dev-diary/adversarial-review/t2.6-contract-change.md`.

This does not block the task. Spec section 5 is re-fetch based, so a body is
never a fact. Polling in T2.5 reconciles any call that no webhook reports. The
matched path was proven in-file and by reviewer probes, not live, because the
live database holds no `call_runs` row yet.

T2.7 result ingestion can start. It depends on T2.6 for the `calle_call_id` link
and on the re-fetch, not on a live callback. T2.9 owns both timeline kinds this
receiver now produces.
