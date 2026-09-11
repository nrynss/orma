# P0: Ground

```yaml
id:       P0
size:     XS
requires: []
blocks:   []
parallel: no
status:   complete
```

**Goal:** A front door on the real hostname, and a way for a browser on this
machine to reach the project.

Both tasks are closed. Nothing in P0 blocks anything now.

---

## What exists

| Thing | Where |
|---|---|
| Repository | `github.com/nrynss/orma`, private, default branch `main` |
| Supabase project | `orma`, ref `pyuubklpkhjngiqqwypf`, `ap-south-1`, Postgres 17.6 |
| Extensions | `pg_cron 1.6.4`, `pg_net 0.20.4` |
| Secrets | `.env` local, GitHub variables and secrets for cloud agents, sixteen Supabase function secrets |
| Web app | `https://orma.nryn.dev`, SvelteKit on the Cloudflare adapter |
| Front door | `https://orma-api.nryn.dev`, a Worker proxying the whole Supabase API |
| Telegram | `@orma_tele_bot`, registered, no webhook yet |
| Email | `send.nryn.dev`, verified, sending-only key |
| CALL-E | Proven by a real call, masked payloads in `testdata/calle/` |

Deploys are `npm run deploy` in `web/` and in `proxy/`.

No machine needs the local `.env`. `./scripts/bootstrap-env.sh` rebuilds it from
the environment, and GitHub holds every value as a repository variable or secret.

---

## T0.1: Cloudflare front door — done

Cloudflare folded Pages into Workers, so the app ships as a Worker with a static
asset binding rather than a Pages project. `web/wrangler.jsonc` carries the
account id, because account listing fails for this login and the deploy would
otherwise stop to ask.

Two things will bite whoever touches this next.

**Wrangler auto-loads a project `.env` and prefers a `CLOUDFLARE_API_TOKEN`
found there over the OAuth login.** The zone-scoped token is named
`CF_DNS_API_TOKEN` for exactly that reason. Do not rename it back, or every
deploy fails with an authentication error that blames your login.

**The asset directory is rebuilt on every build, so `.assetsignore` has to be
rebuilt with it.** The `build` script writes it after `vite build`. Without it
the deploy refuses, because `_worker.js` would be published as a public asset.

`nryn.dev` at the apex belongs to `nrynss-github-io` and `inner-life.nryn.dev`
to another project. Orma took `orma` and `orma-api` and left both alone.

---

## T0.2: Reaching the project — done, by routing around it

The network still resolves `*.supabase.co` to `202.83.21.15` while the true
answer is Cloudflare. That was not fixed. The dependency on it was removed.

`orma-api.nryn.dev` is a Worker that rewrites the Host header and passes every
Supabase path through: `/rest/v1`, `/auth/v1`, `/functions/v1`, `/storage/v1`
and `/realtime/v1`. Requests resolve to Cloudflare and are fetched from Supabase
on Cloudflare's network, so the local block never applies.

Verified by creating a row, reading it back through the proxy with the public
key, and confirming the same request to the project host still fails:

```
orma-api.nryn.dev/rest/v1/_front_door_probe   HTTP 200  [{"id":1,...}]
<ref>.supabase.co/rest/v1/_front_door_probe   HTTP 000
```

The probe table was dropped afterwards.

**Use `ORMA_API_URL` everywhere, never the project host.** That is what makes the
web app work on this machine, and it also means the webhook and MCP URLs stay
Orma's own if the Supabase project is ever replaced.

One limitation worth knowing. Cloudflare's free certificate covers `nryn.dev`
and `*.nryn.dev`, one level only. `api.orma.nryn.dev` was tried first and failed
its TLS handshake for want of a certificate. Any future hostname stays one level
deep.
