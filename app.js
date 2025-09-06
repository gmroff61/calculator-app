// ---------- Global state ----------
let baselineRate = null;     // $/kWh (same whether inputs were monthly or annual)
let usageMonthly = null;     // kWh per month (from calculator input)
let usageAnnual  = null;     // kWh per year = usageMonthly * 12
let savingsChart = null;     // Chart.js instance

const YEARS_DEFAULT = 25;

// ---------- Calculator ----------
function calculate() {
  const kwh = parseFloat(document.getElementById("kwh").value);        // monthly kWh
  const dollars = parseFloat(document.getElementById("dollars").value); // monthly $
  const resultDiv = document.getElementById("result");

  if (isNaN(kwh) || isNaN(dollars) || kwh <= 0 || dollars <= 0) {
    resultDiv.textContent = "Please enter positive numbers greater than zero.";
    return;
  }

  // $/kWh is dollars divided by kWh — works with monthly values just fine.
  baselineRate = dollars / kwh;

  // Store monthly and annual usage
  usageMonthly = kwh;
  usageAnnual  = kwh * 12;

  resultDiv.textContent = `$${baselineRate.toFixed(2)} per kWh (baseline)`;
  setTabEnabled("nav-savings", true);
}

function resetCalculator() {
  document.getElementById("kwh").value = "";
  document.getElementById("dollars").value = "";
  document.getElementById("result").textContent = "";
  // keep baseline/usage if you like; or clear them here if you want to force recalc
}

// ---------- Screens ----------
function showScreen(which) {
  const calc = document.getElementById("calc-screen");
  const sav  = document.getElementById("savings-screen");
  const navCalc = document.getElementById("nav-calc");
  const navSav  = document.getElementById("nav-savings");

  if (which === "savings") {
    if (!baselineRate || !usageAnnual || baselineRate <= 0 || usageAnnual <= 0) {
      alert("Please calculate a baseline on the Calculator tab first.");
      return;
    }
    calc.classList.add("hidden");
    sav.classList.remove("hidden");
    navCalc.classList.remove("active");
    navSav.classList.add("active");

    // Initialize display
    document.getElementById("baselineDisplay").textContent = `$${baselineRate.toFixed(2)}`;
    document.getElementById("usageMonthlyDisplay").textContent = usageMonthly.toFixed(2);
    document.getElementById("usageAnnualDisplay").textContent  = usageAnnual.toFixed(2);

    updateSavingsChart(false); // draw if inputs present
  } else {
    sav.classList.add("hidden");
    calc.classList.remove("hidden");
    navSav.classList.remove("active");
    navCalc.classList.add("active");
  }
}

function backToCalc() { showScreen("calc"); }

function setTabEnabled(id, enabled) {
  const el = document.getElementById(id);
  if (!el) return;
  el.disabled = !enabled;
  el.style.opacity = enabled ? "1" : "0.5";
  el.style.cursor = enabled ? "pointer" : "not-allowed";
}
setTabEnabled("nav-savings", false); // disabled until baseline calculated

// ---------- Savings Over Time ----------
function computeSeries(years, growthPctBaseline, growthPctFixed) {
  // Returns arrays: labels, escalatedBaselineRate, escalatedFixedRate, baseCostAnnual, fixedCostAnnual, savingsAnnual, cumulative
  const fixedRateInput = document.getElementById("fixedRate");
  const fixed0 = parseFloat(fixedRateInput.value);

  const labels = [];
  const escalatedBaselineRate = [];
  const escalatedFixedRate = [];
  const baseCost = [];   // annual $
  const fixedCost = [];  // annual $
  const savings = [];    // annual $
  const cumulative = []; // cumulative $

  let cum = 0;
  for (let y = 1; y <= years; y++) {
    const baseRateY  = baselineRate * Math.pow(1 + growthPctBaseline, y - 1);
    const fixedRateY = (isNaN(fixed0) || fixed0 <= 0)
      ? 0
      : fixed0 * Math.pow(1 + growthPctFixed, y - 1);

    const bCost = baseRateY * usageAnnual;  // <-- annual usage
    const fCost = fixedRateY * usageAnnual; // <-- annual usage
    const sav = bCost - fCost;

    labels.push(`Year ${y}`);
    escalatedBaselineRate.push(Number(baseRateY.toFixed(6)));
    escalatedFixedRate.push(Number(fixedRateY.toFixed(6)));
    baseCost.push(Number(bCost.toFixed(2)));
    fixedCost.push(Number(fCost.toFixed(2)));
    savings.push(Number(sav.toFixed(2)));
    cum += sav;
    cumulative.push(Number(cum.toFixed(2)));
  }

  return { labels, escalatedBaselineRate, escalatedFixedRate, baseCost, fixedCost, savings, cumulative, fixed0 };
}

function updateSavingsChart(requireInput = true) {
  const summary = document.getElementById("savingsSummary");
  const fixedRateInput = document.getElementById("fixedRate");
  const growthEl = document.getElementById("growthRate");
  const fixedGrowthEl = document.getElementById("fixedGrowthRate");

  if (!baselineRate || !usageAnnual) {
    summary.textContent = "Please calculate a baseline on the Calculator tab first.";
    destroyChartIfAny();
    clearYearTable();
    return;
  }

  // Parse growth % -> decimals
  const growthPctBaseline = Math.max(0, parseFloat(growthEl.value || "3.5")) / 100;
  const growthPctFixed    = (parseFloat(fixedGrowthEl.value || "0") / 100); // can be negative
  const fixed = parseFloat(fixedRateInput.value);

  if (requireInput && (isNaN(fixed) || fixed <= 0)) {
    summary.textContent = "Enter a positive fixed comparison rate ($/kWh) to draw the graph.";
    destroyChartIfAny();
    clearYearTable();
    return;
  }

  const {
    labels, escalatedBaselineRate, escalatedFixedRate,
    baseCost, fixedCost, savings, cumulative
  } = computeSeries(YEARS_DEFAULT, growthPctBaseline, growthPctFixed);

  // Summary (only if fixed entered)
  if (!isNaN(fixed) && fixed > 0) {
    const total = cumulative[cumulative.length - 1] || 0;
    summary.innerHTML =
      `Cumulative savings over ${YEARS_DEFAULT} years (Baseline growth ` +
      `${(growthPctBaseline * 100).toFixed(1)}%/yr vs Fixed growth ` +
      `${(growthPctFixed * 100).toFixed(1)}%/yr): <strong>$${total.toFixed(2)}</strong>`;
  } else {
    summary.textContent = "Awaiting fixed rate to generate savings graph…";
  }

  // Build datasets from toggles
  const ds = [];
  const showSavings = document.getElementById("showSavings").checked;
  const showBaseline = document.getElementById("showBaseline").checked;
  const showFixed = document.getElementById("showFixed").checked;

  if (showSavings) {
    ds.push({
      label: 'Annual Savings ($/yr)',
      data: savings,
      tension: 0.25,
      borderWidth: 2,
      pointRadius: 2
    });
  }
  if (showBaseline) {
    ds.push({
      label: 'Baseline Cost ($/yr)',
      data: baseCost,
      tension: 0.2,
      borderWidth: 2,
      pointRadius: 0
    });
  }
  if (showFixed) {
    ds.push({
      label: 'Fixed Cost ($/yr)',
      data: fixedCost,
      tension: 0.2,
      borderWidth: 2,
      pointRadius: 0
    });
  }

  drawSavingsChart(labels, ds);
  fillYearTable(labels, escalatedBaselineRate, escalatedFixedRate, baseCost, fixedCost, savings, cumulative);
}

function destroyChartIfAny() {
  if (savingsChart) {
    savingsChart.destroy();
    savingsChart = null;
  }
}

function drawSavingsChart(labels, datasets) {
  const ctx = document.getElementById("savingsChart").getContext("2d");
  destroyChartIfAny();

  savingsChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true } },
      scales: {
        x: { title: { display: true, text: 'Year' } },
        y: { title: { display: true, text: 'Dollars ($/yr)' } }
      }
    }
  });
}

// ---------- Table + CSV ----------
function clearYearTable() {
  const tbody = document.querySelector("#yearTable tbody");
  if (tbody) tbody.innerHTML = "";
}

function fillYearTable(labels, escalatedBaselineRate, escalatedFixedRate, baseCost, fixedCost, savings, cumulative) {
  const tbody = document.querySelector("#yearTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  for (let i = 0; i < labels.length; i++) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>$${escalatedBaselineRate[i].toFixed(4)}</td>
      <td>$${escalatedFixedRate[i].toFixed(4)}</td>
      <td>$${baseCost[i].toFixed(2)}</td>
      <td>$${fixedCost[i].toFixed(2)}</td>
      <td>$${savings[i].toFixed(2)}</td>
      <td>$${cumulative[i].toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function exportCsv() {
  const growthEl = document.getElementById("growthRate");
  const fixedGrowthEl = document.getElementById("fixedGrowthRate");
  const growthPctBaseline = Math.max(0, parseFloat(growthEl.value || "3.5")) / 100;
  const growthPctFixed = (parseFloat(fixedGrowthEl.value || "0") / 100);

  if (!baselineRate || !usageAnnual) {
    alert("Please calculate a baseline first.");
    return;
  }
  const {
    labels, escalatedBaselineRate, escalatedFixedRate,
    baseCost, fixedCost, savings, cumulative
  } = computeSeries(YEARS_DEFAULT, growthPctBaseline, growthPctFixed);

  const rows = [
    ["Year", "Escalated Baseline $/kWh", "Escalated Fixed $/kWh", "Baseline Cost ($/yr)", "Fixed Cost ($/yr)", "Annual Savings ($/yr)", "Cumulative Savings ($)"],
  ];
  for (let i = 0; i < labels.length; i++) {
    rows.push([
      (i + 1).toString(),
      escalatedBaselineRate[i].toFixed(6),
      escalatedFixedRate[i].toFixed(6),
      baseCost[i].toFixed(2),
      fixedCost[i].toFixed(2),
      savings[i].toFixed(2),
      cumulative[i].toFixed(2)
    ]);
  }

  const csv = rows.map(r => r.map(field => `"${field.replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `savings_monthlyInput_annualSavings_${YEARS_DEFAULT}yrs.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- Download chart as PNG ----------
function downloadChartPng() {
  if (!savingsChart) {
    alert("No chart to download. Click Update Graph first.");
    return;
  }
  const link = document.createElement("a");
  link.download = "savings_chart.png";
  link.href = savingsChart.toBase64Image();
  link.click();
}

// ---------- Keyboard: Enter triggers the right action ----------
document.addEventListener("keydown", function (event) {
  if (event.key !== "Enter") return;
  const calcVisible = !document.getElementById("calc-screen").classList.contains("hidden");
  if (calcVisible) {
    calculate();
  } else {
    updateSavingsChart();
  }
});

// ---------- Reactivity ----------
function attachAutoClear(selector, clearFn) {
  document.querySelectorAll(selector).forEach((input) => {
    input.addEventListener("input", clearFn);
  });
}
// Calculator clears
attachAutoClear("#kwh, #dollars", () => {
  document.getElementById("result").textContent = "";
});

// Savings inputs trigger live updates
["fixedRate", "growthRate", "fixedGrowthRate"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", () => updateSavingsChart(false));
});
["showSavings", "showBaseline", "showFixed"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("change", () => updateSavingsChart(false));
});
