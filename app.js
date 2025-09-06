// ---------- Currency formatting ----------
const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2
});

// ---------- Global state ----------
let baselineRate = null;   // $/kWh (Amount you pay now)
let usageMonthly = null;   // kWh per month
let usageAnnual  = null;   // kWh per year
let savingsChart = null;   // Chart.js instance

const YEARS_DEFAULT = 25;

// Every-5-year bubble years (1-indexed): 5,10,15,20,25
const BUBBLE_YEARS = [5, 10, 15, 20, 25];

// ---------- Calculator ----------
function calculate() {
  const kwhMonthly = parseFloat(document.getElementById("kwh").value);        // monthly kWh (optional if annual given)
  const kwhAnnualAlt = parseFloat(document.getElementById("annualKwh").value); // alternate annual kWh
  const dollarsMonthly = parseFloat(document.getElementById("dollars").value); // monthly $

  const resultDiv = document.getElementById("result");

  if (isNaN(dollarsMonthly) || dollarsMonthly <= 0) {
    resultDiv.textContent = "Please enter the Dollar amount of your Monthly Utility Bill.";
    return;
  }

  // Decide which usage to use: prefer annual if provided
  if (!isNaN(kwhAnnualAlt) && kwhAnnualAlt > 0) {
    usageAnnual  = kwhAnnualAlt;
    usageMonthly = kwhAnnualAlt / 12;
  } else if (!isNaN(kwhMonthly) && kwhMonthly > 0) {
    usageMonthly = kwhMonthly;
    usageAnnual  = kwhMonthly * 12;
  } else {
    resultDiv.textContent = "Please enter either Monthly kWh OR Annual kWh.";
    return;
  }

  // $/kWh computed with matching periods: ($/mo * 12) / (kWh/yr)
  baselineRate = (dollarsMonthly * 12) / usageAnnual;

  resultDiv.textContent = `${USD.format(baselineRate)} per kWh (Amount you pay now)`;
}

function resetCalculator() {
  document.getElementById("kwh").value = "";
  document.getElementById("annualKwh").value = "";
  document.getElementById("dollars").value = "";
  document.getElementById("result").textContent = "";
}

// ---------- Screens ----------
function showScreen(which) {
  const calc = document.getElementById("calc-screen");
  const sav  = document.getElementById("savings-screen");
  const navCalc = document.getElementById("nav-calc");
  const navSav  = document.getElementById("nav-savings");

  if (which === "savings") {
    if (!baselineRate || !usageAnnual || baselineRate <= 0 || usageAnnual <= 0) {
      alert("Please calculate your inputs on the Calculator tab first.");
      return;
    }
    calc.classList.add("hidden");
    sav.classList.remove("hidden");
    navCalc.classList.remove("active");
    navSav.classList.add("active");

    // Initialize display
    document.getElementById("baselineDisplay").textContent = USD.format(baselineRate);
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

// ---------- Savings Over Time ----------
function computeSeries(years, growthPctBaseline, growthPctFixed) {
  // (Growth starts in year 2 via exponent (y-1))
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
    const baseRateY  = baselineRate * Math.pow(1 + growthPctBaseline, y - 1); // y=1 => no growth
    const fixedRateY = (isNaN(fixed0) || fixed0 <= 0)
      ? 0
      : fixed0 * Math.pow(1 + growthPctFixed, y - 1);

    const bCost = baseRateY * usageAnnual;
    const fCost = fixedRateY * usageAnnual;
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
    summary.textContent = "Please calculate on the Calculator tab first.";
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
      `Cumulative savings over ${YEARS_DEFAULT} years ` +
      `(Amount you pay now growth ${(growthPctBaseline * 100).toFixed(1)}%/yr ` +
      `vs Fixed growth ${(growthPctFixed * 100).toFixed(1)}%/yr): ` +
      `<strong>${USD.format(total)}</strong>`;
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
      label: 'Amount you pay now (Cost $/yr)',
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

  // Precompute monthly baseline cost for the bubble labels
  const baseMonthly = baseCost.map(v => v / 12);

  drawSavingsChart(labels, ds, baseCost, baseMonthly);

  // Populate table with currency formatting
  fillYearTable(labels, escalatedBaselineRate, escalatedFixedRate, baseCost, fixedCost, savings, cumulative);
}

function destroyChartIfAny() {
  if (savingsChart) {
    savingsChart.destroy();
    savingsChart = null;
  }
}

// Custom plugin to draw currency bubbles above the baseline every 5 years
const BubblePlugin = {
  id: 'bubblePlugin',
  afterDatasetsDraw(chart, args, pluginOptions) {
    const { ctx, chartArea, scales } = chart;
    const xScale = scales.x;
    const yScale = scales.y;
    const indices = pluginOptions?.indices || [];
    const values  = pluginOptions?.values  || []; // baseline monthly $ by year (array length = labels)
    if (!indices.length || !values.length) return;

    ctx.save();
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    indices.forEach((yearIndex) => {
      if (yearIndex < 0 || yearIndex >= values.length) return;
      const x = xScale.getPixelForValue(yearIndex);
      const yVal = pluginOptions.baseLineArray?.[yearIndex];
      if (typeof yVal !== 'number') return;

      const y = yScale.getPixelForValue(yVal);
      const text = `${USD.format(values[yearIndex])}/mo`;

      // Bubble dims
      const paddingX = 8;
      const paddingY = 6;
      const textW = ctx.measureText(text).width;
      const boxW = textW + paddingX * 2;
      const boxH = 24;
      const boxX = x - boxW / 2;
      const boxY = y - 10 - boxH; // 10px above the point

      // Rounded rectangle
      const radius = 10;
      ctx.fillStyle = 'rgba(39, 174, 96, 0.9)'; // green-ish bubble
      ctx.beginPath();
      roundedRect(ctx, boxX, boxY, boxW, boxH, radius);
      ctx.fill();

      // Text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x, boxY + boxH - 8);
    });

    ctx.restore();
  }
};

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w/2, h/2);
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawSavingsChart(labels, datasets, baseCostYearly, baseMonthly) {
  const ctx = document.getElementById("savingsChart").getContext("2d");
  destroyChartIfAny();

  // Map bubble years (1,5,10,15,20,25...) to zero-based indices
  const bubbleIdx = BUBBLE_YEARS.map(y => y - 1);

  savingsChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true },
        bubblePlugin: {
          indices: bubbleIdx,
          values: baseMonthly,
          baseLineArray: baseCostYearly
        }
      },
      scales: {
        x: { title: { display: true, text: 'Year' } },
        y: { title: { display: true, text: 'Dollars ($/yr)' } }
      }
    },
    plugins: [BubblePlugin] // register custom plugin per-chart
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
      <td>${USD.format(escalatedBaselineRate[i])}</td>
      <td>${USD.format(escalatedFixedRate[i])}</td>
      <td>${USD.format(baseCost[i])}</td>
      <td>${USD.format(fixedCost[i])}</td>
      <td>${USD.format(savings[i])}</td>
      <td>${USD.format(cumulative[i])}</td>
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
    alert("Please calculate first.");
    return;
  }
  const {
    labels, escalatedBaselineRate, escalatedFixedRate,
    baseCost, fixedCost, savings, cumulative
  } = computeSeries(YEARS_DEFAULT, growthPctBaseline, growthPctFixed);

  const rows = [
    ["Year", "Amount you pay now $/kWh", "Fixed $/kWh", "Amount you pay now (Cost $/yr)", "Fixed Cost ($/yr)", "Annual Savings ($/yr)", "Cumulative Savings ($)"],
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
  a.download = `savings_${YEARS_DEFAULT}yrs.csv`;
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
attachAutoClear("#kwh, #annualKwh, #dollars", () => {
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
