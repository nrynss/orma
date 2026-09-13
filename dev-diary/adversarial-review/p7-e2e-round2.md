# P7 phase e2e round 2 review

## Verdict

**APPROVE**

The round1 finding is closed. I proved the closure myself by tracing the wiring
and by mutating it three ways. The six tasks now behave as one system.

| C | H | M | L |
| --- | --- | --- | --- |
| 0 | 0 | 0 | 0 |

## Scope

Range `fe60d0a..HEAD` is six commits over eight files. Five carry the T7.5 loop
and the round1 review diary. Three carry product code, all on the T7.5 owns
line, which is `_shared/calle.ts`, `_shared/finalise.ts` and
`tick/index.ts`. I read `AGENTS.md` in full, the P7 board, the round1 review,
both T7.5 reviews, the remediation diary, and the full receipt path with its
suite. I implemented nothing and fixed nothing. This file is my only write.

## Independent evidence

Every proof below is my own run at `c526e71` on this machine.

- `bash supabase/migrations/test-facts.sh` passed in 21 seconds. Five DO
  blocks, rollback, final line `T7.1 facts acceptance passed.`
- Suite counts, all green on my runs. Analysis 13 of 13. Prose 9 of 9. Vertex
  9 of 9. Email 7 of 7. Telegram seam 10 of 10. Receipt 5 of 5. Finalise 88 of
  88. Tick 101 of 101. Calle 50 of 50. Ingest 15 of 15. Events 6 of 6. Poll 21
  of 21. Dispatch mode 13 of 13. Voice files together 145 of 145. Telegram
  entry 39 of 39.
- `deno check` exited 0 on all fourteen function entries. That covers the
  analysis entry and prose, receipt, email, telegram, vertex, finalise, calle,
  voice, tick, calle-webhook, materialise and mcp entries.
- I inspected every commit in the range. `306a012` adds only the round1
  review. `03e454d` is the T7.5 wiring. `1debafc` and `5de5131` add the two
  T7.5 review diaries. `c93cbff` adds the generic fallback plus its remediation
  diary. `c526e71` adds only the T7.5 board block. Commit subjects follow the
  landed `T7.x:` and `fix(t7.x):` convention. Bodies are empty.

## Zero residue against round 1, proven by me

Round1 carried C0 H1 M0 L0. The single H said `deliverIngestionReceipt` had no
production caller, so no shipped path could insert a `post_call` delivery.

The trace. The tick claims a terminal run and calls `finaliseStep`, which calls
`finaliseRun`. That re-fetches the call, hands the payload to
`ingestTerminalRun`, returns early on `alreadyIngested`, appends the
`finalised` event, and only then awaits `sendPostCallReceipt`. The wrapper
skips at once when no bot token is threaded. Otherwise it calls
`deliverIngestionReceipt` with the structured result and a `resolveRetiredText`
callback that reads `items` through the guarded `apiBase` over `ORMA_API_URL`.
The seam extracts captured, retired and committed texts, refuses unsafe text
before the profile read and before any row, inserts the `deliveries` row,
sends, and marks the outcome. A refusal is caught in the wrapper, which retries
once with `structured: null` so the seam sends its honest generic body. Any
other failure logs the run id and the message and swallows, so the run stays
finalised. Production threads `TELEGRAM_BOT_TOKEN` through `depsFromEnv` in
`calle.ts`, and `tick/index.ts` builds its deps from that same function.

The mutations. I copied the tree to throwaway directories under `/tmp` and
mutated each copy, so the worktree never changed. I verified the worktree hash
of `finalise.ts` against `HEAD` afterwards. It matches
`b1d809db48c3c9da3d54417d3d4cb4629afe3f35314f46ea9c8a4a7cf4cbc5f0`.

1. I removed the `sendPostCallReceipt` call from `finaliseRun`. Four finalise
   receipt pins failed, the safe-naming pin among them, and the tick
   healthy-sibling pin failed with it. The production caller is load-bearing.
2. I made `isCtaRefusal` return false. Exactly one pin failed, `unsafe user
   text still sends one generic post_call receipt`. The fallback is
   load-bearing.
3. I removed the `alreadyIngested` early return. Both replay pins failed, the
   no-second-timeline-row pin and the zero-receipt-traffic pin. Replay
   suppression is load-bearing.

The brief pins, each one checked against code I read and suites I ran.

- One production receipt for a successful non-replay finalise. The safe-naming
  pin asserts one Telegram send, one `post_call` row before the send, resolved
  item texts in the body, `select=text` reads over the service role, and the
  sent patch. Green at 88.
- No receipt on a replay. The replay pin asserts zero items, profiles,
  deliveries and Telegram requests. Green, and my mutation 3 proves the early
  return is what holds it.
- Resolved item texts. The pin names the captured text and both resolved
  texts. Green.
- Unresolved-id suppression. A missing row resolves to null and the pin
  asserts no raw id and `Retired: none`. Green.
- Failure isolation. The Telegram 500 pin keeps the ingest disposition, the
  `finalised` row, and the error text on the row. The profiles 503 pin keeps
  the run finalised and writes no deliveries row. Both green.
- The unsafe-text fallback. One refusal, one retry, one generic send, one row
  whose payload carries the generic body and none of the refused text, one
  sent patch, the `finalised` row standing, and ingestion never repeated. All
  pinned in one test. Green, and my mutation 2 proves it live.
- The no-CTA contract. `assertNoCta` still runs first for every post-call
  body. The generic body matches no marker. The refusal still precedes the
  profile read, so the retry cannot duplicate a row.
- Production threading and named-env failure. `depsFromEnv` requires
  `TELEGRAM_BOT_TOKEN` and fails with `missing TELEGRAM_BOT_TOKEN`. The
  threading pin and the named-failure pin are green. Tick builds its deps from
  the same function, and the tick suite is green at 101.

## The whole system, rechecked

- **Scheduled analysis path.** The analysis entry, prose, vertex, email,
  telegram seam and the schedule migration are byte-identical across
  `fe60d0a..HEAD`. The round1 trace stands. My reruns keep every pin green.
- **Both channels, toggles, report storage.** The analysis suite pins storage
  before delivery, each channel reading its own toggle inside itself, and both
  outcome shapes. Green at 13.
- **Post-call path.** Traced and mutated as above.
- **Board honesty.** Six tasks read done. The T7.5 block requires `T7.4` and
  `T2.7a`, both landed. Its owns lines match the diff. The tick changes sit
  inside test blocks, and the calle threading is exactly the shape the round1
  fix prescribed. Nothing on the board hides a gap.
- **Commit style.** Six subjects conform. Bodies are empty. Added markdown and
  added comments carry zero semicolons and zero em dashes.
- **Secrets.** The range adds no secret name and no secret value. The only
  token literal is the pre-existing `fixture-bot-token` test constant.
  `TELEGRAM_BOT_TOKEN` predates the range in `.env.example`,
  `.github/workflows/_env-example.yml` and `scripts/bootstrap-env.sh`.
- **Hosts.** The items read rides the `apiBase` guard that rejects a project
  host. Receipt traffic rides `ORMA_API_URL` and `api.telegram.org`. The diff
  adds no host.
- **One Vertex credential path.** The vertex files are untouched in the range.
  Analysis prose and voice still share `_shared/vertex.ts` and its four
  environment names.
- **Offline done-when.** Every P7 task declares `fixture-ok: yes` and its
  offline pins pass on my runs. No task needs a live call.

## Findings

None at any severity, so the where, what, pin and mutation table has no rows.

## False positives I rejected

**A crash between the finalised append and the receipt send loses the receipt
forever, because a replay returns early.** True of the design. The board pins
that a replay must not send a second receipt, and the alternative risks the
double send this repository treats as embarrassing. At-most-once receipts are
the deliberate contract.

**A permanently lost finalised append loses the receipt with it.** Deliberate
ordering. The board places the receipt after the timeline row, and a lost
append is named on the run row. Adjudicated in `t7.5-round1.md`.

**The generic receipt prints none for a run that captured.** The round2 brief
names this honest generic receipt as the prescribed behaviour. It invents
nothing and reveals nothing. Adjudicated in `t7.5-round2.md`.

**The refusal is detected by message equality across two files.** The seam sits
outside the T7.5 owns line, so a typed error needed a contract change. The
fallback pin fails if either side drifts. Adjudicated in `t7.5-round2.md`.

**A rejected Telegram fetch can write a URL into `deliveries.error`.** True of
the seam, landed in T3.4 and byte-identical in this range. Recorded as residue
in `t7.5-round1.md`. Not introduced by this patch.

**The wrapper ignores the `DeliverResult` status.** A send failure is recorded
on the row inside the seam, and a wrapper retry could double-send. The
fire-and-forget contract is deliberate. Adjudicated in `t7.5-round2.md`.

**One PostgREST read per retired or committed id.** Serial and unbounded by
nothing a caller controls today. The same shape was adjudicated unprovable in
the T7.3 review and again in `t7.5-round1.md`.

**Tick now fails startup without `TELEGRAM_BOT_TOKEN`.** That is the prescribed
named-env failure. The name predates the range and the telegram entry already
required it.

**A failed or canceled call also receives a receipt.** The T7.4 sentence says a
run with no result still sends one. The generic body reveals no failure.
Adjudicated in `t7.5-round2.md`.

## Residue against prior rounds

- Round1 `p7-e2e-round1.md` REMEDIATE, one H. Closed and proven by my own trace
  and three mutations. Zero residue.
- T7.1 round 2 APPROVE. The facts SQL is untouched since its approval and my
  harness run passed. Zero residue.
- T7.2 round 2 APPROVE. Prose 9 of 9 and the file is untouched in the range.
  Zero residue.
- T7.2a round 2 APPROVE. Vertex 9 of 9 and voice green at 145. Untouched in
  the range. Zero residue.
- T7.3 round 1 APPROVE. Analysis 13 of 13, email 7 of 7, telegram seam 10 of
  10. The delivery files and the schedule migration are untouched. Zero
  residue.
- T7.4 round 1 APPROVE. Receipt 5 of 5 and `receipt.ts` is untouched. Zero
  residue.
- T7.5 round 2 APPROVE. Finalise 88 of 88, tick 101 of 101, calle 50 of 50.
  My three mutations reproduce its pins. Zero residue.

## Done-when for this round

The remediation range is fully traced, every named proof was run by me, the
round1 finding is proven closed by mutation, and zero findings stand at every
severity with proven zero residue. The verdict is APPROVE.
