# Periodization Plan Builder

A tiny, single-page tool that turns your **race calendar** + **FTP** + **weekly volume** into a **Base → Build → Peak → Taper** periodized season.

**Live:** https://siirty.github.io/training-plan-builder/

## What it does

- **True multi-cycle periodization**: a long season (e.g. 51 weeks) is NEVER one
  monotonic build. It partitions into sequential macrocycles (~4 work weeks + a
  recover transition each), each anchored to a real event. A B/C event closes its
  cycle as a **Race** week; the A event gets the final **Peak + 2-week Taper**.
  Per-cycle load targets **step up** toward the season peak (each macrocycle builds
  on the last), so a multi-event or one-year season reads as a rising seasonal
  structure, not a single flat ramp.
- **Multi-event**: add your season's races with priorities. A (key) gets the final
  Peak + Taper; B/C early events become Race microcycles in their cycle.
- **Progressive overload**: volume ramps ~+8%/work-week, capped; a Recover week
  deloads but does NOT drag the overload anchor down.
- Load via `TSS ≈ hours × 100 × IF²` (TrainingPeaks-style); phase IFs Base 0.72 / Build 0.88 / Peak 0.95 / Race 0.95 / Recover 0.5 / Taper 0.55.
- Taper descends to its LIGHTEST week AT the event (60% → 40% of the build peak).
- Renders a stepped single-hue load timeline, a full weekly table (horizontally
  scrollable on mobile, linked to the timeline via hover/click), and CSV export.

## UI/UX (2026) — clean + calm design pass

Single-screen workbench, live recompute (no "Build" button), dark + light with a
persisted toggle (system default first). Hero is a stepped single-hue timeline:
week-level height = TSS load, Base→Build→Peak as a teal ramp, Race = bright
accent, Recover/Taper = muted, and the timeline is linked to the weekly table
(hover highlights; click scrolls).

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
