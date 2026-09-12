# P3 e2e round 1 review

## Verdict

**REMEDIATE**

Phase P3 is not complete as an integrated Telegram product.
Helper tasks T3.1 to T3.5 keep their seam APPROVE verdicts.
This review does not reopen those owns claims.

| C | H | M | L |
| --- | --- | --- | --- |
| 2 | 3 | 2 | 1 |

## Findings

| Sev | Where | What | Pin | Mutation |
| --- | --- | --- | --- | --- |
| C | `supabase/functions/telegram/index.ts` (T3.1) | Live webhook never calls `completeLink`, `captureTextMessage`, `captureVoiceNote`, or `voice_ok` handlers. Bot only replies to bare `/start` with a local prompt. | SHA `2bed97b68b1d7b129e5cd3a334a2eaaf6da0ecc7`. String scan found zero imports from `capture.ts`, `link.ts`, or `voice.ts`. Zero matches for those four symbols. `createTelegramBot` only registers `bot.command("start")`. | A real text or voice update never inserts. A deep-link `/start <token>` never binds. Confirm callbacks spin. P3 goal fails on the front door. |
| C | Migrations under `supabase/migrations/` (T1.1) | No `public.telegram_link_tokens` table. Link REST adapter posts into a missing relation. | Directory lists only core schema, RLS, and extension migrations. Core schema has `profiles.telegram_chat_id` and `telegram_receipts` only. No file named for telegram link tokens. | Replay and expiry cannot survive a cold isolate. Live bind path cannot consume a hashed token. |
| H | Migrations and Storage (T1.1) | `items` has no `audio_url`. No `item-audio` bucket. Voice REST posts both. | Core `items` columns stop at `retired_reason`. RLS enables table policies only. No storage bucket SQL. `createRestVoiceStore` POSTs `audio_url` and `/storage/v1/object/item-audio/`. | Wired voice capture still fails on insert or upload. Item cannot carry stored audio evidence. |
| H | T3.1 `TelegramDeps` / `depsFromEnv` | Runtime loads bot token, webhook secret, and `ORMA_API_URL` only. Capture and voice need service role and Vertex names. | `depsFromEnv` body names those three keys only. Index source has no `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_MODEL`, `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION`, or `GOOGLE_APPLICATION_CREDENTIALS_JSON`. | Even after handler wiring, Rest stores and Vertex transcribe cannot boot. |
| H | T7.4 `receipt.ts` and T7.3 analysis | `deliverPostCallTelegram` and `deliverPatternTelegram` exist. No caller invokes them on this branch. | `_shared` lists `deliver-telegram.ts` and tests. No `receipt.ts`. No `analysis` function directory. | Post-call and pattern receipts never leave the helper. Phase goal to deliver receipts stays unfinished. |
| M | `database.types.ts` (T1.3) | Generated types omit `telegram_link_tokens` and `items.audio_url`. | Shared and web copies share SHA `22e3faa25ace3dc7d01c14f145e67ba749a2cf65`. `items.Row` has no `audio_url`. Tables map has no `telegram_link_tokens`. | Callers type against columns and tables the generated file does not name. |
| M | `web/src/routes/` (T6.5) | Settings mint and unlink are absent. No deep-link issuer for Start press. | Routes contain only `+layout.svelte` and `+page.svelte`. No `app/settings` tree. | Users cannot mint or clear links from the app. Unlink done-when never runs from Settings. |
| L | `index.ts` START prompt | Prompt text matches `link.ts` but is a local copy. T3.1 done-when asks for the prompt from T3.5. | Both `START_LINK_PROMPT` strings compare equal. Index does not import `./link.ts`. | Prompt can drift. Deep-link bind still missing either way. |

## Independent checks

Fetched `phase-3` blobs through user-Github MCP.
Rebuilt a local tree under `/workspace/p3-e2e` with matching git blob SHAs for index, capture, link, voice, voice_rest, and deliver-telegram.

`deno` on PATH was Deno 2.9.6.

`deno test --allow-net --allow-env --allow-read supabase/functions/telegram/index.ts` reported 5 passed, 0 failed.

`deno test --allow-read supabase/functions/telegram/capture.ts` reported 18 passed, 0 failed.

`deno test --allow-read supabase/functions/telegram/link.ts` reported 11 passed, 0 failed.

`deno test --allow-read supabase/functions/telegram/voice.ts` reported 29 passed, 0 failed.

`deno test --allow-read supabase/functions/_shared/deliver-telegram.ts supabase/functions/_shared/deliver-telegram_tests.ts` reported 9 passed, 0 failed.

String scan of live `index.ts` found no capture, voice, or link wiring.

Read `supabase/config.toml`. `[functions.telegram] verify_jwt = false` is present.

Read core schema and RLS. Profiles already expose `telegram_chat_id` and `telegram_receipts`. `deliveries` exists. `items.audio_url`, `telegram_link_tokens`, and bucket `item-audio` do not.

Read shared `database.types.ts` and listed `web/src/lib/database.types.ts`. Both copies share the same blob SHA and the same gaps.

Read all `t3.*` contract-change and handoff notes. Each names the open cross-seam work honestly.

PR #1 (`phase-3` into `main`) is open draft. Changed files are P3 helpers, config, diary, and reviews. No schema migration for tokens or audio. No Settings route. No receipt caller.

## T3.x done-when vs live wiring

| Task | Done-when (phase diary) | Helper seam | Live integrated path |
| --- | --- | --- | --- |
| T3.1 | Message reaches function. Forged secret rejected. `/start` answers linking prompt from T3.5. | Passes. Secret discard and GET setWebhook pinned. Prompt text matches T3.5 copy. | Secret and JWT-off hold. `/start` does not call `completeLink`. Prompt is not imported from `link.ts`. |
| T3.2 | Message creates one item. Reply quotes text. Unlinked chat is prompted. | Passes on `captureTextMessage`. | Not wired from `index.ts`. Live text never inserts or replies. |
| T3.3 | Ack within a second. Edit with transcript. Item carries audio link. Failure is actionable. | Passes on `captureVoiceNote` and adapters. | Not wired. No `voice_ok` callback handler. Schema lacks `audio_url` and `item-audio`. |
| T3.4 | Fixture run yields named summary. `deliveries` records outcome. Receipts-off user gets nothing. | Passes on deliver helpers. | No T7 caller on this branch. Outbound receipts never run after a call. |
| T3.5 | Fresh link binds. Replay refused. Expiry refused. Settings unlink clears both sides. | Passes on memory and REST doubles. | `/start` ignores payload. No token table. No Settings mint or unlink UI. |

## Contract gaps still open

1. T3.1 must wire `completeLink` on `/start` with payload and reply via `messageForLinkOutcome`.
2. T3.1 must wire `captureTextMessage` for non-command text and reply with its `reply`.
3. T3.1 must wire `captureVoiceNote` before download or model work, and answer `voice_ok:` callbacks.
4. T3.1 `depsFromEnv` must require `SUPABASE_SERVICE_ROLE_KEY` plus Vertex and Gemini names for voice.
5. T1.1 must add `telegram_link_tokens` with hash uniqueness and consume semantics.
6. T1.1 must add `items.audio_url` and private bucket `item-audio`.
7. T1.3 must regenerate both `database.types.ts` copies after those land.
8. T6.5 must mint through `mintLinkToken` and unlink through `unlinkTelegram` in Settings.
9. T7.4 must call `deliverPostCallTelegram` after ingestion with named texts.
10. T7.3 must call `deliverPatternTelegram` with report prose.

## Recommended remediation order

1. **T1.1 schema.** Land `telegram_link_tokens`, `items.audio_url`, and bucket `item-audio` first so REST adapters stop aiming at missing objects.
2. **T1.3 types.** Regenerate shared and web `database.types.ts` immediately after the migration.
3. **T3.1 wiring.** Load full env. Import link, capture, and voice helpers. Bind `/start`, text, voice, and `voice_ok` in `index.ts`.
4. **T6.5 Settings.** Mint deep links and unlink so a human can complete Start press.
5. **T7.4 then T7.3.** Call deliver helpers so receipts close the phase goal.

Do not mark T3.1 to T3.5 undone for owns breaches.
Their APPROVE notes already recorded these gaps as contract changes.
Phase status should stay incomplete until the live front door captures and receipts flow.

## Phase goal pin

Diary goal: capture a thought by text or voice and deliver receipts. Never ask.

On `phase-3` today a forged webhook is rejected and helpers unit-test clean.
A linked user still cannot capture text or voice through the bot.
A deep-link Start press still cannot bind.
Outbound receipts still have no caller.

PR #1 therefore cannot satisfy the P3 product goal end to end.
