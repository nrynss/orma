# P0: Ground

```yaml
id:       P0
size:     S
requires: []
blocks:   everything
parallel: no
```

**Goal:** A network that can reach the project, and TLS on the real hostname.

**Why this phase runs serially:** No track can test against the hosted project until T0.2 lands.

The repository is on git at `github.com/nrynss/orma`, private, default branch
`main`, with `.env` and build output ignored.

The CALL-E path is already proven. One real call on 11 September returned a
validated `structured_result`, transcript turns carry `speaker` and
`offset_seconds`, and the payloads are in `testdata/calle/`. The prompt lives in
[docs/calle-call.md](../docs/calle-call.md) and is iterated in T8.2, not here.

---

### T0.2: Reach Supabase from this network ★
```yaml
requires:   []
fixture-ok: yes
size:       S · mid
owns:       scripts/dev-dns.sh, docs/network.md
status:     not-started
```
This network resolves `*.supabase.co` to `202.83.21.15`. The real answer, confirmed over DNS-over-HTTPS, is Cloudflare at `104.18.38.10` and `172.64.149.246`. Every request to the project fails with a TLS end-of-file, and port 5432 is unreachable.

Pinning the real address works:

```bash
curl --resolve "$REF.supabase.co:443:104.18.38.10" "https://$REF.supabase.co/rest/v1/"
```

Pick a fix that survives a reboot and covers every tool, not only `curl`. A DNS-over-HTTPS resolver on the machine is the clean option. Host-file pinning works but goes stale when Cloudflare rotates.

The Supabase CLI management commands work already, because `api.supabase.com` is unaffected. It is the project subdomain and the database host that fail.

Record the chosen fix in `docs/network.md`, because every agent on every track hits this on their first request.

**Done when:** `curl` with no `--resolve`, `psql` against port 5432, and `supabase db push` all reach the project, and the fix survives a reboot.

---

### T0.5: Cloudflare DNS and Pages skeleton
```yaml
requires:   []
fixture-ok: yes
size:       S · mid
owns:       web/package.json, web/svelte.config.js, web/src/routes/+page.svelte
status:     not-started
```
Create the SvelteKit app with the Cloudflare adapter and deploy a single page. The content does not matter. The certificate does.

Point `orma.nryn.dev` at the Pages project. Add `api.orma.nryn.dev` as a proxy in front of the Supabase functions host, so the webhook and MCP URLs are Orma's own from the first deploy and never need changing later.

The zone id and account id are already in `.env`, and Pages authentication comes from `wrangler login` rather than from a token.

One trap will cost you an hour if nobody warns you. Wrangler auto-loads a project `.env` and prefers a `CLOUDFLARE_API_TOKEN` found there over your OAuth login. Our zone-scoped token is therefore named `CF_DNS_API_TOKEN` on purpose. Do not rename it back, and do not add `CLOUDFLARE_API_TOKEN` to `.env`, or every Pages command fails with an authentication error that blames your login.

`nryn.dev` at the apex is already served by the `nrynss-github-io` Pages project. Orma takes the `orma` subdomain and leaves the apex alone.

**Done when:** `https://orma.nryn.dev` serves the placeholder over a valid certificate, and `https://api.orma.nryn.dev/functions/v1/` reaches Supabase.
