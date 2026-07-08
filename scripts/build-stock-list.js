const fs = require('fs');
const path = require('path');

const TWSE_URL = 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L';
const TPEX_URL = 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O';
const OUTPUT_PATH = path.join(__dirname, '..', 'stock-list.json');

async function main() {
  const [twseRes, tpexRes] = await Promise.all([fetch(TWSE_URL), fetch(TPEX_URL)]);

  if (!twseRes.ok) {
    throw new Error(`TWSE API 回應失敗：${twseRes.status}`);
  }
  if (!tpexRes.ok) {
    throw new Error(`TPEx API 回應失敗：${tpexRes.status}`);
  }

  const twseData = await twseRes.json();
  const tpexData = await tpexRes.json();

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
