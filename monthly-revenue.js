const API_URL = "https://ppi-stock-worker.enzosendohstock.workers.dev/api/monthly-revenue";

const statusEl = document.getElementById("status");
const stockSelect = document.getElementById("stockSelect");
const startMonthInput = document.getElementById("startMonth");
const endMonthInput = document.getElementById("endMonth");
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
    yearMonth: r.yearMonth,
    stockCode: r.stockCode,
    stockName: r.stockName,
    revenue: num(r.revenue) ?? 0,
    momPercent: num(r.momPercent),
    yoyPercent: num(r.yoyPercent),
    cumulativeRevenue: num(r.cumulativeRevenue) ?? 0,
    cumulativeYoyPercent: num(r.cumulativeYoyPercent),
  })).filter(r => r.yearMonth && r.stockCode);

  populateStockOptions();
  populateMonthRange();
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

function populateMonthRange() {
  // yearMonth 是 'yyyy-MM'，month input 也吃這個格式，不用額外轉換。
  const months = allRows.map(r => r.yearMonth).sort();
  startMonthInput.value = months[0];
  endMonthInput.value = months[months.length - 1];
  startMonthInput.min = months[0];
  startMonthInput.max = months[months.length - 1];
  endMonthInput.min = months[0];
  endMonthInput.max = months[months.length - 1];
}

function getFilteredRows() {
  const stockCode = stockSelect.value;
  const start = startMonthInput.value;
  const end = endMonthInput.value;

  return allRows
    .filter(r => r.stockCode === stockCode && r.yearMonth >= start && r.yearMonth <= end)
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

function render() {
  const rows = getFilteredRows();
  renderChart(rows);
  renderTable(rows);
}

function renderChart(rows) {
  const labels = rows.map(r => r.yearMonth);
  const revenue = rows.map(r => Math.round(r.revenue / 1000)); // 千元 -> 百萬元，數字比較好讀
  const cumulative = rows.map(r => Math.round(r.cumulativeRevenue / 1000));

  const config = {
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: "當月營收(百萬元)",
          data: revenue,
          backgroundColor: "#3498db",
          yAxisID: "y",
        },
        {
          type: "line",
          label: "累計營收(百萬元，每年1月歸零)",
          data: cumulative,
          borderColor: "#e67e22",
          backgroundColor: "#e67e22",
          yAxisID: "y1",
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { maxRotation: 90, minRotation: 90, autoSkip: true, maxTicksLimit: 36 } },
        y: { position: "left", title: { display: true, text: "當月營收(百萬元)" } },
        y1: { position: "right", title: { display: true, text: "累計營收(百萬元)" }, grid: { drawOnChartArea: false } },
      },
    },
  };

  if (chart) {
    chart.destroy();
  }
  chart = new Chart(document.getElementById("chart"), config);
}

function pct(v) {
  return v === null ? "-" : `${v.toFixed(2)}%`;
}

function pctClass(v) {
  if (v === null) return "";
  return v >= 0 ? "positive" : "negative";
}

function renderTable(rows) {
  tableBody.innerHTML = "";
  const reversed = [...rows].reverse();
  for (const r of reversed) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.yearMonth}</td>
      <td>${r.stockCode}</td>
      <td>${r.stockName}</td>
      <td>${Math.round(r.revenue).toLocaleString()}</td>
      <td class="${pctClass(r.momPercent)}">${pct(r.momPercent)}</td>
      <td class="${pctClass(r.yoyPercent)}">${pct(r.yoyPercent)}</td>
      <td>${Math.round(r.cumulativeRevenue).toLocaleString()}</td>
      <td class="${pctClass(r.cumulativeYoyPercent)}">${pct(r.cumulativeYoyPercent)}</td>
    `;
    tableBody.appendChild(tr);
  }
}

stockSelect.addEventListener("change", render);
startMonthInput.addEventListener("change", render);
endMonthInput.addEventListener("change", render);

loadData().catch(err => {
  statusEl.textContent = "資料載入失敗：" + err.message;
  console.error(err);
});
