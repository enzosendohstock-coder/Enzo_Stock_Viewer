const MARKET_SUMMARY_API_URL = "https://ppi-stock-worker.enzosendohstock.workers.dev/api/market-summary";

const marketSummaryStatusEl = document.getElementById("marketSummaryStatus");
const institutionalTableBody = document.querySelector("#institutionalTable tbody");
const creditTableBody = document.querySelector("#creditTable tbody");
const futuresTableBody = document.querySelector("#futuresTable tbody");
const institutionalDateEl = document.getElementById("institutionalDate");
const creditDateEl = document.getElementById("creditDate");
const futuresDateEl = document.getElementById("futuresDate");

function netClass(value) {
  return value >= 0 ? "positive" : "negative";
}

// checkCnt 是「這筆資料連續幾次重查數字都沒變」，達到穩定門檻(3)算已定案(綠)，
// 還沒到就是還在確認中(紅)，跟 netClass 的漲跌配色是不同語意，用獨立的 class 名稱避免混淆。
function cntClass(cnt) {
  return cnt >= 3 ? "cnt-stable" : "cnt-pending";
}

// Worker 回傳的是原始元(新台幣)，這裡才換算成億元方便閱讀，
// 換算/顯示邏輯放前端、Worker 只給原始數字，跟 margin.js 把股換算成張的做法一致。
function toYi(value) {
  return (value / 1e8).toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 期貨/選擇權的淨契約金額原始單位是仟元(千元)，這裡換算成億元跟其他金額欄位一致。
function toYiFromThousands(value) {
  return (value / 1e5).toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 張數原始單位太細(近千萬張)，換算成萬張跟金額換算成億元是同樣的道理。
function toWanZhang(value) {
  return (value / 1e4).toLocaleString("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// TWSE 原始欄位名稱「融資(交易單位)」「融券(交易單位)」沒講清楚單位是什麼(其實是張數)，
// 這裡連同單位換算一起處理：張數換算成萬張、金額換算成億元，標籤要跟著換算邏輯一起改，
// 不然會出現「數字已經換算過、但標籤還寫換算前的單位」的不一致。
const CREDIT_ITEM_CONFIG = {
  "融資(交易單位)": { label: "融資(萬張)", format: toWanZhang },
  "融券(交易單位)": { label: "融券(萬張)", format: toWanZhang },
  "融資金額(仟元)": { label: "融資金額(億元)", format: toYiFromThousands },
};

function renderInstitutional(institutional) {
  if (!institutional) {
    institutionalTableBody.innerHTML = `<tr><td colspan="4">資料暫時無法取得</td></tr>`;
    return;
  }

  institutionalTableBody.innerHTML = institutional.rows.map(r => `
    <tr>
      <td>${r.name}</td>
      <td class="${netClass(r.net)}">${toYi(r.net)}</td>
      <td>${toYi(r.buy)}</td>
      <td>${toYi(r.sell)}</td>
    </tr>
  `).join("");
}

function renderCredit(credit) {
  if (!credit) {
    creditTableBody.innerHTML = `<tr><td colspan="6">資料暫時無法取得</td></tr>`;
    return;
  }

  creditTableBody.innerHTML = credit.rows.map(r => {
    const config = CREDIT_ITEM_CONFIG[r.item];
    const label = config?.label ?? r.item;
    const fmt = config?.format ?? (v => v.toLocaleString());
    return `
    <tr>
      <td>${label}</td>
      <td>${fmt(r.todayBalance)}</td>
      <td>${fmt(r.prevBalance)}</td>
      <td>${fmt(r.cashRedemption)}</td>
      <td>${fmt(r.buy)}</td>
      <td>${fmt(r.sell)}</td>
    </tr>
  `;
  }).join("");
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
    futuresTableBody.innerHTML = `<tr><td colspan="6">資料暫時無法取得</td></tr>`;
    return;
  }

  futuresTableBody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.contractName}</td>
      <td>${r.identity}</td>
      <td class="${netClass(r.netOpenInterest)}">${r.netOpenInterest.toLocaleString()}</td>
      <td class="${netClass(r.netVolume)}">${r.netVolume.toLocaleString()}</td>
      <td class="${netClass(r.netValue)}">${toYiFromThousands(r.netValue)}</td>
      <td class="${cntClass(r.checkCnt)}">${r.checkCnt}</td>
    </tr>
  `).join("");
}

function latestDate(...dates) {
  return dates.filter(Boolean).sort().pop() ?? null;
}

// 三大法人金額統計表、信用交易統計、期貨/選擇權三大法人，各自來源公布時間不同，
// 同一時間點抓到的資料常常不是同一天(例如三大法人已經有今天的、信用交易統計還停在昨天)，
// 所以每張表自己標示自己實際拿到的資料日期，不能只看首頁最上面那個「交易日」就以為全部一致。
function setSectionDate(el, date) {
  el.textContent = date ? `(資料日期：${date})` : "";
}

async function loadMarketSummary() {
  marketSummaryStatusEl.textContent = "大盤收盤資訊載入中...";

  try {
    const response = await fetch(MARKET_SUMMARY_API_URL, { cache: "no-store" });
    const data = await response.json();

    renderInstitutional(data.institutional);
    renderCredit(data.credit);
    renderFutures(data.futures, data.options);

    setSectionDate(institutionalDateEl, data.institutional?.date);
    setSectionDate(creditDateEl, data.credit?.date);
    setSectionDate(futuresDateEl, latestDate(data.futures?.date, data.options?.date));

    const date = latestDate(data.institutional?.date, data.credit?.date, data.futures?.date, data.options?.date);
    marketSummaryStatusEl.innerHTML = date
      ? `<span>大盤收盤資訊，交易日：<span class="trade-date">${date}</span></span><span class="last-updated">（最後更新：${new Date().toLocaleString("zh-TW")}）</span>`
      : "查無最近交易日的大盤收盤資訊。";
  } catch (err) {
    marketSummaryStatusEl.textContent = "大盤收盤資訊載入失敗，請稍後再試。";
    renderInstitutional(null);
    renderCredit(null);
    renderFutures(null, null);
    setSectionDate(institutionalDateEl, null);
    setSectionDate(creditDateEl, null);
    setSectionDate(futuresDateEl, null);
  }
}

document.addEventListener("DOMContentLoaded", loadMarketSummary);
