# P9 contract change

The operator recorded these rows at the P9 claim, from a read of the phase
document against the current tree. The phase itself is unchanged. These are the
gaps it leaves open.

| Where | What | Pin | Mutation |
|---|---|---|---|
| `dev-diary/README.md` | The P9 commit added the phase document only. The phase graph, the status board and the current status line now name P9 and its order. | The README carries a P9 row in the phase graph, a P9 board row, and a current status line that names P9. | The board hides a whole phase, and a cold agent cannot find it. |
| `web/src/routes/+layout.svelte` (T9.2) | `tokens.css` is imported by the app layout alone, so public pages have no tokens today. T9.2 imports it once at the root layout, which wraps every route, and drops the app layout import. | The gallery, the landing page and the login page all resolve token values in a production build. | Landing and login carry literal colours and drift from the system. |
| `web/src/lib/ui/tokens.css` (T9.1) | T9.1 defines the new role tokens and retires the `--o-*` editorial names. Every page migrates its own style block inside its own task. No aliases are kept. | After T9.8 the tree holds zero `var(--o-` references outside the removed set, and `p9-screens/` shows every page on role tokens. | Two naming systems live side by side and pages keep the editorial palette. |
| `web/src/routes/app/+page.svelte` (T9.5), `web/src/routes/app/items/+page.svelte` (T9.6), `web/src/routes/app/settings/+page.svelte` (T9.8) | `invalidate` sets the client navigation state, so a skeleton keyed on it flashes on every poll tick and on every in-place action. Skeletons show only when the navigation target URL differs from the current URL. In-place updates keep the rendered content and never flash. | Watching Today across one live poll tick shows no skeleton and no layout jump. | The live card blinks every fifteen seconds, and retire flashes the whole list. |
| `dev-diary/adversarial-review/p9-screens/` (T9.9) | T9.9 owns screenshots and the review, not code. Any cross-page cleanup the visual pass finds is raised as a finding against the page that owns the file. | Every finding names a page task, and none is closed by editing a screenshot. | The visual pass becomes a code owner with no review. |
| Operator steps | T9.2 and T9.9 name the operator's phone and a scrcpy walk-through. No agent can run those. Automated checks cover 320, 360, 412 and 1280 wide in both themes. The phone walk is recorded as handoff residue for the operator. | The handoff log names the phone walk as owed to the operator, and no review claims to have run it. | A review claims a phone check nobody performed. |

Copy with weight stays word for word. That covers the consent paragraph, the
synthetic demo label, the unrecognised-number warning, and the cancellation and
deletion warnings.
