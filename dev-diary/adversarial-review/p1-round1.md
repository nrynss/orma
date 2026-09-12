# P1 phase closure review, round 1

## Verdict

REMEDIATE

| Severity | Count |
| --- | ---: |
| C | 1 |
| H | 0 |
| M | 1 |
| L | 0 |

## Findings

| Severity | Where | What | Pin | Mutation |
| --- | --- | --- | --- | --- |
| C | Linked migration history, `supabase/migrations/`, `web/src/lib/database.types.ts`, and `supabase/functions/_shared/database.types.ts` | The linked project has remote-only migration `20260912130243_telegram_link_audio`. It adds `items.audio_url` and `telegram_link_tokens`, but no matching local migration exists. Both generated type files omit those live fields. P1's frozen schema contract and its generated types therefore disagree with the database. | `supabase migration list --linked` reports remote `20260912130243` with an empty local version. `npm run types:check` in `web/` exits 1. Its fresh generation shows `items.audio_url` and `telegram_link_tokens`, absent from both committed type files. | Reverting the repair leaves fresh local resets and CI on a different contract from production. P3 and P4 consumers can compile against stale types or fail to create the live table. |
| M | `supabase/migrations/20260911000000_core_schema.sql` `public.set_updated_at()` | The public trigger function has no fixed `search_path`. The linked project's security advisor reports `function_search_path_mutable`. The function is part of the P1 schema contract, so its invocation context should be deterministic. | `supabase db advisors --linked --type security --level warn` reports `function_search_path_mutable` for `public.set_updated_at`. | Reverting a `SET search_path = pg_catalog` fix restores a mutable lookup context and the advisor warning. |

The same advisor also warns that `pg_net` is in `public`. That is not a finding
in this round. T1.1a deliberately declares the installed extension in `public`,
and the linked catalogue confirms that contract.

## Independent pins

| Claim | Pin | Observed result |
| --- | --- | --- |
| Local migration history represents the linked project. | `supabase migration list --linked` | The four P1 versions match locally and remotely. Remote version `20260912130243` is unmatched and is named `telegram_link_audio`. |
| Scheduler extensions are present at the declared versions. | Linked `pg_extension` catalogue query. | `pg_cron` is `1.6.4` and `pg_net` is `0.20.4`. |
| Every P1 table has live RLS and the intended policy shape. | Linked catalogue query over the thirteen contract tables, `relrowsecurity`, and `pg_policy`. | All thirteen tables have RLS enabled. The twelve user-visible tables have their expected owner policy. `webhook_events` has RLS enabled and no user policy. |
| The local seed remains browseable through RLS. | A rolled-back transaction on an isolated seed stack set `role authenticated` and each test JWT subject before counting protected rows. | The seed owner read profile 1, items 4, call runs 1, results 1, and webhook events 0. A different authenticated subject read zero of each. |
| Fixtures remain typed, complete, and masked. | `deno check supabase/functions/_shared/fixtures.ts`, loader execution, JSON inspection, and number-pattern search. | The loader returned completed, failed, event, and transcript fixtures. It returned 27 transcript turns. No unmasked phone pattern was found in the fixture or CALL-E documentation paths checked. |
| The parser keeps the null-or-correct boundary. | `deno check supabase/functions/_shared/result.ts` and an offline probe of the completed fixture, an unknown key, and a retirement without an evidence offset. | The completed fixture parsed. Each malformed value returned `result: null` with a reason. |

## Prior-finding residue

| Task and prior finding | Residue in this review |
| --- | --- |
| T1.1 H1, missing executable migration acceptance pin | None. The committed isolated runner remains present. |
| T1.1a, no prior findings | None. Both extension versions match the linked catalogue. |
| T1.2, no prior findings | None. Live RLS is enabled on every contract table and the isolated owner and non-owner browse checks hold. |
| T1.3 M1, generator failure could erase types | None. The temporary-file generator remains in place. C1 is a new live-schema drift, not a recurrence of the failed-generator defect. |
| T1.4 H1, missing typed loader | None. The loader imports and returns every committed fixture. |
| T1.4 M1, missing failed-call vocabulary | None. The documented failed vocabulary remains alongside the failed fixture. |
| T1.4 L1, stale ownership note | None. The task seam and contract-change record agree. |
| T1.5, no prior findings | None. Valid and malformed parser probes retain the required all-or-nothing behaviour. |
| T1.6 H1, invalid seed finalisation contract | None. The seed stores `answered_extracted` with a parser-valid structured result, and RLS browsing still works. |

P1 cannot close on this round. Remediation must restore one reviewed migration
history, regenerate both consumers, and resolve the mutable trigger search path.
