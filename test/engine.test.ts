import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, weeksBetween, type RaceEvent } from "../src/engine.ts";

function ev(daysFromNow: number, name: string, priority: "A" | "B" | "C" = "B"): RaceEvent {
  return { dateISO: futureDate(daysFromNow), name, priority };
}
function futureDate(days: number): string {
  return new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
}

// --- weeksBetween ---
test("weeksBetween clamps very-close goals to 4 weeks", () => {
  assert.equal(weeksBetween(futureDate(5)), 4);
});
test("weeksBetween handles ~8 weeks out", () => {
  assert.equal(weeksBetween(futureDate(56)), 8);
});

// --- single-event cycle plan ---
const p = buildPlan([ev(56, "Target Race", "A")], 240, 6, "endurance", 20, "cycle");

test("cycle plan week count matches horizon", () => {
  assert.equal(p.weeksTotal, 8);
  assert.equal(p.weeks.length, 8);
});
test("TSS = hours * 100 * IF^2", () => {
  for (const w of p.weeks) {
    assert.equal(w.tss, Math.round(w.hours * 100 * w.ifVal * w.ifVal), `week ${w.week}`);
  }
});
test("phase order is monotonic through Build..Peak..Taper", () => {
  const seq = p.weeks.map(w => w.phase);
  const buildAt = seq.indexOf("Build");
  const peakAt = seq.indexOf("Peak");
  const taperAt = seq.indexOf("Taper");
  assert.ok(buildAt < peakAt && peakAt < taperAt, `got ${seq.join(",")}`);
});
test("recover weeks deload (< 0.6x of last work week)", () => {
  for (let i = 1; i < p.weeks.length; i++) {
    if (p.weeks[i].phase === "Recover") {
      assert.ok(p.weeks[i].hours < p.weeks[i - 1].hours * 0.6, `recover ${i}`); // 0.5x intended
    }
  }
});
test("ramp cap bounded vs start (no runaway compounding)", () => {
  const start = p.weeks[0].hours;
  let lastWork = start;
  for (const w of p.weeks) {
    if (w.phase === "Recover" || w.phase === "Taper") continue;
    assert.ok(w.hours <= lastWork + start * 0.25 + 1e-6, `work week ${w.week}`);
    lastWork = w.hours;
  }
});
test("final taper week ends low vs start", () => {
  const last = p.weeks[p.weeks.length - 1];
  assert.equal(last.phase, "Taper");
  assert.ok(last.hours <= p.weeks[0].hours, `taper ${last.hours}h not below start ${p.weeks[0].hours}h`);
});
test("strength: taper drops strength, peak is light, base is heavy", () => {
  const taper = p.weeks.filter(w => w.phase === "Taper");
  const peak = p.weeks.filter(w => w.phase === "Peak");
  const base = p.weeks.filter(w => w.phase === "Build" || w.phase === "Base");
  assert.ok(taper.every(w => w.strength.sessions === 0), "taper should drop strength");
  assert.ok(peak.every(w => w.strength.sessions <= 1), "peak strength minimal");
  assert.ok(base.some(w => w.strength.sessions >= 2), "base should carry strength");
});

// --- long season: multi-block ---
const longP = buildPlan([ev(180, "Long Season", "A")], 250, 8, "threshold", 15, "cycle");

test("long season splits into multiple blocks with recover transitions", () => {
  assert.ok(longP.blocks.length >= 3, `expected >=3 blocks, got ${longP.blocks.length}`);
  // count Recover weeks >= 2
  const recovers = longP.weeks.filter(w => w.phase === "Recover").length;
  assert.ok(recovers >= 2, `expected >=2 recover weeks, got ${recovers}`);
});
test("long season peak is bounded (no 40h/week)", () => {
  const peak = Math.max(...longP.weeks.map(w => w.hours));
  assert.ok(peak <= 15.1, `peak ${peak}h exceeds 15h cap`);
});
test("blocks rotate focus (not all identical)", () => {
  const focuses = longP.blocks.map(b => b.focus);
  assert.ok(new Set(focuses).size > 1, `focuses did not rotate: ${focuses}`);
});
test("every work week carries strength guidance", () => {
  for (const w of longP.weeks) {
    assert.ok(w.strength && typeof w.strength.sessions === "number", `week ${w.week} missing strength`);
  }
});

// --- sport differences ---
test("sport load differs (run caps stricter than cycle)", () => {
  const c = buildPlan([ev(160, "E", "A")], 250, 8, "endurance", 20, "cycle");
  const r = buildPlan([ev(160, "E", "A")], 250, 8, "endurance", 20, "run");
  const cPeak = Math.max(...c.weeks.map(w => w.hours));
  const rPeak = Math.max(...r.weeks.map(w => w.hours));
  assert.ok(rPeak <= cPeak + 1e-6, `run peak ${rPeak} should be <= cycle peak ${cPeak}`);
});

// --- B/C event microcycles in a multi-event season ---
const multi = buildPlan(
  [ev(60, "Criterium", "B"), ev(110, "Regionals", "B"), ev(160, "Nationals", "A")],
  240, 6, "threshold", 15, "cycle",
);
test("each B/C event gets a Race week with its name", () => {
  for (const name of ["Criterium", "Regionals"]) {
    assert.ok(multi.weeks.some(w => w.phase === "Race" && w.event === name), `${name} missing Race`);
  }
});
test("final event tapers are labeled with A event", () => {
  for (const w of multi.weeks) {
    if (w.phase === "Taper") assert.equal(w.event, "Nationals");
  }
});
test("events sorted, final promoted to A", () => {
  assert.equal(multi.events[multi.events.length - 1].name, "Nationals");
  assert.equal(multi.events[multi.events.length - 1].priority, "A");
});
test("chronological week numbers 1..N", () => {
  multi.weeks.forEach((w, i) => assert.equal(w.week, i + 1));
});
