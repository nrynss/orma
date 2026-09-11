# P8: Ship

```yaml
id:       P8
size:     L
requires: [P2, P5, P6, P7]
blocks:   [final submission]
parallel: no
```

**Goal:** Real history, a deployment that survives judging, and a submission that explains itself.

**Why it starts before the rest finishes:** T8.2 needs days of real calls, not hours. It begins the moment T2.4 dispatches successfully, in parallel with everything still being built.

---

### T8.1: Seed data and disclosure ★
```yaml
requires:   T1.1
fixture-ok: yes
size:       S · mid
owns:       scripts/seed.ts
status:     not-started
```
The demo needs an item older than the run of real use can produce.

Seeded rows carry `seeded = true`. The script lives in the repository and is runnable by anyone. The README states which rows were seeded and why, and the demo video captions it on screen.

The repository rejects tools that hide side effects, so this is disclosed rather than disguised. Everything after the seed is real: the calls happen, the mentions accumulate, and the retirement in the demo is a live state change.

**Done when:** the script is runnable and idempotent, seeded rows are distinguishable in a query, and the disclosure text exists in both the README and the video script.

---

### T8.2: Live call run across days ★
```yaml
requires:   T2.4, T2.7, T8.1
fixture-ok: no
size:       M · frontier
owns:       (operational)
status:     not-started
```
Real calls to a real phone, on the real schedule, every day until submission.

This is what makes "you've mentioned this three times" true. It is also the only way the call's own quality gets tested, which is the eighty percent of perceived polish that no amount of correct plumbing supplies.

Keep a log of each day: whether the two-beat landing worked, whether it felt like a person thinking or a list being read, and what the extraction got wrong. Feed that back into the task template in [docs/calle-call.md](../docs/calle-call.md).

The 11 September call already named four failures to watch for: leading before landing, long silences, skipping the walk and the exit, and capturing something the caller never confirmed. The last two matter most, because the demo beat lives in the exit.

**Done when:** at least one item has accumulated three genuine mentions across three separate days, and the task template has been revised at least once from what the calls actually sounded like.

---

### T8.3: Keepalive and backup
```yaml
requires:   T1.1
fixture-ok: yes
size:       S · mid
owns:       .github/workflows/keepalive.yml
status:     not-started
```
Judging opens 30 September and closes 13 October, sixteen days after submissions close. A free Supabase project pauses after seven days of low activity, and a paused project stops `pg_cron`, which stops the calls and takes the live demo URL down before a judge ever opens it.

A daily GitHub Actions workflow does two things: a request against PostgREST to register measured activity, and a `pg_dump` into a private repository, which also covers backups not being downloadable on the free plan.

Copy the `env:` block from `.github/workflows/_env-example.yml` rather than writing one. It is the canonical mapping of which names are `vars.` and which are `secrets.`. Reach the database through `SUPABASE_DB_URL` and PostgREST through `ORMA_API_URL`, never the project host.

**Done when:** the workflow has run daily for a week, a restore from one of its dumps has been demonstrated, and the project has not paused.

---

### T8.4: Submission README ★
```yaml
requires:   P2, P3, P4
fixture-ok: yes
size:       M · frontier
owns:       README.md
status:     not-started
```
The repository requires apps that place calls or create recurring jobs to document setup, side effects, cancellation, credential handling, and dry-run behaviour. All of it goes here, along with E.164 handling, explicit consent, and masked numbers in every sample.

State plainly that missed calls are not handled and why, per `product.md` §10. A documented limitation reads as judgement. An undocumented one reads as a bug found by a judge.

Note Telegram's Bot API under third-party integrations, and link the MCP configuration from T4.3.

**Done when:** a reader who has never seen the project can install it, run it in dry mode, place one real call, and cancel it, using only this document.

---

### T8.5: Demo video ★
```yaml
requires:   T8.2, T6.6
fixture-ok: no
size:       L · frontier
owns:       (operational)
status:     not-started
```
Under three minutes, public on YouTube or Vimeo.

The centre is one continuous exchange, not a feature tour:

> **Orma:** You've mentioned the dentist three times. It's been 34 days.
> **User:** Kill it.
> **Orma:** Done. It's gone.

That single beat carries give-before-take and unpunished quitting together. A product that lets a task go is the thing no other submission will show.

Lead with the call arriving already knowing, not with scheduling. The repository already ships a scheduler wrapper for recurring reminders, so that ground is taken.

Show the timeline from T6.6 once, briefly, to prove the machinery is real. Caption the seeded row where it appears.

**Done when:** the cut is under three minutes, the central exchange is one unbroken take of real audio, and the seed disclosure is legible on screen.

---

### T8.6: Pull request and Devpost ★
```yaml
requires:   T8.4, T8.5
fixture-ok: yes
size:       S · mid
owns:       (operational)
status:     not-started
```
Open the pull request to `CALLE-AI/awesome-phone-call-agents` under `apps/`, following the contribution rules. Put that URL into the Devpost form along with the description, the video link, and the email on the CALL-E account. The live demo URL is optional and, given T8.3, worth including.

Submissions close 14 September at 23:45 SGT, which is 21:15 IST.

**Done when:** the pull request is open and passing whatever checks the repository runs, and the Devpost entry is submitted rather than saved as a draft.

---

### T8.7: Feedback survey
```yaml
requires:   T8.2
fixture-ok: yes
size:       S · light
owns:       (operational)
status:     not-started
```
A separate prize with its own deadline of 18 September, four days after submissions close, and its own judging. One entry per entrant, rewarding actionable comments such as bug reports and interface suggestions.

The day log from T8.2 is the raw material. Anything the API could not tell Orma, anything the console made awkward, and every place the docs and the endpoints disagreed belongs here.

**Done when:** the survey is submitted with specific, reproducible observations rather than general praise.
