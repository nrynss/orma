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

---

### T6.1: Today
```yaml
requires:   T5.3, T1.6
fixture-ok: yes
size:       M · mid
owns:       web/src/routes/app/+page.svelte
status:     not-started
```
The landing surface after sign-in: when the next call is, what is open, and what happened on the last one.

An account with no calls yet is the common first state and must read as anticipation rather than emptiness.

**Done when:** the next scheduled run shows in the profile's own timezone, the last call summary renders, and a fresh account shows a first-run state rather than blank panels.

---

### T6.2: Items ★
```yaml
requires:   T6.1
fixture-ok: yes
size:       M · mid
owns:       web/src/routes/app/items/
status:     not-started
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
status:     not-started
```
Calls in reverse order with summary, disposition, mood and the full transcript as turns with offsets.

Mood is a small marker on each call and is not editable. It is what the call heard.

An evidence offset on a retirement links into the transcript at that moment, which is the point of recording it.

**Done when:** a fixture run renders its turns in order, clicking a retirement jumps to the offset where it was said, and a run with no result still shows its transcript.

---

### T6.4: Patterns
```yaml
requires:   T6.1, soft T7.3
fixture-ok: yes
size:       M · mid
owns:       web/src/routes/app/patterns/
status:     not-started
```
Pattern reports in writing, with the mood trend across the period.

The prose comes from `pattern_reports.prose` and the numbers beside it from `facts`, shown together. Analysis over sequences is the differentiator, and showing the facts next to the sentence is what makes it credible rather than decorative.

**Done when:** a fixture report renders with its facts visible, the mood trend draws from real rows, and a user with too little history sees an honest not-yet state.

---

### T6.5: Settings and cancellation ★
```yaml
requires:   T5.4
fixture-ok: yes
size:       M · frontier
owns:       web/src/routes/app/settings/
status:     not-started
```
Phone, consent, timezone, slots, receipt channels, Telegram linking and unlinking.

Cancellation is a first-class path and a submission requirement: cancel today's call, pause all calls, or delete the account. Cancelling sets `canceled` on scheduled runs. Deleting cascades everything and says so before it happens.

Revoking consent stops dispatch immediately, which means the next tick, not the next day.

**Done when:** cancelling today removes the scheduled run, pausing stops materialisation, revoking consent blocks the next dispatch, and account deletion removes every row across all tables.

---

### T6.6: Operator timeline
```yaml
requires:   T6.1, T2.9
fixture-ok: yes
size:       S · mid
owns:       web/src/routes/app/timeline/
status:     not-started
```
`call_events` for your own account, in order, with the detail payloads expandable.

This is how anyone answers what happened at 8am without opening a log viewer, and it is the shot the demo video uses to show the machinery is real.

**Done when:** a completed run reads as an ordered story, a failed run names where it stopped, and no other user's events are reachable.
