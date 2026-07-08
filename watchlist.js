const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwlBgAvgvp70A-eBLoQ9rid7JL3otl5jtAll2SQLzB2CclrTogb2Lj4GQIfMYoTveaeCA/exec';
const CODE_PATTERN = /^[0-9]{4,6}$/;
const STOCK_LIST_URL = 'stock-list.json';
const MARKET_LABEL = { TWSE: '上市', TPEx: '上櫃' };

let stockList = [];
let codeToStock = new Map();

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('watchlistForm');
  const codeInput = document.getElementById('stockCode');
  const honeypotInput = document.getElementById('website');
  const submitBtn = document.getElementById('submitBtn');
  const message = document.getElementById('formMessage');
  const preview = document.getElementById('stockPreview');
  const datalist = document.getElementById('stockOptions');

  loadStockList(datalist);

  codeInput.addEventListener('input', () => {
    updatePreview(preview, codeInput.value.trim());
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const raw = codeInput.value.trim();
    const resolved = resolveStock(raw);

    if (!resolved) {
      showMessage(message, '找不到對應的股票，請確認代號或名稱是否正確，或從建議清單中選擇。', false);
      return;
    }

    submitBtn.disabled = true;
    showMessage(message, '送出中...', null);

    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ code: resolved.code, honeypot: honeypotInput.value }),
      });
      const result = await response.json();
      showMessage(message, result.message, result.success);
      if (result.success) {
        form.reset();
        preview.textContent = '';
        preview.className = 'stock-preview';
      }
    } catch (err) {
      showMessage(message, '送出失敗，請檢查網路連線後再試一次。', false);
    } finally {
      submitBtn.disabled = false;
    }
  });
});

async function loadStockList(datalist) {
  try {
    const res = await fetch(STOCK_LIST_URL);
    stockList = await res.json();
    codeToStock = new Map(stockList.map((s) => [s.code, s]));

    const fragment = document.createDocumentFragment();
    for (const s of stockList) {
      const option = document.createElement('option');
      option.value = s.code;
      option.label = `${s.shortName} ${s.name}`;
      fragment.appendChild(option);
    }
    datalist.appendChild(fragment);
  } catch (err) {
    console.error('股票清單載入失敗', err);
  }
}

function resolveStock(raw) {
  if (CODE_PATTERN.test(raw)) {
    return codeToStock.get(raw) || { code: raw };
  }
  return stockList.find((s) => s.shortName === raw || s.name === raw) || null;
}

function updatePreview(preview, raw) {
  if (!raw) {
    preview.textContent = '';
    preview.className = 'stock-preview';
    return;
  }

  const resolved = resolveStock(raw);

  if (resolved && resolved.name) {
    const marketLabel = MARKET_LABEL[resolved.market] || '';
    preview.textContent = `✓ ${resolved.code} ${resolved.shortName}（${resolved.name}・${marketLabel}）`;
    preview.className = 'stock-preview success';
  } else if (resolved) {
    preview.textContent = `格式正確，但清單中查無代號 ${resolved.code} 的資料（可能是新股票或尚未收錄），仍可嘗試送出。`;
    preview.className = 'stock-preview warning';
  } else {
    preview.textContent = '查無符合的股票，請確認名稱是否正確，或從建議清單中選擇。';
    preview.className = 'stock-preview error';
  }
}

function showMessage(message, text, success) {
  message.textContent = text;
  message.className = 'form-message';
  if (success === true) {
    message.classList.add('success');
  } else if (success === false) {
    message.classList.add('error');
  }
}
