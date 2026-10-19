/* global browser, QAL_CONFIG, QAL_CONFIG_DEFAULTS, mergeWithDefaults, applyConfigToGlobal, CONFIG_STORAGE_KEY, buildFlatResults, renderRecentTabs, renderEmpty, renderLoading, renderError, updateSelection, reindexItems, loadLocale, applyTranslations, onLocaleChange, filterCommands, renderCommandResults, createIcon, renderFooterHints, isMacPlatform, t, tCount, renderSearchView, matchCommandsForSearch, buildToast, buildConfirmStrip, loadUserConfig, saveUserConfig */

const IS_MAC = isMacPlatform(navigator.platform);
const TOAST_MS = 8000;
const CLOSABLE_TYPES = ["tab", "recent-active"];

const state = {
  results: { tabs: [], bookmarks: [], history: [] },
  selectedIndex: -1,
  flatResults: [],
  searchCommands: [],
  searchTimeout: null,
  loadingTimeout: null,
  toastTimeout: null,
  footerMode: "recent",
  isHelpExpanded: false,
  isGroupedView: false,
  activeTabState: null,
  pendingConfirmId: null,
  undoCount: 0,
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
    footer: document.querySelector(".qal-footer"),
    groupToggle: document.querySelector(".qal-group-toggle"),
    fulltextToggle: document.querySelector(".qal-fulltext-toggle"),
    toastSlot: document.querySelector(".qal-toast-slot"),
  };
}

function renderFooter() {
  renderFooterHints(state.elements.footer, {
    mode: state.footerMode,
    expanded: state.isHelpExpanded,
    isMac: IS_MAC,
  });
}

function setFooterMode(mode) {
  if (state.footerMode === mode) return;
  state.footerMode = mode;
  renderFooter();
}

function toggleHelp() {
  state.isHelpExpanded = !state.isHelpExpanded;
  renderFooter();
}

function applyToggleLabels() {
  const { input, groupToggle, fulltextToggle } = state.elements;
  input.setAttribute("aria-label", t("launcher.inputLabel"));
  groupToggle.textContent = t("launcher.groupToggle");
  groupToggle.title = t("launcher.groupToggle.tooltip");
  fulltextToggle.textContent = t("launcher.fulltextToggle");
  updateToggleStates();
}

function updateToggleStates() {
  const { groupToggle, fulltextToggle } = state.elements;
  const isFulltextOn = QAL_CONFIG.ENABLE_FULLTEXT_SEARCH;
  groupToggle.classList.toggle("qal-toggle-active", state.isGroupedView);
  groupToggle.setAttribute("aria-pressed", String(state.isGroupedView));
  fulltextToggle.classList.toggle("qal-fulltext-active", isFulltextOn);
  fulltextToggle.setAttribute("aria-pressed", String(isFulltextOn));
  fulltextToggle.title = t(
    isFulltextOn
      ? "launcher.fulltextToggle.tooltip.on"
      : "launcher.fulltextToggle.tooltip.off",
  );
}

function init() {
  captureElements();
  const { input, results, groupToggle, fulltextToggle } = state.elements;

  const lens = createIcon("search", 18);
  if (lens) document.querySelector(".qal-search-icon").appendChild(lens);
  results.activeDescendantOwner = input;
  applyToggleLabels();
  renderFooter();

  renderEmpty(results);
  input.focus();

  fetchRecentTabs();
  fetchActiveTabState();

  input.addEventListener("input", handleInput);
  input.addEventListener("keydown", handleKeydown);
  results.addEventListener("click", handleResultClick);
  groupToggle.addEventListener("click", toggleGroupedView);
  fulltextToggle.addEventListener("click", toggleFulltextSearch);
  document.body.addEventListener("click", handleAction);

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[CONFIG_STORAGE_KEY]) return;
    const userConfig = changes[CONFIG_STORAGE_KEY].newValue ?? {};
    const merged = mergeWithDefaults(QAL_CONFIG_DEFAULTS, userConfig);
    applyConfigToGlobal(QAL_CONFIG, merged);
    updateToggleStates();
  });
}

async function fetchActiveTabState() {
  try {
    state.activeTabState = await browser.runtime.sendMessage({
      action: "get-active-tab-state",
    });
  } catch {
    state.activeTabState = null;
  }
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

function rebuildFlatResults() {
  state.flatResults = [
    ...buildFlatResults(state.results, { grouped: state.isGroupedView }),
    ...state.searchCommands.map((cmd) => ({ ...cmd, type: "command" })),
  ];
}

function renderCurrentView(query) {
  renderSearchView(state.elements.results, {
    results: state.results,
    commands: state.searchCommands,
    query,
    selectedIndex: state.selectedIndex,
    grouped: state.isGroupedView,
    tips: {
      fulltextEnabled: QAL_CONFIG.ENABLE_FULLTEXT_SEARCH,
      historyDays: QAL_CONFIG.HISTORY_DAYS,
    },
  });
}

function handleInput() {
  clearTimeout(state.searchTimeout);
  clearTimeout(state.loadingTimeout);
  clearPendingConfirm();
  const query = state.elements.input.value;

  if (!query.trim()) {
    setFooterMode("recent");
    renderEmpty(state.elements.results);
    state.flatResults = [];
    state.selectedIndex = -1;
    fetchRecentTabs();
    return;
  }

  if (isCommandMode(query)) {
    setFooterMode("commands");
    const commandQuery = query.trimStart().slice(1);
    const commands = filterCommands(commandQuery, state.activeTabState);
    state.flatResults = commands.map((cmd) => ({ ...cmd, type: "command" }));
    state.selectedIndex = state.flatResults.length > 0 ? 0 : -1;
    renderCommandResults(
      state.elements.results,
      commands,
      commandQuery,
      state.selectedIndex,
    );
    return;
  }
  setFooterMode("search");

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
      state.searchCommands = matchCommandsForSearch(
        query,
        state.activeTabState,
      );
      rebuildFlatResults();
      state.selectedIndex = state.flatResults.length > 0 ? 0 : -1;
      renderCurrentView(query);
    } catch (err) {
      clearTimeout(state.loadingTimeout);
      console.error("Quick TAB Launcher popup: search error", err);
      renderError(state.elements.results);
    }
  }, QAL_CONFIG.DEBOUNCE_MS);
}

function toggleGroupedView() {
  state.isGroupedView = !state.isGroupedView;
  updateToggleStates();
  const query = state.elements.input.value;
  if (query.trim() && !isCommandMode(query)) {
    rebuildFlatResults();
    renderCurrentView(query);
  }
}

async function toggleFulltextSearch() {
  QAL_CONFIG.ENABLE_FULLTEXT_SEARCH = !QAL_CONFIG.ENABLE_FULLTEXT_SEARCH;
  updateToggleStates();
  try {
    const stored = await loadUserConfig();
    stored.ENABLE_FULLTEXT_SEARCH = QAL_CONFIG.ENABLE_FULLTEXT_SEARCH;
    await saveUserConfig(stored);
  } catch (err) {
    console.warn("Quick TAB Launcher popup: config save failed", err);
  }
  if (state.elements.input.value.trim()) handleInput();
}

// Option+letter on macOS types a symbol, so match the physical key.
function isAltShortcut(e, letter) {
  return (
    e.altKey &&
    (e.code === `Key${letter.toUpperCase()}` || e.key.toLowerCase() === letter)
  );
}

function handleShortcut(e) {
  if (isAltShortcut(e, "c")) toggleFulltextSearch();
  else if (isAltShortcut(e, "g")) toggleGroupedView();
  else if (isAltShortcut(e, "w")) closeTab(state.selectedIndex);
  else if (isAltShortcut(e, "z") && state.undoCount > 0) undoLastClose();
  else if (e.key === "?" && !state.elements.input.value) toggleHelp();
  else if (e.key === "Escape" && state.pendingConfirmId) clearPendingConfirm();
  else return false;
  return true;
}

function handleKeydown(e) {
  if (handleShortcut(e)) {
    e.preventDefault();
    return;
  }
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
  clearPendingConfirm();
  state.selectedIndex = (state.selectedIndex + 1) % state.flatResults.length;
  updateSelection(state.elements.results, state.selectedIndex);
}

function selectPrev() {
  if (state.flatResults.length === 0) return;
  clearPendingConfirm();
  state.selectedIndex =
    state.selectedIndex <= 0
      ? state.flatResults.length - 1
      : state.selectedIndex - 1;
  updateSelection(state.elements.results, state.selectedIndex);
}

function clearPendingConfirm() {
  state.pendingConfirmId = null;
  state.elements.results.querySelector(".qal-confirm")?.remove();
}

async function requestConfirm(item) {
  let affected = 0;
  try {
    const preview = await browser.runtime.sendMessage({
      action: "preview-command",
      commandId: item.id,
    });
    affected = preview?.affected ?? 0;
  } catch (err) {
    console.warn("Quick TAB Launcher popup: preview failed", err);
  }
  if (affected === 0) {
    showToast(t("done.nothing"));
    return;
  }
  clearPendingConfirm();
  state.pendingConfirmId = item.id;
  const row = state.elements.results.querySelector(
    `.qal-result-item[data-index="${state.selectedIndex}"]`,
  );
  row?.after(buildConfirmStrip(tCount("confirm.closeTabs", affected)));
}

function navigateTo(item, forceNewTab) {
  if (item.type === "command" && item.confirm) {
    if (state.pendingConfirmId !== item.id) {
      requestConfirm(item);
      return;
    }
  }
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

function showToast(message, undoCount = 0) {
  clearTimeout(state.toastTimeout);
  state.undoCount = undoCount;
  state.elements.toastSlot.replaceChildren(buildToast(message, undoCount > 0));
  state.toastTimeout = setTimeout(hideToast, TOAST_MS);
}

function hideToast() {
  clearTimeout(state.toastTimeout);
  state.undoCount = 0;
  state.elements.toastSlot.replaceChildren();
}

function refreshCurrentView() {
  if (state.elements.input.value.trim()) handleInput();
  else fetchRecentTabs();
}

async function closeTab(index) {
  const item = state.flatResults[index];
  if (!item || !CLOSABLE_TYPES.includes(item.type)) return;
  try {
    await browser.runtime.sendMessage({ action: "close-tab", tabId: item.id });
  } catch (err) {
    console.warn("Quick TAB Launcher popup: close failed", err);
    return;
  }
  showToast(t("toast.tabClosed", { title: item.title || item.url }), 1);
  const itemEl = state.elements.results.querySelector(
    `.qal-result-item[data-index="${index}"]`,
  );
  if (item.type === "tab" && itemEl) removeResultItem(itemEl, item.id);
  else refreshCurrentView();
}

async function undoLastClose() {
  const count = state.undoCount;
  hideToast();
  try {
    await browser.runtime.sendMessage({ action: "undo-close", count });
  } catch (err) {
    console.warn("Quick TAB Launcher popup: undo failed", err);
  }
  refreshCurrentView();
}

function handleAction(e) {
  const target = e.target.closest("[data-qal-action]");
  if (!target) return;
  const action = target.dataset.qalAction;
  if (action === "toggle-help") toggleHelp();
  else if (action === "undo") undoLastClose();
  else if (action === "enable-fulltext" && !QAL_CONFIG.ENABLE_FULLTEXT_SEARCH) {
    toggleFulltextSearch();
  } else if (action === "open-options") {
    browser.runtime.openOptionsPage();
    window.close();
  }
}

function handleResultClick(e) {
  const closeBtn = e.target.closest(".qal-close-tab");
  if (closeBtn) {
    e.stopPropagation();
    const itemEl = closeBtn.closest(".qal-result-item");
    closeTab(Number(itemEl.dataset.index));
    return;
  }

  const domainHeader = e.target.closest(".qal-domain-header");
  if (domainHeader && !e.target.closest("button")) {
    domainHeader.parentElement.classList.toggle("qal-collapsed");
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
  rebuildFlatResults();
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
    applyToggleLabels();
    renderFooter();
    renderEmpty(state.elements.results);
  });
});
