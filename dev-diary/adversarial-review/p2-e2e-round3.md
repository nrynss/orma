# P2 e2e round 3 review

## Verdict

**REMEDIATE**

| C | H | M | L |
| --- | --- | --- | --- |
| 0 | 0 | 2 | 0 |

Two findings, both M, both in the disposition and billing seam that T2.10
remediation round 2 opened. Round 1's seven findings stay closed. Round 2's L
is closed. Round 2's M is closed for the writers it named and open on two it did
not, so residue against round 2 is not zero.

Everything else this phase claims holds. The exactly-once claim, the SQL
numbers claim, the migration order, the rehearsal, the ingestion shapes and the
eight-kind vocabulary all survived my own measurement. The phase does not land
until the two below are fixed.

Round 1's verdict stands as history. Every per-task verdict stands. This round
reopens no task seam its own review closed.

## Findings

| Sev | Where | What | Pin | Mutation |
| --- | --- | --- | --- | --- |
| M1 | `supabase/functions/_shared/calle.ts:384-388` and `:399-403` | The dispatcher's two terminal failure writes, the 409 idempotency conflict and any non-2xx response, write `state = 'failed'` and `completed_at` and never a disposition. `terminalRuns()` selects only runs with a null `completed_at`, so no later writer reaches them. Each such run rests terminally with `disposition` null for good, which `spec.md` section 3 forbids. The billed column reads false only because the column default is false, so nobody wrote the pair at all. | Driver PHASE A1 reads `failed / null / false / completed=true / writer=null` with the timeline `claimed,finalised`, and PHASE A2 reads the same for a 500. `case eighteen`'s own SQL, run against the stack straight after the driver, returns `2`. `test-ingest.sh` exits 0 because its corpus seeds no dispatch-rejection row, so its new acceptance case cannot see this. | A reader that branches on the disposition reads null for a call CALL-E refused. The briefing's prior-call read takes the newest completed run, so the following call says `Last call added nothing new.` about a call that never connected. |
| M2 | `supabase/migrations/20260913130000_finalise_attempts.sql:115-122` with `supabase/functions/_shared/dispatch-mode.ts:552` and `supabase/functions/_shared/finalise.ts:311-326` | `abandon_call_run` writes `disposition = 'not_answered'` without setting `state = 'failed'`. Its comment assumes the run already holds `failed`. Two real paths reach it with another state. A run the webhook terminalised as `completed` whose re-fetch then fails three times ends `completed / not_answered`. A rehearsal whose ingestion call fails once ends the same way, and its `fixture:` call id sends the finaliser after a call that cannot exist. | Driver PHASE C3 reads `completed / not_answered / false / completed=true`. PHASE I drives the real dispatcher with one 503 from the ingestion RPC and reads the same pair at rest, after the finaliser spends three attempts on `CALL-E re-fetch returned HTTP 404` for a synthetic id. `test-ingest.sh` case seventeen forces `state = 'failed'` on its two abandon rows before it calls the function, so it cannot fail. | One run reads as both `completed` and unanswered. A reader that lists completed calls shows it as answered, while the next briefing reads the disposition and says `Last call went unanswered.` |

## The two round 2 findings, judged

### The M, a terminal run that never reaches ingestion

**Closed for the writers it named. Its stated invariant is not true.**

I drove every writer that can end a run and read the pair out of SQL for each.
The finaliser's give-up writes it with a real call id and with none, PHASE C1 and
C2. The poll's two give-up paths write it, PHASE B1 and B2. The refusal writes
`canceled / canceled`, PHASE A3 and A4. The recovery writes
`failed / not_answered`, PHASE A5. Ingestion writes both columns in one UPDATE,
and PHASE D1 to D3 read the three shapes.

Two writers the remediation did not name leave the disposition null. They are
M1. So the finding is fixed where it was reported and the class it described is
alive elsewhere. I record that as residue against round 2, not as a new class.

### The L, the rehearsal could not reach `no_result`

**Closed.**

PHASE E2 selected the shape through the real dispatcher with
`ORMA_DRY_RUN_FIXTURE=no_result`, placed no call, and read
`no_result / answered_no_result / false` with the synthetic call id. The
timeline reads `claimed,dispatched,ingested,finalised`. The rehearsal's
transcript is the recorded 27 turns and it reached a `results` row, so the
recorded call identity still reaches ingestion. The failed and completed
rehearsals read their own pairs. Two CALL-E spellings live in one list in
`fixtures.ts:21`, and `dryRunFixtureName` accepts both.

## What I measured, and how

Every claim below came from a real handler, a real SQL read or a real HTTP
request. No module's own summary is evidence.

Scratch files, all disposable:

* `/tmp/r3e2e/seed.sql` and `/tmp/r3e2e/cleanup.sql`
* `/tmp/r3e2e/driver.ts`, the phase driver, 58 checks
* `/tmp/r3e2e/driver.out` and `/tmp/r3e2e/evidence.txt`, its full output
* `/tmp/r3e2e/fresh.sh`, the fresh database runner
* `/tmp/r3e2e/gen-types.ts`, the generated type file
* `/tmp/r3e2e/r2-freeze-diff.txt`, the delta against round 2's freeze
* `/tmp/orma-review-p2e2e-r3/`, the freeze of every file T2.10 changed

Commands:

```
bash /tmp/r2e2e/deployed-probes.sh
bash /tmp/r3e2e/fresh.sh
bash supabase/migrations/test-briefing.sh
bash supabase/migrations/test-ingest.sh
supabase gen types typescript --db-url "$SUPABASE_DB_URL"
docker exec -i supabase_db_stack psql -U postgres -v ON_ERROR_STOP=1 -q < /tmp/r3e2e/seed.sql
source /tmp/orma-p2/env.sh && deno run --allow-all /tmp/r3e2e/driver.ts
docker exec -i supabase_db_stack psql -U postgres -v ON_ERROR_STOP=1 -q < /tmp/r3e2e/cleanup.sql
```

The driver result is `58 passed, 0 failed`. The fresh runner exits 0 with all
thirteen migrations applied in filename order. Both acceptance runners exit 0.
The deployed probes print the same bytes round 2 recorded.

The harness is the shared stack. Postgres is `127.0.0.1:57022` in container
`supabase_db_stack`, PostgREST is `127.0.0.1:57030` and the proxy is
`127.0.0.1:57031`. `CALLE_API_BASE` points at the stub host, so every CALL-E
request is intercepted by a recording fetch. The stub answered four posts and
the process reached two hosts, `127.0.0.1:57031` and `api.call-e.test`. No call
was placed and no request left for a real provider.

### The code did not move under the fixes

`cmp` against `/tmp/orma-review-p2e2e-r3` reports every file identical at the
end of the review, so nothing changed while I worked.

`/tmp/orma-review-p2e2e-r2` is round 2's freeze, which is the tree before
remediation round 2. Three of its files differ from the live tree today, and the
delta is exactly the two fixes plus their acceptance cases. `poll.ts` gains
`billable: false` on both give-up writes and takes the shared spelling list.
`ingest.ts` takes the same list from `fixtures.ts`. `test-ingest.sh` gains cases
sixteen, seventeen and eighteen. Nothing else moved.

### Every terminal run at rest, counted

PHASE H asked the database for every run in a terminal state with a
`completed_at`, and counted the two ways a pair could be wrong. Twenty one rows
were at rest after the whole driver ran:

```
terminal runs at rest with a null disposition: 2
rows where billable disagrees with the disposition rule: 0
```

The two are the 409 run and the 500 run, each reading
`failed / null / false / completed=true / writer=null` with a
`claimed,finalised` timeline. Those two rows are M1. No row's `billable` ever
disagreed with its disposition, so the billed column is exact wherever a
disposition exists.

## The terminal-path matrix

Every path a run can end on, driven through its real handler and read from SQL.

| Path | State | Disposition | Billed | Completed |
| --- | --- | --- | --- | --- |
| Ingestion, completed with a result | `completed` | `answered_extracted` | true | yes |
| Ingestion, result failed validation | `no_result` | `answered_no_result` | true | yes |
| Ingestion, call failed | `failed` | `not_answered` | false | yes |
| Ingestion, call canceled | `canceled` | `canceled` | false | yes |
| The poll's timeout give-up | `failed` | `not_answered` | false | no, then the finaliser |
| The poll with no call id | `failed` | `not_answered` | false | yes |
| The finaliser's give-up, real call id | `failed` | `not_answered` | false | yes |
| The finaliser's give-up, no call id | `failed` | `not_answered` | false | yes |
| The dispatch refusal, no consent | `canceled` | `canceled` | false | yes |
| The dispatch refusal, no number | `canceled` | `canceled` | false | yes |
| The dispatch recovery, no call placed | `failed` | `not_answered` | false | yes |
| **The dispatch 409** | `failed` | **null** | false | yes |
| **The dispatch non-2xx** | `failed` | **null** | false | yes |
| The rehearsal, completed shape | `completed` | `answered_extracted` | false | yes |
| The rehearsal, validation shape | `no_result` | `answered_no_result` | false | yes |
| The rehearsal, failed shape | `failed` | `not_answered` | false | yes |
| The webhook's terminal write | the re-fetched state | **null** until ingestion | false | no |

The last row is the accepted transient. The finaliser picks the run up because
`completed_at` is null, and PHASE G3 measured the disposition arriving after
ingestion. The two bold rows are not transient. Nothing picks them up, and M1
is that.

The canceled ingestion path is the one row this driver did not drive itself.
`test-ingest.sh` prints `T2.7 a canceled call stored its own state, disposition
and transcript.` for it.

## The attacks on the new pair

1. **A disposition written by one path and a billing value by another.** Across
   every path above, no row's `billable` disagreed with the rule
   `disposition in ('answered_extracted','answered_no_result') and a real call
   id`, counted over the whole table. The refusal and the recovery leave
   `billable` at the column default, and that default is false, which is the
   value their disposition requires. No writer can set true before a terminal
   write, because ingestion is the only writer that does and it is terminal
   itself.
2. **A run re-ingested after its disposition was written.** PHASE F1 drove
   `ingestTerminalRun` over the completed run a second time. It returned
   `already_ingested` with zero counts, the row kept
   `completed / answered_extracted / true`, and one `ingested` row survived.
3. **A rehearsal against a real call id.** PHASE F4 seeded a claimed run that
   already held a real provider call id with `dry_run = true`. The dry patch
   replaced the id with a `fixture:` one and the run read
   `completed / answered_extracted / false`. The rehearsal cannot bill, and the
   billing rule reads the id ingestion can see rather than the one the run
   arrived with.
4. **A give-up after ingestion already succeeded.** PHASE F2 called
   `abandon_call_run` on a finished run. It returned false and changed no
   column. PHASE F3 called `record_finalise_failure` on the same run. It
   returned `attempts 0, finalised true`, so the run's own completed state
   guards both writers.
5. **The RPC with a pair its caller must not send.** PHASE F5 called
   `ingest_call_result` with a `failed` state beside an `answered_extracted`
   disposition and a real call id. It wrote `failed / answered_extracted /
   true`, so the boundary trusts its caller. That is safe today, because
   `dispositionFor` at `ingest.ts:140` is total over the four states and it is
   the only production builder of the pair. I record it as residual risk, not a
   finding, exactly as round 2 did.
6. **A rehearsal whose ingestion fails.** PHASE I drove the real dispatcher
   with one 503 on the ingestion RPC. That is M2's second path. It also proves
   the stranded rehearsal never bills.
7. **A give-up on a run the webhook already terminalised.** PHASE C3 is M2's
   first path.

## Phase done conditions

| Task | Done when | Integrated path this round |
| --- | --- | --- |
| T2.1 | Kolkata 08:00 gives the right instant, twice gives no duplicate, a deactivated slot loses only future runs | Pass for the first two. PHASE K3 materialised eight runs across four slots and two dates, every instant `02:30 UTC`, which is 08:00 in `Asia/Kolkata`, and a second call wrote no duplicate. Every stored key equalled `idempotencyKey()`. I did not re-drive deactivation, which round 2 measured and T2.1's own runner pins. |
| T2.2 | Four mentions and 34 days give the lead verbatim, the task matches the template step for step, a golden test pins it | Pass. `test-briefing.sh` exits 0 with `T2.2 briefing acceptance passed.` PHASE G1 read `It's been 34 days.` from a seeded 34-day item. |
| T2.3 | Two concurrent ticks give one claim, an idle tick touches no row | Pass. PHASE K1's idle tick returned zeros and left a hash of every `call_runs` row unchanged. PHASE K2 took one claim between two overlapping ticks, one `POST /v1/calls` left the process, and the wire carried the row's own key. |
| T2.4 | A mock returns a call id, a replayed key returns the original call, a 409 is visible, no consent is refused with a reason | Pass, with M1 beside it. PHASE A1 drove the 409 and PHASE A3 and A4 both refusals. The replay clause still needs a live call. |
| T2.5 | A live call terminalises through polling alone, and a second run proves the poll is a no-op when the webhook won | Gap, as in rounds 1 and 2. This needs a live key and costs money. I measured the poll terminalising a run, PHASE B2, and both give-up paths, PHASE B1 and C1. |
| T2.5a | Both race orderings leave `terminal_writer` naming the writer whose timeline row claims the move, a second event records `already_resolved`, a redelivery records `applied` | Pass on the phase view. PHASE G3 read `writer=webhook:<event id>` after the real receiver moved the run. The raced orderings are the task's own pins and I did not re-run them. |
| T2.6 | A replay is a no-op, a request without the secret is rejected, a hand-edited body changes nothing, three event types are committed, each drives the correct re-fetch | Pass. PHASE G3 drove a `call.result_validation_failed` envelope through the real receiver to `no_result`. The deployed probes answer 401 for a wrong path secret and 400 with no event header, before any write. |
| T2.7 | The completed fixture gives the expected items, mentions, retirements and commitments, an invalid fixture writes a transcript and no partial state, an offsetless retirement is rejected, a re-ingest changes nothing | Pass. `test-ingest.sh` exits 0. PHASE D1 wrote one transcript, one result and one mention. PHASE F1's replay changed nothing. |
| T2.7a | A poll-terminalised run and a webhook-terminalised run each reach `completed_at` with rows, a second tick changes nothing, a failing re-fetch leaves its run queued | Pass, with M1 and M2 beside it. PHASE D1 to D3 drove ingestion through the finaliser. PHASE C1, C2 and C3 spent the attempt budget and ended their runs. A failing re-fetch waits five minutes and spends three attempts. |
| T2.8 | A full dry run produces items and mentions, the recorded body matches what live dispatch would send byte for byte, no outbound request is made | Pass. PHASE E1 to E3 rehearsed all three shapes with zero CALL-E posts. The byte equality stays pinned in `calle.ts`, where both paths run against the same stubs. |
| T2.9 | A completed run reads as an ordered story from materialisation to delivery, and a failed run names where it stopped | Pass for the story. The rehearsal timelines read `claimed,dispatched,ingested,finalised` and the re-fetch paths read `claimed,dispatched,finalised`. Delivery is T3.4's `deliveries` row and no P2 code writes one. |

## Residue, round by round

### Against round 1, zero residue

| Round 1 finding | How I checked it this round |
| --- | --- |
| C, the deployment had no P2 schema | `bash /tmp/r2e2e/deployed-probes.sh`. All six P2 columns answer 200. All five RPCs answer 401 `42501 permission denied`, so each exists. A column nobody wrote answers 400 `42703` and names the real `call_runs.finalise_attempts` in its hint. A function nobody wrote answers 404 `PGRST202`. `tick` and `materialise` answer 401 with `acceptedAuthModes: ["secret:materialise"]`. |
| H, the provider's own sentence reached the phone | PHASE G1 wrote `You mentioned the dentist 7 times and it has been 99 days` into the previous run's `transcripts.raw.summary`. The rendered task carries neither token. The summary read `Last call we wrote down 1 new item.`, which is the row count. |
| M, `billable` is never true | PHASE D1 read `completed / answered_extracted / true` after the finaliser ingested a completed call. |
| M, both type copies missed the finaliser's schema | `supabase gen types typescript --db-url "$SUPABASE_DB_URL"` is byte-identical to both committed copies, 826 lines each. The five names read 4, 4, 4, 1 and 1 in both. |
| L, `assemble_briefing` kept EXECUTE for anon | `pg_proc.proacl` reads `postgres=X/postgres,service_role=X/postgres` for all five P2 functions, on the shared stack and on a fresh database. The two agree column for column. |
| L, `no_result` had no producer | PHASE D2 landed a validation failure through the finaliser, PHASE G3 through the real webhook receiver, and PHASE E2 through the rehearsal. All three read `no_result`. |
| L, the seed wrote a ninth kind | PHASE G2 read the seeded timeline as `dispatched,finalised` and counted zero rows anywhere in `call_events` outside the eight kinds. |

### Against round 2, residue is not zero

| Round 2 finding | How I checked it this round |
| --- | --- |
| M, a terminal run that never reaches ingestion kept a null disposition | Closed for the writers it named and open on two others. PHASE C1 and C2 read the finaliser's give-up as `failed / not_answered / false`. PHASE B1 and B2 read the poll's. PHASE A1 and A2 read `failed / null / false`, which is M1. `case eighteen`'s SQL, which the remediation wrote for this invariant, returns 2 against a database holding those two rows. |
| L, the rehearsal could not reach `no_result` | Closed. PHASE E2 selected the shape through the real dispatcher and read `no_result / answered_no_result / false` with a 27-turn transcript and a `results` row. |

Both round 2 findings remain the right findings. The remediation narrowed the M
to the two writers it could see and wrote an acceptance case whose corpus cannot
see the rest, because it seeds no dispatch-rejection row and it forces
`state = 'failed'` on its abandon rows.

## The two repo invariants

**A person is never dialled twice.** The claim held. PHASE K2 ran two
overlapping ticks under `Promise.all` over one due run. Their results were
`claimed:0` and `claimed:1`, exactly one `POST /v1/calls` left the process, and
the header carried `orma:r3:...:k2:v1`, which is the value stored on the run.
PHASE K3 showed the durable key is built at materialisation and stored before
anything is dispatched. The second half of the invariant, a retried request
placing no second call, still rests on CALL-E's replay of our key. Measuring
that needs a live call.

**The model never produces a number.** PHASE G1's provider sentence, which
carries two numbers, reached no line of the task. Every number in the lead line
and the summary counts rows. The captured item text is the one channel left,
and residual risk names it.

## What the deployment still needs from an operator

The deployment is unchanged from round 2, so its list is unchanged. I confirmed
the schema, the ACLs and the two deployed function wrappers through the front
door. I cannot read `cron.job` or `vault.decrypted_secrets` on the linked
project from here, because the database host times out on this network.

1. Write the Vault secret `ORMA_MATERIALISE_SECRET_KEY`. Both `pg_cron` jobs
   guard on a non-empty value, so both stay inert until it exists.
2. Put a real secret API key in that row, not a free string. The deployed
   `tick` and `materialise` accept auth mode `secret:materialise`.
3. Confirm the function secrets. `ORMA_DRY_RUN` must read true or be absent, and
   no run may carry `dry_run = false` until P8 says so.
4. Confirm `materialise-runs` at `10 0 * * *` and `tick-runs` at `* * * * *`
   exist on the linked project.
5. Nothing sets `call_runs.dry_run` in production. The global flag is the
   mechanism and the per-run override needs an operator UPDATE.
6. The post-call receipt seam stays unwired. T7.4 owns the caller.
7. Types need no work. Both copies are byte-identical to a generated file.

P8 must not run a real call until steps 1 to 4 are done. Until then the
schedule emits nothing, which is why the deployment can stay inert while the
phase closes.

## Residual risk

* **The ingestion RPC trusts its caller's pair.** PHASE F5 wrote
  `failed / answered_extracted / true` by calling it directly. `dispositionFor`
  at `ingest.ts:140` is total over the four states and is the only production
  builder, so no product path reaches this. A future caller must know.
* **The finaliser treats a synthetic `fixture:` call id as a real one.** It
  spends its three attempts on a call that cannot exist. That is part of M2 and
  it costs three GETs and no money.
* **A captured item's text can carry a digit.** Round 2 recorded the same
  channel and I did not reopen it.
* **No live CALL-E call was placed.** The poll timing, the provider's
  idempotent replay, the live re-fetch payload and webhook delivery all stay
  unpinned here.
* **CALL-E still never delivers a webhook to `orma-api.nryn.dev`.** The phase is
  re-fetch based and the poll reconciles, so nothing depends on delivery.
* **A run stranded in `claimed` has no lease and no expiry.** A human repairs
  it.
* **A lost timeline append can leave a gap.** `recordCallEvent` retries from one
  budget, and no key on `call_events` could refuse a duplicate.
* **The dry-run mask keeps the leading seven characters of a number.** That is
  the recorded design.
* **`webhook_events` grows for the life of the project.** Nothing prunes it.
* **The linked project's schedule and Vault are unreadable from here.** The
  operator's own pins cover them.

## Cleanup

`/tmp/r3e2e/cleanup.sql` deletes the three scratch profiles, their cascade, the
runs every phase created and the `evt_r3%` `webhook_events` rows. The stack then
reads exactly its baseline, which is the same reading round 2 closed on:

```
profiles=1 auth_users=1 slots=1 call_runs=1 call_events=2 items=4 mentions=3
consents=1 webhook_events=0 transcripts=1 results=1 commitments=1 vault=0
runs=40000000-0000-4000-8000-000000000001
cron=materialise-runs|10 0 * * * tick-runs|* * * * *
```

The `test-briefing.sh` runner, `test-ingest.sh` runner and the fresh migration
runner each build and destroy their own throwaway Supabase project, so they left
the shared stack untouched. The driver, its seed and its cleanup live under
`/tmp/r3e2e`, which is scratch space.

Every file T2.10 changed is byte-identical to the freeze at
`/tmp/orma-review-p2e2e-r3`, checked with `cmp` at the end of the review. I wrote
only this file. No migration, no policy, no configuration value and no seed row
changed. No status line moved and no commit was made. No call was placed. No
secret was echoed and no phone number appears in this file.
