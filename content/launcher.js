/* global browser, QAL_CONFIG, QAL_CONFIG_DEFAULTS, mergeWithDefaults, applyConfigToGlobal, CONFIG_STORAGE_KEY, buildFlatResults, t, loadLocale, onLocaleChange, I18N_STORAGE_KEY, I18N_SUPPORTED_LOCALES, setLocaleFromStorage, createElement, renderResults, renderGroupedResults, renderCommandResults, renderRecentTabs, renderDuplicateBanner, renderEmpty, renderLoading, renderError, updateSelection, reindexItems, filterCommands, loadUserConfig, saveUserConfig, createIcon, renderFooterHints, isMacPlatform */

(function () {
  "use strict";

  const HOST_ELEMENT_ID = "qal-shadow-host";
  const RESULTS_ELEMENT_ID = "qal-results";
  const IS_MAC = isMacPlatform(navigator.platform);

  const state = {
    isVisible: false,
    isGroupedView: false,
    footerMode: "recent",
    isHelpExpanded: false,
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

    searchContainer.append(searchIcon, input, groupToggle, fulltextToggle);

    const results = createElement("div", "qal-results");
    results.id = RESULTS_ELEMENT_ID;
    results.setAttribute("role", "listbox");
    results.activeDescendantOwner = input;
    const footer = createElement("div", "qal-footer");

    panel.append(searchContainer, results, footer);
    overlay.append(backdrop, panel);
    state.shadowRoot.appendChild(overlay);

    state.elements = {
      overlay,
      backdrop,
      input,
      results,
      footer,
      groupToggle,
      fulltextToggle,
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
    const { input, groupToggle, fulltextToggle } = state.elements;
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
    state.elements.footer.addEventListener("click", (e) => {
      if (e.target.closest('[data-qal-action="toggle-help"]')) toggleHelp();
    });

    browser.runtime.onMessage.addListener((message) => {
      if (message.action === "toggle") toggleLauncher();
      if (message.action === "close") closeLauncher();
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
    renderEmpty(state.elements.results);

    fetchRecentTabs();
    checkDuplicates();

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
    state.selectedIndex = -1;
    state.flatResults = [];
  }

  async function fetchRecentTabs() {
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
      state.selectedIndex = state.flatResults.length > 0 ? 0 : -1;
      if (state.selectedIndex >= 0) {
        updateSelection(state.elements.results, state.selectedIndex);
      }
    } catch (err) {
      console.warn("Quick TAB Launcher: recent tabs unavailable", err);
    }
  }

  async function checkDuplicates() {
    try {
      const result = await browser.runtime.sendMessage({
        action: "get-duplicate-count",
      });
      if (!state.isVisible || result.count <= 0) return;
      renderDuplicateBanner(state.elements.results, result.count);
    } catch (err) {
      console.warn("Quick TAB Launcher: duplicate check failed", err);
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
        clearTimeout(state.loadingTimeout);
        state.results = results;
        state.flatResults = buildFlatResults(results, {
          grouped: state.isGroupedView,
        });
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
    const commands = filterCommands(query);
    state.flatResults = commands.map((cmd) => ({ ...cmd, type: "command" }));
    state.selectedIndex = state.flatResults.length > 0 ? 0 : -1;
    renderCommandResults(
      state.elements.results,
      commands,
      query,
      state.selectedIndex,
    );
  }

  function renderCurrentView(query) {
    if (state.isGroupedView) {
      renderGroupedResults(
        state.elements.results,
        state.results,
        query,
        state.selectedIndex,
      );
    } else {
      renderResults(
        state.elements.results,
        state.results,
        query,
        state.selectedIndex,
      );
    }
  }

  function toggleGroupedView() {
    state.isGroupedView = !state.isGroupedView;
    updateGroupToggleState();
    const query = state.elements.input.value;
    if (query.trim() && !isCommandMode(query)) {
      state.flatResults = buildFlatResults(state.results, {
        grouped: state.isGroupedView,
      });
      renderCurrentView(query);
    }
  }

  function handleKeydown(e) {
    if (e.altKey && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      toggleFulltextSearch();
      return;
    }

    if (e.altKey && (e.key === "g" || e.key === "G")) {
      e.preventDefault();
      toggleGroupedView();
      return;
    }

    if (e.key === "?" && !state.elements.input.value) {
      e.preventDefault();
      toggleHelp();
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
      closeLauncher();
    } else if (item.type === "command") {
      browser.runtime.sendMessage({
        action: "execute-command",
        commandId: item.id,
      });
      closeLauncher();
    } else {
      browser.runtime.sendMessage({
        action: "navigate",
        type: item.type,
        url: item.url,
        openInCurrent: !forceNewTab,
      });
    }
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

    const domainCloseAll = e.target.closest(".qal-domain-close-all");
    if (domainCloseAll) {
      e.stopPropagation();
      browser.runtime.sendMessage({
        action: "close-domain-tabs",
        domain: domainCloseAll.dataset.domain,
      });
      setTimeout(retriggerSearch, 200);
      return;
    }

    const domainHeader = e.target.closest(".qal-domain-header");
    if (domainHeader && !e.target.closest("button")) {
      domainHeader.parentElement.classList.toggle("qal-collapsed");
      return;
    }

    const dupAction = e.target.closest(".qal-duplicate-action");
    if (dupAction) {
      e.stopPropagation();
      browser.runtime.sendMessage({ action: "close-duplicates" });
      const banner = dupAction.closest(".qal-duplicate-banner");
      if (banner) banner.remove();
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
    state.flatResults = buildFlatResults(state.results, {
      grouped: state.isGroupedView,
    });

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
      if (newLang && I18N_SUPPORTED_LOCALES.includes(newLang)) {
        setLocaleFromStorage(newLang);
        applyOverlayTranslations();
      }
    }
  });

  async function bootstrap() {
    await Promise.all([loadConfig(), loadLocale()]);
    init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
