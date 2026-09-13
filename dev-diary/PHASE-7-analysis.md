# P7: Analysis and receipts

```yaml
id:       P7
size:     M
requires: [T1.1, soft P2, T3.4]
blocks:   [P8]
parallel: [P3, P4, P6]
```

**Goal:** Say something across days that no single call could say, in writing, with every number traceable to a row.

**Why it is the differentiator:** One transcript is a to-do list. The pattern across days is the insight. This is what the submission leads with, after the call itself.

---

### T7.1: Fact computation ★
```yaml
requires:   T1.1
fixture-ok: yes
size:       L · frontier
owns:       supabase/migrations/*_facts.sql, supabase/migrations/test-facts.sh
status:     done
```
SQL that produces the facts a report is written from, stored in `pattern_reports.facts`.

Mention counts. Ages from `since_date`. How long items sit before being retired, and how many are retired at all. Which items survive longest. Answer rate by slot. The distribution of `mood` across the period.

Every one of these is a query, not an inference. The report cannot claim a number that is not in this object.

**Done when:** a fixture history of a dozen runs produces a facts object whose every field is reproducible by running the query by hand, and an account with two days of history produces facts that say so rather than extrapolating.

---

### T7.2: Prose generation ★
```yaml
requires:   T7.1
fixture-ok: yes
size:       M · frontier
owns:       supabase/functions/analysis/prose.ts, supabase/functions/analysis/prose_tests.ts
status:     done
```
Gemini receives the facts object and writes the report. It gets no transcripts and no ability to count.

Validate the output before it is stored: every number appearing in the prose must appear in the facts. If it does not, regenerate. This check is the whole reason the two stages are separate, so it is not optional and it is not a warning.

Keep it short. A report nobody finishes is a report that changed nothing.

**Done when:** a fixture facts object yields prose containing only its own numbers, a deliberately hallucinated number is caught and regenerated, and the same facts twice produce stable output.


---

### T7.2a: Shared Vertex text client
```yaml
requires:   T3.3
fixture-ok: yes
size:       S · mid
owns:       supabase/functions/_shared/vertex.ts, supabase/functions/_shared/vertex_tests.ts, supabase/functions/telegram/voice_vertex.ts
status:     done
```
T7.2 needs the same service-account credential and `generateContent` path as voice.
Extract them once so analysis never grows a second credential mechanism.

Move the private token exchange, JWT signing, service-account test key and response
parsing behind a shared module. Refactor `voice_vertex.ts` to call it without changing
its exported API. Add a colocated Deno suite that pins credential parsing, token
exchange, bearer authorization, the Vertex URL, failure propagation and text extraction.

**Done when:** every existing `voice_vertex` Deno suite passes unchanged, and the new
shared suite proves the auth and generation path with an injected `fetch`.
---

### T7.3: Report delivery
```yaml
requires:   T7.2, T3.4
fixture-ok: yes
size:       M · mid
owns:       supabase/functions/analysis/index.ts, supabase/functions/_shared/deliver-email.ts
status:     not-started
```
Weekly, by `pg_cron`. Deliver over Telegram and, where enabled, email via Resend over HTTP. Ports 25 and 587 are blocked from Edge Functions, so SMTP is not an option.

The report goes in writing because nobody wants a trend report read aloud. The call carries a line or two of it, which T2.2 already pulls from the same facts.

Write a `deliveries` row before the attempt and record the outcome after.

**P3 handoff (2026-09-12).** Telegram channel delivery is already implemented.
Do not rewrite it. Call it.

- Import `deliverPatternTelegram` from
  `supabase/functions/_shared/deliver-telegram.ts`.
- Pass `{ userId, prose }` where `prose` is the T7.2 validated report text.
- Pass deps `{ apiUrl: ORMA_API_URL, serviceRoleKey, botToken, fetch }`.
  Never a `*.supabase.co` host.
- Skip behaviour is inside the helper. If `profiles.telegram_receipts` is false
  or `telegram_chat_id` is null, it returns `skipped` with no `deliveries` row.
- On send it inserts `deliveries` (`channel=telegram`, `kind=pattern`) before
  `sendMessage`, then sets `sent_at` or `error`.

This task still owns email: land `deliver-email.ts` and respect
`profiles.email_receipts`. Own `analysis/index.ts` for the weekly cron entry.
Do not edit `deliver-telegram.ts` unless a contract change is required.

**Done when:** a scheduled run delivers to both channels, respects each channel's toggle, and records success and failure distinguishably. Pin Telegram by calling `deliverPatternTelegram` with fixture prose and counting the `deliveries` row outcome.

---

### T7.4: Post-call receipt ★
```yaml
requires:   T2.7, T3.4
fixture-ok: yes
size:       S · mid
owns:       supabase/functions/_shared/receipt.ts, supabase/functions/_shared/receipt_tests.ts
status:     done
```
Immediately after ingestion: what the call captured, what it retired, and what was committed to.

A run with no result still sends one. The receipt reads like Orma was paying attention regardless, because the user answered the phone and that is all they know about it.

This is a receipt and never a prompt. It reports on a call that already happened and asks for nothing.

**P3 handoff (2026-09-12).** A thin starter already lives in this owns path.
Extend it. Do not replace the Telegram send path.

- `deliverIngestionReceipt` in `receipt.ts` already calls
  `deliverPostCallTelegram` with `capturedTexts` and resolved `retiredTexts`.
- Use `capturedTextsFromStructured` and `retiredItemIdsFromStructured` from
  `deliver-telegram.ts`. Resolve retirement ids to item texts via a
  `resolveRetiredText` callback (PostgREST on `items` through `ORMA_API_URL`).
- Never invent counts. Never ask. Never reveal extraction failure to the user.
- For `answered_no_result` / invalid structured result, still send a receipt
  that does not expose the failure (for example empty captured and retired
  lists, or a calm "we logged the call" line with no CTA).
- Commitments from structured results should be named when present.
- T2.7 must call `deliverIngestionReceipt` (or the expanded export) right after
  ingestion. That call site is outside this owns line. Raise a contract note if
  T2.7 is not ready, rather than editing T2.7 from here.

Pin locally:
`deno test --allow-read supabase/functions/_shared/receipt.ts supabase/functions/_shared/receipt_tests.ts`

**Done when:** the completed fixture produces a receipt naming captures and retirements, the invalid-result fixture produces one that does not reveal the failure, and neither contains a call to action.
