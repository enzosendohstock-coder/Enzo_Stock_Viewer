const API_URL = "https://ppi-stock-worker.enzosendohstock.workers.dev/api/quarterly-financials";

const statusEl = document.getElementById("status");
const stockSelect = document.getElementById("stockSelect");
const metricSelect = document.getElementById("metricSelect");
const tableBody = document.querySelector("#dataTable tbody");

let allRows = [];
let chart = null;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function loadData() {
  statusEl.textContent = "資料載入中...";
  const response = await fetch(API_URL, { cache: "no-store" });
  const data = await response.json();

  allRows = data.map(r => ({
    year: Number(r.year),
    quarter: Number(r.quarter),
    period: `${r.year}Q${r.quarter}`,
    stockCode: r.stockCode,
    stockName: r.stockName,
    industryCategory: r.industryCategory,
    revenue: num(r.revenue),
    eps: num(r.eps),
    grossMargin: num(r.grossMargin),
    operatingMargin: num(r.operatingMargin),
    pretaxMargin: num(r.pretaxMargin),
    netMargin: num(r.netMargin),
  })).filter(r => r.year && r.quarter && r.stockCode);

  populateStockOptions();
  render();
  statusEl.textContent = `共 ${allRows.length} 筆資料，最後更新：${new Date().toLocaleString("zh-TW")}`;
}

function populateStockOptions() {
  const seen = new Map();
  for (const r of allRows) {
    if (!seen.has(r.stockCode)) seen.set(r.stockCode, r.stockName);
  }
  const codes = [...seen.keys()].sort();

  stockSelect.innerHTML = "";
  for (const code of codes) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = `${code} ${seen.get(code)}`;
    stockSelect.appendChild(opt);
  }
}

function getFilteredRows() {
  const stockCode = stockSelect.value;
  return allRows
    .filter(r => r.stockCode === stockCode)
    .sort((a, b) => a.year - b.year || a.quarter - b.quarter);
}

function render() {
  const rows = getFilteredRows();
  renderChart(rows);
  renderTable(rows);
}

function renderChart(rows) {
  const labels = rows.map(r => r.period);
  const metric = metricSelect.value;

  let datasets;
  let scales;

  if (metric === "eps") {
    datasets = [
      {
        type: "bar",
        label: "EPS(元)",
        data: rows.map(r => r.eps),
        backgroundColor: rows.map(r => (r.eps ?? 0) >= 0 ? "#c0392b" : "#27ae60"),
        yAxisID: "y",
      },
    ];
    scales = {
      x: { ticks: { maxRotation: 90, minRotation: 90 } },
      y: { position: "left", title: { display: true, text: "EPS(元)" } },
    };
  } else {
    datasets = [
      { type: "line", label: "毛利率(%)", data: rows.map(r => r.grossMargin), borderColor: "#3498db", backgroundColor: "#3498db", yAxisID: "y", pointRadius: 2, borderWidth: 2 },
      { type: "line", label: "營益率(%)", data: rows.map(r => r.operatingMargin), borderColor: "#e67e22", backgroundColor: "#e67e22", yAxisID: "y", pointRadius: 2, borderWidth: 2 },
      { type: "line", label: "稅前淨利率(%)", data: rows.map(r => r.pretaxMargin), borderColor: "#9b59b6", backgroundColor: "#9b59b6", yAxisID: "y", pointRadius: 2, borderWidth: 2, borderDash: [4, 4] },
      { type: "line", label: "稅後淨利率(%)", data: rows.map(r => r.netMargin), borderColor: "#c0392b", backgroundColor: "#c0392b", yAxisID: "y", pointRadius: 2, borderWidth: 2 },
    ];
    scales = {
      x: { ticks: { maxRotation: 90, minRotation: 90 } },
      y: { position: "left", title: { display: true, text: "%" } },
    };
  }

  const config = {
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      spanGaps: true,
      scales,
    },
  };

  if (chart) {
    chart.destroy();
  }
  chart = new Chart(document.getElementById("chart"), config);
}

function fmtPct(v) {
  return v === null ? "-" : `${v.toFixed(2)}%`;
}

function fmtNum(v) {
  return v === null ? "-" : Math.round(v).toLocaleString();
}

function renderTable(rows) {
  tableBody.innerHTML = "";
  const reversed = [...rows].reverse();
  for (const r of reversed) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.period}</td>
      <td>${r.stockCode}</td>
      <td>${r.stockName}</td>
      <td>${r.industryCategory}</td>
      <td>${fmtNum(r.revenue)}</td>
      <td>${fmtPct(r.grossMargin)}</td>
      <td>${fmtPct(r.operatingMargin)}</td>
      <td>${fmtPct(r.pretaxMargin)}</td>
      <td>${fmtPct(r.netMargin)}</td>
      <td>${r.eps === null ? "-" : r.eps.toFixed(2)}</td>
    `;
    tableBody.appendChild(tr);
  }
}

stockSelect.addEventListener("change", render);
metricSelect.addEventListener("change", render);

loadData().catch(err => {
  statusEl.textContent = "資料載入失敗：" + err.message;
  console.error(err);
});
