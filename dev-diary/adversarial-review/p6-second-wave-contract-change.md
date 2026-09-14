# P6 second-wave contract change

The operator records these rows at the claim. Four tasks run in parallel on
disjoint paths. Only T6.4 reaches outside its route directory, and nothing else
touches that file while it runs.

| Where | What | Pin | Mutation |
|---|---|---|---|
| `scripts/p6-local-stack.sh` (T6.4 only) | Append a fixture `pattern_reports` row for the seed account inside `insert_harness_rows`, plus the minimal completed runs its mood trend needs. Prose numbers stay inside the facts object. | After `up`, one `pattern_reports` row exists for the seed user and every number in its prose appears in its facts. | Patterns renders only its not-yet state and the done-when report case stays unverifiable. |
| `web/src/routes/+page.svelte` (T6.8 only) | The synthetic demo plays through SpeechSynthesis from inside the page. No static audio asset is added. | `git status` shows no new file under `web/static`. | A binary asset lands without review or the demo implies a real recording. |
| Every new route directory | Pure helpers live beside the page (`history/model.ts` style). Nothing new is added under `web/src/lib`, `web/package.json`, the app layout, or another route. | `git status` shows only the task's own route dir, plus the harness for T6.4. | Concurrent tasks conflict on shared files and review cannot tell who broke what. |
| All four tasks | No node check scripts are added in this wave, so `web/package.json` stays untouched. The review wave verifies behavior against one shared local stack. | `git diff` on `web/package.json` is empty after all four land. | Four parallel edits to one check line collide. |

Shared behavior rules for the wave. Import UI from `$lib/ui` and reuse the pure
helpers in `$lib/today/model.ts` without editing them. Every table read filters
by the signed-in user id. Every clock renders in the profile timezone. Counts
come from rows. New code follows the surrounding style: tabs, no semicolons in
TypeScript, Svelte 5 runes.
