# P1 phase closure review, round 2

## Verdict

REMEDIATE

| Severity | Count |
| --- | ---: |
| C | 0 |
| H | 0 |
| M | 1 |
| L | 0 |

## Findings

| Severity | Where | What | Pin | Mutation |
| --- | --- | --- | --- | --- |
| M | Linked `public.set_updated_at()` and `supabase/migrations/20260912131612_p1_closure_hardening.sql` | The hardening SQL correctly defines `set_updated_at()` with `search_path = ''`, but it is a local migration only. Linked history reports remote version empty for `20260912131612`, so the linked function has not been independently proven fixed. A code-level correction does not close the security-advisor result. | `supabase migration list --project-ref pyuubklpkhjngiqqwypf` reports local `20260912131612` and empty remote history. Until it applies, `supabase db advisors --linked --type security --level warn` cannot prove removal of `function_search_path_mutable`. | Removing or leaving the unapplied migration leaves the public trigger function with a mutable lookup path and retains the advisor warning. |

## Independent pins

| Claim | Pin | Observed result |
| --- | --- | --- |
| C1 local migration history represents the linked schema. | `supabase migration list --project-ref pyuubklpkhjngiqqwypf` | Versions `20260911000000`, `20260911000001`, `20260911122907`, `20260911130516`, and `20260912130243` match local and remote history. The reconstructed Telegram migration is present locally and remotely. |
| C1 generated consumers match the linked schema. | `npm run types:check` in `web/` | Passed. Both generated consumers agree with fresh linked-schema output, including `items.audio_url` and `telegram_link_tokens`. |
| C1 reconstructed DDL carries the required contract. | Read-only inspection of `20260912130243_telegram_link_audio.sql` and the generated linked types. | The migration adds nullable `items.audio_url`, creates `telegram_link_tokens` with its five generated fields and profile foreign key, enables RLS, and creates the owner policy and open-token index. |
| M1 hardening is correct as source. | Read-only inspection of `20260912131612_p1_closure_hardening.sql`. | The replacement function uses `set search_path = ''`. This corrects the code-level defect, but source inspection cannot establish the linked advisor result. |

## Prior-finding residue

| Prior finding | Residue in this review |
| --- | --- |
| C1, remote-only Telegram migration and stale generated types | None. Linked migration history now contains `20260912130243`, and the independent type check passes. |
| M1, mutable `public.set_updated_at()` search path | Present. The proposed hardening migration is not in linked history, so the linked security state remains unproven. |

P1 cannot close on this round. Apply the approved hardening migration, then run the
linked security-advisor pin and re-review with a reviewer who did not write this
round.
