# P10: Number confirmation

```yaml
id:       P10
size:     M
requires: [P2, P5, P6]
blocks:   [T8.4, T8.5]
parallel: [P9, P8 except T8.4 and T8.5]
```

**Goal:** Orma calls a number every day only after the person holding that phone has proved they signed up. Anyone can use Orma, so nobody can sign up somebody else's number.

**Why now.** Onboarding saves a typed number and sets `phone_confirmed_at` in the same browser request (`web/src/routes/app/onboarding/submit.ts:152`). The `profiles_owner` policy lets a signed-in user write every column of their own row, so one PostgREST request can set it too. With dry run off, a stranger could sign up with a third party's number and have it rung daily.

The CALL-E list repository's review policy names unauthorized live destinations as a merge blocker. T8.5 cannot open its pull request until this phase closes, and T8.4 records its real call through the new flow.

**The mechanism, decided 14 September.** A one-time confirmation call reads a short code aloud. The user types that code into Orma. Only the person holding the phone hears it, so a correct code proves possession. The server generates and checks the code. No model ever produces or judges it.

**What stays true.** The dispatcher already refuses any run without `phone_confirmed_at` (`supabase/functions/_shared/calle.ts:339`). P10 does not change that gate. It changes who may set the field. Every call path, including materialise, tick and MCP, is covered through that one check.

**Production today.** Production holds zero profiles, so no existing number needs resetting. The operator's own account confirms through the new flow like anyone else.

**Order.** T10.1 lands first. T10.2 follows. T10.3 waits for T10.2 and for P9's T9.4 and T9.8, because it edits the pages those tasks own. T10.4 closes the phase.

---

### T10.1: Confirmation belongs to the server ★
```yaml
requires:   T1.2, T5.4
fixture-ok: yes
size:       S · frontier
owns:       supabase/migrations/<timestamp>_phone_confirmation_guard.sql, web/src/routes/app/onboarding/submit.ts, web/src/routes/app/onboarding/check.ts, web/src/lib/database.types.ts, supabase/functions/_shared/database.types.ts
status:     done
```
Make `phone_confirmed_at` writable only by the service role and the T10.2 functions.

**The guard.** A `before insert or update` trigger on `profiles`. For any caller that is not the service role, it forces `phone_confirmed_at` to null on insert. On update it keeps the old value when `phone_e164` is unchanged, and clears it when the number changes. A trigger holds even if a later policy or grant widens access, which a column grant alone does not.

**Onboarding.** `submit.ts` stops sending `phone_confirmed_at`. Keep every other field and the consent row exactly as today. Update `check.ts` so it asserts the field is absent from the request.

Do not edit `web/src/routes/app/onboarding/+page.svelte` or the Settings page. P9 owns them. Their copy changes in T10.3.

**Done when:** against the local stack, a signed-in user's PostgREST insert or update that sets `phone_confirmed_at` leaves it null or unchanged. Changing `phone_e164` clears it. A service-role update still sets it. Onboarding creates an unconfirmed profile. A materialised run for that profile is refused by the dispatcher with "profile has no confirmed E.164 number". `npm run check` passes.

---

### T10.2: Confirmation call and code check ★
```yaml
requires:   T10.1, T2.4, T2.6
fixture-ok: yes
size:       M · frontier
owns:       supabase/migrations/<timestamp>_phone_confirmations.sql, supabase/functions/confirm-phone/, supabase/functions/_shared/calle.ts (confirmation request only), supabase/functions/calle-webhook/index.ts (routing only), supabase/config.toml ([functions.confirm-phone] only), web/src/lib/database.types.ts, supabase/functions/_shared/database.types.ts
status:     done
```
One call reads a code. One function checks it. Nothing else can confirm a number.

**Table.** `phone_confirmations`: id, user_id, phone_e164, code_hash, attempts, state (`requested`, `dialled`, `refused`, `failed`, `confirmed`, `expired`), idempotency_key unique, calle_call_id, created_at, expires_at, confirmed_at. RLS lets the owner read state and timestamps only. The owner never reads `code_hash`. Only the service role writes.

**Start: `POST /functions/v1/confirm-phone`.** The caller's JWT identifies the user. It takes no user id and no number.

1. Refuse unless the profile has an E.164 number, the number is not already confirmed, and a live `outbound_calls` consent exists.
2. Enforce limits before any call. At most one attempt per account every ten minutes, three per account per day, and five per number per day across all accounts.
3. Generate a six-digit code with a cryptographic random source. Store only a salted hash. Expire it after ten minutes.
4. Insert the row, then place exactly one call through `calle.ts`, which stays the only module that can POST `/v1/calls`. The idempotency key is `orma:confirm:<row id>`. A retried request with the same row returns its state and places no second call.
5. Never retry a failed, unanswered or refused call. The user asks again, inside the limits.

**The call.** A separate task text and a minimal result schema in `calle.ts`. The call says it is Orma, that someone asked Orma to call this number, and reads the code digit by digit, twice. It says that if you did not ask for this, hang up and Orma will not call again. Set `metadata.phone_confirmation_id`, not `call_run_id`. It asks nothing and captures nothing.

**Dry run.** With `ORMA_DRY_RUN=true`, no call is placed. The function records the masked request. When `ORMA_ENV` is not production, it also returns the code in the response so local tests can complete. In production it never returns the code.

**Check: `verify_phone_code(code text)`.** A `security definer` RPC for `authenticated` only, revoked from `public` and `anon`. It acts on `auth.uid()`. It compares against the newest unexpired row whose number still equals the profile's number. After five wrong codes the row expires. A match sets the row `confirmed` and sets `profiles.phone_confirmed_at`, which the T10.1 guard allows for this definer.

**Webhook.** `calle-webhook` currently requires `metadata.call_run_id`. Route events that carry `metadata.phone_confirmation_id` to update that row's state only. They never touch `call_runs`, never ingest, and never error in a way that makes CALL-E retry forever. Keep de-duplication by event id.

Record any CALL-E friction in `dev-diary/feedback.md` in the same session, per `AGENTS.md`.

**Done when:** on the local stack in dry run, start then verify confirms the number, and each of these holds.

- A wrong code five times expires the row, and no code confirms a changed number.
- The limits refuse a fourth attempt in a day and a second within ten minutes.
- A second user cannot read or verify the first user's row.
- The same start request twice places one call.
- A webhook event for a confirmation call changes no `call_runs` row.
- No response or log in production mode contains the code.

A live pin is evidence, never a gate: the operator runs one real confirmation call to their own number and records the response shape.

---

### T10.3: Confirmation in onboarding and Settings
```yaml
requires:   T10.2, T9.4, T9.8
fixture-ok: yes
size:       M · mid
owns:       web/src/lib/phone-confirm/, web/src/routes/app/onboarding/+page.svelte, web/src/routes/app/settings/+page.svelte
status:     not-started
```
The user sees one clear step: we will call you with a code.

**Onboarding.** After the number and consent, a step offers "Call me with a code". It then shows a code field, a resend control that respects the limits and says when it is available, and the reason for any refusal. A user who skips reaches Today in the blocked state, which already says "No confirmed number".

**Settings.** The phone card shows confirmed or not. Changing the number says it needs confirming again, then offers the same flow.

**Copy.** Remove "Saving still sets the confirmed timestamp" and "Your first call confirms it". Say what the confirmation call is, that it happens once, and that no daily call is placed until the code is entered. Do not change the consent wording stored in `consents.text_version`.

Build the flow once in `web/src/lib/phone-confirm/` and mount it in both pages with the P9 components. Keep the P9 phone-first and reactive rules. The state updates in place without a reload.

**Done when:** a fresh harness account completes onboarding through the code step and lands on Today unblocked. A skipped account shows the blocked state. Changing the number in Settings blocks again until confirmed. Both pages work at 360 pixels wide.

---

### T10.4: Documentation and phase check
```yaml
requires:   T10.1, T10.2, T10.3
fixture-ok: yes
size:       S · mid
owns:       dev-diary/spec.md (§7 and §13 only), docs/number-confirmation.md
status:     not-started
```
Write down what "confirmed" means now, so T8.3 and the pull request can quote it.

`docs/number-confirmation.md` explains the call, the code, the limits, the cost of each attempt, and what a third party experiences if someone enters their number. It says plainly that the call cannot be recalled once placed. Update spec §13 so "a confirmed number" means a code entered from a confirmation call, and §7 for the new guard.

Then run the phase e2e review across T10.1 to T10.3 as one system, per `AGENTS.md`.

**Done when:** the document exists and matches the code, spec §7 and §13 match the code, and the phase e2e review approves with zero findings.
