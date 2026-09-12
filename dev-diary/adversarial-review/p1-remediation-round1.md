# P1 phase closure remediation, round 1

| Finding | Repair | Evidence | Mutation |
| --- | --- | --- | --- |
| C1 | Reconstructed `20260912130243_telegram_link_audio.sql` under the linked remote version. It adds `items.audio_url`, the idempotent `telegram_link_tokens` table, its open-token index, RLS, and owner policy. Regenerated both consumers from the linked schema. | Linked catalogue queries found the column, five token fields, foreign key, RLS policy, and partial index. `supabase migration list --linked` now matches version `20260912130243`. `npm run types:check` passed. Both generated files contain `audio_url` and `telegram_link_tokens`. | Removing the migration or generated fields restores local and consumer drift from the linked schema. |
| M1 | Added `20260912131612_p1_closure_hardening.sql`. It replaces `public.set_updated_at()` with `search_path = ''`. The function only uses trigger data and `now()`, so an empty path is deterministic. | The linked catalogue showed no `proconfig` on the existing function. The new migration contains `set search_path = ''`, which matches the Supabase advisor remedy. `git diff --check` passed. | Removing the hardening migration restores the mutable search path and the advisor warning after deployment. |

No deployment, remote history repair, or CALL-E request occurred during remediation.
