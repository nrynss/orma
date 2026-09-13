# P2 e2e round 1 review

## Verdict

**REMEDIATE**

Phase P2 is a working call engine in the repository and a stopped one in the
deployment. The integrated path is correct when I drive it against a fresh
database and a stub CALL-E transport. The deployed project has none of the
phase's migrations, so no run can be claimed, dispatched or finalised there.

Every per-task verdict stands. This review reopens no task seam that its own
review closed. It records what the phase looks like as one product.

| C | H | M | L |
| --- | --- | --- | --- |
| 1 | 1 | 2 | 3 |

## Findings

| Sev | Where | What | Pin | Mutation |
| --- | --- | --- | --- | --- |
| C | `supabase/migrations/20260912{150000,160000,161000,170000,180000}*.sql` and `supabase/migrations/20260913{120000,130000}*.sql` against the deployed project | All seven P2 migrations exist in the repository and apply cleanly to a fresh database. The deployed project has none of them. The deployed tick therefore cannot claim, dispatch or terminalise, and no `pg_cron` job exists. The phase goal is unreachable in production. | `curl -H "apikey: $anon" https://orma-api.nryn.dev/rest/v1/rpc/assemble_briefing` answered 404 `PGRST202`, so the RPC is absent. `select=terminal_writer`, `select=finalise_attempts`, `select=finalise_after` and `select=finalise_error` each answered 400 `42703` with "column call_runs.<name> does not exist". `select=dry_run` and `select=briefing` answered 200, and `telegram_link_tokens` and `items.audio_url` answered 200, so the project carries P1 and P3 and not P2. | Leave the migrations unapplied and the first P8 call is never placed. No scheduler exists, so nothing materialises a run either. |
| H | `supabase/migrations/20260912160000_briefing.sql:69-77` and `:91`, with `supabase/functions/_shared/briefing.ts:143-148` | `last_call_summary` is `transcripts.raw ->> 'summary'`. That field is the sentence CALL-E's own model wrote about the previous call. `renderCallTask` substitutes it verbatim into step 4 of the next call's task, and `call_events` records the substitution. A number inside that sentence reaches the phone with no SQL row behind it. | Driver PHASE 6b. I wrote a provider-style summary into the profile's transcripts, read `assemble_briefing`, and rendered the task. The rendered task carried "You mentioned the dentist 7 times and it has been 99 days" while `item_mentions` held three rows for that item. The provider's own summaries carry numbers in the committed fixtures too. `testdata/calle/webhook-call-failed.recorded.json` holds a call object at `body.data` with a summary that names a retry in "about 45 minutes". | Any source that still reads the provider's prose keeps a model number on the call. The counter-rule in the task template forbids only a number that was not given above, and this one is given above. |
| M | `supabase/migrations/20260911000000_core_schema.sql:64` against every writer under `supabase/functions/` | `call_runs.billable` is never set true. The dispatcher, the poll, the webhook, the dry path and the ingestion RPC all leave it false. `spec.md` §3 gives the column a per-disposition value and marks `answered_extracted` as billed. | The completed pipeline run reads `billable=false` after ingestion. `grep -rn billable` finds one writer in `core_schema.sql`, two in `dispatch-mode.ts` that write false, and none that writes true. | Revert nobody's fix, because nobody wrote one, and an operator cannot tell a billed call from a free one. The call cost real money and the row says otherwise. |
| M | `supabase/functions/_shared/database.types.ts` and `web/src/lib/database.types.ts` | Both copies carry `terminal_writer` and `assemble_briefing` and miss the rest of the phase's schema. Neither names `finalise_attempts`, `finalise_after`, `finalise_error`, `record_finalise_failure` or `abandon_call_run`. A fresh database has all five. | `grep -c` returns 0 for each of the five names in both copies and 4 for `terminal_writer`. The two copies are byte identical. `bash /tmp/p2e2e/fresh-migrations.sh` printed all three columns and both functions. | P4 and P6 type against a schema that does not carry what the finaliser reads and writes. Regenerate when the migration reaches the linked project. |
| L | `supabase/migrations/20260912160000_briefing.sql:98-99` | The revoke names `public` only. Anon and authenticated keep their own EXECUTE grant, so `assemble_briefing` is callable by any role. Its three siblings each revoke from anon and authenticated as well. | `pg_proc.proacl` on the fresh database and on the shared stack reads `assemble_briefing \| postgres=X,anon=X,authenticated=X,service_role=X` while `claim_due_call_runs`, `ingest_call_result`, `record_finalise_failure` and `abandon_call_run` read `postgres=X,service_role=X`. An anon probe and an authenticated probe each returned NULL. | Row level security is the only thing protecting the read. Disable RLS on one table or widen one policy and an unauthenticated caller reads any user's briefing. |
| L | `dev-diary/spec.md` §3 against `supabase/functions/tick/index.ts:225` | The spec's state machine names `no_result` as a terminal state. No writer produces it. The disposition `answered_no_result` is what the code writes instead, and the run's state stays `completed`. | `grep -rn no_result` finds the token once, in the terminal select. The poll's status map, the dry-run terminal union and the ingestion RPC's state check all omit it. | A reader that branches on the state never sees it. The information is not lost, only the name. |
| L | `supabase/seed.sql:132-135` | The seeded timeline carries a `call_events` row of kind `completed`. That kind is not one of the eight `CALL_EVENT_KINDS` the phase defines. | Read the seed beside `CALL_EVENT_KINDS` in `_shared/events.ts`. The other seeded row uses `dispatched`, which is in the vocabulary. | Whoever renders the timeline hits an unknown kind on the seeded run, and that run is the one the demo shows. T2.9 judged this a false positive against its own seam, because it does not own the seed. The phase view keeps it open for whoever owns `seed.sql`. |

## What I measured, and how

Every claim below came from a real handler, real SQL, or a real HTTP request. No
module's own summary is treated as evidence.

The harness is the shared stack. Postgres is `127.0.0.1:57022` in container
`supabase_db_stack`, PostgREST is `127.0.0.1:57030`, and the proxy is
`127.0.0.1:57031`. `CALLE_API_BASE` points at a stub host, so every CALL-E
request is intercepted by a recording fetch. No call was placed.

Scratch files, all disposable:

* `/tmp/p2e2e/seed.sql` and `/tmp/p2e2e/cleanup.sql`
* `/tmp/p2e2e/driver.ts`, the end to end driver, 100 checks
* `/tmp/p2e2e/fresh-migrations.sh`, the fresh database runner
* `/tmp/p2e2e/evidence.txt`, the full driver output

Commands:

```
docker exec -i supabase_db_stack psql -U postgres -v ON_ERROR_STOP=1 -q < /tmp/p2e2e/seed.sql
source /tmp/orma-p2/env.sh && deno run --allow-all /tmp/p2e2e/driver.ts
bash /tmp/p2e2e/fresh-migrations.sh
deno test --allow-read supabase/functions/calle-webhook/index.ts
docker exec -i supabase_db_stack psql -U postgres -v ON_ERROR_STOP=1 -q < /tmp/p2e2e/cleanup.sql
```

The driver result is `100 passed, 0 failed`. The receiver test result is
`34 passed | 0 failed`.

### 1. The integrated pipeline

One `materialise` call over a profile in `Asia/Kolkata` with three due slots
created six runs, and a second call created no duplicate. The materialised key
equalled `idempotencyKey(...)` and the wall clock matched the slot.

Tick 1 claimed three runs and placed two calls, so the run forced dry by its own
`dry_run` flag dialled nobody. Tick 2, at clock plus sixty one seconds, polled
two and finalised two. Ordered timelines, read from `call_events` in `id` order:

```
completed run   materialised,claimed,dispatched,polled,ingested,finalised
failed run      materialised,claimed,dispatched,polled,ingested,finalised
dry run         materialised,claimed,dispatched,ingested,finalised
```

Rows the completed run produced: one transcript, one result, one captured item
and one mention. The failed run produced one transcript, one result, zero
mentions and the disposition `not_answered`. The `ingested` row carries
`item_count`, `mention_count`, `retirement_count` and `commitment_count`, and the
`finalised` row repeats them with `failure_reason` `call_failed` on the failed
run. The poll stamped `terminal_writer = poll` on both.

The request order tick 1 produced proves the briefing precedes the call. The
stack saw `rpc/assemble_briefing`, then the `call_runs` PATCH carrying
`briefing`, then `POST /v1/calls`.

Dry mode ran twice. Once as a per-run override beside two live dispatches, and
once with `ORMA_DRY_RUN` unset, which is the default under review. With it unset
the tick claimed the run, placed no call, and reached `completed` with a
synthetic `fixture:` call id and `billable` false. The `dispatched` row carries
`outbound_request_made: false` and `request_body_masked: true`.

The webhook path ran through the real receiver. A delivery moved the run to
`completed` and stamped `terminal_writer = webhook:evt_p2e2e_one`. The finaliser
then reached `completed_at` through its own re-fetch, and the timeline read
`claimed,dispatched,webhook_received,refetched,ingested,finalised`.

### 2. Exactly once

Two overlapping ticks ran under `Promise.all` over one due run. Their results
were `{"claimed":1,...}` and `{"claimed":0,...}`, and exactly one request reached
`POST /v1/calls`. A third tick claimed nothing and dialled nothing. The claim RPC
returned zero rows for the run it had already moved.

A retried request carries the run's own stored key. The header on the wire was
`p2e2e:E:round1:v1`, which is the value on the row. The materialised key shape is
`orma:{user}:{local_date}:{part_of_day}:v1`.

A 409 from CALL-E ended the run as `failed` with
`calle_failure.failure_code = idempotency_conflict`, a `completed_at`, no call
id, and a `finalised` row naming the conflict. It was posted once, never retried
with a fresh key, and the rejected dispatch was not counted as a landed claim.
The stub returned that 409 on the first request only.

The webhook and the poll each name themselves. The poll path stamped `poll`, and
the webhook path stamped `webhook:<event id>`. A redelivered event was
acknowledged and wrote nothing new. A hand-edited envelope claiming success over
a re-fetch that reported failure left the run `failed`, and the run id the body
named was untouched.

### 3. No number the model produced

Every number on the call comes from SQL. `assemble_briefing` read three
`item_mentions` rows and a `since_date` 34 days old and returned
`You've mentioned the dentist 3 times. It's been 34 days.` verbatim. I added a
fourth mention row and the same function returned `4 times`, then removed it and
the line returned to `3 times`. `open_count` is stored on the run and never
templated.

The engine stores the briefing on the run before dispatch, which the request
order shows, and `open_items`, `lead_line` and `last_call_summary` are the only
substitutions the template accepts.

No path lets extraction write a count or a slot. `slot_change_requested` is
returned to the caller and never written. `grep -c slots
supabase/migrations/20260912180000_ingest.sql` returns 0, and the user's slot
count stayed at three across four ingestions.

The briefing's own assembly holds one value a model can influence, and finding 2
is that value. `last_call_summary` is the provider model's own sentence.
Captured item text is model prose as well. It flows back into `open_items` and
into the lead sentence, so a number inside it would speak with a SQL count
beside it.

### 4. The approval and consent gate

The gate is reachable in production, not only in a test double. I drove the real
`createAuthenticatedTickHandler(depsFromEnv(...))` over the proxy. A POST with no
credential answered 401 before any database read. A POST with the named secret
answered 200 with `{"claimed":2,...}` and wrote both refusals to SQL.

A profile with a confirmed number and no `outbound_calls` row ended `canceled`
with `disposition = canceled`, a `completed_at`, and
`{"failure_code":"dispatch_refused","failure_message":"profile has no live outbound_calls consent"}`.
A profile with a live consent and no confirmed number ended `canceled` with
`"profile has no confirmed E.164 number"`. Both timelines read `claimed,finalised`
with `outcome: "refused"` and the reason. Neither attempt reached CALL-E.

### 5. Migration and schedule truth

`bash /tmp/p2e2e/fresh-migrations.sh` created a throwaway Supabase project,
copied the thirteen migration files, and started Postgres only. `supabase start`
exited 0, so every migration applied in filename order.
`supabase_migrations.schema_migrations` listed all thirteen in that order,
ending `20260913130000 finalise_attempts`.

The fresh database and the hand-mutated shared stack are identical where it
matters:

* 109 `public` columns each, and `diff` reported no difference.
* `md5(prosrc)` matched for all six functions, including
  `ingest_call_result = 0da41b9f0cf40c3e728c879298ff88f8`.
* The execute grants matched for all five P2 functions, including the
  `assemble_briefing` grant in finding 5.
* `cron.job` held `materialise-runs` at `10 0 * * *` and `tick-runs` at
  `* * * * *` on both.

The two `pg_cron` entries post to `https://orma-api.nryn.dev/functions/v1/materialise`
and `.../v1/tick`. The repository carries `supabase/functions/materialise/` and
`supabase/functions/tick/`, and `supabase/config.toml` declares
`[functions.materialise]`, `[functions.tick]` and `[functions.calle-webhook]`,
each with `verify_jwt = false`. So each entry names a function the deployment
has.

The shared stack's `vault.decrypted_secrets` is empty. Both cron jobs therefore
emit nothing there, because each guards on a non-empty
`ORMA_MATERIALISE_SECRET_KEY`. That is the designed fail-closed behaviour and it
means the scratch stack's schedule is inert until an operator writes the secret.

`supabase/config.toml`, `.env.example`,
`.github/workflows/_env-example.yml` and `scripts/bootstrap-env.sh` all name
every variable the P2 functions read. `.env.example` sets `ORMA_DRY_RUN=true`
and `ORMA_DRY_RUN_FIXTURE=completed`. The local `.env` also carries
`ORMA_DRY_RUN=true`, so this machine does not spend by accident.

### 6. The retirement path

The demo's closing beat is a retirement, so I drove `ingestTerminalRun` with a
retirement at offset 62. The item ended `retired` with a `retired_at` and the
reason `retired on the call`, one mention row landed at offset 62, and that
offset matched a real transcript turn. The next `assemble_briefing` stopped
leading with the item and `open_count` fell by one.

A retirement with no evidence offset was refused. The whole extraction came back
null, the run read `answered_no_result`, `results.error` named
`structured_result.retired_items[0].evidence_offset_seconds is required`, and the
item stayed open.

A retirement naming another user's item changed nothing. The entry was dropped
and the `ingested` row carries
`["structured_result.retired_items[0].item_id does not name an item this user owns"]`.

Re-ingesting the same run returned `already_ingested` with zero counts, left one
mention row, and added no second `ingested` row.

### 7. The dry body against the live body

The dispatcher assembled both bodies from the same code path. The live request
body and the dry request body were identical strings, 4724 characters each. The
recorded copy in `call_events` was 4695 characters and differed only by the mask.
It carried neither the webhook secret nor the full number, and the body on the
wire carried both. The task and the result schema were byte equal between them.

## The two repo invariants

**A person is never dialled twice.** Both gates held under attack. The claim is
one SQL statement with `FOR UPDATE SKIP LOCKED`, and two concurrent ticks took
one run between them. The durable key is built at materialisation, stored before
dispatch, and forwarded unchanged on the wire. Nothing re-queues a run. The
recovery path hands a placed call to the poll and fails a run only when no call
exists.

One limit belongs on the record. The second half of the invariant, that a
retried request cannot place a second call, rests on CALL-E's replay of our key.
I measured the key we send and the absence of any second dispatch. I did not
measure the provider's replay, because that needs a live call.

The other direction has a known cost, and the phase chose it deliberately. A run
stranded in `claimed` whose recovery write also fails is never re-queued. The
log names the accepted call id for a human. A person hears nothing that day
rather than hearing two calls. That is the right trade and it is documented.

**The model never produces a number.** Every count and age on a call is computed
in SQL and stored on the run before dispatch, and I measured that order on the
wire. Finding 2 is the one exception the phase missed. The provider's own
sentence about the last call is substituted into the next call's step 4, and
both committed fixtures show that such a sentence can carry a number.

## Phase done conditions against the live path

| Task | Done when | Integrated path |
| --- | --- | --- |
| T2.1 | Kolkata 08:00 gives the right instant, twice gives no duplicate, a deactivated slot loses only future runs | Pass. The wall clock matched the slot. The second materialisation created nothing. With two slots live the profile held one due run and three future ones, and after deactivation it held one due run and none. |
| T2.2 | Four mentions and 34 days give the lead verbatim, the task matches the template step for step, a golden test pins it | Pass. Three mentions gave `3 times`, a fourth gave `4 times`, both with 34 days. The posted task carries the seven steps and no placeholder. The byte for byte golden check passes in file. |
| T2.3 | Two concurrent ticks give one claim, an idle tick touches no row | Pass. Two ticks produced one claim and one call. A tick with nothing due reported `{"claimed":0,"polled":0,"finalised":0}` and mutated no run. |
| T2.4 | A mock returns a call id, a replayed key returns the original call, a 409 is visible, no consent is refused with a reason | Pass, with one limit. The mock returned a call id and the 409 and both refusals are recorded. The replay clause rests on the key we forward, which I measured, and on CALL-E's replay, which needs a live call. |
| T2.5 | A live call terminalises through polling alone with the webhook unregistered, and a second run proves the poll is a no-op when the webhook won | Gap, and not a failure. This needs a live CALL-E key and costs money. A live call is evidence rather than a gate, so I did not place one. I measured the poll terminalising a run and leaving the state to the finaliser, and the webhook winning over the poll's schedule. |
| T2.5a | Both race orderings leave `terminal_writer` naming the writer whose timeline row claims the move, a second event records `already_resolved`, a redelivery records `applied`, pins F1a F1b F1c pass | Pass on the phase view. I measured the poll naming itself and the webhook naming itself with its event id, and a redelivery of a settled event writing nothing. The raced orderings and the `already_resolved` case are the task's own pins and I did not re-run them. |
| T2.6 | A replay is a no-op, a request without the secret is rejected, a hand-edited body changes nothing, three event types are committed, each drives the correct re-fetch | Pass. A redelivery wrote nothing. A wrong path secret answered 401. A body naming a foreign run and claiming success left the run `failed` on the re-fetch, and the other run untouched. Four fixtures are committed and the receiver's 34 checks pass. |
| T2.7 | The completed fixture gives the expected items, mentions, retirements and commitments, an invalid fixture writes a transcript and no partial state, an offsetless retirement is rejected, a re-ingest changes nothing | Pass, with a note. The committed completed fixture carries no retirement and no commitment, so my live run produced one item and one mention. I drove a retirement and a rejected retirement separately, and both behaved. `test-ingest.sh` covers the augmented payload. |
| T2.7a | A poll-terminalised run and a webhook-terminalised run each reach `completed_at` with rows, a second tick changes nothing, a failing re-fetch leaves its run queued | Pass on the phase view. Both terminal paths reached `completed_at` with transcript, result, item and mention. A later tick did not re-finalise either. The failing re-fetch case is the task's own pin. |
| T2.8 | A full dry run produces items and mentions, the recorded body matches the live body byte for byte, no outbound request is made | Pass. Both bodies were 4724 characters and identical. The dry run produced a transcript, an item and a mention. No request left for the CALL-E host, and with `ORMA_DRY_RUN` unset no request left at all. The recorded copy is a mask by design, and the divergence from the phase prose is already recorded. |
| T2.9 | A completed run reads as an ordered story from materialisation to delivery, and a failed run names where it stopped | Pass for the story, and delivery is elsewhere. The completed run read six kinds in order and the failed run read the same six with `call_failed` on the final row. The 409 and both refusals each ended with a `finalised` row naming the reason. Delivery is T3.4's `deliveries` row and no P2 code writes one. |

## What P7 and P8 can rely on

P7 can rely on these rows, all of which I read back after the pipeline ran: a
transcript with turns carrying `speaker` and `offset_seconds`, a `results` row
with `structured`, `valid` and `error`, `items` with `since_date`, `status`,
`retired_at` and `retired_reason`, `item_mentions` with an offset per mention,
`commitments` with `due` and an evidence offset, and `call_runs` with
`disposition`, `mood` and `completed_at`. A pattern report's numbers therefore
have a row behind every one of them.

P7 can also rely on `call_events`. A run's `ingested` row carries the four
counts and the repair list, so a report reader does not have to recount.

P8 can rely on the dry rehearsal, on the eight timeline kinds, and on
`terminal_writer` naming the writer that moved a run.

Five things the next phases need and P2 does not yet provide.

1. The migrations are not on the deployment, which is finding 1. P8's first act
   is to apply all seven, and to regenerate the types.
2. The post-call receipt seam is unwired. `deliverIngestionReceipt` in
   `_shared/receipt.ts` has no caller outside its own test file, and no path
   writes a `deliveries` row after ingestion. T7.4 owns the caller. The record
   the receipt leaves is `deliveries`, keyed by `call_run_id`, and not a ninth
   timeline kind.
3. Nothing sets `call_runs.dry_run` in production. The global flag is the
   documented mechanism, and the per-run override needs an operator UPDATE.
   No phase 2 task owns a surface for it.
4. Nothing delivers a post-call receipt, so a user learns nothing after a call
   except through the web app.
5. `spec.md` §3's `no_result` state has no producer, which is finding 6. A
   reader should branch on the disposition instead.

## Residual risk

* No live CALL-E call was placed, by instruction. The poll timing, the
  provider's idempotent replay and the live re-fetch payload all stay unpinned
  here.
* CALL-E still never delivers a webhook to `orma-api.nryn.dev`. The phase is
  re-fetch based and the poll reconciles, so nothing depends on delivery.
* A run stranded in `claimed` has no lease and no expiry. A human repairs it.
* A lost timeline append can leave a gap, and a retry after a lost response can
  append a duplicate row. No key on `call_events` could refuse it.
* The dry-run mask keeps the leading seven characters of a number. That is the
  recorded design and it is deliberate.
* The stack's `webhook_events` table is the de-duplication gate. Its rows are
  never pruned, so it grows for the life of the project.
* My driver injects a clock so that the claim RPC sees due runs. That is a
  harness property, and I verified the materialised instants against the slot
  wall clock.

## Cleanup

`/tmp/p2e2e/cleanup.sql` deletes the five scratch profiles, which cascades to
their slots, consents, items, mentions, runs, events, transcripts and results.
It also deletes the two future runs that `materialise` wrote for the pre-existing
local developer profile, and the scratch `webhook_events` rows.

The stack returned to its exact baseline. Before the run and after cleanup:

```
profiles=1 slots=1 call_runs=1 call_events=2 items=4 mentions=3 consents=1
runs_ids=40000000-0000-4000-8000-000000000001
webhook_events=0
```

No migration, no policy and no configuration value changed. No commit was made.
No secret was echoed and every number in this file is masked.

## Recommended remediation order

1. **Apply the seven migrations to the linked project** and regenerate both
   `database.types.ts` copies. This closes findings 1 and 4 together.
2. **Render `last_call_summary` from SQL, or blank it.** This closes finding 2
   and is the only change that removes a model number from the phone.
3. **Set `billable` where the call was accepted and answered.** This closes
   finding 3.
4. **Revoke execute on `assemble_briefing` from anon and authenticated**, so it
   matches its three siblings. This closes finding 5.
5. **Resolve the `no_result` name and the seeded event kind.** Both are small
   and both are contract hygiene. They close findings 6 and 7.
