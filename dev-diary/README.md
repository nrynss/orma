# Development Diary: Phase Handoffs

This document outlines the work breakdown for **Orma**.

Reference specifications:
- [`product.md`](product.md): What Orma is, why it is a phone call, and the rules that cannot bend.
- [`spec.md`](spec.md): Stack, schema, state machines, and everything that gets built.

Where a phase document and specification conflict, the specification wins. Record discrepancies in the handoff log.

Each document provides complete context for an engineer starting cold.

**Current status:** Not started. P0 Ground is the serial bottleneck and nothing runs before it.

The repository is at `github.com/nrynss/orma` on `main`. The Supabase project `orma` exists (`ap-south-1`), the repository is linked, `.env` is written, and sixteen function secrets are on the project. What remains in P0 is in [PHASE-0-ground.md](PHASE-0-ground.md). Email sends from `send.nryn.dev` on a sending-only key. The CALL-E path is proven by a real call and its payloads are in `testdata/calle/`. No value in `.env` is blank.

---

## Swarm Coordination Rule

> **Phase-level dependencies are advisory. Task-level dependencies are binding.**

Do not delay work for an entire phase to finish. If task `T6.3` requires only `T1.1` and `T5.3`, start immediately when those tasks complete.

**A call costs money and rings a real phone.** Task `T1.4` records one real CALL-E run of each terminal shape into `testdata/`, and `T2.8` builds the dry-run dispatcher. Tasks marked `fixture-ok` run against those recordings and never place a call. Only `T1.4`, `T2.5` and Phase P8 need live CALL-E.

This allows almost the whole system to be built offline. The web app, the MCP server, the Telegram bot and the analysis pass all develop against fixtures and a local Supabase.

---

## Phase Graph

| Phase | Document | Requires | Runs parallel with | Blocks |
|---|---|---|---|---|
| **P0** Ground | [PHASE-0-ground.md](PHASE-0-ground.md) | none | none | everything |
| **P1** Schema and contracts | [PHASE-1-contracts.md](PHASE-1-contracts.md) | P0 | none | downstream tracks |
| **P2** Call engine | [PHASE-2-call-engine.md](PHASE-2-call-engine.md) | P1 | P3, P4, P5, P7 | P7, P8 |
| **P3** Telegram | [PHASE-3-telegram.md](PHASE-3-telegram.md) | T1.1, T1.2 | P2, P4, P5, P6 | P7 (delivery), P8 |
| **P4** MCP server | [PHASE-4-mcp.md](PHASE-4-mcp.md) | T1.1, T1.2, T1.3 | P2, P3, P5, P6 | P8 |
| **P5** Auth and web shell | [PHASE-5-auth-shell.md](PHASE-5-auth-shell.md) | T0.5, T1.2 | P2, P3, P4 | P6, P8 |
| **P6** Web app | [PHASE-6-web-app.md](PHASE-6-web-app.md) | T5.3, soft P2 | P2, P3, P4, P7 | P8 |
| **P7** Analysis and receipts | [PHASE-7-analysis.md](PHASE-7-analysis.md) | T1.1, soft P2, T3.4 | P3, P4, P6 | P8 |
| **P8** Ship | [PHASE-8-ship.md](PHASE-8-ship.md) | P2, P5, P6, P7 | none | final submission |

```text
  P0 ──▶ P1 ──┬──▶ P2 call engine ──────────┐
              ├──▶ P3 telegram ─────┬───────┤
              ├──▶ P4 mcp ──────────┼───────┼──▶ P8 ship
              ├──▶ P5 auth shell ──▶ P6 web ┤
              └──▶ P7 analysis ◀────┘───────┘
```

Phases P0 and P1 form the serial bottleneck. Once the schema and the CALL-E fixtures freeze, development scales across five parallel tracks.

---

## Parallel Tracks

When Phase P1 completes, five tracks launch concurrently without path conflicts:

| Track | Phase | Live CALL-E? | First task | Readiness |
|---|---|---|---|---|
| **A: Call engine** | P2 | Only T2.5 | T2.1 | Everything else runs against `testdata/` recordings. |
| **B: Telegram** | P3 | No | T3.1 | Needs a bot token and Gemini, not CALL-E. |
| **C: MCP** | P4 | No | T4.1 | Pure database work behind the same RLS as the browser. |
| **D: Auth and shell** | P5 | No | T5.1 | Needs Supabase auth and a sender domain. |
| **E: Analysis** | P7 | No | T7.1 | Facts are SQL over fixture rows. |

Prioritise track A. Nothing in the demo exists without it, and it is the only track that has to run for days before submission.

---

## Task Pattern

Every task in the phase documents follows this template:

```markdown
### T2.4: Dispatch to CALL-E ★
requires:   T1.4, T2.3
fixture-ok: yes
size:       M · frontier
owns:       supabase/functions/_shared/calle.ts
status:     not-started
```

- **requires:** Binding task identifiers.
- **fixture-ok:** Whether the task can be completed without placing a real call.
- **size:** Scope estimation, from XS to XL.
- **class:** Which agent to send. Light, mid, or frontier.
- **owns:** File paths exclusively managed by this task.
- **status:** Current task state.

A star (★) marks tasks on the critical demo path.

---

## Developer Guidelines

1. **Claim before starting:** Update status to `claimed:<id>` in the corresponding phase document.
2. **Respect file ownership:** Do not edit files outside your assigned `owns` path.
3. **Freeze contracts after P1:** The Goal's published run spec and the database schema change together or not at all. Update `testdata/` alongside any type modification.
4. **Never place a call you did not mean to place.** Default every local and test run to dry mode. A call costs money and rings a real phone.
5. **Counts and ages come from SQL.** The model phrases them. If a number appears in a call or a report, a row produced it.
6. **Never trust a webhook body.** Record the event id, re-fetch the run, act on the re-fetch.
7. **Destructive actions carry evidence.** A retirement records the transcript offset where it was said.
8. **Mask numbers** in every sample, log line and document.
9. **Document handoffs:** Update the handoff log when finishing a phase or task.

---

### The two traps this project has

**Double-dialling.** The scheduler is the only component that can cost money and embarrass the product at the same time. Exactly-once dispatch is enforced twice over: a `FOR UPDATE SKIP LOCKED` claim so two ticks cannot take the same run, and a unique `idempotency_key` so a retried request cannot produce a second call. Neither is optional, and neither is a substitute for the other. A 409 from CALL-E means the key was reused with different inputs, which is a bug to fix rather than a condition to work around.

**Numbers the model made up.** "Three times" and "34 days" are the product. If the model is ever given the raw material to count, it will eventually count wrong on a call, and nobody will catch it because it sounds right. Counts are computed in SQL, rendered into scalar variables, and stored on the run before dispatch. The same rule governs the pattern report: if a number in the prose is not in the facts row, regenerate.

---

## Scope and Execution

All tasks defined across these documents will ship.

We size tasks for full completion rather than approximate implementation. If a task proves unwieldy, split it into subtasks and document the change in the handoff log.

If external blockers arise, record the root cause clearly in the handoff log and notify dependent tasks.

---

## Critical Path

The demonstration depends on this unbroken execution sequence:

```
Schema and RLS (T1.1, T1.2) -> Record CALL-E fixtures (T1.4)
  -> Materialise runs (T2.1) -> Assemble the briefing from SQL (T2.2)
  -> Claim and dispatch (T2.3, T2.4) -> Reconcile (T2.5, T2.6)
  -> Ingest result, write mentions and retirements (T2.7)
  -> Seed the aged item (T8.1) -> Run real calls across days (T8.2)
  -> Record the demo (T8.5)
```

Protect this core flow above auxiliary features. The line "You've mentioned the dentist three times, it's been 34 days" is produced by T2.2 reading rows written by T2.7, and everything else in the submission is scaffolding around it.

---

## Status Board

| Phase | Tasks complete | Status |
|---|---|---|
| P0 | 0 / 2 | Not started. T0.2 blocks every track that touches the hosted project. |
| P1 | 0 / 6 | Not started. Blocked on T0.2. |
| P2 | 0 / 9 | Not started. Blocked on P1. |
| P3 | 0 / 5 | Not started. Blocked on T1.1 and T1.2. Bot @orma_tele_bot is registered. |
| P4 | 0 / 3 | Not started. Blocked on T1.1, T1.2, T1.3. |
| P5 | 0 / 4 | Not started. Blocked on T0.5 and T1.2. |
| P6 | 0 / 6 | Not started. Blocked on T5.3. |
| P7 | 0 / 4 | Not started. Blocked on T1.1. |
| P8 | 0 / 7 | Not started. |

---

## Handoff Log

Entries are appended, never edited. One line per task or phase close, dated, naming what changed and what it unblocked.

_No entries yet._
