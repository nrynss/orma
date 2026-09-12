# P3 e2e remediation round 1

Fixes every finding from `p3-e2e-round1.md`. One row per finding.

| Finding | Fix |
| --- | --- |
| C. Live webhook never called completeLink, captureTextMessage, captureVoiceNote, or voice_ok | `index.ts` now imports link, capture, and voice helpers. `/start` with a payload binds. Plain text captures. Voice acks first. `voice_ok:` answers the callback. |
| C. No telegram_link_tokens migration on phase-3 | Added `supabase/migrations/20260912130243_telegram_link_audio.sql`. Live project already applied this name. Owner RLS covers insert, select, and delete. |
| H. items.audio_url and item-audio bucket missing from repo | Same migration adds nullable `items.audio_url` and private bucket `item-audio` with owner prefix policies. Service role bypasses RLS. |
| H. depsFromEnv lacked service role and Vertex names | TelegramDeps now requires `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_MODEL`, `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION`, and `GOOGLE_APPLICATION_CREDENTIALS_JSON`. |
| H. No receipt.ts caller | Landed thin `supabase/functions/_shared/receipt.ts`. It builds captured and retired texts and calls `deliverPostCallTelegram`. T7.3 still owns `deliverPatternTelegram`. |
| M. Generated types omitted tokens and audio_url | Regenerated both `database.types.ts` copies from live schema via Supabase `generate_typescript_types`. |
| M. Settings mint and unlink absent | Landed `web/src/lib/telegram-link.ts` and `web/src/routes/app/settings/+page.svelte`. Helpers mint a hash through ORMA_API_URL and unlink both sides. T5.3 session client is still missing. |
| L. Local START_LINK_PROMPT copy in index.ts | Index now imports `START_LINK_PROMPT` from `./link.ts`. |

## Residual

T7.3 still has no analysis caller for `deliverPatternTelegram`.
T5.3 auth shell is not landed, so Settings needs a session JWT to mint against live RLS.
T7.4 still owns a fuller post-ingestion receipt. The thin wrapper is enough to close the missing-caller finding.

## Pins

`deno test --allow-net --allow-env --allow-read supabase/functions/telegram/index.ts` exited 0.
`deno test --allow-read supabase/functions/_shared/receipt.ts supabase/functions/_shared/receipt_tests.ts` exited 0.
Live SQL already listed `telegram_link_tokens`, `items.audio_url`, and bucket `item-audio`.
