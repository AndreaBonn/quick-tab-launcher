/* global browser, QAL_CONFIG, QAL_CONFIG_DEFAULTS, mergeWithDefaults, applyConfigToGlobal, CONFIG_STORAGE_KEY, buildFlatResults, renderResults, renderRecentTabs, renderEmpty, renderLoading, renderError, updateSelection, reindexItems, loadLocale, applyTranslations, onLocaleChange, filterCommands, renderCommandResults */

const state = {
  results: { tabs: [], bookmarks: [], history: [] },
  selectedIndex: -1,
  flatResults: [],
  searchTimeout: null,
  loadingTimeout: null,
  elements: {},
};

async function loadConfig() {
  try {
    const result = await browser.storage.local.get(CONFIG_STORAGE_KEY);
    const userConfig = result[CONFIG_STORAGE_KEY] ?? {};
    const merged = mergeWithDefaults(QAL_CONFIG_DEFAULTS, userConfig);
    applyConfigToGlobal(QAL_CONFIG, merged);
  } catch {
    // Storage unavailable: use defaults
  }
}

function captureElements() {
  state.elements = {
    input: document.querySelector(".qal-input"),
    results: document.querySelector(".qal-results"),
  };
}

function init() {
  captureElements();
  const { input, results } = state.elements;

  renderEmpty(results);
  input.focus();

  fetchRecentTabs();

  input.addEventListener("input", handleInput);
  input.addEventListener("keydown", handleKeydown);
  results.addEventListener("click", handleResultClick);

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[CONFIG_STORAGE_KEY]) return;
    const userConfig = changes[CONFIG_STORAGE_KEY].newValue ?? {};
    const merged = mergeWithDefaults(QAL_CONFIG_DEFAULTS, userConfig);
    applyConfigToGlobal(QAL_CONFIG, merged);
  });
}

async function fetchRecentTabs() {
  try {
    const recentData = await browser.runtime.sendMessage({
      action: "get-recent-tabs",
    });
    if (state.elements.input.value.trim()) return;
    renderRecentTabs(state.elements.results, recentData);
    state.flatResults = [
      ...recentData.recentActive.map((item) => ({
        ...item,
        type: "recent-active",
      })),
      ...recentData.recentlyClosed.map((item) => ({
        ...item,
        type: "recent-closed",
      })),
    ];
    state.selectedIndex = state.flatResults.length > 0 ? 0 : -1;
    if (state.selectedIndex >= 0) {
      updateSelection(state.elements.results, state.selectedIndex);
    }
  } catch {
    // Recent tabs not available
  }
}

function isCommandMode(query) {
  return query.trimStart().startsWith(">");
}

function handleInput() {
  clearTimeout(state.searchTimeout);
  clearTimeout(state.loadingTimeout);
  const query = state.elements.input.value;

  if (!query.trim()) {
    renderEmpty(state.elements.results);
    state.flatResults = [];
    state.selectedIndex = -1;
    fetchRecentTabs();
    return;
  }

  if (isCommandMode(query)) {
    const commands = filterCommands(query.trimStart().slice(1));
    state.flatResults = commands.map((cmd) => ({ ...cmd, type: "command" }));
    state.selectedIndex = state.flatResults.length > 0 ? 0 : -1;
    renderCommandResults(
      state.elements.results,
      commands,
      query.trimStart().slice(1),
      state.selectedIndex,
    );
    return;
  }

  state.loadingTimeout = setTimeout(() => {
    renderLoading(state.elements.results);
  }, QAL_CONFIG.LOADING_THRESHOLD_MS);

  state.searchTimeout = setTimeout(async () => {
    try {
      const results = await browser.runtime.sendMessage({
        action: "search",
        query,
      });
      clearTimeout(state.loadingTimeout);
      state.results = results;
      state.flatResults = buildFlatResults(results);
      state.selectedIndex = state.flatResults.length > 0 ? 0 : -1;
      renderResults(
        state.elements.results,
        results,
        query,
        state.selectedIndex,
      );
    } catch (err) {
      clearTimeout(state.loadingTimeout);
      console.error("Quick Actions Launcher popup: search error", err);
      renderError(state.elements.results);
    }
  }, QAL_CONFIG.DEBOUNCE_MS);
}

function handleKeydown(e) {
  switch (e.key) {
    case "ArrowDown":
    case "Tab":
      if (!e.shiftKey) {
        e.preventDefault();
        selectNext();
      }
      break;
    case "ArrowUp":
      e.preventDefault();
      selectPrev();
      break;
    case "Enter":
      e.preventDefault();
      if (state.selectedIndex >= 0) {
        navigateTo(
          state.flatResults[state.selectedIndex],
          e.ctrlKey || e.metaKey,
        );
      }
      break;
    case "Escape":
      e.preventDefault();
      window.close();
      break;
  }
}

function selectNext() {
  if (state.flatResults.length === 0) return;
  state.selectedIndex = (state.selectedIndex + 1) % state.flatResults.length;
  updateSelection(state.elements.results, state.selectedIndex);
}

function selectPrev() {
  if (state.flatResults.length === 0) return;
  state.selectedIndex =
    state.selectedIndex <= 0
      ? state.flatResults.length - 1
      : state.selectedIndex - 1;
  updateSelection(state.elements.results, state.selectedIndex);
}

function navigateTo(item, forceNewTab) {
  if (item.type === "tab" || item.type === "recent-active") {
    browser.runtime.sendMessage({
      action: "navigate",
      type: "tab",
      tabId: item.id,
    });
  } else if (item.type === "recent-closed") {
    browser.runtime.sendMessage({
      action: "restore-session",
      sessionId: item.sessionId,
    });
  } else if (item.type === "command") {
    browser.runtime.sendMessage({
      action: "execute-command",
      commandId: item.id,
    });
  } else {
    browser.runtime.sendMessage({
      action: "navigate",
      type: item.type,
      url: item.url,
      openInCurrent: !forceNewTab,
    });
  }
  window.close();
}

function handleResultClick(e) {
  const closeBtn = e.target.closest(".qal-close-tab");
  if (closeBtn) {
    e.stopPropagation();
    const itemEl = closeBtn.closest(".qal-result-item");
    const tabId = Number(itemEl.dataset.id);
    browser.runtime.sendMessage({ action: "close-tab", tabId });
    removeResultItem(itemEl, tabId);
    return;
  }

  const itemEl = e.target.closest(".qal-result-item");
  if (!itemEl) return;

  const index = Number(itemEl.dataset.index);
  if (index >= 0 && index < state.flatResults.length) {
    navigateTo(state.flatResults[index], e.ctrlKey || e.metaKey);
  }
}

function removeResultItem(itemEl, tabId) {
  state.results.tabs = state.results.tabs.filter((tab) => tab.id !== tabId);
  state.flatResults = buildFlatResults(state.results);
  itemEl.remove();

  const tabSection = document.querySelector(
    '.qal-section[data-section="tabs"]',
  );
  if (tabSection) {
    const remainingItems = tabSection.querySelectorAll(".qal-result-item");
    if (remainingItems.length === 0) {
      tabSection.remove();
    } else {
      const countEl = tabSection.querySelector(".qal-section-count");
      if (countEl) countEl.textContent = remainingItems.length;
    }
  }

  reindexItems(state.elements.results);

  if (state.selectedIndex >= state.flatResults.length) {
    state.selectedIndex = state.flatResults.length - 1;
  }
  updateSelection(state.elements.results, state.selectedIndex);
}

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.all([loadConfig(), loadLocale()]);
  applyTranslations(document);
  init();

  onLocaleChange(() => {
    applyTranslations(document);
    renderEmpty(state.elements.results);
  });
});
