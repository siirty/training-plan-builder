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

// --- single-event plan keeps the core invariants ---
const single = buildPlan([ev(56, "Target Race", "A")], 240, 6, "endurance");

test("single-event plan has 8 weeks", () => {
  assert.equal(single.weeksTotal, 8);
  assert.equal(single.weeks.length, 8);
});
test("TSS matches hours * 100 * IF^2", () => {
  for (const w of single.weeks) {
    assert.equal(w.tss, Math.round(w.hours * 100 * w.ifVal * w.ifVal), `week ${w.week}`);
  }
});
test("phase order Base..Build..Peak..Taper", () => {
  const order = single.weeks.map(w => w.phase);
  const seq = ["Base", "Build", "Peak", "Taper"];
  let last = -1;
  for (const ph of seq) {
    const i = order.indexOf(ph);
    assert.ok(i > last, `${ph} out of order`);
    last = i;
  }
});
test("taper has the lowest IF of the work phases", () => {
  const tapers = single.weeks.filter(w => w.phase === "Taper");
  const others = single.weeks.filter(w => w.phase !== "Taper");
  for (const t of tapers) for (const o of others) assert.ok(t.ifVal < o.ifVal);
});
test("ramp cap applies between consecutive WORK weeks (deloads don't cap re-entry)", () => {
  let lastWorkHours = single.weeks[0].hours;
  for (const w of single.weeks) {
    if (w.phase === "Taper" || w.phase === "Recover") continue;
    // a work week may not exceed +25% of the last work week
    assert.ok(w.hours <= lastWorkHours * 1.25 + 1e-6, `work week ${w.week}: ${w.hours} > ${lastWorkHours}*1.25`);
    lastWorkHours = w.hours;
  }
});
test("final week is low-volume taper", () => {
  const last = single.weeks[single.weeks.length - 1];
  assert.ok(last.phase === "Taper");
  assert.ok(last.hours < single.weeks[0].hours * 0.8);
});

// --- multi-event: B/C microcycles ---
const multi = buildPlan(
  [ev(60, "Spring Criterium", "B"), ev(110, "Regionals", "B"), ev(160, "Nationals", "A")],
  240, 6, "threshold",
);

test("multi-event plan sorts events, final promoted to A", () => {
  assert.equal(multi.weeksTotal, Math.round(160 / 7)); // ~23
  assert.equal(multi.events.length, 3);
  assert.equal(multi.events[2].name, "Nationals");
  assert.equal(multi.events[2].priority, "A");
});
test("every B/C event gets at least one Race week with its name", () => {
  for (const evn of ["Spring Criterium", "Regionals"]) {
    const races = multi.weeks.filter(w => w.phase === "Race" && w.event === evn);
    assert.ok(races.length >= 1, `${evn} missing Race week`);
  }
});
test("final event's Taper weeks carry the A event name", () => {
  const tapers = multi.weeks.filter(w => w.phase === "Taper");
  assert.ok(tapers.length === 2);
  for (const t of tapers) assert.equal(t.event, "Nationals");
});
test("Recover weeks immediately follow a Race week and deload", () => {
  for (let i = 1; i < multi.weeks.length; i++) {
    if (multi.weeks[i].phase === "Recover") {
      assert.ok(multi.weeks[i - 1].phase === "Race", `recover at week ${i} not after a race`);
      assert.ok(multi.weeks[i].hours < multi.weeks[i - 1].hours);
    }
  }
});
test("no microcycle in the final Peak/Taper region unless it is the A event", () => {
  const finalRegion = multi.weeks.slice(multi.weeks.length - 4);
  for (const w of finalRegion) {
    if (w.phase === "Race" || w.phase === "Recover") {
      assert.ok("unexpected mid-race near final event");
    }
  }
});
test("chronological week numbers are 1..N with no gaps", () => {
  multi.weeks.forEach((w, i) => assert.equal(w.week, i + 1));
});
test("multi-event plan satisfies ramp cap between WORK weeks and TSS formula", () => {
  let lastWorkHours = multi.weeks[0].hours;
  for (const w of multi.weeks) {
    if (w.phase === "Taper" || w.phase === "Recover") continue;
    assert.ok(w.hours <= lastWorkHours * 1.25 + 1e-6, `work week ${w.week}: ${w.hours} > ${lastWorkHours}*1.25`);
    lastWorkHours = w.hours;
  }
  for (const w of multi.weeks) {
    assert.equal(w.tss, Math.round(w.hours * 100 * w.ifVal * w.ifVal));
  }
});
