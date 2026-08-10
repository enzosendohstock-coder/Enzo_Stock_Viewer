const API_URL = "https://ppi-stock-worker.enzosendohstock.workers.dev/api/monthly-revenue";

const statusEl = document.getElementById("status");
const stockSelect = document.getElementById("stockSelect");
const startMonthInput = document.getElementById("startMonth");
const endMonthInput = document.getElementById("endMonth");
const metricSelect = document.getElementById("metricSelect");
const chartInfoEl = document.getElementById("chartInfo");
const tableBody = document.querySelector("#dataTable tbody");

let allRows = [];
let chart = null;
let currentRows = [];

// 跟三大法人買賣超那頁(app.js)同一套做法：不用浮動 tooltip，改成圖表上方固定的資訊列，
// 跟著滑鼠十字準線即時更新。hoverState 是模組層級狀態，不掛在 chart instance 上。
const hoverState = { index: null };

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

// 圖表預設顯示「往前 5 年的 1 月」開始，不是一開啟就攤開全部歷史(回補到 2010 年的話會有
// 190+ 個月)。不是固定 60 個月的滾動視窗，是固定錨在「今年-5」的 1 月——例如今天是 2026 年，
// 不管現在幾月，預設起點都是 2021-01，這樣每年切過年就會自然往後挪一年，而不是每次都精準
// 往回數 60 個月結果卡在某個月中間。完整歷史還在，min/max 開放到全部範圍，
// 使用者可以自己用上面的日期選擇器拉開來看。
function defaultStartYearMonth() {
  const currentYear = new Date().getFullYear();
  return `${currentYear - 5}-01`;
}

// 日期元件跟個股股價頁面統一都用原生的 <input type="date">，不是 <input type="month">——
// yearMonth 存的是 'yyyy-MM'，這裡固定補上 "-01" 當作每月第一天存進 date input。
function populateMonthRange() {
  // 一定要先去重複：allRows 是整個 Watchlist 所有股票的資料列，同一個年月會因為不同股票
  // 各出現一次，不去重複的話「近 5 年」會變成「近 60 筆列」，跟真正的月份數對不上。
  const months = [...new Set(allRows.map(r => r.yearMonth))].sort();
  const earliest = months[0];
  const latest = months[months.length - 1];

  // 「今年-5」的1月可能比實際最早的資料還早(例如這支股票只回補到某個較晚的年份)，
  // 這種情況下退而求其次，從實際最早的資料月份開始，不會超出資料範圍去顯示空白區間。
  const defaultStart = defaultStartYearMonth() < earliest ? earliest : defaultStartYearMonth();

  startMonthInput.value = `${defaultStart}-01`;
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
  currentRows = rows;
  hoverState.index = null;
  renderChart(rows);
  renderTable(rows);
  updateChartInfo();
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
  revenue: { label: "當月營收(億元)", type: "bar", color: "#3498db", field: r => r.revenue },
  cumulative: { label: "累計營收(億元，每年1月歸零)", type: "line", color: "#e67e22", field: r => r.cumulativeRevenue },
};

const HOVER_SELF_COLOR = "#c0392b";      // 滑鼠指到的那個點本身
const HOVER_SAME_MONTH_COLOR = "#e74c3c"; // 其他年份、同一個月的點

function swatch(color) {
  return `<span class="swatch" style="background:${color}"></span>`;
}

function lineSwatch(color) {
  return `<span class="line-swatch" style="border-color:${color}"></span>`;
}

// 原始資料是千元，全站金額改用「億」當單位比較好讀(1億 = 100,000 千元)。
function toYi(v) {
  return v / 100000;
}

function fmtYi(v, decimals = 2) {
  return v == null ? "-" : toYi(v).toFixed(decimals);
}

function fmtPctSpan(v) {
  if (v === null) {
    return "-";
  }
  const cls = v >= 0 ? "positive" : "negative";
  return `<span class="${cls}">${v.toFixed(2)}%</span>`;
}

// 同月比較每一列格式：yyyy/MM(金額億, 相對基準月的增減%)。日期跟金額(含增減%)用不同顏色區分，
// 基準一律是滑鼠目前指到的那個月，不是官方的 YoY(那是固定跟去年比，這裡的比較對象可以是任何年份)。
function formatCompareEntry(baseValue, r) {
  const dateText = r.yearMonth.replace("-", "/");
  const amountText = fmtYi(r.cumulativeRevenue);
  const pct = baseValue > 0 ? ((r.cumulativeRevenue - baseValue) / baseValue) * 100 : null;
  const pctText = pct === null ? "-" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
  const cls = pct === null ? "" : (pct >= 0 ? "positive" : "negative");
  return `<span class="compare-entry"><span class="compare-date">${dateText}</span><span class="${cls}">(${amountText}億, ${pctText})</span></span>`;
}

// 不用浮動 tooltip，改成這個固定資訊列：沒有滑鼠指到任何點時，預設顯示最新一筆(跟
// stock-price.html/app.js 同樣的預設行為)。累計營收模式下額外列出「同月不同年」的比較數字，
// 跟圖上變色的點呼應——不用只靠肉眼比對點的高低，直接把數字列出來對照。
function updateChartInfo() {
  const index = hoverState.index ?? currentRows.length - 1;
  const row = currentRows[index];
  if (!row) {
    chartInfoEl.innerHTML = "";
    return;
  }

  const metric = METRIC_CONFIG[metricSelect.value];

  if (metricSelect.value !== "cumulative") {
    chartInfoEl.innerHTML = `
      <div class="chart-info-legend">
        <span class="label">${row.yearMonth}</span>
        ${swatch(metric.color)}<span>當月營收(億元)</span>
      </div>
      <div class="chart-info-row">
        <span>當月營收 ${fmtYi(row.revenue)}億</span>
        <span>MoM ${fmtPctSpan(row.momPercent)}</span>
        <span>YoY ${fmtPctSpan(row.yoyPercent)}</span>
      </div>
    `;
    return;
  }

  const hoverMonth = row.yearMonth.slice(5, 7);
  const sameMonthRows = currentRows
    .filter(r => r.yearMonth.slice(5, 7) === hoverMonth && r.yearMonth !== row.yearMonth)
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  const compareHtml = sameMonthRows.length > 0
    ? sameMonthRows.map(r => formatCompareEntry(row.cumulativeRevenue, r)).join("")
    : "<span>(目前範圍內沒有其他年份同月資料)</span>";

  chartInfoEl.innerHTML = `
    <div class="chart-info-legend">
      <span class="label">${row.yearMonth}</span>
      ${lineSwatch(metric.color)}<span>累計營收(億元，每年1月歸零)</span>
    </div>
    <div class="chart-info-row">
      <span class="row-label">當期</span>
      <span>累計營收 ${fmtYi(row.cumulativeRevenue)}億</span>
      <span>累計YoY ${fmtPctSpan(row.cumulativeYoyPercent)}</span>
    </div>
    <div class="chart-info-row">
      <span class="row-label">同月比較</span>
      ${compareHtml}
    </div>
  `;
}

// 累計營收模式專用：滑鼠移到某個月的點時，把其他年份「同一個月」的點變色，
// 再用這個外掛畫一條水平參考線，方便直接比對「跨年度同月份累計營收」的差異。
// 只在累計營收(折線)模式生效，柱狀圖(當月營收)沒有「點」，這個比對方式不適用。
// 同一個外掛也負責在滑鼠移動/離開時更新上方的固定資訊列(取代 Chart.js 內建 tooltip)。
const chartInfoPlugin = {
  id: "chartInfo",
  afterEvent(chartInstance, args) {
    const event = args.event;
    if (event.type === "mousemove" || event.type === "mousedown") {
      const points = chartInstance.getElementsAtEventForMode(event, "index", { intersect: false }, true);
      if (points.length > 0 && points[0].index !== hoverState.index) {
        hoverState.index = points[0].index;
        updateChartInfo();
        chartInstance.update("none");
      }
    } else if (event.type === "mouseout") {
      if (hoverState.index !== null) {
        hoverState.index = null;
        updateChartInfo();
        chartInstance.update("none");
      }
    }
  },
  afterDatasetsDraw(chartInstance) {
    // 水平參考線只在累計營收(折線)模式畫，跟同月變色點是同一套比對邏輯，
    // 當月營收(柱狀圖)沒有這個「跨年同月比較」的概念，不該出現這條線。
    if (metricSelect.value !== "cumulative") {
      return;
    }
    const index = hoverState.index;
    if (index == null) {
      return;
    }
    const meta = chartInstance.getDatasetMeta(0);
    const point = meta.data[index];
    if (!point) {
      return;
    }

    const { ctx, chartArea } = chartInstance;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#999999";
    ctx.beginPath();
    ctx.moveTo(chartArea.left, point.y);
    ctx.lineTo(chartArea.right, point.y);
    ctx.stroke();
    ctx.restore();
  },
};
Chart.register(chartInfoPlugin);

function renderChart(rows) {
  const labels = rows.map(r => r.yearMonth);
  const metric = METRIC_CONFIG[metricSelect.value];
  const values = rows.map(r => Math.round(toYi(metric.field(r)) * 100) / 100); // 千元 -> 億元(保留2位小數)
  const isCumulative = metricSelect.value === "cumulative";

  function pointColor(context) {
    const hoverIndex = hoverState.index;
    // Chart.js 除了每個點各自呼叫一次，也會在「整個 dataset 的預設樣式」這層呼叫一次
    // (這時候沒有 dataIndex)，這裡要先擋掉，不然 labels[undefined] 會直接炸掉。
    if (hoverIndex == null || context.dataIndex == null) {
      return metric.color;
    }
    if (context.dataIndex === hoverIndex) {
      return HOVER_SELF_COLOR;
    }
    const hoverMonth = labels[hoverIndex].slice(5, 7);
    const thisMonth = labels[context.dataIndex].slice(5, 7);
    return thisMonth === hoverMonth ? HOVER_SAME_MONTH_COLOR : metric.color;
  }

  function pointRadius(context) {
    const hoverIndex = hoverState.index;
    if (hoverIndex == null || context.dataIndex == null) {
      return 0;
    }
    if (context.dataIndex === hoverIndex) {
      return 5;
    }
    const hoverMonth = labels[hoverIndex].slice(5, 7);
    const thisMonth = labels[context.dataIndex].slice(5, 7);
    return thisMonth === hoverMonth ? 5 : 0;
  }

  const config = {
    data: {
      labels,
      datasets: [
        {
          type: metric.type,
          label: metric.label,
          data: values,
          backgroundColor: isCumulative ? pointColor : metric.color,
          borderColor: metric.color,
          pointBackgroundColor: isCumulative ? pointColor : undefined,
          pointBorderColor: isCumulative ? pointColor : undefined,
          pointRadius: isCumulative ? pointRadius : (metric.type === "line" ? 0 : undefined),
          borderWidth: metric.type === "line" ? 2 : undefined,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      // 關掉浮動 tooltip 跟內建圖例，改成上方固定的 chartInfo 資訊列處理(chartInfoPlugin)。
      plugins: {
        tooltip: { enabled: false },
        legend: { display: false },
      },
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
      <td>${fmtYi(r.revenue)}</td>
      <td class="${pctClass(r.momPercent)}">${pct(r.momPercent)}</td>
      <td class="${pctClass(r.yoyPercent)}">${pct(r.yoyPercent)}</td>
      <td>${fmtYi(r.cumulativeRevenue)}</td>
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
