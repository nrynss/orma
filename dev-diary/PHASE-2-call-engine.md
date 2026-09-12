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
owns:       supabase/functions/materialise/index.ts, supabase/migrations/20260912150000_schedule_materialise.sql, supabase/config.toml, .env.example, .github/workflows/_env-example.yml, scripts/bootstrap-env.sh
status:     done
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
owns:       supabase/functions/_shared/briefing.ts, supabase/migrations/20260912160000_briefing.sql, supabase/migrations/test-briefing.sh
status:     done
```
The heart of the product. Given a user and a moment, produce the substitutions the task template in [docs/calle-call.md](../docs/calle-call.md) expects: `user_name`, `lead_line`, `open_items`, `last_call_summary` and `slot_local_time`.

All of it is SQL. `open_count` is a count. Mention counts come from `item_mentions`. Ages come from `since_date` where the user gave one and from `created_at` where they did not. `lead_line` is rendered from those numbers into a sentence before the request is built.

The model never derives a number. It phrases what this function computed. If "three times" appears on a call, three rows in `item_mentions` produced it.

Ordering follows `product.md` §3. The lead is one or two things the user did not know: overdue, repeated, or aged. The walk is brief and not the whole list.

Store the assembled object on `call_runs.briefing` before dispatch, so any claim made on a call traces back to the rows that produced it.

**Done when:** a fixture user with a four-mention item 34 days old yields the expected `lead_line` verbatim, the rendered task matches the template step for step, and a golden test pins it.

---

### T2.3: Tick and claim ★
```yaml
requires:   T1.1, T2.1
fixture-ok: yes
size:       M · frontier
owns:       supabase/functions/tick/index.ts, supabase/migrations/20260912161000_tick.sql, supabase/migrations/test-tick-claims.sh
status:     done
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
owns:       supabase/functions/_shared/calle.ts, supabase/functions/tick/index.ts, supabase/migrations/20260912170000_schedule_tick.sql, supabase/config.toml, .env.example, .github/workflows/_env-example.yml, scripts/bootstrap-env.sh
status:     done
```
The client. `POST /v1/calls` with the assembled `task`, the E.164 number in
`recipients`, the inline `result_schema` from
[docs/calle-call.md](../docs/calle-call.md), `webhook_url` pointing at
`ORMA_API_URL`, `metadata` carrying the `call_run_id`, and the `Idempotency-Key`
header holding the key stored in T2.1.

Orma composes each call rather than running a published Goal. Goals cannot be
created over the API, so a Goal would put the prompt in a console rather than in
the repository, and it would freeze the task text while Orma's whole premise is
that the instruction changes every day.

Record `calle_call_id` and the returned `status`. The response shape is already
committed at `testdata/calle/call-completed.json`, so build against that rather
than guessing: `structured_result` sits at task level, transcript turns live at
`recipients[0].attempts[0].transcript_turns`, and attempts carry `started_at` and
`completed_at` rather than a duration.

A 409 means the key was reused with different inputs. That is a bug. Log it loudly, leave the run in a state a human can see, and never retry with a fresh key.

Refuse to dispatch for a profile without a live `outbound_calls` consent and a confirmed number. The check belongs here, at the last moment before the call, not only in the UI.

**Done when:** dispatch against a mock returns a call id, a replayed key returns the original call rather than placing a second one, a 409 surfaces as a visible failure, and a profile without consent is refused with a recorded reason.

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

A run entering `awaiting_result` gets `poll_after` set 60 seconds out, then 10 seconds per pass, and the tick advances it by re-fetching `GET /v1/calls/{call_id}`. The first real call reached a terminal state at about 140 seconds, so the window has to allow for well over two minutes. Follow-up crosses tick boundaries rather than sitting in a loop, because a free Edge Function allows 150 seconds of wall clock and 2 seconds of CPU per request.

Whichever of the webhook and the poll arrives first wins. The other is a no-op.

This task needs one live call to prove the timing against the real service.

**Done when:** a live call reaches a terminal state through polling alone with the webhook deliberately unregistered, and a second run proves the poll is a no-op when the webhook won.

---

### T2.6: Webhook receiver ★
```yaml
requires:   T1.4, T2.4
fixture-ok: yes
size:       M · frontier
owns:       supabase/functions/calle-webhook/index.ts, testdata/calle/webhook-*.json, supabase/config.toml
status:     done
```
CALL-E webhooks carry no signature. The only identifier is a `CALL-E-Event-Id` header, which is a de-duplication key and not authentication. The body is therefore a notification and never a fact.

Four steps, in order:

1. Reject unless the request carries `ORMA_WEBHOOK_SECRET` in the path.
2. Insert the event id into `webhook_events`. A conflict means it was seen before: return 200 and stop.
3. Re-fetch the authoritative run from CALL-E with the bearer token.
4. Act only on what the re-fetch returned.

No item, call or billing state is ever mutated from body content. Event types are `call.completed`, `call.failed` and `call.result_validation_failed`.

Capture the three event types into `testdata/calle/webhook-*.json` as they
arrive, with numbers masked. They could not be taken in T1.4, because capturing a
webhook needs an endpoint to receive it, and this task is that endpoint.

**Done when:** a replayed event is a no-op, a request without the secret is
rejected, a body hand-edited to retire a different user's item changes nothing,
the three event types are committed as fixtures, and each drives the correct
re-fetch.

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
requires:   T2.4, T2.7
fixture-ok: yes
size:       M · mid
owns:       supabase/functions/_shared/dispatch-mode.ts, supabase/functions/_shared/calle.ts
status:     claimed:gpt-5
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
status:     claimed:gpt-5
```
Write a `call_events` row at every transition: materialised, claimed, dispatched, polled, webhook received, re-fetched, ingested, finalised. Include enough detail to answer what happened without opening the logs.

Supabase logs are organised per invocation and a single call spans several, so this table is the only place the whole story is legible. It is also the demo video's one shot of visible machinery.

**Done when:** a completed run reads as an ordered story from materialisation to delivery, and a failed run names where it stopped.
