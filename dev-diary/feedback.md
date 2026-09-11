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
than guess.

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

## 9. What worked, and is worth saying

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
