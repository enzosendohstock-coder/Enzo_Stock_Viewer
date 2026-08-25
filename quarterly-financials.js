const API_URL = "https://ppi-stock-worker.enzosendohstock.workers.dev/api/quarterly-financials";

const statusEl = document.getElementById("status");
const stockSelect = document.getElementById("stockSelect");
const stockSuggestionsEl = document.getElementById("stockSuggestions");
const tableBody = document.querySelector("#dataTable tbody");

let allRows = [];
let chart = null;

// 股票代號欄位是文字輸入(可以打代號或名稱)+ 自動完成建議清單，共用邏輯見 stock-autocomplete.js。
let codeToStock = new Map();
let currentStockCode = null;

setupStockAutocomplete({
  inputEl: stockSelect,
  suggestionsEl: stockSuggestionsEl,
  getEntries: () => [...codeToStock].map(([code, name]) => ({ code, name })),
  onSelect: (code) => {
    currentStockCode = code;
    render();
  },
});

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function loadData() {
  statusEl.textContent = "資料載入中...";
  const response = await fetch(API_URL, { cache: "no-store" });
  const data = await response.json();

  allRows = data.map(r => ({
    year: Number(r.year),
    quarter: Number(r.quarter),
    period: `${r.year}Q${r.quarter}`,
    stockCode: r.stockCode,
    stockName: r.stockName,
    industryCategory: r.industryCategory,
    revenue: num(r.revenue),
    eps: num(r.eps),
    grossMargin: num(r.grossMargin),
    operatingMargin: num(r.operatingMargin),
    pretaxMargin: num(r.pretaxMargin),
    netMargin: num(r.netMargin),
  })).filter(r => r.year && r.quarter && r.stockCode);

  populateStockOptions();
  render();
  statusEl.textContent = `共 ${allRows.length} 筆資料，最後更新：${new Date().toLocaleString("zh-TW")}`;
}

function populateStockOptions() {
  codeToStock = new Map();
  for (const r of allRows) {
    if (!codeToStock.has(r.stockCode)) codeToStock.set(r.stockCode, r.stockName);
  }
  const codes = [...codeToStock.keys()].sort();

  if (!currentStockCode || !codeToStock.has(currentStockCode)) {
    currentStockCode = codes[0] ?? null;
  }
  if (currentStockCode) {
    stockSelect.value = `${currentStockCode} ${codeToStock.get(currentStockCode)}`;
  }
}

// 官方季報的 EPS(以及損益表其餘金額欄位)本質上是「今年至今累計」，不是單獨這一季——
// Q2/Q3/Q4 的數字都是從年初累加到當季，只有 Q1 剛好等於單季(因為沒有更早的季度可以累加)。
// 這裡額外推算「單季」數字：Q1 直接等於累計；Q2/Q3/Q4 用「這一期累計」減掉「上一季累計」
// (同一年度內)。如果上一季剛好缺資料(回補還沒補到、或該季申報異常)，沒辦法算出正確的單季差額，
// 寧可顯示「查無資料」也不要顯示一個算錯的數字，所以缺上一季就讓單季值是 null。
function withQuarterlyEps(rows) {
  return rows.map((r, i) => {
    if (r.eps === null) {
      return { ...r, quarterlyEps: null };
    }
    if (r.quarter === 1) {
      return { ...r, quarterlyEps: r.eps };
    }
    const prev = rows[i - 1];
    const isPrevSameYearPriorQuarter = prev && prev.year === r.year && prev.quarter === r.quarter - 1;
    if (!isPrevSameYearPriorQuarter || prev.eps === null) {
      return { ...r, quarterlyEps: null };
    }
    return { ...r, quarterlyEps: r.eps - prev.eps };
  });
}

function getFilteredRows() {
  const stockCode = currentStockCode;
  const sorted = allRows
    .filter(r => r.stockCode === stockCode)
    .sort((a, b) => a.year - b.year || a.quarter - b.quarter);
  return withQuarterlyEps(sorted);
}

function render() {
  const rows = getFilteredRows();
  renderChart(rows);
  renderTable(rows);
}

// EPS(元)跟四率(%)單位差太多，分開放左右兩個 Y 軸；EPS 同時畫單季跟累計兩根柱子(並排顯示，
// Chart.js 兩個 bar dataset 共用同一個類別軸預設就是並排、不是疊加)，方便直接比較單季表現
// 跟年度累計進度，四率則維持折線圖。柱子用淺灰藍色調(不用深色)，避免視覺上比折線更搶眼——
// 折線(趨勢)才是這張圖主要想看的東西，柱子只是參考用的背景資訊。
function renderChart(rows) {
  const labels = rows.map(r => r.period);

  const pctSeries = [
    rows.map(r => r.grossMargin),
    rows.map(r => r.operatingMargin),
    rows.map(r => r.pretaxMargin),
    rows.map(r => r.netMargin),
  ];

  const datasets = [
    { type: "bar", label: "單季EPS(元)", data: rows.map(r => r.quarterlyEps), backgroundColor: "#8395a7", yAxisID: "y" },
    { type: "bar", label: "累計EPS(元)", data: rows.map(r => r.eps), backgroundColor: "#ced6e0", yAxisID: "y" },
    { type: "line", label: "毛利率(%)", data: pctSeries[0], borderColor: "#3498db", backgroundColor: "#3498db", yAxisID: "y1", pointRadius: 2, borderWidth: 2 },
    { type: "line", label: "營益率(%)", data: pctSeries[1], borderColor: "#e67e22", backgroundColor: "#e67e22", yAxisID: "y1", pointRadius: 2, borderWidth: 2 },
    { type: "line", label: "稅前淨利率(%)", data: pctSeries[2], borderColor: "#9b59b6", backgroundColor: "#9b59b6", yAxisID: "y1", pointRadius: 2, borderWidth: 2, borderDash: [4, 4] },
    { type: "line", label: "稅後淨利率(%)", data: pctSeries[3], borderColor: "#c0392b", backgroundColor: "#c0392b", yAxisID: "y1", pointRadius: 2, borderWidth: 2 },
  ];

  // EPS 軸(y)跟百分比軸(y1)如果各自從自己的資料範圍自動計算高度，兩邊的「0」會剛好對齊在
  // 同一條水平線上——這樣柱狀圖(從0開始長)很容易把貼在0附近的百分比折線蓋住。這裡刻意把
  // y1 的範圍往下拉很長一段(遠低於百分比的實際資料範圍)，讓百分比實際資料只佔整張圖上方一小段，
  // 效果是百分比的 0% 基準線被往上推到接近圖表頂端，折線就會完全浮在柱狀圖上方，不會被擋住。
  const pctValues = pctSeries.flat().filter(v => v !== null);
  const pctMax = pctValues.length ? Math.max(0, ...pctValues) : 1;
  const pctMin = pctValues.length ? Math.min(0, ...pctValues) : 0;
  const pctSpan = Math.max(pctMax - pctMin, 1);
  const y1Max = pctMax + pctSpan * 0.15;
  const y1Min = y1Max - pctSpan * 6; // 總範圍拉成實際資料的6倍寬，實際資料只佔頂端約15%的高度

  const config = {
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      spanGaps: true,
      scales: {
        // Q4 是年報(累計整年)，橫軸標籤特別標紅+加粗，方便一眼看出年度分界點。用 scriptable
        // 選項(color/font 都是 callback)動態判斷每個標籤是不是 Q4；ctx.index 在 Chart.js
        // 內部用不完整的 context 探測預設值時可能是 undefined，這裡要防呆，不然會直接噴錯
        // (institutional.html 的零基準線也踩過同樣的坑)。
        x: {
          ticks: {
            maxRotation: 90,
            minRotation: 90,
            color: (ctx) => (ctx.index != null && labels[ctx.index]?.endsWith("Q4") ? "#c0392b" : "#666"),
            font: (ctx) => (ctx.index != null && labels[ctx.index]?.endsWith("Q4") ? { weight: "bold" } : undefined),
          },
        },
        y: { position: "left", title: { display: true, text: "EPS(元)" } },
        y1: {
          position: "right",
          title: { display: true, text: "%" },
          grid: { drawOnChartArea: false },
          min: y1Min,
          max: y1Max,
        },
      },
    },
  };

  if (chart) {
    chart.destroy();
  }
  chart = new Chart(document.getElementById("chart"), config);
}

function fmtPct(v) {
  return v === null ? "-" : `${v.toFixed(2)}%`;
}

function fmtNum(v) {
  return v === null ? "-" : Math.round(v).toLocaleString();
}

function renderTable(rows) {
  tableBody.innerHTML = "";
  const reversed = [...rows].reverse();
  for (const r of reversed) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.period}</td>
      <td>${r.stockCode}</td>
      <td>${r.stockName}</td>
      <td>${r.industryCategory}</td>
      <td>${fmtNum(r.revenue)}</td>
      <td>${fmtPct(r.grossMargin)}</td>
      <td>${fmtPct(r.operatingMargin)}</td>
      <td>${fmtPct(r.pretaxMargin)}</td>
      <td>${fmtPct(r.netMargin)}</td>
      <td>${r.quarterlyEps === null ? "-" : r.quarterlyEps.toFixed(2)}</td>
      <td>${r.eps === null ? "-" : r.eps.toFixed(2)}</td>
    `;
    tableBody.appendChild(tr);
  }
}

loadData().catch(err => {
  statusEl.textContent = "資料載入失敗：" + err.message;
  console.error(err);
});
