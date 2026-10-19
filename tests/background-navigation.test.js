import { describe, it, expect, vi, beforeEach } from "vitest";
import { createBrowserMock, loadBackground } from "./helpers/load-background.js";

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

  it("answers closed: 0 when Firefox refuses to close the tab", async () => {
    browserMock.tabs.remove.mockRejectedValue(new Error("Tab not found"));
    const sendResponse = vi.fn();
    messageListener(
      { action: "close-tab", tabId: 99 },
      { tab: { id: 10 } },
      sendResponse,
    );
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({ closed: 0 }),
    );
  });

  it("answers once the tab is closed, so the panel can offer undo", async () => {
    const sendResponse = vi.fn();
    const result = messageListener(
      { action: "close-tab", tabId: 99 },
      { tab: { id: 10 } },
      sendResponse,
    );
    expect(result).toBe(true);
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({ closed: 1 }),
    );
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

describe("background.js - handleCloseTab error path", () => {
  let browserMock;
  let messageListener;

  beforeEach(() => {
    browserMock = createBrowserMock();
    ({ messageListener } = loadBackground(browserMock));
  });

  it("does not crash when tabs.remove rejects", async () => {
    browserMock.tabs.remove.mockRejectedValue(new Error("Tab not found"));

    await expect(
      new Promise((resolve) => {
        messageListener(
          { action: "close-tab", tabId: 999 },
          { tab: { id: 10 } },
          vi.fn(),
        );
        setTimeout(resolve, 10);
      }),
    ).resolves.toBeUndefined();
  });
});

describe("background.js - handleNavigate edge cases", () => {
  let browserMock;
  let messageListener;

  beforeEach(() => {
    browserMock = createBrowserMock();
    ({ messageListener } = loadBackground(browserMock));
  });

  afterEach(() => {
    delete globalThis.browser;
  });

  it("opens bookmark in current tab when openInCurrent is true", async () => {
    messageListener(
      {
        action: "navigate",
        type: "bookmark",
        url: "https://bookmark.com",
        openInCurrent: true,
      },
      { tab: { id: 10 } },
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(browserMock.tabs.update).toHaveBeenCalledWith(10, {
      url: "https://bookmark.com",
    });
  });

  it("logs error when handleNavigate fails", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    browserMock.tabs.update.mockRejectedValueOnce(new Error("tab gone"));

    messageListener(
      { action: "navigate", type: "tab", tabId: 999 },
      { tab: { id: 10 } },
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("navigazione fallita"),
      expect.any(String),
    );
    logSpy.mockRestore();
  });
});

describe("background.js - web search (R9)", () => {
  function load(granted) {
    const browserMock = createBrowserMock();
    browserMock.permissions = {
      contains: vi.fn().mockResolvedValue(granted),
    };
    browserMock.search = { query: vi.fn().mockResolvedValue(undefined) };
    const { messageListener } = loadBackground(browserMock);
    return { browserMock, messageListener };
  }

  it("reports whether the user turned web search on", async () => {
    const { messageListener, browserMock } = load(true);
    const sendResponse = vi.fn();
    messageListener({ action: "get-web-search-state" }, {}, sendResponse);
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({ enabled: true }),
    );
    expect(browserMock.permissions.contains).toHaveBeenCalledWith({
      permissions: ["search"],
    });
  });

  it("returns true from the exported handler after starting a web search", async () => {
    const { browserMock } = load(true);
    const { runWebSearch } = require("../background/navigation.js");

    await expect(
      runWebSearch({ query: "exported search", newTab: false }, 7),
    ).resolves.toBe(true);
    expect(browserMock.search.query).toHaveBeenCalledWith({
      text: "exported search",
      tabId: 7,
    });
  });

  it("searches in the tab the panel is on", async () => {
    const { messageListener, browserMock } = load(true);
    messageListener(
      { action: "web-search", query: "fattura iva", newTab: false },
      { tab: { id: 7 } },
      vi.fn(),
    );
    await vi.waitFor(() =>
      expect(browserMock.search.query).toHaveBeenCalledWith({
        text: "fattura iva",
        tabId: 7,
      }),
    );
  });

  it("searches in a new tab with Ctrl+Enter or from the popup", async () => {
    const { messageListener, browserMock } = load(true);
    messageListener(
      { action: "web-search", query: "x", newTab: true },
      { tab: { id: 7 } },
      vi.fn(),
    );
    messageListener(
      { action: "web-search", query: "y", newTab: false },
      {},
      vi.fn(),
    );
    await vi.waitFor(() =>
      expect(browserMock.search.query).toHaveBeenCalledTimes(2),
    );
    expect(browserMock.search.query).toHaveBeenCalledWith({
      text: "x",
      disposition: "NEW_TAB",
    });
    expect(browserMock.search.query).toHaveBeenCalledWith({
      text: "y",
      disposition: "NEW_TAB",
    });
  });

  it("does nothing without the permission", async () => {
    const { messageListener, browserMock } = load(false);
    const sendResponse = vi.fn();
    messageListener(
      { action: "web-search", query: "x", newTab: false },
      { tab: { id: 7 } },
      sendResponse,
    );
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({ ok: false }),
    );
    expect(browserMock.search.query).not.toHaveBeenCalled();
  });
});
