# P2: Call engine

```yaml
id:       P2
size:     XL
requires: [P1]
blocks:   [P7, P8]
parallel: [P3, P4, P5, P7]
```

**Goal:** Place the right call at the right time, exactly once, with a briefing assembled from the database, and turn what comes back into rows.

**Why this phase dominates:** Everything else in the submission is scaffolding around this. It is also the only track that has to run for days before submission, so it starts first and finishes first.

---

### T2.1: Materialise runs ★
```yaml
requires:   T1.1
fixture-ok: yes
size:       M · mid
owns:       supabase/functions/materialise/index.ts
status:     not-started
```
A nightly job that writes the next 48 hours of `call_runs` from active slots, converting `local_time` in the profile's timezone into an absolute `scheduled_for`.

Materialising rather than computing due-ness on the fly means the schedule is visible in the UI, a slot change has an obvious effect, and daylight and travel changes resolve once instead of on every tick.

The idempotency key is built here and stored before anything is dispatched, as the CALL-E API requires: `orma:{user_id}:{local_date}:{part_of_day}:v1`. Materialising twice must not produce two rows, which the unique constraint enforces.

Schedule it with `pg_cron` at 00:10 UTC.

**Done when:** a profile in `Asia/Kolkata` with an 08:00 slot produces a run at the correct instant, running the job twice produces no duplicate, and a slot deactivated mid-window removes only future runs.

---

### T2.2: Briefing assembly ★
```yaml
requires:   T1.1
fixture-ok: yes
size:       L · frontier
owns:       supabase/functions/_shared/briefing.ts
status:     not-started
```
The heart of the product. Given a user and a moment, produce the scalar variables the Goal expects.

All of it is SQL. `open_count` is a count. Mention counts come from `item_mentions`. Ages come from `since_date` where the user gave one and from `created_at` where they did not. `lead_line` is rendered from those numbers into a sentence before the request is built.

The model never derives a number. It phrases what this function computed. If "three times" appears on a call, three rows in `item_mentions` produced it.

Ordering follows `product.md` §3. The lead is one or two things the user did not know: overdue, repeated, or aged. The walk is brief and not the whole list.

Store the assembled object on `call_runs.briefing` before dispatch, so any claim made on a call traces back to the rows that produced it.

**Done when:** a fixture user with a four-mention item 34 days old yields the expected `lead_line` verbatim, every variable is a string, number or boolean with no nesting, and a golden test pins the rendering.

---

### T2.3: Tick and claim ★
```yaml
requires:   T1.1, T2.1
fixture-ok: yes
size:       M · frontier
owns:       supabase/functions/tick/index.ts
status:     not-started
```
The minute loop. Claim due runs with `FOR UPDATE SKIP LOCKED`, move them to `claimed`, and hand them to the dispatcher.

The claim is the first half of the exactly-once guarantee. Two ticks overlapping must be harmless, which is the whole reason the claim lives in SQL rather than in a lock held by a process.

The same tick advances runs whose `poll_after` has passed and finalises runs that reached a terminal state.

Schedule it with `pg_cron` every minute.

**Done when:** a test fires two ticks concurrently against the same due run and exactly one claim succeeds, and a tick with nothing due completes without touching a row.

---

### T2.4: Dispatch to CALL-E ★
```yaml
requires:   T1.4, T1.5, T2.2, T2.3
fixture-ok: yes
size:       L · frontier
owns:       supabase/functions/_shared/calle.ts
status:     not-started
```
The client. `POST /v1/goals/{goal_id}/runs` with the phone number, the assembled variables, and the `Idempotency-Key` header carrying the key stored in T2.1.

Record `calle_goal_run_id`, `calle_call_id` and the `run_spec` the run pinned, so a call can be read against the exact interface it was placed under even after the Goal is republished.

A 409 means the key was reused with different inputs. That is a bug. Log it loudly, leave the run in a state a human can see, and never retry with a fresh key.

Refuse to dispatch for a profile without a live `outbound_calls` consent and a confirmed number. The check belongs here, at the last moment before the call, not only in the UI.

**Done when:** dispatch against a mock returns a run id and pins the spec, a replayed key returns the original run rather than placing a second call, a 409 surfaces as a visible failure, and a profile without consent is refused with a recorded reason.

---

### T2.5: Poll reconciliation ★
```yaml
requires:   T2.4
fixture-ok: no
size:       M · mid
owns:       supabase/functions/_shared/poll.ts
status:     not-started
```
Webhooks get dropped. Polling is the safety net that makes that survivable.

A run entering `awaiting_result` gets `poll_after` set 60 seconds out, then 10 seconds per pass. The tick advances it. Follow-up crosses tick boundaries rather than sitting in a loop, because a free Edge Function allows 150 seconds of wall clock and 2 seconds of CPU per request.

Whichever of the webhook and the poll arrives first wins. The other is a no-op.

This task needs one live call to prove the timing against the real service.

**Done when:** a live call reaches a terminal state through polling alone with the webhook deliberately unregistered, and a second run proves the poll is a no-op when the webhook won.

---

### T2.6: Webhook receiver ★
```yaml
requires:   T1.4, T2.4
fixture-ok: yes
size:       M · frontier
owns:       supabase/functions/calle-webhook/index.ts
status:     not-started
```
CALL-E webhooks carry no signature. The only identifier is a `CALL-E-Event-Id` header, which is a de-duplication key and not authentication. The body is therefore a notification and never a fact.

Four steps, in order:

1. Reject unless the request carries `ORMA_WEBHOOK_SECRET` in the path.
2. Insert the event id into `webhook_events`. A conflict means it was seen before: return 200 and stop.
3. Re-fetch the authoritative run from CALL-E with the bearer token.
4. Act only on what the re-fetch returned.

No item, call or billing state is ever mutated from body content. Event types are `call.completed`, `call.failed` and `call.result_validation_failed`.

**Done when:** a replayed fixture event is a no-op, a request without the secret is rejected, a body hand-edited to retire a different user's item changes nothing, and the three event fixtures each drive the correct re-fetch.

---

### T2.7: Result ingestion ★
```yaml
requires:   T1.5, T2.6
fixture-ok: yes
size:       XL · frontier
owns:       supabase/functions/_shared/ingest.ts
status:     not-started
```
Turn a terminal run into rows, in one transaction.

Write `transcripts` and `results`. Write the disposition per `spec.md` §3. Copy `mood` onto the run.

From a valid `structured_result`:

* `captured_items` become new `items` with `source = 'call'`.
* `retired_items` set `status = 'retired'`, `retired_at` and `retired_reason`, and require an evidence offset. Retiring is destructive and must stay inspectable.
* `commitments` are rows with their evidence offset and a possibly null `due`.
* `slot_change_requested` is a proposal only. Orma owns the slot and confirms the change itself; extraction never writes `slots`.
* Every item named on the call gets a row in `item_mentions` with its offset. This is what makes tomorrow's count real.

On a null result, fall back to the raw transcript for analysis, mark the run `answered_no_result`, and continue to the receipt anyway. The user never learns that extraction failed.

**Done when:** the completed fixture produces the expected items, mentions, retirements and commitments; the invalid fixture writes a transcript and a disposition and no partial state; a retirement without an evidence offset is rejected; and re-ingesting the same run twice changes nothing.

---

### T2.8: Dry-run mode ★
```yaml
requires:   T2.4
fixture-ok: yes
size:       M · mid
owns:       supabase/functions/_shared/dispatch-mode.ts
status:     not-started
```
A first-class mode, not a flag bolted on for the submission checklist.

Set per run on `call_runs.dry_run` and globally by `ORMA_DRY_RUN`, which defaults to true. In dry mode the dispatcher assembles the exact request body, writes it to `call_events`, synthesises a terminal state from a chosen fixture, and calls nobody.

This is how the pipeline is rehearsed and how the demo is tested without spending a call.

**Done when:** a full run completes end to end in dry mode producing items and mentions, the recorded body matches what live dispatch would send byte for byte, and no outbound request is made.

---

### T2.9: Operator timeline
```yaml
requires:   T2.3
fixture-ok: yes
size:       S · mid
owns:       supabase/functions/_shared/events.ts
status:     not-started
```
Write a `call_events` row at every transition: materialised, claimed, dispatched, polled, webhook received, re-fetched, ingested, finalised. Include enough detail to answer what happened without opening the logs.

Supabase logs are organised per invocation and a single call spans several, so this table is the only place the whole story is legible. It is also the demo video's one shot of visible machinery.

**Done when:** a completed run reads as an ordered story from materialisation to delivery, and a failed run names where it stopped.
