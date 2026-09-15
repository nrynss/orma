# P8: Ship

```yaml
id:       P8
size:     L
requires: [P2, P5, P6, P7]
blocks:   [final submission]
parallel: [P9 except T8.4]
```

**Goal:** A disclosed demo history, a deployment that survives judging, and a submission that explains itself.

Every task here runs through the loop in `AGENTS.md`: implement, review, remediate, re-review, land. Read that file in full first. Each task block below is written to be handed to an agent on its own.

---

## Where things stand, 14 September

> **Superseded.** Orma was submitted on 14 September. Current state, deploys and what is still owed live in `dev-diary/LEDGER.md`. Two corrections to this file: T8.2's workflow has never run and its secrets are not set, so its done-when is not met. The `nrynss/orma` repository is public, not private.

- **Live.** The web app at `orma.nryn.dev` carries P6 (deployed 10:50Z). The API front door is `orma-api.nryn.dev`. The functions are `tick`, `materialise`, `calle-webhook`, `telegram`, `mcp`, `auth-telegram` and `analysis`.
- **Schedulers.** `tick-runs` runs every minute, `materialise-runs` at 00:10 UTC, and `analysis-report` on Mondays at 06:20 UTC. All three read `ORMA_MATERIALISE_SECRET_KEY` from Vault, which is now set.
- **Telegram.** The Login Widget works on `orma.nryn.dev`. BotFather's `/setdomain` for `@orma_tele_bot` is set to that domain. A bot has one login domain, so `localhost` always shows "Bot domain invalid".
- **P9 is in motion.** The UI is being rebuilt as a phone-first product UI. T8.4 records after P9 deploys. The README screenshots show the shell mid-migration, so recapture them once P9 lands.
- **Fixtures.** The conversation in `testdata/calle/` is synthetic, as `testdata/calle/README.md` explains. Provider summary and evidence text there still names the operator.
- **Devpost.** The operator entered the description and form details on Devpost directly. The PR URL and the video URL are still to add. The repository keeps no Devpost draft.
- **P8 so far.** T8.1 landed `scripts/seed.ts`, not yet run against production. T8.3 landed the root `README.md` and `docs/screens/`. `.github/workflows/` still holds only `_env-example.yml`.

## Rules for every P8 task

**Real calls, seeded history.** Orma is open, and anyone who signs up and consents gets real calls. The demo video records a real call to a real, consenting user. Only the history behind that call is seeded. No agent places a call during building or review. Every local and test run stays in dry run.

**Know the dry-run state before touching production.** `ORMA_DRY_RUN` is a function secret whose value cannot be read back. With dry run off, `tick` dials every profile that has a confirmed phone, live consent and an active slot. Before any production write, the operator states which mode production is in, and sets it again with `supabase secrets set` if unsure. Say in the review file that this happened.

**Production writes need the operator.** Build and test against `scripts/p6-local-stack.sh`. Running against the linked project, opening the pull request, uploading the video, and submitting Devpost or the survey all wait for the operator's explicit go-ahead.

**Disclose, never disguise.** Seeded rows are marked and named, on screen and in text. The call is real and is never described as synthetic. The README, the video and the Devpost text say the same thing.

**Mask every number.** No real phone number, name of a third party, key or token appears in any file, screenshot, frame or log.

## Operator-only steps

| Step | For | When |
|---|---|---|
| State production's dry-run mode | T8.1 | Before seeding production |
| Turn dry run off, and confirm the recording account's consent, number and slot | T8.4 | Before recording |
| Name the production account to seed | T8.1 | Before `--apply` |
| Create a private backup repository and a fine-grained token | T8.2 | Before the first scheduled run |
| Add the session pooler URL as a repository secret | T8.2 | Before the first scheduled run |
| Record the phone with scrcpy and upload publicly | T8.4 | After P9 deploys |
| Approve the fork, branch and pull request | T8.5 | After packaging passes review |
| Submit Devpost | T8.5 | Before submissions close |
| Submit the feedback survey | T8.6 | Before 18 September |

## Dates

Submissions close 14 September at 23:45 SGT, which is 21:15 IST. The feedback survey closes 18 September. Judging runs 30 September to 13 October. A free Supabase project pauses after seven days of low activity.

## Order

T8.1, T8.2, T8.3 and T8.6 share no files and start now. T8.4 needs T8.1 applied and P9 deployed. T8.5 needs T8.3 and T8.4.

---

### T8.1: Seed data and disclosure ★
```yaml
requires:   T1.1, T2.2
fixture-ok: yes
size:       S · frontier
owns:       scripts/seed.ts
status:     done
```
The demo needs history that no run of real calls produced, so the seed carries all of it.

**What the briefing needs.** `assemble_briefing` in `supabase/migrations/20260912160000_briefing.sql` counts every `item_mentions` row for an item. It ages an item from `since_date`, or from `created_at` when that is null, in the profile's timezone. It speaks "You've mentioned {text} {n} times." at three or more mentions and "It's been {n} days." at thirty or more. So the item text reads naturally after "mentioned", for example `the dentist`.

**What to seed, for one named account.**

- One item, `the dentist`, with `seeded = true`, `source = 'call'`, and `since_date` set to 34 days before the demo date in the profile's timezone.
- Three earlier call runs on three separate local dates, each `completed`, `answered_extracted`, `dry_run = true` and `billable = false`. Give each a stable idempotency key under `orma:seed:`, so a rerun changes nothing.
- One `item_mentions` row per seeded run for the item, each with an offset into that run's transcript.
- A synthetic `transcripts` row, a valid `results` row, and the `call_events` a dry-run run writes, for each seeded run. History, Patterns and Timeline then read coherently. Copy the shapes the dry-run dispatcher writes rather than inventing new ones.
- Optionally two or three more seeded items with fewer mentions, so Today does not look staged. Keep every one `seeded = true`.

**What not to seed.** Never a `scheduled` run, a slot, a consent row, a phone number or a pattern report. Seeded runs are terminal, so `tick` can never claim one. Patterns come from the real `analysis` function over the seeded rows, never from a hand-written report.

**The script.** Deno, run as `deno run scripts/seed.ts`. It reaches Supabase only through `ORMA_API_URL`, with `SUPABASE_SERVICE_ROLE_KEY`, because the admin API rejects the new-format secret key.

- `--email <address>` names the account. Refuse if it has no `profiles` row.
- `--demo-date <YYYY-MM-DD>` fixes the date the 34 days count to. Default to today in the profile's zone.
- No flag prints the plan, with masked output, and writes nothing.
- `--apply` writes. `--remove` deletes every seeded row for that account and nothing else. That is the rollback.
- Refuse `--apply` against a non-local URL unless `--i-confirmed-dry-run` is also passed.

**Disclosure text.** Write the paragraph the README and the video both use. It names the seeded item, the seeded runs and their dates, and says they are dry-run rows that no call placed.

**Done when:** against the local stack, a plan run writes zero rows, `--apply` twice leaves the same row counts, `--remove` leaves zero seeded rows. `assemble_briefing` for that account returns "You've mentioned the dentist 3 times." and "It's been 34 days." from rows. Every seeded row is found by one query on `seeded` items or `orma:seed:` keys, and the disclosure paragraph exists.

---

### T8.2: Keepalive and backup
```yaml
requires:   T1.1
fixture-ok: yes
size:       S · mid
owns:       .github/workflows/keepalive.yml, scripts/restore-check.sh
status:     in-progress (never ran; SUPABASE_POOLER_URL, BACKUP_REPO_TOKEN and BACKUP_REPO unset, backup repository not created; keepalive split into its own job 2026-09-15)
```
With no daily calls, nothing else keeps the project active through judging. A paused project stops `pg_cron` and takes the demo URL down before a judge opens it.

**One daily workflow, plus manual dispatch.**

1. **Activity.** A GET against PostgREST through `ORMA_API_URL`, with the publishable key as `apikey`. Fail the job on any status other than 200.
2. **Backup.** `pg_dump` with a Postgres 17 client, in custom format, pushed to the operator's private backup repository. Keep the newest 14 dumps and delete older ones.

**Reach the database through the session pooler.** `SUPABASE_DB_URL` points at the direct `db.<ref>` host. That host is IPv6 only on the free plan, and GitHub-hosted runners have no IPv6. The workflow reads a new secret, `SUPABASE_POOLER_URL`, the session-mode pooler string from the dashboard. It never prints it.

**Secrets and variables.** Copy the `env:` block from `.github/workflows/_env-example.yml` rather than writing one. Add only `SUPABASE_POOLER_URL`, `BACKUP_REPO` (a variable such as `nrynss/orma-backups`) and `BACKUP_REPO_TOKEN`. The token is fine-grained, with contents write on the backup repository only.

The dump holds phone numbers and consent rows, so it never lands in this repository, an artifact, or a log. Mask the job output.

**Restore check.** `scripts/restore-check.sh <dump>` restores a dump into a throwaway local Postgres 17 container and prints row counts per table. It never targets the linked project.

**Done when:** a manual dispatch passes both steps, the backup repository shows the dump, and `restore-check.sh` restores it locally with row counts matching production's own counts. After that, the workflow runs daily for a week and the project has not paused.

---

### T8.3: Submission README ★
```yaml
requires:   P2, P3, P4, P6, P7, soft P9
fixture-ok: yes
size:       M · frontier
owns:       README.md, docs/screens/
status:     done
```
The repository requires apps that place calls or create recurring jobs to document setup, side effects, cancellation, credential handling, and dry-run behaviour. All of it goes here. T8.5 adapts this file into the app README in the pull request, so write it to stand alone.

**Sections, in this order.**

1. **What Orma is.** One paragraph from `product.md` §1. The call arrives already knowing what you keep not doing.
2. **How the demo was made.** The call in the video is real. The history it reads is seeded by T8.1, and every seeded row is named.
3. **Try it without calling anyone.** Clone, `scripts/p6-local-stack.sh up`, run the web app against it, sign in as the seed account, and watch a dry-run call reach a terminal state on Timeline. Then `down`.
4. **Architecture.** The two Workers, the Supabase functions table from `spec.md` §6, the three cron jobs, and one diagram of a call's life from `spec.md` §3.
5. **Deploy your own.** `scripts/bootstrap-env.sh`, the three places secrets live, `supabase db push`, `supabase functions deploy`, the Vault key, the Telegram webhook, BotFather `/setdomain`, Resend, and both `npm run deploy` commands. Each step names its command.
6. **Side effects.** A table of every effect and its trigger: phone calls, cron jobs, email, Telegram messages, stored voice notes, and CALL-E spend.
7. **Cancellation.** Cancel today's call, pause all calls, revoke consent, and delete the account from Settings. For an operator, unschedule each cron with `cron.unschedule`, and set dry run back on.
8. **Dry run.** `ORMA_DRY_RUN` defaults to true. `ORMA_DRY_RUN_FIXTURE` selects `completed`, `failed` or `no_result`. Say what a dry run writes to `call_events`. Turning it off places real calls at $0.05 each after 20 free.
9. **Credentials.** The publishable key is the only key in the bundle, and the build fails if a secret key appears under `web/`. List what each secret is for, by name only.
10. **Consent and numbers.** E.164 only. Consent is a row with the wording shown. Numbers are masked in every sample.
11. **Surfaces.** Web, Telegram and MCP, linking `docs/mcp.md`. Name Telegram's Bot API, CALL-E, Gemini on Vertex AI, Resend, Supabase and Cloudflare under third-party integrations.
12. **Known limitations.** Missed calls are not retried, per `product.md` §10. Calls arrive from a number you will not recognise and may be flagged as spam, per `feedback.md` issue 9.
13. **Screens.** Phone screenshots from P9 in `docs/screens/`, captured from the local stack with seeded data. Add these last.

Every command in the README is run at least once while writing it. Every sample number is masked or from a reserved fictional range.

**Done when:** a separate agent with no other context follows sections 3 and 7 on a clean clone and succeeds. The review confirms every command runs, every side effect in the code is in the table, and no secret value or real number appears.

---

### T8.4: Demo video ★
```yaml
requires:   T8.1, T6.6, T6.8, P9, P10
fixture-ok: yes
size:       L · frontier
owns:       dev-diary/demo-video.md
status:     done
```
Under three minutes, public on YouTube or Vimeo. The operator records a real call on their own phone with scrcpy. An agent writes the script and the shot list in `dev-diary/demo-video.md`, and reviews the cut against it.

**The centre is one exchange, not a feature tour.**

> **Orma:** You've mentioned the dentist three times. It's been 34 days.
> **User:** Kill it.
> **Orma:** Done. It's gone.

That beat carries give-before-take and unpunished quitting together. Lead with the call arriving already knowing, not with scheduling. The list repository already ships a scheduler wrapper for reminders, so that ground is taken.

**The call is real.** CALL-E rings the operator's phone on a real slot, and the operator answers. The briefing reads the seeded rows, so "three times" and "34 days" come from SQL. "Kill it" on the call retires the item for real through the ingest. Caption the history as seeded, never the call.

The call's exact wording is the model's, so the script plans for the beat without forcing it. If a take misses it, schedule another slot and record again.

**Shot list, roughly.**

1. The incoming call, answered. Either start after it is answered, or show the unrecognised number and say the line from issue 9.
2. The exchange itself, in one unbroken take of real audio.
3. Today on the phone after the call, with the dentist retired and the receipt from the call.
4. History, the call's transcript with the retirement's evidence offset.
5. Timeline, the real run's steps in order.
6. Patterns, the report prose beside its facts, captioned as computed over seeded history.
7. Telegram on the same phone, the post-call receipt.
8. Settings, showing cancel today, pause and delete.
9. A closing card with the seed disclosure and the repository link.

**Recording.** Turn dry run off only for the recording window, with one consenting account, its own confirmed number and one slot a few minutes ahead. Use `scrcpy --record` at the phone's native resolution. Turn on do not disturb so no other notification lands in the frame. Nothing may stage a saved contact or a caller name.

**Done when:** `demo-video.md` holds the final script with timings under three minutes, the exchange is one unbroken real take, the seed disclosure is legible at phone size, every number shown comes from rows, the video is public, and its link is in `demo-video.md`.

---

### T8.5: Pull request and Devpost ★
```yaml
requires:   T8.3, T8.4, P10
fixture-ok: yes
size:       M · frontier
owns:       scripts/package-list-pr.sh, (operational)
status:     done
```
Open the pull request to `CALLE-AI/awesome-phone-call-agents` under `apps/`, then submit Devpost with that URL, the description, the video link, and the email on the CALL-E account. The live demo URL is optional and, given T8.2, worth including.

**The pull request carries the app itself.** Orma's own repository is private, so the PR is the public code. Recent app PRs to that repository ship full source.

Read `CONTRIBUTING.md`, `docs/community-review-policy.md`, `docs/git-naming-conventions.md` and the pull request template in that repository first. They change, and the review checks them as they are on the day.

**Package with a script.** `scripts/package-list-pr.sh <target-dir>` copies a clean tree into `apps/web/orma/` of a local checkout of the list repository, so every run produces the same result.

- **Include.** `web/`, `supabase/`, `scripts/`, `testdata/`, `docs/`, `.env.example`, and an app `README.md` adapted from T8.3.
- **Exclude.** `proxy/`, `dev-diary/`, `design/`, `AGENTS.md`, agent configs, every `.env`, `node_modules`, build output, and anything gitignored. The script excludes these itself, never by hand.
- **Without the proxy.** The web app and several functions refuse any API URL containing `supabase.co`, starting at `web/src/lib/supabase.ts:23`. The app README must say how a self-hoster points `ORMA_API_URL` at their project without the proxy, or the guard needs a contract change first.
- **Replace in the copy.** The `summary`, `evidence` and task text in `testdata/calle/` and in the inline fixture in `dispatch-mode.ts` still carry provider text that names the operator. Replace them with synthetic text in the packaged copy. Rerun the Deno tests inside the copy afterwards.
- **Scan the copy.** Fail on any phone-shaped string outside reserved fictional ranges, any key-shaped string, the operator's name, and any `supabase.co` project host.
- **Index.** Add one row for Orma to `apps/README.md`, in that table's format and tone.

**The list repository's review policy.** An app that needs private services must have a no-call path. The first run path in the app README is the local stack in dry run. Hosted Supabase and live CALL-E come after it, as opt-in steps. Real test-call artifacts and private transcripts are Must Fix.

**Their naming and checks.** Branch in `<type>/<short-kebab-summary>` form, such as `feat/orma-accountability-calls`. PR title `feat(apps): add Orma accountability calls`, or similar in their format. Fill in every item of their pull request template. Run `python3 scripts/validate_repository.py` in the checkout and pass it. English only.

**Devpost.** The description carries the same disclosure as the README: a real call over seeded history. Judging covers real world impact, quality of the idea, technical implementation, and product experience and demo, per `product.md` §9.

**Done when:** the packaged app runs from its README on a clean clone in dry run with no hosted service. The scan finds no real transcript, number, name or secret. `validate_repository.py` passes. The pull request is open and passing its checks, and the Devpost entry is submitted rather than saved as a draft.

---

### T8.6: Feedback survey
```yaml
requires:   none
fixture-ok: yes
size:       S · mid
owns:       dev-diary/feedback.md, feedback.md, dev-diary/feedback-survey.md
status:     not-started
```
A separate prize with its own deadline of 18 September and its own judging. One entry per entrant, rewarding actionable bug reports and interface suggestions.

**Sources.** `dev-diary/feedback.md` holds fifteen issues written as the work happened. A second file, `feedback.md` at the repository root, holds the T1.4 probe notes. Fold the root file's entries into `dev-diary/feedback.md` as issues in the same shape, then delete the root file.

**Write the submission.** `dev-diary/feedback-survey.md` is the text the operator pastes into the form. Each entry gives a title, what happened, reproduction steps, the evidence with call ids and masked numbers, what it cost, and the suggested fix.

Lead with three: the unsigned webhook, the missing call disposition, and numbers being unavailable in India. Those changed what Orma could be, and a reviewer can act on all three. Before leading with the third, confirm an issue in `feedback.md` actually records it. If none does, write it from evidence in the repository, or drop it from the lead and say why.

Issue 9 keeps its hypothesis that number rotation may cause the spam flag. Say plainly that no week of caller numbers was collected.

Include issue 10, what worked, briefly. Specific praise is useful feedback too.

**Done when:** every issue in `dev-diary/feedback.md` is either in the survey text or listed as deliberately dropped with a reason, every claim cites evidence in the repository, no key or real number appears, and the operator has submitted the form.
