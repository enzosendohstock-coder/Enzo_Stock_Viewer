const API_URL = "https://ppi-stock-worker.enzosendohstock.workers.dev/api/institutional-with-ratio";

const statusEl = document.getElementById("status");
const stockSelect = document.getElementById("stockSelect");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
const metricSelect = document.getElementById("metricSelect");
const tableBody = document.querySelector("#dataTable tbody");
const summaryDaysSelect = document.getElementById("summaryDays");
const summaryRangeEl = document.getElementById("summaryRange");
const summaryForeignEl = document.getElementById("summaryForeign");
const summaryTrustEl = document.getElementById("summaryTrust");
const summaryDealerEl = document.getElementById("summaryDealer");
const summaryGrandEl = document.getElementById("summaryGrand");
const chartInfoEl = document.getElementById("chartInfo");

const METRIC_FIELDS = {
  grand: { field: "grandTotalNet", label: "三大法人合計" },
  foreign: { field: "foreignTotalNet", label: "外資" },
  trust: { field: "trustNet", label: "投信" },
  dealer: { field: "dealerTotalNet", label: "自營商" },
};

let allRows = [];
let chart = null;
let recentDatesSet = new Set();
let currentRows = [];
let currentMetricKey = "grand";
let currentMetricLabel = "三大法人合計";

// 開高低收那類固定資訊列的做法(不用浮動 tooltip，改成固定顯示在圖表上方、跟著十字準線
// 即時更新)，跟 stock-price.html 是同一套設計。這裡只有一張圖，不用像 stock-price.html
// 那樣處理兩張圖之間的同步。
const hoverState = { index: null };

function fmtLots(v) {
  const cls = v >= 0 ? "positive" : "negative";
  return `<span class="${cls}">${v.toLocaleString()}</span>`;
}

function updateChartInfo() {
  const index = hoverState.index ?? currentRows.length - 1;
  const row = currentRows[index];
  if (!row) {
    chartInfoEl.innerHTML = "";
    return;
  }

  if (currentMetricKey === "grand") {
    chartInfoEl.innerHTML = `
      <span class="label">${row.date}</span>
      <span>外資 ${fmtLots(row.foreignTotalNetLots)}</span>
      <span>投信 ${fmtLots(row.trustNetLots)}</span>
      <span>自營 ${fmtLots(row.dealerTotalNetLots)}</span>
      <span>合計 ${fmtLots(row.grandDaily)}</span>
      <span>三大法人合計累計 ${fmtLots(row.grandCumulative)}</span>
      <span>外資累計 ${fmtLots(row.foreignCumulative)}</span>
      <span>投信累計 ${fmtLots(row.trustCumulative)}</span>
    `;
  } else {
    chartInfoEl.innerHTML = `
      <span class="label">${row.date}</span>
      <span>${currentMetricLabel} ${fmtLots(row.metricDaily)}</span>
      <span>${currentMetricLabel}累計 ${fmtLots(row.metricCumulative)}</span>
    `;
  }
}

const chartInfoPlugin = {
  id: "chartInfo",
  afterEvent(chartInstance, args) {
    const event = args.event;
    if (event.type === "mousemove" || event.type === "mousedown") {
      const points = chartInstance.getElementsAtEventForMode(event, "index", { intersect: false }, true);
      if (points.length > 0 && points[0].index !== hoverState.index) {
        hoverState.index = points[0].index;
        updateChartInfo();
      }
    } else if (event.type === "mouseout") {
      if (hoverState.index !== null) {
        hoverState.index = null;
        updateChartInfo();
      }
    }
  },
};

function computeRecentRows() {
  const stockCode = stockSelect.value;
  const days = Number(summaryDaysSelect.value);

  const stockRows = allRows
    .filter(r => r.stockCode === stockCode)
    .sort((a, b) => a.date.localeCompare(b.date));

  const recent = stockRows.slice(-days);
  recentDatesSet = new Set(recent.map(r => r.date));
  return recent;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function loadData() {
  statusEl.textContent = "資料載入中...";
  const response = await fetch(API_URL, { cache: "no-store" });
  const data = await response.json();

  allRows = data.map(r => ({
    date: r.date,
    stockCode: r.stockCode,
    stockName: r.stockName,
    foreignTotalNet: num(r.foreignTotalNet),
    trustNet: num(r.trustNet),
    dealerTotalNet: num(r.dealerTotalNet),
    grandTotalNet: num(r.grandTotalNet),
    heldRatio: r.heldRatio === null || r.heldRatio === undefined ? null : num(r.heldRatio),
    foreignNetToIssuedRatio: r.foreignNetToIssuedRatio === null || r.foreignNetToIssuedRatio === undefined ? null : num(r.foreignNetToIssuedRatio),
  })).filter(r => r.date && r.stockCode);

  populateStockOptions();
  populateDateRange();
  render();
  renderSummary();
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

function populateDateRange() {
  const dates = allRows.map(r => r.date).sort();
  startDateInput.value = dates[0];
  endDateInput.value = dates[dates.length - 1];
  startDateInput.min = dates[0];
  startDateInput.max = dates[dates.length - 1];
  endDateInput.min = dates[0];
  endDateInput.max = dates[dates.length - 1];
}

function getFilteredRows() {
  const stockCode = stockSelect.value;
  const start = startDateInput.value;
  const end = endDateInput.value;

  return allRows
    .filter(r => r.stockCode === stockCode && r.date >= start && r.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function render() {
  computeRecentRows();
  const rows = getFilteredRows();
  const metric = METRIC_FIELDS[metricSelect.value];

  let grandCumulative = 0;
  let metricCumulative = 0;
  // 三大法人合計檢視模式下，折線圖除了三大法人合計累計，還要多疊外資、投信各自的累計線，
  // 所以這兩個也要單獨累加，不能只靠 metricCumulative(那個只會累加目前下拉選單選到的單一類別)。
  let foreignCumulative = 0;
  let trustCumulative = 0;
  const withComputed = rows.map(r => {
    const grandDaily = Math.round(r.grandTotalNet / 1000);
    grandCumulative += grandDaily;

    const metricDaily = Math.round(r[metric.field] / 1000);
    metricCumulative += metricDaily;

    const foreignTotalNetLots = Math.round(r.foreignTotalNet / 1000);
    const trustNetLots = Math.round(r.trustNet / 1000);
    foreignCumulative += foreignTotalNetLots;
    trustCumulative += trustNetLots;

    return {
      ...r,
      grandDaily,
      grandCumulative,
      metricDaily,
      metricCumulative,
      foreignTotalNetLots,
      trustNetLots,
      dealerTotalNetLots: Math.round(r.dealerTotalNet / 1000),
      foreignCumulative,
      trustCumulative,
    };
  });

  currentRows = withComputed;
  currentMetricKey = metricSelect.value;
  currentMetricLabel = metric.label;
  hoverState.index = null;

  renderChart(withComputed, metricSelect.value, metric.label);
  renderTable(withComputed);
  updateChartInfo();
}

function shortDate(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return y.slice(2) + m + d;
}

function renderChart(rows, metricKey, metricLabel) {
  const labels = rows.map(r => shortDate(r.date));
  const cumulativeData = rows.map(r => r.metricCumulative);

  let barDatasets;
  let stacked;

  if (metricKey === "grand") {
    // 三大法人合計：三色堆疊柱，個別呈現外資/投信/自營商當日買賣超的組成
    barDatasets = [
      {
        type: "bar",
        label: "外資買賣超(張)",
        data: rows.map(r => r.foreignTotalNetLots),
        backgroundColor: "#3498db",
        yAxisID: "y",
        stack: "daily",
      },
      {
        type: "bar",
        label: "投信買賣超(張)",
        data: rows.map(r => r.trustNetLots),
        backgroundColor: "#f39c12",
        yAxisID: "y",
        stack: "daily",
      },
      {
        type: "bar",
        label: "自營商買賣超(張)",
        data: rows.map(r => r.dealerTotalNetLots),
        backgroundColor: "#9b59b6",
        yAxisID: "y",
        stack: "daily",
      },
    ];
    stacked = true;
  } else {
    // 單一類別：紅漲綠跌的單色柱
    const dailyData = rows.map(r => r.metricDaily);
    const barColors = dailyData.map(v => v >= 0 ? "#c0392b" : "#27ae60");
    barDatasets = [
      {
        type: "bar",
        label: `${metricLabel}買賣超(張)`,
        data: dailyData,
        backgroundColor: barColors,
        yAxisID: "y",
      },
    ];
    stacked = false;
  }

  // 三大法人合計檢視模式下，折線圖多疊外資、投信各自的累計線(顏色跟柱狀圖的外資/投信配色
  // 對應，一眼看得出哪條線是哪個類別)；其他單一類別檢視模式維持原本只有一條累計線。
  const lineDatasets = metricKey === "grand"
    ? [
        {
          type: "line",
          label: "三大法人合計累計(張)",
          data: rows.map(r => r.grandCumulative),
          borderColor: "#2c3e50",
          backgroundColor: "#2c3e50",
          yAxisID: "y1",
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          type: "line",
          label: "外資累計(張)",
          data: rows.map(r => r.foreignCumulative),
          borderColor: "#3498db",
          backgroundColor: "#3498db",
          yAxisID: "y1",
          pointRadius: 0,
          borderWidth: 1.5,
          borderDash: [4, 4],
        },
        {
          type: "line",
          label: "投信累計(張)",
          data: rows.map(r => r.trustCumulative),
          borderColor: "#f39c12",
          backgroundColor: "#f39c12",
          yAxisID: "y1",
          pointRadius: 0,
          borderWidth: 1.5,
          borderDash: [4, 4],
        },
      ]
    : [
        {
          type: "line",
          label: `${metricLabel}累計買賣超(張)`,
          data: cumulativeData,
          borderColor: "#2c3e50",
          backgroundColor: "#2c3e50",
          yAxisID: "y1",
          pointRadius: 0,
          borderWidth: 2,
        },
      ];

  const config = {
    data: {
      labels,
      datasets: [...barDatasets, ...lineDatasets],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      // 關掉浮動 tooltip，數字改用上方固定的 chartInfo 資訊列顯示(見 updateChartInfo)。
      plugins: {
        tooltip: { enabled: false },
      },
      scales: {
        x: { stacked, ticks: { maxRotation: 90, minRotation: 90, autoSkip: true, maxTicksLimit: 30 } },
        y: {
          stacked,
          position: "left",
          title: { display: true, text: `${metricLabel}買賣超(張)` },
          // 0 那條橫軸線加粗、換成深色，買超(正)、賣超(負)一眼就能分出來。
          // Chart.js 內部第一次探測這個 scriptable option 時 ctx.tick 還沒準備好，要防呆。
          grid: {
            color: ctx => (ctx.tick && ctx.tick.value === 0) ? "#333333" : undefined,
            lineWidth: ctx => (ctx.tick && ctx.tick.value === 0) ? 2 : undefined,
          },
        },
        y1: { position: "right", title: { display: true, text: `${metricLabel}累計買賣超(張)` }, grid: { drawOnChartArea: false } },
      },
    },
    plugins: [chartInfoPlugin],
  };

  if (chart) {
    chart.destroy();
  }
  chart = new Chart(document.getElementById("chart"), config);
}

function renderTable(rows) {
  const cumulativeHeader = document.getElementById("cumulativeHeader");
  cumulativeHeader.textContent = rows.length > 0 ? `累計(${shortDate(rows[0].date)})` : "累計";

  tableBody.innerHTML = "";
  const reversed = [...rows].reverse();
  for (const r of reversed) {
    const tr = document.createElement("tr");
    if (recentDatesSet.has(r.date)) {
      tr.classList.add("highlight-row");
    }
    tr.innerHTML = `
      <td>${r.date}</td>
      <td>${r.stockCode}</td>
      <td>${r.stockName}</td>
      <td class="${r.foreignTotalNetLots >= 0 ? 'positive' : 'negative'}">${r.foreignTotalNetLots.toLocaleString()}</td>
      <td class="${r.trustNetLots >= 0 ? 'positive' : 'negative'}">${r.trustNetLots.toLocaleString()}</td>
      <td class="${r.dealerTotalNetLots >= 0 ? 'positive' : 'negative'}">${r.dealerTotalNetLots.toLocaleString()}</td>
      <td class="${r.grandDaily >= 0 ? 'positive' : 'negative'}">${r.grandDaily.toLocaleString()}</td>
      <td>${r.heldRatio === null ? '-' : r.heldRatio.toFixed(2) + '%'}</td>
      <td class="${r.foreignNetToIssuedRatio === null ? '' : (r.foreignNetToIssuedRatio >= 0 ? 'positive' : 'negative')}">${r.foreignNetToIssuedRatio === null ? '-' : r.foreignNetToIssuedRatio.toFixed(3) + '%'}</td>
      <td>${r.grandCumulative.toLocaleString()}</td>
    `;
    tableBody.appendChild(tr);
  }
}

function renderSummary() {
  const recent = computeRecentRows();

  if (recent.length === 0) {
    summaryRangeEl.textContent = "無資料";
    for (const el of [summaryForeignEl, summaryTrustEl, summaryDealerEl, summaryGrandEl]) {
      el.textContent = "";
      el.className = "";
    }
    return;
  }

  const sumLots = (field) => Math.round(recent.reduce((acc, r) => acc + r[field], 0) / 1000);

  summaryRangeEl.textContent = "合計";
  setSummaryCell(summaryForeignEl, sumLots("foreignTotalNet"));
  setSummaryCell(summaryTrustEl, sumLots("trustNet"));
  setSummaryCell(summaryDealerEl, sumLots("dealerTotalNet"));
  setSummaryCell(summaryGrandEl, sumLots("grandTotalNet"));
}

function setSummaryCell(el, value) {
  el.textContent = value.toLocaleString();
  el.className = value >= 0 ? "positive" : "negative";
}

stockSelect.addEventListener("change", render);
stockSelect.addEventListener("change", renderSummary);
startDateInput.addEventListener("change", render);
endDateInput.addEventListener("change", render);
metricSelect.addEventListener("change", render);
summaryDaysSelect.addEventListener("change", render);
summaryDaysSelect.addEventListener("change", renderSummary);

loadData().catch(err => {
  statusEl.textContent = "資料載入失敗：" + err.message;
  console.error(err);
});
