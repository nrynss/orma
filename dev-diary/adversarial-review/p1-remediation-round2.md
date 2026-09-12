# P1 phase closure remediation, round 2

| Finding | Repair | Evidence | Mutation |
| --- | --- | --- | --- |
| M1 | Regenerated `web/src/lib/database.types.ts` and `supabase/functions/_shared/database.types.ts` from the linked schema. Both copies now include `Database.graphql_public`, its `graphql` function, and `Constants.graphql_public`. | `npm run types:generate && npm run types:check` passed in `web/`. The check regenerated from the linked project, compared it with the web copy, then verified both consumers match. | Reverting either generated file, or removing the `graphql_public` contract, makes `npm run types:check` fail and restores type drift. |

No migration, deployment, or package-script change occurred during remediation.
