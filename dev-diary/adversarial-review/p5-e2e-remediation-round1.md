# P5 e2e remediation round 1

Fixes every finding from `p5-e2e-round1.md`. One row per finding.
This does not change the verdict. T5.1 to T5.4 stay `done`.

| Finding | What changed | Pin | Mutation |
| --- | --- | --- | --- |
| F1 C | Login calls `postAuthTelegram(user)` with `content-type` only. No Authorization. The handler treats anon key, garbage, or expired bearer as missing and takes the telegram-first path. | Deno 13 passed. Live no-Authorization POST 200 in 701 ms with a session. Live anon-key Bearer POST 200 in 579 ms for the same id. `GET /auth/v1/user` with that anon Bearer returned 403 and no id. One-byte hash flip 401. Live login JS `5.BqNaqOt1.js` has no `authorization`. Helper `Chvwe-w2.js` sets Bearer only when `t?.accessToken` is set. | Put the publishable key in Bearer on `/login`, or 401 a non-user bearer again. Continue with Telegram on the front door returns 401 and no JWT. |
| F2 H | Settings hosts the Login Widget. Signed-in attach posts with `Authorization: Bearer ${session.access_token}` and `apikey` as the publishable key, then `setSession`. Mint and unlink stay as bot messaging. | Live Settings JS `4.BpSt5aHe.js` calls `E(e,{accessToken:t})` and shows Sign-in identity plus Mint Start link. Email user plus that user Bearer returned the same id. A later no-bearer widget kept that id and the probe email, not a second `tg-` user. | Remove the Settings widget, or post it without the user JWT. An email user who later uses Telegram on `/login` mints `tg-…@telegram.invalid`. |

## Commands

`deno test --allow-net --allow-env --allow-read supabase/functions/auth-telegram/index.ts` exited 0.
13 passed, 0 failed, in 26 ms.

`cd web && npm run check` exited 0. It printed `secret-key check passed`, then
`telegram-link header check passed`, then `auth-telegram header check passed`,
then `onboarding check passed`, then svelte-check with 0 errors and 0 warnings.

`cd web && npm run build` succeeded.

## Deploy

`supabase functions deploy auth-telegram` succeeded.
Live `auth-telegram` is version 4, updated 2026-09-13 20:00:46 UTC.

`cd web && npm run deploy` succeeded. Wrangler used OAuth.
`CLOUDFLARE_API_TOKEN` was not set. Worker version
`28cb2f52-7e3e-4009-8681-9b97cc590eab` is on `orma.nryn.dev`.
Created 2026-09-13T20:01:10.905Z.

## Live pins

API host `https://orma-api.nryn.dev`. App host `https://orma.nryn.dev`.
HTTP `Date` on `/login` was 13 Sep 2026, 20:03:29 GMT.
`.env` was read privately. No secret, JWT, or phone number is written here.

OPTIONS returned 204. Allow-Origin was `https://orma.nryn.dev`, not `*`.
Allow-Headers listed `content-type, authorization, apikey`. GET returned 405.

Valid HMAC, no Authorization, returned 200 in 701 ms with `expires_in` 3600.
User id `f8e350cb-e360-4f44-854e-12b7cb4115d4`. Email kind `tg-…@telegram.invalid`.

Valid HMAC, Authorization Bearer equal to the publishable anon key, returned 200
in 579 ms. Same user id as the no-Authorization POST. That is the F1 control.

`GET /auth/v1/user` with the anon bearer still returned 403 and no id.
The handler no longer treats that 403 as a failed login.

A one-byte hash flip returned 401 `unauthorized` in 194 ms and no session.

Admin created `p5e2e-r1-attach@probe.nryn.dev`. Password grant returned that
user JWT. Widget POST with that Bearer returned 200 in 583 ms for the same id
`aa754ef6-4a45-44b2-8476-534d3139c1d3`. Email stayed the probe address.
`app_metadata.telegram_user_id` was `9015140202`.

A later no-bearer widget POST returned 200 in 740 ms for that same id.
Email kind stayed the probe address, not `tg-…@telegram.invalid`.

Live login node `5.BqNaqOt1.js` has title `Sign in · Orma` and calls the helper
as `await D(e)` with no second argument. It contains no `authorization`.
Live Settings node `4.BpSt5aHe.js` has `Sign-in identity` and `Mint Start link`.
It calls `E(e,{accessToken:t})`.
Live helper `Chvwe-w2.js` posts to `/functions/v1/auth-telegram` with
`content-type` only unless `t?.accessToken` is set, then
`authorization: Bearer ${t.accessToken}` and `apikey` as the publishable key.

Old login node `5.BqU8arRn.js` is not referenced from the live `/login` entry
`start.DN1i_rID.js`.

## Cleanup

Probe users were deleted through the admin API. Readback was 404 for each id.
`GET /auth/v1/admin/users` lists 0 users.
`profiles`, `consents`, `slots`, `items`, and `telegram_link_tokens`
(`select=token_hash`) each report `Content-Range: */0`.

Probe ids, for audit:

```
f8e350cb-e360-4f44-854e-12b7cb4115d4  tg-9015140201@telegram.invalid
aa754ef6-4a45-44b2-8476-534d3139c1d3  p5e2e-r1-attach@probe.nryn.dev
```

Scratch files lived under `/tmp/p5e2e-r1/` and stay outside the repository.

## Files this round changed

- `supabase/functions/auth-telegram/index.ts`
- `web/src/lib/supabase.ts`
- `web/src/routes/login/+page.svelte`
- `web/src/routes/app/settings/+page.svelte`
- `web/scripts/check-auth-telegram-headers.mjs`
- `web/package.json`
- `dev-diary/adversarial-review/p5-e2e-remediation-round1.md`

T5.1 `config.toml` auth block was not edited.
T5.4 onboarding writes were not edited.
`supabase/functions/telegram/voice.ts` was already dirty and was left alone.
PHASE-5 status lines stay `done`.
This write-up does not claim a phase e2e APPROVE.
