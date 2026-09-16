// periodization engine
// TSS simplification used across the tool (TrainingPeaks-style):
//   TSS(1h at IF) = 100 * IF^2   ->   weeklyTSS = weeklyHours * 100 * IF^2
// Phases: BASE -> BUILD -> PEAK -> TAPER, anchored to the goal date.

export type PhaseName = "Base" | "Build" | "Peak" | "Taper";
export type Focus = "endurance" | "vo2" | "threshold" | "race";

export interface WeekPlan {
  week: number;            // 1-based, counting back from the event as week N = last
  phase: PhaseName;
  hours: number;           // target volume this week
  tss: number;             // load estimate (round to int)
  ifVal: number;           // intensity factor
  focus: string;           // short descriptor of the week's emphasis
}

export interface Plan {
  weeksTotal: number;
  goalDate: string;
  ftp: number;
  endHours: number;          // volume in the final (taper) week
  weeks: WeekPlan[];
}

const IF: Record<PhaseName, number> = { Base: 0.72, Build: 0.88, Peak: 0.95, Taper: 0.55 };
const GAIN_PER_WEEK = 0.08; // +8% volume per build week
const RAMP_CAP = 0.25;      // never exceed +25% volume vs the previous week

export function buildPlan(goalDateISO: string, ftp: number, startHours: number, focus: Focus): Plan {
  const weeksTotal = Math.max(4, Math.round(weeksBetween(goalDateISO)));
  const baseW  = Math.max(2, Math.round(weeksTotal * 0.4));
  const buildW = Math.max(2, Math.round(weeksTotal * 0.35));
  const peakW  = Math.max(1, Math.round(weeksTotal * 0.15));
  const taperW = 2; // fixed 2-week taper

  // Allocate weeks chronologically (week 1 = furthest from race)
  const weeks: WeekPlan[] = [];
  let h = startHours;

  // BASE
  for (let i = 0; i < baseW; i++) {
    weeks.push(mk(i + 1, "Base", h, baseDesc(focus)));
    h = nextHours(h);
  }
  // BUILD
  for (let i = 0; i < buildW; i++) {
    weeks.push(mk(i + 1 + baseW, "Build", h, buildDesc(focus)));
    h = nextHours(h);
  }
  // PEAK
  for (let i = 0; i < peakW; i++) {
    weeks.push(mk(i + 1 + baseW + buildW, "Peak", h * 0.9, peakDesc(focus)));
    h = nextHours(h * 0.9);
  }
  // TAPER
  for (let i = 0; i < taperW; i++) {
    weeks.push(mk(i + 1 + baseW + buildW + peakW, "Taper", taperHours(startHours, i), "Low-intensity sharpen + rest"));
    h = nextHours(h);
  }

  return {
    weeksTotal,
    goalDate: goalDateISO,
    ftp,
    endHours: Math.round((weeks[weeks.length - 1]?.hours ?? startHours) * 10) / 10,
    weeks,
  };

  function nextHours(v: number): number {
    return Math.min(v * (1 + GAIN_PER_WEEK), v + startHours * RAMP_CAP);
  }
  function taperHours(base: number, i: number): number {
    return Math.max(2, Math.round((base * (1 - 0.35 - i * 0.2)) * 10) / 10);
  }
  function mk(week: number, phase: PhaseName, hours: number, focusDesc: string): WeekPlan {
    const rh = Math.round(hours * 10) / 10;
    return {
      week, phase,
      hours: rh,
      tss: Math.round(rh * 100 * IF[phase] * IF[phase]),
      ifVal: IF[phase],
      focus: focusDesc,
    };
  }
}

function baseDesc(f: Focus): string {
  switch (f) {
    case "endurance": return "Long steady endurance (Z2)";
    case "vo2": return "Foundation volume + short efforts";
    case "threshold": return "Foundation volume + form drills";
    case "race": return "Foundation volume at event-specific pace";
  }
}
function buildDesc(f: Focus): string {
  switch (f) {
    case "endurance": return "Progressively longer endurance";
    case "vo2": return "Vo2max intervals (5-6x 3-5min)";
    case "threshold": return "Threshold intervals (2-3x 15-20min)";
    case "race": return "Build to race intensity";
  }
}
function peakDesc(f: Focus): string {
  switch (f) {
    case "endurance": return "Peak endurance volume";
    case "vo2": return "Sharp Vo2max + sprint work";
    case "threshold": return "Sharp threshold reps";
    case "race": return "Race rehearsals";
  }
}

export function weeksBetween(goalDateISO: string): number {
  const goal = new Date(goalDateISO + "T00:00:00");
  if (isNaN(goal.getTime())) return 12;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = goal.getTime() - today.getTime();
  const days = diffMs / (1000 * 60 * 60 * 24);
  if (days < 21) return 4;      // too close: minimum 4-week build
  return Math.round(days / 7);
}
