const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQg5xpvCM9c59fxG_wN6cGmsqrYtnzRn7d77gE3_QjZehcFOlOiyYtTKNxx0jM1zy-hQnb73z18cFoX/pub?gid=0&single=true&output=csv";

const statusEl = document.getElementById("status");
const stockSelect = document.getElementById("stockSelect");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
const metricSelect = document.getElementById("metricSelect");
const tableBody = document.querySelector("#dataTable tbody");

const METRIC_FIELDS = {
  grand: { field: "grandTotalNet", label: "三大法人合計" },
  foreign: { field: "foreignTotalNet", label: "外資" },
  trust: { field: "trustNet", label: "投信" },
  dealer: { field: "dealerTotalNet", label: "自營商" },
};

let allRows = [];
let chart = null;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function loadData() {
  statusEl.textContent = "資料載入中...";
  const response = await fetch(CSV_URL, { cache: "no-store" });
  const text = await response.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });

  allRows = parsed.data.map(r => ({
    date: r.Date,
    stockCode: r.StockCode,
    stockName: r.StockName,
    foreignTotalNet: num(r.ForeignTotalNet),
    trustNet: num(r.TrustNet),
    dealerTotalNet: num(r.DealerTotalNet),
    grandTotalNet: num(r.GrandTotalNet),
  })).filter(r => r.date && r.stockCode);

  populateStockOptions();
  populateDateRange();
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
  const rows = getFilteredRows();
  const metric = METRIC_FIELDS[metricSelect.value];

  let grandCumulative = 0;
  let metricCumulative = 0;
  const withComputed = rows.map(r => {
    const grandDaily = Math.round(r.grandTotalNet / 1000);
    grandCumulative += grandDaily;

    const metricDaily = Math.round(r[metric.field] / 1000);
    metricCumulative += metricDaily;

    return {
      ...r,
      grandDaily,
      grandCumulative,
      metricDaily,
      metricCumulative,
      foreignTotalNetLots: Math.round(r.foreignTotalNet / 1000),
      trustNetLots: Math.round(r.trustNet / 1000),
      dealerTotalNetLots: Math.round(r.dealerTotalNet / 1000),
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

  const config = {
    data: {
      labels,
      datasets: [
        ...barDatasets,
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
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { stacked, ticks: { maxRotation: 90, minRotation: 90, autoSkip: true, maxTicksLimit: 30 } },
        y: { stacked, position: "left", title: { display: true, text: `${metricLabel}買賣超(張)` } },
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
    tr.innerHTML = `
      <td>${r.date}</td>
      <td>${r.stockCode}</td>
      <td>${r.stockName}</td>
      <td class="${r.foreignTotalNetLots >= 0 ? 'positive' : 'negative'}">${r.foreignTotalNetLots.toLocaleString()}</td>
      <td class="${r.trustNetLots >= 0 ? 'positive' : 'negative'}">${r.trustNetLots.toLocaleString()}</td>
      <td class="${r.dealerTotalNetLots >= 0 ? 'positive' : 'negative'}">${r.dealerTotalNetLots.toLocaleString()}</td>
      <td class="${r.grandDaily >= 0 ? 'positive' : 'negative'}">${r.grandDaily.toLocaleString()}</td>
      <td>${r.grandCumulative.toLocaleString()}</td>
    `;
    tableBody.appendChild(tr);
  }
}

stockSelect.addEventListener("change", render);
startDateInput.addEventListener("change", render);
endDateInput.addEventListener("change", render);
metricSelect.addEventListener("change", render);

loadData().catch(err => {
  statusEl.textContent = "資料載入失敗：" + err.message;
  console.error(err);
});
