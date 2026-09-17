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

const BLOCK_WORK = 4;       // work weeks per cycle (then a recover transition)
const TAPER_WEEKS = 2;
const PEAK_WEEKS = 1;

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
  const maxPeak = Math.min(Math.max(maxWorkHours, startHours), spec.maxPeak);

  // --- true multi-cycle season: partition into cycles, each building on the last ---
  // A B/C event is the final (Race) work week of its cycle; the event's cycle ends
  // with a recover transition unless it is the season's final cycle. Long gaps with
  // no event split into sequential 4-work + 1-recover cycles, so a 51-week horizon
  // is NEVER one monotonic build. The final cycle caps with Peak + Taper at the A event.
  const eventWeeks: { week: number; name: string; isA: boolean }[] = [];
  for (let i = 0; i < finalIdx; i++) {
    const ew = clamp(Math.round(weeksBetween(consumed[i].dateISO)), 1, totalWeeks - TAPER_WEEKS - PEAK_WEEKS);
    eventWeeks.push({ week: ew, name: consumed[i].name, isA: false });
  }
  eventWeeks.push({ week: totalWeeks, name: aEvent.name, isA: true });
  eventWeeks.sort((x, y) => x.week - y.week);

  // Build a cycle partition (per week: cycle index + phase within the cycle).
  interface Cycle { start: number; end: number; target: number }  // end = last work week
  const weekPhase = new Array<PhaseName>(totalWeeks + 1).fill("Build");
  const weekCycle = new Array<number>(totalWeeks + 1).fill(0);
  const cycles: Cycle[] = [];

  let cursor = 1;
  let cIdx = 1;
  // Walk the events (A last). Each B/C event closes a cycle at its week (a Race).
  for (let i = 0; i < eventWeeks.length; i++) {
    const ev = eventWeeks[i];
    const isFinal = ev.isA;
    const regionEnd = isFinal ? totalWeeks - TAPER_WEEKS - PEAK_WEEKS : ev.week;
    // Split [cursor .. regionEnd] into work blocks of BLOCK_WORK (+ recover between, not trailing a region boundary unless a B/C event)
    while (cursor <= regionEnd) {
      const remaining = regionEnd - cursor + 1;
      const workW = Math.min(BLOCK_WORK, remaining);
      const start = cursor, end = cursor + workW - 1;
      for (let w = start; w <= end; w++) { weekCycle[w] = cIdx; weekPhase[w] = "Build"; }
      cycles.push({ start, end, target: 0 }); // target filled below
      cIdx++;
      cursor = end + 1;
      if (cursor <= regionEnd) {
        // not the end of the region: give this cycle a recover transition, unless
        // the next region is the final tail (then Peak handles the unload)
        weekPhase[cursor] = "Recover"; weekCycle[cursor] = 0; cursor++;
      }
    }
    // The B/C event week is the LAST work week of the region -> mark Race (it is `regionEnd` for B/C)
    if (!isFinal && ev.week >= 1 && ev.week <= totalWeeks - TAPER_WEEKS - PEAK_WEEKS) {
      weekPhase[ev.week] = "Race";
      // following recover handled above (cursor advanced past it) or is the recover after this cycle
    }
  }

  // Final tail: Peak then Taper into A event
  const peakStart = totalWeeks - TAPER_WEEKS - PEAK_WEEKS + 1;
  for (let w = peakStart; w <= totalWeeks; w++) {
    weekPhase[w] = w > totalWeeks - TAPER_WEEKS ? "Taper" : "Peak";
    weekCycle[w] = 0;
  }

  // --- per-cycle targets step up toward the season peak (theory: each macrocycle builds on the last) ---
  const workCycles = cycles; // `cycles` holds ONLY work weeks (recover/tail weeks have weekCycle=0 and are not pushed)
  const nWork = Math.max(1, workCycles.length);
  const targetFor = (k: number): number => {
    // cycle k (1-based): starts at ~startHours, rises toward maxPeak as the season progresses
    const margin = Math.min(0.25, (maxPeak - startHours) / Math.max(1, nWork));
    return clamp(startHours * (1 + margin * (k - 1)), startHours, maxPeak);
  };
  for (let i = 0; i < workCycles.length; i++) workCycles[i].target = targetFor(i + 1);

  // --- volume per week ---
  const weeks: WeekPlan[] = [];
  let curOverload = startHours;   // overload anchor: advances on work weeks
  for (let w = 1; w <= totalWeeks; w++) {
    const phase = weekPhase[w];
    const cyc = workCycles[weekCycle[w] - 1];
    let hours: number;
    if (phase === "Taper") {
      hours = curOverload * (w === totalWeeks ? 0.4 : 0.6); // lightest AT the event
    } else if (phase === "Peak") {
      hours = curOverload * 0.9; // ~10% cut from the build peak; doesn't feed a giant taper
    } else if (phase === "Recover") {
      hours = curOverload * 0.5; // deload THIS week; anchor not dragged down
    } else {
      // Build / Base / Race work week: progressive overload within THIS cycle toward its target
      const cap = cyc ? cyc.target : maxPeak;
      hours = Math.min(curOverload * (1 + spec.gain), curOverload + startHours * spec.rampCap, cap);
      curOverload = hours; // work weeks push the anchor forward
    }
    hours = Math.max(2, hours);
    const eventName = phase === "Taper" ? aEvent.name : eventWeeks.find(e => e.week === w && !e.isA)?.name;
    const rec = buildWeek(w, weekCycle[w], phase, hours, eventName, focusOf(weekCycle[w], focus, spec), sport);
    weeks.push(rec);
    if (weekCycle[w] > 0 && workCycles[weekCycle[w] - 1]) {
      workCycles[weekCycle[w] - 1].target = Math.max(workCycles[weekCycle[w] - 1].target, hours);
    }
  }

  const endHours = Math.round(weeks[totalWeeks - 1]!.hours * 10) / 10;
  const blocks: MacroBlock[] = workCycles.map((c, i) => ({
    block: i + 1, focus: blockFocus(i + 1, focus), weeks: c.end - c.start + 1, peakHours: c.target,
  }));
  return { weeksTotal: totalWeeks, sport, ftp, endHours, blocks, events: consumed, weeks };
}

function blockFocus(bIdx: number, season: Focus): Focus {
  const seq: Focus[] = ["endurance", "vo2", "threshold", "endurance", "vo2", "threshold"];
  const base = (season === "endurance") ? "endurance" : (season === "vo2" || season === "threshold" || season === "race") ? season : "endurance";
  // cycle through a rotating emphasis anchored on the season's dominant focus
  if (season === "race") return seq[(bIdx - 1) % seq.length] === "race" ? "endurance" : seq[(bIdx - 1) % seq.length];
  return seq[(bIdx - 1 + seq.indexOf(base)) % seq.length];
}

function focusOf(cycleNo: number, season: Focus, spec: SportSpec): string {
  if (cycleNo === 0) return "Sharp race-specific efforts";
  const f = blockFocus(cycleNo, season);
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
