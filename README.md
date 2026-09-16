# Periodization Plan Builder

A tiny, single-page tool that turns three inputs — your **goal/event date**, **current FTP (W)**, and **current weekly volume (h)** — into a full **Base → Build → Peak → Taper** training plan.

**Live:** https://siirty.github.io/training-plan-builder/

## What it does

- Computes the plan duration from today to your goal date (clamped to a minimum 4-week build).
- Allocates weeks chronologically: **Base** (≈40%) → **Build** (≈35%) → **Peak** (≈15%) → **Taper** (fixed 2 weeks).
- Ramps volume ~8%/week during Build, capped so no single week jumps more than +25% over the previous one.
- Computes a per-week load estimate using the TrainingPeaks-style simplification `TSS ≈ hours × 100 × IF²`, with phase intensity factors Base `0.72` / Build `0.88` / Peak `0.95` / Taper `0.55`.
- Adapts the week descriptors to your **focus** (endurance / VO2max / threshold / race).
- Renders a load bar-chart, a full weekly table, and a **CSV export**.

## Stack

- Vite + TypeScript, zero runtime dependencies, fully client-side (no backend, no auth).
- Deterministic, tested plan engine (`src/engine.ts`).
- Deploys to GitHub Pages (`gh-pages` branch; `base: "./"` for subpath asset URLs).

## Verify

```bash
pnpm install
pnpm test      # 9 domain-correctness tests (phase order, ramp cap, TSS formula, taper)
pnpm check     # tsc --noEmit + production build
```

## What this is (week 1 validation sprint)

This is a **bet**, not a product. It proved the weekly pipeline (idea → build → test → deploy → live-verify) end-to-end. A "periodization builder" is a crowded space (TrainingPeaks / TrainerRoad / Intervals.icu); this ships as a fast, free, verifiable tool to test whether the niche responds before any bigger investment.
