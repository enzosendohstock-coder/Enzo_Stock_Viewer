const API_URL = "https://ppi-stock-worker.enzosendohstock.workers.dev/api/stock-price";

const statusEl = document.getElementById("status");
const stockSelect = document.getElementById("stockSelect");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
const tableBody = document.querySelector("#dataTable tbody");
const priceInfoEl = document.getElementById("priceInfo");
const volumeInfoEl = document.getElementById("volumeInfo");

let allRows = [];
let currentRows = [];
let priceChart = null;
let volumeChart = null;

// 股價、成交量的 Y 軸數字長度差很多(股價 4 位數 vs 成交量帶千分位逗號可能到 6~7 位數)，
// 兩張圖各自根據自己的文字寬度決定繪圖區域起始位置，寬度不一樣就會對不齊。
// 強制兩邊的 Y 軸固定同一個寬度，不管文字內容多長，兩張圖的繪圖區域就一定會對齊。
const Y_AXIS_WIDTH = 70;
function fixYAxisWidth(scale) {
  scale.width = Y_AXIS_WIDTH;
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

// 跟 institutional.html/margin.html 的圖表日期格式一致(西元年後兩碼+MMdd，例如 260721)。
function shortDate(timestamp) {
  const d = new Date(timestamp);
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + m + day;
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
  currentRows = rows;
  crosshairState.index = null;
  renderPriceChart(rows);
  renderVolumeChart(rows);
  renderTable(rows);
  updateInfoPanels();
}

// 開高低收、成交量的數字固定顯示在圖表上方/下方(而不是滑鼠移過去才彈出的浮動 tooltip)，
// 跟著十字準線即時更新；沒有滑鼠停留(index 是 null)時預設顯示最新一天的數字。
function updateInfoPanels() {
  const index = crosshairState.index ?? currentRows.length - 1;
  const row = currentRows[index];
  if (!row) {
    priceInfoEl.innerHTML = "";
    volumeInfoEl.innerHTML = "";
    return;
  }

  // 紅漲綠跌套用到整排開高低收+漲跌，不是只有漲跌那個數字，跟台股常見的報價呈現方式一致。
  const changeClass = row.change >= 0 ? "positive" : "negative";
  const changeSign = row.change > 0 ? "+" : "";
  // 漲跌幅% = 漲跌 ÷ 前一日收盤價(= 今日收盤價 - 漲跌) × 100。
  const prevClose = row.close - row.change;
  const changePercent = prevClose !== 0 ? (row.change / prevClose) * 100 : 0;
  priceInfoEl.innerHTML = `
    <span class="label">${row.date}</span>
    <span class="${changeClass}">開 ${row.open.toFixed(2)}</span>
    <span class="${changeClass}">高 ${row.high.toFixed(2)}</span>
    <span class="${changeClass}">低 ${row.low.toFixed(2)}</span>
    <span class="${changeClass}">收 ${row.close.toFixed(2)}</span>
    <span class="${changeClass}">漲跌 ${changeSign}${row.change.toFixed(2)} (${changeSign}${changePercent.toFixed(2)}%)</span>
  `;

  const lots = Math.round(row.volume / 1000);
  const yi = (row.turnoverValue / 1e8).toFixed(2);
  volumeInfoEl.innerHTML = `
    <span class="label">成交量</span>
    <span>${lots.toLocaleString()} 張</span>
    <span>${yi} 億元</span>
  `;
}

// 十字準線：股價圖跟成交量圖是兩個獨立的 Chart 實例，滑鼠移到任一張圖上時，
// 用同一個共用的 index 狀態同步在兩張圖上畫垂直線指到同一天，股價圖上再加一條
// 水平線標出滑鼠對應那天的價位(實際數字改看上方固定的資訊列，不用另外畫價格標籤)。
const crosshairState = { index: null };

// 更新完共用狀態後，「觸發事件的這張圖」用 args.changed = true 請 Chart.js 自己重繪
// (官方建議的做法)，「另一張圖」則要自己手動重繪，但不能在事件處理中同步呼叫 draw()——
// 這張圖當下還在處理事件的過程中，同步重繪會打斷 Chart.js 自己的內部流程，觀察到的現象是
// 事件被重複觸發、crosshairState 又被重置回 null，改用 requestAnimationFrame 延後到下一影格。
function syncOtherChart(current) {
  const other = current === priceChart ? volumeChart : priceChart;
  if (other) {
    requestAnimationFrame(() => other.draw());
  }
}

const crosshairPlugin = {
  id: "crosshair",
  afterEvent(chart, args) {
    const event = args.event;
    if (event.type === "mousemove" || event.type === "mousedown") {
      const points = chart.getElementsAtEventForMode(event, "index", { intersect: false }, true);
      if (points.length > 0 && points[0].index !== crosshairState.index) {
        crosshairState.index = points[0].index;
        args.changed = true;
        syncOtherChart(chart);
        updateInfoPanels();
      }
    } else if (event.type === "mouseout") {
      if (crosshairState.index !== null) {
        crosshairState.index = null;
        args.changed = true;
        syncOtherChart(chart);
        updateInfoPanels();
      }
    }
  },
  afterDraw(chart) {
    const index = crosshairState.index;
    if (index === null) return;

    const meta = chart.getDatasetMeta(0);
    const point = meta.data[index];
    if (!point) return;

    const { ctx, chartArea } = chart;
    const x = point.x;

    ctx.save();
    ctx.strokeStyle = "#7f8c8d";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();

    // 水平線只在股價圖畫，成交量圖只需要對到同一天的垂直線。實際數字改看上方固定的
    // 資訊列(updateInfoPanels)，不用再另外畫一個浮動的價格標籤框。
    if (chart === priceChart) {
      const row = currentRows[index];
      if (row) {
        const y = chart.scales.y.getPixelForValue(row.close);

        ctx.beginPath();
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.right, y);
        ctx.stroke();
      }
    }

    ctx.restore();
  },
};

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
      interaction: { mode: "index", intersect: false },
      // 開高低收改用上方固定的資訊列顯示(updateInfoPanels)，不需要浮動 tooltip 跟圖例了。
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          type: "timeseries",
          time: { unit: "day" },
          ticks: { display: false },
          grid: { display: false },
        },
        y: { position: "left", title: { display: true, text: "股價" }, afterFit: fixYAxisWidth },
      },
    },
    plugins: [crosshairPlugin],
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
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          type: "timeseries",
          time: { unit: "day" },
          ticks: {
            maxRotation: 90,
            minRotation: 90,
            autoSkip: true,
            maxTicksLimit: 30,
            callback: value => shortDate(value),
          },
        },
        y: { position: "left", title: { display: true, text: "成交量(張)" }, afterFit: fixYAxisWidth },
      },
    },
    plugins: [crosshairPlugin],
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
