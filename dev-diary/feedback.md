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
from an allocated local line the customer does not control and cannot be sure is
stable between calls.

**Why that matters more than it looks.** A handset showing "suspected spam
caller" has ended the call before the callee decides anything. The only clean
mitigation is the callee saving the number as a contact, and that works precisely
because the callee is your own subscriber rather than a stranger. But saving a
number requires a number that is yours, known in advance, and the same one
tomorrow. An uncontrolled, possibly rotating originating line makes the one
available mitigation impossible to offer.

**Cost to us.** Orma is a ritual. It rings at a time you chose and the
anticipation is the mechanism. Onboarding wants a step that says "save this
number, here is why", and that step cannot be written honestly today, because we
cannot tell the user which number to save.

**Evidence.** The call placed on 11 September arrived on a Pixel showing a
likely-spam warning, and the account owner reports that every CALL-E call has
arrived the same way. This is not a risk we are anticipating. It is the current
default behaviour, on Google's own dialer, which ships on Pixel and on a large
share of Android handsets, in a market where call screening is near universal.

So the mitigation is not optional, and the mitigation is unavailable. Saving the
caller as a contact is what suppresses that warning, and the API exposes no
originating number to save.

**Suggested fix, in order of how much it would help.**

1. Sell numbers in India, so a customer can own and warm their own line.
2. Guarantee a stable originating line per subscriber, and expose it on the API
   before the call, so an application can tell its user exactly what to save.
3. At minimum, report the number actually used on the call record. Today an
   integrator cannot even measure the problem, let alone route around it.
4. Pursue registration with the carrier and caller-ID reputation services for the
   lines already in use. The lines appear to be classified as spam already, which
   is a reputation problem that gets worse as volume grows, and it is not
   something any individual customer can fix from outside.

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
