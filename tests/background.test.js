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
    },
    runtime: {
      onMessage: { addListener: vi.fn() },
    },
    tabs: {
      query: vi.fn().mockResolvedValue([]),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue({}),
      get: vi.fn().mockResolvedValue({ windowId: 1 }),
      create: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue(undefined),
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
function loadBackground(browserMock) {
  globalThis.browser = browserMock;
  globalThis.QAL_CONFIG = QAL_CONFIG;
  globalThis.deduplicateResults = deduplicateResults;
  globalThis.normalizeUrl = normalizeUrl;

  // Clear module cache to re-execute background.js
  delete require.cache[require.resolve("../background/background.js")];
  require("../background/background.js");

  const commandListener =
    browserMock.commands.onCommand.addListener.mock.calls[0][0];
  const messageListener =
    browserMock.runtime.onMessage.addListener.mock.calls[0][0];
  const browserActionListener =
    browserMock.browserAction.onClicked.addListener.mock.calls[0][0];

  return { commandListener, messageListener, browserActionListener };
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
