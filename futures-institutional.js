const API_URL = "https://ppi-stock-worker.enzosendohstock.workers.dev/api/futures-institutional-history";

const statusEl = document.getElementById("status");
const contractSelect = document.getElementById("contractSelect");
const metricSelect = document.getElementById("metricSelect");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
const tableBody = document.querySelector("#dataTable tbody");

const IDENTITIES = ["自營商", "投信", "外資及陸資"];
const IDENTITY_COLORS = {
  "自營商": "#9b59b6",
  "投信": "#f39c12",
  "外資及陸資": "#3498db",
};

const METRIC_LABELS = {
  netOpenInterest: "淨未平倉口數",
  netVolume: "淨口數",
  netValue: "淨契約金額(仟元)",
};

let allRows = [];
let chart = null;

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
    contractCode: r.contractCode,
    contractName: r.contractName,
    identity: r.identity,
    netVolume: num(r.netVolume),
    netValue: num(r.netValue),
    netOpenInterest: num(r.netOpenInterest),
  })).filter(r => r.date && r.contractCode);

  populateDateRange();
  render();
  statusEl.textContent = `共 ${allRows.length} 筆資料，最後更新：${new Date().toLocaleString("zh-TW")}`;
}

function populateDateRange() {
  const dates = allRows.map(r => r.date).sort();
  if (dates.length === 0) return;
  startDateInput.value = dates[0];
  endDateInput.value = dates[dates.length - 1];
  startDateInput.min = dates[0];
  startDateInput.max = dates[dates.length - 1];
  endDateInput.min = dates[0];
  endDateInput.max = dates[dates.length - 1];
}

// 同一天、同一契約，三種身份別各自可能有 0~1 筆(理論上都會有，缺筆時該格留 null，
// 圖表跟表格都用 null 表示「這天這個身份別沒有資料」，而不是誤當成 0)。
function getGroupedRows() {
  const contractCode = contractSelect.value;
  const start = startDateInput.value;
  const end = endDateInput.value;

  const filtered = allRows.filter(r => r.contractCode === contractCode && r.date >= start && r.date <= end);

  const byDate = new Map();
  for (const r of filtered) {
    if (!byDate.has(r.date)) {
      byDate.set(r.date, { date: r.date });
    }
    byDate.get(r.date)[r.identity] = r;
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function shortDate(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return y.slice(2) + m + d;
}

function render() {
  const rows = getGroupedRows();
  const metricKey = metricSelect.value;
  renderChart(rows, metricKey);
  renderTable(rows, metricKey);
}

function renderChart(rows, metricKey) {
  const labels = rows.map(r => shortDate(r.date));
  const metricLabel = METRIC_LABELS[metricKey];

  const datasets = IDENTITIES.map(identity => ({
    label: identity,
    data: rows.map(r => r[identity] ? r[identity][metricKey] : null),
    borderColor: IDENTITY_COLORS[identity],
    backgroundColor: IDENTITY_COLORS[identity],
    spanGaps: true,
    pointRadius: 2,
    tension: 0.1,
  }));

  const config = {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { maxRotation: 90, minRotation: 90, autoSkip: true, maxTicksLimit: 30 } },
        y: { title: { display: true, text: metricLabel } },
      },
    },
  };

  if (chart) {
    chart.destroy();
  }
  chart = new Chart(document.getElementById("chart"), config);
}

function renderTable(rows, metricKey) {
  const reversed = [...rows].reverse();
  tableBody.innerHTML = reversed.map(r => `
    <tr>
      <td>${r.date}</td>
      ${IDENTITIES.map(identity => {
        const cell = r[identity];
        if (!cell) return `<td>-</td>`;
        const value = cell[metricKey];
        return `<td class="${value >= 0 ? 'positive' : 'negative'}">${value.toLocaleString()}</td>`;
      }).join("")}
    </tr>
  `).join("");
}

contractSelect.addEventListener("change", render);
metricSelect.addEventListener("change", render);
startDateInput.addEventListener("change", render);
endDateInput.addEventListener("change", render);

loadData().catch(err => {
  statusEl.textContent = "資料載入失敗：" + err.message;
  console.error(err);
});
