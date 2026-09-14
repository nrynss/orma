# P9: Product UI

```yaml
id:       P9
size:     L
requires: [P6]
blocks:   [T8.4]
parallel: [P8 except T8.4]
```

**Goal:** Orma looks like a modern product, not a blog. Every surface moves together through one shared design system, and no behaviour changes.

**Why now.** The P6 build follows the editorial design canvas faithfully. The result reads as long-form prose. Small serif type sits in narrow centred columns on a dark page, with few surfaces and little hierarchy. Judges see the landing and the app before they read a line of code, and the demo video films these screens.

**Direction, decided 14 September.** A full modern product UI across every page, delivered through the shared tokens. Sans-serif throughout, a clear type and spacing scale, card surfaces, bolder colour, and denser app pages. The design canvas in `design/orma-app/` still defines what each screen contains and which states it has. P9 replaces how it looks.

**Phone first and reactive.** The demo is recorded with scrcpy from the operator's Android phone, so the phone is the primary screen and desktop is the adaptation. Design and verify at 360 and 412 pixels wide first. Every layout reflows fluidly from 320 to 1440 with no fixed-width columns.

Reactive also means the screen answers the user at once. A tap shows pressed state immediately. Retire, restore, cancel, pause and consent changes update the page in place, with no full reload and no stale count. Use the existing loaders and `invalidate` for that, never a new query. Loading shows skeletons in the final layout, so nothing jumps when data arrives. Transitions are short and respect `prefers-reduced-motion`.

On the phone, respect safe-area insets, keep primary actions within thumb reach, and never hide an action behind hover.

**What must not change.** P9 restyles markup. It does not change logic.

- Loaders (`+page.ts`), `model.ts` files, `web/src/lib/today/`, `web/src/lib/supabase.ts` and every query stay as they are. A needed logic change is a contract change, raised in the review file.
- Counts, ages and clocks still come from the same rows, in the profile timezone.
- Copy with weight stays word for word. That covers the consent wording stored in `consents.text_version`, the synthetic demo label, the unrecognised-number warning, and the cancellation and deletion warnings.
- `npm run check` and `npm run build` pass after every task. Every P6 pin still holds against `scripts/p6-local-stack.sh`.
- The page never scrolls horizontally at 320 pixels wide. Touch targets stay at least 44 pixels. Text meets WCAG AA contrast in light and dark.

**Order.** T9.1 lands first, then T9.2. T9.3 to T9.8 own disjoint files and run in parallel after that. T9.9 closes the phase and gates the deploy. Deploy only the whole phase at once, never a half-migrated app. T8.4 records after the deploy.

---

### T9.1: Design system ★
```yaml
requires:   T6.1
fixture-ok: yes
size:       M · frontier
owns:       web/src/lib/ui/, web/src/app.html, web/src/routes/dev/ui/
status:     done
```
Replace the editorial tokens with a product system. Every later task builds on this, so it decides rather than transcribes.

Tokens in light and dark: a system sans-serif stack with tabular numerals and no web font download, a type scale, a spacing scale, radii, elevation, and colour roles. The roles are canvas, surface, raised surface, border, text, muted text, brand, brand contrast, success, warning and danger. Keep a plum brand hue so Orma stays recognisable, but give it real weight.

Components with props, not only classes: Button in primary, secondary, ghost and danger, Card, Badge, Stat, EmptyState, Field, Switch and Section header. Restyle the existing `AppNav`, `MoodMarker`, `ItemLine` and `LiveDot` without renaming their exports, so every page still compiles before its own task lands.

A gallery at `/dev/ui` renders every component and token in both themes. It is reachable only in development, through `dev` from `$app/environment`, and answers 404 in a production build.

**Done when:** every page still builds and passes `npm run check` on the new tokens alone, the gallery shows every component in light and dark, the gallery 404s in production, and every text token pair meets AA contrast by measurement.

---

### T9.2: Shell and navigation ★
```yaml
requires:   T9.1
fixture-ok: yes
size:       S · mid
owns:       web/src/routes/+layout.svelte, web/src/routes/app/+layout.svelte,
            web/src/lib/shell/, web/src/lib/assets/orma-wordmark-light.svg,
            web/src/lib/assets/orma-wordmark-dark.svg, web/src/app.html (viewport meta only)
status:     done
```
The frame every page sits in.

Public pages get a product header with the wordmark, a short nav, and one clear Sign in action. On phone, the app gets a fixed bottom tab bar with icons and labels, clear of the safe-area inset, and a compact sticky header. From tablet width up it becomes a sidebar. The account name and Sign out sit in an account menu. Onboarding keeps a minimal header, as the design shows.

Page content fills the phone width with consistent gutters. On desktop, app pages use a wide content area, not a prose column. Moving between tabs keeps the shell in place, so only the page content changes.

**Done when:** every `/app` page shows exactly one navigation with the current page marked, the tab bar works at 360 pixels and on the operator's phone, no content hides behind the tab bar, keyboard focus is visible on every nav target, and signed-out routing is unchanged.

---

### T9.3: Landing and sign-in ★
```yaml
requires:   T9.1, T9.2
fixture-ok: yes
size:       M · frontier
owns:       web/src/routes/+page.svelte, web/src/routes/login/, web/static/landing/
status:     done
```
The first screen a judge sees.

The landing becomes a product page. A hero states what Orma does in one line, with the primary Sign in action and a product visual. A how-it-works row covers the three steps: set a time, answer the call, the list stays honest. The call beat, the surfaces (phone, Telegram, MCP), and a trust section (consent, cancel anytime, dry run) follow.

The T6.8 synthetic demo stays, still plays, and keeps its label word for word. A product visual may be a static image under `web/static/landing/`, captured from the local harness with seeded data and no real numbers.

Sign-in becomes a centred card with the email form and Telegram login, and the same routing as today.

**Done when:** the landing is server rendered with the hero and its Sign in action above the fold at 360 by 780 and at 1280 by 800, the demo plays and is labelled, both sign-in paths still work against the harness, and no image shows a real phone number.

---

### T9.4: Onboarding
```yaml
requires:   T9.1, T9.2
fixture-ok: yes
size:       S · mid
owns:       web/src/routes/app/onboarding/+page.svelte
status:     done
```
A stepper with clear progress, one question per step, and a strong primary action.

The consent paragraph is stored verbatim as `text_version`. Do not change a character of it. The onboarding check must pass unchanged.


---

### T9.5: Today
```yaml
requires:   T9.1, T9.2
fixture-ok: yes
size:       M · mid
owns:       web/src/routes/app/+page.svelte
status:     done
```
A dashboard. The next call is a prominent card with its time and actions. The last call is a card with its stats and the retired, committed and captured lines. Open items are a list with mention and age badges.

Every state keeps its own look: first run, live, blocked and error.
**Done when:** all four states render against the harness accounts with the same numbers the round 2 T6.1 review measured, loading shows a skeleton with no layout jump, and the live state updates in place and still stops polling on leave.


---

### T9.6: Items and History
```yaml
requires:   T9.1, T9.2
fixture-ok: yes
size:       M · mid
owns:       web/src/routes/app/items/+page.svelte, web/src/routes/app/history/+page.svelte
status:     done
```
Items becomes a list with open and retired tabs, inline retire and restore, and a date control for the since-date. History becomes a call list with disposition and mood badges, and a transcript view with timestamps and a highlighted evidence turn.

**Done when:** retire and restore update the list in place with no reload and counts matching rows, a History deep link still expands the run and marks the turn, and both pages read clearly at 360 wide.

---

### T9.7: Patterns and Timeline
```yaml
requires:   T9.1, T9.2
fixture-ok: yes
size:       M · mid
owns:       web/src/routes/app/patterns/+page.svelte, web/src/routes/app/timeline/+page.svelte
status:     done
```
Patterns shows the report prose in a card beside stat tiles for the facts, and a restyled mood trend that uses the token colours in both themes. Timeline shows each run as a vertical step list with status colour, and payloads in expandable code blocks.

**Done when:** every facts field still shows beside the prose, the trend draws the same points from the same rows, the not-yet state still shows for thin history, and a failed run still names where it stopped.

---

### T9.8: Settings
```yaml
requires:   T9.1, T9.2, T6.7
fixture-ok: yes
size:       M · mid
owns:       web/src/routes/app/settings/+page.svelte
status:     done
```
Settings becomes grouped cards: profile, calls and slots, consent, receipts, Telegram, and a danger zone. The danger zone holds pause, cancel today and delete account, each with its existing warning word for word.

**Done when:** every Settings action still works against the harness and updates its card in place, Telegram mint and widget attach still render, and deletion still requires its confirmation before calling `delete_my_account`.

---

### T9.9: Visual QA and release ★
```yaml
requires:   T9.3, T9.4, T9.5, T9.6, T9.7, T9.8
fixture-ok: yes
size:       S · frontier
owns:       dev-diary/adversarial-review/p9-screens/
status:     done
```
One pass over the whole app as a single product.

Capture every route in light and dark, at 360, 412 and 1280 wide, against the harness, into `p9-screens/`. Measure contrast on every text style. Check for horizontal scroll from 320 wide, focus visibility, 44 pixel targets, and skeletons with no layout jump. Re-run every P6 pin. Confirm no two pages style the same component differently.

Walk the demo path once on the operator's Android phone, mirrored through scrcpy: sign in, Today, retire an item in Items, History, Settings. Record what felt slow or unclear.

The deploy follows only after this review approves, and only with the operator's go-ahead.

**Done when:** the screen set exists for every route and state, the phone walk-through shows no reload, jump or clipped control, the review approves with zero findings, every P6 pin holds, and the operator approves the deploy.
