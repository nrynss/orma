# P4: MCP server

```yaml
id:       P4
size:     S
requires: [T1.1, T1.2, T1.3]
blocks:   [P8]
parallel: [P2, P3, P5, P6]
```

**Goal:** Let an agent add, read and retire without a browser, under exactly the same access rules as the web app.

**Why it is cheap:** The policies from T1.2 already do the authorisation. This phase is a transport and six thin tools.

---

### T4.1: Transport and authorisation
```yaml
requires:   T1.2, T1.3
fixture-ok: yes
size:       M · mid
owns:       supabase/functions/mcp/index.ts
status:     done
```
Streamable HTTP in stateless mode, served at `orma-api.nryn.dev/mcp`. Stateless suits a function, because there is no session to hold between requests.

Authorisation is the caller's Supabase JWT. The server creates a client with that token and never uses the service role, so every tool runs under the same row-level security as the browser. A missing or expired token is a clean protocol error, not a 500.

**Done when:** a client lists tools with a valid token, an anonymous client is refused, and a token belonging to one user cannot read another user's items through any tool.

---

### T4.2: The six tools
```yaml
requires:   T4.1
fixture-ok: yes
size:       M · mid
owns:       supabase/functions/mcp/tools/
status:     done
```
`add_item`, `list_items`, `retire_item`, `set_slot`, `get_last_call`, `get_patterns`.

`add_item` writes with `source = 'mcp'`. `set_slot` writes the slot directly, because unlike the call this surface is authenticated and explicit.

`retire_item` is destructive, so it records who retired it and through which surface, and it stays reversible from the web app. Being allowed to drop something honestly is what keeps the rest of the list truthful, and that holds here as much as on a call.

`get_patterns` returns the latest `pattern_reports` row, facts included, so an agent gets the numbers rather than only the prose.

**Done when:** each tool round-trips against a fixture database, `retire_item` records its surface and is reversible, and every tool fails cleanly on a row the caller does not own.

---

### T4.2a: Wire tools, proxy path and gateway auth
```yaml
requires:   T4.2
fixture-ok: yes
size:       S · mid
owns:       supabase/functions/mcp/index.ts, proxy/src/index.ts, supabase/config.toml, supabase/functions/mcp/tools/double.ts
status:     done
```
Carries the T4.2 contract change plus the two T4.1 residuals. `index.ts` imports
`registerOrmaTools` from `./tools/mod.ts`, passes the authenticated user into
`createOrmaMcpServer` and drops the stub loop. The proxy maps `/mcp` to
`/functions/v1/mcp`, so the published URL stays `orma-api.nryn.dev/mcp`.
`supabase/config.toml` sets `[functions.mcp] verify_jwt = false`, because the
handler turns a missing or expired token into a clean protocol error itself. It
also carries four sanctioned lines in `tools/double.ts`, the fixture
reconciliation for call-engine columns that landed after T4.2 froze.

**Done when:** through `index.ts`, a clean MCP client initialises, lists the six
tools and round-trips one tool under a fixture client, an anonymous request
still fails as a protocol error, and the function test suite stays green.

---

### T4.3: Published configuration
```yaml
requires:   T4.2, T4.2a
size:       XS · light
owns:       docs/mcp.md
status:     not-started
```
The snippet a judge pastes into a client, with the real URL, the auth header, and one worked example per tool.

This is a submission artefact. The rules explicitly reward integrating MCP to build on agent environments, and a config that does not work first time spends that credit badly.

**Done when:** the documented snippet connects from a clean client with no edits beyond a token.
