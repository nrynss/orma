# CALL-E feedback

Every piece of friction with CALL-E goes here, the moment it is hit. Not at the
end. Reconstructing an issue days later loses the request that caused it, the
exact response, and usually the point.

This has two uses. It is how the API surprises get remembered rather than
re-discovered by the next agent. And it is the raw material for the Most Valuable
Feedback prize, a separate award with its own deadline of **18 September**, four
days after submissions close, judged on actionable comments such as bug reports
and interface suggestions. General praise wins nothing.

**Entry shape.** What happened, the evidence, what it cost us, and what would fix
it. Mask every phone number. Never paste a key.

---

## 1. Webhooks carry no signature

**Severity: high.** This is the one worth leading with.

The only identifier on a webhook is a `CALL-E-Event-Id` header matching
`^evt_[A-Za-z0-9_-]+$`, which the documentation describes as a de-duplication
key. There is no HMAC, no shared secret, no signature header.

Anyone who learns a webhook URL can post a forged `call.completed` with any
`structured_result` they like. For an agent product that acts on call outcomes,
that is a write primitive handed to whoever can guess a URL.

**Cost to us.** Orma treats every webhook as an unauthenticated notification: it
records the event id, then re-fetches the authoritative run over the API with its
bearer token and acts only on that. Correct, but it doubles the request count and
every integrator has to work it out independently.

**Suggested fix.** Sign the body with the project's secret and send the signature
and a timestamp in headers, the way Stripe and GitHub do. Document the
verification recipe. A signature also removes the need for the defensive
re-fetch.

---

## 2. No call disposition is reported

**Severity: high.**

A `CallTask` reports `status` of `queued`, `in_progress`, `completed`, `failed`
or `canceled`, plus `failure_code`, `failure_message`, `summary`,
`task_completed`, `completion_confidence` and `evidence`. There is no field
distinguishing no answer, busy, declined, voicemail, or answering-machine
detection.

**Cost to us.** Orma's product specification had separate retry policies for a
deliberate decline and an unreachable phone, on the reasoning that someone ducking
a call and someone riding a motorbike are different events. That distinction is
not implementable. We cut missed-call handling from the product entirely rather
than guess, and `product.md` §10 now documents that as a known limitation citing
this gap as its cause. The shipped limitation and this entry are the same fact,
seen from the two ends.

**Suggested fix.** Report a disposition enum alongside `status`. Even a coarse
one, `answered`, `no_answer`, `busy`, `rejected`, `voicemail`, `unknown`, would
let a scheduler behave decently. Today every integrator that cares must invent a
heuristic over ring duration, and every one will invent a different one.

---

## 3. Goals cannot be created over the API

**Severity: medium.**

`GET /v1/goals` and `GET /v1/goals/{goal_id}` exist. There is no `POST`. A Goal,
which owns the call behaviour, the input schema and the result schema, can only
be authored in the console.

**Cost to us.** The Goal is the reusable artefact, but a console-only Goal cannot
be version controlled, reviewed in a pull request, or read by anyone evaluating
the project. We abandoned the Goal route and compose each call with
`POST /v1/calls` instead, so the prompt lives in the repository.

**Suggested fix.** Allow creating and publishing a Goal over the API, even if the
console stays the friendly path. An API-first product whose central reusable
object is console-only pushes its best artefact out of source control.

---

## 4. The calls route cannot set voice region or locale

**Severity: medium.** Follows from issue 3.

`CreateCallRequest` accepts `task`, `recipients`, `result_schema`,
`recipient_result_schema`, `metadata` and `webhook_url`, and is closed to
anything else. Region, callee locale and runtime profile come from the published
Goal, so the only fully scriptable route is also the one with no voice control.

**Cost to us.** Orma calls Indian numbers and takes whatever the account default
gives. We cannot pin a locale without giving up a version-controlled prompt.

**Suggested fix.** Accept optional `region` and `locale` on `POST /v1/calls`.

---

## 5. The API reference index prints navigation labels as paths

**Severity: low, but it costs a first-time integrator real time.**

The reference index lists the goal-run operation as `POST /goal-runs`. The actual
path, on the endpoint page and in the OpenAPI contract, is
`POST /v1/goals/{goal_id}/runs`. Calls are listed as `POST /calls` while the
contract says `/v1/calls`.

**Cost to us.** We wrote the endpoint down wrong, then had to verify every path
against `openapi/calle.openapi.yaml` before trusting any of them.

**Suggested fix.** Print the real path, including the version prefix, in the
index.

---

## 6. The result-schema subset boundary is under-specified

**Severity: low.**

The documentation says supported features are `type`, `properties`, `required`,
`enum`, nested `object` fields, simple `array.items`, `description` and
`additionalProperties: false`. "Simple `array.items`" does not say whether an
array of objects qualifies.

**Cost to us.** We treated arrays of objects as a build risk, designed a
flattening fallback, and only learned it works by spending a real call. It does
work: `[{text, evidence_offset_seconds}]` came back correctly extracted.

**Suggested fix.** State it. One sentence saying object items are supported, with
an example, removes the doubt.

---

## 7. Task-level and recipient-level results are easy to confuse

**Severity: low.**

Sending only `result_schema` populates `structured_result` at task level and
leaves `recipients[0].structured_result` null. That is correct behaviour and it
is documented, but with a single recipient the two look interchangeable and the
null reads as a failure.

**Suggested fix.** Note in the single-recipient case that `result_schema` alone
fills the task-level field, and that `recipient_result_schema` is what fills the
per-recipient one.

---

## 8. Attempt objects carry no duration

**Severity: trivial.**

An attempt has `started_at` and `completed_at` but no duration, and no `ended_at`
despite `completed_at` meaning the same thing elsewhere in the payload.

**Suggested fix.** Either add `duration_seconds` or name the field `ended_at` for
symmetry.

---

## 9. CALL-E calls arrive flagged as spam, and there is no number to save

**Severity: highest in this document.** Observed, repeated, and it attacks the
premise rather than the implementation.

Numbers can be purchased in the United States and Brazil. Calls to India go out
from an allocated local line the customer does not control, and it is **a
different number on every call**. Confirmed by observation across the calls
placed on this account.

**Why that matters more than it looks.** A handset showing a spam warning has
ended the call before the callee decides anything. The only clean mitigation is
the callee saving the caller as a contact, and that works precisely because the
callee is your own subscriber rather than a stranger. Saving requires a number
that is the same one tomorrow. Rotation does not weaken that mitigation, it
removes it.

**A hypothesis worth testing on your side.** Rotation may be causing the
classification rather than merely failing to prevent it. A number that places one
call and is never seen again, from a pool, to a recipient with no prior
relationship, is close to the textbook signature of unwanted traffic. Reputation
cannot accrue to a line that is discarded after one use. If that is what is
happening, then every customer's calls are being scored against a pool that can
only get worse as the platform grows, and no customer can do anything about it
from the outside. We cannot test this ourselves, because the API never reports
which number was used.

**Cost to us.** Orma is a ritual. It rings at a time you chose and the
anticipation is the mechanism. We had planned an onboarding step saying "save
this number, here is why". It has been cut, because there is no number to save.
The product now tells users the call arrives from a different number every day
and may be flagged, and asks them to answer anyway. We are accepting the risk
because there is nothing else on offer.

**Evidence.** The call placed on 11 September arrived on a Pixel showing a
likely-spam warning, and the account owner reports that every CALL-E call has
arrived the same way. This is not a risk we are anticipating. It is the current
default behaviour, on Google's own dialer, which ships on Pixel and on a large
share of Android handsets, in a market where call screening is near universal.

So the mitigation is not optional, and the mitigation is unavailable. Saving the
caller as a contact is what suppresses that warning, and the API exposes no
originating number to save.

**Suggested fix, in order of how much it would help.**

1. Stop rotating. A stable line per subscriber, or per customer, is the single
   change that would let reputation accrue at all and let a callee save the
   caller. Everything else here is a consolation prize.
2. Sell numbers in India, so a customer can own and warm their own line.
3. Report the number actually used on the call record. Today an integrator cannot
   even measure the problem, let alone route around it, and could not tell you
   whether a fix had worked.
4. Pursue carrier and caller-ID reputation registration for the lines in use.

**Why this one is worth CALL-E's attention beyond us.** Every project built on
outbound calls inherits this. A call that announces itself as probable spam is
answered less, and an agent that is answered less produces less of the outcome it
was bought for. It degrades every customer's numbers at once, quietly, and none
of them can see it from the API.

---

## 10. What worked, and is worth saying

Not everything here is a complaint, and the survey rewards specifics either way.

**The extraction audits itself.** After our first call, `summary` said the bot
had skipped required parts of the check-in and treated unclear responses as
captured items, and `completion_confidence` came back `0.82 / high` with three
short `evidence` strings. Nobody asked it to grade the call. That self-report
found four defects in our prompt faster than listening to the recording did, and
it is a genuinely unusual feature.

**Transcript turns are exactly right.** `{speaker, offset_seconds, text}`, and an
extracted `evidence_offset_seconds` landed on the turn it pointed at. Orma's
whole evidence model depends on that and it worked first time.

**The events stream is excellent for debugging.** `GET /v1/calls/{id}/events`
returned 50 events for one 86-second call, including partial ASR as it arrived.
Watching the caller's words assemble across turns is how we diagnosed that the
audio was poor before the caller told us.

**Idempotency is required rather than optional.** Making the header mandatory on
call creation is the right call, and rarer than it should be.

---

## 11. Recipient validation and call attempts are hard to audit

**Severity: medium.**

**What happened.** Our first `POST /v1/calls` used an invalid `recipients`
shape. It returned HTTP 422 before issuing a CallTask id. The accepted shape
used an object with a `phones` array. The rejected response did not make that
accepted envelope clear enough to correct without consulting the API reference.

One corrected request created `call_jDAvO3ThAO5Fa2kBPCmV6A`. The operator then
reported two rings. Orma issued no second accepted request. The reason for the
second ring is unconfirmed. The task finally returned `failed`, with
`call_failed` and `NO ANSWER (Hangup by: bot)`.

**Evidence.** The failed request returned HTTP 422 and no CallTask id. The
corrected request returned one CallTask id. Its event list ended in
`call.failed`. The API returned no cost amount. The operator reported the two
rings separately.

**Cost to us.** We spent one failed request correcting the recipient envelope.
The accepted task rang twice by operator report, yet the API gave no cost field
or clear attempt explanation to reconcile the report. The terminal fixture was
still useful, but we had to treat the repeated-ring cause as unknown.

**Suggested fix.** Return a JSON pointer and the expected recipient object in
the 422 response. Show `{ "phones": ["+XXXXXXXXXXXX"] }` beside the field.
Expose every dial attempt, its reason, and a cost amount on the CallTask. That
would let an integrator distinguish one task with provider retries from two
dispatches.

---

## 12. Accepted tasks can fail before any recipient-visible ring

**Severity: high.**

**What happened.** Two authorised webhook-capture probes were accepted and
entered `in_progress`. Neither rang the configured recipient. One ended with
provider failure `404`. The other ended with attempt failure `408` and
`NO ANSWER (Hangup by: bot)`. Both recorded zero seconds and no transcript.

**Evidence.** Each task returned a provider call id and terminal
`call_failed`. The recipient observed no incoming call. Neither task produced
a webhook event at Orma's deployed capture endpoint.

**Cost to us.** The probes cost time and blocked webhook-contract capture,
polling proof, result ingestion and dry-run end-to-end validation. The API's
terminal vocabulary cannot distinguish routing failure from a real no-answer.

**Suggested fix.** Expose a recipient-visible dial state and a provider routing
diagnostic. Deliver a webhook for every terminal task, including a failure that
occurs before a call can ring.

---

## 13. Accepted per-call webhook URL produced no delivery

**Severity: high.**

**What happened.** A control CallTask included the documented HTTPS
`webhook_url`, rang the recipient, was answered, and completed normally. The
deployed receiver was reachable by an independent POST, but recorded no
CALL-E event.

**Evidence.** `call_sY36Xr07vuAsq0RmsGOX7A` completed after a real
conversation. Its developer event stream contained the terminal call event.
Neither the receiver's `webhook_events` table nor the stream showed a callback
delivery or retry.

**Cost to us.** This blocked genuine webhook fixtures and the proof that a
terminal result reaches Orma without polling. It also leaves the documented
per-request callback feature unreliable for production workflows.

**Suggested fix.** Expose delivery attempts, response status, and retry state
in the call event stream. If a per-call callback is accepted, send a terminal
event or return a validation error that explains why delivery is disabled.

---

**Update, 13 September 2026. The callback reaches a public sink but never reaches Orma.**

A second control run proved the provider does send. The same run proved it does
not send to Orma. Both controls used the documented per-request `webhook_url`.

**The sink test.** `call_iDGTQWVCt9IhS-Om8NdnTQ` pointed its `webhook_url` at an
independent public sink (a `webhook.site` token). The call reached terminal
`call.failed` when the recipient did not answer. The sink received a real POST
at 20:25:00Z. The body was 1886 bytes of the documented `call.failed` envelope,
with `data.id` equal to the call id. The `CALL-E-Event-Id` header equalled the
body `id` (`evt_245e7b10d5a75ce14d0d8e9d`). The sender agent was
`python-httpx/0.28.1`. So the per-request callback works, and it fires for a
failed task as well as a completed one.

**The Orma control.** `call_42_jJMl3YrwnMNaPj8bVgA` pointed the same shape of
`webhook_url` at `https://orma-api.nryn.dev/functions/v1/calle-webhook/<secret>`.
The call rang, the recipient answered, and it completed with
`structured_result {"heard":"yes"}`. No request reached the receiver.

**The diagnostic.** To rule out a wrong method, a wrong path or a rejected
header, we deployed a temporary receiver that records every arrival before any
gate and always answers 200. `call_H99Ye0-Lu3VWhx6YPwYZlA` pointed its
`webhook_url` at that receiver. Over five minutes past terminal state, the
receiver recorded zero arrivals. Not even a health probe arrived.

**Orma accepts the real thing.** We replayed the exact captured bytes and
headers against the production receiver. It answered 200. Direct POSTs from
curl, from `python-httpx` and with an empty user agent also answered 200. The
path secret is 40 alphanumeric characters and needs no URL encoding.

**Reachability.** Six `check-host.net` nodes (Canada, Germany, France, Iran,
Singapore, United States) each fetched the same Orma URL and received 200 from
Cloudflare's edge. The host is reachable worldwide.

**What CALL-E never tells you.** The create response echoes no `webhook_url`.
The terminal CallTask carries no delivery field. The call event stream records
no callback attempt, response or retry. The API surface has no delivery-log or
endpoint-health route. A caller cannot tell an accepted callback that will
never fire from one that will.

**Suggested fix.** Expose delivery attempts with response status and retry
state in the call event stream. Validate `webhook_url` at create time and
return an error when the destination cannot be dialled. Until then the
per-request callback is not trustworthy for a production workflow.

---

## 14. The result schema cannot constrain a field's format

**Severity: medium.**

The supported keyword list for `result_schema` is `type`, `properties`,
`required`, `enum`, nested objects, simple `array.items`, `description` and
`additionalProperties: false`. There is no `format`, no `pattern`, and no
`minimum` or `maximum`.

**Cost to us.** Orma's extraction schema asks for a commitment's `due` as a
free string, described as "when they said they would do it, in their own words",
because no keyword can express a timestamp. A call saying "Thursday, around
five" is a perfectly good extraction and an unusable database value. We have to
parse it ourselves, or reject it, or store it as text and never query it.

The same gap bites numeric fields. `evidence_offset_seconds` is declared
`{"type": "integer"}` and nothing stops a null, a negative, or an offset past
the end of the call. Every one of those has to be caught client-side, and each
client will catch a different subset.

**Evidence.** The generated payload is in `docs/calle-call.md` section 5, where
`due` and `slot_change_time` both read "in their own words". The boundary is
pinned in `supabase/functions/_shared/ingest.ts`, which has to re-validate
everything the provider accepted before writing a row.

**Suggested fix.** Support `format` for at least `date-time` and `date`, and
`minimum`/`maximum` for numbers. A schema that cannot say "this is a timestamp"
pushes a typed problem into every integrator's string parsing, which is where
the bugs live.

---

## 15. A call that never connected reports high confidence

**Severity: medium.**

Our recorded failed call is a task that never connected. The provider hung up
after zero seconds, the attempt carries `failure_code: 408` and an empty
`transcript_turns`. The task around it still reads `status: failed` with
`task_completed: true` and `completion_confidence: {"score": 0.9, "label":
"high"}`.

**Cost to us.** `task_completed` and `completion_confidence` describe whether
the agent accomplished what it was asked to do, not whether anyone spoke to it.
Nothing in the field name says so. An integrator who reads `high` as "this call
went well" stores a 0.9 against a call with no audio, and any ranking or review
built on it is wrong from the first row.

Orma copies `completion_confidence` onto `call_runs.calle_confidence` on every
terminal write, including the failed one. The value is faithful to the payload
and misleading to a reader.

**Evidence.** `testdata/calle/call-failed.json`, read directly. The same file
shows the contradiction in its own `evidence` array, which says "The call
status was reported as no answer" and "There was no transcript or callee speech
from the attempt" while the confidence sits at 0.9.

**Suggested fix.** Add a call-level boolean such as `connected`, or return
`completion_confidence` as null when no attempt connected. Failing that, name
the field for what it measures. `task_completed` reads like a statement about
the call, and it is not one.
