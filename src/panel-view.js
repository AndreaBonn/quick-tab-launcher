/* global buildFlatResults, renderSearchView, updateSelection, reindexItems, renderFooterHints, isMacPlatform, QAL_CONFIG, buildToast */

const PANEL_TOAST_MS = 8000;

function createPanelState() {
  return {
    results: { tabs: [], bookmarks: [], history: [] },
    selectedIndex: -1,
    flatResults: [],
    searchCommands: [],
    searchTimeout: null,
    searchSeq: 0,
    loadingTimeout: null,
    panelToastTimeout: null,
    footerMode: "recent",
    isHelpExpanded: false,
    isGroupedView: false,
    activeTabState: null,
    webSearchEnabled: false,
    pendingConfirmId: null,
    panelUndoCount: 0,
    isClosingTab: false,
  };
}

function isCommandMode(query) {
  return query.trimStart().startsWith(">");
}

function createPanelView({ state, elements }) {
  const context = { state, elements };
  return {
    renderFooter: panelRenderFooter.bind(null, context),
    setFooterMode: panelSetFooterMode.bind(null, context),
    toggleHelp: panelToggleHelp.bind(null, context),
    showPanelToast: panelShowPanelToast.bind(null, context),
    hidePanelToast: panelHidePanelToast.bind(null, context),
    clearPendingConfirm: panelClearPendingConfirm.bind(null, context),
    rebuildFlatResults: panelRebuildFlatResults.bind(null, context),
    renderCurrentView: panelRenderCurrentView.bind(null, context),
    selectNext: panelSelectNext.bind(null, context),
    selectPrev: panelSelectPrev.bind(null, context),
    removeResultItem: panelRemoveResultItem.bind(null, context),
  };
}

function panelRenderFooter(context) {
  const { state, elements } = context;
  renderFooterHints(elements.footer, {
    mode: state.footerMode,
    expanded: state.isHelpExpanded,
    isMac: isMacPlatform(navigator.platform),
  });
}

function panelSetFooterMode(context, mode) {
  const { state } = context;
  if (state.footerMode === mode) return;
  state.footerMode = mode;
  panelRenderFooter(context);
}

function panelToggleHelp(context) {
  const { state } = context;
  state.isHelpExpanded = !state.isHelpExpanded;
  panelRenderFooter(context);
}

function panelShowPanelToast(context, message, undoCount = 0) {
  const { state, elements } = context;
  clearTimeout(state.panelToastTimeout);
  state.panelUndoCount = undoCount;
  elements.toastSlot.replaceChildren(buildToast(message, undoCount > 0));
  state.panelToastTimeout = setTimeout(
    () => panelHidePanelToast(context),
    PANEL_TOAST_MS,
  );
}

function panelHidePanelToast(context) {
  const { state, elements } = context;
  clearTimeout(state.panelToastTimeout);
  state.panelUndoCount = 0;
  elements.toastSlot.replaceChildren();
}

function panelClearPendingConfirm(context) {
  const { state, elements } = context;
  state.pendingConfirmId = null;
  elements.results.querySelector(".qal-confirm")?.remove();
  elements.results
    .querySelector(".qal-has-confirm")
    ?.classList.remove("qal-has-confirm");
}

function panelRebuildFlatResults(context) {
  const { state, elements } = context;
  state.flatResults = [
    ...buildFlatResults(state.results, { grouped: state.isGroupedView }),
    ...state.searchCommands.map((cmd) => ({ ...cmd, type: "command" })),
  ];
  // Nothing matched: the web search row is the only result (R9).
  const query = elements.input.value.trim();
  if (state.flatResults.length === 0 && state.webSearchEnabled && query) {
    state.flatResults = [{ type: "web-search", query }];
  }
}

function panelRenderCurrentView(context, query) {
  const { state, elements } = context;
  renderSearchView(elements.results, {
    results: state.results,
    commands: state.searchCommands,
    query,
    selectedIndex: state.selectedIndex,
    grouped: state.isGroupedView,
    tips: {
      fulltextEnabled: QAL_CONFIG.ENABLE_FULLTEXT_SEARCH,
      historyDays: QAL_CONFIG.HISTORY_DAYS,
      webSearchEnabled: state.webSearchEnabled,
    },
  });
}

function panelSelectNext(context) {
  const { state, elements } = context;
  if (state.flatResults.length === 0) return;
  panelClearPendingConfirm(context);
  state.selectedIndex = (state.selectedIndex + 1) % state.flatResults.length;
  updateSelection(elements.results, state.selectedIndex);
}

function panelSelectPrev(context) {
  const { state, elements } = context;
  if (state.flatResults.length === 0) return;
  panelClearPendingConfirm(context);
  state.selectedIndex =
    state.selectedIndex <= 0
      ? state.flatResults.length - 1
      : state.selectedIndex - 1;
  updateSelection(elements.results, state.selectedIndex);
}

function panelRemoveResultItem(context, itemEl, tabId) {
  const { state, elements } = context;
  state.results.tabs = state.results.tabs.filter((tab) => tab.id !== tabId);
  panelRebuildFlatResults(context);
  // Last result gone: re-render so what Enter runs (web row or nothing)
  // is what the list shows.
  if (state.flatResults.every((item) => item.type === "web-search")) {
    state.selectedIndex = state.flatResults.length > 0 ? 0 : -1;
    panelRenderCurrentView(context, elements.input.value);
    return;
  }

  itemEl.remove();

  updatePanelTabSection(elements.results);

  reindexItems(elements.results);

  if (state.selectedIndex >= state.flatResults.length) {
    state.selectedIndex = state.flatResults.length - 1;
  }
  updateSelection(elements.results, state.selectedIndex);
}

function updatePanelTabSection(container) {
  const tabSection = container.querySelector(
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
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createPanelView, createPanelState, isCommandMode };
}
