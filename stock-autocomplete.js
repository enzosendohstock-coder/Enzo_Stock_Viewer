// 共用的股票代號自動完成元件，institutional.html/margin.html/stock-price.html/monthly-revenue.html
// 都是用同一份邏輯，不要各自刻一份不一致的版本。
//
// 不用瀏覽器原生 <input list><datalist> 的篩選行為——不同瀏覽器的篩選規則不一致(是比對開頭、
// 還是整個字串裡任何位置都算、還是同時比對 value 跟 label)，沒辦法保證「輸入 33 一定會列出
// 所有 33 開頭的股票」這個明確要求，所以自己刻一個小型建議清單，篩選規則統一固定為：
// 代號「開頭」比對(prefix) 或 名稱「包含」比對(substring)，兩者符合其一就列出來。
//
// 使用方式：
//   setupStockAutocomplete({
//     inputEl: 文字輸入框,
//     suggestionsEl: 建議清單要渲染進去的容器(通常是 input 旁邊的一個空 div),
//     getEntries: () => [{ code, name }, ...] 目前有效的股票清單(呼叫時即時取得，不用自己快取),
//     onSelect: (code) => 使用者選定某支股票時的回呼，只負責通知，不會自動改 inputEl.value
//               (inputEl.value 由這個元件自己統一設成 "代號 名稱" 的格式)。
//   })
const MAX_SUGGESTIONS = 50;

function setupStockAutocomplete({ inputEl, suggestionsEl, getEntries, onSelect }) {
  let activeIndex = -1;

  function closeSuggestions() {
    suggestionsEl.innerHTML = "";
    suggestionsEl.classList.remove("open");
    activeIndex = -1;
  }

  // 查詢字串是空的時候(欄位本來就空、或使用者剛 focus 進來還沒打字)，不像原本輸入建議
  // 那樣直接不顯示清單，而是顯示「全部選項」(依代號排序)——這樣同一個欄位才能兼顧兩種
  // 用法：像原本 <select> 一樣點開瀏覽全部，也可以像輸入建議一樣打字篩選(代號開頭比對/
  // 名稱包含比對)。
  function renderSuggestions(query) {
    const trimmed = query.trim();
    const entries = getEntries();
    const matches = trimmed
      ? entries.filter(e => e.code.startsWith(trimmed) || e.name.includes(trimmed)).slice(0, MAX_SUGGESTIONS)
      : [...entries].sort((a, b) => a.code.localeCompare(b.code)).slice(0, MAX_SUGGESTIONS);

    if (matches.length === 0) {
      closeSuggestions();
      return;
    }

    activeIndex = -1;
    suggestionsEl.innerHTML = matches
      .map(e => `<div class="autocomplete-item" data-code="${e.code}">${e.code} ${e.name}</div>`)
      .join("");
    suggestionsEl.classList.add("open");
  }

  function selectByCode(code) {
    const entry = getEntries().find(e => e.code === code);
    if (!entry) {
      return;
    }
    inputEl.value = `${entry.code} ${entry.name}`;
    closeSuggestions();
    onSelect(entry.code);
  }

  // 使用者可能直接打完整代號或名稱、按 Enter 或點掉輸入框，沒有用方向鍵選建議清單裡的項目——
  // 這種情況改成比對「完全相符」的代號或名稱，找得到就直接選定，找不到就安靜不做任何事
  // (維持原本選定的股票，不清空、不報錯)。
  function tryResolveExact() {
    const trimmed = inputEl.value.trim();
    const entry = getEntries().find(e => e.code === trimmed || e.name === trimmed);
    if (entry) {
      selectByCode(entry.code);
    }
  }

  function setActive(items, index) {
    items.forEach((item, i) => item.classList.toggle("active", i === index));
    if (items[index]) {
      items[index].scrollIntoView({ block: "nearest" });
    }
  }

  inputEl.addEventListener("input", () => renderSuggestions(inputEl.value));

  // focus 進來的當下，欄位裡通常已經是上次選定的 "代號 名稱"——如果照舊拿這個完整字串去
  // 篩選，不會比對到任何東西(等於看起來完全沒反應)。改成強制顯示全部選項(等同傳空字串)，
  // 同時把文字整個選取起來，這樣使用者一開始打字就會直接覆蓋掉舊值、自然接上篩選邏輯，
  // 不用自己先手動清空欄位。
  inputEl.addEventListener("focus", () => {
    inputEl.select();
    renderSuggestions("");
  });

  inputEl.addEventListener("keydown", (e) => {
    const items = Array.from(suggestionsEl.querySelectorAll(".autocomplete-item"));

    // Enter/Escape 不管目前有沒有建議清單都要處理(輸入完整代號/名稱、清單還沒渲染出來
    // 或剛好沒有符合項目時，Enter 還是要能直接比對完全相符的代號/名稱)；上下鍵移動選取
    // 才需要清單裡真的有項目可以移動，沒有項目就不用做事。
    if (items.length === 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      setActive(items, activeIndex);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      setActive(items, activeIndex);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && items[activeIndex]) {
        selectByCode(items[activeIndex].dataset.code);
      } else {
        tryResolveExact();
      }
    } else if (e.key === "Escape") {
      closeSuggestions();
    }
  });

  // 用 mousedown(不是 click)才能搶在 input 的 blur 事件之前處理選取——如果用 click，
  // blur 會先觸發、建議清單被 blur 的收合邏輯清空，click 事件抓到的目標就已經不在畫面上了。
  suggestionsEl.addEventListener("mousedown", (e) => {
    const item = e.target.closest(".autocomplete-item");
    if (!item) {
      return;
    }
    e.preventDefault();
    selectByCode(item.dataset.code);
  });

  inputEl.addEventListener("blur", () => {
    // 延遲執行，讓上面 mousedown 選取的邏輯有機會先跑完(那種情況下 tryResolveExact
    // 會比對不到東西、安靜跳過，不影響已經選好的結果)。沒有點建議清單、直接點掉輸入框的話，
    // 這裡才是唯一補上「完全相符」比對的機會。
    setTimeout(() => {
      tryResolveExact();
      closeSuggestions();
    }, 150);
  });
}
