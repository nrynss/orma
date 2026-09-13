# P2 e2e round 2 review

## Verdict

**REMEDIATE**

| C | H | M | L |
| --- | --- | --- | --- |
| 0 | 0 | 1 | 1 |

The verdict is REMEDIATE, with one M and one L. No finding at C or H, and
round 1's C and H are both closed.

Round 1 returned REMEDIATE with one C, one H, two M and three L. Six of those
seven are closed by T2.10 and the seventh by the orchestrator. I claim zero
residue against all seven, and the evidence for each is below.

Two findings are new, and both come from the same seam. The billing and
disposition fix binds `billable` and `disposition` to ingestion. A terminal run
that never reaches ingestion therefore carries neither, and one such path is
reachable in production today. The rehearsal also cannot reach the `no_result`
state the phase just added.

Round 1's verdict stands for the phase as a whole. Every per-task verdict
stands. This review reopens no task seam its own review closed, except where the
phase view owns the behaviour.

## Findings

| Sev | Where | What | Pin | Mutation |
| --- | --- | --- | --- | --- |
| M | `supabase/functions/_shared/finalise.ts:203-227` with `supabase/migrations/20260913130000_finalise_attempts.sql:112-116` and `supabase/migrations/20260912180000_ingest.sql:180-189` | `disposition` and `billable` are written by ingestion alone. The webhook and the poll write `state` and nothing else. A run that reaches a terminal state and then never reaches ingestion keeps a terminal state, a null disposition and `billable = false` for good. The finaliser's give-up path is exactly that run. `spec.md` section 3 says Orma writes a disposition when a run reaches a terminal state, and it bills `answered_extracted`. | Driver `/tmp/r2e2e/driver.ts`, section "ATTACK a terminal run whose re-fetch never succeeds". The webhook terminalised a live dispatched run, then three `finaliseStep` attempts met a failing re-fetch. The run read `completed \| null \| false \| true` with `finalise_attempts 3` and `finalise_error` naming the give-up. The same shape holds when the poll terminalises as `completed`. | Nothing to revert, because nothing writes the pair on that path. A fix that writes the disposition and `billable` in the same guarded statement that ends the run is what closes it. Without one, a call CALL-E placed and answered reads unbilled, and a disposition reader sees null. |

## Round 1 residue claim

Zero residue. Seven findings, seven measurements of my own, seven reverts with
real teeth. Each revert tree lives under `/tmp/r2e2e/reverts` and holds a copy of
the repository's `supabase/` and `testdata/` with exactly the named fix put
back. A `diff -rq` against the live tree reports only the file each finding
names.

| Round 1 finding | How I checked it | How I checked the fix is not a shim |
| --- | --- | --- |
| C, the deployment has no P2 schema | Front door probes in `/tmp/r2e2e/deployed-probes.sh`. Every P2 column answers 200. All five RPCs answer 401 `42501 permission denied` when called with their real signatures, so each one exists. `tick` and `materialise` answer 401 with `acceptedAuthModes: ["secret:materialise"]`, which is the wrapper the repository's own code installs. | Two controls on the same front door. A column nobody wrote answers 400 `42703` and names the real `call_runs.finalise_attempts` in its hint. A function name nobody wrote answers 404 `PGRST202`. So a probe here separates absent from denied. |
| H, the provider's own sentence reached the phone | Driver section "FINDING 2", then "FINDING 2b". I wrote `You mentioned the dentist 7 times and it has been 99 days` into the profile's transcripts, assembled the briefing, rendered the task and read the ledger. | `revert-h` runs `test-briefing.sh` and exits 3 with `the prior call summary must come from the run rows: You mentioned the dentist 7 times and it has been 99 days.` |
| M, `billable` is never true | Driver section "FINDING 3" reads five product paths from SQL. Live completed true, live failed false, live `no_result` true, refusal false, rehearsal false with a `fixture:` call id. | `revert-billable` runs `test-ingest.sh` and exits 1 with `the completed run read 'completed answered_extracted unknown false' beside its disposition`. |
| M, both type copies miss the finaliser's schema | `supabase gen types typescript --db-url "$SUPABASE_DB_URL"` against the shared stack is byte-identical to both committed copies. The five names read 4, 4, 4, 1 and 1 in both. | `revert-types` restores the HEAD pair. `grep -c` returns 0 in both copies for all five names. |
| L, `assemble_briefing` kept EXECUTE for anon | `pg_proc.proacl` on the shared stack and on a fresh database reads `postgres=X/postgres,service_role=X/postgres` for all five RPCs. `has_function_privilege` answers false for anon and authenticated, true for service_role. The deployed front door denies anon on all five. | `revert-acl` runs `test-briefing.sh` and exits 3 with `anon can execute assemble_briefing`. |
| L, `no_result` had no producer | The real receiver took a `call.result_validation_failed` re-fetch to `no_result`, and the run read `no_result \| answered_no_result \| true \| true`. The tick's terminal queue sends `state=in.(completed,no_result,failed,canceled)`. `deno test` on the three modules is 73 passed, 0 failed. | `revert-noresult-prod` puts only the production mapping back and keeps every test. Six tests fail, including `result_validation_failed mapped to null, not no_result`. `revert-noresult-sql` runs `test-ingest.sh` and exits 3 with `ERROR: ingest requires a terminal state, got no_result`. |
| L, the seed wrote a ninth kind | The seeded run reads `dispatched,finalised` on the shared stack and on a fresh database. No row anywhere in `call_events` falls outside the eight, and the shared stack holds exactly the eight kinds. | `revert-seed` runs `test-ingest.sh` and exits 1 with `the seeded run's timeline read '2 completed'`. |

One revert needs a note. T2.10's `revert-noresult-ts` restores three whole
modules, and the new test cases live inside those modules. A file-level restore
therefore takes the tests with the fix and `deno test` stays green at 67
passed, 0 failed. That pin does not measure the fix. My `revert-noresult-prod`
does, by disabling only the two `NO_RESULT_STATUSES` lists and keeping every
test.

## What I measured, and how

Every claim below came from a real handler, a real SQL read or a real HTTP
request. No module's own summary is evidence.

Scratch files, all disposable:

* `/tmp/r2e2e/seed.sql` and `/tmp/r2e2e/cleanup.sql`
* `/tmp/r2e2e/driver.ts`, 50 checks
* `/tmp/r2e2e/driver2.ts`, 3 checks
* `/tmp/r2e2e/fresh.sh`, the fresh database and type generator
* `/tmp/r2e2e/deployed-probes.sh`
* `/tmp/r2e2e/reverts/`, eight revert trees
* `/tmp/orma-review-p2e2e-r2/`, the freeze of every file T2.10 changed

Commands:

```
bash /tmp/r2e2e/deployed-probes.sh
bash /tmp/r2e2e/fresh.sh
docker exec -i supabase_db_stack psql -U postgres -v ON_ERROR_STOP=1 -q < /tmp/r2e2e/seed.sql
source /tmp/orma-p2/env.sh && deno run --allow-all /tmp/r2e2e/driver.ts
source /tmp/orma-p2/env.sh && deno run --allow-all /tmp/r2e2e/driver2.ts
bash supabase/migrations/test-briefing.sh
bash supabase/migrations/test-ingest.sh
deno test --allow-read --allow-env supabase/functions/_shared/poll.ts supabase/functions/_shared/ingest.ts supabase/functions/calle-webhook/index.ts
supabase gen types typescript --db-url "$SUPABASE_DB_URL"
docker exec -i supabase_db_stack psql -U postgres -v ON_ERROR_STOP=1 -q < /tmp/r2e2e/cleanup.sql
```

The driver result is `50 passed, 0 failed`. The second driver is `3 passed, 0
failed`. The two acceptance runners both exit 0. The module suite is `73 passed
| 0 failed`.

Only one harness process was needed. The scratch proxy on `127.0.0.1:57031` was
down, so I started the existing `/tmp/orma-p2/proxy.ts` under `hub` on that
port. I did not touch `up.sh`, the stack or the seed.

### 1. The deployment

`/tmp/r2e2e/deployed-probes.sh` prints, in order:

```
call_runs?select=terminal_writer    HTTP 200 []
call_runs?select=finalise_attempts  HTTP 200 []
call_runs?select=finalise_after     HTTP 200 []
call_runs?select=finalise_error     HTTP 200 []
call_runs?select=dry_run            HTTP 200 []
call_runs?select=billable           HTTP 200 []
HTTP 400 {"code":"42703","hint":"Perhaps you meant to reference the column \"call_runs.finalise_attempts\"."}
rpc/assemble_briefing        HTTP 401 {"code":"42501","message":"permission denied for function assemble_briefing"}
rpc/claim_due_call_runs      HTTP 401 {"code":"42501","message":"permission denied for function claim_due_call_runs"}
rpc/record_finalise_failure  HTTP 401 {"code":"42501","message":"permission denied for function record_finalise_failure"}
rpc/abandon_call_run         HTTP 401 {"code":"42501","message":"permission denied for function abandon_call_run"}
rpc/ingest_call_result       HTTP 401 {"code":"42501","message":"permission denied for function ingest_call_result"}
HTTP 404 {"code":"PGRST202"}                    (a function name nobody wrote)
functions/v1/tick         HTTP 401 {"acceptedAuthModes":["secret:materialise"]}
functions/v1/materialise  HTTP 401 {"acceptedAuthModes":["secret:materialise"]}
HTTP 404 {"code":"NOT_FOUND","message":"Requested function was not found"}
wrong path secret  HTTP 401
right secret, no event id  HTTP 400
HTTP 404 {"code":"PGRST202"}                    (set_updated_at, a trigger function)
```

So the deployment carries the schema, the ACLs and the two functions. The
`secret:materialise` auth mode is the `withSupabase({ auth: "secret:materialise" })`
call in `materialise/index.ts:292` and `tick/index.ts:281`, so the deployed
bodies are this repository's code rather than a placeholder.

The receiver proves itself twice. A wrong path secret answers its own 401. A
correct secret with no `call-e-event-id` header answers 400 before any write, so
no deployed row was touched. The `left` branch of that handler is unreachable
from outside without arming the scheduler, and I did not arm it.

Two limits belong on the record. I cannot read `cron.job` or
`vault.decrypted_secrets` on the linked project from here, so the schedule and
the Vault name are unpinned. The database host `db.pyuubklpkhjngiqqwypf.supabase.co:5432`
times out on this network, as `AGENTS.md` says it would.

### 2. The fresh database

`bash /tmp/r2e2e/fresh.sh` built a throwaway Supabase project on database port
57862 from the repository's thirteen migration files. `supabase start` exited 0,
and `supabase_migrations.schema_migrations` lists all thirteen in filename
order, ending `20260913130000 finalise_attempts`.

* The five P2 functions matched the shared stack on all five `md5(prosrc)`
  values, `assemble_briefing = dd16181a3702709650d152bf8dee0e04` included.
* All five read `postgres=X/postgres,service_role=X/postgres`.
* `has_function_privilege` reads `anon assemble=false`, `authenticated
  assemble=false`, `service_role assemble=true`.
* 109 `public` columns, identical to the shared stack, `diff` silent.
* The seeded run's timeline reads `dispatched,finalised`, and a count of kinds
  outside the eight returns 0.
* `cron.job` holds `materialise-runs` at `10 0 * * *` and `tick-runs` at
  `* * * * *`, each guarded on a non-empty Vault value.

The generated types are the one place the fresh project and the shared stack
differ. Types generated from the fresh project differ from both committed copies
by exactly the twenty eight line `graphql_public` block, and by nothing else.
Types generated from the shared stack are byte-identical to both committed
copies, 826 lines each. The hosted project and the shared stack carry
`graphql_public`, and a project built from the migrations alone does not. P1
round 4 regenerated from the linked project and got a byte match, so the
committed pair is the linked truth and finding M is closed. Nothing the fresh
database has is missing from the committed copies.

### 3. Every number on the phone has a row

The driver stored a provider sentence carrying `7 times` and `99 days` into the
profile's transcripts, assembled the briefing and rendered the task. The
rendered task's step 4 reads `Last call we wrote down 1 new item.` No line
carries either provider token, and the previous run's own row prints beside it:
`answered_extracted | 1 | 0 | 0 | 1 | 0` for disposition, captured, retired,
committed, mentions and commitment rows.

A second pass drove ingestion with two captures, one retirement and two
commitments. The next briefing's summary read `Last call we wrote down 2 new
items. You closed 1 item. You promised 2 things.` The same call's rows read
`captured_items 2 | mentions 5 | retired 1 | commitments 2`, and
`results.structured` holds `2/1/2`. Every number in the summary counts rows.

The same pass printed the lead sentence's numbers beside their SQL reads. The
`3` counts three `item_mentions` rows, the `34` is the day difference from
`since_date`, and `slot_local_time` is `slots.local_time`, which
`_shared/calle.ts:338` passes from the run's slot row.

### 4. Billing and the disposition, read from SQL

```
3a9f1399-…  completed   answered_extracted   true   call_r2_1
98045db7-…  failed      not_answered         false  call_r2_2
76417e86-…  completed   answered_extracted   false  fixture:call_tQA8nz1WGj9vfO30PxTosA
68c1bbb3-…  canceled    canceled             false  null
89f08232-…  completed   answered_extracted   true   call_r2_prior
```

The rehearsal row carries `dry_run true`, a `fixture:` call id and `false`. A
validation-failed call reads `no_result | answered_no_result | true | true`. The
`no_result` state is real, the disposition the spec names for it is real, and
the billed column follows.

I also called `ingest_call_result` directly with `state failed` beside
`disposition answered_extracted` and a real call id. It wrote
`answered_extracted` and `true`, so the RPC mirrors the pair its caller sends
and enforces no consistency of its own. That is safe today, because
`dispositionFor` in `ingest.ts` is the only thing that builds the pair and it is
total over the four states. I record it as a limit, not a finding.

### 5. Exactly once

Two overlapping ticks ran under `Promise.all` over one due run. Their results
were `{"claimed":1,…}` and `{"claimed":0,…}`, and exactly one `POST /v1/calls`
left the process. The `Idempotency-Key` header on that request was
`r2:race:v1`, which is the value stored on the run. A later tick made no second
request, and the run's own `idempotency_key` is unchanged.

The second half of the invariant rests on CALL-E's replay of our key, and
measuring that needs a live call. I measured the key we send and the absence of
any second dispatch.

## Phase done conditions against the live path

| Task | Done when | Integrated path this round |
| --- | --- | --- |
| T2.1 | Kolkata 08:00 gives the right instant, twice gives no duplicate, a deactivated slot loses only future runs | Pass. The wall clock matched the slot. `materialise` twice created no duplicate. Deactivation at the real clock kept the due run and removed only the future ones, `due 1, future 0`. My first pass at this read `due 0` because I deactivated at the materialiser's own backdated clock, which reclassified a due run as future. That was my harness, not the code. |
| T2.2 | Four mentions and 34 days give the lead verbatim, the task matches the template step for step, a golden test pins it | Pass. Three mentions gave `3 times`, 34 days. The rendered task carries the seven steps, no placeholder and no provider number. `test-briefing.sh` exits 0 with `T2.2 briefing acceptance passed.` |
| T2.3 | Two concurrent ticks give one claim, an idle tick touches no row | Pass. One claim and one call between two ticks. An idle tick returned `{"claimed":0,"polled":0,"finalised":0}` and left a before and after snapshot of every `call_runs` row identical. |
| T2.4 | A mock returns a call id, a replayed key returns the original call, a 409 is visible, a profile without consent is refused with a reason | Pass, with round one's limit. The mock returned a call id, the no-consent profile ended `canceled` with its reason, and the 409 path is unchanged from round one. The replay clause still needs a live call. |
| T2.5 | A live call terminalises through polling alone with the webhook unregistered, and a second run proves the poll is a no-op when the webhook won | Gap, and not a failure. A live call costs money and needs a key. I measured the poll terminalising runs and the webhook winning over the poll's schedule. |
| T2.5a | Both race orderings leave `terminal_writer` naming the writer whose timeline row claims the move, a second event records `already_resolved`, a redelivery records `applied` | Pass on the phase view. The poll named itself and the webhook named itself with its event id, and a redelivery of a settled event wrote nothing. The raced orderings are the task's own pins. |
| T2.6 | A replay is a no-op, a request without the secret is rejected, a hand-edited body changes nothing, three event types are committed, each drives the correct re-fetch | Pass, and the third event type now drives a state. A `call.result_validation_failed` envelope with a matching re-fetch landed the run in `no_result`. The wrong-secret request is 401 and the deployed receiver answers the same way. |
| T2.7 | The completed fixture gives the expected items, mentions, retirements and commitments, an invalid fixture writes a transcript and no partial state, an offsetless retirement is rejected, a re-ingest changes nothing | Pass. `test-ingest.sh` exits 0 with `T2.7 ingestion acceptance passed.`, and it now names the billing pair, the `no_result` case and the seeded kinds. My driver's retirement run wrote `2/5/2` and a direct re-ingest returned `already_ingested`. |
| T2.7a | A poll-terminalised run and a webhook-terminalised run each reach `completed_at` with rows, a second tick changes nothing, a failing re-fetch leaves its run queued | Pass on the phase view, with the new M finding beside it. Both terminal paths reached `completed_at` with rows, and a later tick did not re-finalise. A failing re-fetch leaves the run queued for three attempts and then ends it. |
| T2.8 | A full dry run produces items and mentions, the recorded body matches the live body byte for byte, no outbound request is made | Pass, and the rehearsal cannot reach `no_result`, which is the new L finding. The dry timeline reads `materialised,claimed,dispatched,ingested,finalised`, the run carries a `fixture:` call id and `billable false`, and the recorded body is a mask carrying neither the secret nor the full number. |
| T2.9 | A completed run reads as an ordered story from materialisation to delivery, and a failed run names where it stopped | Pass for the story. The completed and failed runs each read six kinds in order, the dry run reads five, and the seeded run reads `dispatched,finalised`. Delivery is T3.4's `deliveries` row and no P2 code writes one. |

## The two invariants under attack

**A person is never dialled twice.** The claim held. One SQL statement with
`FOR UPDATE SKIP LOCKED` took one run between two concurrent ticks, and the
durable key was built at materialisation, stored before dispatch and forwarded
unchanged. Nothing re-queues a run. I did not measure CALL-E's own replay of the
key, which needs a live call.

**The model never produces a number.** Every count and age on the call is
computed in SQL and stored on the run before dispatch, and the provider's own
sentence is now unreadable by the briefing. The order is on the wire, which the
driver's request index reads as `assemble_briefing -> PATCH briefing -> POST
/v1/calls`. Two channels remain and both are recorded under residual risk.

## The attacks I ran

1. **An extraction that fails validation and then succeeds on the retry.** It
   never retries. The first terminal re-fetch wrote `no_result`,
   `answered_no_result`, `billable true` and a `completed_at`, and one
   `results` row. I then made the stub report a usable result. The next tick
   finalised 0 and a direct re-ingest returned `already_ingested`. The run keeps
   its first disposition forever. This is the designed contract, because the
   provider's payload for one call never changes, and I record it as residual
   risk rather than a finding.
2. **A dry run whose fixture reports a validation failure.** The selector
   refuses every validation spelling, so there is no such rehearsal. This is the
   new L finding.
3. **A run whose disposition and `billable` could disagree.** Across the five
   product paths they never did. The RPC itself trusts its caller's pair, which
   is safe because one total function builds it.
4. **A rehearsal with a synthetic call id.** The rehearsal read
   `completed | answered_extracted | false` with `calle_call_id`
   `fixture:call_tQA8nz1WGj9vfO30PxTosA`, and the failed-fixture rehearsal read
   `failed | not_answered | false`. Neither billed.
5. **Any path where `no_result` reaches a reader that branches on `completed`.**
   No reader branches on `completed` today. The tick's own terminal filter sends
   `state=in.(completed,no_result,failed,canceled)`, so the finaliser sees the
   state. The one writer that cannot express it is the dry-run patch, which is
   the L finding. Between the webhook's terminal write and ingestion the run is
   terminal with a null disposition. When ingestion runs that window is
   transient. When the finaliser gives up it is permanent, which is the M
   finding.

## What the deployment still lacks, and what an operator must do

1. **Write the Vault secret `ORMA_MATERIALISE_SECRET_KEY`.** Both `pg_cron` jobs
   guard on a non-empty value, so both emit nothing until it exists. The
   scratch stack holds 0 `vault.decrypted_secrets`, which is the designed
   fail-closed state. The linked project's Vault is unreadable from here, and
   the name stays absent there by instruction.
2. **Put a real secret API key in that Vault row, not a free string.** The
   deployed `tick` and `materialise` accepted auth mode is
   `secret:materialise`. The value the cron sends in the `apikey` header must
   satisfy both the platform gate and the function's own wrapper.
3. **Confirm the function secrets.** `tick`, `materialise` and `calle-webhook`
   read `ORMA_API_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ORMA_WEBHOOK_SECRET`,
   `CALLE_API_BASE` and `CALLE_API_KEY`. `ORMA_DRY_RUN` must read true or absent
   so dry mode is the default, and a run must not carry `dry_run = false` until
   P8 says so. The wrapper needs `SUPABASE_SECRET_KEYS` to hold a key named
   `materialise`. `supabase secrets list --project-ref pyuubklpkhjngiqqwypf`
   shows names only, which is enough to confirm each name is present.
4. **Confirm the two cron jobs exist on the linked project.** They come from
   `20260912150000_schedule_materialise.sql` and `20260912170000_schedule_tick.sql`.
   The migrations are applied, since the same migration set's columns and
   functions answer. I cannot read `cron.job` through the front door, so an
   operator must confirm `materialise-runs` and `tick-runs` there.
5. **Nothing sets `call_runs.dry_run` in production.** The global flag is the
   mechanism and the per-run override needs an operator UPDATE. No phase 2 task
   owns a surface for it.
6. **The post-call receipt seam is unwired.** `deliverIngestionReceipt` has no
   caller outside its own test file, and no path writes a `deliveries` row after
   ingestion. T7.4 owns the caller.
7. **Types need no work.** Both committed copies are byte-identical to a fresh
   generator run against the shared stack.

P8 must not run a real call until steps 1 to 4 are done. Until then the schedule
emits nothing, which is why the phase can be closed while the deployment is
inert.

## Residual risk

* **A captured item's text can carry a digit.** I inserted an item reading
  `buy 3 tickets` with three mentions and forty days of age. The briefing
  returned `You've mentioned buy 3 tickets 3 times. It's been 40 days.` The
  item text is extraction prose, and the row keeps its evidence offset. Round
  one recorded the same channel in its section 3 and raised no finding, so there
  is no residue. A reader should know the channel is live.
* **A terminal run that never reaches ingestion has no disposition.** This is
  the M finding, and it covers the webhook and the poll alike.
* **A run whose provider reported `completed` with a null structured result is
  finalised as `answered_no_result` and never revisited.** I measured the
  behaviour. Whether CALL-E can report `completed` before the extraction lands
  is unmeasured, and the committed fixture carries the result beside the status.
* **No live CALL-E call was placed.** The poll timing, the provider's idempotent
  replay, the live re-fetch payload and webhook delivery all stay unpinned here.
* **A run stranded in `claimed` has no lease and no expiry.** A human repairs
  it.
* **A lost timeline append can leave a gap.** `recordCallEvent` retries from one
  budget, and no key on `call_events` could refuse a duplicate.
* **The dry-run mask keeps the leading seven characters of a number.** That is
  the recorded design.
* **`webhook_events` grows for the life of the project.** Nothing prunes it.
* **The linked project's schedule and Vault are unreadable from here.** Step 1
  and step 4 above are the operator's own pins.

## Cleanup

`/tmp/r2e2e/cleanup.sql` deletes the five scratch profiles, their cascade and
the `evt_r2_%` `webhook_events` rows. It also deletes the future runs the
materialiser wrote for the pre-existing local developer. The stack then reads
exactly its baseline:

```
profiles=1 slots=1 call_runs=1 call_events=2 items=4 mentions=3 consents=1
webhook_events=0 transcripts=1 results=1 commitments=1
runs_ids=40000000-0000-4000-8000-000000000001
vault_secrets=0
cron=materialise-runs|10 0 * * *  cron=tick-runs|* * * * *
```

The three transcript, result and commitment rows belong to the seeded run
`40000000-…-0001` and come from `seed.sql`. The two acceptance runners and the
two driver runs are gone.

Every file T2.10 changed is byte-identical to the freeze at
`/tmp/orma-review-p2e2e-r2`, checked with `cmp` at the end of the review. No
migration, no policy, no configuration value and no seed row changed. I wrote
only this file. No commit was made, and no status line moved. No call was
placed. No secret was echoed, and the one phone number in this file is masked.
