# Orma

> **Orma** — it remembers what you keep not doing.

ഓർമ്മ, *orma*: memory, remembrance. Not a filing cabinet. Something that
remembers what you said last time.

- **Event:** CALL-E: Your Code Is Calling
- **Deadline:** **14 September 2026, 23:45 SGT** = **21:15 IST**

---

## 1. The product

A daily two-minute accountability call. It rings at a time you chose, leads with
what you keep *not* doing, asks what needs capturing, and hangs up.

**The thesis is accountability, not reminding.** This answers the only question
that can sink the idea: *why does this have to be a phone call?* An app can be
dismissed with no consequence and no witness. That is not a UX flaw, it is the
absence of the mechanism. A question asked out loud, by something that remembers
what you said last time, has weight.

**The competitive set is gym buddies, standups, sponsors and coaches**, not
to-do apps. People pay monthly for those, because the value was never tracking.
It was someone asking.

**Being a known machine is an asset.** The voice holds a real conversation and
both parties know what it is. A bad voice means you disengage; a human-passing
voice means you feel judged or deceived; a good voice you *know* is a machine
gets a natural conversation with no social cost to telling the truth. Admitting
you did not do it, for the fifth time, is easy, because nobody is disappointed.
Honest answers are what the cross-day analysis runs on.

**It fixes capture and review.** The moment you have a thought is never the
moment you are willing to open an app. Notifications get scrolled past unread; a
question asked out loud gets answered.

---

## 2. Surfaces

Inbound is convenience. Outbound is the mechanism.

### Inbound

| Surface | Role |
|---|---|
| **Web app** | Sign-up, phone number and consent, the daily slot, the item list, retire and restore, transcript and summary history, billing. |
| **MCP server** | The agent surface: `add_item`, `list_items`, `retire_item`, `set_slot`, `get_last_call`, `get_patterns`. Adds and retrieves without a browser. |
| **Telegram bot** | Impulse capture, text or voice note, free and instant from any phone. Onboarding includes one Start press, since a bot cannot message a user who has never messaged it. |

### Outbound

**The call is the only channel that asks. Everything else is a receipt.**

| Channel | Carries | Never carries |
|---|---|---|
| **Phone call** | The daily accountability conversation. The only thing with teeth. | — |
| **Telegram** | Post-call summary, what was captured, what was retired, and the periodic pattern report. | A nag, or a prompt to do something. |
| **Email** | The same artifacts, for anyone who wants a durable copy. | A nag. |

The asymmetry is load-bearing. The product exists because notifications get
scrolled past unread. If Orma also nags over Telegram and email it becomes the
thing it replaces, and the call stops being special because it is one prompt
among three. Messages report on a call that already happened. They never
substitute for one and never chase you.

The pattern report goes in writing. Analysis over sequences is the
differentiator, and nobody wants a trend report read aloud. The call carries a
line or two of it; the artifact goes to Telegram or email.

---

## 3. The call

### It gives before it takes

Opening with "anything to add?" is extraction, and it gets ignored by day nine.
Opening with something you did not know — this is due tomorrow, you have said
this three times, this has sat for a month — earns the slot.

This is an ordering rule. The call **must** ask what is new, because capture is
half of what the product fixes. It just cannot lead with it. A cold "what's
new?" gets a blank, since nobody has their life paged in at 8am. Asked after
being walked through what is outstanding, the same question gets a better answer.

### Shape

1. **Land.** Say who you are and wait. Ask whether you can be heard and wait for a yes.
2. **Give.** One or two things you did not know. Overdue, repeated, aged.
3. **Walk.** What is open, briefly. Not the whole list.
4. **Take.** What needs capturing.
5. **Offer the exit.** Anything to let go of.
6. **Close.** Confirm tomorrow's slot. Hang up.

Target two minutes.

**Landing is a step, not a courtesy.** The first seconds of a phone call are
lost while the other person works out who is speaking, and phone audio is worse
than anyone designing for it assumes. So landing takes two beats.

> **Orma:** Hello. This is Orma.
> **You:** Hello.
> **Orma:** Can you hear me?
> **You:** Yes.

The first line is sacrificial. It carries nothing worth keeping and it is
expected to be missed. The second tests the channel, and the yes is the only
evidence that the line works. Nothing that matters is said before it arrives.

Give-before-take orders the check-in. It never licenses leading with content
nobody is ready to hear.

### Quitting is easy and unpunished

The failure mode is dodging, not forgetting. By week three you know what it is
going to ask and you decline the call rather than face it. That is churn from
working too well.

So someone can say *kill it, I am never doing this*, and Orma simply agrees. A
list you cannot retire from becomes a wall of shame, and a wall of shame is a
call you stop answering. Being allowed to drop something honestly is what keeps
the rest of the list truthful. It is also the demo beat nobody else will have.

---

## 4. The result schema

Every call returns a `structured_result` validated against a strict JSON Schema.
`structured_result` is null-or-correct: on validation failure the **whole**
object comes back null, not a partial one. Two rules follow.

**Required fields stay minimal, and subjective fields are optional with an
explicit unknown.** One flaky field must never be able to null out the reliable
ones alongside it.

**Counts and ages are computed by Orma and injected into the call task. The
model never derives them.** "Three times" and "34 days" come from the database.
The model phrases them; it does not count.

| Field | Shape | Notes |
|---|---|---|
| `captured_items` | array of `{text, evidence_offset_seconds}` | New things to track. |
| `retired_items` | array of `{item_id, evidence_offset_seconds}` | **Evidence required.** Retiring is destructive and must be inspectable. |
| `commitments` | array of `{item_id, due, evidence_offset_seconds}` | `due` may be null. A commitment is a thing said out loud with a time attached. |
| `slot_change_request` | `{requested_time, evidence_offset_seconds}` or null | **A proposal, not the truth.** Orma owns the slot; extraction may only request a change, which is then confirmed. |
| `mood` | enum: `ok`, `low`, `stressed`, `energised`, `unknown` | Optional, defaults `unknown`. A small enum, never free text. |

Every destructive or state-changing disposition carries the transcript offset
where the user said it. The full transcript is retained regardless, as turns with
`speaker` and `offset_seconds`.

---

## 5. Rules

- **Fixed time, configurable**, possibly several a day. The fixed slot creates the anticipation; rituals have a clock.
- **The requester's name goes in the call task.** Unset, the agent cannot answer the first question anyone asks.
- **Analysis runs over sequences, not single calls.** One transcript is a to-do list; the pattern across days is the insight. This is the differentiator, not the call.
- **Outbound messages are receipts, never prompts.**
- **The call asks what is new, but never first.**
- **Counts and ages come from the database, never from the model.**
- **Destructive dispositions carry transcript evidence.**
- **A call that happened is never redialled**, whatever the extraction did.

---

## 6. Positioning

**Nobody is held accountable through an app, only set up through one.** The call
is the mechanism; the web app, MCP server and bot are scaffolding.

**Lead with the call that already knows.** `awesome-phone-call-agents` ships
`call-reminder`, a scheduler wrapper for recurring CALL-E reminders, so the
reminder mechanic is taken. The pitch is the call arriving already knowing what
you keep not doing, plus analysis across sequences. Leading with scheduling walks
into existing work and into the brief's explicit rejection of a generic "AI that
makes phone calls" concept.

---

## 7. The demo

**The demo is about memory, not scheduling.** Everyone else will show a product
that rings on time. The beat that only Orma has is the call arriving already
knowing.

The centre of the video is one continuous exchange:

> **Orma:** You've mentioned the dentist three times. It's been 34 days.
> **User:** Kill it.
> **Orma:** Done. It's gone.

That puts give-before-take and unpunished quitting into a single thirty seconds,
instead of claiming them separately. A product that lets a task go is the thing
no other submission will show.

**The history has to be real.** That line cannot exist without prior calls, so
run real calls across the days before submission and let the dentist genuinely
age. Twenty free calls is enough. Seeding a fake history would require captioning
it, since the repo rejects anything that hides side effects, and a real one
demos better regardless.

---

## 8. Platform constraints

- **Outbound only.** No inbound, and it is not roadmapped. Telegram carries capture.
- **No scheduling.** Provider separation: the phone-call provider places calls, the host scheduler handles recurrence. **Orma owns the scheduler.**
- **Structured results are first class.** `result_schema` takes JSON Schema and validates; `structured_result` returns `null` rather than something wrong. Transcripts come back as turns with `speaker` and `offset_seconds`.
- **Objects:** Calls, Goals, Goal Runs, Webhooks. A Goal is a reusable template holding behaviour, voice region, locale, input and result schema. A Goal Run executes it against one E.164 number with per-run variables and an idempotency key. Re-runs reuse the key.
- **Polling:** wait ~60s after start, then every 5–10s until terminal, or take the webhook.
- **$0.05 per billable call**, 20 free on signup.
- **India is English and Hindi, no Malayalam.** The name is a name.
- **Calls arrive flagged as likely spam.** Not a risk, an observation: the 11 September call landed that way on a Pixel, and every CALL-E call so far has. Anticipation does not survive the handset saying spam before the user looks. The only clean mitigation is the callee saving the number as a contact, which works precisely because the callee is your own subscriber, and it needs a number we do not have. See `feedback.md` issue 9.
- **Numbers are purchasable in the US and Brazil only.** India-bound calls come from an allocated local line you do not control and the API never names, which removes the save-the-contact mitigation rather than weakening it. Watch for India being added.

---

## 9. Submission

- **PR to** `CALLE-AI/awesome-phone-call-agents`, area **`apps/`**, under `python/` or `typescript/`. The repo lists *call scheduler UI* as a good example there.
- **Apps that place calls or create recurring jobs must document** setup, side effects, cancellation, credential handling, and dry-run or preview behaviour. All of it ships in the app README.
- Repo requires **E.164**, explicit consent handling, cancellation paths, and masked numbers in samples. It rejects tools that hide side effects.
- **Devpost form** takes the PR URL, a text description, a demo video **under 3 minutes** public on YouTube or Vimeo, and the email on the CALL-E account. Live demo URL optional.
- **Judging:** Real World Impact · Quality of the Idea · Technical Implementation · Product Experience & Demo.
- Telegram's Bot API is free and permits this use. Note it in the README under third-party integrations.

### Two deadlines that are not the deadline

- **Extra calls.** 20 free on signup. The additional 200 goes through a form, takes one to five business days, and is discretionary. It has to go in immediately or not at all.
- **Most Valuable Feedback bonus.** A separate survey, one per entrant, open until **18 September**, four days after submissions close. Actionable comments such as bug reports and interface suggestions. Still winnable after the build is done.

---

## 10. Known limitation

**Missed calls are not handled.** Only the happy path is built: the call is
placed at the chosen slot, and Orma acts on a call the user answered. There is no
retry, no distinction between an unanswered and a declined call, and no roll
forward of a lost day. The slot exists so that the call is anticipated and
picked up, and CALL-E does not report a disposition that would let Orma tell the
two cases apart. Testing will show what is actually needed here.
