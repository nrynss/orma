# P5: Auth and web shell

```yaml
id:       P5
size:     M
requires: [T1.2]
blocks:   [P6, P8]
parallel: [P2, P3, P4]
```

**Goal:** Two ways in, one session, and an onboarding that produces a profile the call engine will actually dispatch for.

**Why both paths:** Telegram is free, instant, and doubles as the Start press. Email lets a judge sign up without a Telegram account. Both mint the same JWT, so every policy from T1.2 is written once.

The app itself already exists and is deployed. P0 left a SvelteKit Worker at
`orma.nryn.dev` with a landing page, and a front door at `orma-api.nryn.dev`.
This phase adds auth to what is there. It does not scaffold anything.

---

### T5.1: Supabase auth and sender
```yaml
requires:   []
fixture-ok: yes
size:       S · mid
owns:       supabase/config.toml (auth block)
status:     done
```
Enable email magic link. Configure Resend as the sender through Supabase custom
SMTP, which speaks Resend's SMTP interface from Supabase's own servers. The
built-in mailer is rate limited to a handful of messages an hour, and the
outbound port block binds Edge Functions only, not the auth service.

Do not edit `[functions.telegram]`. T3.1 owns that block and sets `verify_jwt = false`.

Set the site URL and the allowed redirect list to the Pages domain. A redirect list that is wrong in production is the classic way this fails after everything worked locally.

**Done when:** a magic link arrives from the Orma domain, signs in, and lands on the app; and ten requests in a minute do not exhaust a rate limit.

---

### T5.2: Telegram login bridge ★
```yaml
requires:   T5.1, T3.1
fixture-ok: yes
size:       L · frontier
owns:       supabase/functions/auth-telegram/index.ts, supabase/config.toml ([functions.auth-telegram] only)
status:     done
```
The browser posts the widget payload with no session JWT, so this task also owns
`[functions.auth-telegram] verify_jwt = false`. Do not edit any other block in
`config.toml`. T5.1 owns `[auth]`. T3.1 owns `[functions.telegram]`.

Verify the Login Widget payload by computing `HMAC-SHA256` over the data-check string with `SHA256(bot_token)` as the key and comparing against `hash`. Reject a payload older than a short window, which is what stops a captured payload being replayed later.

Then find or create the user and mint a session in two steps:

1. `auth.admin.generateLink({ type: 'magiclink', email })`, service role only, which produces the one-time token without sending mail.
2. `auth.verifyOtp({ token_hash, type: 'email' })`, which accepts a bare token hash and returns a session.

Nothing is signed in the database. `pgjwt` is deprecated on Postgres 17, which this project runs.

A Telegram identity linked to an existing email account attaches to that account rather than creating a second one.

**Done when:** a valid widget payload returns a working session, a payload with one byte changed is refused, a stale payload is refused, and signing in by both paths reaches one account with one set of items.

---

### T5.3: Supabase client and sessions
```yaml
requires:   T5.1
fixture-ok: yes
size:       M · mid
owns:       web/src/lib/supabase.ts, web/src/lib/telegram-link.ts, web/src/routes/+layout.ts, web/src/routes/+layout.server.ts, web/src/routes/+layout.svelte, web/src/hooks.server.ts, web/src/routes/login/, web/src/routes/app/settings/+page.svelte, web/package.json, web/package-lock.json, web/scripts/
status:     done
```
Cookie sessions need the server hook and the existing layout. Settings must
read the signed-in session rather than a pasted JWT. The package files take
the publishable client and the secret-key build check. `web/scripts/` maps
existing env names onto SvelteKit PUBLIC_ names and fails the build if a
secret key appears under `web/`.

Add to the deployed app: a Supabase client, session handling across server and
client rendering, route protection, and the login page carrying both paths.

**Point the client at `ORMA_API_URL`, never at the project host.** The front door
is what makes this work from a network that misresolves `*.supabase.co`, and it
keeps the URL Orma's own if the Supabase project is ever replaced.

The landing page from P0 is already server rendered. The signed-in app is client
rendered and talks to PostgREST through the front door.

The publishable key is the only key in the bundle. A build check fails if the
secret key appears anywhere under `web/`.

**P3 handoff (2026-09-12).** Telegram Start press from Settings is blocked only
on a session JWT from this task. P3 already landed:

- `web/src/lib/telegram-link.ts` with `mintLinkToken`, `unlinkTelegram`, and
  `loadTelegramLinkState`. Callers pass `{ accessToken, userId }` from the
  signed-in session. Posts go to `ORMA_API_URL/rest/v1`. Hash only, never the
  raw token in storage. Bot username is `orma_tele_bot`.
- `web/src/routes/app/settings/+page.svelte` mint and unlink UI.
- Live table `public.telegram_link_tokens` with owner RLS.
- Live bot webhook (telegram Edge Function v3) already runs `completeLink` on
  `/start <token>` and binds `profiles.telegram_chat_id`.

When this task lands, wire Settings to `supabase.auth.getSession()` (or the
session helper you export). Pass `session.access_token` and `session.user.id`
into `mintLinkToken` / `unlinkTelegram`. Do not put the service role in `web/`.
Do not invent a second mint path. Reuse those helpers.

**Done when:** a signed-out visitor to an app route lands on login, a signed-in
reload keeps the session, and no request in the browser network tab goes to a
`supabase.co` host. Also pin: Settings mint with that JWT inserts one
`telegram_link_tokens` row for the user, and the deep link opens the live bot.

---

### T5.4: Onboarding ★
```yaml
requires:   T5.3, T1.1
fixture-ok: yes
size:       M · frontier
owns:       web/src/routes/app/onboarding/, web/src/hooks.server.ts, web/src/routes/login/, web/src/routes/+layout.server.ts
status:     claimed:orma-impl-54
```
A signed-in account with no profile must land here, not on Settings. That gate
lives in `hooks.server.ts` (the `/login` redirect today) and the server layout.
T5.3 already owns those files. This task takes the missing-profile branch only.

The sequence that turns a signed-in account into a profile the dispatcher will accept: name, phone in E.164, explicit consent, timezone, and a first slot.

Consent is a row and not a checkbox. Store the exact wording shown, the moment, and the surface. The wording is versioned, so a later change does not silently rewrite what someone agreed to.

Number confirmation is honest about what it is. Orma has no SMS channel, so the number is self-declared and the first call confirms it. Say that on the screen rather than implying verification that did not happen.

Close by setting the expectation that protects the ritual, which is not the step originally planned here.

Orma calls arrive from a different number every time, and they arrive flagged as likely spam. Saving the caller as a contact would fix it, and rotation makes that impossible. Recorded as issue 9 in [`feedback.md`](feedback.md), and accepted as a risk rather than solved.

So say it plainly, once, during onboarding. The call comes from a number you will not recognise, at the time you chose, and your phone may warn you about it. Answer it anyway. Setting that expectation before the first call is the only mitigation available, and a user who was told is far more likely to answer than one who was surprised.

Do not invent a number to save. Do not imply the warning can be prevented.

**Done when:** a new account reaches a dispatchable profile in one pass, a malformed number is rejected client and server side, the consent row records the shown wording verbatim, and skipping consent leaves the profile undispatchable.
