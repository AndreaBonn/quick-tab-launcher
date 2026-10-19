/* global createPanelView, createPanelActions, isCommandMode, browser, QAL_CONFIG, renderEmpty, renderLoading, renderError, renderCommandResults, renderRecentTabs, updateSelection, filterCommands, matchCommandsForSearch, loadUserConfig, saveUserConfig, t */

/**
 * Host contract: every hook is required, the controller has no defaults.
 * @typedef {object} PanelHooks
 * @property {() => boolean} isActive Whether the host is showing the panel; late replies are dropped when false.
 * @property {() => void} close Close the host (Escape with nothing to cancel).
 * @property {(item: object) => void} afterNavigate Called after a result was opened, with the selected item.
 * @property {(commandId: string) => void} runCommand Run a command; the host owns closing and feedback.
 * @property {() => void} onNothingToConfirm A confirmable command would affect nothing.
 * @property {(query: string) => void} onQueryChange The input changed; receives the raw query.
 * @property {() => void} onActiveTabState The active tab state was refreshed and the host is active.
 */

function createPanelController({ state, elements, hooks, logPrefix = "Quick TAB Launcher" }) {
  const context = { state, elements, hooks, logPrefix, view: createPanelView({ state, elements }) };
  const controller = { state, view: context.view, ...createPanelActions(context) };
  context.controller = controller;
  const methods = {
    handleInput: panelHandleInput, fetchRecentTabs: panelFetchRecentTabs,
    fetchActiveTabState: panelFetchActiveTabState, fetchWebSearchState: panelFetchWebSearchState,
    toggleGroupedView: panelToggleGroupedView, toggleFulltextSearch: panelToggleFulltextSearch,
    refreshCurrentView: panelRefreshCurrentView, retriggerSearch: panelRetriggerSearch,
    updateToggleStates: panelUpdateToggleStates, cancelPendingSearch: panelCancelPendingSearch,
  };
  for (const [name, method] of Object.entries(methods)) controller[name] = method.bind(null, context);
  return controller;
}

function panelHandleInput(context) {
  const { state, elements, hooks, view, controller } = context;
  clearTimeout(state.searchTimeout);
  clearTimeout(state.loadingTimeout);
  const query = elements.input.value;
  const seq = ++state.searchSeq;
  view.clearPendingConfirm();
  hooks.onQueryChange(query);
  if (!query.trim()) {
    view.setFooterMode("recent");
    renderEmpty(elements.results);
    state.flatResults = [];
    state.selectedIndex = -1;
    controller.fetchRecentTabs();
    return;
  }
  if (isCommandMode(query)) {
    view.setFooterMode("commands");
    panelHandleCommandInput(context, query.trimStart().slice(1));
    return;
  }
  view.setFooterMode("search");
  panelScheduleSearch(context, query, seq);
}

function panelCancelPendingSearch({ state }) {
  clearTimeout(state.searchTimeout);
  clearTimeout(state.loadingTimeout);
  state.searchSeq += 1;
}

function panelScheduleSearch(context, query, seq) {
  const { state, elements } = context;
  state.loadingTimeout = setTimeout(() => {
    renderLoading(elements.results);
  }, QAL_CONFIG.LOADING_THRESHOLD_MS);
  state.searchTimeout = setTimeout(
    () => panelSearch(context, query, seq), QAL_CONFIG.DEBOUNCE_MS,
  );
}

async function panelSearch(context, query, seq) {
  const { state, elements, hooks, logPrefix } = context;
  try {
    const results = await browser.runtime.sendMessage({ action: "search", query });
    if (seq !== state.searchSeq || !hooks.isActive()) return;
    clearTimeout(state.loadingTimeout);
    panelApplySearchReply(context, query, results);
  } catch (err) {
    if (seq !== state.searchSeq || !hooks.isActive()) return;
    clearTimeout(state.loadingTimeout);
    console.error(`${logPrefix}: search error`, err);
    renderError(elements.results);
  }
}

function panelApplySearchReply({ state, view }, query, results) {
  state.results = results;
  state.searchCommands = matchCommandsForSearch(query, state.activeTabState);
  view.rebuildFlatResults();
  state.selectedIndex = state.flatResults.length > 0 ? 0 : -1;
  view.renderCurrentView(query);
}

function panelHandleCommandInput({ state, elements }, query) {
  const commands = filterCommands(query, state.activeTabState);
  state.flatResults = commands.map((cmd) => ({ ...cmd, type: "command" }));
  state.selectedIndex = state.flatResults.length > 0 ? 0 : -1;
  renderCommandResults(elements.results, commands, query, state.selectedIndex);
}

async function panelFetchRecentTabs({ state, elements, hooks, logPrefix }, preferredIndex = 0) {
  try {
    const recentData = await browser.runtime.sendMessage({ action: "get-recent-tabs" });
    if (!hooks.isActive() || elements.input.value.trim()) return;
    renderRecentTabs(elements.results, recentData);
    state.flatResults = [
      ...recentData.recentActive.map((item) => ({ ...item, type: "recent-active" })),
      ...recentData.recentlyClosed.map((item) => ({ ...item, type: "recent-closed" })),
    ];
    state.selectedIndex = Math.min(preferredIndex, state.flatResults.length - 1);
    if (state.selectedIndex >= 0) updateSelection(elements.results, state.selectedIndex);
  } catch (err) {
    console.warn(`${logPrefix}: recent tabs unavailable`, err);
  }
}

async function panelFetchActiveTabState({ state, hooks, logPrefix }) {
  try {
    state.activeTabState = await browser.runtime.sendMessage({ action: "get-active-tab-state" });
  } catch (err) {
    state.activeTabState = null;
    console.warn(`${logPrefix}: tab state unavailable`, err);
  }
  if (hooks.isActive()) hooks.onActiveTabState();
}

async function panelFetchWebSearchState({ state, logPrefix }) {
  try {
    const reply = await browser.runtime.sendMessage({ action: "get-web-search-state" });
    state.webSearchEnabled = Boolean(reply?.enabled);
  } catch (err) {
    state.webSearchEnabled = false;
    console.warn(`${logPrefix}: web search state unavailable`, err);
  }
}

function panelToggleGroupedView(context) {
  const { state, elements, view } = context;
  state.isGroupedView = !state.isGroupedView;
  panelUpdateToggleStates(context);
  const query = elements.input.value;
  if (query.trim() && !isCommandMode(query)) {
    view.rebuildFlatResults();
    view.renderCurrentView(query);
  }
}

async function panelToggleFulltextSearch(context) {
  QAL_CONFIG.ENABLE_FULLTEXT_SEARCH = !QAL_CONFIG.ENABLE_FULLTEXT_SEARCH;
  panelUpdateToggleStates(context);
  try {
    const stored = await loadUserConfig();
    stored.ENABLE_FULLTEXT_SEARCH = QAL_CONFIG.ENABLE_FULLTEXT_SEARCH;
    await saveUserConfig(stored);
  } catch (err) {
    console.warn(`${context.logPrefix}: config save failed`, err);
  }
  panelRetriggerSearch(context);
}

function panelUpdateToggleStates({ state, elements }) {
  const { groupToggle, fulltextToggle } = elements;
  groupToggle.classList.toggle("qal-toggle-active", state.isGroupedView);
  groupToggle.setAttribute("aria-pressed", String(state.isGroupedView));
  const isOn = QAL_CONFIG.ENABLE_FULLTEXT_SEARCH;
  fulltextToggle.classList.toggle("qal-fulltext-active", isOn);
  fulltextToggle.setAttribute("aria-pressed", String(isOn));
  fulltextToggle.title = t(isOn
    ? "launcher.fulltextToggle.tooltip.on"
    : "launcher.fulltextToggle.tooltip.off");
}

function panelRetriggerSearch({ elements, controller }) {
  if (elements.input.value.trim()) controller.handleInput();
}

function panelRefreshCurrentView({ elements, hooks, controller }, preferredIndex = 0) {
  if (!hooks.isActive()) return;
  if (elements.input.value.trim()) controller.handleInput();
  else controller.fetchRecentTabs(preferredIndex);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createPanelController };
}
