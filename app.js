const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQg5xpvCM9c59fxG_wN6cGmsqrYtnzRn7d77gE3_QjZehcFOlOiyYtTKNxx0jM1zy-hQnb73z18cFoX/pub?gid=0&single=true&output=csv";

const statusEl = document.getElementById("status");
const stockSelect = document.getElementById("stockSelect");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
const tableBody = document.querySelector("#dataTable tbody");

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

  let cumulative = 0;
  const withComputed = rows.map(r => {
    const daily = Math.round(r.grandTotalNet / 1000);
    cumulative += daily;
    return {
      ...r,
      daily,
      cumulative,
      foreignTotalNetLots: Math.round(r.foreignTotalNet / 1000),
      trustNetLots: Math.round(r.trustNet / 1000),
      dealerTotalNetLots: Math.round(r.dealerTotalNet / 1000),
    };
  });

  renderChart(withComputed);
  renderTable(withComputed);
}

function shortDate(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return y.slice(2) + m + d;
}

function renderChart(rows) {
  const labels = rows.map(r => shortDate(r.date));
  const dailyData = rows.map(r => r.daily);
  const cumulativeData = rows.map(r => r.cumulative);
  const barColors = dailyData.map(v => v >= 0 ? "#c0392b" : "#27ae60");

  const config = {
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: "買賣超(張)",
          data: dailyData,
          backgroundColor: barColors,
          yAxisID: "y",
        },
        {
          type: "line",
          label: "累計買賣超(張)",
          data: cumulativeData,
          borderColor: "#2980b9",
          backgroundColor: "#2980b9",
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
        x: { ticks: { maxRotation: 90, minRotation: 90, autoSkip: true, maxTicksLimit: 30 } },
        y: { position: "left", title: { display: true, text: "買賣超(張)" } },
        y1: { position: "right", title: { display: true, text: "累計買賣超(張)" }, grid: { drawOnChartArea: false } },
      },
    },
  };

  if (chart) {
    chart.data = config.data;
    chart.update();
  } else {
    chart = new Chart(document.getElementById("chart"), config);
  }
}

function renderTable(rows) {
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
      <td class="${r.daily >= 0 ? 'positive' : 'negative'}">${r.daily.toLocaleString()}</td>
      <td>${r.cumulative.toLocaleString()}</td>
    `;
    tableBody.appendChild(tr);
  }
}

stockSelect.addEventListener("change", render);
startDateInput.addEventListener("change", render);
endDateInput.addEventListener("change", render);

loadData().catch(err => {
  statusEl.textContent = "資料載入失敗：" + err.message;
  console.error(err);
});
