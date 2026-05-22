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
    input.value = ">";
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

    const section = shadowRoot.querySelector(
      '.qal-section[data-section="commands"]',
    );
    expect(section).toBeTruthy();
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

  it("includes command hint in footer", () => {
    const footer = shadowRoot.querySelector(".qal-footer");
    expect(footer.textContent).toContain(t("launcher.footer.commands"));
  });

  it("includes group hint in footer", () => {
    const footer = shadowRoot.querySelector(".qal-footer");
    expect(footer.textContent).toContain(t("launcher.footer.group"));
  });
});
