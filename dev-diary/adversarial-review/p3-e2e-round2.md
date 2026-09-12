# P3 e2e round 2 review

## Verdict

**APPROVE**

Phase P3 is clean for capture, link, and voice wiring on the live front door.
Helper seams T3.1 to T3.5 stay APPROVE.

| C | H | M | L |
| --- | --- | --- | --- |
| 0 | 0 | 0 | 0 |

## Zero-residue claim

Round one listed two C, three H, two M, and one L. This review found zero residue from each.

| Prior finding | Independent pin | Result |
| --- | --- | --- |
| C. index.ts never wired helpers | Source now imports completeLink, captureTextMessage, captureVoiceNote, and parseVoiceConfirmCallback. createTelegramBot registers start, text, voice, and voice_ok. | Resolved. |
| C. No token table in repo migrations | File `20260912130243_telegram_link_audio.sql` is on phase-3. Live list_migrations already includes telegram_link_audio. | Resolved. |
| H. No audio_url or item-audio | Migration and live schema both have items.audio_url and private bucket item-audio. | Resolved. |
| H. depsFromEnv missing service role and Vertex | depsFromEnv requires those five extra names and throws when any is missing. | Resolved. |
| H. No receipt caller | receipt.ts calls deliverPostCallTelegram with fixture texts. | Resolved. |
| M. Types omitted new table and column | Both database.types.ts copies name telegram_link_tokens and items.audio_url. | Resolved. |
| M. No Settings mint or unlink | Route and client helpers land mintLinkToken and unlinkTelegram against ORMA_API_URL. | Resolved as a route. Auth residual named below. |
| L. Local prompt copy | START_LINK_PROMPT is imported from link.ts. | Resolved. |

## Named residuals

These do not reopen the round-one findings.

1. T7.3 still does not call `deliverPatternTelegram`. Pattern delivery waits on analysis.
2. T5.3 has no session client. Settings can mint only after a signed-in JWT exists.
3. T7.4 still owns a fuller receipt after ingestion. The thin wrapper is the P3 caller.

## Independent checks

Read phase-3 `index.ts` after the remediation commit.
Confirmed imports from `./link.ts`, `./capture.ts`, and `./voice.ts`.
Confirmed `/start` payload calls `completeLink` and replies `messageForLinkOutcome`.
Confirmed bare `/start` replies `START_LINK_PROMPT` from link.ts.
Confirmed plain text calls `captureTextMessage` and replies when not ignored.
Confirmed voice calls `captureVoiceNote`.
Confirmed `voice_ok:` calls `answerCallbackQuery`.
Confirmed `depsFromEnv` names service role and Vertex keys.
Confirmed migration file and live table, column, and bucket.
Confirmed both generated types copies include the new table and column.
Confirmed telegram Edge Function redeploy with `verify_jwt: false`.

`deno test --allow-net --allow-env --allow-read supabase/functions/telegram/index.ts` exited 0.
`deno test --allow-read supabase/functions/_shared/receipt.ts supabase/functions/_shared/receipt_tests.ts` exited 0.

## Phase goal pin

Diary goal: capture a thought by text or voice and deliver receipts. Never ask.

On phase-3 after this round the live webhook can bind a Start token, insert text, and ack voice.
Post-call receipt text can be built and sent through the thin T7.4 wrapper.
Pattern receipt still has no T7.3 caller.
Settings mint needs T5.3 before a human can finish Start press from the app alone.

P3 e2e is clean for capture, link, and voice wiring.
