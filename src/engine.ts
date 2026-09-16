// periodization engine (multi-event season)
// Load model (TrainingPeaks-style): weeklyTSS = hours * 100 * IF^2
// Season model:
//   - Weeks are chronological from today (week 1 = next week) through the A-priority final event.
//   - BASE block first (≈40%), then a BUILD region, then PEAK (≈15%) and a 2-week TAPER into the A event.
//   - B/C priority events embedded in the BUILD region get a RACE week + RECOVER (deload) week,
//     then training resumes toward the next event.
// Volume ramps globally ~+8%/week (capped +25%/week) around a base ramp; phase multipliers shape the week.

export type PhaseName = "Base" | "Build" | "Peak" | "Taper" | "Race" | "Recover";
export type Focus = "endurance" | "vo2" | "threshold" | "race";
export type Priority = "A" | "B" | "C";

export interface RaceEvent {
  dateISO: string;
  name: string;
  priority: Priority;
}

export interface WeekPlan {
  week: number;            // chronological, 1 = furthest from final event
  phase: PhaseName;
  hours: number;
  tss: number;
  ifVal: number;
  focus: string;
  event?: string;          // event name on a Race / final-Taper week
}

export interface Plan {
  weeksTotal: number;
  ftp: number;
  endHours: number;        // volume in the final (taper) week
  events: RaceEvent[];      // as consumed (sorted; final promoted to A)
  weeks: WeekPlan[];
}

const IF: Record<PhaseName, number> = {
  Base: 0.72, Build: 0.88, Peak: 0.95, Taper: 0.55, Race: 0.95, Recover: 0.5,
};
// volume multiplier vs the underlying ramp
const VM: Record<PhaseName, number> = {
  Base: 1.0, Build: 1.0, Peak: 0.9, Race: 0.9, Recover: 0.5, Taper: 0.5,
};
const GAIN_PER_WEEK = 0.08; // +8% volume per week
const RAMP_CAP = 0.25;      // never exceed +25% volume vs previous week

export function buildPlan(events: RaceEvent[], ftp: number, startHours: number, focus: Focus): Plan {
  const sorted = [...events].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const finalIdx = sorted.length - 1;
  const consumed = sorted.map((e, i) => (i === finalIdx ? { ...e, priority: "A" as Priority } : e));

  const totalWeeks = Math.max(4, Math.round(weeksBetween(consumed[finalIdx].dateISO)));
  const baseW = Math.max(2, Math.round(totalWeeks * 0.4));
  const peakW = Math.max(1, Math.round(totalWeeks * 0.15));
  const taperW = 2;
  const taperStart = totalWeeks - taperW + 1;   // first Taper week
  const peakStart = totalWeeks - taperW - peakW + 1; // first Peak week
  const buildStart = baseW + 1;
  const buildEnd = peakStart - 1;
  const hasBuildRegion = buildStart <= buildEnd;

  // Pin B/C events into the Build region as Race/Recover microcycles
  const microcycles = new Map<string, { race: number; recover: number }>();
  if (hasBuildRegion) {
    for (const ev of consumed.slice(0, finalIdx)) {
      const ew = weeksBetween(ev.dateISO);
      const race = clamp(ew, buildStart, buildEnd);
      const recover = (race < buildEnd) ? race + 1 : -1;
      microcycles.set(ev.name, { race, recover });
    }
  }

  const weeks: WeekPlan[] = [];
  let rampBase = startHours;
  let lastWork = startHours;   // hours of the most recent full work week (post-deload re-entry baseline)
  for (let w = 1; w <= totalWeeks; w++) {
    const { phase, event } = phaseFor(w);
    let hours: number;
    if (phase === "Taper") {
      hours = Math.max(2, rampBase * (0.55 - (w - taperStart) * 0.15)); // 0.55 then 0.40
    } else if (isDeload(phase)) {
      hours = rampBase * VM[phase];           // Recover: 0.5x, does not advance lastWork
    } else {
      // work / race week: progress from the last full work volume, capped to +25%
      hours = Math.min(lastWork * (1 + GAIN_PER_WEEK), lastWork + startHours * RAMP_CAP);
      lastWork = hours;
    }
    weeks.push(mk(w, phase, hours, event, focus));
    rampBase = nextHours(rampBase);
  }

  return {
    weeksTotal: totalWeeks,
    ftp,
    endHours: Math.round((weeks[totalWeeks - 1]?.hours ?? startHours) * 10) / 10,
    events: consumed,
    weeks,
  };

  function phaseFor(w: number): { phase: PhaseName; event?: string } {
    if (w >= taperStart) return { phase: "Taper", event: consumed[finalIdx].name };
    if (w >= peakStart) return { phase: "Peak", event: consumed[finalIdx].name };
    for (const [name, mc] of microcycles) {
      if (w === mc.race) return { phase: "Race", event: name };
      if (w === mc.recover) return { phase: "Recover" };
    }
    if (w <= baseW) return { phase: "Base" };
    return { phase: "Build" };
  }

  function nextHours(v: number): number {
    return Math.min(v * (1 + GAIN_PER_WEEK), v + startHours * RAMP_CAP);
  }
  function mk(week: number, phase: PhaseName, hours: number, event: string | undefined, f: Focus): WeekPlan {
    const rh = Math.round(hours * 10) / 10;
    const base: WeekPlan = {
      week, phase,
      hours: rh,
      tss: Math.round(rh * 100 * IF[phase] * IF[phase]),
      ifVal: IF[phase],
      focus: phaseFocus(phase, f),
    };
    if (event) base.event = event;
    return base;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function isDeload(ph: PhaseName): boolean {
  return ph === "Recover" || ph === "Taper";
}

function phaseFocus(phase: PhaseName, f: Focus): string {
  switch (phase) {
    case "Base": return baseDesc(f);
    case "Build": return buildDesc(f);
    case "Peak": return peakDesc(f);
    case "Race": return `Race/${(f === "race") ? "readiness" : intensityWord(f)} effort`;
    case "Recover": return "Active recovery / easy spin";
    case "Taper": return "Low-intensity sharpen + rest";
  }
}
function intensityWord(f: Focus): string {
  return f === "endurance" ? "tempo" : f === "vo2" ? "vo2" : "threshold";
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
