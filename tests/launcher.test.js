import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  QAL_CONFIG,
  escapeHtml,
  highlightMatch,
  formatUrl,
  buildFlatResults,
} = require("../src/search-utils.js");

const {
  QAL_CONFIG_DEFAULTS,
  CONFIG_STORAGE_KEY,
  mergeWithDefaults,
  applyConfigToGlobal,
} = require("../src/config-storage.js");

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

const {
  createElement,
  createResultItem,
  createSectionHeader,
  renderResults,
  renderEmpty,
  renderNoResults,
  renderLoading,
  renderError,
  updateSelection,
  reindexItems,
} = require("../src/render-utils.js");

/**
 * Creates a minimal browser mock for content script testing.
 */
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

/**
 * Loads launcher.js into the current jsdom environment.
 * Returns references to the shadow root and registered listeners.
 * Async because bootstrap() awaits loadConfig() before init().
 */
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
  globalThis.I18N_STORAGE_KEY = I18N_STORAGE_KEY;
  globalThis.I18N_SUPPORTED_LOCALES = I18N_SUPPORTED_LOCALES;
  globalThis.t = t;
  globalThis.getLocale = getLocale;
  globalThis.loadLocale = loadLocale;
  globalThis.setLocale = setLocale;
  globalThis.onLocaleChange = onLocaleChange;
  globalThis.applyTranslations = applyTranslations;
  globalThis.setLocaleFromStorage = setLocaleFromStorage;
  globalThis.createElement = createElement;
  globalThis.createResultItem = createResultItem;
  globalThis.createSectionHeader = createSectionHeader;
  globalThis.renderResults = renderResults;
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

  // Flush microtasks so async bootstrap() (loadConfig → init) completes
  await new Promise((r) => setTimeout(r, 0));

  HTMLElement.prototype.attachShadow = originalAttachShadow;

  const messageListener =
    browserMock.runtime.onMessage.addListener.mock.calls[0]?.[0];

  return { shadowRoot: capturedShadowRoot, messageListener };
}

/**
 * Triggers input event and waits for debounce + async rendering to complete.
 * Uses real timers with sufficient delay.
 */
function typeAndFlush(input, text) {
  input.value = text;
  input.dispatchEvent(new Event("input"));
  return new Promise((resolve) =>
    setTimeout(resolve, QAL_CONFIG.DEBOUNCE_MS + 100),
  );
}

describe("launcher.js - initialization", () => {
  let browserMock;

  beforeEach(() => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    browserMock = createBrowserMock();
  });

  afterEach(() => {
    const host = document.getElementById("qal-shadow-host");
    if (host) host.remove();
    delete globalThis.browser;
  });

  it("creates shadow host element in documentElement", async () => {
    await loadLauncher(browserMock);
    const host = document.getElementById("qal-shadow-host");
    expect(host).toBeTruthy();
  });

  it("does not create duplicate host on re-init", async () => {
    await loadLauncher(browserMock);
    delete require.cache[require.resolve("../content/launcher.js")];
    require("../content/launcher.js");
    await new Promise((r) => setTimeout(r, 0));
    const hosts = document.querySelectorAll("#qal-shadow-host");
    expect(hosts).toHaveLength(1);
  });

  it("loads CSS from extension URL", async () => {
    const { shadowRoot } = await loadLauncher(browserMock);
    expect(browserMock.runtime.getURL).toHaveBeenCalledWith(
      "content/launcher.css",
    );
    const link = shadowRoot.querySelector('link[rel="stylesheet"]');
    expect(link).toBeTruthy();
    expect(link.href).toContain("content/launcher.css");
  });

  it("creates overlay initially hidden", async () => {
    const { shadowRoot } = await loadLauncher(browserMock);
    const overlay = shadowRoot.querySelector(".qal-overlay");
    expect(overlay).toBeTruthy();
    expect(overlay.style.display).toBe("none");
  });

  it("creates all structural elements", async () => {
    const { shadowRoot } = await loadLauncher(browserMock);
    expect(shadowRoot.querySelector(".qal-backdrop")).toBeTruthy();
    expect(shadowRoot.querySelector(".qal-panel")).toBeTruthy();
    expect(shadowRoot.querySelector(".qal-input")).toBeTruthy();
    expect(shadowRoot.querySelector(".qal-results")).toBeTruthy();
    expect(shadowRoot.querySelector(".qal-footer")).toBeTruthy();
  });
});

describe("launcher.js - toggle behavior", () => {
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

  it("shows overlay on toggle message when hidden", () => {
    messageListener({ action: "toggle" });
    const overlay = shadowRoot.querySelector(".qal-overlay");
    expect(overlay.style.display).toBe("");
  });

  it("hides overlay on toggle message when visible", () => {
    messageListener({ action: "toggle" });
    messageListener({ action: "toggle" });
    const overlay = shadowRoot.querySelector(".qal-overlay");
    expect(overlay.style.display).toBe("none");
  });

  it("hides overlay on close message", () => {
    messageListener({ action: "toggle" });
    messageListener({ action: "close" });
    const overlay = shadowRoot.querySelector(".qal-overlay");
    expect(overlay.style.display).toBe("none");
  });

  it("shows empty state message on open", () => {
    messageListener({ action: "toggle" });
    const empty = shadowRoot.querySelector(".qal-empty-state");
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain("Inizia a digitare");
  });
});

describe("launcher.js - keyboard navigation", () => {
  let browserMock;
  let shadowRoot;
  let messageListener;

  beforeEach(async () => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    browserMock = createBrowserMock();
    browserMock.runtime.sendMessage.mockResolvedValue({
      tabs: [
        { id: 1, title: "Tab 1", url: "https://a.com", favIconUrl: null },
        { id: 2, title: "Tab 2", url: "https://b.com", favIconUrl: null },
      ],
      bookmarks: [{ id: "b1", title: "BM 1", url: "https://c.com" }],
      history: [],
    });
    ({ shadowRoot, messageListener } = await loadLauncher(browserMock));
  });

  afterEach(() => {
    const host = document.getElementById("qal-shadow-host");
    if (host) host.remove();
    delete globalThis.browser;
  });

  it("selects first result after search", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "tab");

    const items = shadowRoot.querySelectorAll(".qal-result-item");
    expect(items.length).toBe(3);
    expect(items[0].classList.contains("qal-selected")).toBe(true);
  });

  it("moves selection down with ArrowDown", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "tab");

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );

    const items = shadowRoot.querySelectorAll(".qal-result-item");
    expect(items[1].classList.contains("qal-selected")).toBe(true);
  });

  it("wraps selection from last to first", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "tab");

    const totalItems = shadowRoot.querySelectorAll(".qal-result-item").length;
    for (let i = 0; i < totalItems; i++) {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    }

    const items = shadowRoot.querySelectorAll(".qal-result-item");
    expect(items[0].classList.contains("qal-selected")).toBe(true);
  });

  it("moves selection up with ArrowUp", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "tab");

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );

    const items = shadowRoot.querySelectorAll(".qal-result-item");
    expect(items[0].classList.contains("qal-selected")).toBe(true);
  });

  it("wraps selection from first to last with ArrowUp", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "tab");

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
    );

    const items = shadowRoot.querySelectorAll(".qal-result-item");
    const lastItem = items[items.length - 1];
    expect(lastItem.classList.contains("qal-selected")).toBe(true);
  });

  it("closes overlay on Escape", () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    const overlay = shadowRoot.querySelector(".qal-overlay");
    expect(overlay.style.display).toBe("none");
  });

  it("navigates to tab on Enter", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "tab");

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

  it("Tab key selects next result like ArrowDown", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "tab");

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );

    const items = shadowRoot.querySelectorAll(".qal-result-item");
    expect(items[1].classList.contains("qal-selected")).toBe(true);
  });
});

describe("launcher.js - result rendering", () => {
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

  it("shows no-results message when search returns empty", async () => {
    browserMock.runtime.sendMessage.mockResolvedValue({
      tabs: [],
      bookmarks: [],
      history: [],
    });

    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "nonexistent");

    const empty = shadowRoot.querySelector(".qal-empty-state");
    expect(empty).toBeTruthy();
    expect(empty.innerHTML).toContain("nonexistent");
  });

  it("renders section headers with correct counts", async () => {
    browserMock.runtime.sendMessage.mockResolvedValue({
      tabs: [{ id: 1, title: "T1", url: "https://a.com", favIconUrl: null }],
      bookmarks: [
        { id: "b1", title: "B1", url: "https://b.com" },
        { id: "b2", title: "B2", url: "https://c.com" },
      ],
      history: [],
    });

    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "test");

    const headers = shadowRoot.querySelectorAll(".qal-section-header");
    expect(headers).toHaveLength(2);

    const counts = shadowRoot.querySelectorAll(".qal-section-count");
    expect(counts[0].textContent).toBe("1");
    expect(counts[1].textContent).toBe("2");
  });

  it("shows close button only for tab results", async () => {
    browserMock.runtime.sendMessage.mockResolvedValue({
      tabs: [{ id: 1, title: "Tab", url: "https://a.com", favIconUrl: null }],
      bookmarks: [{ id: "b1", title: "BM", url: "https://b.com" }],
      history: [],
    });

    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "test");

    const items = shadowRoot.querySelectorAll(".qal-result-item");
    expect(items).toHaveLength(2);

    const closeBtns = shadowRoot.querySelectorAll(".qal-close-tab");
    expect(closeBtns).toHaveLength(1);
    const tabItem = closeBtns[0].closest(".qal-result-item");
    expect(tabItem.dataset.type).toBe("tabs");
  });

  it("shows empty state for cleared input", async () => {
    browserMock.runtime.sendMessage.mockResolvedValue({
      tabs: [{ id: 1, title: "T1", url: "https://a.com", favIconUrl: null }],
      bookmarks: [],
      history: [],
    });

    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "test");

    input.value = "";
    input.dispatchEvent(new Event("input"));

    const empty = shadowRoot.querySelector(".qal-empty-state");
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain("Inizia a digitare");
  });
});

describe("launcher.js - window badge", () => {
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

  it("shows window badge for tab from another window", async () => {
    browserMock.runtime.sendMessage.mockResolvedValue({
      tabs: [
        {
          id: 5,
          title: "Other Window Tab",
          url: "https://other.com",
          favIconUrl: null,
          isCurrentWindow: false,
        },
      ],
      bookmarks: [],
      history: [],
    });

    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "other");

    const badge = shadowRoot.querySelector(".qal-window-badge");
    expect(badge).toBeTruthy();
  });

  it("does not show window badge for tab from current window", async () => {
    browserMock.runtime.sendMessage.mockResolvedValue({
      tabs: [
        {
          id: 1,
          title: "Current Window Tab",
          url: "https://current.com",
          favIconUrl: null,
          isCurrentWindow: true,
        },
      ],
      bookmarks: [],
      history: [],
    });

    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "current");

    const badge = shadowRoot.querySelector(".qal-window-badge");
    expect(badge).toBeNull();
  });
});

describe("launcher.js - content match badge", () => {
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

  it("shows content badge for tab with isContentMatch true", async () => {
    browserMock.runtime.sendMessage.mockResolvedValue({
      tabs: [
        {
          id: 1,
          title: "Some Page",
          url: "https://example.com",
          favIconUrl: null,
          isCurrentWindow: true,
          isContentMatch: true,
        },
      ],
      bookmarks: [],
      history: [],
    });

    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "content");

    const badge = shadowRoot.querySelector(".qal-content-badge");
    expect(badge).toBeTruthy();
  });

  it("does NOT show content badge for tab without isContentMatch", async () => {
    browserMock.runtime.sendMessage.mockResolvedValue({
      tabs: [
        {
          id: 1,
          title: "Normal Tab",
          url: "https://example.com",
          favIconUrl: null,
          isCurrentWindow: true,
        },
      ],
      bookmarks: [],
      history: [],
    });

    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "normal");

    const badge = shadowRoot.querySelector(".qal-content-badge");
    expect(badge).toBeNull();
  });
});

describe("launcher.js - backdrop close", () => {
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

  it("closes overlay when clicking backdrop", () => {
    messageListener({ action: "toggle" });
    const backdrop = shadowRoot.querySelector(".qal-backdrop");
    backdrop.click();
    const overlay = shadowRoot.querySelector(".qal-overlay");
    expect(overlay.style.display).toBe("none");
  });
});

describe("launcher.js - close tab via click", () => {
  let browserMock;
  let shadowRoot;
  let messageListener;

  beforeEach(async () => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    browserMock = createBrowserMock();
    browserMock.runtime.sendMessage.mockResolvedValue({
      tabs: [
        { id: 10, title: "Tab A", url: "https://a.com", favIconUrl: null },
        { id: 11, title: "Tab B", url: "https://b.com", favIconUrl: null },
      ],
      bookmarks: [],
      history: [],
    });
    ({ shadowRoot, messageListener } = await loadLauncher(browserMock));
  });

  afterEach(() => {
    const host = document.getElementById("qal-shadow-host");
    if (host) host.remove();
    delete globalThis.browser;
  });

  it("sends close-tab message and removes item from results on close button click", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "tab");

    const closeBtn = shadowRoot.querySelector(".qal-close-tab");
    closeBtn.click();

    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "close-tab", tabId: 10 }),
    );
    const remaining = shadowRoot.querySelectorAll(".qal-result-item");
    expect(remaining).toHaveLength(1);
  });

  it("removes the tabs section when the last tab is closed", async () => {
    browserMock.runtime.sendMessage.mockResolvedValue({
      tabs: [
        { id: 10, title: "Only Tab", url: "https://a.com", favIconUrl: null },
      ],
      bookmarks: [],
      history: [],
    });

    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "tab");

    const closeBtn = shadowRoot.querySelector(".qal-close-tab");
    closeBtn.click();

    const tabSection = shadowRoot.querySelector(
      '.qal-section[data-section="tabs"]',
    );
    expect(tabSection).toBeNull();
  });
});

describe("launcher.js - result item click navigation", () => {
  let browserMock;
  let shadowRoot;
  let messageListener;

  beforeEach(async () => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    browserMock = createBrowserMock();
    browserMock.runtime.sendMessage.mockResolvedValue({
      tabs: [
        {
          id: 5,
          title: "Click Me",
          url: "https://click.com",
          favIconUrl: null,
        },
      ],
      bookmarks: [],
      history: [],
    });
    ({ shadowRoot, messageListener } = await loadLauncher(browserMock));
  });

  afterEach(() => {
    const host = document.getElementById("qal-shadow-host");
    if (host) host.remove();
    delete globalThis.browser;
  });

  it("sends navigate message on result item click", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "click");

    browserMock.runtime.sendMessage.mockClear();

    const item = shadowRoot.querySelector(".qal-result-item");
    item.click();

    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "navigate" }),
    );
  });

  it("sends navigate with openInCurrent false when ctrlKey is pressed on a bookmark result", async () => {
    browserMock.runtime.sendMessage.mockResolvedValue({
      tabs: [],
      bookmarks: [
        { id: "b1", title: "Click Bookmark", url: "https://click.com" },
      ],
      history: [],
    });

    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "click");

    browserMock.runtime.sendMessage.mockClear();

    const item = shadowRoot.querySelector(".qal-result-item");
    item.dispatchEvent(
      new MouseEvent("click", { bubbles: true, ctrlKey: true }),
    );

    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: "navigate", openInCurrent: false }),
    );
  });

  it("does not send navigate message when clicking the results container outside an item", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "click");

    browserMock.runtime.sendMessage.mockClear();

    const container = shadowRoot.querySelector(".qal-results");
    container.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(browserMock.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

describe("launcher.js - renderError on sendMessage rejection", () => {
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

  it("shows error message when sendMessage rejects", async () => {
    browserMock.runtime.sendMessage.mockRejectedValue(
      new Error("network error"),
    );

    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "something");

    const error = shadowRoot.querySelector(".qal-empty-state");
    expect(error).toBeTruthy();
    expect(error.textContent).toContain("Errore");
  });
});

describe("launcher.js - loadConfig catch path", () => {
  afterEach(() => {
    const host = document.getElementById("qal-shadow-host");
    if (host) host.remove();
    delete globalThis.browser;
  });

  it("does not crash and keeps defaults when storage.local.get rejects", async () => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    const browserMock = createBrowserMock();
    browserMock.storage.local.get = vi
      .fn()
      .mockRejectedValue(new Error("storage unavailable"));

    await expect(loadLauncher(browserMock)).resolves.not.toThrow();

    const host = document.getElementById("qal-shadow-host");
    expect(host).toBeTruthy();
  });
});

describe("launcher.js - storage.onChanged listener", () => {
  let browserMock;

  afterEach(() => {
    const host = document.getElementById("qal-shadow-host");
    if (host) host.remove();
    delete globalThis.browser;
  });

  it("updates QAL_CONFIG when storage changes in local area with config key", async () => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    browserMock = createBrowserMock();
    await loadLauncher(browserMock);

    const onChangedListener =
      browserMock.storage.onChanged.addListener.mock.calls[0][0];
    const prevDebounce = globalThis.QAL_CONFIG.DEBOUNCE_MS;

    onChangedListener(
      { [CONFIG_STORAGE_KEY]: { newValue: { DEBOUNCE_MS: 999 } } },
      "local",
    );

    expect(globalThis.QAL_CONFIG.DEBOUNCE_MS).not.toBe(prevDebounce);
  });

  it("does not update QAL_CONFIG when area is sync", async () => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    browserMock = createBrowserMock();
    await loadLauncher(browserMock);

    const onChangedListener =
      browserMock.storage.onChanged.addListener.mock.calls[0][0];
    const prevDebounce = globalThis.QAL_CONFIG.DEBOUNCE_MS;

    onChangedListener(
      { [CONFIG_STORAGE_KEY]: { newValue: { DEBOUNCE_MS: 9999 } } },
      "sync",
    );

    expect(globalThis.QAL_CONFIG.DEBOUNCE_MS).toBe(prevDebounce);
  });
});

describe("launcher.js - createFavicon with invalid URL", () => {
  let browserMock;
  let shadowRoot;
  let messageListener;

  beforeEach(async () => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    browserMock = createBrowserMock();
    browserMock.runtime.sendMessage.mockResolvedValue({
      tabs: [],
      bookmarks: [{ id: "b1", title: "Invalid URL BM", url: "not-a-url" }],
      history: [],
    });
    ({ shadowRoot, messageListener } = await loadLauncher(browserMock));
  });

  afterEach(() => {
    const host = document.getElementById("qal-shadow-host");
    if (host) host.remove();
    delete globalThis.browser;
  });

  it("renders result without crash when item url is not a valid URL", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    await typeAndFlush(input, "invalid");

    const items = shadowRoot.querySelectorAll(".qal-result-item");
    expect(items.length).toBeGreaterThan(0);

    const favicon = items[0].querySelector(".qal-favicon");
    expect(favicon).toBeTruthy();
    expect(favicon.tagName).toBe("SPAN");
  });
});

describe("launcher.js - loading indicator", () => {
  let browserMock;
  let shadowRoot;
  let messageListener;

  beforeEach(async () => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    browserMock = createBrowserMock();
    // Slow sendMessage to trigger loading threshold
    browserMock.runtime.sendMessage.mockImplementation(
      () =>
        new Promise((r) =>
          setTimeout(() => r({ tabs: [], bookmarks: [], history: [] }), 1000),
        ),
    );
    ({ shadowRoot, messageListener } = await loadLauncher(browserMock));
  });

  afterEach(() => {
    const host = document.getElementById("qal-shadow-host");
    if (host) host.remove();
    delete globalThis.browser;
  });

  it("shows loading indicator after threshold when search is slow", async () => {
    messageListener({ action: "toggle" });
    const input = shadowRoot.querySelector(".qal-input");
    input.value = "slow";
    input.dispatchEvent(new Event("input"));

    // Wait for debounce + loading threshold
    await new Promise((r) =>
      setTimeout(
        r,
        QAL_CONFIG.DEBOUNCE_MS + QAL_CONFIG.LOADING_THRESHOLD_MS + 50,
      ),
    );

    const loading = shadowRoot.querySelector(".qal-loading");
    expect(loading).toBeTruthy();
    expect(loading.textContent).toContain("Ricerca in corso");
  });
});

describe("launcher.js - storage.onChanged in content script", () => {
  let browserMock;

  beforeEach(async () => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    browserMock = createBrowserMock();
    await loadLauncher(browserMock);
  });

  afterEach(() => {
    const host = document.getElementById("qal-shadow-host");
    if (host) host.remove();
    delete globalThis.browser;
  });

  it("updates QAL_CONFIG when storage.onChanged fires for config key", () => {
    const storageListener =
      browserMock.storage.onChanged.addListener.mock.calls[0][0];

    storageListener(
      { [CONFIG_STORAGE_KEY]: { newValue: { DEBOUNCE_MS: 200 } } },
      "local",
    );

    expect(QAL_CONFIG.DEBOUNCE_MS).toBe(200);
  });

  it("ignores storage.onChanged for non-local area", () => {
    const original = QAL_CONFIG.DEBOUNCE_MS;
    const storageListener =
      browserMock.storage.onChanged.addListener.mock.calls[0][0];

    storageListener(
      { [CONFIG_STORAGE_KEY]: { newValue: { DEBOUNCE_MS: 999 } } },
      "sync",
    );

    expect(QAL_CONFIG.DEBOUNCE_MS).toBe(original);
  });

  it("ignores storage.onChanged for unrelated keys", () => {
    const original = QAL_CONFIG.DEBOUNCE_MS;
    const storageListener =
      browserMock.storage.onChanged.addListener.mock.calls[0][0];

    storageListener({ other_key: { newValue: "something" } }, "local");

    expect(QAL_CONFIG.DEBOUNCE_MS).toBe(original);
  });
});
