// ========== Currency & number formatting ==========
const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2
});
const NF = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }); // for kWh with commas

// ========== Global state ==========
let baselineRate = null;   // $/kWh (Rate you pay PSEG now)
let usageMonthly = null;   // kWh per month
let usageAnnual  = null;   // kWh per year
let savingsChart = null;   // Chart.js instance

const YEARS_DEFAULT = 25;

// Bubble indices for savings amounts (years 1,5,10,15,20,25)
const SAVINGS_BUBBLE_YEARS = [1, 5, 10, 15, 20, 25].map(y => y - 1);
// Bubble indices for PSEG monthly labels (years 5,10,15,20,25)
const PSEG_BUBBLE_YEARS = [5, 10, 15, 20, 25].map(y => y - 1);

// ========== Calculator ==========
function calculate() {
  const dollarsMonthly = parseFloat(document.getElementById("dollars").value);
  const kwhMonthly = parseFloat(document.getElementById("kwh").value);
  const kwhAnnualAlt = parseFloat(document.getElementById("annualKwh").value);
  const resultDiv = document.getElementById("result");

  if (isNaN(dollarsMonthly) || dollarsMonthly <= 0) {
    resultDiv.textContent = "Please enter the Dollar amount of your Monthly PSEG Bill or your Monthly Balanced Billing Amount.";
    return;
  }

  // Prefer annual if provided, otherwise use monthly
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

  // Normalize periods: ($/mo * 12) / (kWh/yr)
  baselineRate = (dollarsMonthly * 12) / usageAnnual;

  // Put “$/kWh” at the END of the line, as requested
  resultDiv.textContent = `Rate you pay PSEG now: ${USD.format(baselineRate)} $ / kWh`;
}

function resetCalculator() {
  document.getElementById("dollars").value = "";
  document.getElementById("kwh").value = "";
  document.getElementById("annualKwh").value = "";
  document.getElementById("result").textContent = "";
}

// ========== Screens ==========
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

    // Displays (with commas)
    document.getElementById("baselineDisplay").textContent = USD.format(baselineRate);
    document.getElementById("usageMonthlyDisplay").textContent = NF.format(usageMonthly);
    document.getElementById("usageAnnualDisplay").textContent  = NF.format(usageAnnual);

    updateSavingsChart(false);
  } else {
    sav.classList.add("hidden");
    calc.classList.remove("hidden");
    navSav.classList.remove("active");
    navCalc.classList.add("active");
  }
}

function backToCalc() { showScreen("calc"); }

// ========== Savings Over Time ==========
function computeSeries(years, growthPctPSEG, growthPctPalmetto) {
  // Growth starts in year 2 via exponent (y-1)
  const fixedRateInput = document.getElementById("fixedRate");
  const palmetto0 = parseFloat(fixedRateInput.value);

  const labels = [];
  const psegRateEsc = [];    // $/kWh
  const palmRateEsc = [];    // $/kWh
  const psegAnnual = [];     // $
  const palmAnnual = [];     // $
  const savingsAnnual = [];  // $
  const cumulative = [];     // $

  let cum = 0;
  for (let y = 1; y <= years; y++) {
    const psegRateY  = baselineRate * Math.pow(1 + growthPctPSEG, y - 1);
    const palmRateY  = (isNaN(palmetto0) || palmetto0 <= 0) ? 0 : palmetto0 * Math.pow(1 + growthPctPalmetto, y - 1);

    const psegCost = psegRateY * usageAnnual;
    const palmCost = palmRateY * usageAnnual;
    const sav = psegCost - palmCost;

    labels.push(`Year ${y}`);
    psegRateEsc.push(Number(psegRateY.toFixed(6)));
    palmRateEsc.push(Number(palmRateY.toFixed(6)));
    psegAnnual.push(Number(psegCost.toFixed(2)));
    palmAnnual.push(Number(palmCost.toFixed(2)));
    savingsAnnual.push(Number(sav.toFixed(2)));
    cum += sav;
    cumulative.push(Number(cum.toFixed(2)));
  }

  return { labels, psegRateEsc, palmRateEsc, psegAnnual, palmAnnual, savingsAnnual, cumulative, palmetto0 };
}

function updateSavingsChart(requireInput = true) {
  const summary = document.getElementById("savingsSummary");
  const fixedRateInput = document.getElementById("fixedRate");
  const growthPSEGEl = document.getElementById("growthRate");
  const growthPalmEl = document.getElementById("fixedGrowthRate");

  if (!baselineRate || !usageAnnual) {
    summary.textContent = "Please calculate on the Calculator tab first.";
    destroyChartIfAny();
    clearYearTable();
    return;
  }

  // Parse growth % -> decimals (do not round for display)
  const growthPctPSEG = Math.max(0, parseFloat(growthPSEGEl.value || "3.5")) / 100;
  const growthPctPalm = (parseFloat(growthPalmEl.value || "0") / 100); // can be negative
  const psegGrowthStr = (growthPSEGEl.value || "3.5");
  const palmGrowthStr = (growthPalmEl.value || "0");

  const palmetto0 = parseFloat(fixedRateInput.value);

  if (requireInput && (isNaN(palmetto0) || palmetto0 <= 0)) {
    summary.textContent = "Enter a positive Palmetto Fixed Rate ($/kWh) to draw the graph.";
    destroyChartIfAny();
    clearYearTable();
    return;
  }

  const {
    labels, psegRateEsc, palmRateEsc, psegAnnual, palmAnnual, savingsAnnual, cumulative
  } = computeSeries(YEARS_DEFAULT, growthPctPSEG, growthPctPalm);

  if (!isNaN(palmetto0) && palmetto0 > 0) {
    const total = cumulative[cumulative.length - 1] || 0;
    summary.innerHTML =
      `Cumulative savings over ${YEARS_DEFAULT} years ` +
      `(PSEG ${psegGrowthStr}%/yr vs Palmetto ${palmGrowthStr}%/yr): ` +
      `<span class="highlight">${USD.format(total)}</span>`;
  } else {
    summary.textContent = "Awaiting Palmetto Fixed Rate to generate savings graph…";
  }

  // Datasets with requested colors/labels
  const ds = [];
  if (document.getElementById("showSavings").checked) {
    ds.push({
      label: 'Annual Savings ($)',
      data: savingsAnnual,
      tension: 0.25,
      borderWidth: 2,
      pointRadius: 2,
      borderColor: '#007aff',   // blue
      backgroundColor: 'rgba(0,122,255,0.1)'
    });
  }
  if (document.getElementById("showBaseline").checked) {
    ds.push({
      label: 'Amount you pay PSEG ($/yr)',
      data: psegAnnual,
      tension: 0.2,
      borderWidth: 2,
      pointRadius: 0,
      borderColor: '#d63031',   // red
      backgroundColor: 'rgba(214,48,49,0.08)'
    });
  }
  if (document.getElementById("showFixed").checked) {
    ds.push({
      label: 'Palmetto Rate ($/yr)',
      data: palmAnnual,
      tension: 0.2,
      borderWidth: 2,
      pointRadius: 0,
      borderColor: '#27ae60',   // green
      backgroundColor: 'rgba(39,174,96,0.08)'
    });
  }

  drawSavingsChart(labels, ds, savingsAnnual, psegAnnual);

  fillYearTable(labels, psegRateEsc, palmRateEsc, psegAnnual, palmAnnual, savingsAnnual, cumulative);
}

function destroyChartIfAny() {
  if (savingsChart) {
    savingsChart.destroy();
    savingsChart = null;
  }
}

// ========== Custom Plugins ==========

// Savings bubbles (years 1,5,10,15,20,25). Year 25 bigger + bold + edge-clipping fix.
const SavingsBubblePlugin = {
  id: 'savingsBubblePlugin',
  afterDatasetsDraw(chart, args, pluginOptions) {
    const { ctx, scales, chartArea } = chart;
    const x = scales.x, y = scales.y;
    const savingsArray = pluginOptions?.savingsArray || [];
    const indices = pluginOptions?.indices || [];

    // Find dataset for "Annual Savings ($)"
    const dsIndex = chart.data.datasets.findIndex(d => d.label && d.label.startsWith('Annual Savings'));
    if (dsIndex === -1) return;

    ctx.save();
    indices.forEach((i) => {
      if (i < 0 || i >= savingsArray.length) return;
      const xPix = x.getPixelForValue(i);
      const yPix = y.getPixelForValue(savingsArray[i]);

      const isYear25 = (i === 24);
      const txt = USD.format(savingsArray[i]);
      ctx.font = isYear25 ? 'bold 13px Arial' : '12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      const paddingX = 8, paddingY = 6;
      const textW = ctx.measureText(txt).width;
      const boxW = textW + paddingX * 2;
      const boxH = isYear25 ? 28 : 24;
      let boxX = xPix - boxW / 2;
      let boxY = yPix - 10 - boxH; // try above

      // Edge/clipping adjustments
      if (boxY < chartArea.top + 4) boxY = yPix + 10;                 // below if too high
      if (boxX < chartArea.left + 4) boxX = chartArea.left + 4;       // clamp left
      if (boxX + boxW > chartArea.right - 4) boxX = chartArea.right - 4 - boxW; // clamp right

      ctx.fillStyle = 'rgba(0,122,255,0.9)'; // blue bubble
      ctx.beginPath();
      roundedRect(ctx, boxX, boxY, boxW, boxH, 10);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.fillText(txt, xPix, boxY + boxH - (isYear25 ? 9 : 8));
    });
    ctx.restore();
  }
};

// PSEG monthly bubbles above the red PSEG line (years 5,10,15,20,25) with clipping fix.
const PsegMonthlyBubblePlugin = {
  id: 'psegMonthlyBubblePlugin',
  afterDatasetsDraw(chart, args, pluginOptions) {
    const { ctx, scales, chartArea } = chart;
    const x = scales.x, y = scales.y;
    const indices = pluginOptions?.indices || [];
    const annualArray = pluginOptions?.annualArray || [];
    if (!indices.length || !annualArray.length) return;

    // Ensure the PSEG dataset exists (label starts with Amount you pay PSEG)
    const psegIndex = chart.data.datasets.findIndex(d => d.label && d.label.startsWith('Amount you pay PSEG'));
    if (psegIndex === -1) return;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = '12px Arial';

    indices.forEach((i) => {
      if (i < 0 || i >= annualArray.length) return;
      const monthlyValue = annualArray[i] / 12;         // convert annual PSEG cost to monthly
      const xPix = x.getPixelForValue(i);
      const yPix = y.getPixelForValue(annualArray[i]);  // anchor at the PSEG annual point

      const text = `${USD.format(monthlyValue)}/mo`;
      const paddingX = 8, paddingY = 6;
      const textW = ctx.measureText(text).width;
      const boxW = textW + paddingX * 2;
      const boxH = 24;
      let boxX = xPix - boxW / 2;
      let boxY = yPix - 10 - boxH; // above the point

      // Edge/clipping fix: keep on-screen
      if (boxY < chartArea.top + 4) boxY = yPix + 10;               // put below if too high
      if (boxX < chartArea.left + 4) boxX = chartArea.left + 4;     // clamp left
      if (boxX + boxW > chartArea.right - 4) boxX = chartArea.right - 4 - boxW; // clamp right

      // Draw bubble (red to match PSEG line)
      ctx.fillStyle = 'rgba(214,48,49,0.9)';
      ctx.beginPath();
      roundedRect(ctx, boxX, boxY, boxW, boxH, 10);
      ctx.fill();

      // Text
      ctx.fillStyle = '#fff';
      ctx.fillText(text, xPix, boxY + boxH - 8);
    });

    ctx.restore();
  }
};

// Rounded rectangle helper
function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w/2, h/2);
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawSavingsChart(labels, datasets, savingsAnnual, psegAnnual) {
  const ctx = document.getElementById("savingsChart").getContext("2d");
  destroyChartIfAny();

  savingsChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true },
        savingsBubblePlugin: {
          indices: SAVINGS_BUBBLE_YEARS, // 1,5,10,15,20,25
          savingsArray: savingsAnnual
        },
        psegMonthlyBubblePlugin: {
          indices: PSEG_BUBBLE_YEARS,    // 5,10,15,20,25
          annualArray: psegAnnual
        }
      },
      scales: {
        x: { title: { display: true, text: 'Year' } },
        y: { title: { display: true, text: 'Dollars ($/yr)' } }
      }
    },
    plugins: [SavingsBubblePlugin, PsegMonthlyBubblePlugin]
  });
}

// ========== Table + CSV ==========
function clearYearTable() {
  const tbody = document.querySelector("#yearTable tbody");
  if (tbody) tbody.innerHTML = "";
}

function fillYearTable(labels, psegRateEsc, palmRateEsc, psegAnnual, palmAnnual, savingsAnnual, cumulative) {
  const tbody = document.querySelector("#yearTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  for (let i = 0; i < labels.length; i++) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${psegRateEsc[i].toFixed(6)}</td>
      <td>${palmRateEsc[i].toFixed(6)}</td>
      <td>${USD.format(psegAnnual[i])}</td>
      <td>${USD.format(palmAnnual[i])}</td>
      <td>${USD.format(savingsAnnual[i])}</td>
      <td>${USD.format(cumulative[i])}</td>
    `;
    tbody.appendChild(tr);
  }
}

function exportCsv() {
  const growthPSEGEl = document.getElementById("growthRate");
  const growthPalmEl = document.getElementById("fixedGrowthRate");
  const growthPctPSEG = Math.max(0, parseFloat(growthPSEGEl.value || "3.5")) / 100;
  const growthPctPalm = (parseFloat(growthPalmEl.value || "0") / 100);

  if (!baselineRate || !usageAnnual) {
    alert("Please calculate first.");
    return;
  }
  const {
    labels, psegRateEsc, palmRateEsc, psegAnnual, palmAnnual, savingsAnnual, cumulative
  } = computeSeries(YEARS_DEFAULT, growthPctPSEG, growthPctPalm);

  const rows = [
    ["Year", "PSEG Rate Increases ($/kWh)", "Palmetto Rate ($/kWh)", "Annual PSEG Cost ($)", "Annual Palmetto Cost ($)", "Annual Savings ($)", "Cumulative Savings ($)"],
  ];
  for (let i = 0; i < labels.length; i++) {
    rows.push([
      (i + 1).toString(),
      psegRateEsc[i].toFixed(6),
      palmRateEsc[i].toFixed(6),
      psegAnnual[i].toFixed(2),
      palmAnnual[i].toFixed(2),
      savingsAnnual[i].toFixed(2),
      cumulative[i].toFixed(2)
    ]);
  }

  const csv = rows.map(r => r.map(field => `"${field.replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `savings_25yrs.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========== Download chart as PNG ==========
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

// ========== Keyboard: Enter triggers the right action ==========
document.addEventListener("keydown", function (event) {
  if (event.key !== "Enter") return;
  const calcVisible = !document.getElementById("calc-screen").classList.contains("hidden");
  if (calcVisible) {
    calculate();
  } else {
    updateSavingsChart();
  }
});

// ========== Reactivity ==========
function attachAutoClear(selector, clearFn) {
  document.querySelectorAll(selector).forEach((input) => {
    input.addEventListener("input", clearFn);
  });
}
attachAutoClear("#dollars, #kwh, #annualKwh", () => {
  document.getElementById("result").textContent = "";
});
["fixedRate", "growthRate", "fixedGrowthRate"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", () => updateSavingsChart(false));
});
["showSavings", "showBaseline", "showFixed"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("change", () => updateSavingsChart(false));
});
