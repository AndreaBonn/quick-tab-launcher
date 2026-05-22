import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  QAL_CONFIG,
  deduplicateResults,
  normalizeUrl,
} = require("../src/search-utils.js");

/**
 * Browser API mock factory.
 * Returns a mock `browser` object matching the WebExtension APIs
 * used by background.js.
 */
function createBrowserMock() {
  return {
    commands: {
      onCommand: { addListener: vi.fn() },
    },
    browserAction: {
      onClicked: { addListener: vi.fn() },
      setPopup: vi.fn().mockResolvedValue(undefined),
    },
    runtime: {
      onMessage: { addListener: vi.fn() },
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: { addListener: vi.fn() },
    },
    tabs: {
      query: vi.fn().mockResolvedValue([]),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue({}),
      get: vi
        .fn()
        .mockResolvedValue({ windowId: 1, url: "https://example.com" }),
      create: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue(undefined),
      onActivated: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
    },
    bookmarks: {
      search: vi.fn().mockResolvedValue([]),
    },
    history: {
      search: vi.fn().mockResolvedValue([]),
    },
    windows: {
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

/**
 * Loads background.js in a controlled environment.
 * Captures the listener callbacks registered on browser.commands and browser.runtime.
 */
const {
  QAL_CONFIG_DEFAULTS,
  CONFIG_STORAGE_KEY,
  mergeWithDefaults,
  loadUserConfig,
  saveUserConfig,
  applyConfigToGlobal,
} = require("../src/config-storage.js");

function loadBackground(browserMock) {
  globalThis.browser = browserMock;
  globalThis.QAL_CONFIG = QAL_CONFIG;
  globalThis.QAL_CONFIG_DEFAULTS = QAL_CONFIG_DEFAULTS;
  globalThis.CONFIG_STORAGE_KEY = CONFIG_STORAGE_KEY;
  globalThis.mergeWithDefaults = mergeWithDefaults;
  globalThis.loadUserConfig = loadUserConfig;
  globalThis.saveUserConfig = saveUserConfig;
  globalThis.applyConfigToGlobal = applyConfigToGlobal;
  globalThis.deduplicateResults = deduplicateResults;
  globalThis.normalizeUrl = normalizeUrl;

  // Clear module cache to re-execute background.js
  delete require.cache[require.resolve("../background/background.js")];
  const bg = require("../background/background.js");

  // Expose testable internals to globalThis for unit tests
  if (bg && bg.extractTabContent) {
    globalThis.extractTabContent = bg.extractTabContent;
  }
  if (bg && bg.isPrivilegedUrl) {
    globalThis.isPrivilegedUrl = bg.isPrivilegedUrl;
  }
  if (bg && bg.updatePopupForTab) {
    globalThis.updatePopupForTab = bg.updatePopupForTab;
  }

  const commandListener =
    browserMock.commands.onCommand.addListener.mock.calls[0][0];
  const messageListener =
    browserMock.runtime.onMessage.addListener.mock.calls[0][0];
  const browserActionListener =
    browserMock.browserAction.onClicked.addListener.mock.calls[0][0];
  const tabActivatedListener =
    browserMock.tabs.onActivated.addListener.mock.calls[0]?.[0];
  const tabUpdatedListener =
    browserMock.tabs.onUpdated.addListener.mock.calls[0]?.[0];

  // Reset call history accumulated during module load (init queries, etc.)
  // so individual tests can assert cleanly on their own interactions.
  browserMock.tabs.query.mockClear();
  browserMock.tabs.sendMessage.mockClear();
  browserMock.browserAction.setPopup.mockClear();

  return {
    commandListener,
    messageListener,
    browserActionListener,
    tabActivatedListener,
    tabUpdatedListener,
  };
}

describe("background.js - command listener", () => {
  let browserMock;
  let commandListener;

  beforeEach(() => {
    browserMock = createBrowserMock();
    ({ commandListener } = loadBackground(browserMock));
  });

  it("sends toggle message to active tab on toggle-launcher command", async () => {
    const activeTab = { id: 42 };
    browserMock.tabs.query.mockResolvedValue([activeTab]);

    await commandListener("toggle-launcher");

    expect(browserMock.tabs.query).toHaveBeenCalledWith({
      active: true,
      currentWindow: true,
    });
    expect(browserMock.tabs.sendMessage).toHaveBeenCalledWith(42, {
      action: "toggle",
    });
  });

  it("ignores non-toggle commands", async () => {
    await commandListener("some-other-command");
    expect(browserMock.tabs.query).not.toHaveBeenCalled();
  });

  it("handles sendMessage failure gracefully on unsupported pages", async () => {
    browserMock.tabs.query.mockResolvedValue([{ id: 10 }]);
    browserMock.tabs.sendMessage.mockRejectedValue(
      new Error("Could not establish connection"),
    );

    await expect(commandListener("toggle-launcher")).resolves.toBeUndefined();
  });
});

describe("background.js - browserAction click", () => {
  let browserMock;
  let browserActionListener;

  beforeEach(() => {
    browserMock = createBrowserMock();
    ({ browserActionListener } = loadBackground(browserMock));
  });

  it("sends toggle message to active tab on icon click", async () => {
    const activeTab = { id: 7 };
    browserMock.tabs.query.mockResolvedValue([activeTab]);

    await browserActionListener();

    expect(browserMock.tabs.query).toHaveBeenCalledWith({
      active: true,
      currentWindow: true,
    });
    expect(browserMock.tabs.sendMessage).toHaveBeenCalledWith(7, {
      action: "toggle",
    });
  });

  it("handles click failure gracefully on unsupported pages", async () => {
    browserMock.tabs.query.mockResolvedValue([{ id: 5 }]);
    browserMock.tabs.sendMessage.mockRejectedValue(
      new Error("Could not establish connection"),
    );

    await expect(browserActionListener()).resolves.toBeUndefined();
  });
});

describe("background.js - search handler", () => {
  let browserMock;
  let messageListener;

  beforeEach(() => {
    browserMock = createBrowserMock();
    ({ messageListener } = loadBackground(browserMock));
  });

  it("returns async response for search action", () => {
    const sendResponse = vi.fn();
    const result = messageListener(
      { action: "search", query: "test" },
      { tab: { id: 1 } },
      sendResponse,
    );
    expect(result).toBe(true);
  });

  it("searches tabs matching query in title", async () => {
    browserMock.tabs.query.mockResolvedValue([
      {
        id: 1,
        title: "Test Page",
        url: "https://example.com",
        favIconUrl: "icon.png",
        active: false,
      },
      {
        id: 2,
        title: "Other Page",
        url: "https://other.com",
        active: true,
      },
    ]);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "test" },
      { tab: { id: 1 } },
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    const results = sendResponse.mock.calls[0][0];
    expect(results.tabs).toHaveLength(1);
    expect(results.tabs[0].title).toBe("Test Page");
    expect(results.tabs[0].favIconUrl).toBe("icon.png");
  });

  it("searches tabs matching query in URL", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, title: "Page", url: "https://github.com/search", active: false },
    ]);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "github" },
      { tab: { id: 1 } },
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    const results = sendResponse.mock.calls[0][0];
    expect(results.tabs).toHaveLength(1);
  });

  it("limits tab results to MAX_TAB_RESULTS", async () => {
    const manyTabs = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      title: `Tab match ${i}`,
      url: `https://match${i}.com`,
      active: false,
    }));
    browserMock.tabs.query.mockResolvedValue(manyTabs);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "match" },
      { tab: { id: 1 } },
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(sendResponse.mock.calls[0][0].tabs).toHaveLength(
      QAL_CONFIG.MAX_TAB_RESULTS,
    );
  });

  it("skips bookmarks and history for single-character queries", async () => {
    browserMock.tabs.query.mockResolvedValue([]);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "a" },
      { tab: { id: 1 } },
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(browserMock.bookmarks.search).not.toHaveBeenCalled();
    expect(browserMock.history.search).not.toHaveBeenCalled();
  });

  it("searches bookmarks for 2+ character queries", async () => {
    browserMock.tabs.query.mockResolvedValue([]);
    browserMock.bookmarks.search.mockResolvedValue([
      { id: "b1", title: "Bookmark", url: "https://bm.com" },
      { id: "b2", title: "Folder" }, // no url = folder, should be excluded
    ]);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "bo" },
      { tab: { id: 1 } },
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    const results = sendResponse.mock.calls[0][0];
    expect(results.bookmarks).toHaveLength(1);
    expect(results.bookmarks[0].title).toBe("Bookmark");
  });

  it("searches history with correct time range", async () => {
    browserMock.tabs.query.mockResolvedValue([]);
    browserMock.bookmarks.search.mockResolvedValue([]);
    browserMock.history.search.mockResolvedValue([
      {
        id: "h1",
        title: "History Item",
        url: "https://hist.com",
        visitCount: 5,
        lastVisitTime: Date.now(),
      },
    ]);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "hist" },
      { tab: { id: 1 } },
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

    const historyCall = browserMock.history.search.mock.calls[0][0];
    expect(historyCall.text).toBe("hist");
    expect(historyCall.maxResults).toBe(QAL_CONFIG.MAX_HISTORY_RESULTS);
    expect(historyCall.startTime).toBeGreaterThan(0);
  });

  it("returns empty results for empty query", async () => {
    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "   " },
      { tab: { id: 1 } },
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    const results = sendResponse.mock.calls[0][0];
    expect(results.tabs).toHaveLength(0);
    expect(results.bookmarks).toHaveLength(0);
    expect(results.history).toHaveLength(0);
  });

  it("uses tab title fallback when title is missing", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, title: null, url: "https://example.com/path", active: false },
    ]);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "example" },
      { tab: { id: 1 } },
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(sendResponse.mock.calls[0][0].tabs[0].title).toBe("example.com");
  });
});

describe("background.js - navigate handler", () => {
  let browserMock;
  let messageListener;

  beforeEach(() => {
    browserMock = createBrowserMock();
    ({ messageListener } = loadBackground(browserMock));
  });

  it("switches to existing tab for tab type", () => {
    messageListener(
      { action: "navigate", type: "tab", tabId: 42 },
      { tab: { id: 10 } },
      vi.fn(),
    );

    expect(browserMock.tabs.update).toHaveBeenCalledWith(42, { active: true });
  });

  it("creates new tab for bookmark type", async () => {
    messageListener(
      {
        action: "navigate",
        type: "bookmark",
        url: "https://bm.com",
        openInCurrent: false,
      },
      { tab: { id: 10 } },
      vi.fn(),
    );

    await vi.waitFor(() =>
      expect(browserMock.tabs.create).toHaveBeenCalledWith({
        url: "https://bm.com",
        active: true,
      }),
    );
  });

  it("opens in current tab when openInCurrent is false for bookmarks", async () => {
    messageListener(
      {
        action: "navigate",
        type: "history",
        url: "https://hist.com",
        openInCurrent: false,
      },
      { tab: { id: 10 } },
      vi.fn(),
    );

    await vi.waitFor(() =>
      expect(browserMock.tabs.create).toHaveBeenCalledWith({
        url: "https://hist.com",
        active: true,
      }),
    );
  });

  it("does not return true for navigate action (sync)", () => {
    const result = messageListener(
      { action: "navigate", type: "tab", tabId: 42 },
      { tab: { id: 10 } },
      vi.fn(),
    );
    expect(result).toBe(false);
  });
});

describe("background.js - searchTabs - all windows", () => {
  let browserMock;
  let messageListener;

  beforeEach(() => {
    browserMock = createBrowserMock();
    ({ messageListener } = loadBackground(browserMock));
  });

  it("queries all tabs without currentWindow filter", async () => {
    browserMock.tabs.query.mockResolvedValue([]);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "test" },
      { tab: { id: 1, windowId: 10 } },
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

    const tabsQueryCall = browserMock.tabs.query.mock.calls.find(
      (call) => !call[0].active,
    );
    expect(tabsQueryCall[0]).toEqual({});
  });

  it("includes windowId in tab results", async () => {
    browserMock.tabs.query.mockResolvedValue([
      {
        id: 1,
        title: "Test Page",
        url: "https://example.com",
        favIconUrl: null,
        active: false,
        windowId: 10,
      },
    ]);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "test" },
      { tab: { id: 1, windowId: 10 } },
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    const results = sendResponse.mock.calls[0][0];
    expect(results.tabs[0].windowId).toBe(10);
  });

  it("marks tab from same window as isCurrentWindow true", async () => {
    browserMock.tabs.query.mockResolvedValue([
      {
        id: 1,
        title: "Same Window",
        url: "https://example.com",
        favIconUrl: null,
        active: false,
        windowId: 10,
      },
    ]);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "same" },
      { tab: { id: 1, windowId: 10 } },
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    const results = sendResponse.mock.calls[0][0];
    expect(results.tabs[0].isCurrentWindow).toBe(true);
  });

  it("marks tab from different window as isCurrentWindow false", async () => {
    browserMock.tabs.query.mockResolvedValue([
      {
        id: 5,
        title: "Other Window",
        url: "https://other.com",
        favIconUrl: null,
        active: false,
        windowId: 99,
      },
    ]);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "other" },
      { tab: { id: 1, windowId: 10 } },
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    const results = sendResponse.mock.calls[0][0];
    expect(results.tabs[0].isCurrentWindow).toBe(false);
  });
});

describe("background.js - extractTabContent", () => {
  let browserMock;

  beforeEach(() => {
    browserMock = createBrowserMock();
    browserMock.tabs.executeScript = vi
      .fn()
      .mockResolvedValue(["Page content TEXT"]);
    loadBackground(browserMock);
  });

  it("returns lowercase text from executeScript result", async () => {
    const content = await globalThis.extractTabContent(1);
    expect(content).toBe("page content text");
  });

  it("truncates content to FULLTEXT_MAX_LENGTH", async () => {
    const longText = "a".repeat(20000);
    browserMock.tabs.executeScript.mockResolvedValue([longText]);
    const content = await globalThis.extractTabContent(1);
    expect(content.length).toBeLessThanOrEqual(QAL_CONFIG.FULLTEXT_MAX_LENGTH);
  });

  it("returns empty string when executeScript throws", async () => {
    browserMock.tabs.executeScript.mockRejectedValue(
      new Error("Restricted page"),
    );
    const content = await globalThis.extractTabContent(1);
    expect(content).toBe("");
  });

  it("returns empty string when executeScript returns falsy result", async () => {
    browserMock.tabs.executeScript.mockResolvedValue([null]);
    const content = await globalThis.extractTabContent(1);
    expect(content).toBe("");
  });
});

describe("background.js - fulltext search", () => {
  let browserMock;
  let messageListener;

  beforeEach(() => {
    browserMock = createBrowserMock();
    browserMock.tabs.executeScript = vi
      .fn()
      .mockResolvedValue(["page content text"]);
    ({ messageListener } = loadBackground(browserMock));
  });

  it("does NOT call executeScript when ENABLE_FULLTEXT_SEARCH is false", async () => {
    QAL_CONFIG.ENABLE_FULLTEXT_SEARCH = false;
    browserMock.tabs.query.mockResolvedValue([
      {
        id: 1,
        title: "Unrelated",
        url: "https://example.com",
        active: false,
        windowId: 1,
      },
    ]);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "content" },
      { tab: { id: 99, windowId: 1 } },
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(browserMock.tabs.executeScript).not.toHaveBeenCalled();
  });

  it("calls executeScript for non-matching tabs when ENABLE_FULLTEXT_SEARCH is true", async () => {
    QAL_CONFIG.ENABLE_FULLTEXT_SEARCH = true;
    browserMock.tabs.query.mockResolvedValue([
      {
        id: 1,
        title: "Unrelated",
        url: "https://example.com",
        active: false,
        windowId: 1,
      },
    ]);
    browserMock.tabs.executeScript.mockResolvedValue([
      "contains the search term here",
    ]);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "search term" },
      { tab: { id: 99, windowId: 1 } },
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(browserMock.tabs.executeScript).toHaveBeenCalledWith(
      1,
      expect.any(Object),
    );
    const results = sendResponse.mock.calls[0][0];
    expect(results.tabs).toHaveLength(1);
    expect(results.tabs[0].isContentMatch).toBe(true);
  });

  it("title/url match has priority over content match", async () => {
    QAL_CONFIG.ENABLE_FULLTEXT_SEARCH = true;
    browserMock.tabs.query.mockResolvedValue([
      {
        id: 1,
        title: "term in title",
        url: "https://example.com",
        active: false,
        windowId: 1,
      },
      {
        id: 2,
        title: "Unrelated",
        url: "https://other.com",
        active: false,
        windowId: 1,
      },
    ]);
    browserMock.tabs.executeScript.mockResolvedValue([
      "page has the term in body",
    ]);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "term" },
      { tab: { id: 99, windowId: 1 } },
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    const results = sendResponse.mock.calls[0][0];
    expect(results.tabs[0].id).toBe(1);
    expect(results.tabs[0].isContentMatch).toBeFalsy();
    expect(results.tabs[1].id).toBe(2);
    expect(results.tabs[1].isContentMatch).toBe(true);
  });

  it("does NOT call executeScript for tabs already matched by title/url", async () => {
    QAL_CONFIG.ENABLE_FULLTEXT_SEARCH = true;
    browserMock.tabs.query.mockResolvedValue([
      {
        id: 1,
        title: "term in title",
        url: "https://example.com",
        active: false,
        windowId: 1,
      },
    ]);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "term" },
      { tab: { id: 99, windowId: 1 } },
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(browserMock.tabs.executeScript).not.toHaveBeenCalled();
  });

  it("skips tab without error when executeScript fails on it", async () => {
    QAL_CONFIG.ENABLE_FULLTEXT_SEARCH = true;
    browserMock.tabs.query.mockResolvedValue([
      {
        id: 1,
        title: "Unrelated",
        url: "about:blank",
        active: false,
        windowId: 1,
      },
      {
        id: 2,
        title: "Unrelated2",
        url: "https://other.com",
        active: false,
        windowId: 1,
      },
    ]);
    browserMock.tabs.executeScript
      .mockRejectedValueOnce(new Error("Restricted"))
      .mockResolvedValueOnce(["contains the search content here"]);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "search content" },
      { tab: { id: 99, windowId: 1 } },
      sendResponse,
    );

    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    const results = sendResponse.mock.calls[0][0];
    expect(results.tabs).toHaveLength(1);
    expect(results.tabs[0].id).toBe(2);
  });
});

describe("background.js - close-tab handler", () => {
  let browserMock;
  let messageListener;

  beforeEach(() => {
    browserMock = createBrowserMock();
    ({ messageListener } = loadBackground(browserMock));
  });

  it("removes the specified tab", () => {
    messageListener(
      { action: "close-tab", tabId: 99 },
      { tab: { id: 10 } },
      vi.fn(),
    );

    expect(browserMock.tabs.remove).toHaveBeenCalledWith(99);
  });

  it("does not return true for close-tab action (sync)", () => {
    const result = messageListener(
      { action: "close-tab", tabId: 99 },
      { tab: { id: 10 } },
      vi.fn(),
    );
    expect(result).toBe(false);
  });
});

describe("background.js - isPrivilegedUrl", () => {
  beforeEach(() => {
    const browserMock = createBrowserMock();
    loadBackground(browserMock);
  });

  it("returns true for about: URLs", () => {
    expect(globalThis.isPrivilegedUrl("about:config")).toBe(true);
    expect(globalThis.isPrivilegedUrl("about:blank")).toBe(true);
  });

  it("returns true for moz-extension: URLs", () => {
    expect(
      globalThis.isPrivilegedUrl("moz-extension://fake-id/page.html"),
    ).toBe(true);
  });

  it("returns true for file: URLs", () => {
    expect(globalThis.isPrivilegedUrl("file:///home/user/doc.html")).toBe(true);
  });

  it("returns true for chrome: URLs", () => {
    expect(globalThis.isPrivilegedUrl("chrome://newtab")).toBe(true);
  });

  it("returns true for resource: URLs", () => {
    expect(globalThis.isPrivilegedUrl("resource://gre/")).toBe(true);
  });

  it("returns true for data: URLs", () => {
    expect(globalThis.isPrivilegedUrl("data:text/html,<h1>Hi</h1>")).toBe(true);
  });

  it("returns false for https: URLs", () => {
    expect(globalThis.isPrivilegedUrl("https://example.com")).toBe(false);
  });

  it("returns false for http: URLs", () => {
    expect(globalThis.isPrivilegedUrl("http://localhost:3000")).toBe(false);
  });

  it("returns true for undefined", () => {
    expect(globalThis.isPrivilegedUrl(undefined)).toBe(true);
  });

  it("returns true for null", () => {
    expect(globalThis.isPrivilegedUrl(null)).toBe(true);
  });

  it("returns true for empty string", () => {
    expect(globalThis.isPrivilegedUrl("")).toBe(true);
  });
});

describe("background.js - updatePopupForTab", () => {
  let browserMock;

  beforeEach(() => {
    browserMock = createBrowserMock();
    loadBackground(browserMock);
  });

  it("sets popup to popup.html for privileged tab", async () => {
    browserMock.tabs.get.mockResolvedValue({ url: "about:config" });
    await globalThis.updatePopupForTab(1);
    expect(browserMock.browserAction.setPopup).toHaveBeenCalledWith({
      popup: "popup/popup.html",
    });
  });

  it("sets popup to empty string for normal tab", async () => {
    browserMock.tabs.get.mockResolvedValue({ url: "https://example.com" });
    await globalThis.updatePopupForTab(42);
    expect(browserMock.browserAction.setPopup).toHaveBeenCalledWith({
      popup: "",
    });
  });

  it("does not throw when tab does not exist", async () => {
    browserMock.tabs.get.mockRejectedValue(new Error("No such tab"));
    await expect(globalThis.updatePopupForTab(999)).resolves.toBeUndefined();
  });
});

describe("background.js - handleNavigate with undefined senderTabId", () => {
  let browserMock;
  let messageListener;

  beforeEach(() => {
    browserMock = createBrowserMock();
    ({ messageListener } = loadBackground(browserMock));
  });

  it("does not call sendMessage when senderTabId is undefined (popup caller)", async () => {
    messageListener(
      { action: "navigate", type: "tab", tabId: 5 },
      { tab: undefined },
      vi.fn(),
    );

    await vi.waitFor(() =>
      expect(browserMock.tabs.update).toHaveBeenCalledWith(5, { active: true }),
    );

    const sendMessageCalls = browserMock.tabs.sendMessage.mock.calls;
    expect(sendMessageCalls.every((call) => call[1]?.action !== "close")).toBe(
      true,
    );
  });
});
