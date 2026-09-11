# P5: Auth and web shell

```yaml
id:       P5
size:     M
requires: [T0.5, T1.2]
blocks:   [P6, P8]
parallel: [P2, P3, P4]
```

**Goal:** Two ways in, one session, and an onboarding that produces a profile the call engine will actually dispatch for.

**Why both paths:** Telegram is free, instant, and doubles as the Start press. Email lets a judge sign up without a Telegram account. Both mint the same JWT, so every policy from T1.2 is written once.

---

### T5.1: Supabase auth and sender
```yaml
requires:   []
fixture-ok: yes
size:       S · mid
owns:       supabase/config.toml (auth block)
status:     not-started
```
Enable email magic link. Configure Resend as the sender over its HTTP API, because Supabase's built-in mailer is rate limited to a handful of messages an hour and Edge Functions block outbound ports 25 and 587.

Set the site URL and the allowed redirect list to the Pages domain. A redirect list that is wrong in production is the classic way this fails after everything worked locally.

**Done when:** a magic link arrives from the Orma domain, signs in, and lands on the app; and ten requests in a minute do not exhaust a rate limit.

---

### T5.2: Telegram login bridge ★
```yaml
requires:   T5.1, T3.1
fixture-ok: yes
size:       L · frontier
owns:       supabase/functions/auth-telegram/index.ts
status:     not-started
```
Verify the Login Widget payload by computing `HMAC-SHA256` over the data-check string with `SHA256(bot_token)` as the key and comparing against `hash`. Reject a payload older than a short window, which is what stops a captured payload being replayed later.

Then find or create the user and mint a session in two steps:

1. `auth.admin.generateLink({ type: 'magiclink', email })`, service role only, which produces the one-time token without sending mail.
2. `auth.verifyOtp({ token_hash, type: 'email' })`, which accepts a bare token hash and returns a session.

Nothing is signed in the database. `pgjwt` is deprecated on Postgres 17, which this project runs.

A Telegram identity linked to an existing email account attaches to that account rather than creating a second one.

**Done when:** a valid widget payload returns a working session, a payload with one byte changed is refused, a stale payload is refused, and signing in by both paths reaches one account with one set of items.

---

### T5.3: App skeleton and sessions
```yaml
requires:   T0.5, T5.1
fixture-ok: yes
size:       M · mid
owns:       web/src/lib/supabase.ts, web/src/routes/+layout.ts, web/src/routes/login/
status:     not-started
```
The SvelteKit shell: a Supabase client, session handling across server and client rendering, route protection, and the login page carrying both paths.

The landing page is server rendered so a first-time visitor sees content rather than a spinner. The signed-in app is client rendered and talks to PostgREST directly.

The anon key is the only key in the bundle. A build check fails if the service role key appears anywhere under `web/`.

**Done when:** a signed-out visitor to an app route lands on login, a signed-in reload keeps the session, and the landing page returns content in the server response body.

---

### T5.4: Onboarding ★
```yaml
requires:   T5.3, T1.1
fixture-ok: yes
size:       M · frontier
owns:       web/src/routes/app/onboarding/
status:     not-started
```
The sequence that turns a signed-in account into a profile the dispatcher will accept: name, phone in E.164, explicit consent, timezone, and a first slot.

Consent is a row and not a checkbox. Store the exact wording shown, the moment, and the surface. The wording is versioned, so a later change does not silently rewrite what someone agreed to.

Number confirmation is honest about what it is. Orma has no SMS channel, so the number is self-declared and the first call confirms it. Say that on the screen rather than implying verification that did not happen.

Close with the step that protects the ritual: ask the user to save the Orma number as a contact, and explain why. A handset that says "suspected spam" has ended the call before it was answered.

**Done when:** a new account reaches a dispatchable profile in one pass, a malformed number is rejected client and server side, the consent row records the shown wording verbatim, and skipping consent leaves the profile undispatchable.
