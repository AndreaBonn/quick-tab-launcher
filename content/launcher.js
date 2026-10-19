/* global browser, QAL_CONFIG, QAL_CONFIG_DEFAULTS, mergeWithDefaults, applyConfigToGlobal, CONFIG_STORAGE_KEY, buildFlatResults, t, loadLocale, onLocaleChange, I18N_STORAGE_KEY, I18N_SUPPORTED_LOCALES, setLocaleFromStorage, detectLocale, createElement, renderCommandResults, renderRecentTabs, renderDuplicateBanner, renderEmpty, renderLoading, renderError, updateSelection, reindexItems, filterCommands, loadUserConfig, saveUserConfig, createIcon, renderFooterHints, isMacPlatform, isAltShortcut, tCount, renderGuide, renderQuickActions, buildToast, buildConfirmStrip, renderSearchView, matchCommandsForSearch, loadGuideState, saveGuideState, registerGuideOpen, dismissGuide, shouldShowGuide */

(function () {
  "use strict";

  const HOST_ELEMENT_ID = "qal-shadow-host";
  const RESULTS_ELEMENT_ID = "qal-results";
  const IS_MAC = isMacPlatform(navigator.platform);
  const PANEL_TOAST_MS = 8000;
  const PAGE_TOAST_MS = 6000;
  const DUPLICATES_DISMISSED_KEY = "qal_duplicates_dismissed";
  const QUICK_COMMAND_IDS = [
    "close-duplicates",
    "mute-tab",
    "unmute-tab",
    "pin-tab",
    "unpin-tab",
  ];
  const CLOSABLE_TYPES = ["tab", "recent-active"];

  const state = {
    isVisible: false,
    isGroupedView: false,
    footerMode: "recent",
    isHelpExpanded: false,
    activeTabState: null,
    searchCommands: [],
    pendingConfirmId: null,
    panelUndoCount: 0,
    pageUndoCount: 0,
    isClosingTab: false,
    searchSeq: 0,
    panelToastTimeout: null,
    pageToastTimeout: null,
    guideState: null,
    duplicateSignature: "",
    results: { tabs: [], bookmarks: [], history: [] },
    selectedIndex: -1,
    flatResults: [],
    searchTimeout: null,
    loadingTimeout: null,
    shadowRoot: null,
    elements: {},
  };

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
    applyOverlayTranslations();
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

  function applyOverlayTranslations() {
    const { input, groupToggle, fulltextToggle, settingsBtn } = state.elements;
    settingsBtn.title = t("launcher.settings");
    settingsBtn.setAttribute("aria-label", t("launcher.settings"));
    input.placeholder = t("launcher.placeholder");
    input.setAttribute("aria-label", t("launcher.inputLabel"));
    groupToggle.textContent = t("launcher.groupToggle");
    groupToggle.title = t("launcher.groupToggle.tooltip");
    fulltextToggle.textContent = t("launcher.fulltextToggle");
    updateGroupToggleState();
    updateFulltextToggleState(fulltextToggle);
    renderFooter();
  }

  function updateGroupToggleState() {
    const btn = state.elements.groupToggle;
    btn.classList.toggle("qal-toggle-active", state.isGroupedView);
    btn.setAttribute("aria-pressed", String(state.isGroupedView));
  }

  function updateFulltextToggleState(btn) {
    const isOn = QAL_CONFIG.ENABLE_FULLTEXT_SEARCH;
    btn.classList.toggle("qal-fulltext-active", isOn);
    const tooltipKey = isOn
      ? "launcher.fulltextToggle.tooltip.on"
      : "launcher.fulltextToggle.tooltip.off";
    btn.title = t(tooltipKey);
    btn.setAttribute("aria-pressed", String(isOn));
  }

  async function toggleFulltextSearch() {
    QAL_CONFIG.ENABLE_FULLTEXT_SEARCH = !QAL_CONFIG.ENABLE_FULLTEXT_SEARCH;
    updateFulltextToggleState(state.elements.fulltextToggle);
    try {
      const stored = await loadUserConfig();
      stored.ENABLE_FULLTEXT_SEARCH = QAL_CONFIG.ENABLE_FULLTEXT_SEARCH;
      await saveUserConfig(stored);
    } catch (err) {
      console.warn("Quick TAB Launcher: config save failed", err);
    }
    retriggerSearch();
  }

  function retriggerSearch() {
    const query = state.elements.input.value;
    if (!query.trim()) return;
    handleInput();
  }

  function setupListeners() {
    state.elements.backdrop.addEventListener("click", closeLauncher);
    state.elements.input.addEventListener("input", handleInput);
    state.elements.input.addEventListener("keydown", handleKeydown);
    state.elements.results.addEventListener("click", handleResultClick);
    state.elements.fulltextToggle.addEventListener(
      "click",
      toggleFulltextSearch,
    );
    state.elements.groupToggle.addEventListener("click", toggleGroupedView);
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
    renderFooter();
    updateFulltextToggleState(state.elements.fulltextToggle);
    clearPendingConfirm();
    hidePanelToast();
    renderEmpty(state.elements.results);
    state.elements.quickActions.hidden = false;
    state.elements.duplicatesSlot.replaceChildren();
    state.elements.duplicatesSlot.hidden = false;
    renderQuickActions(state.elements.quickActions, quickCommands());

    fetchRecentTabs();
    checkDuplicates();
    fetchActiveTabState();
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
    hidePanelToast();
  }

  async function fetchRecentTabs(preferredIndex = 0) {
    try {
      const recentData = await browser.runtime.sendMessage({
        action: "get-recent-tabs",
      });
      if (!state.isVisible || state.elements.input.value.trim()) return;
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
      const last = state.flatResults.length - 1;
      state.selectedIndex = Math.min(preferredIndex, last);
      if (state.selectedIndex >= 0) {
        updateSelection(state.elements.results, state.selectedIndex);
      }
    } catch (err) {
      console.warn("Quick TAB Launcher: recent tabs unavailable", err);
    }
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
      showPanelToast(tCount("done.close-duplicates", closed), closed);
      refreshCurrentView();
    } catch (err) {
      console.warn("Quick TAB Launcher: closing duplicates failed", err);
    }
  }

  async function fetchActiveTabState() {
    try {
      state.activeTabState = await browser.runtime.sendMessage({
        action: "get-active-tab-state",
      });
    } catch (err) {
      state.activeTabState = null;
      console.warn("Quick TAB Launcher: tab state unavailable", err);
    }
    if (state.isVisible) {
      renderQuickActions(state.elements.quickActions, quickCommands());
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
    if (action === "toggle-help") toggleHelp();
    else if (action === "dismiss-guide") hideGuideForGood();
    else if (action === "run-command") runCommand(target.dataset.commandId);
    else if (action === "show-commands") showCommandMode();
    else if (action === "undo") undoLastClose();
    else if (action === "enable-fulltext") enableFulltextSearch();
    else if (action === "open-options") openOptions();
  }

  function showCommandMode() {
    state.elements.input.value = ">";
    handleInput();
    state.elements.input.focus();
  }

  function enableFulltextSearch() {
    if (!QAL_CONFIG.ENABLE_FULLTEXT_SEARCH) toggleFulltextSearch();
  }

  function openOptions() {
    browser.runtime.sendMessage({ action: "open-options" });
    closeLauncher();
  }

  function showToastIn(slot, message, undoCount) {
    slot.replaceChildren(buildToast(message, undoCount > 0));
  }

  function showPanelToast(message, undoCount = 0) {
    clearTimeout(state.panelToastTimeout);
    state.panelUndoCount = undoCount;
    showToastIn(state.elements.toastSlot, message, undoCount);
    state.panelToastTimeout = setTimeout(hidePanelToast, PANEL_TOAST_MS);
  }

  function hidePanelToast() {
    clearTimeout(state.panelToastTimeout);
    state.panelUndoCount = 0;
    state.elements.toastSlot.replaceChildren();
  }

  function showPageToast(message, undoCount = 0) {
    clearTimeout(state.pageToastTimeout);
    state.pageUndoCount = undoCount;
    showToastIn(state.elements.pageToastSlot, message, undoCount);
    state.pageToastTimeout = setTimeout(() => {
      state.elements.pageToastSlot.replaceChildren();
    }, PAGE_TOAST_MS);
  }

  async function requestUndo(count) {
    if (count <= 0) return;
    try {
      await browser.runtime.sendMessage({ action: "undo-close", count });
    } catch (err) {
      console.warn("Quick TAB Launcher: undo failed", err);
    }
  }

  async function undoLastClose() {
    const count = state.panelUndoCount;
    hidePanelToast();
    await requestUndo(count);
    refreshCurrentView();
  }

  async function undoFromPage() {
    const count = state.pageUndoCount;
    state.pageUndoCount = 0;
    state.elements.pageToastSlot.replaceChildren();
    await requestUndo(count);
  }

  function refreshCurrentView(preferredIndex = 0) {
    if (!state.isVisible) return;
    if (state.elements.input.value.trim()) retriggerSearch();
    else fetchRecentTabs(preferredIndex);
  }

  async function closeTabFromPanel(index) {
    const item = state.flatResults[index];
    if (!item || !CLOSABLE_TYPES.includes(item.type)) return;
    if (state.isClosingTab) return;
    state.isClosingTab = true;
    // Capture the row before the await: the list may be re-rendered meanwhile.
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
      console.warn("Quick TAB Launcher: close failed", err);
    } finally {
      state.isClosingTab = false;
    }
    if (closed === 0) {
      refreshCurrentView(index);
      return;
    }
    showPanelToast(t("toast.tabClosed", { title: item.title || item.url }), 1);
    if (item.type === "tab" && itemEl?.isConnected) {
      removeResultItem(itemEl, item.id);
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
      showPanelToast(tCount("done.close-domain", closed, { domain }), closed);
    } catch (err) {
      console.warn("Quick TAB Launcher: closing site tabs failed", err);
    }
    retriggerSearch();
  }

  function clearPendingConfirm() {
    state.pendingConfirmId = null;
    state.elements.results.querySelector(".qal-confirm")?.remove();
    state.elements.results
      .querySelector(".qal-has-confirm")
      ?.classList.remove("qal-has-confirm");
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
      console.warn("Quick TAB Launcher: preview failed", err);
    }
    const isStillSelected =
      state.isVisible && state.flatResults[state.selectedIndex]?.id === item.id;
    if (!isStillSelected) return;
    if (affected === 0) {
      closeLauncher();
      showPageToast(t("done.nothing"));
      return;
    }
    clearPendingConfirm();
    state.pendingConfirmId = item.id;
    const row = state.elements.results.querySelector(
      `.qal-result-item[data-index="${state.selectedIndex}"]`,
    );
    // Inside the row, so the listbox only holds options and the text is
    // read with the selected action.
    row?.classList.add("qal-has-confirm");
    row?.appendChild(buildConfirmStrip(tCount("confirm.closeTabs", affected)));
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

  function isCommandMode(query) {
    return query.trimStart().startsWith(">");
  }

  function handleInput() {
    clearTimeout(state.searchTimeout);
    clearTimeout(state.loadingTimeout);
    const query = state.elements.input.value;
    const seq = ++state.searchSeq;
    clearPendingConfirm();
    state.elements.quickActions.hidden = Boolean(query.trim());
    state.elements.duplicatesSlot.hidden = Boolean(query.trim());

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
      handleCommandInput(query.trimStart().slice(1));
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
        // A newer keystroke or a closed panel makes this reply obsolete.
        if (seq !== state.searchSeq || !state.isVisible) return;
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
        console.error("Quick TAB Launcher: search error", err);
        renderError(state.elements.results);
      }
    }, QAL_CONFIG.DEBOUNCE_MS);
  }

  function handleCommandInput(query) {
    const commands = filterCommands(query, state.activeTabState);
    state.flatResults = commands.map((cmd) => ({ ...cmd, type: "command" }));
    state.selectedIndex = state.flatResults.length > 0 ? 0 : -1;
    renderCommandResults(
      state.elements.results,
      commands,
      query,
      state.selectedIndex,
    );
  }

  // Flat list in on-screen order: results first, matching actions last (R7).
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

  function toggleGroupedView() {
    state.isGroupedView = !state.isGroupedView;
    updateGroupToggleState();
    const query = state.elements.input.value;
    if (query.trim() && !isCommandMode(query)) {
      rebuildFlatResults();
      renderCurrentView(query);
    }
  }

  function handleKeydown(e) {
    if (isAltShortcut(e, "c")) {
      e.preventDefault();
      toggleFulltextSearch();
      return;
    }

    if (isAltShortcut(e, "g")) {
      e.preventDefault();
      toggleGroupedView();
      return;
    }

    if (e.key === "?" && !state.elements.input.value) {
      e.preventDefault();
      toggleHelp();
      return;
    }

    if (isAltShortcut(e, "w")) {
      e.preventDefault();
      if (!e.repeat) closeTabFromPanel(state.selectedIndex);
      return;
    }

    if (isAltShortcut(e, "z") && state.panelUndoCount > 0) {
      e.preventDefault();
      undoLastClose();
      return;
    }

    if (e.key === "Escape" && state.pendingConfirmId) {
      e.preventDefault();
      clearPendingConfirm();
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
          const item = state.flatResults[state.selectedIndex];
          navigateTo(item, e.ctrlKey || e.metaKey);
        }
        break;
      case "Escape":
        e.preventDefault();
        closeLauncher();
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
      closeLauncher();
    } else if (item.type === "command") {
      if (item.confirm && state.pendingConfirmId !== item.id) {
        requestConfirm(item);
      } else {
        runCommand(item.id);
      }
    } else {
      browser.runtime.sendMessage({
        action: "navigate",
        type: item.type,
        url: item.url,
        openInCurrent: !forceNewTab,
      });
    }
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

  function handleResultClick(e) {
    const closeBtn = e.target.closest(".qal-close-tab");
    if (closeBtn) {
      e.stopPropagation();
      const itemEl = closeBtn.closest(".qal-result-item");
      closeTabFromPanel(Number(itemEl.dataset.index));
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

  function removeResultItem(itemEl, tabId) {
    state.results.tabs = state.results.tabs.filter((tab) => tab.id !== tabId);
    rebuildFlatResults();

    itemEl.remove();

    const tabSection = state.elements.results.querySelector(
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

  async function loadConfig() {
    try {
      const result = await browser.storage.local.get(CONFIG_STORAGE_KEY);
      const userConfig = result[CONFIG_STORAGE_KEY] ?? {};
      const merged = mergeWithDefaults(QAL_CONFIG_DEFAULTS, userConfig);
      applyConfigToGlobal(QAL_CONFIG, merged);
    } catch (err) {
      console.warn("Quick TAB Launcher: config load failed", err);
    }
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[CONFIG_STORAGE_KEY]) {
      const userConfig = changes[CONFIG_STORAGE_KEY].newValue ?? {};
      const merged = mergeWithDefaults(QAL_CONFIG_DEFAULTS, userConfig);
      applyConfigToGlobal(QAL_CONFIG, merged);
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
