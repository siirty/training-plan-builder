# Periodization Plan Builder

A tiny, single-page tool that turns your **race calendar** + **FTP** + **weekly volume** into a **Base → Build → Peak → Taper** periodized season.

**Live:** https://siirty.github.io/training-plan-builder/

## What it does

- **Multi-event**: add your season's races with priorities. The A (key) event gets the full Peak + 2-week Taper; B/C events get an embedded **Race week + Recover (deload) week** as microcycles in the Build region.
- Computes season length from today to your A event, allocates Base (≈40%) → Build (≈35%) → Peak (≈15%) → Taper (2 wks).
- **Progressive overload**: volume ramps ~+8%/work-week, capped +25% over the previous *work* week (deloads don't cap re-entry).
- Load via `TSS ≈ hours × 100 × IF²` (TrainingPeaks-style); phase IFs Base 0.72 / Build 0.88 / Peak 0.95 / Race 0.95 / Recover 0.5 / Taper 0.55.
- Taper anchored to the achieved build peak (cut to 60% then 40%) — a genuine taper, verified by regression test.
- Renders a phase-colored load chart + legend, a full weekly table (horizontally scrollable on mobile), and CSV export.

## Values used — honest sourcing

- The **load formula** `TSS = hours × 100 × IF²` is the documented TrainingPeaks relationship (1 h at IF 1.0 = 100 TSS).
- **Phase splits, IF factors, +8% ramp, taper percentages** are *reasonable approximations from standard periodization practice*, **not** sourced from a single citeable reference and **not coaching advice**. They're surfaced (phase legend, per-week IF/TSS) so you can see and adapt them.

## Stack

Vite + TypeScript, zero runtime deps, fully client-side. Deterministic, tested engine. Deploys to GitHub Pages via `gh-pages` branch (`base: "./"`).

## Verify

```bash
pnpm install
pnpm test    # 15 tests: phase order, work-week ramp cap, TSS formula, taper-ends-low, B/C microcycles, sort/promotion
pnpm check   # tsc --noEmit + production build
```

## What this is

A **bet** that proved the weekly pipeline (idea → build → test → deploy → live browser verification) end-to-end, incl. a real bug caught only by live testing (taper volume). "Periodization" is crowded (TrainingPeaks/TrainerRoad/Intervals.icu); this ships as a fast, free, verifiable tool to test whether the niche responds before any bigger investment.
