/* global createPanelState, createPanelView, browser, QAL_CONFIG, loadStoredConfig, applyConfigChange, CONFIG_STORAGE_KEY, t, loadLocale, onLocaleChange, I18N_STORAGE_KEY, I18N_SUPPORTED_LOCALES, setLocaleFromStorage, detectLocale, createElement, renderDuplicateBanner, renderEmpty, filterCommands, createIcon, tCount, renderGuide, renderQuickActions, buildToast, loadGuideState, saveGuideState, registerGuideOpen, dismissGuide, shouldShowGuide, createPanelController */

(function () {
  "use strict";

  const HOST_ELEMENT_ID = "qal-shadow-host";
  const RESULTS_ELEMENT_ID = "qal-results";
  const PAGE_TOAST_MS = 6000;
  const DUPLICATES_DISMISSED_KEY = "qal_duplicates_dismissed";
  const QUICK_COMMAND_IDS = [
    "close-duplicates",
    "mute-tab",
    "unmute-tab",
    "pin-tab",
    "unpin-tab",
  ];

  const state = {
    ...createPanelState(),
    isVisible: false,
    pageUndoCount: 0,
    pageToastTimeout: null,
    guideState: null,
    duplicateSignature: "",
    shadowRoot: null,
    elements: {},
  };

  let panelView;
  let panelController;

  function init() {
    if (document.getElementById(HOST_ELEMENT_ID)) return;

    const host = document.createElement("div");
    host.id = HOST_ELEMENT_ID;
    document.documentElement.appendChild(host);

    state.shadowRoot = host.attachShadow({ mode: "closed" });
    loadStyles();
    createOverlayDOM();
    setupListeners();
  }

  function loadStyles() {
    const cssUrl = browser.runtime.getURL("content/launcher.css");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssUrl;
    state.shadowRoot.appendChild(link);
  }

  function createOverlayDOM() {
    const overlay = createElement("div", "qal-overlay");
    overlay.style.display = "none";

    const backdrop = createElement("div", "qal-backdrop");
    const panel = createElement("div", "qal-panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Quick Tab Launcher");

    const searchContainer = createElement("div", "qal-search-container");
    const searchIcon = createElement("span", "qal-search-icon");
    const lens = createIcon("search", 18);
    if (lens) searchIcon.appendChild(lens);
    const input = createElement("input", "qal-input");
    input.type = "text";
    input.placeholder = t("launcher.placeholder");
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-label", t("launcher.inputLabel"));
    input.setAttribute("aria-controls", RESULTS_ELEMENT_ID);
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-autocomplete", "list");

    const groupToggle = createElement("button", "qal-toggle qal-group-toggle");
    groupToggle.type = "button";
    const fulltextToggle = createElement(
      "button",
      "qal-toggle qal-fulltext-toggle",
    );
    fulltextToggle.type = "button";

    const settingsBtn = createElement("button", "qal-icon-btn");
    settingsBtn.type = "button";
    settingsBtn.dataset.qalAction = "open-options";
    const gear = createIcon("gear");
    if (gear) settingsBtn.appendChild(gear);

    searchContainer.append(
      searchIcon,
      input,
      groupToggle,
      fulltextToggle,
      settingsBtn,
    );

    const quickActions = createElement("div", "qal-quick-actions");
    const guide = createElement("div", "qal-guide");
    guide.hidden = true;
    const toastSlot = createElement("div", "qal-toast-slot");
    toastSlot.setAttribute("aria-live", "polite");
    // The banner has its own buttons, so it lives outside the listbox.
    const duplicatesSlot = createElement("div", "qal-duplicates-slot");

    const results = createElement("div", "qal-results");
    results.id = RESULTS_ELEMENT_ID;
    results.setAttribute("role", "listbox");
    results.activeDescendantOwner = input;
    const footer = createElement("div", "qal-footer");

    panel.append(
      searchContainer,
      quickActions,
      guide,
      toastSlot,
      duplicatesSlot,
      results,
      footer,
    );
    overlay.append(backdrop, panel);
    // Outcome messages shown after the panel closes (C2) live outside it.
    const pageToastSlot = createElement("div", "qal-page-toast-slot");
    pageToastSlot.setAttribute("aria-live", "polite");
    state.shadowRoot.append(overlay, pageToastSlot);

    state.elements = {
      overlay,
      backdrop,
      panel,
      input,
      results,
      footer,
      groupToggle,
      fulltextToggle,
      settingsBtn,
      quickActions,
      guide,
      toastSlot,
      duplicatesSlot,
      pageToastSlot,
    };
    panelView = createPanelView({ state, elements: state.elements });
    setupPanelController();
    applyOverlayTranslations();
  }

  function setupPanelController() {
    panelController = createPanelController({
      state, elements: state.elements,
      hooks: {
        isActive: () => state.isVisible,
        close: closeLauncher,
        afterNavigate: (item) => {
          if (["recent-closed", "web-search"].includes(item.type)) closeLauncher();
        },
        runCommand,
        onNothingToConfirm: () => {
          closeLauncher();
          showPageToast(t("done.nothing"));
        },
        onQueryChange: (query) => {
          state.elements.quickActions.hidden = Boolean(query.trim());
          state.elements.duplicatesSlot.hidden = Boolean(query.trim());
        },
        onActiveTabState: () => renderQuickActions(state.elements.quickActions, quickCommands()),
      },
    });
  }

  function applyOverlayTranslations() {
    const { input, groupToggle, fulltextToggle, settingsBtn } = state.elements;
    settingsBtn.title = t("launcher.settings");
    settingsBtn.setAttribute("aria-label", t("launcher.settings"));
    input.placeholder = t("launcher.placeholder");
    input.setAttribute("aria-label", t("launcher.inputLabel"));
    groupToggle.textContent = t("launcher.groupToggle");
    groupToggle.title = t("launcher.groupToggle.tooltip");
    fulltextToggle.textContent = t("launcher.fulltextToggle");
    panelController.updateToggleStates();
    panelView.renderFooter();
  }

  function setupListeners() {
    state.elements.backdrop.addEventListener("click", closeLauncher);
    state.elements.input.addEventListener("input", panelController.handleInput);
    state.elements.input.addEventListener("keydown", panelController.handleKeydown);
    state.elements.results.addEventListener("click", panelController.handleResultClick);
    state.elements.fulltextToggle.addEventListener(
      "click",
      panelController.toggleFulltextSearch,
    );
    state.elements.groupToggle.addEventListener("click", panelController.toggleGroupedView);
    state.elements.panel.addEventListener("click", handlePanelAction);
    state.elements.duplicatesSlot.addEventListener("click", handleBannerClick);
    state.elements.pageToastSlot.addEventListener("click", (e) => {
      if (e.target.closest('[data-qal-action="undo"]')) undoFromPage();
    });

    onLocaleChange(() => {
      applyOverlayTranslations();
    });
  }

  function toggleLauncher() {
    if (state.isVisible) {
      closeLauncher();
    } else {
      openLauncher();
    }
  }

  function openLauncher() {
    state.isVisible = true;
    state.elements.overlay.style.display = "";
    state.elements.input.value = "";
    state.selectedIndex = -1;
    state.flatResults = [];
    state.isHelpExpanded = false;
    state.footerMode = "recent";
    panelView.renderFooter();
    panelController.updateToggleStates();
    panelView.clearPendingConfirm();
    panelView.hidePanelToast();
    renderEmpty(state.elements.results);
    state.elements.quickActions.hidden = false;
    state.elements.duplicatesSlot.replaceChildren();
    state.elements.duplicatesSlot.hidden = false;
    renderQuickActions(state.elements.quickActions, quickCommands());

    panelController.fetchRecentTabs();
    checkDuplicates();
    panelController.fetchActiveTabState();
    panelController.fetchWebSearchState();
    showGuideIfNeeded();

    requestAnimationFrame(() => {
      state.elements.input.focus();
      state.elements.input.select();
    });
  }

  function closeLauncher() {
    state.isVisible = false;
    state.elements.overlay.style.display = "none";
    clearTimeout(state.searchTimeout);
    clearTimeout(state.loadingTimeout);
    state.results = { tabs: [], bookmarks: [], history: [] };
    state.searchCommands = [];
    state.selectedIndex = -1;
    state.flatResults = [];
    state.pendingConfirmId = null;
    panelView.hidePanelToast();
  }

  function duplicateSignature(summary) {
    const pages = (summary.groups || []).map((g) => `${g.url}#${g.extra}`);
    return [summary.count, ...pages].join("|");
  }

  async function checkDuplicates() {
    try {
      const summary = await browser.runtime.sendMessage({
        action: "get-duplicate-count",
      });
      if (!state.isVisible || !summary || summary.count <= 0) return;
      state.duplicateSignature = duplicateSignature(summary);
      const stored = await browser.storage.local.get(DUPLICATES_DISMISSED_KEY);
      // "Not now" hides the banner until the set of duplicates changes.
      if (stored[DUPLICATES_DISMISSED_KEY] === state.duplicateSignature) return;
      if (!state.isVisible) return;
      renderDuplicateBanner(state.elements.duplicatesSlot, summary);
    } catch (err) {
      console.warn("Quick TAB Launcher: duplicate check failed", err);
    }
  }

  function dismissDuplicateBanner(banner) {
    banner.remove();
    browser.storage.local
      .set({ [DUPLICATES_DISMISSED_KEY]: state.duplicateSignature })
      .catch((err) => console.warn("Quick TAB Launcher: save failed", err));
  }

  async function closeDuplicatesFromBanner(banner) {
    banner.remove();
    try {
      const result = await browser.runtime.sendMessage({
        action: "close-duplicates",
      });
      const closed = result?.closed ?? 0;
      panelView.showPanelToast(tCount("done.close-duplicates", closed), closed);
      panelController.refreshCurrentView();
    } catch (err) {
      console.warn("Quick TAB Launcher: closing duplicates failed", err);
    }
  }

  function quickCommands() {
    return filterCommands("", state.activeTabState).filter((cmd) =>
      QUICK_COMMAND_IDS.includes(cmd.id),
    );
  }

  async function showGuideIfNeeded() {
    const { guide } = state.elements;
    try {
      state.guideState = registerGuideOpen(await loadGuideState());
      await saveGuideState(state.guideState);
      guide.hidden = !shouldShowGuide(state.guideState);
      if (!guide.hidden) renderGuide(guide);
    } catch (err) {
      guide.hidden = true;
      console.warn("Quick TAB Launcher: guide state unavailable", err);
    }
  }

  function hideGuideForGood() {
    state.elements.guide.hidden = true;
    if (!state.guideState) return;
    state.guideState = dismissGuide(state.guideState);
    saveGuideState(state.guideState).catch((err) =>
      console.warn("Quick TAB Launcher: save failed", err),
    );
  }

  function handlePanelAction(e) {
    const target = e.target.closest("[data-qal-action]");
    if (!target) return;
    const action = target.dataset.qalAction;
    if (action === "toggle-help") panelView.toggleHelp();
    else if (action === "dismiss-guide") hideGuideForGood();
    else if (action === "run-command") runCommand(target.dataset.commandId);
    else if (action === "show-commands") showCommandMode();
    else if (action === "undo") panelController.undoLastClose();
    else if (action === "enable-fulltext") enableFulltextSearch();
    else if (action === "open-options") openOptions();
  }

  function showCommandMode() {
    state.elements.input.value = ">";
    panelController.handleInput();
    state.elements.input.focus();
  }

  function enableFulltextSearch() {
    if (!QAL_CONFIG.ENABLE_FULLTEXT_SEARCH) panelController.toggleFulltextSearch();
  }

  function openOptions() {
    browser.runtime.sendMessage({ action: "open-options" });
    closeLauncher();
  }

  function showToastIn(slot, message, undoCount) {
    slot.replaceChildren(buildToast(message, undoCount > 0));
  }

  function showPageToast(message, undoCount = 0) {
    clearTimeout(state.pageToastTimeout);
    state.pageUndoCount = undoCount;
    showToastIn(state.elements.pageToastSlot, message, undoCount);
    state.pageToastTimeout = setTimeout(() => {
      state.elements.pageToastSlot.replaceChildren();
    }, PAGE_TOAST_MS);
  }

  async function undoFromPage() {
    const count = state.pageUndoCount;
    state.pageUndoCount = 0;
    state.elements.pageToastSlot.replaceChildren();
    await panelController.requestUndo(count);
  }

  function outcomeMessage(commandId, result) {
    if (!result?.success) return t("done.failed");
    if (result.closed === undefined) return t(`done.${commandId}`);
    if (result.closed === 0) return t("done.nothing");
    return tCount(`done.${commandId}`, result.closed);
  }

  async function runCommand(commandId) {
    closeLauncher();
    let result = null;
    try {
      result = await browser.runtime.sendMessage({
        action: "execute-command",
        commandId,
      });
    } catch (err) {
      console.warn("Quick TAB Launcher: command failed", err);
    }
    showPageToast(outcomeMessage(commandId, result), result?.closed ?? 0);
  }

  function handleBannerClick(e) {
    const dupDismiss = e.target.closest(".qal-duplicate-dismiss");
    if (dupDismiss) {
      e.stopPropagation();
      dismissDuplicateBanner(dupDismiss.closest(".qal-duplicate-banner"));
      return;
    }

    const dupAction = e.target.closest(".qal-duplicate-action");
    if (dupAction) {
      e.stopPropagation();
      closeDuplicatesFromBanner(dupAction.closest(".qal-duplicate-banner"));
      return;
    }
  }

  async function loadConfig() {
    try {
      await loadStoredConfig(QAL_CONFIG);
    } catch (err) {
      console.warn("Quick TAB Launcher: config load failed", err);
    }
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[CONFIG_STORAGE_KEY]) {
      applyConfigChange(QAL_CONFIG, changes);
    }
    if (changes[I18N_STORAGE_KEY]) {
      const newLang = changes[I18N_STORAGE_KEY].newValue;
      // No value: the user went back to following Firefox's language.
      const lang = newLang ?? detectLocale();
      if (I18N_SUPPORTED_LOCALES.includes(lang)) {
        setLocaleFromStorage(lang);
        applyOverlayTranslations();
      }
    }
  });

  // Registered before the async bootstrap so a toggle sent right after an
  // on-demand injection is not lost: it waits until the panel exists.
  let isReady = false;
  let hasPendingToggle = false;
  browser.runtime.onMessage.addListener((message) => {
    if (!isReady) {
      if (message.action === "toggle") hasPendingToggle = !hasPendingToggle;
      return;
    }
    if (message.action === "toggle") toggleLauncher();
    if (message.action === "close") closeLauncher();
  });

  async function bootstrap() {
    await Promise.all([loadConfig(), loadLocale()]);
    init();
    isReady = true;
    if (hasPendingToggle) toggleLauncher();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
