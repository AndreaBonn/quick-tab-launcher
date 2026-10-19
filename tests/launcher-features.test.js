import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  QAL_CONFIG,
  escapeHtml,
  highlightMatch,
  formatUrl,
  buildFlatResults,
  groupTabsByDomain,
} = require("../src/search-utils.js");

const {
  QAL_CONFIG_DEFAULTS,
  CONFIG_STORAGE_KEY,
  mergeWithDefaults,
  applyConfigToGlobal,
} = require("../src/config-storage.js");

const { fuzzyMatch, fuzzyScore, highlightFuzzyMatch } = require("../src/fuzzy.js");

const {
  I18N_STORAGE_KEY,
  I18N_SUPPORTED_LOCALES,
  t,
  getLocale,
  loadLocale,
  setLocale,
  setLocaleFromStorage,
  onLocaleChange,
  applyTranslations,
} = require("../src/i18n.js");

const { COMMANDS, filterCommands, getCommandLabel, getCommandDescription } =
  require("../src/commands.js");

const {
  createElement,
  createResultItem,
  createSectionHeader,
  renderResults,
  renderGroupedResults,
  renderCommandResults,
  renderRecentTabs,
  renderDuplicateBanner,
  renderEmpty,
  renderNoResults,
  renderLoading,
  renderError,
  updateSelection,
  reindexItems,
} = require("../src/render-utils.js");

function createBrowserMock() {
  return {
    i18n: { getUILanguage: () => "it-IT" },
    runtime: {
      getURL: vi.fn((path) => `moz-extension://fake-id/${path}`),
      sendMessage: vi.fn().mockResolvedValue({
        tabs: [],
        bookmarks: [],
        history: [],
      }),
      onMessage: { addListener: vi.fn() },
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: { addListener: vi.fn() },
    },
  };
}

async function loadLauncher(browserMock) {
  globalThis.browser = browserMock;
  globalThis.QAL_CONFIG = QAL_CONFIG;
  globalThis.QAL_CONFIG_DEFAULTS = QAL_CONFIG_DEFAULTS;
  globalThis.CONFIG_STORAGE_KEY = CONFIG_STORAGE_KEY;
  globalThis.mergeWithDefaults = mergeWithDefaults;
  globalThis.applyConfigToGlobal = applyConfigToGlobal;
  globalThis.escapeHtml = escapeHtml;
  globalThis.highlightMatch = highlightMatch;
  globalThis.formatUrl = formatUrl;
  globalThis.buildFlatResults = buildFlatResults;
  globalThis.groupTabsByDomain = groupTabsByDomain;
  globalThis.fuzzyMatch = fuzzyMatch;
  globalThis.fuzzyScore = fuzzyScore;
  globalThis.highlightFuzzyMatch = highlightFuzzyMatch;
  globalThis.I18N_STORAGE_KEY = I18N_STORAGE_KEY;
  globalThis.I18N_SUPPORTED_LOCALES = I18N_SUPPORTED_LOCALES;
  globalThis.t = t;
  globalThis.getLocale = getLocale;
  globalThis.loadLocale = loadLocale;
  globalThis.setLocale = setLocale;
  globalThis.onLocaleChange = onLocaleChange;
  globalThis.applyTranslations = applyTranslations;
  globalThis.setLocaleFromStorage = setLocaleFromStorage;
  globalThis.COMMANDS = COMMANDS;
  globalThis.filterCommands = filterCommands;
  globalThis.getCommandLabel = getCommandLabel;
  globalThis.getCommandDescription = getCommandDescription;
  globalThis.createElement = createElement;
  globalThis.createResultItem = createResultItem;
  globalThis.createSectionHeader = createSectionHeader;
  globalThis.renderResults = renderResults;
  globalThis.renderGroupedResults = renderGroupedResults;
  globalThis.renderCommandResults = renderCommandResults;
  globalThis.renderRecentTabs = renderRecentTabs;
  globalThis.renderDuplicateBanner = renderDuplicateBanner;
  globalThis.renderEmpty = renderEmpty;
  globalThis.renderNoResults = renderNoResults;
  globalThis.renderLoading = renderLoading;
  globalThis.renderError = renderError;
  globalThis.updateSelection = updateSelection;
  globalThis.reindexItems = reindexItems;
  Object.assign(
    globalThis,
    require("../src/config-storage.js"),
    require("../src/icons.js"),
    require("../src/hints.js"),
    require("../src/panel-extras.js"),
    require("../src/onboarding.js"),
    require("../src/panel-view.js"),
    require("../src/panel-actions.js"),
    require("../src/panel-controller.js"),
    require("../content/launcher-dom.js"),
    require("../content/duplicates-banner.js"),
    require("../src/render-utils.js"),
    require("../src/commands.js"),
    { tCount: require("../src/i18n.js").tCount },
  );

  let capturedShadowRoot = null;
  const originalAttachShadow = HTMLElement.prototype.attachShadow;
  HTMLElement.prototype.attachShadow = function (options) {
    const root = originalAttachShadow.call(this, { ...options, mode: "open" });
    capturedShadowRoot = root;
    return root;
  };

  delete require.cache[require.resolve("../content/launcher.js")];
  require("../content/launcher.js");

  await new Promise((r) => setTimeout(r, 0));

  HTMLElement.prototype.attachShadow = originalAttachShadow;

  const messageListener =
    browserMock.runtime.onMessage.addListener.mock.calls[0]?.[0];

  return { shadowRoot: capturedShadowRoot, messageListener };
}

function typeAndFlush(input, text) {
  input.value = text;
  input.dispatchEvent(new Event("input"));
  return new Promise((resolve) =>
    setTimeout(resolve, QAL_CONFIG.DEBOUNCE_MS + 100),
  );
}

describe("launcher.js - command mode", () => {
  let browserMock;
  let shadowRoot;
  let messageListener;

  beforeEach(async () => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    browserMock = createBrowserMock();
    ({ shadowRoot, messageListener } = await loadLauncher(browserMock));
  });

  afterEach(() => {
    const host = document.getElementById("qal-shadow-host");
    if (host) host.remove();
    delete globalThis.browser;
  });

  it("shows command list when typing > prefix", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    input.value = ">";
    input.dispatchEvent(new Event("input"));

    await new Promise((r) => setTimeout(r, 50));

    const items = shadowRoot.querySelectorAll(".qal-command-item");
    expect(items.length).toBe(COMMANDS.length);
  });

  it("filters commands by query after >", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    input.value = ">chiudi";
    input.dispatchEvent(new Event("input"));

    await new Promise((r) => setTimeout(r, 50));

    const items = shadowRoot.querySelectorAll(".qal-command-item");
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(COMMANDS.length);
  });

  it("sends execute-command on Enter in command mode", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    input.value = ">silenzia";
    input.dispatchEvent(new Event("input"));

    await new Promise((r) => setTimeout(r, 50));

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "execute-command" }),
    );
  });

  it("does not send search message in command mode", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    input.value = ">test";
    input.dispatchEvent(new Event("input"));

    await new Promise((r) => setTimeout(r, QAL_CONFIG.DEBOUNCE_MS + 50));

    const searchCalls = browserMock.runtime.sendMessage.mock.calls.filter(
      (c) => c[0]?.action === "search",
    );
    expect(searchCalls).toHaveLength(0);
  });

  it("shows commands section header", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    input.value = ">";
    input.dispatchEvent(new Event("input"));

    await new Promise((r) => setTimeout(r, 50));

    const tabsSection = shadowRoot.querySelector(
      '.qal-section[data-section="command-tabs"]',
    );
    const currentSection = shadowRoot.querySelector(
      '.qal-section[data-section="command-current"]',
    );
    expect(tabsSection).toBeTruthy();
    expect(currentSection).toBeTruthy();
  });

  it("uses one Actions section when the list is filtered", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    input.value = ">chiudi";
    input.dispatchEvent(new Event("input"));
    await new Promise((r) => setTimeout(r, 50));
    expect(
      shadowRoot.querySelector('.qal-section[data-section="commands"]'),
    ).toBeTruthy();
    expect(
      shadowRoot.querySelector('.qal-section[data-section="command-tabs"]'),
    ).toBeNull();
  });
});

describe("launcher.js - recent tabs on empty state", () => {
  let browserMock;
  let shadowRoot;
  let messageListener;

  beforeEach(async () => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    browserMock = createBrowserMock();
    browserMock.runtime.sendMessage.mockImplementation((msg) => {
      if (msg.action === "get-recent-tabs") {
        return Promise.resolve({
          recentActive: [
            { id: 1, title: "Recent Tab", url: "https://recent.com" },
          ],
          recentlyClosed: [
            {
              id: "s1",
              title: "Closed Tab",
              url: "https://closed.com",
              sessionId: "s1",
            },
          ],
        });
      }
      if (msg.action === "get-duplicate-count") {
        return Promise.resolve({ count: 0 });
      }
      return Promise.resolve({ tabs: [], bookmarks: [], history: [] });
    });
    ({ shadowRoot, messageListener } = await loadLauncher(browserMock));
  });

  afterEach(() => {
    const host = document.getElementById("qal-shadow-host");
    if (host) host.remove();
    delete globalThis.browser;
  });

  it("shows recent tabs when launcher opens", async () => {
    messageListener({ action: "toggle" });

    await new Promise((r) => setTimeout(r, 100));

    const recentSection = shadowRoot.querySelector(
      '.qal-section[data-section="recent-active"]',
    );
    expect(recentSection).toBeTruthy();
  });

  it("shows recently closed tabs section", async () => {
    messageListener({ action: "toggle" });

    await new Promise((r) => setTimeout(r, 100));

    const closedSection = shadowRoot.querySelector(
      '.qal-section[data-section="recent-closed"]',
    );
    expect(closedSection).toBeTruthy();
  });

  it("navigates to recent-active tab on Enter", async () => {
    messageListener({ action: "toggle" });

    await new Promise((r) => setTimeout(r, 100));

    const input = shadowRoot.querySelector(".qal-input");
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "navigate",
        type: "tab",
        tabId: 1,
      }),
    );
  });

  it("restores session for recently closed tab on click", async () => {
    messageListener({ action: "toggle" });

    await new Promise((r) => setTimeout(r, 100));

    const input = shadowRoot.querySelector(".qal-input");
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "restore-session",
        sessionId: "s1",
      }),
    );
  });

  it("replaces recent tabs with search results when typing", async () => {
    browserMock.runtime.sendMessage.mockImplementation((msg) => {
      if (msg.action === "get-recent-tabs") {
        return Promise.resolve({
          recentActive: [
            { id: 1, title: "Recent", url: "https://recent.com" },
          ],
          recentlyClosed: [],
        });
      }
      if (msg.action === "get-duplicate-count") {
        return Promise.resolve({ count: 0 });
      }
      if (msg.action === "search") {
        return Promise.resolve({
          tabs: [
            { id: 2, title: "Search Result", url: "https://search.com" },
          ],
          bookmarks: [],
          history: [],
        });
      }
      return Promise.resolve({ tabs: [], bookmarks: [], history: [] });
    });

    messageListener({ action: "toggle" });
    await new Promise((r) => setTimeout(r, 100));

    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "search");

    const recentSection = shadowRoot.querySelector(
      '.qal-section[data-section="recent-active"]',
    );
    expect(recentSection).toBeNull();

    const tabSection = shadowRoot.querySelector(
      '.qal-section[data-section="tabs"]',
    );
    expect(tabSection).toBeTruthy();
  });
});

describe("launcher.js - grouped view toggle", () => {
  let browserMock;
  let shadowRoot;
  let messageListener;

  beforeEach(async () => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    browserMock = createBrowserMock();
    browserMock.runtime.sendMessage.mockImplementation((msg) => {
      if (msg.action === "search") {
        return Promise.resolve({
          tabs: [
            { id: 1, title: "GH 1", url: "https://github.com/a", favIconUrl: null },
            { id: 2, title: "GH 2", url: "https://github.com/b", favIconUrl: null },
            { id: 3, title: "SO", url: "https://stackoverflow.com/q", favIconUrl: null },
          ],
          bookmarks: [],
          history: [],
        });
      }
      if (msg.action === "get-recent-tabs") {
        return Promise.resolve({ recentActive: [], recentlyClosed: [] });
      }
      if (msg.action === "get-duplicate-count") {
        return Promise.resolve({ count: 0 });
      }
      return Promise.resolve({ tabs: [], bookmarks: [], history: [] });
    });
    ({ shadowRoot, messageListener } = await loadLauncher(browserMock));
  });

  afterEach(() => {
    const host = document.getElementById("qal-shadow-host");
    if (host) host.remove();
    delete globalThis.browser;
  });

  it("toggles grouped view with Alt+G", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "g");

    expect(shadowRoot.querySelector(".qal-domain-group")).toBeNull();

    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "g",
        altKey: true,
        bubbles: true,
      }),
    );

    expect(shadowRoot.querySelector(".qal-domain-group")).toBeTruthy();
  });

  it("shows domain headers in grouped view", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "g");

    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "g",
        altKey: true,
        bubbles: true,
      }),
    );

    const labels = shadowRoot.querySelectorAll(".qal-domain-label");
    expect(labels.length).toBe(2);
    const domainTexts = [...labels].map((l) => l.textContent);
    expect(domainTexts).toContain("github.com");
    expect(domainTexts).toContain("stackoverflow.com");
  });

  it("toggles back to flat view with second Alt+G", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "g");

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "g", altKey: true, bubbles: true }),
    );
    expect(shadowRoot.querySelector(".qal-domain-group")).toBeTruthy();

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "g", altKey: true, bubbles: true }),
    );
    expect(shadowRoot.querySelector(".qal-domain-group")).toBeNull();
  });
});

describe("launcher.js - duplicate banner", () => {
  let browserMock;
  let shadowRoot;
  let messageListener;

  beforeEach(async () => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    browserMock = createBrowserMock();
    browserMock.runtime.sendMessage.mockImplementation((msg) => {
      if (msg.action === "get-recent-tabs") {
        return Promise.resolve({ recentActive: [], recentlyClosed: [] });
      }
      if (msg.action === "get-duplicate-count") {
        return Promise.resolve({ count: 3 });
      }
      return Promise.resolve({ tabs: [], bookmarks: [], history: [] });
    });
    ({ shadowRoot, messageListener } = await loadLauncher(browserMock));
  });

  afterEach(() => {
    const host = document.getElementById("qal-shadow-host");
    if (host) host.remove();
    delete globalThis.browser;
  });

  it("shows duplicate banner when duplicates exist", async () => {
    messageListener({ action: "toggle" });

    await new Promise((r) => setTimeout(r, 100));

    const banner = shadowRoot.querySelector(".qal-duplicate-banner");
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain("3");
  });

  it("sends close-duplicates on banner action click", async () => {
    messageListener({ action: "toggle" });

    await new Promise((r) => setTimeout(r, 100));

    const actionBtn = shadowRoot.querySelector(".qal-duplicate-action");
    actionBtn.click();

    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "close-duplicates" }),
    );
  });

  it("removes banner after action click", async () => {
    messageListener({ action: "toggle" });

    await new Promise((r) => setTimeout(r, 100));

    const actionBtn = shadowRoot.querySelector(".qal-duplicate-action");
    actionBtn.click();

    expect(shadowRoot.querySelector(".qal-duplicate-banner")).toBeNull();
  });
});

describe("launcher.js - footer hints", () => {
  let browserMock;
  let shadowRoot;

  beforeEach(async () => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    browserMock = createBrowserMock();
    ({ shadowRoot } = await loadLauncher(browserMock));
  });

  afterEach(() => {
    const host = document.getElementById("qal-shadow-host");
    if (host) host.remove();
    delete globalThis.browser;
  });

  it("shows the actions hint while nothing is typed", () => {
    const footer = shadowRoot.querySelector(".qal-footer");
    expect(footer.textContent).toContain(t("hints.actions"));
    expect(footer.textContent).not.toContain(t("hints.fulltext"));
  });

  it("switches to search hints once the user types", async () => {
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "git");
    const footer = shadowRoot.querySelector(".qal-footer");
    expect(footer.textContent).toContain(t("hints.group"));
    expect(footer.textContent).toContain(t("hints.open"));
  });

  it("switches to command hints in command mode", async () => {
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, ">");
    const footer = shadowRoot.querySelector(".qal-footer");
    expect(footer.textContent).toContain(t("hints.run"));
  });

  it("? on an empty field lists every shortcut instead of typing", () => {
    const input = shadowRoot.querySelector(".qal-input");
    const event = new KeyboardEvent("keydown", { key: "?", cancelable: true });
    input.dispatchEvent(event);
    const footer = shadowRoot.querySelector(".qal-footer");
    expect(event.defaultPrevented).toBe(true);
    expect(footer.textContent).toContain(t("hints.fulltext"));
  });

  it("? inside a query is typed normally", () => {
    const input = shadowRoot.querySelector(".qal-input");
    input.value = "what";
    const event = new KeyboardEvent("keydown", { key: "?", cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("the help button in the footer expands and collapses the list", () => {
    const footer = shadowRoot.querySelector(".qal-footer");
    footer.querySelector('[data-qal-action="toggle-help"]').click();
    expect(footer.textContent).toContain(t("hints.fulltext"));
    footer.querySelector('[data-qal-action="toggle-help"]').click();
    expect(footer.textContent).not.toContain(t("hints.fulltext"));
  });
});

describe("launcher.js - panel chrome", () => {
  let shadowRoot;

  beforeEach(async () => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    ({ shadowRoot } = await loadLauncher(createBrowserMock()));
  });

  afterEach(() => {
    const host = document.getElementById("qal-shadow-host");
    if (host) host.remove();
    delete globalThis.browser;
  });

  it("has no duplicate ESC hint and no branding row in the panel", () => {
    expect(shadowRoot.querySelector(".qal-shortcut-hint")).toBeNull();
    expect(shadowRoot.querySelector(".qal-branding")).toBeNull();
    expect(shadowRoot.querySelector(".qal-footer")).not.toBeNull();
  });

  it("labels the search field for screen readers", () => {
    const input = shadowRoot.querySelector(".qal-input");
    expect(input.getAttribute("aria-label")).toBe(t("launcher.inputLabel"));
    expect(input.getAttribute("aria-controls")).toBe("qal-results");
  });

  it("the By site button toggles grouped view and shows its state", () => {
    const btn = shadowRoot.querySelector(".qal-group-toggle");
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    btn.click();
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    const input = shadowRoot.querySelector(".qal-input");
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "g", altKey: true, cancelable: true }),
    );
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  it("draws the search icon as svg, not a glyph", () => {
    const icon = shadowRoot.querySelector(".qal-search-icon");
    expect(icon.querySelector("svg")).not.toBeNull();
    expect(icon.textContent).toBe("");
  });
});

describe("launcher.js - grouped view opens the highlighted row", () => {
  it("Enter on the second on-screen row opens that tab, not the second search hit", async () => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    const browserMock = createBrowserMock();
    browserMock.runtime.sendMessage.mockImplementation((msg) => {
      if (msg.action === "search") {
        return Promise.resolve({
          tabs: [
            { id: 1, title: "GH a", url: "https://github.com/a" },
            { id: 2, title: "SO", url: "https://stackoverflow.com/q" },
            { id: 3, title: "GH b", url: "https://github.com/b" },
          ],
          bookmarks: [],
          history: [],
        });
      }
      return Promise.resolve({ recentActive: [], recentlyClosed: [] });
    });
    const { shadowRoot, messageListener } = await loadLauncher(browserMock);
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "g", altKey: true, code: "KeyG" }),
    );
    await typeAndFlush(input, "x");

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    const rows = shadowRoot.querySelectorAll(".qal-result-item");
    expect(rows[1].querySelector(".qal-result-title").textContent).toBe("GH b");
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "navigate", tabId: 3 }),
    );
    document.getElementById("qal-shadow-host")?.remove();
    delete globalThis.browser;
  });
});

describe("launcher.js - Option shortcuts on Mac", () => {
  it("Option+G toggles By site even though the key produces ©", async () => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    const { shadowRoot } = await loadLauncher(createBrowserMock());
    const input = shadowRoot.querySelector(".qal-input");
    const btn = shadowRoot.querySelector(".qal-group-toggle");

    const event = new KeyboardEvent("keydown", {
      key: "©",
      code: "KeyG",
      altKey: true,
      cancelable: true,
    });
    input.dispatchEvent(event);

    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(event.defaultPrevented).toBe(true);
    document.getElementById("qal-shadow-host")?.remove();
    delete globalThis.browser;
  });

  it("Option+C toggles text search even though the key produces ç", async () => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    const browserMock = createBrowserMock();
    const { shadowRoot } = await loadLauncher(browserMock);
    const input = shadowRoot.querySelector(".qal-input");
    const before = QAL_CONFIG.ENABLE_FULLTEXT_SEARCH;

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ç", code: "KeyC", altKey: true }),
    );

    expect(QAL_CONFIG.ENABLE_FULLTEXT_SEARCH).toBe(!before);
    // Let the async config save finish before the browser mock is removed.
    await vi.waitFor(() =>
      expect(browserMock.storage.local.set).toHaveBeenCalled(),
    );
    QAL_CONFIG.ENABLE_FULLTEXT_SEARCH = before;
    document.getElementById("qal-shadow-host")?.remove();
    delete globalThis.browser;
  });
});
