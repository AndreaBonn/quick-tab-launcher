/* global browser, QAL_CONFIG, QAL_CONFIG_DEFAULTS, mergeWithDefaults, applyConfigToGlobal, CONFIG_STORAGE_KEY, escapeHtml, highlightMatch, formatUrl, buildFlatResults, t, loadLocale, onLocaleChange, I18N_STORAGE_KEY, I18N_SUPPORTED_LOCALES, setLocaleFromStorage */

(function () {
  "use strict";

  const HOST_ELEMENT_ID = "qal-shadow-host";
  const FAVICON_FALLBACK_BASE =
    "https://www.google.com/s2/favicons?sz=16&domain=";
  const SECTION_KEYS = ["tabs", "bookmarks", "history"];
  const SECTION_ICONS = {
    tabs: "\uD83D\uDCC2",
    bookmarks: "\u2B50",
    history: "\uD83D\uDD52",
  };

  const state = {
    isVisible: false,
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

    panel.append(searchContainer, results, footer);
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

  function createElement(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
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
    } catch {
      // Storage non disponibile: toggle valido solo per sessione
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
    renderEmpty();

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

  function handleInput() {
    clearTimeout(state.searchTimeout);
    clearTimeout(state.loadingTimeout);
    const query = state.elements.input.value;

    if (!query.trim()) {
      renderEmpty();
      return;
    }

    state.loadingTimeout = setTimeout(() => {
      renderLoading();
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
        renderResults(results, query);
      } catch (err) {
        clearTimeout(state.loadingTimeout);
        console.error("Quick Actions Launcher: search error", err);
        renderError();
      }
    }, QAL_CONFIG.DEBOUNCE_MS);
  }

  function handleKeydown(e) {
    if (e.altKey && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      toggleFulltextSearch();
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
    updateSelection();
  }

  function selectPrev() {
    if (state.flatResults.length === 0) return;
    state.selectedIndex =
      state.selectedIndex <= 0
        ? state.flatResults.length - 1
        : state.selectedIndex - 1;
    updateSelection();
  }

  function updateSelection() {
    const items = state.shadowRoot.querySelectorAll(".qal-result-item");
    for (let i = 0; i < items.length; i++) {
      const isSelected = i === state.selectedIndex;
      items[i].classList.toggle("qal-selected", isSelected);
      items[i].setAttribute("aria-selected", String(isSelected));
    }
    const selected = items[state.selectedIndex];
    if (selected?.scrollIntoView) {
      selected.scrollIntoView({ block: "nearest" });
    }
  }

  function navigateTo(item, forceNewTab) {
    if (item.type === "tab") {
      browser.runtime.sendMessage({
        action: "navigate",
        type: "tab",
        tabId: item.id,
      });
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

    const tabSection = state.shadowRoot.querySelector(
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

    reindexItems();

    if (state.selectedIndex >= state.flatResults.length) {
      state.selectedIndex = state.flatResults.length - 1;
    }
    updateSelection();
  }

  function reindexItems() {
    const items = state.shadowRoot.querySelectorAll(".qal-result-item");
    for (let i = 0; i < items.length; i++) {
      items[i].dataset.index = i;
    }
  }

  function renderResults(results, query) {
    const container = state.elements.results;
    container.innerHTML = "";

    const totalCount =
      results.tabs.length + results.bookmarks.length + results.history.length;

    if (totalCount === 0) {
      renderNoResults(query);
      return;
    }

    let globalIndex = 0;

    for (const sectionKey of SECTION_KEYS) {
      const items = results[sectionKey];
      if (items.length === 0) continue;

      const section = createElement("div", "qal-section");
      section.dataset.section = sectionKey;

      const header = createSectionHeader(sectionKey, items.length);
      section.appendChild(header);

      for (const item of items) {
        const el = createResultItem(item, sectionKey, query, globalIndex);
        section.appendChild(el);
        globalIndex++;
      }

      container.appendChild(section);
    }

    updateSelection();
  }

  function createSectionHeader(sectionKey, count) {
    const header = createElement("div", "qal-section-header");

    const icon = createElement("span", "qal-section-icon");
    icon.textContent = SECTION_ICONS[sectionKey];
    const titleEl = createElement("span", "qal-section-title");
    titleEl.textContent = t(`sections.${sectionKey}`);
    const countEl = createElement("span", "qal-section-count");
    countEl.textContent = count;

    header.append(icon, titleEl, countEl);
    return header;
  }

  function createResultItem(item, sectionKey, query, index) {
    const el = createElement("div", "qal-result-item");
    el.setAttribute("role", "option");
    el.setAttribute("aria-selected", "false");
    el.dataset.type = sectionKey;
    el.dataset.id = item.id;
    el.dataset.url = item.url || "";
    el.dataset.index = index;

    const favicon = createFavicon(item, sectionKey);
    const textContainer = createResultText(item, query);

    if (item.isContentMatch) {
      const contentBadge = createElement("span", "qal-content-badge");
      contentBadge.textContent = "\u2261";
      contentBadge.title = t("badges.contentMatch");
      el.append(favicon, contentBadge, textContainer);
    } else if (sectionKey === "tabs" && item.isCurrentWindow === false) {
      const badge = createElement("span", "qal-window-badge");
      badge.textContent = "\u2197";
      badge.title = t("badges.otherWindow");
      el.append(favicon, badge, textContainer);
    } else {
      el.append(favicon, textContainer);
    }

    if (sectionKey === "tabs") {
      const actions = createElement("div", "qal-result-actions");
      const closeBtn = createElement("button", "qal-close-tab");
      closeBtn.textContent = "\u2715";
      closeBtn.title = t("badges.closeTab");
      actions.appendChild(closeBtn);
      el.appendChild(actions);
    }

    return el;
  }

  function createFavicon(item, sectionKey) {
    const favicon = document.createElement("img");
    favicon.className = "qal-favicon";
    favicon.width = 16;
    favicon.height = 16;

    if (sectionKey === "tabs" && item.favIconUrl) {
      favicon.src = item.favIconUrl;
    } else if (item.url) {
      try {
        const hostname = new URL(item.url).hostname;
        favicon.src = FAVICON_FALLBACK_BASE + hostname;
      } catch {
        favicon.src = "";
      }
    }

    favicon.onerror = () => {
      favicon.style.display = "none";
    };

    return favicon;
  }

  function createResultText(item, query) {
    const container = createElement("div", "qal-result-text");
    const titleEl = createElement("span", "qal-result-title");
    titleEl.innerHTML = highlightMatch(item.title || "", query);
    const url = createElement("span", "qal-result-url");
    url.innerHTML = highlightMatch(formatUrl(item.url || ""), query);
    container.append(titleEl, url);
    return container;
  }

  function renderEmpty() {
    state.elements.results.innerHTML = "";
    const empty = createElement("div", "qal-empty-state");
    empty.textContent = t("states.empty");
    state.elements.results.appendChild(empty);
  }

  function renderNoResults(query) {
    state.elements.results.innerHTML = "";
    const empty = createElement("div", "qal-empty-state");
    const safeQuery = escapeHtml(query);
    empty.innerHTML = t("states.noResults", { query: safeQuery });
    state.elements.results.appendChild(empty);
  }

  function renderLoading() {
    state.elements.results.innerHTML = "";
    const loading = createElement("div", "qal-loading");
    loading.textContent = t("states.loading");
    state.elements.results.appendChild(loading);
  }

  function renderError() {
    state.elements.results.innerHTML = "";
    const error = createElement("div", "qal-empty-state");
    error.textContent = t("states.error");
    state.elements.results.appendChild(error);
  }

  async function loadConfig() {
    try {
      const result = await browser.storage.local.get(CONFIG_STORAGE_KEY);
      const userConfig = result[CONFIG_STORAGE_KEY] ?? {};
      const merged = mergeWithDefaults(QAL_CONFIG_DEFAULTS, userConfig);
      applyConfigToGlobal(QAL_CONFIG, merged);
    } catch {
      // Storage non disponibile: usa default
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
