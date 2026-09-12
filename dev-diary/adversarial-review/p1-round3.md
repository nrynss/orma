# P1 phase closure review, round 3

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
| M | `web/package.json` `types:check`, `web/src/lib/database.types.ts`, and `supabase/functions/_shared/database.types.ts` | The committed generated types no longer equal a fresh linked-schema generation. The live generator now includes the `graphql_public` schema and its `graphql` function, while both committed consumer files omit it. The required drift check exits 1. | `npm run types:check` in `web/` exits 1. Its diff adds `Database.graphql_public` and `Constants.graphql_public` before comparing either consumer copy. | Reverting a regeneration that includes `graphql_public`, or retaining the current files, leaves CI red and permits the two consumers to drift from the linked schema without a passing contract check. |

## Independent pins

| Claim | Pin | Observed result |
| --- | --- | --- |
| The P1 and P3 migrations match the linked history. | Linked migration list. | Local and linked versions match through `20260912131612`, including `20260912130243_telegram_link_audio` and `20260912131612_p1_closure_hardening`. |
| The trigger has a deterministic lookup path. | Linked `pg_proc.proconfig` and `pg_get_functiondef` query for `public.set_updated_at()`. | `proconfig` is `search_path=\"\"` and the definition is `SET search_path TO ''`. The prior mutable-search-path warning is absent from the linked security advisor. |
| The deployed P1 tables retain their access boundary. | Linked `pg_class.relrowsecurity` and `pg_policy` catalogue query over the thirteen P1 tables plus `telegram_link_tokens`. | Every table has RLS. Owner or owner-read policies exist on user-visible tables. `webhook_events` has RLS and no user policy, as P1 requires. |
| The parser keeps the null-or-correct boundary. | `deno check` for `fixtures.ts` and `result.ts`, plus an offline fixture probe. | The completed result parsed. An unknown key and a retirement without `evidence_offset_seconds` each returned null with a durable reason. All four JSON fixtures parsed and no unmasked E.164 value was found. |
| P3 remains compatible with P1's deployed schema. | Linked catalogue and the merged P3 suite. | The live `items.audio_url` and `telegram_link_tokens` contract exists, and both committed consumers include those public names. The Telegram suite passed 39 index, 18 capture, 11 link, 29 voice, and 9 receipt tests. |
| No unreviewed security warning hides the prior defect. | Linked Supabase security advisors. | The only results are the expected INFO for policy-free `webhook_events` and the known WARN for `pg_net` in `public`. Neither is `function_search_path_mutable`. |

## Prior-finding residue

| Prior finding | Residue in this review |
| --- | --- |
| C1, remote-only Telegram migration and stale generated P3 fields | None. History contains `20260912130243`, both consumer files contain `items.audio_url` and `telegram_link_tokens`, and the merged Telegram suite passes. |
| M1, mutable `public.set_updated_at()` search path | None. The hardening migration is linked and the live function sets an empty search path. The security advisor no longer reports the warning. |

P1 cannot close on this round. Remediation must regenerate both committed type
consumers from the linked schema, preserving the generator's atomic-write
behaviour, then run a fresh `npm run types:check` and closure re-review.
