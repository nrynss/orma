# P6: Web app

```yaml
id:       P6
size:     L
requires: [T5.3, soft P2]
blocks:   [P8]
parallel: [P2, P3, P4, P7]
```

**Goal:** The setup and review surface. Nobody is held accountable through an app, only set up through one, so this phase serves that and does not try to become the product.

**Why it builds early:** Every page reads PostgREST under the policies from T1.2. With T1.6 fixtures in place it develops against a local database with no call engine present.

**Design.** The screens live in `design/orma-app/`. Each route has a phone and a desktop artboard, and `System.dc.html` carries the tokens. The States page adds Today first run, Today during a call, Today dark, Timeline live, and Patterns not yet.

**Order.** T6.1 lands first, because it brings the app shell, the shared tokens and the local fixture harness every later page uses. T6.7 can run beside it. It shares no path with any page.

---

### T6.1: Today
```yaml
requires:   T5.3, T5.4, T1.6
fixture-ok: yes
size:       M · mid
owns:       web/src/routes/app/+page.svelte, web/src/routes/app/+page.ts, web/src/routes/app/+layout.svelte, web/src/routes/+layout.svelte, web/src/lib/ui/, web/src/lib/today/, web/src/routes/app/onboarding/profile-gate.ts, web/src/routes/app/onboarding/+page.svelte, web/src/routes/app/onboarding/check.ts, web/package.json, scripts/p6-local-stack.sh, web/src/lib/telegram-link.ts (API URL only)
status:     done
```
The landing surface after sign-in: when the next call is, what is open, and what happened on the last one.

An account with no calls yet is the common first state and must read as anticipation rather than emptiness.

**Owns expanded at claim.** See `adversarial-review/t6.1-contract-change.md`. `/app` 404s today, and login and onboarding still send a finished profile to Settings. There is no app navigation. No task owned the shell, and every later page needs it, so T6.1 brings it. It also brings the local fixture harness, because production has no calls to render.

"Cancel this call" and "Change time" link to Settings until T6.5 lands. Cancelling needs T6.7, because `call_runs` is read-only to its owner.

**Done when:** the next scheduled run shows in the profile's own timezone, the last call summary renders, and a fresh account shows a first-run state rather than blank panels. A finished profile lands on `/app` after login and after onboarding. Every signed-in page shows the app navigation.

---

### T6.2: Items ★
```yaml
requires:   T6.1
fixture-ok: yes
size:       M · mid
owns:       web/src/routes/app/items/
status:     done
```
The list, with retire and restore, and a since-date a user can set by hand.

Retiring is one click and is never punished. A list you cannot retire from becomes a wall of shame, and a wall of shame is a call you stop answering. Restore is equally easy, because that is what makes retiring safe to offer.

Show mention count and age on each item, read from `item_mentions` and `since_date`, so the numbers the call uses are visible in the place they came from.

**Done when:** retire and restore round-trip, a retired item leaves the open list and the next briefing, mention counts match the rows, and a since-date set here changes the age the call would use.

---

### T6.3: History
```yaml
requires:   T6.1
fixture-ok: yes
size:       M · mid
owns:       web/src/routes/app/history/
status:     done
```
Calls in reverse order with summary, disposition, mood and the full transcript as turns with offsets.

Mood is a small marker on each call and is not editable. It is what the call heard.

An evidence offset on a retirement links into the transcript at that moment, which is the point of recording it. The ingest writes that offset as an `item_mentions` row on the retiring run. `items` carries only `retired_at` and `retired_reason`.

**Done when:** a fixture run renders its turns in order, clicking a retirement jumps to the offset where it was said, and a run with no result still shows its transcript.

---

### T6.4: Patterns
```yaml
requires:   T6.1, soft T7.3
fixture-ok: yes
size:       M · mid
owns:       web/src/routes/app/patterns/,
            scripts/p6-local-stack.sh (fixture pattern_reports row only)
status:     claimed:T64Impl
```
Pattern reports in writing, with the mood trend across the period.

The prose comes from `pattern_reports.prose` and the numbers beside it from `facts`, shown together. Analysis over sequences is the differentiator, and showing the facts next to the sentence is what makes it credible rather than decorative.

**Done when:** a fixture report renders with its facts visible, the mood trend draws from real rows, and a user with too little history sees an honest not-yet state.

---

### T6.5: Settings and cancellation ★
```yaml
requires:   T5.4, T6.1, T6.7
fixture-ok: yes
size:       M · frontier
owns:       web/src/routes/app/settings/
status:     done
```
Phone, consent, timezone, slots, receipt channels, Telegram linking and unlinking.

Cancellation is a first-class path and a submission requirement: cancel today's call, pause all calls, or delete the account. Cancelling sets `canceled` on scheduled runs. Deleting cascades everything and says so before it happens.

Revoking consent stops dispatch immediately, which means the next tick, not the next day.

Settings already hosts the T5.3 Telegram mint and the P5 widget attach. Keep both working. A user who skipped consent at onboarding can only agree here, so the consent control must grant as well as revoke. Pausing sets every slot inactive, which the materialiser already honours by removing future runs. Cancel and delete go through the T6.7 functions, never a direct table write.

**Done when:** cancelling today removes the scheduled run, pausing stops materialisation, revoking consent blocks the next dispatch, and account deletion removes every row across all tables.

---

### T6.6: Operator timeline
```yaml
requires:   T6.1, T2.9
fixture-ok: yes
size:       S · mid
owns:       web/src/routes/app/timeline/
status:     done
```
`call_events` for your own account, in order, with the detail payloads expandable.

This is how anyone answers what happened at 8am without opening a log viewer, and it is the shot the demo video uses to show the machinery is real.

**Done when:** a completed run reads as an ordered story, a failed run names where it stopped, and no other user's events are reachable.

---

### T6.7: Owner actions in SQL
```yaml
requires:   T1.2
fixture-ok: yes
size:       S · frontier
owns:       supabase/migrations/<timestamp>_owner_actions.sql, web/src/lib/database.types.ts, supabase/functions/_shared/database.types.ts
status:     done
```
Added at the P6 claim. The browser cannot cancel a call or delete an account today. `call_runs` has only an owner read policy, and deleting `auth.users` needs more than the user's own grant.

Two `security definer` functions, callable by `authenticated` only and revoked from `public` and `anon`. Each acts on `auth.uid()` alone and takes no user id.

`cancel_call_run(run_id)` locks the row and cancels it only while it is `scheduled`. It sets state and disposition to `canceled` and writes one `call_events` row. A run already claimed stays untouched, because the claim may have dispatched. This must never race the tick into a call that rings after the user cancelled it.

`delete_my_account()` deletes the caller's `auth.users` row, and the cascades remove the rest. It must also remove anything no cascade reaches, such as the caller's audio objects in storage.

**Done when:** a second user cancelling the first user's run changes zero rows, a claimed run cannot be cancelled, a cancelled run is never claimed, and deletion leaves zero rows for that id in every table, `auth.users` and storage.

---

### T6.8: Landing page
```yaml
requires:   T5.1
fixture-ok: yes
size:       S · mid
owns:       web/src/routes/+page.svelte
status:     done
```
Added at the P6 claim. Spec §11 gives `/` what Orma is, the thesis, and one call recording, server rendered. No task owned it. The footer still reads "Not yet open for sign-ups", although T5.1 opened sign-up for judges.

The page uses a synthetic audio demo and labels it as a demo. It must not imply that a real person made the call or that the clip is production evidence.

**Done when:** a signed-out visitor gets server-rendered content with a clear way in, the closed sign-ups line is gone, and one clearly labelled synthetic call demo plays on the page.
