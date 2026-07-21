const API_URL = "https://ppi-stock-worker.enzosendohstock.workers.dev/api/stock-price";

const statusEl = document.getElementById("status");
const stockSelect = document.getElementById("stockSelect");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
const tableBody = document.querySelector("#dataTable tbody");

let allRows = [];
let priceChart = null;
let volumeChart = null;

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
    open: num(r.open),
    high: num(r.high),
    low: num(r.low),
    close: num(r.close),
    change: num(r.change),
    volume: num(r.volume),
    turnoverValue: num(r.turnoverValue),
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
  renderPriceChart(rows);
  renderVolumeChart(rows);
  renderTable(rows);
}

// 股價、成交量分成兩個獨立的 canvas 上下疊放，而不是疊在同一個繪圖區塊用左右副座標軸——
// Chart.js 沒有子圖功能，疊在同一區塊的話成交量的柱狀圖會直接蓋在蠟燭圖上面，混在一起很難看，
// 一般股票 App 都是上下分開兩塊，這裡照同樣的呈現方式做。兩張圖共用同一組 x 軸日期範圍，
// 上面的股價圖故意不顯示 x 軸刻度文字，靠下面成交量圖的刻度對齊，看起來像同一張圖的兩個區塊。
function renderPriceChart(rows) {
  const candleData = rows.map(r => ({
    x: new Date(r.date).getTime(),
    o: r.open,
    h: r.high,
    l: r.low,
    c: r.close,
  }));

  const config = {
    data: {
      datasets: [
        {
          type: "candlestick",
          label: "股價",
          data: candleData,
          // 這裡只有蠟燭圖一種 dataset，理論上 FinancialController 的 parsing:false 預設值
          // 應該就夠了，但保險起見還是明確指定，避免又出現 Y 軸算不出範圍、蠟燭圖完全不顯示的狀況。
          parsing: false,
          // 紅漲綠跌，跟台灣的慣例一致(套件預設是西方的綠漲紅跌，要覆寫)。
          backgroundColors: { up: "#c0392b", down: "#27ae60", unchanged: "#999999" },
          borderColors: { up: "#c0392b", down: "#27ae60", unchanged: "#999999" },
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: "timeseries",
          time: { unit: "day" },
          ticks: { display: false },
          grid: { display: false },
        },
        y: { position: "left", title: { display: true, text: "股價" } },
      },
    },
  };

  if (priceChart) {
    priceChart.destroy();
  }
  priceChart = new Chart(document.getElementById("chart"), config);
}

function renderVolumeChart(rows) {
  // 成交量原始單位是股，換算成張跟其他頁面的做法一致。
  const volumeData = rows.map(r => ({
    x: new Date(r.date).getTime(),
    y: Math.round(r.volume / 1000),
  }));

  const config = {
    data: {
      datasets: [
        {
          type: "bar",
          label: "成交量(張)",
          data: volumeData,
          backgroundColor: "#3498db",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: "timeseries",
          time: { unit: "day" },
          ticks: { maxRotation: 90, minRotation: 90, autoSkip: true, maxTicksLimit: 30 },
        },
        y: { position: "left", title: { display: true, text: "成交量(張)" } },
      },
    },
  };

  if (volumeChart) {
    volumeChart.destroy();
  }
  volumeChart = new Chart(document.getElementById("volumeChart"), config);
}

function renderTable(rows) {
  tableBody.innerHTML = "";
  const reversed = [...rows].reverse();
  for (const r of reversed) {
    const lots = Math.round(r.volume / 1000);
    const yi = (r.turnoverValue / 1e8).toFixed(2);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.date}</td>
      <td>${r.open.toFixed(2)}</td>
      <td>${r.high.toFixed(2)}</td>
      <td>${r.low.toFixed(2)}</td>
      <td>${r.close.toFixed(2)}</td>
      <td class="${r.change >= 0 ? 'positive' : 'negative'}">${r.change.toFixed(2)}</td>
      <td>${lots.toLocaleString()}</td>
      <td>${yi}</td>
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
