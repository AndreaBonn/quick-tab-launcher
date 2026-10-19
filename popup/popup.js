/* global createPanelState, createPanelView, isCommandMode, browser, QAL_CONFIG, loadStoredConfig, applyConfigChange, CONFIG_STORAGE_KEY, renderRecentTabs, renderEmpty, renderLoading, renderError, updateSelection, loadLocale, applyTranslations, onLocaleChange, filterCommands, renderCommandResults, createIcon, isAltShortcut, t, tCount, matchCommandsForSearch, buildConfirmStrip, loadUserConfig, saveUserConfig */

const CLOSABLE_TYPES = ["tab", "recent-active"];

const state = {
  ...createPanelState(),
  elements: {},
};

let panelView;

async function loadConfig() {
  try {
    await loadStoredConfig(QAL_CONFIG);
  } catch (err) {
    console.warn("Quick TAB Launcher popup: config load failed", err);
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
  panelView = createPanelView({ state, elements: state.elements });
  const { input, results, groupToggle, fulltextToggle } = state.elements;

  const lens = createIcon("search", 18);
  if (lens) document.querySelector(".qal-search-icon").appendChild(lens);
  results.activeDescendantOwner = input;
  applyToggleLabels();
  panelView.renderFooter();

  renderEmpty(results);
  input.focus();

  fetchRecentTabs();
  fetchActiveTabState();
  fetchWebSearchState();

  input.addEventListener("input", handleInput);
  input.addEventListener("keydown", handleKeydown);
  results.addEventListener("click", handleResultClick);
  groupToggle.addEventListener("click", toggleGroupedView);
  fulltextToggle.addEventListener("click", toggleFulltextSearch);
  document.body.addEventListener("click", handleAction);

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[CONFIG_STORAGE_KEY]) return;
    applyConfigChange(QAL_CONFIG, changes);
    updateToggleStates();
  });
}

async function fetchActiveTabState() {
  try {
    state.activeTabState = await browser.runtime.sendMessage({
      action: "get-active-tab-state",
    });
  } catch (err) {
    console.warn("Quick TAB Launcher popup: tab state unavailable", err);
    state.activeTabState = null;
  }
}

async function fetchWebSearchState() {
  try {
    const reply = await browser.runtime.sendMessage({
      action: "get-web-search-state",
    });
    state.webSearchEnabled = Boolean(reply?.enabled);
  } catch (err) {
    console.warn("Quick TAB Launcher popup: web search state unavailable", err);
    state.webSearchEnabled = false;
  }
}

async function fetchRecentTabs(preferredIndex = 0) {
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
    state.selectedIndex = Math.min(
      preferredIndex,
      state.flatResults.length - 1,
    );
    if (state.selectedIndex >= 0) {
      updateSelection(state.elements.results, state.selectedIndex);
    }
  } catch (err) {
    console.warn("Quick TAB Launcher popup: recent tabs unavailable", err);
  }
}

function handleInput() {
  clearTimeout(state.searchTimeout);
  clearTimeout(state.loadingTimeout);
  panelView.clearPendingConfirm();
  const query = state.elements.input.value;
  const seq = ++state.searchSeq;

  if (!query.trim()) {
    panelView.setFooterMode("recent");
    renderEmpty(state.elements.results);
    state.flatResults = [];
    state.selectedIndex = -1;
    fetchRecentTabs();
    return;
  }

  if (isCommandMode(query)) {
    panelView.setFooterMode("commands");
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
  panelView.setFooterMode("search");

  state.loadingTimeout = setTimeout(() => {
    renderLoading(state.elements.results);
  }, QAL_CONFIG.LOADING_THRESHOLD_MS);

  state.searchTimeout = setTimeout(async () => {
    try {
      const results = await browser.runtime.sendMessage({
        action: "search",
        query,
      });
      if (seq !== state.searchSeq) return;
      clearTimeout(state.loadingTimeout);
      state.results = results;
      state.searchCommands = matchCommandsForSearch(
        query,
        state.activeTabState,
      );
      panelView.rebuildFlatResults();
      state.selectedIndex = state.flatResults.length > 0 ? 0 : -1;
      panelView.renderCurrentView(query);
    } catch (err) {
      if (seq !== state.searchSeq) return;
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
    panelView.rebuildFlatResults();
    panelView.renderCurrentView(query);
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

function handleShortcut(e) {
  if (isAltShortcut(e, "c")) toggleFulltextSearch();
  else if (isAltShortcut(e, "g")) toggleGroupedView();
  else if (isAltShortcut(e, "w")) {
    if (!e.repeat) closeTab(state.selectedIndex);
  } else if (isAltShortcut(e, "z") && state.panelUndoCount > 0) undoLastClose();
  else if (e.key === "?" && !state.elements.input.value) panelView.toggleHelp();
  else if (e.key === "Escape" && state.pendingConfirmId) panelView.clearPendingConfirm();
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
        panelView.selectNext();
      }
      break;
    case "ArrowUp":
      e.preventDefault();
      panelView.selectPrev();
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
  const isStillSelected = state.flatResults[state.selectedIndex]?.id === item.id;
  if (!isStillSelected) return;
  if (affected === 0) {
    panelView.showPanelToast(t("done.nothing"));
    return;
  }
  panelView.clearPendingConfirm();
  state.pendingConfirmId = item.id;
  const row = state.elements.results.querySelector(
    `.qal-result-item[data-index="${state.selectedIndex}"]`,
  );
  // Inside the row, so the listbox only holds options and the text is
  // read with the selected action.
  row?.classList.add("qal-has-confirm");
  row?.appendChild(buildConfirmStrip(tCount("confirm.closeTabs", affected)));
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
  } else if (item.type === "web-search") {
    browser.runtime.sendMessage({
      action: "web-search",
      query: item.query,
      newTab: Boolean(forceNewTab),
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

function refreshCurrentView(preferredIndex = 0) {
  if (state.elements.input.value.trim()) handleInput();
  else fetchRecentTabs(preferredIndex);
}

async function closeTab(index) {
  const item = state.flatResults[index];
  if (!item || !CLOSABLE_TYPES.includes(item.type) || state.isClosingTab) {
    return;
  }
  state.isClosingTab = true;
  const itemEl = state.elements.results.querySelector(
    `.qal-result-item[data-index="${index}"]`,
  );
  let closed = 0;
  try {
    const result = await browser.runtime.sendMessage({
      action: "close-tab",
      tabId: item.id,
    });
    closed = result?.closed ?? 0;
  } catch (err) {
    console.warn("Quick TAB Launcher popup: close failed", err);
  } finally {
    state.isClosingTab = false;
  }
  if (closed === 0) {
    refreshCurrentView(index);
    return;
  }
  panelView.showPanelToast(t("toast.tabClosed", { title: item.title || item.url }), 1);
  if (item.type === "tab" && itemEl?.isConnected) {
    panelView.removeResultItem(itemEl, item.id);
  } else {
    refreshCurrentView(index);
  }
}

async function closeDomainTabsFromPanel(domain) {
  try {
    const result = await browser.runtime.sendMessage({
      action: "close-domain-tabs",
      domain,
    });
    const closed = result?.closed ?? 0;
    panelView.showPanelToast(tCount("done.close-domain", closed, { domain }), closed);
  } catch (err) {
    console.warn("Quick TAB Launcher popup: closing site tabs failed", err);
  }
  refreshCurrentView();
}

async function undoLastClose() {
  const count = state.panelUndoCount;
  panelView.hidePanelToast();
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
  if (action === "toggle-help") panelView.toggleHelp();
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

  const domainCloseAll = e.target.closest(".qal-domain-close-all");
  if (domainCloseAll) {
    e.stopPropagation();
    closeDomainTabsFromPanel(domainCloseAll.dataset.domain);
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

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.all([loadConfig(), loadLocale()]);
  applyTranslations(document);
  init();

  onLocaleChange(() => {
    applyTranslations(document);
    applyToggleLabels();
    panelView.renderFooter();
    renderEmpty(state.elements.results);
  });
});
