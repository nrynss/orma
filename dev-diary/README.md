# Development Diary: Phase Handoffs

This document outlines the work breakdown for **Orma**.

Reference specifications:
- [`product.md`](product.md): What Orma is, why it is a phone call, and the rules that cannot bend.
- [`spec.md`](spec.md): Stack, schema, state machines, and everything that gets built.
- [`feedback.md`](feedback.md): Every piece of CALL-E friction, written as it is hit. Feeds T8.7.

Where a phase document and specification conflict, the specification wins. Record discrepancies in the handoff log.

Each document provides complete context for an engineer starting cold.

**Current status:** P0, P1, P2, P3, P4, P5, P6 and P7 are complete. Schema, policies, types,
fixtures, validation and local seed data are frozen. Auth, the web
app and the front door are live.

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
| P2 | 12 / 12 | **Complete.** Every task and the e2e remediation landed, and the deployment carries the phase. `ORMA_MATERIALISE_SECRET_KEY` is in Vault. |
| P3 | 5 / 5 | **P3 e2e clean.** Capture, link, and voice are wired on the live webhook. |
| P4 | 4 / 4 | **Complete.** MCP live at `orma-api.nryn.dev/mcp`, six tools wired, docs published at `docs/mcp.md`. |
| P5 | 4 / 4 | **P5 e2e clean.** Auth, Telegram bridge, web sessions, and onboarding are live. |
| P6 | 8 / 8 | **P6 e2e clean and live.** History, Patterns, Timeline, landing and the fixed owner actions are deployed. Migration applied, types regenerated. |
| P7 | 6 / 6 | **Complete.** Facts, prose, email, Telegram, and the post-call receipt passed phase e2e round 2 with zero findings. |
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

### 2026-09-13 · P2 checkpoint: three tasks implemented, five landed

This entry closes the working phase, not the phase's work. Five of nine tasks
are landed. Three more are written, reviewed and not yet approved. One has not
started. The board says so, and this entry says why.

**T2.5 poll reconciliation, written, round 1 REMEDIATE.** `_shared/poll.ts`
holds `POLL_INTERVAL_MS`, `POLL_GIVE_UP_MS`, `terminalStateFor`, `fetchCall` and
`pollRun`, with thirteen in-file checks. `tick` gained `pollStep` and the
`calle-webhook` receiver gained `terminaliseFromRefetch`, which moves a matched
run on the re-fetched status and never on the body. The poll reaches a terminal
`state` and leaves `completed_at` null, because `terminalRuns()` selects
terminal runs with a null `completed_at` and hands them to finalisation.

Round 1 found C0 H1 M1 L1. The H is real and I reproduced it live on the
scratch stack. `tick/index.ts` fans out to an unavailable `finalise`, so the
first terminal run with a null `completed_at` turns every later tick into an
error. The throwing stub was unreachable before this task, because dispatch
always set `completed_at` on a terminal write. The live reproduction and the
full dry-run proof are in the same throwaway driver, and the driver's own output
names it.

The M is that the give-up deadline slides. `poll.ts` falls back to `poll_after`
when `dispatched_at` is null, and `reschedule` rewrites `poll_after` on every
pass, so the deadline never arrives. The L is that the receiver ignores
`terminaliseFromRefetch`'s win boolean and logs a `refetched` row carrying its
superseded state.

**T2.7 result ingestion, written, round 1 REMEDIATE.** `_shared/ingest.ts` plus
`supabase/migrations/20260912180000_ingest.sql` and its runner turn a terminal
run into rows in one transaction. `test-ingest.sh` passes all five cases and
eight in-file checks pass. The reviewer drove the real module against live
PostgREST and matched its returned counts to SQL row counts on the completed,
duplicate and invalid paths.

Round 1 found C0 H1 M1 L2. The H matters most. `parseStructuredResult` accepts
shapes the RPC rejects, and a rejected RPC rolls the whole transaction back to
zero rows. The run then keeps `state = 'awaiting_result'` with no disposition,
and the CALL-E payload is immutable, so every retry fails identically. The
module promises that an invalid extraction still writes a transcript and
`answered_no_result`, and for this class the promise is false. Remediation must
fix this in `ingest.ts`, never in `result.ts`, which is outside T2.7's ownership
and would reopen the gap on the next schema change.

**T2.8 dry-run mode, written and proven, review not started.** `ORMA_DRY_RUN`
defaults to true, so a missing setting means nobody gets called.
`dispatchClaimedRun` now builds the serialized body once and branches to
`executeDryRun` before the only outbound call it can make. The dry module holds
no CALL-E address, no key and no fetch, which is what makes it structurally
unable to dial.

The two recorded CALL-E payloads are embedded in `dispatch-mode.ts` rather than
read from `testdata/`. A deployed Edge Function bundles only its function
directory, so `fixtures.ts` works in tests and fails in production. An in-file
check re-reads both committed files and compares them to the embedded copies, so
they cannot drift apart silently.

A full dry run was driven through the real tick against live rows. Eighteen
checks pass. A scheduled run is claimed by the real RPC, reaches `completed`
with `billable` false and a synthetic `fixture:` call id, stores a 27 turn
transcript, a valid result, one item and one mention at offset 44. The timeline
reads `claimed, dispatched, ingested, finalised` in order. No request left for
any host but the stack. The recorded `request_body` is a complete rendered
CALL-E request. The byte-for-byte equality between the dry body and the live
body is pinned in `calle.ts`, where both paths run against the same stubs.

The driver is `/tmp/orma-p2/dry-run-e2e.ts` and it is a scratch file. Its
durable form is the in-file checks in `calle.ts`, `dispatch-mode.ts` and
`tick/index.ts`, which need no stack and no key.

The contract change is `dev-diary/adversarial-review/t2.8-contract-change.md`.
It records three moves: `dry_run` on the claimed-run shapes, embedded fixtures,
and the injected ingestion seam.

**T2.9 operator timeline is not started.** Its `requires` line names T2.3, which
landed, so nothing blocks it. One piece is already identified.
`materialise/index.ts` writes no `materialised` event, and the event belongs
immediately after `insertRuns` succeeds, near line 239. A materialise failure
should then record nothing, which is the pin that belongs with it.

### The scratch stack, and how to rebuild it

Corrected later on 2026-09-13. The first version of this section said `up.sh`
starts the whole harness. It does not.

This machine misresolves `*.supabase.co`, so every live probe goes through
`ORMA_API_URL`. The harness has three parts, and `bash /tmp/orma-p2/up.sh`
builds only the first.

1. `up.sh` wipes `/tmp/orma-p2/stack` and starts Postgres on 57022 plus the
   bundled PostgREST container. Nothing else.
2. A harness PostgREST on 57030 is started by hand. Mint an HS256 secret and a
   `service_role` JWT signed with it, and write the JWT into `env.sh`. Then run
   `public.ecr.aws/supabase/postgrest:v16.2` as container `orma-p2-rest` with
   host networking, `PGRST_SERVER_PORT=57030` and that secret.
3. A small proxy on 57031 strips `/rest/v1`, because PostgREST serves at the
   root while every shared module appends `/rest/v1`. Start it bounded, as
   `timeout 21600 deno run --allow-net /tmp/orma-p2/proxy.ts`.

Do not try to reuse the stack's bundled PostgREST. Its `PGRST_JWT_SECRET` holds
a JWKS document, so an HS256 token returns an error before any row is read.
Source `/tmp/orma-p2/env.sh` before any Deno driver.

Host port 57022 refuses psql from a shell even while the container reports
healthy. Read SQL with `docker exec supabase_db_stack psql -U postgres`.

The stack is shared, and that matters when several agents work at once. `tick`
claims, polls and finalises every due run in the database, not only yours.
Never drive `tick` while another agent's runs are due or pending. Scope every
count to rows you created. Never run `up.sh` while any agent is working.

Three traps cost time and are worth naming. Import `depsFromEnv` from the module
that owns it, because `calle.ts` and `tick/index.ts` both export one under that
name and the wrong import fails late and misleadingly.

The committed completed fixture produces one item and one mention, at offset 44.
T2.7 remediation round 1 measured that in SQL. The round 1 review's three
mentions, one retirement and one commitment came from a test payload. That
payload adds a retirement at offset 62 and a commitment at offset 80.

The third trap is the finaliser. `tick` still wires
`unavailable("finalisation")`, and T2.7a replaces it. Since T2.5 remediation
round 1 isolates each finalise call, a bare `tick` answers 200 with the stub in
place. It simply finalises nothing.

### Two CALL-E observations from this phase

`dev-diary/feedback.md` gained entries 14 and 15. Entry 14 records that a
`result_schema` cannot constrain a field's format, so a commitment's `due` is a
free string and every integrator parses it back into a timestamp. Entry 15
records that a call which never connected still reports
`task_completed: true` with a high `completion_confidence`, which reads as a
statement about the call and is not one.

The webhook delivery gap from T2.6 is unchanged and is still issue 13. A live
call, a control call and a logging receiver all failed to produce a POST. The
spec is re-fetch based, so no task depends on delivery. T2.5's poll reconciles
any call no webhook reports, and that is the design's answer to it.

### 2026-09-13 · P2 remediation under way, and a missing task

This entry supersedes the checkpoint's "What is left". Nothing new has landed
yet. The board now reads 5 of 10, because the phase gained a task.

**T2.7a, split from T2.7.** Nothing connected a terminal run to ingestion.
`tick` still wires `finalise` to `unavailable("finalisation")`, and
`ingestTerminalRun` has no production caller. A live call ended by the poll or
the webhook would therefore never become rows or gain `completed_at`. T2.7a
owns `_shared/finalise.ts` and `tick/index.ts`. Its block in
`PHASE-2-call-engine.md` holds the done condition.

**T2.5.** Remediation round 1 fixed all three round 1 findings. Round 2
returned REMEDIATE with C0 H1 M0 L2. The H mattered. Past the give-up window the
poll failed a run without re-fetching, so a call CALL-E had completed was stored
as `not_answered`. The first L was a redelivered webhook labelling its own write
`already_resolved`. The second L was a tick counting selected runs as
succeeded. Remediation round 2 fixed all three.

Round 3 returned REMEDIATE with C0 H0 M0 L3, and zero residue against rounds 1
and 2. The session stopped here by choice, so remediation round 3 has not
started. The three findings are in `t2.5-round3.md`.

1. A second webhook event for the same call records `applied`, although the
   first event wrote the run.
2. When the poll wins but its `polled` row fails or lags, a redelivery records
   `applied`. No row then names the poll. A plain race reproduced it live.
3. A `poll_timeout` written to `calle_failure` survives a later successful
   ingest. The fix sits in T2.7's migration. On the user's decision it moved to
   T2.7, recorded in both `t2.5-round3.md` and `t2.7-round2.md`.

Remediation round 3 took findings 1 and 2 and stopped without code. No truthful
fix fits T2.5's paths, because PostgREST gives no transaction across two writes.
It proposed a `call_runs.terminal_writer` column set in the same guarded update
as `state`. The user made that a new task, T2.5a, instead of widening T2.5.
With all three findings moved, a narrow round 4 review checked the transfers.
It found the code unchanged since round 3, and 99 in-file checks passing. Its one
L was T2.5's stale `owns` line, closed by the orchestrator under the
documentation exemption. T2.5 landed.

The round 2 remediator made one design choice for review to judge. Past the
window, a re-fetch that itself fails still gives up as `poll_timeout`, and the
failure message names the re-fetch error. Retrying forever would reopen the
unbounded window that round 1 closed. Round 3 judged this not a defect. The
T2.7a finaliser re-fetches and ingests later, which corrects state and
disposition once CALL-E recovers. One failed re-fetch on the first overdue pass
is enough to trigger it, not a long outage.

**T2.7.** Remediation round 1 fixed all four round 1 findings. `ingest.ts` now
routes every result the RPC would reject to `answered_no_result`, with the
transcript kept. It backfills a lost `ingested` event on retry, and its errors
carry the database's cause. `test-ingest.sh` shifts off busy ports.

Round 2 returned REMEDIATE with C0 H1 M3 L2. Residue against round 1 is not zero,
because round 1's H survives for U+0000 in a captured text. The session stopped
here by choice. The findings are in `t2.7-round2.md`.

1. H. One bad field discards the whole extraction. A free-text `due`, which the
   Goal schema invites, turns the call into `answered_no_result` and loses every
   captured item. Invalid fields need dropping one at a time, not wholesale.
2. M. Some inputs still fail every retry. `raw` carries its own copy of
   `structured_result`, so U+0000 there fails with `22P05`. A transcript turn
   with empty text throws too.
3. M. Two overlapping ingests write two `ingested` rows. The event belongs
   inside the database transaction.
4. M. Case five in `test-ingest.sh` passes with `for update` removed, so it does
   not prove the run lock.
5. L. Error scrubbing leaves five of six tested phone formats unmasked.
6. L. Case eight prints a mention count as `items=` and offsets as `mentions=`.

T2.5 round 3 finding 3 now belongs here, as a seventh finding. `ingest_call_result`
never clears a `poll_timeout` in `calle_failure`. The counts become C0 H1 M3 L3.

**Order from here.** Start with remediation round 3 for T2.5 and round 2 for
T2.7, each with a fresh agent. Before the next session, check that
`/tmp/orma-p2` still holds the drivers, then rebuild the harness as described
above. The container `orma-p2-rest` from this session should be removed first.
T2.5 and T2.7 run in parallel until both land. After that,
one task runs at a time, each landed before the next begins. The order is T2.8,
then T2.7a, then T2.5a, then T2.9 with the `materialised` event. T2.5a comes
before T2.9 because the timeline's `refetched` outcomes are only truthful after it. Several tasks' uncommitted
edits in one tree, `tick/index.ts` above all, are what made this phase hard to
read.

Nothing here is blocked on CALL-E. The only CALL-E dependent items in this
phase are T2.5's live timing proof and T2.6's live delivery. Neither gates
T2.7, T2.7a or T2.9.

### 2026-09-13 · T2.5a landed, terminal writer attribution

T2.5a is done. It adds a nullable `call_runs.terminal_writer` column and stamps
it in the same statement as every guarded pending-to-terminal write. The webhook
stamps `webhook:<event_id>`. The poll stamps `poll` on its terminal, give-up and
missing-call-id writes. A reschedule never stamps it.

The webhook no longer infers its own success. On a zero-match PATCH it reads the
stored value. It records `applied` only for its own tag, and `already_resolved`
for anything else, null included. `earlierAttemptApplied` and the `redelivered`
flag are gone, so no code infers a writer from a missing `polled` row.

Round 1 review: APPROVE, C0 H0 M0 L0 (`t2.5a-round1.md`). The reviewer drove the
real webhook handler and `pollRun` with a stub CALL-E transport, and read
`call_runs` and `call_events` in SQL. Pins F1a, F1b and F1c pass. It reverted six
implementation choices and every pin failed. Residue against `t2.5-round3.md`
findings 1 and 2 is zero.

The owner-read decision: `terminal_writer` stays readable by the run owner under
`call_runs_owner_read`. That policy is row-level, so carving out one column would
need column privileges that the next added column reopens silently. The value is
a CALL-E event id, which is a de-duplication key and not a credential. The record
is `t2.5a-contract-change.md`.

The poll's timeline row can still be missing when its insert fails. That is the
accepted design. The writer is on the run, so the webhook's redelivery stays
truthful without that row.

Both `database.types.ts` copies were regenerated from the scratch stack and stay
byte-identical. They also carry `p_skipped`, the new argument of
`ingest_call_result` from T2.7's remediation, which lands next.

### 2026-09-13 · T2.7 landed, result ingestion

T2.7 is done. `ingestTerminalRun` turns a terminal run into rows through
`public.ingest_call_result` in one transaction. It writes the transcript, the
result, the disposition, the mood, the captured items, the retirements and
commitments, and one `item_mentions` row per item named on the call.

Six rounds of review left the module far stronger. Rounds 1 and 2 found a parser
weaker than the RPC and a wholesale discard of an extraction with one bad field.
Round 3 found the transferred `poll_timeout` clear over-reaching into CALL-E's own
failure. Rounds 4, 5 and 6 found successively narrower holes in the masking helper
and in two acceptance cases. Every finding is fixed, and each fix has a revert
that fails its pin.

What the module does now. A bad entry costs only itself, so a free-text `due`
keeps its row with a null due and an unknown item id drops its entry. The reasons
travel as `p_skipped` and land in the run's `ingested` timeline row. Characters a
jsonb cast refuses are replaced before the request leaves. The `ingested` row is
written inside the RPC transaction, so a racing retry cannot duplicate it or lose
it. `calle_failure` is cleared only when it holds the poll's own `poll_timeout`,
so a failure CALL-E reported survives. The masker covers a 2,592 row corpus with
zero leaks, and its comment names what it over-matches.

The RPC gained a twelfth argument, `p_skipped jsonb default '[]'::jsonb`. The
default keeps every earlier caller working. `ingest.ts` posts no `call_events` row
at all, so its exports stay source-compatible for `calle.ts` and `dispatch-mode.ts`.

**One deviation from the loop, on the user's authority.** Round 6 returned
C0 H0 M0 L4. The orchestrator landed the task after remediation round 6 fixed all
four, with no round 7 review. The four were not load bearing on their own, their
fixes carry revert-based pins, and the orchestrator ran the acceptance itself:
`deno check` clean, 22 Deno tests green, `test-ingest.sh` green in 29.7 seconds.
The record is `t2.7-round6.md` and `t2.7-remediation-round6.md`.

**What T2.7a and T2.9 must know.** `tick` still wires `finalise` to
`unavailable("finalisation")`, so nothing calls `ingestTerminalRun` in production
yet. T2.7a replaces that stub, re-fetches each terminal run and hands the payload
to ingestion. T2.9 reads the `ingested` row for its counts, and the row carries
the state, the disposition, the call id, four counts and the repair list.

**Scratch stack note.** The shared stack's `ingest_call_result` was recreated by
hand, so its execute revokes had to be re-applied there. A fresh migration run
produces them. The stack now reads `anon=false`, `authenticated=false`,
`service_role=true`.

### 2026-09-13 · T2.8 landed, dry-run mode

T2.8 is done. `ORMA_DRY_RUN` defaults to true, and a run is dry when that setting
is unset or true or when `call_runs.dry_run` says so. The dispatcher assembles the
serialized body once and branches to `executeDryRun` before the only outbound call
it can reach. The dry module holds no CALL-E address, no key and no fetch.

The dry run writes the terminal `call_runs` row first, then `dispatched`, then
ingests, then records `finalised`. Ingestion owns `completed_at`. The dry terminal
write tags `terminal_writer = dry_run`, and both stamps come from the rehearsal
clock.

Three review rounds. Round 1 found the module unreferenced by the production path,
no ingestion, and the wrong ordering. Round 2 found a real leak: the recorded body
carried the webhook secret and the full number into a row the run owner can read.
The stored body is now a mask of the assembled body, and the byte for byte
equality between the dry and live bodies stays pinned where both are assembled.
Round 3 found two holes in the recovery, one where a failed `claimed` timeline
insert still stranded a run, and one where a call CALL-E had accepted could be
recorded as never made. Both are fixed. A placed call now ends in a state the poll
picks up, with its call id written.

`ORMA_DRY_RUN_FIXTURE` selects which recorded fixture a dry run synthesises. It
defaults to `completed` and refuses any other value. It is in `.env.example`, the
workflow example block and `scripts/bootstrap-env.sh`, and the GitHub repository
variable is set to `completed`.

**One deviation from the loop, on the user's authority.** The orchestrator landed
after remediation round 3 with no round 4 review. The two M findings carry
revert-based pins, and the orchestrator ran the acceptance itself: `deno check`
clean, 168 Deno tests green, the round 3 driver 56 of 56 against the shared stack,
and the stack back to its baseline rows.

**Contract changes**, each recorded in the task's remediation files. The `owns`
line widened to `tick/index.ts`, the terminal writer column comment and the three
settings files. The T2.8 block says a dry run writes the exact request body to
`call_events`, which conflicts with the masking rule in `AGENTS.md`, so the stored
body is masked and the discrepancy is recorded here.

**What T2.7a must know.** `tick` now isolates each claimed run through
`dispatchStep`, and `dispatchClaimedRun` recovers a stranded run itself. A recovery
that holds a call id hands the run to the poll.

### 2026-09-13 · T2.7a landed, the finaliser

T2.7a is done. `_shared/finalise.ts` gives ingestion a production caller. For each
terminal run with a null `completed_at`, the tick re-fetches the call with
`fetchCall`, hands the payload to `ingestTerminalRun` and records `finalised`.
Ingestion sets `completed_at`, which is what removes the run from the queue.

A run is bounded now. A failing re-fetch spends one of three attempts and waits
five minutes before the next, and the last attempt ends the run with a `finalised`
row that names the reason. A terminal run with no call id, which the poll writes
when it has nothing to poll, ends at once with `the run has no CALL-E call id to
re-fetch`. Two SQL functions carry that, `record_finalise_failure` and
`abandon_call_run`, both security definer and both revoked from `anon` and
`authenticated`.

The migration adds `call_runs.finalise_attempts`, `finalise_after` and
`finalise_error`. The terminal select skips a waiting run and tries an untried one
first, so twenty stuck runs cannot fill the batch.

Round 1 review found two M findings, one inherited from `t2.5-round3.md`. Both are
fixed, and each fix has a revert that fails its pin. The `finalised` row is now
appended with three attempts, because ingestion commits `completed_at` before that
row is written.

**Deviation from the loop, on the user's authority.** The orchestrator landed
after remediation round 1 with no round 2 review. The orchestrator ran the
acceptance itself: `deno check` clean, 125 Deno tests green, the pins driver 56 of
56 against the shared stack, and the stack back to its baseline rows.

**What T2.9 must know.** The timeline reads `polled, ingested, finalised` for a
poll-terminalised run, `webhook_received, refetched, ingested, finalised` for a
webhook one, and `claimed, dispatched, ingested, finalised` for a dry run. A run
abandoned for a spent retry budget carries `finalised` with `outcome: abandoned`
and its reason.

### 2026-09-13 · T2.9 landed, the operator timeline

T2.9 is done. Every transition writes one `call_events` row through
`recordCallEvent`: materialised, claimed, dispatched, polled, webhook_received,
refetched, ingested and finalised. Eight kinds, no new one, and the round 2
reviewer measured a production caller and real rows for each.

`materialise` now writes one `materialised` row per created run, with the slot and
the instant, and nothing when the insert fails. Its insert names
`on_conflict=idempotency_key` and asks for the representation, so a repeat
materialisation is ignored rather than raising 23505. The old 409 was a bug, and
the reviewer reverted it to prove the new shape is the guard.

Four paths in `calle.ts` that end a run without ingestion now record `finalised`
with a reason: a refusal, a 409, a rejected dispatch, and a recovery with no call
id. A path that hands the run to the poll records nothing, because that run's
story continues.

`recordCallEvent` retries an append three times with 250 ms between attempts, and
it still throws when the budget is spent. The finaliser's own retry loop is gone,
so one budget covers both, and the run row still records a lost append as
`finalise_error`.

Round 2 returned one M for the lost append and one L for a sentence in the note
that overstated a 409. Both are fixed. Two residuals stand, recorded in
`t2.9-contract-change.md`: a retry after a lost response can append a second row,
because `call_events` has no key that could refuse it, and a repeated kind is
legitimate, so a unique key on the pair would be wrong. The doc comment names it.

**Deviation from the loop.** The orchestrator landed after remediation round 2
with no round 3 review, on the user's authority, and ran the acceptance itself:
`deno check` clean, 113 Deno tests green, the driver 58 of 58, and the stack at
its baseline rows.

**The delivery reading.** The receipt is T3.4's `deliveries` row, keyed by
`call_run_id`, and not a ninth kind. Record 1 of the note carries the evidence.

### 2026-09-13 · P2 e2e remediation, and the phase on the deployment

The phase e2e review ran three rounds. Round 1 found seven, round 2 found two on
the disposition and the rehearsal, and round 3 found two more of the disposition
class on the two writers round 2 did not name. `T2.10` was split for the six code
findings and their follow-ons, and the orchestrator closed the deployment finding
itself. P2 now holds twelve tasks and all twelve are landed.

**What T2.10 changed.** `assemble_briefing` builds `last_call_summary` from the
previous run's own rows instead of CALL-E's sentence, so no number a provider
model wrote can reach a task. `ingest_call_result` writes `billable` in the same
statement as the disposition, billing `answered_extracted` and
`answered_no_result`, and never a rehearsal with a synthetic call id. Both type
files were regenerated and name the finaliser's columns and functions.
`assemble_briefing` revokes EXECUTE from `anon` and `authenticated` like its
siblings. CALL-E's `result_validation_failed` now becomes
`call_runs.state = no_result` with `answered_no_result`. The seeded timeline
carries a kind from the vocabulary. Every terminal path writes the state,
disposition and billing triple, so no run at rest carries a null disposition, and
a rehearsal can reach the `no_result` shape.

**The deployment.** `supabase db push` applied the seven P2 migrations, and
`materialise`, `tick` and `calle-webhook` are deployed. The front door answers
with all five RPCs present and `42501` for `anon`, the new columns on `call_runs`,
and both functions guarded by `secret:materialise`.

**What an operator still owes before P8 runs real calls.** Write
`ORMA_MATERIALISE_SECRET_KEY` into the deployed database's Vault. It holds a
secret API key named `materialise`. The cron jobs read it at execution time and
stay fail-closed while it is absent. That is deliberate, because arming a minute
schedule is a spending decision. `ORMA_DRY_RUN` is a function secret and stays
true.

**Deviation, on the user's authority.** The phase lands without a round 4 review.
The round 3 findings were two narrow writers in the class round 2 had already
opened, and their fix is measured with round 3's own instrument: terminal runs at
rest with a null disposition went from two to zero, and the corrected instrument
passes 59 of 59. The orchestrator also ran the acceptance: 283 Deno tests green,
`test-ingest.sh` green, and the fresh migration check green.

### 2026-09-13 · P2 on the deployment, after the forward migration

The first push carried `20260913130000_finalise_attempts.sql` before remediation
rounds 2 and 3 changed it. The CLI tracks an applied migration by version, so the
linked project kept the older `abandon_call_run`, the one with neither the
disposition nor the state. `20260913140000_abandon_writes_state.sql` carries the
current body, and a fresh database reaches the same body, md5
`1aa1124a4ea9a88dcfbbd6b60ddef630`.

The three functions were redeployed after those migration edits, so the deployment
bundles the landed code rather than the earlier revision.

Probed after the second push: `assemble_briefing`, `abandon_call_run`,
`record_finalise_failure`, `ingest_call_result` and `claim_due_call_runs` are all
present and answer `42501` for `anon`, and `tick`, `materialise` and
`calle-webhook` answer `401` with their own auth mode.

The operator step is unchanged. Write `ORMA_MATERIALISE_SECRET_KEY` into the
deployed database's Vault, holding a secret API key named `materialise`. The two
cron jobs stay fail-closed until it exists.

### 2026-09-13 · T4.2 and T4.2a landed, MCP is live

T4.2 closed on its round 2 APPROVE with zero residue. T4.2a carried the contract
change its reviewers raised: `index.ts` imports `registerOrmaTools`, passes the
authenticated user into `createOrmaMcpServer` and drops the stub loop. The two
T4.1 residuals closed in the same task. The proxy maps `/mcp` to
`/functions/v1/mcp`, so the published URL is `orma-api.nryn.dev/mcp`, and
`config.toml` turns the gateway JWT check off for the function. The handler
answers a missing or expired token itself, with a JSON-RPC 401 and code
`-32001`, so the gateway check being off opens nothing.

**A drift the rebase introduced.** Main had regenerated `database.types.ts` with
the call-engine finalise columns after T4.2 froze its fixture double, so the
tools suite no longer type-checked on phase-4. Four sanctioned lines in
`tools/double.ts` set `finalise_attempts 0`, `finalise_after null`,
`finalise_error null` and `terminal_writer poll`. The value `poll` is the
truthful writer for the fixture row, which is `dry_run false` and
`billable true`. Round 1 measured it against the migrations and the poll
writer.

Round 1 returned REMEDIATE with one L, diary only, and the orchestrator closed
it under the documentation shortcut. The T4.2a owns line and block text now name
the fixture reconciliation.

**Deployed and probed live.** The `mcp` function and the `orma-api` worker are
deployed. Through `orma-api.nryn.dev/mcp`: anonymous POST answers 401 with
code `-32001`, GET answers 405, an authenticated client initialises against
`serverInfo orma`, `tools/list` returns exactly the six names, and
`list_items` round-trips. The probe used a throwaway user, created and
deleted, and left no rows.

**What T4.3 must know.** The judge sends one header, `Authorization: Bearer`
plus a Supabase access token. No apikey header is involved on this surface.
The proxy maps `/mcp` and `/mcp/` and nothing deeper, so a client configures
the bare URL with no extra segments.

**One auth-key surprise.** GoTrue's admin endpoints reject the new-format
`SUPABASE_SECRET_KEY` with 401 through the front door. The legacy
`SUPABASE_SERVICE_ROLE_KEY` works. Any future probe or script that creates a
user should reach for the service role key first.

### 2026-09-13 · T4.3 landed, P4 complete

`docs/mcp.md` publishes the judge-facing configuration. The URL, the one-header
auth story, a pasteable client snippet, one worked example per tool with
response shapes measured live, and the two failure shapes. Every documented
shape is one the implementer or a reviewer reproduced against the deployed
endpoint. The snippet was run the way a clean client runs it, with only the
token inserted, and it connected.

Two review rounds. Round 1 returned one H and three M. The H claimed the web
app restore surface as shipped, the Ms covered a false sign-up claim, real
probe identifiers in a judge-facing file, and a dirty tree. Round 2 returned
zero residue on all five and one new M, a reword that made a restored item look
permanently hidden. The orchestrator closed that one under the documentation
shortcut. Both verdict files carry the full measurements.

**Two flags for the next agents.** First, an auth user alone cannot use the
write tools. Every table hangs off `public.profiles` and no trigger creates the
row, so T5 sign-up must create it. Provisioned accounts already carry one.
Second, Cloudflare answers error 1010 to the bare `Python-urllib` user agent on
`orma-api.nryn.dev`. curl, node, undici, python-requests and Go clients all
pass. If a judge scripts with urllib, the request dies at the edge. The WAF
rule deserves a look before P8.

**Probe hygiene.** Every probe account, item, slot and profile row was deleted
after use, and each deletion was verified by count and by a 404 read. Nothing
remains.

### 2026-09-13 · T5.1 landed, email auth live

T5.1 is done. Email magic link is on, with Resend as the sender through
Supabase custom SMTP speaking `smtp.resend.com`. The key and the sender address
are env references, so the repo file plus `.env` reproduces production, and
`supabase config diff` reads clean. The site URL and the redirect list pin to
`orma.nryn.dev`, proven live by following an admin-minted magic link to the
app. Signup is on for judges.

Round 1 returned one H, one M and two L. The H: thirty emails an hour is a
rolling-hour cap, and the review rounds alone tripped it, which would strand
judge sign-ins. It now reads ninety an hour, under Resend's hundred-a-day free
ceiling. The M: four live settings were undeclared, so a rebuild would have
flipped confirmation behaviour and OTP length. They are pinned now. Round 2
returned APPROVE with zero findings and zero residue.

The task prose said Resend's HTTP API, and the transport GoTrue actually
speaks is SMTP. The prose was corrected under the documentation shortcut.

**Accepted drift, recorded.** Six live settings sit outside every owns line:
`db.pooler.default_pool_size`, `db.pooler.max_client_conn`,
`storage.analytics.enabled`, `storage.analytics.max_namespaces`,
`storage.image_transformation.enabled` and `auth.sms.twilio.enabled`. A
rebuild from the repo cannot restore them. They predate this task. Giving them
an owner is a separate contract decision.

**Operator notes.** Run `supabase config push` with the `.env` values
exported, or the SMTP sender address shows a phantom diff from an unresolved
env reference. The admin API rejects the new-format `SUPABASE_SECRET_KEY`, so
scripts should use `SUPABASE_SERVICE_ROLE_KEY`. The email rate limiter rolls
by the hour, not by the clock. Review rounds added about forty emails to one
rolling hour, all addressed to undeliverable probe inboxes, and every probe
user was deleted and verified gone.

### 2026-09-13 · T5.2 landed, Telegram login bridge

T5.2 is done. `auth-telegram` verifies the Login Widget HMAC, refuses a stale
payload, and mints a session through `generateLink` then `verifyOtp`. Nothing
is signed in the database. Gateway JWT is off for this function only. A
flipped hash still returns 401.

Telegram-first users get `tg-{id}@telegram.invalid`. An email session plus a
valid widget attaches to that email user. A later widget POST with no bearer
returns the same user id, and the same items.

Round 1 returned APPROVE with zero findings. Live pins used
`orma-api.nryn.dev/functions/v1/auth-telegram`. CORS origin is
`https://orma.nryn.dev`. Eleven in-file checks pass.

**What T5.3 must know.** The login page POSTs the widget JSON to that URL.
It then calls `setSession` with the returned tokens. The function checks HMAC,
not an API key.

Probe users were deleted. `auth.users` read back empty after the review.

### 2026-09-13 · T5.3 round 1, mint helper blocked

T5.3 round 1 returned REMEDIATE, C1. Settings calls `mintLinkToken` as
required. That helper sends the user JWT as `apikey`. Live PostgREST through
the front door returns 401 Invalid API key, so no `telegram_link_tokens` row
is inserted. Anon `apikey` plus user Bearer returns 201 and count 1.

The helper lives in `web/src/lib/telegram-link.ts`, outside the original owns
line. The operator confirmed a contract change is valid when the task needs
it. T5.3 now owns that file for the header fix. Remediation round 1 follows.

### 2026-09-14 · T5.3 landed, web sessions live

T5.3 is done. The Worker at `orma.nryn.dev` has a Supabase client pointed at
`orma-api.nryn.dev`, cookie sessions, login with email magic link and the
Telegram widget, and Settings mint from `getSession()`. A signed-out visit to
`/app/settings` redirects to `/login`. A signed-in reload keeps the cookie.

Round 1 found C1: `telegram-link.ts` sent the user JWT as `apikey`, so mint
returned 401 and inserted zero rows. The helper now requires the publishable
anon key as `apikey` and the user JWT as Bearer. Round 2 returned APPROVE with
zero residue. Live mint inserted one `telegram_link_tokens` row. The JWT-as
`apikey` control still 401s.

Contract change also covers `web/scripts/` (PUBLIC_ env mapping and the secret
key scan) and `+layout.server.ts`. The operator confirmed those rows.

**What T5.4 must know.** An auth user has no `public.profiles` row until
onboarding writes one. `telegram_link_tokens.user_id` references profiles, so
mint fails before that row exists. Login currently sends a signed-in user to
`/app/settings`. New accounts should go to onboarding first.

The landing footer still says sign-ups are closed. T5.3 does not own
`+page.svelte`.

### 2026-09-14 · T5.4 landed, P5 complete

T5.4 is done. Onboarding writes a dispatchable profile in one pass: name,
E.164 phone, `outbound_calls` consent as a row with the wording shown,
timezone, and a first slot. Skip consent still writes the profile and slot,
and inserts no consent row, so the dispatcher refuses.

The number is self-declared. The screen says the first call confirms it.
Submit still sets `phone_confirmed_at`, because the dispatcher will not place
that first call without it. The spam-number expectation is on the last step.
There is no number to save.

A signed-in account with no profile is gated onto `/app/onboarding` from
`/login`, `/app`, and Settings. A completed profile is not bounced back.
Signed-out `/app` still goes to `/login`.

Round 1 returned APPROVE with zero findings. Live agree path inserted
profile, consent, and slot. Live skip path had zero `outbound_calls` rows.
Malformed `+012345678` returned 400 `23514`. Probe rows were deleted.

**What P6 must know.** `/app` still 404s for a completed profile. T6.1 owns
that index. Settings still has no consent UI, so a skip user cannot agree
later until T6.5. The landing footer still says sign-ups are closed. No P5
task owns `web/src/routes/+page.svelte`.

P6 can start. It required T5.3, which landed earlier today.

### 2026-09-14 · P5 e2e clean

Phase e2e round 1 returned REMEDIATE, C1 H1. Per-task APPROVE verdicts stood.
The integrated product failed on the live Telegram login path.

F1: `/login` sent the publishable key as `Authorization: Bearer`. The handler
treated every bearer as a user session, GoTrue returned 403, and the function
answered 401. Continue with Telegram never minted a JWT. Login now posts the
widget with no Authorization. A non-user bearer is treated as missing.

F2: a signed-in user never saw the widget, so email then Telegram minted a
second `tg-…@telegram.invalid` account. Settings now hosts the Login Widget
and posts the user JWT. A later no-bearer widget returns the same id.

Round 2 returned APPROVE with zero residue. Live anon-key Bearer still 200s.
A flipped hash still 401s. Email plus Settings attach plus a later widget
login is one user and one items row.

**Still leftover for P6.** `/app` 404s. Settings has no consent UI. The
landing footer still says sign-ups are closed. Sign in is in the shell nav.

### 2026-09-14 · P7 complete, analysis and receipts

P7 landed six tasks instead of four. T7.2a and T7.5 were authorized during the phase.
T7.2a extracted the Vertex service-account and URL path into `_shared/vertex.ts`, so
voice and analysis share one credential mechanism. T7.5 wired the T7.4 receipt into
`finaliseRun`, closing the production gap every earlier review had recorded.

T7.1 computes every report number in `compute_pattern_facts`. Its harness pins the
profile-timezone conversion, the exact three-day boundary, the top-five cap, window
edges, canceled and null-slot handling, and a clean scratch stack. Round 1 proved three
of those pins were too weak, and remediation added boundary fixtures plus cleanup guards.

T7.2 validates every numeric token in generated prose against the facts. A digit inside
item text is accepted only when the full source text is quoted. This blocks a fabricated
count from riding in on unrelated text. Identical facts produce identical requests at
temperature zero.

T7.3 derives the report window in each profile timezone, skips insufficient history,
stores `pattern_reports` before delivery, and sends the same prose through Telegram and
Resend. The account email comes from the Auth admin endpoint, because `profiles` has no
email column. Each toggle prevents only its own row and send. One broken profile does
not block the next.

T7.5 sends one receipt after a successful non-replay finalise. A receipt failure never
un-finalises the run. If captured or resolved item text trips the no-CTA guard, the
wrapper sends one honest generic receipt and writes no duplicate row.

Review path: every task reached APPROVE with zero residue. The phase e2e round 1 found
one H, the missing receipt caller. T7.5 closed it. Phase e2e round 2 returned APPROVE
with zero findings.

**Next agent notes.** The analysis cron is named `analysis-report` and reuses the
`ORMA_MATERIALISE_SECRET_KEY` Vault value. It stays fail-closed until that key exists.
The migration is not deployed yet. Do not add an email column to `profiles`, and do not
create a second Vertex client. `TELEGRAM_BOT_TOKEN` is now required by the tick env
factory as well as the Telegram function.

### 2026-09-14 · P7 on the deployment, schedulers live

The facts and analysis migrations are applied, and `analysis`, `tick` and `telegram`
are redeployed. The operator wrote `ORMA_MATERIALISE_SECRET_KEY` into Vault at 02:51Z.
`tick-runs` returned 200 from the next minute. A manual materialise found zero slots in
production, so nothing was missed.

pg_net moved from `public` to `extensions` in `20260914030000_move_pg_net_to_extensions`,
clearing the security advisor. The cron jobs name `net.http_post` as text and survived.
`anon` and `authenticated` still hold execute on it through Supabase's own event trigger.

### 2026-09-14 · T6.1 landed, Today and the app shell

T6.1 is done. `/app` is Today, client rendered under RLS. It shows the next call in the
profile's timezone, the last call summary, and open items with counts and ages from rows.
It has first-run, live, blocked and error states.

The claim added three tasks' worth of scaffolding to T6.1, recorded in
`adversarial-review/t6.1-contract-change.md`. The app navigation lives in
`app/+layout.svelte`. Shared tokens and components live in `web/src/lib/ui/`. Login and
onboarding now land a finished profile on `/app`. T6.7 and T6.8 were added at the claim.

Round 1 returned REMEDIATE, H1 M3 L1. Retired read any later retirement as a call
retirement. Today promised calls the dispatcher refuses. Six mutants passed the check.
Settings called production from the harness. The live list ignored briefing order.

Remediation tied Retired to the run's result and mention, mirrored the dispatcher's four
refusals, pinned all six mutants, and read the API URL through `getOrmaApiUrl()`. Round 2
returned APPROVE with zero findings and zero residue, including a local `wrangler dev` run.

**What the next P6 agent must know.** Run `scripts/p6-local-stack.sh up` for a local stack
on ports 58320 to 58329. The seed, `firstrun@` and `live@` accounts use the local dev
password. Magic links do not work locally, so sign in from the console per
`t6.1-handoff.md`. Run `down` when finished.

Import tokens from `$lib/ui` rather than copying styles. `call_runs` stays read-only to
its owner, so cancel waits for T6.7. The web app is not yet deployed with T6.1. The landing
footer still says sign-ups are closed, which T6.8 owns.

### 2026-09-14 · T6.2 landed, Items

Items shows open and retired rows, each with SQL-derived mention counts and ages. Users can
retire, restore, and set a since date through their own RLS-protected rows. Round 1 found
retired cards omitted their mention count. Remediation restored the shared row-derived metadata.
Round 2 approved with zero findings and zero residue.

### 2026-09-14 · T6.7 landed, owner actions

`cancel_call_run` locks and changes only the caller's scheduled row. It records one canceled
event and leaves claimed runs untouched. `delete_my_account` removes caller-owned item audio
before removing the Auth user. Local acceptance proved cross-user isolation, scheduler safety,
cascades, storage cleanup, and denied anonymous access. Round 1 approved with zero findings.

### 2026-09-14 · T6.5 landed, Settings and cancellation

Settings now manages profile preferences, consent, slots, pause and resume, receipt channels,
Telegram linking, call cancellation, and account deletion. Cancellation and deletion use T6.7
RPCs rather than direct writes. Local validation preserved the existing Telegram flow and placed
no live calls. Luna's round 1 approved with zero findings.

### 2026-09-14 · T6.6 landed, operator timeline

Timeline shows the owner's `call_events` in order with expandable detail payloads. Steps sort by
time then id, clocks render in the profile timezone, and every loader query is owner scoped.
A failed run names its last event, live runs carry a manual refresh with no timers, and phone
shapes are masked before display. Round 1 approved with zero findings.

### 2026-09-14 · T6.8 landed, landing page

The root page stays server rendered with the thesis, the beat, and the two sections intact. The
closed sign-ups line is gone and three links carry the way into `/login`. One synthetic call
demo plays through the visitor browser speech engine, labelled as synthetic with no real person
and no production evidence. No audio asset was added. Round 1 approved with zero findings.

### 2026-09-14 · T6.3 landed, History

History lists the owner's calls newest first with summary tags, disposition, mood and full
transcripts. Per-run counts reuse the Today summary helper so both pages agree. Evidence
offsets link into the transcript moment, runs without results still show their transcripts,
and the `run` and `t` query params carry Today deep links. Round 1 found an unfetched items
select. Remediation removed it. Round 2 approved with zero findings and zero residue.

### 2026-09-14 · T6.4 landed, Patterns

Patterns renders the latest report with its prose and every facts field beside it, plus a mood
trend drawn from the period call rows and an honest not-yet state for thin history. The
harness gained a fixture report and three mood runs for the seed account. Round 1 found the
fixture edit had dropped the live-run briefing update. Remediation restored it byte identical.
Round 2 approved with zero findings and zero residue.

### 2026-09-14 · P6 complete, web app

All eight tasks landed through the four-role loop. T6.6 and T6.8 approved in round 1 with
zero findings. T6.3 and T6.4 remediated one finding each and approved in round 2 with zero
residue. The web app is still undeployed, same as after T6.1, and commits stay unpushed.
P8 is unblocked on the web side.

### 2026-09-14 · P6 e2e clean, with three documentation findings closed directly

Phase e2e round 1 traced all ten seams with its own runs and left every per-task verdict
standing. It returned REMEDIATE with three L findings, all overlong sentences in task
handoffs. Each lived in documentation, touched no code path, and needed reading only,
so the orchestrator closed all three in the landing commit with no remediation round.
P6 is e2e clean.

### 2026-09-14 · P6 goes live, T6.7 fixed in production, docs corrected

Production rejected direct deletes on `storage.objects` through its
`protect_objects_delete` trigger, which the fixture stack lacked. Every account
deletion failed, including with no files present. T6.7 reopened. The fix sets the
session switch the trigger itself checks, scoped to the deletion transaction, and
a new migration block mirrors the safeguard locally so the harness tests the real
guard. Round 2 approved with zero findings and a push GO. The owner actions
migration is now the only file pushed, both RPCs exist in production, and the
generated types match production again, including the P7 facts function.

The web app is deployed. The landing page no longer carries the closed sign-ups
line. Earlier P6 entries saying undeployed and unpushed are out of date. The push
covering them already landed.

The user authorized the synthetic demo scope, so spec section 11 now names the
labelled browser demo and no real recording is owed. The P2 Vault debt is paid.
`ORMA_MATERIALISE_SECRET_KEY` sits in Vault.

Two production signup attempts for a deletion drill never confirmed, because the
confirmation mail errored. They may sit as unreachable unconfirmed users. Remove
them from the dashboard with `delete from auth.users where email like
'p6deletetest%'`. The drill stays open until someone runs it with a confirmed
account.
