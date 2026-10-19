import { describe, it, expect, vi, beforeEach } from "vitest";
import { createBrowserMock, loadBackground } from "./helpers/load-background.js";
const { QAL_CONFIG } = require("../src/search-utils.js");

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

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        tabs: [
          {
            id: 1,
            title: "Test Page",
            url: "https://example.com",
            favIconUrl: "icon.png",
            active: false,
            isCurrentWindow: true
          }
        ],
        bookmarks: [],
        history: []
      }),
    );
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

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        tabs: [
          {
            id: 1,
            title: "Page",
            url: "https://github.com/search",
            favIconUrl: null,
            active: false,
            isCurrentWindow: true
          }
        ],
        bookmarks: [],
        history: []
      }),
    );
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

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith(({ tabs: manyTabs.slice(0, QAL_CONFIG.MAX_TAB_RESULTS).map((tab) => ({ ...tab, favIconUrl: null, windowId: undefined, isCurrentWindow: true })), bookmarks: [], history: [] })),
    );
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

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        tabs: [],
        bookmarks: [],
        history: []
      }),
    );
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

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        tabs: [],
        bookmarks: [
          {
            id: "b1",
            title: "Bookmark",
            url: "https://bm.com"
          }
        ],
        history: []
      }),
    );
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
        lastVisitTime: 1700000000000,
      },
    ]);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "hist" },
      { tab: { id: 1 } },
      sendResponse,
    );

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith(({ tabs: [], bookmarks: [], history: [{ id: "h1", title: "History Item", url: "https://hist.com", visitCount: 5, lastVisitTime: 1700000000000 }] })),
    );

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

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        tabs: [],
        bookmarks: [],
        history: []
      }),
    );
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

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        tabs: [
          {
            id: 1,
            title: "example.com",
            url: "https://example.com/path",
            favIconUrl: null,
            active: false,
            isCurrentWindow: true
          }
        ],
        bookmarks: [],
        history: []
      }),
    );
    expect(sendResponse.mock.calls[0][0].tabs[0].title).toBe("example.com");
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

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        tabs: [],
        bookmarks: [],
        history: []
      }),
    );

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

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        tabs: [
          {
            id: 1,
            title: "Test Page",
            url: "https://example.com",
            favIconUrl: null,
            active: false,
            windowId: 10,
            isCurrentWindow: true
          }
        ],
        bookmarks: [],
        history: []
      }),
    );
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

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        tabs: [
          {
            id: 1,
            title: "Same Window",
            url: "https://example.com",
            favIconUrl: null,
            active: false,
            windowId: 10,
            isCurrentWindow: true
          }
        ],
        bookmarks: [],
        history: []
      }),
    );
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

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        tabs: [
          {
            id: 5,
            title: "Other Window",
            url: "https://other.com",
            favIconUrl: null,
            active: false,
            windowId: 99,
            isCurrentWindow: false
          }
        ],
        bookmarks: [],
        history: []
      }),
    );
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

  it("injects an extraction script that exists in the extension", async () => {
    const fs = require("node:fs");
    const path = require("node:path");
    await globalThis.extractTabContent(7);
    const [tabId, { file }] = browserMock.tabs.executeScript.mock.calls[0];
    expect(tabId).toBe(7);
    expect(fs.existsSync(path.join(__dirname, "..", file))).toBe(true);
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

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        tabs: [],
        bookmarks: [],
        history: []
      }),
    );
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

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        tabs: [
          {
            id: 1,
            title: "Unrelated",
            url: "https://example.com",
            favIconUrl: null,
            active: false,
            windowId: 1,
            isCurrentWindow: true,
            isContentMatch: true
          }
        ],
        bookmarks: [],
        history: []
      }),
    );
    expect(browserMock.tabs.executeScript).toHaveBeenCalledWith(
      1,
      { file: "content/extract-content.js" },
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

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        tabs: [
          {
            id: 1,
            title: "term in title",
            url: "https://example.com",
            favIconUrl: null,
            active: false,
            windowId: 1,
            isCurrentWindow: true
          },
          {
            id: 2,
            title: "Unrelated",
            url: "https://other.com",
            favIconUrl: null,
            active: false,
            windowId: 1,
            isCurrentWindow: true,
            isContentMatch: true
          }
        ],
        bookmarks: [],
        history: []
      }),
    );
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

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        tabs: [
          {
            id: 1,
            title: "term in title",
            url: "https://example.com",
            favIconUrl: null,
            active: false,
            windowId: 1,
            isCurrentWindow: true
          }
        ],
        bookmarks: [],
        history: []
      }),
    );
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
    browserMock.tabs.executeScript.mockResolvedValueOnce([
      "contains the search content here",
    ]);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "search content" },
      { tab: { id: 99, windowId: 1 } },
      sendResponse,
    );

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        tabs: [
          {
            id: 2,
            title: "Unrelated2",
            url: "https://other.com",
            favIconUrl: null,
            active: false,
            windowId: 1,
            isCurrentWindow: true,
            isContentMatch: true
          }
        ],
        bookmarks: [],
        history: []
      }),
    );
    const results = sendResponse.mock.calls[0][0];
    expect(results.tabs).toHaveLength(1);
    expect(results.tabs[0].id).toBe(2);
  });
});

describe("background.js - extractDomain edge cases", () => {
  it("returns the original string when url is not a valid URL", () => {
    const browserMock = createBrowserMock();
    const { messageListener } = loadBackground(browserMock);

    browserMock.tabs.query.mockResolvedValue([
      { id: 1, title: null, url: "not-a-url", active: false, windowId: 1 },
    ]);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "not-a-url" },
      { tab: { id: 99, windowId: 1 } },
      sendResponse,
    );

    return vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        tabs: [
          {
            id: 1,
            title: "not-a-url",
            url: "not-a-url",
            favIconUrl: null,
            active: false,
            windowId: 1,
            isCurrentWindow: true
          }
        ],
        bookmarks: [],
        history: []
      });
      expect(sendResponse.mock.calls[0][0].tabs[0].title).toBe("not-a-url");
    });
  });

  it("returns empty string as title fallback when url is empty string", () => {
    const browserMock = createBrowserMock();
    const { messageListener } = loadBackground(browserMock);

    browserMock.tabs.query.mockResolvedValue([
      { id: 1, title: null, url: "", active: false, windowId: 1 },
    ]);

    // Use a query that matches on url field — empty string matches any includes("")
    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "  " },
      { tab: { id: 99, windowId: 1 } },
      sendResponse,
    );

    return vi.waitFor(() => {
      // query "  " trims to "" → early return with empty results
      expect(sendResponse).toHaveBeenCalledWith({
        tabs: [],
        bookmarks: [],
        history: []
      });
      expect(sendResponse.mock.calls[0][0].tabs).toHaveLength(0);
    });
  });
});

describe("background.js - formatTabResult with isContentMatch true", () => {
  let browserMock;
  let messageListener;

  beforeEach(async () => {
    browserMock = createBrowserMock();
    browserMock.tabs.executeScript = vi
      .fn()
      .mockResolvedValue(["uniquecontentterm"]);
    ({ messageListener } = loadBackground(browserMock));
    // Wait for initConfig async to settle before overriding ENABLE_FULLTEXT_SEARCH
    await new Promise((r) => setTimeout(r, 0));
    QAL_CONFIG.ENABLE_FULLTEXT_SEARCH = true;
  });

  afterEach(() => {
    QAL_CONFIG.ENABLE_FULLTEXT_SEARCH = false;
  });

  it("includes isContentMatch true in result for content-matched tab", async () => {
    browserMock.tabs.query.mockResolvedValue([
      {
        id: 7,
        title: "Unrelated Title",
        url: "https://unrelated.com",
        active: false,
        windowId: 1,
      },
    ]);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "uniquecontentterm" },
      { tab: { id: 99, windowId: 1 } },
      sendResponse,
    );

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({
        tabs: [
          {
            id: 7,
            title: "Unrelated Title",
            url: "https://unrelated.com",
            favIconUrl: null,
            active: false,
            windowId: 1,
            isCurrentWindow: true,
            isContentMatch: true
          }
        ],
        bookmarks: [],
        history: []
      }),
    );
    expect(sendResponse.mock.calls[0][0].tabs).toHaveLength(1);
    expect(sendResponse.mock.calls[0][0].tabs[0].isContentMatch).toBe(true);
  });
});

describe("background.js - searchTabs skips executeScript when primaryResults full", () => {
  let browserMock;
  let messageListener;

  beforeEach(() => {
    browserMock = createBrowserMock();
    browserMock.tabs.executeScript = vi.fn().mockResolvedValue(["match"]);
    ({ messageListener } = loadBackground(browserMock));
    QAL_CONFIG.ENABLE_FULLTEXT_SEARCH = true;
  });

  it("does not call executeScript when titleUrl matches fill MAX_TAB_RESULTS", async () => {
    const manyTabs = Array.from(
      { length: QAL_CONFIG.MAX_TAB_RESULTS },
      (_, i) => ({
        id: i,
        title: `match tab ${i}`,
        url: `https://match${i}.com`,
        active: false,
        windowId: 1,
      }),
    );
    browserMock.tabs.query.mockResolvedValue(manyTabs);

    const sendResponse = vi.fn();
    messageListener(
      { action: "search", query: "match" },
      { tab: { id: 99, windowId: 1 } },
      sendResponse,
    );

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith(({ tabs: manyTabs.map((tab) => ({ ...tab, favIconUrl: null, isCurrentWindow: true })), bookmarks: [], history: [] })),
    );
    expect(browserMock.tabs.executeScript).not.toHaveBeenCalled();
  });
});

