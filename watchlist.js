const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwlBgAvgvp70A-eBLoQ9rid7JL3otl5jtAll2SQLzB2CclrTogb2Lj4GQIfMYoTveaeCA/exec';
const CODE_PATTERN = /^[0-9]{4,6}$/;

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('watchlistForm');
  const codeInput = document.getElementById('stockCode');
  const honeypotInput = document.getElementById('website');
  const submitBtn = document.getElementById('submitBtn');
  const message = document.getElementById('formMessage');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const code = codeInput.value.trim();
    if (!CODE_PATTERN.test(code)) {
      showMessage('股票代號格式不正確，請輸入 4-6 碼數字。', false);
      return;
    }

    submitBtn.disabled = true;
    showMessage('送出中...', null);

    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ code, honeypot: honeypotInput.value }),
      });
      const result = await response.json();
      showMessage(result.message, result.success);
      if (result.success) {
        form.reset();
      }
    } catch (err) {
      showMessage('送出失敗，請檢查網路連線後再試一次。', false);
    } finally {
      submitBtn.disabled = false;
    }
  });

  function showMessage(text, success) {
    message.textContent = text;
    message.className = 'form-message';
    if (success === true) {
      message.classList.add('success');
    } else if (success === false) {
      message.classList.add('error');
    }
  }
});
