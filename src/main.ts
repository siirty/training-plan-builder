import { buildPlan, weeksBetween, type Plan, type WeekPlan } from "./engine";
import "./style.css";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const goalDate = $("#goal-date") as HTMLInputElement;
const ftp = $("#ftp") as HTMLInputElement;
const hours = $("#hours") as HTMLInputElement;
const focus = $("#focus") as HTMLSelectElement;

// sensible default: 8 weeks out, tomorrow
(function init() {
  const d = new Date(Date.now() + 8 * 7 * 86400_000);
  goalDate.value = d.toISOString().slice(0, 10);
})();

$("#go").addEventListener("click", () => {
  const plan = buildPlan(goalDate.value, Number(ftp.value), Number(hours.value), focus.value as any);
  render(plan);
});

function render(p: Plan) {
  $("#summary").hidden = false;
  $("#chart").hidden = false;
  $("#grid").hidden = false;

  $("#summaryBody").innerHTML = [
    `Duration <b>${p.weeksTotal} weeks</b>`,
    `FTP <b>${p.ftp} W</b>`,
    `Start volume <b>${p.weeks[0].hours}h / wk</b>`,
    `Taper finish <b>${p.endHours}h / wk</b>`,
    `Max load <b>${Math.max(...p.weeks.map(w => w.tss))} TSS</b> / wk`,
  ].join('<div class="row"></div>');

  // chart
  const maxTss = Math.max(...p.weeks.map(w => w.tss), 1);
  const chart = $("#chartBody");
  chart.innerHTML = "";
  p.weeks.forEach(w => {
    const el = document.createElement("div");
    el.className = "bar";
    el.style.height = `${Math.round((w.tss / maxTss) * 100)}%`;
    el.title = `W${w.week} ${w.phase} · ${w.tss} TSS`;
    chart.appendChild(el);
  });

  // table
  const thead = $("#planTable thead tr");
  thead.innerHTML = ["Week", "Phase", "Hours", "IF", "TSS", "Focus"].map(h => `<th>${h}</th>`).join("");
  const tbody = $("#planTable tbody");
  tbody.innerHTML = p.weeks.map(w => `
    <tr class="${w.phase.toLowerCase()}">
      <td>${w.week}</td><td>${w.phase}</td><td>${w.hours}</td>
      <td>${w.ifVal.toFixed(2)}</td><td>${w.tss}</td><td>${w.focus}</td>
    </tr>`).join("");

  // CSV
  $("#csv").onclick = () => {
    const rows = ["week,phase,hours,if,tss,focus",
      ...p.weeks.map(w => `${w.week},${w.phase},${w.hours},${w.ifVal.toFixed(2)},${w.tss},"${w.focus}"`)];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "periodization-plan.csv";
    a.click();
  };
}
