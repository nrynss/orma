# P5 e2e round 2 review

- Reviewer: RevP5E2ER2
- Date: 2026-09-14
- Subject: uncommitted P5 e2e remediation on `main` after HEAD `51c3c0f`
- Specification: `dev-diary/PHASE-5-auth-shell.md` phase goal and T5.1 to T5.4 done-whens
- Verdict: **APPROVE**

Per-task APPROVE verdicts stand. This review does not reopen those seams.
Round 1 returned REMEDIATE with C1 and H1. This round closes both.

## Counts

| Severity | Round 2 | Round 1 |
|---|---|---|
| C | 0 | 1 |
| H | 0 | 1 |
| M | 0 | 0 |
| L | 0 | 0 |

## Zero residue against round 1

Every pin in this table is a fresh measurement by this reviewer. None is quoted from the
implementer, the remediator, round 1, or the dispositions.

| Finding | Severity | Disposition under review | This round's own pin | Residue |
|---|---|---|---|---|
| F1, `/login` sent the publishable key as Bearer and `auth-telegram` 401d | C | Login calls `postAuthTelegram(user)` with no second argument. The helper sets `Authorization` only when `options.accessToken` is present. The handler skips `getBearerUser` when the bearer equals the anon key, and treats a non-user bearer as missing. | Live login node `5.BqNaqOt1.js` has no `authorization` and calls `await D(e)`. Live helper `$a` sends `content-type` only unless `t?.accessToken` is set, then `apikey` is the publishable key and `authorization` is `Bearer ${t.accessToken}`. Valid HMAC with no Authorization returned 200 in 628 ms, `expires_in` 3600, and a session. The same HMAC with Bearer equal to the anon key returned 200 in 326 ms for the same id. `GET /auth/v1/user` with that anon Bearer returned 403 and no id. A one-byte hash flip returned 401 `unauthorized` with no session, including with the anon Bearer. Old login node `5.BqU8arRn.js` returned 404. A `/tmp` login mutant that restored `Bearer ${key}` failed the header regexes. The repo login still calls `postAuthTelegram(user)`. | None |
| F2, email then Telegram did not meet in one account from the UI | H | Settings hosts the Login Widget under Sign-in identity. Attach calls `postAuthTelegram(user, { accessToken })` from `getSession()`, then `setSession`. `/login` still redirects a signed-in user. | Live Settings node `4.BpSt5aHe.js` has `Sign-in identity`, injects `telegram-widget.js?22`, and calls `E(e,{accessToken:t})` where `t` is the session access token. Email user plus that user Bearer returned 200 for the same id and kept the probe email. A later no-bearer widget returned that same id, not a `tg-…@telegram.invalid` user. After a profile row, one `items` row inserted under the email JWT was readable as count 1 under the later telegram JWT, owned by that id. No-profile cookie `GET /login` returned 303 `/app/onboarding`. Completed-profile cookie `GET /login` returned 303 `/app/settings`. | None |

## Findings

None. The round carries zero new findings across all severities.

## What I measured, and how

Live app pins used `https://orma.nryn.dev`. API pins used `https://orma-api.nryn.dev`.
HTTP `Date` on the public pages was 13 Sep 2026, 20:11:48 GMT.
The journey ran through `curl --http1.1` with a Chrome UA after that.
`.env` was read privately. No secret, JWT, cookie value, or full phone number is written here.

Scratch files lived under `/tmp/p5e2e-r2/` and stay outside the repository.
`node scripts/check-auth-telegram-headers.mjs` in `web/` printed `auth-telegram header check passed`.

### 1. Continue-with-Telegram request shape

`GET /login` returned 200 with title `Sign in · Orma`, the email form, and `Continue with Telegram`.
The foot hint tells an email user to attach Telegram in Settings.
Link preload lists `nodes/5.BqNaqOt1.js` and `chunks/Chvwe-w2.js`.
Live `app.S3lQSYKJ.js` maps `/login` to node 5 and `/app/settings` to node 4.

Live login node `5.BqNaqOt1.js` contains no `authorization` and no `apikey`.
The widget path is `let t=await D(e)` with one argument, then `setSession`.
It injects `https://telegram.org/js/telegram-widget.js?22` with `data-telegram-login` from the bot username helper.

Live helper `Chvwe-w2.js` function `$a` posts to `${Ja()}/functions/v1/auth-telegram`.
`Ja()` is `https://orma-api.nryn.dev` and throws if the URL contains `supabase.co`.
Headers start as `content-type: application/json`.
`t?.accessToken` adds `apikey` from `Ya()` and `authorization: Bearer ${t.accessToken}`.
The baked `Ya()` JWT `role` is `anon`.

`GET /_app/immutable/nodes/5.BqU8arRn.js` returned 404.
Entry `start.DN1i_rID.js` does not name that old node.

A `/tmp` copy of login that restored `authorization: Bearer ${key}` failed three header regexes.
The repo login still matches `postAuthTelegram(user)` and has no Authorization.

### 2. F1 live HMAC

OPTIONS returned 204.
`Access-Control-Allow-Origin` was `https://orma.nryn.dev`, not `*`.
Allow-Methods listed `POST, OPTIONS`.
Allow-Headers listed `content-type, authorization, apikey`.
An Origin of `https://evil.example` still sent `https://orma.nryn.dev`.
GET returned 405 `{error: method not allowed}`.

A widget payload signed with `TELEGRAM_BOT_TOKEN`, posted with no Authorization, returned 200 in 628 ms.
Body had `access_token`, `refresh_token`, `expires_in` 3600, `token_type` bearer.
`GET /auth/v1/user` with that JWT returned 200 for the same id.
`app_metadata.telegram_user_id` was `9015141301`.
628 ms is not the SMTP signature, so `generateLink` did not send mail.

The same valid HMAC with `Authorization: Bearer` equal to the publishable anon key returned 200 in 326 ms.
The user id matched the no-Authorization POST.

`GET /auth/v1/user` with the anon bearer returned 403 and no id.

A one-byte hash flip returned 401 `unauthorized` in 138 ms and no session.
The same flip with the anon Bearer also returned 401 and no session.

### 3. F2 attach from Settings

Live Settings HTML, after a completed-profile cookie, returned 200 with `Sign-in identity` and `Mint Start link`.
Live node `4.BpSt5aHe.js` injects the Login Widget and calls `E(e,{accessToken:t})`.
`t` comes from `getSession()` then `creds()`.
It then `setSession`. Mint and unlink stay under Bot messages.

Admin created `p5e2e-r2-attach@probe.nryn.dev`. Password grant JWT `role` was `authenticated`.
Widget POST with that user Bearer and anon `apikey` returned 200 in 452 ms for the same id.
Email stayed the probe address. `app_metadata.telegram_user_id` was `9015141304`.

A later widget POST with no Authorization returned 200 in 275 ms for that same id.
Email stayed the probe address, not `tg-…@telegram.invalid`.

A profile row plus one `items` insert returned 201.
The later telegram JWT `GET /rest/v1/items` returned count 1, owned by that id, matching the probe text.

No-profile cookie `GET /login` returned 303 `/app/onboarding`.
Completed-profile cookie `GET /login` returned 303 `/app/settings`.
Attach is on Settings. Login still bounces a signed-in user.

### 4. Email onboarding still dispatchable

Admin created `p5e2e-r2-agree@probe.nryn.dev`.
`POST /auth/v1/admin/generate_link` returned a `hashed_token` in 88 ms.
`GET /login/callback?token_hash=…&type=magiclink` over HTTP/1.1 returned 303 `Location: /app/onboarding`.
It set cookie `sb-orma-api-auth-token` with `Secure`, `SameSite=Lax`, `Path=/`.
The follow-up GET returned 200 with title `Set up your call`.

`submitOnboarding` from the repo helper posted with the anon `apikey` and the user Bearer.
Admin readback: one profile, phone masked `+1555…3001`, `phone_confirmed_at` set, timezone `Asia/Kolkata`.
One `consents` row: `kind=outbound_calls`, `source=web`, `revoked_at` null.
`text_version` equalled `consentTextVersion` for that number.
One slot, `active=true`, `part_of_day=evening`, `local_time=17:30:00`, weekdays `[1,2,3,4,5]`.
Those are the `dispatchOne` predicates this phase can pin without placing a call. All held.
No request used a `supabase.co` host.

I did not send an OTP this round. `generate_link` is the admin path.

### 5. Skip still undispatchable

A separate user ran the same helper with `agreed: false`.
Admin readback: one profile, phone masked `+1555…3002`, `phone_confirmed_at` set, one active morning slot at `08:00:00`.
Count of `consents` was 0, including `kind=outbound_calls`.
`dispatchOne` would refuse for no live outbound consent.

Helper submit with `not-a-number` threw `international format` and issued 0 network calls.
Live onboarding node `3.nF58oHL7.js` ships `/^\+[1-9]\d{7,14}$/`.
User-JWT POST of `phone_e164=+012345678` returned 400 with Postgres code `23514`.
A spaced number the CHECK does not strip also returned 400 `23514`.

### 6. Gate

No-profile cookie: `/app/settings`, `/login`, and `/app` each returned 303 to `/app/onboarding`.
`GET /app/onboarding` returned 200 with `Set up your call`.
Completed profile: callback 303 to `/app/settings`, land 200 with `Mint Start link` and `Sign-in identity`.
`GET /app/settings` returned 200, not to onboarding.
`GET /login` returned 303 to `/app/settings`.
Signed-out `/app`, `/app/settings`, and `/app/onboarding` each returned 303 to `/login`.
Completed-profile `GET /app` returned 404. That is a T6.1 leftover. See notes.

### 7. Settings mint still inserts one token row

Control POST to `/rest/v1/telegram_link_tokens` with the user JWT as `apikey` and as Bearer returned 401 `Invalid API key`.
Count stayed 0 (`select=token_hash`).
Repo helper `mintLinkToken` sent anon `apikey` and user Bearer to `orma-api.nryn.dev` only.
Wrapped fetch saw DELETE then POST. Both had `apikey_is_anon=true` and `auth_is_bearer_user=true`.
Count became 1. `consumed_at` null.
Deep link prefix `https://t.me/orma_tele_bot?start=`. Token length 43. Charset matched `LINK_TOKEN_PATTERN`.
`GET https://t.me/orma_tele_bot` returned 200. A Telegram Start press was not executed.

Live `D9CZDZBY.js` posts mint to `https://orma-api.nryn.dev/rest/v1` with `apikey` as the anon key and `Bearer` as the user JWT.
It throws if the URL contains `supabase.co`.

### 8. No supabase.co

Shipped helper inlines `https://orma-api.nryn.dev` and throws if the URL contains `supabase.co`.
`LOGIN_CALLBACK_URL` is `https://orma.nryn.dev/login/callback`.
The baked JWT `role` is `anon`.
`supabase.co` in the login helper is the project-host throw, plus library docs on `supabase.com`.
Every helper fetch I wrapped used `orma-api.nryn.dev` only.
Hosts this session called: `orma.nryn.dev`, `orma-api.nryn.dev`, `t.me`.

### 9. Secret hygiene

`rg` over `web/` finds no `SUPABASE_SERVICE_ROLE_KEY`, no `sb_secret`, no `service_role` as a shipped secret.
The header check passed on the repo files.
The publishable key is the only key in the live helper.

## Cleanup and deletion verification

Journey users, mint user, attach users, and the items-pin user were deleted through the admin API.
Admin readback was 404 for each id.
`profiles`, `consents`, `slots`, `items`, and `telegram_link_tokens` (`select=token_hash`) each report `Content-Range: */0`.
`GET /auth/v1/admin/users` lists 0 users.

Journey probe ids, for audit:

```
fce93a86-d85f-4943-97b1-e24e09e496ab  tg-9015141301@telegram.invalid
4ef36480-a9bf-4f99-a726-62d7e547a042  p5e2e-r2-agree@probe.nryn.dev
36994850-19f4-484c-9d3b-dd5c4352b197  p5e2e-r2-skip@probe.nryn.dev
561e49db-5656-4c3f-adff-25c26eb66663  p5e2e-r2-mal@probe.nryn.dev
1a974da7-fb2f-46ac-bc9e-cb4ac906a4cc  p5e2e-r2-attach@probe.nryn.dev
a03acd1c-a27c-43ae-a4f9-8f1ca309daf3  tg-9015141309@telegram.invalid
781b95a4-9d53-4f6f-b016-a4bb96f019c2  p5e2e-r2-items@probe.nryn.dev
```

## Notes, not findings

- Landing footer still says sign-ups are closed. T5.3 put Sign in in the shell nav and does not own the landing page. Entry works. `GET /` is 200 and the nav contains Sign in.
- Completed-profile `GET /app` is 404. T6.1 owns `web/src/routes/app/+page.svelte`. The gate does not bounce that user to onboarding.
- Onboarding says the user can agree later in Settings. Settings in P5 mints a Telegram Start link and now hosts identity attach. T6.5 owns consent there. Skip still leaves the profile undispatchable.
- I did not place a CALL-E call. Dispatchability is the row predicates.

## Phase goal pin

Diary goal: two ways in, one session, and an onboarding that produces a profile the call engine will actually dispatch for.

Email magic link plus onboarding still produces that profile. I counted the four dispatcher rows.
Continue with Telegram on live `/login` mints a session. The publishable key is not in Authorization.
Email then Telegram meets in one account when the widget is posted from Settings with the user JWT.
A later telegram-only widget keeps that id.

T5.1 to T5.4 status lines stay `done`.
