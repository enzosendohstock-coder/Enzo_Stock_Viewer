const API_URL = "https://ppi-stock-worker.enzosendohstock.workers.dev/api/quarterly-financials";

const statusEl = document.getElementById("status");
const stockSelect = document.getElementById("stockSelect");
const stockSuggestionsEl = document.getElementById("stockSuggestions");
const tableBody = document.querySelector("#dataTable tbody");

let allRows = [];
let chart = null;

// 股票代號欄位是文字輸入(可以打代號或名稱)+ 自動完成建議清單，共用邏輯見 stock-autocomplete.js。
let codeToStock = new Map();
let currentStockCode = null;

setupStockAutocomplete({
  inputEl: stockSelect,
  suggestionsEl: stockSuggestionsEl,
  getEntries: () => [...codeToStock].map(([code, name]) => ({ code, name })),
  onSelect: (code) => {
    currentStockCode = code;
    render();
  },
});

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
  codeToStock = new Map();
  for (const r of allRows) {
    if (!codeToStock.has(r.stockCode)) codeToStock.set(r.stockCode, r.stockName);
  }
  const codes = [...codeToStock.keys()].sort();

  if (!currentStockCode || !codeToStock.has(currentStockCode)) {
    currentStockCode = codes[0] ?? null;
  }
  if (currentStockCode) {
    stockSelect.value = `${currentStockCode} ${codeToStock.get(currentStockCode)}`;
  }
}

function getFilteredRows() {
  const stockCode = currentStockCode;
  return allRows
    .filter(r => r.stockCode === stockCode)
    .sort((a, b) => a.year - b.year || a.quarter - b.quarter);
}

function render() {
  const rows = getFilteredRows();
  renderChart(rows);
  renderTable(rows);
}

// EPS(元)跟四率(%)單位差太多，分開放左右兩個 Y 軸，同一張圖用顏色區分五條線，
// 這樣可以直接看出同一季 EPS 跟毛利率/營益率/稅前稅後淨利率之間的相對走勢。
function renderChart(rows) {
  const labels = rows.map(r => r.period);

  const datasets = [
    { type: "bar", label: "EPS(元)", data: rows.map(r => r.eps), backgroundColor: "#2c3e50", yAxisID: "y" },
    { type: "line", label: "毛利率(%)", data: rows.map(r => r.grossMargin), borderColor: "#3498db", backgroundColor: "#3498db", yAxisID: "y1", pointRadius: 2, borderWidth: 2 },
    { type: "line", label: "營益率(%)", data: rows.map(r => r.operatingMargin), borderColor: "#e67e22", backgroundColor: "#e67e22", yAxisID: "y1", pointRadius: 2, borderWidth: 2 },
    { type: "line", label: "稅前淨利率(%)", data: rows.map(r => r.pretaxMargin), borderColor: "#9b59b6", backgroundColor: "#9b59b6", yAxisID: "y1", pointRadius: 2, borderWidth: 2, borderDash: [4, 4] },
    { type: "line", label: "稅後淨利率(%)", data: rows.map(r => r.netMargin), borderColor: "#c0392b", backgroundColor: "#c0392b", yAxisID: "y1", pointRadius: 2, borderWidth: 2 },
  ];

  const config = {
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      spanGaps: true,
      scales: {
        x: { ticks: { maxRotation: 90, minRotation: 90 } },
        y: { position: "left", title: { display: true, text: "EPS(元)" } },
        y1: { position: "right", title: { display: true, text: "%" }, grid: { drawOnChartArea: false } },
      },
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

loadData().catch(err => {
  statusEl.textContent = "資料載入失敗：" + err.message;
  console.error(err);
});
