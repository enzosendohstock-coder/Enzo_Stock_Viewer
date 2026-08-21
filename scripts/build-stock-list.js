const fs = require('fs');
const path = require('path');

const TWSE_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L';
const TPEX_URL = 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O';
const OUTPUT_PATH = path.join(__dirname, '..', 'stock-list.json');

// TPEx 偶爾會擋掉沒帶瀏覽器 UA 的請求，回一個 HTML 錯誤頁但狀態碼還是 200，
// 直接 res.json() 解析就會炸掉——跟 PPI.Stock.Fetcher 的 MonthlyRevenueClient.cs
// 打 TPEx 端點時的做法一致，帶一般瀏覽器 UA + Referer 才不會被擋。TWSE 不需要這個。
const TPEX_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const TPEX_REFERER = 'https://www.tpex.org.tw/';

// 統一包一層解析：先讀文字再自己 JSON.parse，而不是直接呼叫 res.json()，這樣解析失敗時
// 才能把「實際收到的內容」印出來(通常是 HTML 錯誤頁的開頭)，之後排查才看得出真正原因，
// 不會只看到 SyntaxError 跟一個交易所名稱猜半天。
async function fetchJson(url, label, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`${label} API 回應失敗：${res.status}`);
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error(`${label} API 回應不是有效的 JSON，前 300 字：${text.slice(0, 300)}`);
    throw new Error(`${label} API 回應解析失敗：${err.message}`);
  }
}

async function main() {
  const [twseData, tpexData] = await Promise.all([
    fetchJson(TWSE_URL, 'TWSE'),
    fetchJson(TPEX_URL, 'TPEx', { headers: { 'User-Agent': TPEX_USER_AGENT, Referer: TPEX_REFERER } }),
  ]);

  const list = [];

  for (const row of twseData) {
    list.push({
      code: row['公司代號'],
      name: row['公司名稱'],
      shortName: row['公司簡稱'],
      market: 'TWSE',
    });
  }

  for (const row of tpexData) {
    list.push({
      code: row['SecuritiesCompanyCode'],
      name: row['CompanyName'],
      shortName: row['CompanyAbbreviation'],
      market: 'TPEx',
    });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(list));
  console.log(`寫入 ${list.length} 筆股票資料到 ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
