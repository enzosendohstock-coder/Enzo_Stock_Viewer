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

// 圖表預設只顯示近 24 個月，不是一開啟就攤開全部歷史(回補到 2010 年的話會有 76+ 個月，
// 全部塞進一張圖 X 軸標籤會擠成一團、長條圖也會細到看不清楚)。完整歷史還在，
// min/max 開放到全部範圍，使用者可以自己用上面的年月選擇器拉開來看。
const DEFAULT_VISIBLE_MONTHS = 24;

function populateMonthRange() {
  // yearMonth 是 'yyyy-MM'，month input 也吃這個格式，不用額外轉換。
  const months = allRows.map(r => r.yearMonth).sort();
  const earliest = months[0];
  const latest = months[months.length - 1];

  const defaultStartIndex = Math.max(0, months.length - DEFAULT_VISIBLE_MONTHS);
  startMonthInput.value = months[defaultStartIndex];
  endMonthInput.value = latest;
  startMonthInput.min = earliest;
  startMonthInput.max = latest;
  endMonthInput.min = earliest;
  endMonthInput.max = latest;
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

// 範圍長(超過 24 個月)的時候 X 軸只標每年 1 月，不然每個月的標籤會擠成一團看不清楚；
// 範圍短的時候維持原本每個月都標，交給 autoSkip 視寬度自動處理。
function xAxisTicks(labels) {
  return {
    maxRotation: 90,
    minRotation: 90,
    autoSkip: labels.length <= 24,
    maxTicksLimit: 36,
    callback: labels.length > 24
      ? (value, index) => (labels[index].endsWith("-01") ? labels[index] : "")
      : undefined,
  };
}

// 當月營收(柱狀圖)、累計營收(折線圖)畫在同一張圖、共用同一個 Y 軸(不是雙軸)——
// 兩者單位都是「百萬元」，本來就可以直接比較，共用同一軸讓折線大部分時間自然浮在柱狀圖上方
// (累計營收只有每年 1 月會等於當月營收，其餘月份一定 >= 當月營收，數學上不會反過來)，
// 不用刻意去對齊雙軸刻度，也不用拆成兩張圖。
function renderChart(rows) {
  const labels = rows.map(r => r.yearMonth);
  const revenue = rows.map(r => Math.round(r.revenue / 1000)); // 千元 -> 百萬元，數字比較好讀
  const cumulative = rows.map(r => Math.round(r.cumulativeRevenue / 1000));

  const config = {
    data: {
      labels,
      datasets: [
        { type: "bar", label: "當月營收(百萬元)", data: revenue, backgroundColor: "#3498db" },
        {
          type: "line",
          label: "累計營收(百萬元，每年1月歸零)",
          data: cumulative,
          borderColor: "#e67e22",
          backgroundColor: "#e67e22",
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
        x: { ticks: xAxisTicks(labels) },
        y: { title: { display: true, text: "百萬元" }, beginAtZero: true },
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
