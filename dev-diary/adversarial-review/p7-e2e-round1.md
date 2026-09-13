# P7 e2e round 1 review

## Verdict

**REMEDIATE**

P7 lands five working seams. Traced end to end they do not yet work as one system,
because the post-call receipt still has no production caller.

| C | H | M | L |
| --- | --- | --- | --- |
| 0 | 1 | 0 | 0 |

## Scope

Range `9e9550d..HEAD` on `phase-7`, 31 files over 20 commits. Five tasks reviewed as one
system: T7.1, T7.2, T7.2a, T7.3 and T7.4. I read `AGENTS.md` in full, the P7 board,
`dev-diary/spec.md` sections 2 to 6 and 10 to 12, `dev-diary/product.md`, and every
prior P7 review round. I implemented nothing and fixed nothing. This file is my only
write.

## Independent evidence

Every proof below is my own run at `fe60d0a` on this machine.

- `bash supabase/migrations/test-facts.sh` passed in 21 seconds. Five DO blocks, rollback,
  final line `T7.1 facts acceptance passed.`
- `deno test supabase/functions/analysis/index.ts` passed 13 of 13.
- `prose.ts` suite passed 9 of 9. `vertex.ts` suite passed 9 of 9. `deliver-email.ts`
  suite passed 7 of 7. `deliver-telegram.ts` suite passed 10 of 10. `receipt.ts` suite
  passed 5 of 5.
- Voice and shared suites together passed 38 of 38, so the T7.2a done-when still holds.
- `deno check` exited 0 on `analysis/index.ts`, `analysis/prose.ts`, `_shared/receipt.ts`,
  `_shared/deliver-email.ts`, `_shared/deliver-telegram.ts`, `_shared/vertex.ts`,
  `telegram/voice_vertex.ts`, `telegram/index.ts` and `tick/index.ts`.

### Commit and documentation style

I inspected all 20 commits. Subjects follow the landed `T7.x:` and `fix(t7.x):`
convention. Bodies are empty. Added prose across the range carries zero em dashes and
zero semicolons. New markdown, comments and migration comments read clean against the
four style rules.

### Secrets, host and credential path

The range adds no secret value. The only key-looking string is the test fixture
`fixture-materialise-key`. `RESEND_API_KEY`, `RESEND_FROM`, the four Vertex names and
`ORMA_MATERIALISE_SECRET_KEY` all predate P7, so the secret inventory needs no new
entry. `supabase.co` appears in product code only inside guards that reject it. The
schedule migration posts `https://orma-api.nryn.dev/functions/v1/analysis`, never a
project host. `aiplatform.googleapis.com` and the OAuth token endpoint live in exactly
one place, `_shared/vertex.ts`. Voice and analysis prose consume that one path through
the same four environment names. No second credential convention grew.

### The traced system path

I read the full path rather than trusting task reviews. The Monday cron fires
`analysis-report` at 06:20 UTC through the front door with the Vault-backed named
`materialise` key. A missing or empty Vault value emits no request, which fails closed.
`verify_jwt = false` in the analysis block matches the landed materialise precedent, and
`withSupabase({ auth: "secret:materialise" })` validates the same named key in the
handler. For every profile the handler derives the last seven local days ending
yesterday, posts `compute_pattern_facts` as the service role, skips when
`sufficient_history` is not exactly `true`, phrases the facts with the T7.2 stage at
temperature zero, stores the report before any delivery, then hands the same validated
prose to both channels. Each helper reads its own toggle inside itself and skips with no
row. Both helpers insert the `deliveries` row before the attempt and patch `sent_at`
with a null `error` on success or `error` with a null `sent_at` on failure. A
bookkeeping patch failure never rewrites a real outcome. The committed suite pins the
storage order, both toggles, both failure shapes and profile isolation, and my run
reproduced all 13 pins. The prose validator rejects any numeral that no fact explains,
including runs from item text unless the full source text appears in the prose.

## Findings

| Sev | Where | What | Pin | Mutation |
| --- | --- | --- | --- | --- |
| H | `_shared/receipt.ts` export `deliverIngestionReceipt` beside `_shared/finalise.ts` `finaliseRun` | The post-call receipt has no production caller at phase close. `finaliseRun` is the only production caller of `ingestTerminalRun`. It records the `finalised` event and returns. Nothing sends a receipt, so no shipped path can ever insert a `deliveries` row with `kind = post_call`. After every real call Telegram stays silent, though `product.md` section 2 names the post-call summary and `spec.md` section 5 orders the receipt anyway. T7.4 passes its fixture done-when, but the phase claim that T7.4 turns a completed or failed call into a receipt holds nowhere in production. | Counted at `fe60d0a`. `deliverIngestionReceipt` is imported by `receipt_tests.ts` alone. `deliverPostCallTelegram` has no caller outside `receipt.ts`. The only production write path for `kind = post_call` is unreachable. | Wire the call in `finaliseRun` and revert it. Every real call then ends with no receipt and no `post_call` row, and `receipt.ts` returns to zero non-test importers. |

### Judgement, who owns the missing call

This is both a known cross-phase contract gap and a live phase finding. `p2-e2e-round1.md`
item 2 and `p2-e2e-round2.md` item 6 recorded the unwired seam while T7.4 was pending.
The T7.4 board handoff says T2.7 must call `deliverIngestionReceipt` right after
ingestion and that the call site sits outside the T7.4 owns line. `t7.4-round1.md`
recorded the same gap. While a board task still owned the call, the item could ride as
handoff residue. T7.4 has now landed and the seam is still unwired, so the phase closes
with the behaviour unreachable and no task owns the call. That converts the handoff item
into a phase finding.

Ownership is nameable. The T7.4 handoff assigns the call to the ingestion completion
path, which is T2.7's contract. In production that path runs inside `finalise.ts` after
`ingestTerminalRun` commits, and `finalise.ts` plus `tick/index.ts` sit on T2.7a's owns
line. Both tasks are landed and marked done. Only the orchestrator can reopen one or
authorize the seam edit. AGENTS routes a genuinely blocked task to a finding, never to a
cut.

### Fix shape

One discrete wiring closes it. In `finaliseRun`, after the `finalised` event records,
call `deliverIngestionReceipt` with the ingested structured result and a
`resolveRetiredText` callback over `items` through `ORMA_API_URL`. Thread the Telegram
bot token into the finalise deps, since `CalleDeps` carries none today. Guard the call
so a receipt failure logs and never fails the finalise. The replay branch deserves one
thought, because a run ingested by a crashed attempt returns early today.

## False positives I rejected

**A failed analysis run leaves no operator trace, since the cron discards the response
body.** True and observed. No specification line asks analysis to write `call_events`.
Channel failures are recorded in `deliveries` and pre-storage failures name their error
in the response. A residue note, not a finding on this diff.

**`readProfiles` paginates nothing.** PostgREST row caps bind at a scale nobody can name
today. The T7.3 review adjudicated the same serial-processing concern as unprovable.

**A same-week manual re-run would duplicate a report.** No shipped path retries the
cron. Adjudicated in the T7.3 review and unchanged here.

**A Resend 200 with a non-JSON body records a failure though mail went out.** Needs
Resend to break its documented response. Inherited tolerance, adjudicated already.

**A bookkeeping patch failure after a send leaves the row without `sent_at`.**
Deliberate and commented. Both channels behave alike and the caller still sees `sent`.

**A question mark in any resolved item text would throw before any deliveries row.**
Pre-existing seam semantics of the T3.4 guard. T7.4's round 1 recorded it. The path has
no production caller, so the exposure stays unreachable until the finding above is
fixed.

**`analysis/index.ts` imports the test helper `testServiceAccountJson` into a production
entry.** The import serves the colocated suite under the established
`!import.meta.main` convention. `prose.ts` pulls the same module regardless.

**The pattern channel skips CTA enforcement.** Deliberate and recorded in
`t3.4-contract-change.md`. T7.2 owns report prose.

**T7.1 facts adjudications.** Canceled-only days count as observed, `answered_runs`
filters disposition only, and a canceled run with a mood would count. All adjudicated in
both T7.1 rounds. The SQL is byte-identical since its approval.

**Board honesty.** I looked for a dishonest claim and found none. Five tasks read done,
each owns line grew only to cover its test file, and the T7.2a block arrived with its
authorized contract note. The T7.4 handoff states the missing caller requirement in
plain text, so the board hides exactly nothing. The defect is the unwired call, not a
false claim.

**Offline done-when.** T7.1 reproduces every facts field by hand and denies a two-day
account. T7.2 catches invented numbers and returns nothing unvalidated. T7.2a passes all
29 voice tests unchanged and pins its own auth path. T7.3 stores before delivering,
honours both toggles and records both outcomes, all pinned offline. T7.4 names captures,
retirements and commitments and hides extraction failure, all pinned offline. No task
needs a live call, and every task declares `fixture-ok: yes`.

## Residue against prior rounds

- T7.1 round 2 APPROVE: zero residue. My own harness run passed. No finding reopened.
- T7.2 round 2 APPROVE: zero residue. The suite passes 9 of 9 and the text-run rule
  stands in the code I read.
- T7.2a round 2 APPROVE: zero residue. 38 combined tests pass. One URL builder, one
  token endpoint, one re-export binding.
- T7.3 round 1 APPROVE: zero residue at its seam. The flow, the toggles and the
  delivery bookkeeping hold exactly as approved.
- T7.4 round 1 APPROVE: zero residue at its seam. Its recorded contract gap survives
  into this round and is the single finding above.

## Done-when for this round

The phase diff is fully traced, every named proof was run by me, the integration risk
named in the brief is judged with an owner attached, and the verdict follows the rule
that APPROVE demands zero findings at every severity. One H finding stands, so the
verdict is REMEDIATE.
