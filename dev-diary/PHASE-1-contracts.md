# P1: Schema and contracts

```yaml
id:       P1
size:     M
requires: []
blocks:   [P2, P3, P4, P5, P7]
parallel: no
```

**Goal:** Freeze the database schema, the access policies, the generated types and the recorded CALL-E payloads that every other track develops against.

**Why this phase runs serially:** Five tracks launch the moment it closes, and all five read the same tables under the same policies. A schema change after this point costs five rebases.

Nothing blocks it. P0 is complete, the project is linked, and `pg_cron` and
`pg_net` are installed.

---

### T1.1: Core migrations ★
```yaml
requires:   []
fixture-ok: yes
size:       L · frontier
owns:       supabase/migrations/
status:     done
```
Write every table in `spec.md` §2 as ordered migrations: `profiles`, `consents`, `slots`, `items`, `item_mentions`, `commitments`, `call_runs`, `call_events`, `transcripts`, `results`, `pattern_reports`, `deliveries`, `webhook_events`.

Three constraints carry weight and must be enforced in the database rather than in application code:

* `call_runs.idempotency_key` is unique. This is half of the guarantee that Orma never double-dials.
* `profiles.phone_e164` matches `^\+[1-9]\d{7,14}$`, which is the pattern CALL-E itself enforces.
* `profiles.display_name` is `not null`. Unset, the agent cannot answer the first question anyone asks.

Index `call_runs (state, scheduled_for)` for the tick, `item_mentions (item_id, created_at)` for the counts, and `call_runs (user_id, local_date)` for the history view.

Add a trigger maintaining `profiles.updated_at`.

The acceptance test does not need a local runtime. The migration can be applied
to the project and measured there, through the management API, which works on
this network when the project host does not. Either path is a real measurement.
Quoting the migration file is not.

**Done when:** the migration applies clean from empty, a test proves the unique
`idempotency_key` and the `phone_e164` check each reject a bad row, and `EXPLAIN`
shows the tick predicate using its index rather than a sequential scan.

---

### T1.1a: Scheduler extension migration history
```yaml
requires:   T1.1
fixture-ok: yes
size:       XS · mid
owns:       supabase/migrations/20260911122907_*.sql, supabase/migrations/20260911130516_*.sql
status:     done
```
The linked project already has the two scheduler-extension migrations in its
history. Their local files were lost before the repository was created.

Reconstruct the idempotent extension declarations from the live extension
catalogue and commit them under the exact remote versions. Do not repair remote
history. A repair would claim the extensions never ran while leaving them active.

**Done when:** `supabase migration list --linked` reports matching local and
remote history, and `supabase db push --linked` can apply the approved RLS
migration without a migration-history repair.

---

### T1.2: Row-level security policies ★
```yaml
requires:   T1.1
fixture-ok: yes
size:       M · frontier
owns:       supabase/migrations/*_rls.sql
status:     done
```
Enable RLS on every table. No exceptions, including the ones only functions write.

Owner-readable and owner-writable: `profiles`, `consents`, `slots`, `items`, `item_mentions`, `commitments`.

Owner-readable, service-role-writable only: `call_runs`, `call_events`, `transcripts`, `results`, `pattern_reports`, `deliveries`.

Service role only, not readable by any user: `webhook_events`.

The web app and the MCP server both run under these policies with the caller's JWT. There is no bespoke API in front of the database, so a missing policy is a data leak rather than an inconvenience.

**Done when:** a test signs in as two separate users and proves that neither can read, update or delete a single row belonging to the other across every table, and that an anonymous client reads nothing at all.

---

### T1.3: Generated types
```yaml
requires:   T1.1
fixture-ok: yes
size:       XS · light
owns:       web/src/lib/database.types.ts, supabase/functions/_shared/database.types.ts, web/package.json
status:     done
```
Generate TypeScript types from the live schema and commit them to both consumers. Add a script that regenerates and fails CI if the committed types drift from the migrations.

**Done when:** `npm run types:check` fails on a schema change that was not regenerated.

---

### T1.4: CALL-E fixtures ★
```yaml
requires:   []
fixture-ok: no
size:       S · mid
owns:       testdata/calle/, supabase/functions/_shared/fixtures.ts, docs/calle-call.md
status:     done
```
This task is what lets four tracks develop without spending money.

Three files already exist from the 11 September call, with the number masked:
`call-completed.json`, `call-completed-events.json` and `transcript.json`.

One shape is still missing: `call-failed.json`, a call that ended `failed`, with
`failure_code` and `failure_message` verbatim. It is produced against a number
that does not answer, so it costs no conversation, but it does place a real call.

**That call needs operator authorization before you place it.** Do not invent the
shape from the completed one. A fabricated fixture teaches four tracks the wrong
contract and nobody finds out until a real failure arrives.

Webhook captures are NOT in this task. They cannot be taken until an endpoint
exists to receive them, which is T2.6, so they are captured there. Until then the
poll path in T2.5 covers the same ground.

Record the observed `failure_code` values in `docs/calle-call.md` as they appear.
Nothing branches on them, since missed calls are out of scope, but the vocabulary
is worth having.

**Done when:** the failed shape is committed with its number masked, and
`supabase/functions/_shared/fixtures.ts` returns every file in `testdata/calle/`
as typed objects.

---

### T1.5: Result schema validation ★
```yaml
requires:   T1.4
fixture-ok: yes
size:       M · frontier
owns:       supabase/functions/_shared/result.ts
status:     done
```
Implement the null-or-correct rule in Orma's own code, so a malformed result is caught before it reaches the database rather than after.

Validate an incoming `structured_result` against the Goal's published result schema. On any failure the whole object is discarded and the run records `answered_no_result`. A partial object is never written.

Parse `evidence_offset_seconds` on every destructive disposition and reject a retirement that arrives without one.

**Done when:** the recorded valid fixture parses into typed values, the invalid fixture yields null with a recorded reason, and a hand-mutated fixture missing an evidence offset is rejected rather than partially applied.

---

### T1.6: Local seed and reset
```yaml
requires:   T1.1, T1.2
fixture-ok: yes
size:       S · light
owns:       supabase/seed.sql
status:     done
```
A local database that resets into a usable state. One profile, one slot, four items of varying age, one completed call run with a transcript and mentions.

This is development scaffolding and is distinct from T8.1, which seeds the real project and must be disclosed.

**Done when:** `supabase db reset` leaves a database the web app can sign into and browse.
