// periodization engine v2 — multi-block season + strength axis + sport-aware load
//
// Theory:
//  - Linear periodization is only correct for a ~4–20 week horizon. Long
//    seasons are broken into repeated MACROBLOCKS (Issurin-style block
//    periodization): each block rotates a quality emphasis, ~4 work weeks with
//    progressive volume, then a 1-week RECOVER transition. The A event always
//    gets a fixed PEAK + 2-week TAPER.
//  - STRENGTH is a SEPARATE axis (concurrent periodization). It NEVER merges
//    into the aerobic hours*IF² load. It periodizes opposite to the aerobic
//    peak: accumulation (3/wk) in Base → intensification (2/wk) in Build →
//    realization (1/wk) near-peak → dropped in the final taper.
//  - Load is sport-aware: cycling uses native TSS (power); running a translated
//    R-TSS with stricter ramp caps (impact stress); swimming is an approximation.
//
// Honest simplification: mid-season B/C events don't get individual Race-week
// microcycles in this version — blocks + the fixed A-event peak/taper. Noted
// as a future enhancement, not silently dropped.

export type Sport = "cycle" | "run" | "swim";
export type Focus = "endurance" | "vo2" | "threshold" | "race";
export type Priority = "A" | "B" | "C";
export type PhaseName = "Base" | "Build" | "Peak" | "Taper" | "Race" | "Recover";
export type StrengthIntent = "accumulation" | "intensification" | "realization" | "deload" | "none";

export interface RaceEvent {
  dateISO: string;
  name: string;
  priority: Priority;
}
export interface StrengthWeek {
  sessions: number;
  intent: StrengthIntent;
  notes: string;
}
export interface WeekPlan {
  week: number;
  block: number;           // macroblock index; 0 = tail (peak/taper)
  phase: PhaseName;
  hours: number;
  tss: number;
  ifVal: number;
  focus: string;
  event?: string;
  strength: StrengthWeek;
}
export interface MacroBlock {
  block: number;
  focus: Focus;
  weeks: number;
  peakHours: number;
}
export interface Plan {
  weeksTotal: number;
  sport: Sport;
  ftp: number;
  endHours: number;
  blocks: MacroBlock[];
  events: RaceEvent[];
  weeks: WeekPlan[];
}

// --- sport specifications -------------------------------------------------
interface SportSpec {
  // IF per phase
  ifBase: number; ifBuild: number; ifPeak: number; ifTaper: number; ifRecover: number;
  gain: number;       // volume ramp per work week
  rampCap: number;    // max +% of START added per week (stops runaway compounding)
  maxPeak: number;    // hard weekly-*hours* ceiling even if user set higher
  focusBase: string;
}
const SPORT: Record<Sport, SportSpec> = {
  cycle: {
    ifBase: 0.72, ifBuild: 0.88, ifPeak: 0.95, ifTaper: 0.55, ifRecover: 0.5,
    gain: 0.08, rampCap: 0.25, maxPeak: 20,
    focusBase: "Long steady endurance (Z2)",
  },
  run: {
    ifBase: 0.72, ifBuild: 0.88, ifPeak: 0.92, ifTaper: 0.6, ifRecover: 0.55,
    gain: 0.06, rampCap: 0.18, maxPeak: 15,   // stricter: impact-load injury risk
    focusBase: "Easy base mileage + strides",
  },
  swim: {
    ifBase: 0.75, ifBuild: 0.9, ifPeak: 0.98, ifTaper: 0.65, ifRecover: 0.6,
    gain: 0.05, rampCap: 0.15, maxPeak: 14,   // least certain (swim load not normalized)
    focusBase: "Technique + base volume",
  },
};

// Strength periodizes opposite to the aerobic peak.
const STRENGTH_BY_PHASE: Record<PhaseName, StrengthWeek> = {
  Base:    { sessions: 3, intent: "accumulation",     notes: "Heavy-low reps (strength base)" },
  Build:   { sessions: 2, intent: "intensification",  notes: "Heavy + some ballistic" },
  Peak:    { sessions: 1, intent: "realization",      notes: "Maintain top strength, low volume" },
  Race:    { sessions: 1, intent: "realization",      notes: "Low-volume explosive" },
  Recover: { sessions: 1, intent: "deload",           notes: "Unload / mobility" },
  Taper:   { sessions: 0, intent: "none",             notes: "Drop strength, full recovery" },
};

const BLOCK_WORK = 4;       // work weeks per block then a recover transition
const TAPER_WEEKS = 2;

export function buildPlan(
  events: RaceEvent[], ftp: number, startHours: number,
  focus: Focus, maxWorkHours: number, sport: Sport,
): Plan {
  const spec = SPORT[sport];
  const sorted = [...events].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const finalIdx = sorted.length - 1;
  const consumed = sorted.map((e, i) => (i === finalIdx ? { ...e, priority: "A" as Priority } : e));
  const aEvent = consumed[finalIdx];

  const totalWeeks = Math.max(4, Math.round(weeksBetween(aEvent.dateISO)));
  const peakW = Math.max(1, Math.round(totalWeeks * 0.12));
  const taperW = TAPER_WEEKS;
  const front = totalWeeks - peakW - taperW;           // block region
  const maxPeak = Math.min(Math.max(maxWorkHours, startHours), spec.maxPeak);

  // Precompute the week index for each B/C event (clamped into the block region),
  // so an earlier event can get a Race week + Recover transition.
  const eventAt = new Map<number, string>();
  for (const ev of consumed.slice(0, finalIdx)) {
    const ew = clamp(Math.round(weeksBetween(ev.dateISO)), 1, front);
    eventAt.set(ew, ev.name);
  }

  // --- plan phases + macroblocks over the front region ---
  const phases = new Array<PhaseName>(totalWeeks + 1); // 1-indexed
  const blockNo = new Array<number>(totalWeeks + 1).fill(0);
  const blocks: MacroBlock[] = [];
  let cursor = 1, bIdx = 1;
  while (cursor <= front) {
    const remaining = front - cursor + 1;
    const workW = Math.min(BLOCK_WORK, remaining);
    const focusN = blockFocus(bIdx, focus);
    blocks.push({ block: bIdx, focus: focusN, weeks: workW, peakHours: 0 });
    for (let i = 0; i < workW; i++) {
      const w = cursor + i;
      phases[w] = "Build";
      blockNo[w] = bIdx;
    }
    cursor += workW;
    // trailing recover week (only if it fits and isn't the last block)
    if (cursor <= front) { phases[cursor] = "Recover"; blockNo[cursor] = 0; cursor++; }
    bIdx++;
  }

  // tail: Peak into A event, then Taper
  for (let w = Math.max(1, front + 1); w <= totalWeeks; w++) {
    phases[w] = (w >= totalWeeks - taperW + 1) ? "Taper" : "Peak";
  }

  // Carve Race + Recover microcycles around B/C events (ascending, so a
  // recover doesn't clobber the next event's week).
  const evWeeks = [...eventAt.keys()].sort((a, b) => a - b);
  for (const ew of evWeeks) {
    if (ew <= front) phases[ew] = "Race";
    if (ew + 1 <= front && !eventAt.has(ew + 1)) phases[ew + 1] = "Recover";
  }

  // --- volume + strength per week ---
  const weeks: WeekPlan[] = [];
  let lastWork = startHours;
  let blockBase = startHours;
  for (let w = 1; w <= totalWeeks; w++) {
    const phase = phases[w];
    let hours: number;
    if (phase === "Taper") {
      hours = lastWork * (w === totalWeeks - 1 ? 0.4 : 0.6);
    } else if (phase === "Recover") {
      hours = blockBase * 0.5;             // deload; reset the next block's base
      blockBase = Math.max(hours, 2);
    } else if (phase === "Peak") {
      hours = lastWork * 0.9;             // ~10% cut; does not feed a giant taper
    } else {
      // Build / Base / Race work week: progressive within block from blockBase
      hours = Math.min(lastWork * (1 + spec.gain), lastWork + startHours * spec.rampCap, maxPeak);
    }
    hours = Math.max(2, hours);
    const eventName = phase === "Taper" ? aEvent.name : eventAt.get(w);
    const rec = buildWeek(w, blockNo[w] || blocks.length, phase, hours, eventName, focusOf(blockNo[w], blocks, focus, spec), sport);
    weeks.push(rec);
    // track block peak
    if (blockNo[w] > 0) blocks[blockNo[w] - 1].peakHours = Math.max(blocks[blockNo[w] - 1].peakHours, hours);
    lastWork = hours;
    if (phase !== "Recover" && phase !== "Taper") blockBase = lastWork;
  }

  return { weeksTotal: totalWeeks, sport, ftp, endHours: Math.round(weeks[totalWeeks - 1]!.hours * 10) / 10, blocks, events: consumed, weeks };
}

function blockFocus(bIdx: number, season: Focus): Focus {
  const seq: Focus[] = ["endurance", "vo2", "threshold", "endurance", "vo2", "threshold"];
  const base = (season === "endurance") ? "endurance" : (season === "vo2" || season === "threshold" || season === "race") ? season : "endurance";
  // cycle through a rotating emphasis anchored on the season's dominant focus
  if (season === "race") return seq[(bIdx - 1) % seq.length] === "race" ? "endurance" : seq[(bIdx - 1) % seq.length];
  return seq[(bIdx - 1 + seq.indexOf(base)) % seq.length];
}

function focusOf(blockNo: number, blocks: MacroBlock[], _season: Focus, spec: SportSpec): string {
  if (blockNo === 0) return "Sharp race-specific efforts";
  const f = blocks[blockNo - 1].focus;
  switch (f) {
    case "endurance": return spec.focusBase;
    case "threshold": return "Threshold intervals (2-3x 12-15min)";
    case "vo2": return "Vo2max intervals (5x 3min)";
    default: return f;
  }
}

function buildWeek(w: number, block: number, phase: PhaseName, hours: number,
  event: string | undefined, focusPhrase: string, sport: Sport): WeekPlan {
  const rh = Math.round(hours * 10) / 10;
  const ifVal = ifFor(phase, sport);
  return {
    week: w, block, phase,
    hours: rh,
    tss: Math.round(rh * 100 * ifVal * ifVal),
    ifVal,
    focus: focusPhrase,
    event,
    strength: STRENGTH_BY_PHASE[phase],
  };
}

function ifFor(phase: PhaseName, sport: Sport): number {
  const s = SPORT[sport];
  switch (phase) {
    case "Base": return s.ifBase;
    case "Build": return s.ifBuild;
    case "Peak": return s.ifPeak;
    case "Taper": return s.ifTaper;
    case "Recover": return s.ifRecover;
    case "Race": return s.ifBuild;
  }
}

export function weeksBetween(goalDateISO: string): number {
  const goal = new Date(goalDateISO + "T00:00:00");
  if (isNaN(goal.getTime())) return 12;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = (goal.getTime() - today.getTime()) / 86400_000;
  if (days < 14) return 4;
  return Math.round(days / 7);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
