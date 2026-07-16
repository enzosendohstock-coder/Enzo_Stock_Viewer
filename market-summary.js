const MARKET_SUMMARY_API_URL = "https://ppi-stock-worker.enzosendohstock.workers.dev/api/market-summary";

const marketSummaryStatusEl = document.getElementById("marketSummaryStatus");
const institutionalTableBody = document.querySelector("#institutionalTable tbody");
const creditTableBody = document.querySelector("#creditTable tbody");
const futuresTableBody = document.querySelector("#futuresTable tbody");

function netClass(value) {
  return value >= 0 ? "positive" : "negative";
}

// Worker 回傳的是原始元(新台幣)，這裡才換算成億元方便閱讀，
// 換算/顯示邏輯放前端、Worker 只給原始數字，跟 margin.js 把股換算成張的做法一致。
function toYi(value) {
  return (value / 1e8).toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// TWSE 原始欄位名稱「融資(交易單位)」「融券(交易單位)」沒講清楚單位是什麼(其實是張數)，
// 這裡換成明確的單位名稱；融資金額本來就已經用仟元標示清楚，不用改。
const CREDIT_ITEM_LABELS = {
  "融資(交易單位)": "融資(張)",
  "融券(交易單位)": "融券(張)",
};

function renderInstitutional(institutional) {
  if (!institutional) {
    institutionalTableBody.innerHTML = `<tr><td colspan="4">資料暫時無法取得</td></tr>`;
    return;
  }

  institutionalTableBody.innerHTML = institutional.rows.map(r => `
    <tr>
      <td>${r.name}</td>
      <td>${toYi(r.buy)}</td>
      <td>${toYi(r.sell)}</td>
      <td class="${netClass(r.net)}">${toYi(r.net)}</td>
    </tr>
  `).join("");
}

function renderCredit(credit) {
  if (!credit) {
    creditTableBody.innerHTML = `<tr><td colspan="6">資料暫時無法取得</td></tr>`;
    return;
  }

  creditTableBody.innerHTML = credit.rows.map(r => `
    <tr>
      <td>${CREDIT_ITEM_LABELS[r.item] ?? r.item}</td>
      <td>${r.buy.toLocaleString()}</td>
      <td>${r.sell.toLocaleString()}</td>
      <td>${r.cashRedemption.toLocaleString()}</td>
      <td>${r.prevBalance.toLocaleString()}</td>
      <td>${r.todayBalance.toLocaleString()}</td>
    </tr>
  `).join("");
}

function renderFutures(futures, options) {
  const rows = [];

  if (futures) {
    for (const contract of futures.contracts) {
      for (const r of contract.rows) {
        rows.push({ contractName: contract.name, ...r });
      }
    }
  }

  if (options) {
    for (const r of options.rows) {
      rows.push({ contractName: "臺指選擇權", ...r });
    }
  }

  if (rows.length === 0) {
    futuresTableBody.innerHTML = `<tr><td colspan="4">資料暫時無法取得</td></tr>`;
    return;
  }

  futuresTableBody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.contractName}</td>
      <td>${r.identity}</td>
      <td class="${netClass(r.netVolume)}">${r.netVolume.toLocaleString()}</td>
      <td class="${netClass(r.netValue)}">${r.netValue.toLocaleString()}</td>
    </tr>
  `).join("");
}

function latestDate(...dates) {
  return dates.filter(Boolean).sort().pop() ?? null;
}

async function loadMarketSummary() {
  marketSummaryStatusEl.textContent = "大盤收盤資訊載入中...";

  try {
    const response = await fetch(MARKET_SUMMARY_API_URL, { cache: "no-store" });
    const data = await response.json();

    renderInstitutional(data.institutional);
    renderCredit(data.credit);
    renderFutures(data.futures, data.options);

    const date = latestDate(data.institutional?.date, data.credit?.date, data.futures?.date, data.options?.date);
    marketSummaryStatusEl.textContent = date
      ? `大盤收盤資訊，交易日：${date}（最後更新：${new Date().toLocaleString("zh-TW")}）`
      : "查無最近交易日的大盤收盤資訊。";
  } catch (err) {
    marketSummaryStatusEl.textContent = "大盤收盤資訊載入失敗，請稍後再試。";
    renderInstitutional(null);
    renderCredit(null);
    renderFutures(null, null);
  }
}

document.addEventListener("DOMContentLoaded", loadMarketSummary);
