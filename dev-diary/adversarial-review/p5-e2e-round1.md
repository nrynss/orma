# P5 e2e round 1 review

- Reviewer: RevP5E2ER1
- Date: 2026-09-14
- Subject: HEAD `51c3c0f` T5.4 landed, all four P5 tasks status `done`
- Specification: `dev-diary/PHASE-5-auth-shell.md` phase goal and T5.1 to T5.4 done-whens, plus `dev-diary/spec.md` §7 and §13
- Verdict: **REMEDIATE**

Per-task APPROVE verdicts stand. This review does not reopen those seams.
The integrated product fails the phase goal on the live login Telegram path.

| C | H | M | L |
| --- | --- | --- | --- |
| 1 | 1 | 0 | 0 |

## Findings

| Sev | Where | What | Pin | Mutation |
| --- | --- | --- | --- | --- |
| C | `web/src/routes/login/+page.svelte` (T5.3) posting into `supabase/functions/auth-telegram/index.ts` (T5.2) | The live Sign in page sends the publishable anon key as `Authorization: Bearer`. The handler treats any bearer as a user session, `GET /auth/v1/user` returns 403, and the function answers 401. Continue with Telegram on `/login` cannot mint a session. | Live node `5.BqU8arRn.js` fetches `${api}/functions/v1/auth-telegram` with `apikey:n` and `authorization: Bearer ${n}`, where `n` is `getPublishableKey()`. That POST with a valid HMAC returned 401 `unauthorized` in 477 ms and no `access_token`. The same payload with no Authorization returned 200 in 571 ms with `expires_in` 3600. `GET /auth/v1/user` with the anon bearer returned 403 and no id. | Leave the login page sending the anon key as Bearer, or keep the handler treating every bearer as a user. A judge who presses Continue with Telegram never gets a JWT. The phase goal of two ways in fails on the front door. |
| H | `web/src/hooks.server.ts` plus `/login` widget (T5.3), attach branch in `auth-telegram` (T5.2) | Email then Telegram does not meet in one account from the UI. Signed-in users never see the widget. The widget POST never carries a user JWT. Attach exists only as an API bearer. | Cookie session `GET /login` returned 303 to `/app/onboarding` with no profile, and 303 to `/app/settings` with a profile. Live login JS has no `getSession` before the widget POST. Email user then widget with no bearer returned 200 for a different id and `tg-9015140008@telegram.invalid`. Email user then widget with that user's Bearer returned the same id, and a later no-bearer widget kept that id with one `items` row. | A judge who emails in, then uses Telegram on `/login` after a sign-out, gets a second empty account. Login copy still says both ways reach the same account. |

T5.5 is not required. Both findings sit on T5.2 and T5.3 owns.
F1 remediates by omitting the anon Bearer on `/login`, or by treating a non-user bearer as missing in the handler.
F2 remediates by putting the Login Widget on a signed-in surface T5.3 already owns (Settings), after F1.

## What I measured, and how

Live app pins used `https://orma.nryn.dev`. API pins used `https://orma-api.nryn.dev`.
HTTP `Date` on the public pages was 13 Sep 2026, 19:38:31 GMT.
The journey ran through `curl --http1.1` with a Chrome UA after that.
`.env` was read privately. No secret, JWT, cookie value, or full phone number is written here.

Scratch files lived under `/tmp/p5e2e/` and stay outside the repository.

### 1. Public entry

`GET /` returned 200. The shell nav contains `<a href="/login">Sign in</a>`.
The landing footer still says `Not yet open for sign-ups`.
A judge can reach `/login` without knowing the URL.
`GET /login` returned 200 with title `Sign in · Orma`, an email form, and `Continue with Telegram`.
The page says `Both ways reach the same account.`

The closed footer is leftover P0 copy. It does not block entry. It is a note, not a finding.

### 2. Email path to a dispatchable profile

Admin created `p5e2e-agree@probe.nryn.dev`.
`POST /auth/v1/admin/generate_link` returned a `hashed_token` in 98 ms.
`GET /login/callback?token_hash=…&type=magiclink` over HTTP/1.1 returned 303 `Location: /app/onboarding`.
It set cookie `sb-orma-api-auth-token` with `Secure`, `SameSite=Lax`, `Path=/`.
The follow-up GET returned 200 with title `Set up your call` and `hasProfile:false`.

`submitOnboarding` from the repo helper posted with the anon `apikey` and the user Bearer.
Admin readback: one profile, phone masked `+1555…1001`, `phone_confirmed_at` set, timezone `Asia/Kolkata`.
One `consents` row: `kind=outbound_calls`, `source=web`, `revoked_at` null.
`text_version` equalled `consentTextVersion` for that number (`outbound-calls-v1`, a newline, and the shown wording).
One slot, `active=true`, `part_of_day=evening`, `local_time=17:30:00`, weekdays `[1,2,3,4,5]`.
Those four are the `dispatchOne` predicates. All held.
No request used a `supabase.co` host.

One `POST /auth/v1/otp` to an undeliverable `@probe.nryn.dev` address returned 200 in 2968 ms with an empty body.
That latency is the SMTP-submission signature. I did not send a second OTP.

### 3. Skip consent

A separate user ran the same helper with `agreed: false`.
Admin readback: one profile, phone masked `+1555…1002`, `phone_confirmed_at` set, one active morning slot at `08:00:00`.
Count of `consents` was 0, including `kind=outbound_calls`.
`dispatchOne` would refuse for no live outbound consent.

### 4. Malformed phone

Helper submit with `not-a-number` threw `international format` and issued 0 network calls.
Live onboarding JS ships `/^\+[1-9]\d{7,14}$/`.
User-JWT POST of `phone_e164=+012345678` returned 400 with Postgres code `23514`.
A spaced number the CHECK does not strip also returned 400 `23514`.

### 5. Gate

No-profile cookie: `/app/settings`, `/login`, and `/app` each returned 303 to `/app/onboarding`.
`GET /app/onboarding` returned 200 with `Set up your call`.
Completed profile: callback 303 to `/app/settings`, land 200 with `Mint Start link`.
`GET /app/settings` returned 200, not to onboarding.
`GET /login` returned 303 to `/app/settings`.
Signed-out `/app`, `/app/settings`, and `/app/onboarding` each returned 303 to `/login`.
Completed-profile `GET /app` returned 404. That is a T6.1 leftover. See notes.

### 6. Telegram HMAC

OPTIONS returned 204. `Access-Control-Allow-Origin` was `https://orma.nryn.dev`, not `*`.
Allow-Methods listed `POST, OPTIONS`. An Origin of `https://evil.example` still sent `https://orma.nryn.dev`.
GET returned 405 `{error: method not allowed}`.

A widget payload signed with `TELEGRAM_BOT_TOKEN`, posted with no Authorization, returned 200 in 571 ms.
Body had `access_token`, `refresh_token`, `expires_in` 3600, `token_type` bearer.
`GET /auth/v1/user` with that JWT returned 200 for the same id.
`app_metadata.telegram_user_id` was `9015140001`.
571 ms is not the SMTP signature, so `generateLink` did not send mail.

A one-byte hash flip returned 401 `unauthorized`.
A valid HMAC with `auth_date` now minus 301 s returned 401 `unauthorized`.

The browser-shaped POST (F1) returned 401, recorded above.

### 7. One account, both paths

API attach works. UI attach does not.

Email user plus that user's Bearer plus a valid widget returned 200 for the same id and kept the email.
A later widget POST with no bearer returned the same id.
`GET /rest/v1/items` with the telegram-login JWT returned that one row, owned by that id.

Email user plus a valid widget with no bearer (the only shape `/login` can send after F1) returned 200 for a different id.
The second user used `tg-9015140008@telegram.invalid`. That is F2.

### 8. Settings mint after profile

Control POST to `/rest/v1/telegram_link_tokens` with the user JWT as `apikey` and as Bearer returned 401 `Invalid API key`.
Count stayed 0 (`select=token_hash`).
Repo helper `mintLinkToken` sent anon `apikey` and user Bearer to `orma-api.nryn.dev` only.
DELETE then POST. Count became 1. `consumed_at` null.
Deep link prefix `https://t.me/orma_tele_bot?start=`. Token length 43. Charset matched `LINK_TOKEN_PATTERN`.
`GET https://t.me/orma_tele_bot` returned 200. A Telegram Start press was not executed.

### 9. No supabase.co

Shipped `D5R5ozGU.js` inlines `https://orma-api.nryn.dev` and throws if the URL contains `supabase.co`.
`LOGIN_CALLBACK_URL` is `https://orma.nryn.dev/login/callback`.
The baked JWT `role` is `anon`.
`D9CZDZBY.js` posts to `https://orma-api.nryn.dev/rest/v1`.
`supabase.co` in the bundle is the project-host throw, plus library docs on `supabase.com`.
Every helper fetch I wrapped used `orma-api.nryn.dev` only.
Hosts this session called: `orma.nryn.dev`, `orma-api.nryn.dev`, `t.me`.

### 10. Secret hygiene

`rg` over `web/` finds no `SUPABASE_SERVICE_ROLE_KEY`, no `sb_secret`, no `service_role`.
`npm run check` in `web/` printed `secret-key check passed`, `telegram-link header check passed`, `onboarding check passed`, then svelte-check with 0 errors and 0 warnings.

## T5.x done-when vs integrated path

| Task | Done-when (phase diary) | Seam | Live integrated path |
| --- | --- | --- | --- |
| T5.1 | Magic link arrives from the Orma domain, signs in, and lands on the app. Ten requests in a minute do not exhaust a rate limit. | Round 2 APPROVE. I did not repeat the ten-send run. | One live OTP 200 in 2968 ms. `generate_link` in 98 ms plus `/login/callback` set the session cookie and landed on onboarding. |
| T5.2 | Valid widget payload returns a session. One-byte change refused. Stale payload refused. Both paths reach one account with one set of items. | Round 1 APPROVE on no-Authorization POSTs and bearer attach. | No-Authorization 200, flip 401, stale 401, CORS origin not `*`. Bearer attach still unifies one account. The `/login` POST shape 401s (F1). Widget without a user bearer after email creates a second user (F2). |
| T5.3 | Signed-out app route lands on login. Signed-in reload keeps the session. No browser request to a `supabase.co` host. Settings mint inserts one `telegram_link_tokens` row. Deep link opens the live bot. | Round 2 APPROVE. | Signed-out `/app` 303 `/login`. Cookie reload of Settings 200. Mint count 1 after the helper. JWT-as-apikey still 401. Shipped JS talks to `orma-api.nryn.dev`. Login widget headers are F1. |
| T5.4 | New account reaches a dispatchable profile in one pass. Malformed number rejected client and server. Consent row records the shown wording. Skipping consent leaves the profile undispatchable. | Round 1 APPROVE. | Agree path hit all four dispatcher predicates. Skip left outbound_calls at 0. Client throw and live `23514` both held. Gate sent no-profile cookies to onboarding and completed cookies to Settings. |

## Cleanup and deletion verification

Journey users, mint-pin user, and split-pin users were deleted through the admin API.
Admin readback was 404 for each id.
`profiles`, `consents`, `slots`, `items`, and `telegram_link_tokens` (`select=token_hash`) each report `Content-Range: */0`.
`GET /auth/v1/admin/users` lists 0 users.

Journey probe ids, for audit:

```
caad328c-8b35-46a1-8a23-e55ca7fd1c7b  p5e2e-smtp-…@probe.nryn.dev
f01883ed-3054-43d5-9824-0c22dfbb3f21  p5e2e-agree@probe.nryn.dev
8124e208-bf4a-4142-8161-3cd2049a89af  p5e2e-skip@probe.nryn.dev
47e81d2a-2f63-467f-b662-8be2b62b10ea  p5e2e-malformed@probe.nryn.dev
fb1d966c-f9bb-459f-8085-8a81523ba51c  tg-9015140001@telegram.invalid
e0c67833-5bc1-48ef-8e0a-3162751d3771  p5e2e-both@probe.nryn.dev
```

## Notes, not findings

- Landing footer still says sign-ups are closed. T5.3 put Sign in in the shell nav and does not own `+page.svelte`. Entry works.
- Completed-profile `GET /app` is 404. T6.1 owns `web/src/routes/app/+page.svelte`. The gate does not bounce that user to onboarding.
- Onboarding says the user can agree later in Settings. Settings in P5 only mints a Telegram Start link. T6.5 owns consent there. Skip still leaves the profile undispatchable, which is the T5.4 pin.
- `telegram_link_tokens` has no `id` column. A `select=id` count is 42703. The mint pin used `select=token_hash`.
- I did not place a CALL-E call. Dispatchability is the row predicates.

## Phase goal pin

Diary goal: two ways in, one session, and an onboarding that produces a profile the call engine will actually dispatch for.

Email magic link plus onboarding produces that profile. I counted the four dispatcher rows.
Telegram Login Widget on the live `/login` page does not mint a session.
Both paths do not reach one account from the UI.

T5.1 to T5.4 status lines stay `done`.
