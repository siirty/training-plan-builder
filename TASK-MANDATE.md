# TASK-MANDATE — UI/UX pass for training-plan-builder

## Working mode
Deliver the approved UI/UX design as vertical-slice PRs onto the `ui-ux-pass`
FEATURE BRANCH. **Every change lands via a PR into `ui-ux-pass` (never into
`main`); self-review + merge each PR on green gates; leave `ui-ux-pass`
un-merged into `main` for the user's review.** This is the standing
multi-pr-feature-delivery workflow.

## Approved design (from the grilling session — do not silently re-decide)
Target user: **self-coached hobbyist endurance athlete.** Tool is stand-alone,
free to use, honest ("great guidance, not coaching-advice precision").

- **Clean + calm** visual language, oriented on similar-complexity web tools
  (Stripe/Linear/Notion).
- **Dark + light with an easy toggle; system default on first visit;** choice
  persisted (localStorage). Use CSS custom-property theme tokens.
- **Single-screen workbench**: inputs up top, plan renders below.
- **Live recompute**: drop the "Build plan" button; plan re-shapes as you
  edit any input (debounced). Deterministic, fast engine — no blocking.
- **Hero = a horizontal phase-timeline**: block-level spans, SINGLE HUE ramp
  (deeper shade = heavier load), bright accent for Race weeks + muted accent
  for Recover/tail; WEEK-LEVEL height = TSS so load rises/dips/tapers in one
  visual. Replaces the standalone TSS bar chart (integrated, not duplicated).
- **Timeline ↔ table are LINKED**: hovering a week highlights that row in the
  table; clicking a block scrolls the table to its rows.
- **Honesty note always-visible but quiet** on the plan view: "defaults are
  reasonable approximations, not coaching advice".
- KO-FI account is deferred and user-owned — do NOT add a donation CTA yet.
- Multi-sport splitting is deferred — do NOT add it.

## Slice backlog (each a PR, in dependency order)
1. Theme system (dark/light, system default, persisted toggle) — no blockers.
2. Live recompute — no blockers.
3. Stepped-load phase-timeline hero — no blockers.
4. Timeline ↔ table linkage — **blocked by #3**.
5. Honesty footnote + final polish (README value-sourcing note too) — no blockers.

## Execution
- Pre-flight: base (`main`) is green — 18 tests + `tsc` + `vite build`.
- Trivial first PR = the mandate file itself (docs-only) to prove the loop.
- Per slice: short work branch off `ui-ux-pass` (`slice/<n>-<slug>`), implement
  + run gates (`pnpm test`, `pnpm check`), explicit `git add` (never `git add .`),
  PR into `ui-ux-pass`, wait for runner CI green, merge (`--merge --delete-branch`),
  append STATUS LOG below.
- Wide refactors: none expected — the engine is untouched; this is a UI-layer
  pass on the existing `main.ts`/`index.html`/`style.css`.
- DO NOT merge the feature branch into `main`.

## Values / honesty
Sport IFs, ramp caps, taper percentages are approximations from standard
periodization practice, NOT a single citeable reference and NOT coaching advice.
Keep this surfaced (see slice #5).

## STATUS LOG
(Slice 0 = this mandate, merged first, trivial docs PR.)
- #1 docs: UI/UX pass mandate (slice/0) — merged.
- #2 theme: dark/light, system default, persisted (slice/1) — merged.
- #3 live: recompute on input, drop Build button (slice/2) — merged.
- #4 ui: stepped single-hue timeline hero (slice/3) — merged.
- #5 ui: timeline<->table linkage (slice/4) — merged.
- #6 docs: README UI/UX pass (slice/5) — merged.
Feature branch `ui-ux-pass` COMPLETE. LEFT UN-MERGED INTO `main` for user review (all slices merged on local green gate; NO runner CI exists — gh token lacks `workflow` scope, so no Actions workflow).
