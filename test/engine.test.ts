import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlan, weeksBetween } from "../src/engine.ts";

// --- weeksBetween / phase math ---
test("weeksBetween clamps very-close goals to 4 weeks", () => {
  const soon = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
  assert.equal(weeksBetween(soon), 4);
});
test("weeksBetween handles ~8 weeks out", () => {
  const d = new Date(Date.now() + 8 * 7 * 86400_000).toISOString().slice(0, 10);
  assert.equal(weeksBetween(d), 8);
});

// --- core invariants on a realistic 16-week endurance plan ---
const plan = buildPlan(futureDate(16), 240, 6, "endurance");

test("plan has the expected week count", () => {
  assert.equal(plan.weeksTotal, 16);
  assert.equal(plan.weeks.length, 16);
});

test("TSS matches hours * 100 * IF^2 (deterministic)", () => {
  for (const w of plan.weeks) {
    const expected = Math.round(w.hours * 100 * w.ifVal * w.ifVal);
    assert.equal(w.tss, expected, `week ${w.week}`);
  }
});

test("phase order is Base..Build..Peak..Taper (chronological)", () => {
  const order = plan.weeks.map(w => w.phase);
  const firstBase = order.indexOf("Base");
  const firstBuild = order.indexOf("Build");
  const firstPeak = order.indexOf("Peak");
  const firstTaper = order.indexOf("Taper");
  assert.ok(firstBase < firstBuild && firstBuild < firstPeak && firstPeak < firstTaper);
});

test("taper is the lowest-load phase (IF < other work phases)", () => {
  const tapers = plan.weeks.filter(w => w.phase === "Taper");
  const others = plan.weeks.filter(w => w.phase !== "Taper");
  for (const t of tapers) for (const o of others) assert.ok(t.ifVal < o.ifVal);
});

test("volume does not exceed +25% ramp cap between consecutive weeks", () => {
  for (let i = 1; i < plan.weeks.length; i++) {
    const prev = plan.weeks[i - 1].hours;
    const cur = plan.weeks[i].hours;
    assert.ok(cur <= prev * 1.25 + 1e-6, `week ${i}: ${prev} -> ${cur} exceeds ramp cap`);
  }
});

test("endHours is the (modest) taper finish volume", () => {
  assert.ok(plan.endHours <= plan.weeks[0].hours * 0.75, "taper should cut volume below start");
});

// --- cross-focus sanity: vo2 plan should be peak-loaded ~= similar to endurance ---
test("vo2 and endurance plans produce same shape (deterministic engine)", () => {
  const a = buildPlan(futureDate(16), 240, 6, "vo2");
  const b = buildPlan(futureDate(16), 240, 6, "endurance");
  assert.deepEqual(a.weeks.map(w => [w.hours, w.ifVal]), b.weeks.map(w => [w.hours, w.ifVal]));
});

function futureDate(weeks: number): string {
  return new Date(Date.now() + weeks * 7 * 86400_000).toISOString().slice(0, 10);
}
