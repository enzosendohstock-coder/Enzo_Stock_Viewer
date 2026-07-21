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

const METRIC_FIELDS = {
  grand: { field: "grandTotalNet", label: "三大法人合計" },
  foreign: { field: "foreignTotalNet", label: "外資" },
  trust: { field: "trustNet", label: "投信" },
  dealer: { field: "dealerTotalNet", label: "自營商" },
};

let allRows = [];
let chart = null;
let recentDatesSet = new Set();

// tooltip 預設會跟著滑鼠游標的 x/y 一起移動，滑鼠移到圖表中段時常常擋住當下正在看的資料點。
// 註冊一個自訂定位方式：x 還是跟著滑鼠對到的那個資料點(這樣才知道游標指到哪一天)，
// y 固定貼在繪圖區上緣，不會再遮住下面的線/柱狀圖。
Chart.Tooltip.positioners.top = function (items, eventPosition) {
  // 用一般 function(不是箭頭函式)是為了讓 this 正確綁定成 Chart.js 呼叫時傳進來的 tooltip 實例，
  // this.chart 是官方文件記載的存取方式。
  const x = items.length ? items[0].element.x : eventPosition.x;
  return { x, y: this.chart.chartArea.top + 10 };
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

  renderChart(withComputed, metricSelect.value, metric.label);
  renderTable(withComputed);
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
      // tooltip 固定貼在圖表上緣(用上面註冊的自訂定位方式)，不會再跟著滑鼠垂直移動、擋住資料。
      plugins: {
        tooltip: { position: "top" },
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
