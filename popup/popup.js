/* global createPanelState, createPanelView, browser, QAL_CONFIG, loadStoredConfig, applyConfigChange, CONFIG_STORAGE_KEY, renderEmpty, loadLocale, applyTranslations, onLocaleChange, createIcon, t, createPanelController */

const state = {
  ...createPanelState(),
  elements: {},
};

let panelView;
let panelController;

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
  panelController.updateToggleStates();
}

function setupPanelController() {
  panelController = createPanelController({
    state, elements: state.elements, logPrefix: "Quick TAB Launcher popup",
    hooks: {
      isActive: () => true,
      close: () => window.close(),
      afterNavigate: () => window.close(),
      runCommand,
      onNothingToConfirm: () => panelView.showPanelToast(t("done.nothing")),
      onQueryChange: () => {},
      onActiveTabState: () => {},
    },
  });
}

function runCommand(commandId) {
  browser.runtime.sendMessage({ action: "execute-command", commandId });
  window.close();
}

function init() {
  captureElements();
  panelView = createPanelView({ state, elements: state.elements });
  setupPanelController();
  const { input, results } = state.elements;

  const lens = createIcon("search", 18);
  if (lens) document.querySelector(".qal-search-icon").appendChild(lens);
  results.activeDescendantOwner = input;
  applyToggleLabels();
  panelView.renderFooter();

  renderEmpty(results);
  input.focus();

  panelController.fetchRecentTabs();
  panelController.fetchActiveTabState();
  panelController.fetchWebSearchState();

  setupListeners();
}

function setupListeners() {
  const { input, results, groupToggle, fulltextToggle } = state.elements;
  input.addEventListener("input", panelController.handleInput);
  input.addEventListener("keydown", panelController.handleKeydown);
  results.addEventListener("click", panelController.handleResultClick);
  groupToggle.addEventListener("click", panelController.toggleGroupedView);
  fulltextToggle.addEventListener("click", panelController.toggleFulltextSearch);
  document.body.addEventListener("click", handleAction);

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[CONFIG_STORAGE_KEY]) return;
    applyConfigChange(QAL_CONFIG, changes);
    panelController.updateToggleStates();
  });
}

function handleAction(e) {
  const target = e.target.closest("[data-qal-action]");
  if (!target) return;
  const action = target.dataset.qalAction;
  if (action === "toggle-help") panelView.toggleHelp();
  else if (action === "undo") panelController.undoLastClose();
  else if (action === "enable-fulltext" && !QAL_CONFIG.ENABLE_FULLTEXT_SEARCH) {
    panelController.toggleFulltextSearch();
  } else if (action === "open-options") {
    browser.runtime.openOptionsPage();
    window.close();
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
