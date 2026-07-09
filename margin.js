const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQpoDsNpSVGb9vVba-4yjbFWNYFckQV0BUwa28nTJDbHzP7jj2WTikUCI4qH0XDya9Yi0r8yZrXVVy3/pub?gid=0&single=true&output=csv";

const statusEl = document.getElementById("status");
const stockSelect = document.getElementById("stockSelect");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
const metricSelect = document.getElementById("metricSelect");
const tableBody = document.querySelector("#dataTable tbody");

// Google Sheet 裡所有欄位統一都是「股」，畫面呈現時一律除以 1000 換算成張，
// 跟三大法人買賣超那頁(app.js)的做法一致，不用記哪些欄位單位不一樣。
const METRIC_FIELDS = {
  margin: { field: "marginBalance", quotaField: "marginQuota", label: "融資餘額" },
  short: { field: "shortBalance", quotaField: "shortQuota", label: "融券餘額" },
  offsetting: { field: "offsetting", quotaField: null, label: "資券相抵(當沖)" },
  sbl: { field: "sblBalance", quotaField: "sblQuota", label: "借券賣出餘額" },
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
    marginBalance: num(r.MarginBalance),
    marginQuota: num(r.MarginQuota),
    shortBalance: num(r.ShortBalance),
    shortQuota: num(r.ShortQuota),
    offsetting: num(r.Offsetting),
    sblBalance: num(r.SblBalance),
    sblQuota: num(r.SblQuota),
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

  renderChart(rows, metric);
  renderTable(rows);
}

function shortDate(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return y.slice(2) + m + d;
}

function renderChart(rows, metric) {
  const labels = rows.map(r => shortDate(r.date));
  const lots = rows.map(r => Math.round(r[metric.field] / 1000));

  let datasets;
  let scales;

  if (metric.quotaField) {
    // 餘額類指標(融資/融券/借券)：本身是「某個時間點的存量」，用線圖呈現水位變化，
    // 右側副座標軸疊加使用率(餘額/限額)，跟股票 App 常見的借券餘額走勢圖呈現方式一致。
    const utilization = rows.map(r => {
      const quota = r[metric.quotaField];
      return quota > 0 ? Number(((r[metric.field] / quota) * 100).toFixed(1)) : 0;
    });

    datasets = [
      {
        type: "line",
        label: `${metric.label}(張)`,
        data: lots,
        borderColor: "#2c3e50",
        backgroundColor: "#2c3e50",
        yAxisID: "y",
        pointRadius: 0,
        borderWidth: 2,
      },
      {
        type: "line",
        label: "使用率(%)",
        data: utilization,
        borderColor: "#e67e22",
        backgroundColor: "#e67e22",
        yAxisID: "y1",
        pointRadius: 0,
        borderWidth: 1,
        borderDash: [4, 4],
      },
    ];
    scales = {
      x: { ticks: { maxRotation: 90, minRotation: 90, autoSkip: true, maxTicksLimit: 30 } },
      y: { position: "left", title: { display: true, text: `${metric.label}(張)` } },
      y1: { position: "right", title: { display: true, text: "使用率(%)" }, grid: { drawOnChartArea: false } },
    };
  } else {
    // 資券相抵(當沖)：每天各自獨立的量，不是累積存量，用柱狀圖呈現比較直覺。
    datasets = [
      {
        type: "bar",
        label: `${metric.label}(張)`,
        data: lots,
        backgroundColor: "#3498db",
        yAxisID: "y",
      },
    ];
    scales = {
      x: { ticks: { maxRotation: 90, minRotation: 90, autoSkip: true, maxTicksLimit: 30 } },
      y: { position: "left", title: { display: true, text: `${metric.label}(張)` } },
    };
  }

  const config = {
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales,
    },
  };

  if (chart) {
    chart.destroy();
  }
  chart = new Chart(document.getElementById("chart"), config);
}

function renderTable(rows) {
  tableBody.innerHTML = "";
  const reversed = [...rows].reverse();
  for (const r of reversed) {
    const marginRate = r.marginQuota > 0 ? ((r.marginBalance / r.marginQuota) * 100).toFixed(1) : "-";
    const shortRate = r.shortQuota > 0 ? ((r.shortBalance / r.shortQuota) * 100).toFixed(1) : "-";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.date}</td>
      <td>${r.stockCode}</td>
      <td>${r.stockName}</td>
      <td>${Math.round(r.marginBalance / 1000).toLocaleString()}</td>
      <td>${marginRate === "-" ? "-" : marginRate + "%"}</td>
      <td>${Math.round(r.shortBalance / 1000).toLocaleString()}</td>
      <td>${shortRate === "-" ? "-" : shortRate + "%"}</td>
      <td>${Math.round(r.offsetting / 1000).toLocaleString()}</td>
      <td>${Math.round(r.sblBalance / 1000).toLocaleString()}</td>
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
