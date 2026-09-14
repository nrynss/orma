# P8: Ship

```yaml
id:       P8
size:     L
requires: [P2, P5, P6, P7]
blocks:   [final submission]
parallel: no
```

**Goal:** A disclosed demo history, a deployment that survives judging, and a submission that explains itself.

**No live call run.** The submission does not depend on real calls across days. T8.1 seeds the whole demo history and discloses it. T8.4 uses a labelled synthetic call, the same approach as the T6.8 landing demo.

**Clock.** Submissions close 14 September at 23:45 SGT, which is 21:15 IST. T8.1, T8.3, T8.4 and T8.5 are the submission path. T8.2 must run before the project's first seven idle days, and T8.6 closes 18 September.

---

### T8.1: Seed data and disclosure ★
```yaml
requires:   T1.1
fixture-ok: yes
size:       S · mid
owns:       scripts/seed.ts
status:     not-started
```
The demo needs history that no real run of calls will produce, so the seed carries all of it.

Seed the dentist item aged 34 days, with three mentions on three earlier runs on three separate days. Seeded items carry `seeded = true`. Seeded runs carry `dry_run = true`, because no real call placed them. Mentions have no seeded column, so a query finds them through their seeded item or their dry-run run.

The repository rejects tools that hide side effects, so this is disclosed rather than disguised. The README states which rows were seeded and why, and the video captions it on screen. Nothing after the seed may pretend to be a real call. The retirement in the demo is a live state change through a real surface.

**Done when:** the script is runnable and idempotent, every seeded row is distinguishable in a query, the briefing assembled from the seed says three mentions and 34 days from rows, and the disclosure text exists in both the README and the video script.

---

### T8.2: Keepalive and backup
```yaml
requires:   T1.1
fixture-ok: yes
size:       S · mid
owns:       .github/workflows/keepalive.yml
status:     not-started
```
Judging opens 30 September and closes 13 October, sixteen days after submissions close. A free Supabase project pauses after seven days of low activity, and a paused project stops `pg_cron`, which stops the calls and takes the live demo URL down before a judge ever opens it.

With no daily calls, nothing else keeps the project active. This workflow is the only activity until a judge arrives.

A daily GitHub Actions workflow does two things: a request against PostgREST to register measured activity, and a `pg_dump` into a private repository, which also covers backups not being downloadable on the free plan.

Copy the `env:` block from `.github/workflows/_env-example.yml` rather than writing one. It is the canonical mapping of which names are `vars.` and which are `secrets.`. Reach the database through `SUPABASE_DB_URL` and PostgREST through `ORMA_API_URL`, never the project host.

**Done when:** the workflow has run daily for a week, a restore from one of its dumps has been demonstrated, and the project has not paused.

---

### T8.3: Submission README ★
```yaml
requires:   P2, P3, P4
fixture-ok: yes
size:       M · frontier
owns:       README.md
status:     not-started
```
The repository requires apps that place calls or create recurring jobs to document setup, side effects, cancellation, credential handling, and dry-run behaviour. All of it goes here, along with E.164 handling, explicit consent, and masked numbers in every sample.

State plainly that missed calls are not handled and why, per `product.md` §10. A documented limitation reads as judgement. An undocumented one reads as a bug found by a judge.

State just as plainly how the demo was made. The demo history is seeded, and the demo exchange is synthetic. Name the seeded rows and the one real call from 11 September that the fixtures record.

Note Telegram's Bot API under third-party integrations, and link the MCP configuration from T4.3.

**Done when:** a reader who has never seen the project can install it, run it in dry mode, watch a dry-run call reach a terminal state on the timeline, and cancel a scheduled call, using only this document. The document also says exactly what turning dry run off would do and cost.

---

### T8.4: Demo video ★
```yaml
requires:   T8.1, T6.6, T6.8
fixture-ok: yes
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

**The exchange is synthetic, and the video says so on screen.** No real call carries this line. Use the same labelled synthetic approach as the T6.8 landing demo. Never imply that a real person took the call or that the audio is a production recording.

The numbers in the line still come from rows. Show them in the web app, from the seed, so "three times" and "34 days" are visibly measured. Then show the retirement as a live state change in Items, and the item leaving the next briefing.

Lead with the call arriving already knowing, not with scheduling. The repository already ships a scheduler wrapper for recurring reminders, so that ground is taken.

Show the timeline from T6.6 once, briefly, on a dry-run run, to prove the machinery is real. Label it as dry run. Caption the seeded rows where they appear.

There is no incoming call screen to show, so start at the exchange. Do not stage a saved contact or a caller name. It cannot happen for a real user, and a judge who tries the product would find out.

**Done when:** the cut is under three minutes, the synthetic label and the seed disclosure are legible on screen, and the numbers and the timeline shown come from real rows.

---

### T8.5: Pull request and Devpost ★
```yaml
requires:   T8.3, T8.4
fixture-ok: yes
size:       S · mid
owns:       (operational)
status:     not-started
```
Open the pull request to `CALLE-AI/awesome-phone-call-agents` under `apps/`, following the contribution rules. Put that URL into the Devpost form along with the description, the video link, and the email on the CALL-E account. The live demo URL is optional and, given T8.2, worth including.

The description carries the same disclosure as the README: seeded history and a synthetic exchange.

Submissions close 14 September at 23:45 SGT, which is 21:15 IST.

**Done when:** the pull request is open and passing whatever checks the repository runs, and the Devpost entry is submitted rather than saved as a draft.

---

### T8.6: Feedback survey
```yaml
requires:   none
fixture-ok: yes
size:       S · light
owns:       dev-diary/feedback.md
status:     not-started
```
A separate prize with its own deadline of 18 September, four days after submissions close, and its own judging. One entry per entrant, rewarding actionable comments such as bug reports and interface suggestions.

The raw material already exists. [`dev-diary/feedback.md`](feedback.md) is written as the work happens, so this task is editing rather than remembering. The survey goes from the fifteen issues already recorded.

Lead with three: the unsigned webhook, the missing call disposition, and numbers being unavailable in India. Those are the ones that changed what Orma could be, and a reviewer can act on all three. The last is also the one with a commercial answer rather than only an engineering one.

Issue 9 keeps its hypothesis about rotation, without the week of caller numbers. Say that plainly rather than implying a measurement that was never taken.

**Done when:** the survey is submitted with specific, reproducible observations rather than general praise, and every issue in `feedback.md` is either included or deliberately dropped.
