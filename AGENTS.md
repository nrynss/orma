# Orma: agent protocol

Binding for every human and coding agent working in this repository. It governs how work runs.
The product specification and the work breakdown live in [`dev-diary/`](dev-diary/). This file
does not repeat them.

Read this file in full before you change anything.

## The loop

Every task runs through the same cycle. Implement, review, remediate, re-review. Repeat until a
round returns APPROVE with zero findings across all severities.

1. **Implement.** Edit only the paths on your task's `owns` line. Stay inside that seam.
2. **Review.** A reviewer reads the diff against the specification and writes
   `dev-diary/adversarial-review/t<N>-round<K>.md`. It carries a verdict of REMEDIATE or APPROVE,
   findings counted by severity, and four columns per finding: where, what, pin, and mutation.
   Pin names the check that fails today. Mutation says what breaks if someone reverts the fix.
3. **Remediate.** A remediator fixes every finding and writes
   `dev-diary/adversarial-review/t<N>-remediation-round<K>.md`, one row per finding.
4. **Re-review.** Run the same review against the new commit, with an explicit claim of zero
   residue against every prior round.
5. **Land.** The orchestrator commits the approved task and writes the handoff log entry.

**Severities.** C breaks the demo. H is a real defect the demo survives. M is a real defect with
a workaround. L is polish.

**Every severity gets fixed.** "It is only an L" does not close a finding. A reviewer may record
a finding as a false positive. That judgement decides whether the defect is real, never whether a
real defect deserves a fix.

### The orchestrator may close a documentation finding directly

This is the one shortcut in the protocol. The orchestrator fixes the finding in the landing
commit with no remediation round and no re-review. All four conditions must hold.

1. The finding lives in documentation: markdown under `dev-diary/`, `docs/` or `README.md`, or a
   comment that does not describe behaviour.
2. The fix touches no code path, no migration, no policy, no configuration value, and no schema.
3. Confirming the fix needs reading, not running. Nothing has to be deployed, dialled or queried.
4. The review file records it by name and file, so the next round can see what was closed and by
   whom.

If any condition is arguable, it is not exempt. Send it back through remediation.

**Three things look like documentation and are not.** A comment that misdescribes behaviour
carries the severity of the behaviour it misdescribes, because the next agent codes against it.
A value in `.env.example` is configuration. A comment on a column, a policy or a migration is
part of the contract five tracks read.

## Four roles, kept separate

| Role | Does | Never does |
|---|---|---|
| **Orchestrator** | Picks the task. Dispatches the other three. Gates the loop and refuses to advance on a dirty verdict. Lands the commit. Closes exempt documentation findings. | Implement a task. Write a verdict. Decide a finding is not worth fixing. |
| **Implementation** | Builds the task inside its `owns` paths. Raises a contract change in the review file instead of reaching outside. | Review its own work. Mark the task done. |
| **Review** | Reads the diff against the specification. Writes the verdict, the counts, and the four columns. | Fix anything it found. Soften a finding because the fix looks expensive. |
| **Remediation** | Fixes every finding. Writes one row per finding. | Change the verdict. Fix things nobody found, which arrives unreviewed. |

**Use a fresh agent per role per round.** The round-two reviewer must differ from the round-one
reviewer, and neither may have implemented the task.

Two failures follow from reusing an agent. One that reviews its own work stops being adversarial.
One that both finds and fixes a defect narrows the finding until its existing fix looks
sufficient.

## A pin is a measurement, never a log line

This rule matters more here than anywhere else in the protocol, because this system reports on
itself more than most.

A call's own summary says the call went well. The extraction reports a validated result. The
function log prints that the run completed. All three are the thing under review, not evidence
for it.

So a pin observes the artifact independently. Query the database and count the rows. Read
`call_events` end to end. Send a request to the deployed function. Listen to the recording.
Sign in as a second user and try to read the first one's items. A reviewer who quotes program
output has not reviewed.

Two claims in this product can only be pinned by counting rows. "You have mentioned this three
times" is pinned by three rows in `item_mentions`, not by the sentence the call spoke. A number
in a pattern report is pinned by the matching field in `pattern_reports.facts`.

## Two things this repository must never do

**Double-dial a person.** It costs money and it embarrasses the product at the same moment.
Exactly-once dispatch is enforced twice over: a `FOR UPDATE SKIP LOCKED` claim so two ticks
cannot take one run, and a unique `idempotency_key` so a retried request cannot place a second
call. Neither is optional and neither substitutes for the other. A 409 from CALL-E means the key
was reused with different inputs. That is a bug to fix, never a condition to work around.

**Let the model produce a number.** Counts and ages are computed in SQL, rendered into scalar
variables, and stored on the run before dispatch. The model phrases them. A hallucinated count
sounds exactly as convincing as a real one, and nobody on the call can check it.

## Calls cost money and ring a real phone

`ORMA_DRY_RUN` defaults to true. A developer opts in to spending, never out of it.

Almost every task is marked `fixture-ok` and runs against the recorded CALL-E payloads in
`testdata/`, committed by T1.4. Only publishing the Goal, proving the poll timing, and the live
run across days need the real service.

A live call is evidence, never a gate. It needs a real key, it costs real money, and another
party's outage must not redden our build. Commit the probe rather than a pasted transcript, and
record the response shape alongside the verdict.

Every number that reaches a phone is masked in samples, logs and documents.

## Task shape and dispatch

Tasks live in `dev-diary/PHASE-*.md`. Each carries this block.

```yaml
requires:   T1.4, T2.3
fixture-ok: yes
size:       M · frontier
owns:       supabase/functions/_shared/calle.ts
status:     not-started
```

- **requires** binds. Task ids only, and they may cross phases.
- **fixture-ok** says whether the task can be completed without placing a real call.
- **size** estimates the work, from XS to XL. **class** says which agent to send.
- **owns** lists the paths this task writes. No two concurrent tasks may own the same path.
- **status** reads `not-started`, `claimed:<agent>`, or `done`. Claim by editing the line first.

**Phase-level requires is advisory. Task-level requires is binding.** Phases exist for reading.
Tasks exist for scheduling. Start when your own named upstreams land, not when a phase closes.

### Agent class

Size and class disagree on purpose. A tiny task can still need the strongest model available. The
schema and the briefing assembly are small files that five tracks build on.

| Class | Send it for |
|---|---|
| **frontier** | A decision others build on. Anything touching money, dispatch or access control. A specification that needs interpreting rather than transcribing. |
| **mid** | Well specified implementation, precise enough to follow literally. |
| **light** | Mechanical work that the test shipping with it verifies. |

## Scope

Every task in `dev-diary/` ships. Nothing carries optional status.

A task that turns out genuinely blocked becomes a finding, not a cut. Record it in the handoff
log, name every task that depends on it, and leave it on the board marked blocked. Never
reclassify it as something the project did not need.

A task too large to finish gets split. Add `T2.7a` beside `T2.7` and record the split.

An undocumented finish is an unfinished task. Write what exists now, what surprised you, and what
the next agent should not work out again.

## Stack, frozen

Supabase on the free plan, Postgres 17, for database, auth, storage, `pg_cron` and Edge Functions.
Deno for functions. SvelteKit with the Cloudflare adapter, deployed to Cloudflare Pages. CALL-E
for calls. Gemini via Vertex AI for transcription and prose. Resend over HTTP for email.

There is no server and no container. Nothing in this design needs a process that stays up, and
nothing should be added that does.

Three platform limits shape the code rather than merely constraining it. A free Edge Function
allows 150 seconds of wall clock and 2 seconds of CPU per request, which is why call follow-up
advances across ticks instead of looping. Outbound ports 25 and 587 are blocked, which is why all
mail goes over an HTTP API. Goal variables accept only strings, numbers and booleans, which is
why the briefing is flattened before it is sent.

## Secrets

Keep secrets out of the repository and out of the web bundle. Never export one in an interactive
shell, because that writes it to `~/.zsh_history`.

Required secrets carry no default. A missing one stops startup with an error naming the variable.
The anon key is the only key that reaches the browser. The service role key appearing anywhere
under `web/` fails the build.

## Documentation style

Four rules, covering markdown, comments and commit messages alike.

1. No semicolons. Split the sentence.
2. No em dashes. Use a full stop, a comma, or parentheses.
3. Sentences run 30 words at most.
4. Active voice, unless passive genuinely reads clearer.

Check before you write rather than after. A rewrite loses whatever it does not understand.

## Memory, where available

If this machine exposes the lambo MCP server, call `lambo_recall` before you start and
`lambo_derive` plus `lambo_record_action` after each meaningful change. Use one stable `agent_id`
for the session so locks and attribution stay coherent.

Treat lambo as an addition rather than a prerequisite. This file holds everything you need on its
own.

## Read order

1. This file, in full.
2. Your task's block in its `dev-diary/PHASE-*.md`.
3. The conventions in [`dev-diary/README.md`](dev-diary/README.md).
4. Any prior review rounds for your task.
5. The code you will edit, and its tests.

Then assert three things. I own every path I will edit. The shapes I need already exist. I can
validate this task on its own. If any part reads false, stop and propose a contract change in the
review file.
