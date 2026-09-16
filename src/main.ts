import { buildPlan, type Plan, type RaceEvent, type Priority, type Sport } from "./engine";
import "./style.css";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

// --- theme: system default on first visit, manual toggle persisted ---
const themeToggle = $("#themeToggle") as HTMLButtonElement;
function currentTheme(): "dark" | "light" {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function applyTheme(t: "dark" | "light") {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("tp-theme", t); } catch (e) { /* private mode */ }
}
themeToggle.addEventListener("click", () => applyTheme(currentTheme() === "dark" ? "light" : "dark"));

// --- inputs ---
const ftp = $("#ftp") as HTMLInputElement;
const hours = $("#hours") as HTMLInputElement;
const maxHours = $("#maxhours") as HTMLInputElement;
const sport = $("#sport") as HTMLSelectElement;
const focus = $("#focus") as HTMLSelectElement;
const eventList = $("#event-list") as HTMLDivElement;
const addEventBtn = $("#add-event") as HTMLButtonElement;

interface EventRow {
  row: HTMLDivElement;
  date: HTMLInputElement;
  name: HTMLInputElement;
  prio: HTMLSelectElement;
}

const rows: EventRow[] = [];

// one default event, 12 weeks out
(function init() {
  const d = new Date(Date.now() + 12 * 7 * 86400_000);
  addEventRow(d.toISOString().slice(0, 10), "Key event", "A");
})();

addEventBtn.addEventListener("click", () => {
  const d = new Date(Date.now() + 12 * 7 * 86400_000);
  addEventRow(d.toISOString().slice(0, 10), "Race", "B");
  scheduleRecompute();
});

function addEventRow(date: string, name: string, prio: Priority) {
  const row = document.createElement("div");
  row.className = "evrow";
  row.innerHTML = `
    <input type="date" class="ev-date" value="${date}" />
    <input type="text" class="ev-name" placeholder="Race name" value="${name}" />
    <select class="ev-prio">
      <option value="A">A (key)</option>
      <option value="B">B (secondary)</option>
      <option value="C">C (fitness)</option>
    </select>
    <button type="button" class="ev-del" title="Remove">&times;</button>`;
  const r: EventRow = {
    row,
    date: row.querySelector(".ev-date") as HTMLInputElement,
    name: row.querySelector(".ev-name") as HTMLInputElement,
    prio: row.querySelector(".ev-prio") as HTMLSelectElement,
  };
  r.prio.value = prio;
  (row.querySelector(".ev-del") as HTMLButtonElement).addEventListener("click", () => {
    const i = rows.indexOf(r);
    if (i >= 0) rows.splice(i, 1);
    row.remove();
    scheduleRecompute();
  });
  rows.push(r);
  eventList.appendChild(row);
  // live recompute on any event-row edit
  r.date.addEventListener("input", scheduleRecompute);
  r.name.addEventListener("input", scheduleRecompute);
  r.prio.addEventListener("change", scheduleRecompute);
}

// --- live recompute: debounce rapid edits ---
let timer: number | undefined;
function scheduleRecompute() {
  if (timer) clearTimeout(timer);
  timer = window.setTimeout(recompute, 120);
}

function recompute() {
  const events: RaceEvent[] = rows
    .map(r => ({ dateISO: r.date.value, name: r.name.value.trim() || "Race", priority: r.prio.value as Priority }))
    .filter(r => r.dateISO);
  if (events.length === 0) { $("body").classList.add("no-plan"); return; }
  $("body").classList.remove("no-plan");
  const plan = buildPlan(events, Number(ftp.value), Number(hours.value), focus.value as any, Number(maxHours.value), sport.value as Sport);
  render(plan);
}

[ftp, hours, maxHours].forEach(el => el.addEventListener("input", scheduleRecompute));
[sport, focus].forEach(el => el.addEventListener("change", scheduleRecompute));

// first paint (and whenever an event row is edited/added)
recompute();

function render(p: Plan) {
  $("body").classList.remove("no-plan");
  $("#summary").hidden = false;
  $("#chart").hidden = false;
  $("#grid").hidden = false;

  const phases = Array.from(new Set(p.weeks.map(w => w.phase)));
  $("#phaseLegend").innerHTML = phases
    .map(ph => `<span class="lg ${ph.toLowerCase()}"><i></i>${ph}</span>`).join("");

  $("#summaryBody").innerHTML = [
    `Duration <b>${p.weeksTotal} weeks</b>`,
    `FTP <b>${p.ftp} W</b>`,
    `Start volume <b>${p.weeks[0].hours}h / wk</b>`,
    `Taper finish <b>${p.endHours}h / wk</b>`,
    `Max load <b>${Math.max(...p.weeks.map(w => w.tss))} TSS</b> / wk`,
    `Events <b>${p.events.length}</b>`,
  ].join('<div class="row"></div>');

  // chart: bar-chart shape (timeline hero ships in a later slice)
  const maxTss = Math.max(...p.weeks.map(w => w.tss), 1);
  const chart = $("#chartBody");
  chart.innerHTML = "";
  p.weeks.forEach(w => {
    const el = document.createElement("div");
    el.className = `bar bar-${w.phase.toLowerCase()}`;
    el.style.height = `${Math.round((w.tss / maxTss) * 100)}%`;
    el.title = `W${w.week} ${w.phase} · ${w.tss} TSS`;
    chart.appendChild(el);
  });

  // table
  const thead = $("#planTable thead tr");
  thead.innerHTML = ["Week", "Phase", "Hrs", "IF", "TSS", "Event", "Focus", "Str", "Strength"].map(h => `<th>${h}</th>`).join("");
  const tbody = $("#planTable tbody");
  tbody.innerHTML = p.weeks.map(w => `
    <tr class="${w.phase.toLowerCase()}">
      <td>${w.week}</td><td>${w.phase}</td><td>${w.hours}</td>
      <td>${w.ifVal.toFixed(2)}</td><td>${w.tss}</td><td>${w.event ?? "&mdash;"}</td><td>${w.focus}</td>
      <td>${w.strength.sessions}</td><td>${w.strength.notes}</td>
    </tr>`).join("");

  $("#csv").onclick = () => {
    const csv = ["week,block,phase,hours,if,tss,event,focus,strength_sessions,strength_notes",
      ...p.weeks.map(w => `${w.week},${w.block},${w.phase},${w.hours},${w.ifVal.toFixed(2)},${w.tss},"${w.event ?? ""}","${w.focus}",${w.strength.sessions},"${w.strength.notes}"`)];
    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "training-plan.csv";
    a.click();
  };
}
