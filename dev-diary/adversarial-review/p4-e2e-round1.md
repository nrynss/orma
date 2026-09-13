# P4 e2e round 1 review

## Verdict

**APPROVE**

| C | H | M | L |
| --- | --- | --- | --- |
| 0 | 0 | 0 | 0 |

Phase P4 is a working MCP server in the repository and the same server in the
deployment. I drove the documented judge journey against the live endpoint
under a throwaway account and reproduced every claim in `docs/mcp.md`. Every
per-task verdict stands. This review reopens no task seam that its own review
closed. It records what the phase looks like as one product.

## Findings

None. Every pin below measured true.

## What I measured, and how

Every claim below comes from a live HTTPS request, a real database row, or a
suite I ran myself. No module summary, board line, or handoff sentence counts
as evidence. Deno 2.9.6 on PATH. My working tree is one web design commit
ahead of the pushed tip, and `git diff 040a562..HEAD` over `supabase/`,
`proxy/` and `docs/` is empty, so everything I ran locally is the pushed tip
byte for byte.

Scratch files, all disposable and outside the repository:

* `/tmp/p4e2e/journey.ts`, the live driver, 32 named checks
* `/tmp/p4e2e/cleanup.ts`, idempotent deletion and verification
* `/tmp/p4e2e/probe-ids*.json`, one file per driver run

### 1. The clean client journey from docs/mcp.md

Credentials: I created two throwaway users through
`${ORMA_API_URL}/auth/v1/admin/users` under `SUPABASE_SERVICE_ROLE_KEY`. The
endpoint rejected no legacy key. I inserted one `public.profiles` row per user
by hand. Each user took a password grant with `apikey: SUPABASE_ANON_KEY` and
no other credential. The grant answered `expires_in` 3600 both times.

Client: the snippet from `docs/mcp.md` needs only a token. I sent one header,
`Authorization: Bearer <token>`, plus `Accept: application/json,
text/event-stream`. No `apikey` header touched this surface, and every call
succeeded without one. The driver passed 32 of 32 checks.

* initialize answered 200 with `protocolVersion` 2025-03-26 and `serverInfo`
  `orma` 0.1.0. The initialized notification answered 202.
* tools/list named exactly `add_item`, `list_items`, `retire_item`,
  `set_slot`, `get_last_call`, `get_patterns`, in the doc's order.
* `add_item` with padded text returned the ten documented fields, trimmed,
  with `source` `mcp`, `status` `open`, and my user id.
* `list_items` returned the item, then dropped it after retirement.
* `retire_item` answered `reversible` true, `retired_surface` `mcp`,
  `retired_by` my id, and `retired_reason` `mcp:<uid>:p4 probe: note with
  colon`. A colon inside the note survives the round trip.
* `set_slot` stored `08:30` as `08:30:00`, defaulted weekdays to 1 through 7
  and `active` to true.
* `get_last_call` and `get_patterns` answered `null` on the fresh account.
* The documented failure shapes hold. A missing token answered 401 with code
  -32001, id null, and message `unauthorized: missing bearer token`. A
  malformed token answered the same shape with `unauthorized: invalid or
  expired token`. A wrong user's `retire_item` answered the documented tool
  error, and so did a nonexistent id.

Two earlier driver runs aborted on bugs in my own script, not in the product.
One bug read the tool payload through the wrong envelope path. One expected
wrong field sort order and demanded a retired item still be listed. I fixed
the driver and re-ran the whole journey from scratch rather than patch results.

### 2. Authorisation as a unit

User B proved its rows exist through B's own token and through a service role
read: one item in `items`, one slot in `slots`, plus a hand-planted
`call_runs` row and a hand-planted `pattern_reports` row. User A then attacked
every tool against those rows.

* A's `list_items` returned neither B's item nor A's own retired item.
* A's `retire_item` on B's item returned the documented error. The stored B
  row stayed `open` with a null `retired_reason` after the attempt.
* A's `set_slot` with B's `slot_id` returned `slot not found or not owned`.
  The stored B slot kept `19:00:00` and `evening` after the attempt.
* A's `get_last_call` and `get_patterns` answered `null` while B's own tokens
  read the planted rows back with the facts attached.
* No tool accepts a `user_id` argument, so no insert path can write into
  another user's scope.

`grep -rin service supabase/functions/mcp/` finds no service role reference.
The only client the handler builds uses the anon key plus the caller's bearer
token, so every query runs under the caller's row-level security.

### 3. Destructive evidence and the restore path

I read the stored `items` row through the service role after retiring, not
just the tool response. The row carried `status` `retired`, a real
`retired_at`, and `retired_reason` `mcp:<caller id>:<note>`. Who and surface
live in the database, so they survive any client that reads the row later.
`reversible` is computed from those durable fields in `handlers.ts`, not
hardcoded. The restore path took a web-shaped PATCH under the caller's token,
answered with the row `open` and both retired fields null, and the item
re-entered `list_items` on its id.

### 4. Deployed tip

The live endpoint behaves like the pushed tip on two behaviours an older
deploy would lack. My initialize against `/mcp/` answered 200, which needs
the trailing slash mapping from T4.2a commit `545ad96`. My retire response
carried `reversible` true and the `mcp:<uid>:<note>` encoding, which need the
T4.2 remediation commits `fd2381e` through `1278e49`. The endpoint also
speaks protocol version 2025-03-26, the constant at the tip.

### 5. Suites on the pushed tip

```
deno check supabase/functions/mcp/index.ts                  clean
deno check supabase/functions/mcp/tools/tools_tests.ts      clean
deno test --allow-net --allow-env --allow-read \
  supabase/functions/mcp/index.ts                           14 passed, 0 failed
deno test --allow-net --allow-env --allow-read \
  supabase/functions/mcp/tools/tools_tests.ts               9 passed, 0 failed
```

### 6. Contract change ledger

Every recorded ask is landed in the code.

* `t4.1-contract-change.md` ask 1. `proxy/src/index.ts` maps `/mcp` and
  `/mcp/` onto `/functions/v1/mcp` and nothing deeper. Measured live.
* `t4.1-contract-change.md` ask 2. `supabase/config.toml` carries
  `[functions.mcp] verify_jwt = false`. The handler itself answers a missing
  or expired token with the clean -32001 error, which I measured.
* `t4.2-contract-change.md` asks 1 through 4. `index.ts` imports
  `registerOrmaTools` from `./tools/mod.ts`, `createOrmaMcpServer` takes the
  authenticated user, one registration call replaces the stub loop, and
  `createMcpHandler` passes the user through. `TOOL_NAMES` keeps one
  definition in `tools/types.ts`, re-exported through `tools/mod.ts`.
  `notImplementedResult` has no references left anywhere.

### 7. Board and document coherence

All four P4 task blocks read `done`, and the status board row reads P4 4 of 4
complete with the URL and the docs path. Each flip landed in a landing
commit: `8a30d6d` for T4.1, `545ad96` for T4.2 and the T4.2a block, `040a562`
for T4.3. Handoff entries for T4.2, T4.2a and T4.3 sit in `dev-diary/README.md`.
The `owns` lines match `git log --stat` for every phase commit: T4.1 commits
touch `supabase/functions/mcp/index.ts` only. T4.2 commits touch
`supabase/functions/mcp/tools/` only. T4.2a commit `545ad96` touches exactly
its four owned paths, including the four sanctioned fixture lines in
`tools/double.ts`. T4.3 commit `040a562` publishes `docs/mcp.md` plus the
landing diary hunks. No status outruns the evidence I gathered.

`docs/mcp.md` stays truthful against today's live probe. Every worked example
reproduces its documented shape key for key. The doc says restores arrive with
the web app, and `grep` finds no restore surface in `web/src`, which matches
P6 being not started. A mechanical scan finds no semicolon, no em or en dash,
and no prose sentence over 30 words. The flagged long lines are JSON and code
blocks, not prose.

### 8. What P8 inherits

The judge-ready URL works from a clean client with one token substitution.
The auth story is one bearer header, no `apikey`, and the refusal shapes are
clean protocol errors rather than 500s. The docs match the deployment on
every claim I drove. Probe residue is zero, as the next section records.

## Cleanup and deletion verification

Four driver runs created eight throwaway users in total. The cleanup script
counts rows for every probe id before deleting and verifies each deletion
after. It is idempotent and I ran it twice.

Before deletion, across the eight probe user ids: 8 `items` rows, 4 `slots`
rows, 8 `profiles` rows, 1 `call_runs` row, 1 `pattern_reports` row.

Probe user ids, for audit:

```
01affa1e-b7d9-4747-8403-abea6774135d  b3366d39-a57f-4b6b-b7e3-3c158cd73704
7d457eab-b201-4e01-b6fd-1bdb3e9ed59b  f19b0957-249d-4ca5-8fd0-a37fef8bee6a
8ed5205b-0b13-4a0f-941e-43b95dc0fbb7  d7283e73-7539-4346-9747-cd983400b7c0
7a257f44-4f61-4b02-a2f8-4269e6c9461f  a3dece6f-3db1-4512-b66e-36c4c0594f24
```

After deletion: 0 rows in `items`, `slots`, `profiles`, `call_runs` and
`pattern_reports` for every probe id. All eight auth admin deletes answered
200 and all eight follow-up reads answered 404. The whole system reads 0
profiles and 0 auth users right now. No probe row survives.

## Residual notes, filed as no defect

* `add_item` forwards `since_date` to Postgres unvalidated. A malformed value
  returns a clean tool error from the date column and corrupts nothing.
* The doc lumps expired and malformed tokens together. They share the
  `auth.getUser` failure path, and I measured the malformed branch live. A
  genuinely expired token waits an hour, so I did not hold one.
* Live probing covered `set_slot` insert and the cross-user update refusal.
  The own slot update is pinned by the colocated suite, and the insert
  defaults match the doc.
