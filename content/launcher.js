/* global browser, QAL_CONFIG, QAL_CONFIG_DEFAULTS, mergeWithDefaults, applyConfigToGlobal, CONFIG_STORAGE_KEY, buildFlatResults, t, loadLocale, onLocaleChange, I18N_STORAGE_KEY, I18N_SUPPORTED_LOCALES, setLocaleFromStorage, createElement, renderResults, renderGroupedResults, renderCommandResults, renderRecentTabs, renderDuplicateBanner, renderEmpty, renderLoading, renderError, updateSelection, reindexItems, filterCommands, loadUserConfig, saveUserConfig */

(function () {
  "use strict";

  const HOST_ELEMENT_ID = "qal-shadow-host";

  const state = {
    isVisible: false,
    isGroupedView: false,
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

    const searchContainer = createElement("div", "qal-search-container");
    const searchIcon = createElement("span", "qal-search-icon");
    searchIcon.textContent = "\u2315";
    const input = createElement("input", "qal-input");
    input.type = "text";
    input.placeholder = t("launcher.placeholder");
    input.autocomplete = "off";
    input.spellcheck = false;
    const shortcutHint = createElement("span", "qal-shortcut-hint");
    shortcutHint.textContent = t("launcher.escHint");

    const fulltextToggle = createElement("button", "qal-fulltext-toggle");
    fulltextToggle.type = "button";
    fulltextToggle.textContent = t("launcher.fulltextToggle");
    updateFulltextToggleState(fulltextToggle);

    searchContainer.append(searchIcon, input, fulltextToggle, shortcutHint);

    const results = createElement("div", "qal-results");
    results.setAttribute("role", "listbox");
    const footer = createFooter();

    const branding = createBranding();
    panel.append(searchContainer, results, footer, branding);
    overlay.append(backdrop, panel);
    state.shadowRoot.appendChild(overlay);

    state.elements = {
      overlay,
      backdrop,
      input,
      results,
      footer,
      shortcutHint,
      fulltextToggle,
    };
  }

  function createFooter() {
    const footer = createElement("div", "qal-footer");
    const keys = [
      "launcher.footer.navigate",
      "launcher.footer.open",
      "launcher.footer.newTab",
      "launcher.footer.commands",
      "launcher.footer.group",
      "launcher.footer.fulltext",
      "launcher.footer.close",
    ];
    for (const key of keys) {
      const span = document.createElement("span");
      span.textContent = t(key);
      span.dataset.i18n = key;
      footer.appendChild(span);
    }
    return footer;
  }

  function createBranding() {
    const div = createElement("div", "qal-branding");
    div.textContent = "Quick Tab Launcher by ";
    const link = document.createElement("a");
    link.href = "https://github.com/AndreaBonn";
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Bonn";
    link.addEventListener("click", (e) => e.stopPropagation());
    div.appendChild(link);
    return div;
  }

  function applyOverlayTranslations() {
    state.elements.input.placeholder = t("launcher.placeholder");
    state.elements.shortcutHint.textContent = t("launcher.escHint");
    state.elements.fulltextToggle.textContent = t("launcher.fulltextToggle");
    updateFulltextToggleState(state.elements.fulltextToggle);
    const footerSpans = state.elements.footer.querySelectorAll("[data-i18n]");
    for (const span of footerSpans) {
      span.textContent = t(span.dataset.i18n);
    }
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
      renderEmpty(state.elements.results);
      state.flatResults = [];
      state.selectedIndex = -1;
      fetchRecentTabs();
      return;
    }

    if (isCommandMode(query)) {
      handleCommandInput(query.trimStart().slice(1));
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
    const query = state.elements.input.value;
    if (query.trim() && !isCommandMode(query)) {
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
    state.flatResults = buildFlatResults(state.results);

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
