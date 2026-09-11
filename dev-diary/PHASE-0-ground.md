# P0: Ground

```yaml
id:       P0
size:     XS
requires: []
blocks:   [P5, P6]
parallel: no
```

**Goal:** A front door on the real hostname, and a way for a browser on this
machine to reach the project.

**Why this phase is nearly empty:** Everything else that was in it is done. The
repository is at `github.com/nrynss/orma`, private, default branch `main`, with
`.env` and build output ignored. The Supabase project `orma` exists in
`ap-south-1`, is linked, holds sixteen function secrets, and has `pg_cron 1.6.4`
and `pg_net 0.20.4` installed. The CALL-E path is proven by a real call whose
masked payloads are in `testdata/calle/`. The bot is registered, email sends from
a verified domain on a sending-only key, and Vertex answers.

Neither remaining task blocks P1 through P4. Those tracks have full database
access already, three ways over: the session and transaction poolers on
`aws-0-ap-south-1.pooler.supabase.com`, the management API, and the CLI, which
pushes migrations and deploys functions without touching the blocked hostname.

---

### T0.1: Cloudflare front door ★
```yaml
requires:   []
fixture-ok: yes
size:       S · mid
owns:       web/package.json, web/svelte.config.js, web/src/routes/+page.svelte
status:     not-started
```
Create the SvelteKit app with the Cloudflare adapter and deploy a single page.
The content does not matter. The certificate does.

Point `orma.nryn.dev` at the Pages project. Add `api.orma.nryn.dev` in front of
the Supabase functions host, so the webhook and MCP URLs are Orma's own from the
first deploy and never need changing later.

That proxy does a second job worth knowing about. Requests to it resolve to
Cloudflare and are fetched from Supabase on Cloudflare's network, which routes
around the local resolution problem in T0.2 for everything served under
`/functions/v1`. Deployed functions become reachable from this machine even while
T0.2 is open.

The zone id and account id are in `.env`. Pages authentication comes from
`wrangler login`, not from a token.

One trap will cost you an hour if nobody warns you. Wrangler auto-loads a project
`.env` and prefers a `CLOUDFLARE_API_TOKEN` found there over your OAuth login.
The zone-scoped token is therefore named `CF_DNS_API_TOKEN` on purpose. Do not
rename it back, and do not add `CLOUDFLARE_API_TOKEN` to `.env`, or every Pages
command fails with an authentication error that blames your login.

`nryn.dev` at the apex is already served by the `nrynss-github-io` Pages project,
and `inner-life.nryn.dev` by another. Orma takes the `orma` subdomain and leaves
both alone.

**Done when:** `https://orma.nryn.dev` serves the placeholder over a valid
certificate, and `https://api.orma.nryn.dev/functions/v1/` reaches Supabase from
this machine.

---

### T0.2: Resolve the project hostname locally
```yaml
requires:   []
fixture-ok: yes
size:       S · mid
owns:       docs/network.md
status:     not-started
```
This network resolves `*.supabase.co` to `202.83.21.15`. The true answer, over
DNS-over-HTTPS, is Cloudflare at `104.18.38.10` and `172.64.149.246`. Querying
`1.1.1.1` and `8.8.8.8` directly returns the hijacked address too, because port
53 is intercepted.

What that actually costs is narrow. The database, the management API and the CLI
are all unaffected. What fails is HTTPS to `pyuubklpkhjngiqqwypf.supabase.co`,
which means PostgREST and Auth cannot be reached by a browser or by `curl` on
this machine. The web app in P5 and P6 needs that; nothing before it does.

Pinning the real address works:

```bash
curl --resolve "$REF.supabase.co:443:104.18.38.10" "https://$REF.supabase.co/rest/v1/"
```

Pick a fix that survives a reboot and covers every tool, not only `curl`. A
DNS-over-HTTPS resolver on the machine is the clean option. Host-file pinning
works but goes stale when Cloudflare rotates.

Record the chosen fix in `docs/network.md`.

**Done when:** `curl` with no `--resolve` reaches `/rest/v1/` and
`/auth/v1/health`, a browser signs in against the hosted project, and the fix
survives a reboot.
