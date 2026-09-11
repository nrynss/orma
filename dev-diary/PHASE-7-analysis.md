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
owns:       supabase/migrations/*_facts.sql
status:     not-started
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
owns:       supabase/functions/analysis/prose.ts
status:     not-started
```
Gemini receives the facts object and writes the report. It gets no transcripts and no ability to count.

Validate the output before it is stored: every number appearing in the prose must appear in the facts. If it does not, regenerate. This check is the whole reason the two stages are separate, so it is not optional and it is not a warning.

Keep it short. A report nobody finishes is a report that changed nothing.

**Done when:** a fixture facts object yields prose containing only its own numbers, a deliberately hallucinated number is caught and regenerated, and the same facts twice produce stable output.

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

**Done when:** a scheduled run delivers to both channels, respects each channel's toggle, and records success and failure distinguishably.

---

### T7.4: Post-call receipt ★
```yaml
requires:   T2.7, T3.4
fixture-ok: yes
size:       S · mid
owns:       supabase/functions/_shared/receipt.ts
status:     not-started
```
Immediately after ingestion: what the call captured, what it retired, and what was committed to.

A run with no result still sends one. The receipt reads like Orma was paying attention regardless, because the user answered the phone and that is all they know about it.

This is a receipt and never a prompt. It reports on a call that already happened and asks for nothing.

**Done when:** the completed fixture produces a receipt naming captures and retirements, the invalid-result fixture produces one that does not reveal the failure, and neither contains a call to action.
