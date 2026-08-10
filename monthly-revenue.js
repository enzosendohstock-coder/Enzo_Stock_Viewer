const API_URL = "https://ppi-stock-worker.enzosendohstock.workers.dev/api/monthly-revenue";

const statusEl = document.getElementById("status");
const stockSelect = document.getElementById("stockSelect");
const startMonthInput = document.getElementById("startMonth");
const endMonthInput = document.getElementById("endMonth");
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

// 圖表預設顯示近 5 年(60個月)，不是一開啟就攤開全部歷史(回補到 2010 年的話會有 190+ 個月)。
// 完整歷史還在，min/max 開放到全部範圍，使用者可以自己用上面的日期選擇器拉開來看。
const DEFAULT_VISIBLE_MONTHS = 60;

// 日期元件跟個股股價頁面統一都用原生的 <input type="date">，不是 <input type="month">——
// yearMonth 存的是 'yyyy-MM'，這裡固定補上 "-01" 當作每月第一天存進 date input。
function populateMonthRange() {
  const months = allRows.map(r => r.yearMonth).sort();
  const earliest = months[0];
  const latest = months[months.length - 1];

  const defaultStartIndex = Math.max(0, months.length - DEFAULT_VISIBLE_MONTHS);
  startMonthInput.value = `${months[defaultStartIndex]}-01`;
  endMonthInput.value = `${latest}-01`;
  startMonthInput.min = `${earliest}-01`;
  startMonthInput.max = `${latest}-01`;
  endMonthInput.min = `${earliest}-01`;
  endMonthInput.max = `${latest}-01`;
}

function getFilteredRows() {
  const stockCode = stockSelect.value;
  // date input 給的是 'yyyy-MM-dd'，只取前 7 碼('yyyy-MM')跟 yearMonth 比較。
  const start = startMonthInput.value.slice(0, 7);
  const end = endMonthInput.value.slice(0, 7);

  return allRows
    .filter(r => r.stockCode === stockCode && r.yearMonth >= start && r.yearMonth <= end)
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

function render() {
  const rows = getFilteredRows();
  renderChart(rows);
  renderTable(rows);
}

// 'yyyy-MM' -> 'yyMM'，跟 margin.js 的 shortDate 同樣的簡化邏輯，只是月營收沒有日期只到月。
function shortYearMonth(yearMonth) {
  const [y, m] = yearMonth.split("-");
  return y.slice(2) + m;
}

// 範圍長(超過 24 個月)的時候 X 軸只標每年 1 月，不然每個月的標籤會擠成一團看不清楚；
// 範圍短的時候維持原本每個月都標，交給 autoSkip 視寬度自動處理。
//
// 注意：callback 這個 key 只在真的需要自訂格式時才放進物件——就算放 `callback: undefined`，
// Chart.js 只要偵測到物件「有」這個 key(即使值是 undefined)，就不會套用它原本正確的類別軸
// 預設格式化(index -> 對應的 label 字串)，改用陽春 fallback 直接把內部索引數字當標籤印出來，
// X 軸就會變成 0,1,2,3... 而不是正確年月。之前就是這樣才出現過一次 bug。
function xAxisTicks(labels) {
  const ticks = {
    maxRotation: 90,
    minRotation: 90,
    autoSkip: labels.length <= 24,
    maxTicksLimit: 36,
  };
  if (labels.length > 24) {
    ticks.callback = (value, index) => (labels[index].endsWith("-01") ? shortYearMonth(labels[index]) : "");
  } else {
    ticks.callback = (value, index) => shortYearMonth(labels[index]);
  }
  return ticks;
}

// 當月營收、累計營收改成用「圖表指標」下拉選單切換，同一時間只畫一條資料在同一張圖、同一個 Y 軸，
// 不用再處理兩者數字量級差很多時要怎麼共用/分開座標軸的問題——單一指標永遠用自己最適合的範圍呈現。
const METRIC_CONFIG = {
  revenue: { label: "當月營收(百萬元)", type: "bar", color: "#3498db", field: r => r.revenue },
  cumulative: { label: "累計營收(百萬元，每年1月歸零)", type: "line", color: "#e67e22", field: r => r.cumulativeRevenue },
};

function renderChart(rows) {
  const labels = rows.map(r => r.yearMonth);
  const metric = METRIC_CONFIG[metricSelect.value];
  const values = rows.map(r => Math.round(metric.field(r) / 1000)); // 千元 -> 百萬元，數字比較好讀

  const config = {
    data: {
      labels,
      datasets: [
        {
          type: metric.type,
          label: metric.label,
          data: values,
          backgroundColor: metric.color,
          borderColor: metric.color,
          pointRadius: metric.type === "line" ? 0 : undefined,
          borderWidth: metric.type === "line" ? 2 : undefined,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: xAxisTicks(labels) },
        y: { beginAtZero: true, title: { display: true, text: metric.label } },
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
metricSelect.addEventListener("change", render);

loadData().catch(err => {
  statusEl.textContent = "資料載入失敗：" + err.message;
  console.error(err);
});
