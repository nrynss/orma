# P6 e2e round 1 review

## Verdict

**REMEDIATE**

P6 lands eight working seams. Traced end to end they behave as one system. The only defects are overlong sentences in three handoff files.

| C | H | M | L |
| --- | --- | --- | --- |
| 0 | 0 | 0 | 3 |

## Scope

HEAD is `f00c396` on `main`. All eight P6 tasks read done. I read `AGENTS.md` in full, the P6 board, `dev-diary/spec.md` sections 2, 7, 11 and 13, `dev-diary/product.md` sections 1 to 3 and 6, and every prior P6 review round. I implemented nothing and fixed nothing. This file is my only write.

## Independent evidence

Every proof below is my own run on this machine against the current tree. I masked all phone numbers. I placed no live calls.

- `scripts/p6-local-stack.sh up` applied all migrations plus the seed and started five `orma-p6-local` containers. The other stacks stayed up.
- `scripts/p6-local-stack.sh down` left zero `orma-p6-local` containers and no workdir. `supabase_db_stack`, `orma-p2-rest` and every `orma-t1-6-r2` container stayed up. No dev process remains.
- `cd web && npm run check` passed all six node checks plus svelte-check with 326 files, zero errors and zero warnings. That run includes the secret key check.
- `cd web && npm run build` exited 0 and wrote `_worker.js`. A scan of the Cloudflare output found no secret key material. The only client bundle hit for the key prefix pattern is the supabase-js prefix test.
- Dev server ran from `web` with the full stack env on port 58329. Signed out, `/` and `/login` answered 200 and every `/app` route answered 303 to `/login`. Signed in as `local@example.com`, every `/app` route answered 200 and `/login` answered 303 to `/app`.
- Landing SSR body is 10484 bytes. It carries the thesis lede, three `href="/login"` targets, one `Synthetic demo` label with its subline, zero `Not yet open` matches and zero spinner markers.
- Seed SQL gave 7 runs (4 completed, 1 canceled, 1 scheduled, 1 awaiting result), 2 call events, 1 pattern report, 8 open items and 5 mention rows. Open counts per item are 1, 1, 1 and 0 with ages 34, 21, 8 and 2 days. The report facts read period 7 days, 4 completed runs, 4 answered runs and one mood each of energised, ok, low and stressed.
- Signed in as the seed account, `/app` showed one app nav, zero shell bars and `aria-current` on Today only. It showed Next call Tomorrow 08:00, last call Answered with 3 mentions, one Committed line at 0:08 and Open 4 with exactly the SQL counts and ages.
- Client side moves to Items, History, Patterns, Timeline and Settings each showed one app nav, zero shell bars and `aria-current` on exactly the current entry. Today marks only on `/app` exactly, per `isCurrentNav` plus the live pins.
- History at `?run=40000000-0000-4000-8000-000000000001&t=8` expanded the seed run and marked the 0:08 turn with `data-turn-mark`. It showed retired 0, committed 1, captured 0 and mentions 3, matching Today through the shared `lastCallSummary`. Turns render at 0:00 then 0:08. Runs without results show the honest line.
- On Items I clicked Retire on the first card. The list moved from Open 4 to Open 3 and Retired 1, and the retired card kept `1 mention` with 34 days. I then clicked Restore. The list returned to Open 4 and Retired 0 with all counts intact.
- Patterns showed the 7 day prose with 4 answered calls and four moods at 1 each, the Telegram sent line, the mood trend and the facts beside the prose. `firstrun@example.com` reads zero reports over PostgREST, so it takes the not yet branch. One pattern delivery row exists with a sent timestamp and no run id, matching the sent line.
- Timeline showed the seed completed run with dispatched then finalised in `(at, id)` order and profile zone clocks at 15:24 for 09:54 UTC. Cross user reads returned zero rows for runs, events and an explicit foreign user filter. Live `awaiting_result` state renders on the call header.
- Settings rendered consent, pause and resume, slot editing, Telegram mint and unlink, the DELETE gated deletion copy and the no scheduled call today note. Cancellation calls `cancel_call_run` and deletion calls `delete_my_account` and nothing else. A grep over `web/src` finds no direct `call_runs` write from any browser path, only reads plus generated types.
- As `firstrun@example.com` I called `cancel_call_run` on the seed scheduled run. It returned false and the run stayed scheduled, so a second user changes zero rows.
- A fresh signup confirmed over SQL signed in and landed on `/app/onboarding`. `submitOnboarding` wrote the profile, one live consent and one active slot. `/app` then showed the first run state with Welcome and Tomorrow 08:00.
- `web/static` holds only `robots.txt`. The only phone shaped strings in web sources are E.164 fixtures inside the onboarding node check script, never rendered. My probe number lived only in the destroyed harness database.

## Findings

| Sev | Where | What | Pin | Mutation |
| --- | --- | --- | --- | --- |
| L | `dev-diary/adversarial-review/t6.3-handoff.md` verification paragraph | One instruction sentence runs 41 words, above the 30 word limit. | Strip fenced code blocks and inline code from the file, split on sentence stops and count words. The Today to History verification sentence counts 41. | Rejoining the split sentences brings back the 41 word sentence and the same scan fails again. |
| L | `dev-diary/adversarial-review/t6.4-handoff.md` loader, render, fixture and trend paragraphs | Four sentences run 32, 38, 49 and 36 words, above the 30 word limit. | Same scan as above. Four sentences fail, with the 49 word fixture sentence the longest. | Rejoining any split sentence brings back its violation and the same scan fails again. |
| L | `dev-diary/adversarial-review/t6.6-handoff.md` steps and picker paragraphs | Two sentences run 33 and 35 words, above the 30 word limit. | Same scan as above. The step sentence and the picker sentence both fail. | Rejoining either split sentence brings back its violation and the same scan fails again. |

Ownership is nameable. T6.3 owns its handoff, T6.4 owns its handoff and T6.6 owns its handoff. All three fixes touch prose only, so the orchestrator may close them directly in the landing commit with no code change and no re review. Confirming each fix needs reading only.

## False positives I rejected

**E.164 fixtures in the onboarding check script look like real phone numbers.** They are validation fixtures in a node check script. No page renders them. The settings and onboarding pages render only the signed in user number from their own row.

**Semicolons in the T6.6 handoff look like prose violations.** All three sit inside SQL code blocks. They are code punctuation, not sentences.

**The Today cancel control is missing on the seed Settings page.** Correct behavior. The seed scheduled run sits tomorrow, so no scheduled call exists today and the page says so. The cancel RPC path stays pinned by code and by the false return above.

**Programmatic tab moves to History aborted with ERR ABORTED.** Harness artifact of the automation driver. Direct entry to the same URL renders fully, curl returns 200 and the deep link pin above passed.

**A blank render appeared once mid navigation.** Transient automation snapshot. Reload showed the full page with session intact, and every later pin re rendered cleanly.

**My synthetic Start button clicks never submitted onboarding.** My clicks missed the control state. Calling the same `submitOnboarding` the page calls succeeded, wrote all three rows and `/app` rendered the first run state. The page wires `onsubmit` to that function and the node check pins the `/app` landing.

**Review files carry their own style marks.** The T6.4 round titles use em dashes, three sentences use semicolons and one T6.2 table uses dash placeholders. Review records are frozen and no task owns them, so they ride as residue notes rather than findings.

**No failed run exists in the current database.** The drift row from earlier rounds is gone. The stopped run naming stays pinned by code presence, recorded under residue for T6.6.

## Residue against prior rounds

- T6.1 round 1 REMEDIATE with 5 findings: zero residue. Round 2 APPROVE re pinned every fix. My runs confirm the retired line rule, the consent block, the strict check, the local API URL with zero production reads from Settings paths, and the briefing order branch.
- T6.1 round 2 APPROVE: zero residue. Guards, isolation, polling behavior and error states hold as approved. My signed in and signed out status pins match.
- T6.2 round 1 REMEDIATE with 1 finding: zero residue. Round 2 APPROVE closed the retired count branch. My live retire pin shows the retired card keeps its measured count.
- T6.2 round 2 APPROVE: zero residue. Open and retired counts match `item_mentions` rows in my runs, and restore returns the item with history.
- T6.5 round 1 APPROVE: zero residue at its seam. Cancel and delete go only through the owner RPCs, consent grant and revoke shape dispatch on the next tick, pause writes every owned slot, and Telegram flows stay present. My cross user cancel pin adds a fresh zero row proof.
- T6.7 round 1 APPROVE: zero residue at its seam. Both functions derive the caller from `auth.uid`, take no user id and stay revoked from public and anon. The false return above exercises the owner lock from the other side.
- T6.3 round 1 REMEDIATE with 1 finding: zero residue. Round 2 APPROVE removed the dead items fetch. My grep finds no standalone items fetch in the history loader.
- T6.3 round 2 APPROVE: zero residue. Turn order, deep link expansion, turn marking, honest no result lines and isolation all re pinned live above.
- T6.4 round 1 REMEDIATE with 1 finding: zero residue. Round 2 APPROVE restored the live briefing line. My Today live branch and briefing order pins confirm the fixture seam holds.
- T6.4 round 2 APPROVE: zero residue. Facts keys, prose integers, trend points, not yet honesty and the sent line all re pinned live above.
- T6.6 round 1 APPROVE: zero residue, with one stated limit. Ordered steps, zone clocks, kind glosses and cross user zero rows all re pinned. The failed run naming passes by code presence only, since no failed row exists today. That matches the approved code path finding.
- T6.8 round 1 APPROVE: zero residue. SSR bytes, the labelled synthetic demo, the removed closed line and the login targets all re pinned live above.

## Done-when for this round

Every seam in the brief was traced with my own runs. Every pin names its measurement. Each finding names its owner task. The verdict follows the rule that APPROVE demands zero findings at every severity. Three L findings stand, all prose only and all eligible for the direct documentation close. The verdict is REMEDIATE.
