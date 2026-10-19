import { describe, it, expect, vi, beforeEach } from "vitest";
import { createBrowserMock, loadBackground } from "./helpers/load-background.js";
const { QAL_CONFIG } = require("../src/search-utils.js");
const { CONFIG_STORAGE_KEY } = require("../src/config-storage.js");

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

describe("background.js - updatePopupForTab error path", () => {
  let browserMock;

  beforeEach(() => {
    browserMock = createBrowserMock();
    loadBackground(browserMock);
  });

  it("does not crash when tabs.get rejects (tab already closed)", async () => {
    browserMock.tabs.get.mockRejectedValue(new Error("No such tab"));
    await expect(globalThis.updatePopupForTab(999)).resolves.toBeUndefined();
  });
});

describe("background.js - onUpdated for non-active tab", () => {
  let browserMock;
  let tabUpdatedListener;

  beforeEach(() => {
    browserMock = createBrowserMock();
    ({ tabUpdatedListener } = loadBackground(browserMock));
  });

  it("does not call setPopup when updated tab is not the active tab", async () => {
    browserMock.tabs.query.mockResolvedValue([{ id: 1 }]);

    await tabUpdatedListener(99, { url: "https://changed.com" });

    expect(browserMock.browserAction.setPopup).not.toHaveBeenCalled();
  });

  it("calls setPopup when updated tab is the active tab", async () => {
    browserMock.tabs.query.mockResolvedValue([{ id: 42 }]);
    browserMock.tabs.get.mockResolvedValue({ url: "https://active.com" });

    await tabUpdatedListener(42, { url: "https://active.com" });

    expect(browserMock.browserAction.setPopup).toHaveBeenCalled();
  });
});

describe("background.js - storage.onChanged listener", () => {
  let browserMock;

  beforeEach(() => {
    browserMock = createBrowserMock();
  });

  afterEach(() => {
    delete globalThis.browser;
  });

  it("updates QAL_CONFIG when storage changes with config key", async () => {
    loadBackground(browserMock);
    await new Promise((r) => setTimeout(r, 0));

    const storageListener =
      browserMock.storage.onChanged.addListener.mock.calls[0][0];

    storageListener(
      { [CONFIG_STORAGE_KEY]: { newValue: { MAX_TAB_RESULTS: 20 } } },
      "local",
    );

    expect(QAL_CONFIG.MAX_TAB_RESULTS).toBe(20);
  });

  it("ignores storage changes from non-local area", async () => {
    loadBackground(browserMock);
    await new Promise((r) => setTimeout(r, 0));

    const original = QAL_CONFIG.MAX_TAB_RESULTS;
    const storageListener =
      browserMock.storage.onChanged.addListener.mock.calls[0][0];

    storageListener(
      { [CONFIG_STORAGE_KEY]: { newValue: { MAX_TAB_RESULTS: 99 } } },
      "sync",
    );

    expect(QAL_CONFIG.MAX_TAB_RESULTS).toBe(original);
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

describe("background.js - tabs.onActivated callback", () => {
  let browserMock;
  let tabActivatedListener;

  beforeEach(() => {
    browserMock = createBrowserMock();
    ({ tabActivatedListener } = loadBackground(browserMock));
    browserMock.browserAction.setPopup.mockClear();
  });

  afterEach(() => {
    delete globalThis.browser;
  });

  it("calls updatePopupForTab on tab activation", async () => {
    browserMock.tabs.get.mockResolvedValueOnce({
      url: "https://normal.com",
      windowId: 1,
    });

    tabActivatedListener({ tabId: 42 });
    await new Promise((r) => setTimeout(r, 0));

    expect(browserMock.tabs.get).toHaveBeenCalledWith(42);
    expect(browserMock.browserAction.setPopup).toHaveBeenCalledWith({
      popup: "",
    });
  });
});

describe("background.js - shortcut on pages without the overlay (N1)", () => {
  let browserMock;
  let commandListener;
  let tabActivatedListener;

  beforeEach(() => {
    browserMock = createBrowserMock();
    ({ commandListener, tabActivatedListener } = loadBackground(browserMock));
  });

  it("opens the popup on a privileged tab instead of messaging it", async () => {
    browserMock.tabs.get.mockResolvedValue({ id: 5, url: "about:newtab" });
    await tabActivatedListener({ tabId: 5 });
    await vi.waitFor(() =>
      expect(browserMock.browserAction.setPopup).toHaveBeenCalled(),
    );

    await commandListener("toggle-launcher");

    expect(browserMock.browserAction.openPopup).toHaveBeenCalled();
    expect(browserMock.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it("messages the content script on a normal tab", async () => {
    browserMock.tabs.get.mockResolvedValue({ id: 6, url: "https://a.com" });
    browserMock.tabs.query.mockResolvedValue([{ id: 6 }]);
    await tabActivatedListener({ tabId: 6 });
    await vi.waitFor(() =>
      expect(browserMock.browserAction.setPopup).toHaveBeenCalled(),
    );

    await commandListener("toggle-launcher");

    expect(browserMock.browserAction.openPopup).not.toHaveBeenCalled();
    expect(browserMock.tabs.sendMessage).toHaveBeenCalledWith(6, {
      action: "toggle",
    });
  });

  it("injects the launcher into tabs opened before install, then retries", async () => {
    browserMock.tabs.query.mockResolvedValue([{ id: 7 }]);
    browserMock.tabs.sendMessage
      .mockRejectedValueOnce(new Error("Receiving end does not exist"))
      .mockResolvedValueOnce(undefined);

    await commandListener("toggle-launcher");

    expect(browserMock.tabs.executeScript).toHaveBeenCalledWith(7, {
      file: "content/launcher.js",
    });
    expect(browserMock.tabs.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("does not inject when the content script answers", async () => {
    browserMock.tabs.query.mockResolvedValue([{ id: 7 }]);
    await commandListener("toggle-launcher");
    expect(browserMock.tabs.executeScript).not.toHaveBeenCalled();
  });

  it("treats the add-ons site as a page without the overlay", () => {
    expect(globalThis.isPrivilegedUrl("https://addons.mozilla.org/it/")).toBe(
      true,
    );
    expect(globalThis.isPrivilegedUrl("https://mozilla.org/")).toBe(false);
  });
});

describe("background.js - toolbar title shows the shortcut (N2)", () => {
  it("sets the title with the current shortcut", async () => {
    const browserMock = createBrowserMock();
    loadBackground(browserMock);
    await vi.waitFor(() =>
      expect(browserMock.browserAction.setTitle).toHaveBeenCalledWith({
        title: "Quick Tab Launcher (Ctrl+Shift+Space)",
      }),
    );
  });

  it("falls back to the plain name when no shortcut is set", async () => {
    const browserMock = createBrowserMock();
    browserMock.commands.getAll.mockResolvedValue([
      { name: "toggle-launcher", shortcut: "" },
    ]);
    loadBackground(browserMock);
    await vi.waitFor(() =>
      expect(browserMock.browserAction.setTitle).toHaveBeenCalledWith({
        title: "Quick Tab Launcher",
      }),
    );
  });
});

describe("background.js - panel messages", () => {
  let browserMock;
  let messageListener;

  beforeEach(() => {
    browserMock = createBrowserMock();
    ({ messageListener } = loadBackground(browserMock));
  });

  it("open-options opens the settings page (S6)", () => {
    messageListener({ action: "open-options" }, { tab: { id: 1 } }, vi.fn());
    expect(browserMock.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it("get-recent-tabs leaves out the tab the panel is open on (A2)", async () => {
    globalThis.getRecentTabs = vi.fn().mockResolvedValue({});
    const sendResponse = vi.fn();
    messageListener(
      { action: "get-recent-tabs" },
      { tab: { id: 42 } },
      sendResponse,
    );
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(globalThis.getRecentTabs).toHaveBeenCalledWith(42);
    delete globalThis.getRecentTabs;
  });

  it("get-recent-tabs from the popup uses the active tab", async () => {
    globalThis.getRecentTabs = vi.fn().mockResolvedValue({});
    browserMock.tabs.query.mockResolvedValue([{ id: 8 }]);
    const sendResponse = vi.fn();
    messageListener({ action: "get-recent-tabs" }, {}, sendResponse);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(globalThis.getRecentTabs).toHaveBeenCalledWith(8);
    delete globalThis.getRecentTabs;
  });
});

describe("background.js - focus changes refresh the privileged flag (#2)", () => {
  it("re-reads the active tab of the newly focused window", async () => {
    const browserMock = createBrowserMock();
    loadBackground(browserMock);
    const onFocus =
      browserMock.windows.onFocusChanged.addListener.mock.calls[0][0];
    browserMock.tabs.query.mockResolvedValue([{ id: 9 }]);
    browserMock.tabs.get.mockResolvedValue({ id: 9, url: "about:newtab" });

    await onFocus(3);
    await vi.waitFor(() =>
      expect(browserMock.browserAction.setPopup).toHaveBeenCalledWith({
        popup: "popup/popup.html",
      }),
    );
    expect(browserMock.tabs.query).toHaveBeenCalledWith({
      active: true,
      windowId: 3,
    });
  });

  it("ignores focus leaving all Firefox windows", async () => {
    const browserMock = createBrowserMock();
    loadBackground(browserMock);
    const onFocus =
      browserMock.windows.onFocusChanged.addListener.mock.calls[0][0];
    await onFocus(-1);
    expect(browserMock.tabs.query).not.toHaveBeenCalled();
  });
});

describe("background.js - welcome page on first install (B1)", () => {
  function load() {
    const browserMock = createBrowserMock();
    browserMock.runtime.onInstalled = { addListener: vi.fn() };
    browserMock.runtime.getURL = vi.fn((p) => `moz-extension://id/${p}`);
    loadBackground(browserMock);
    const onInstalled =
      browserMock.runtime.onInstalled.addListener.mock.calls[0][0];
    return { browserMock, onInstalled };
  }

  it("opens the welcome page after a new install", async () => {
    const { browserMock, onInstalled } = load();
    await onInstalled({ reason: "install" });
    expect(browserMock.tabs.create).toHaveBeenCalledWith({
      url: "moz-extension://id/welcome/welcome.html",
    });
  });

  it("stays quiet on updates and browser updates", async () => {
    const { browserMock, onInstalled } = load();
    await onInstalled({ reason: "update" });
    await onInstalled({ reason: "browser_update" });
    expect(browserMock.tabs.create).not.toHaveBeenCalled();
  });

  it("tells open extension pages that the shortcut was used", async () => {
    const browserMock = createBrowserMock();
    browserMock.runtime.onInstalled = { addListener: vi.fn() };
    browserMock.runtime.sendMessage = vi.fn().mockResolvedValue(undefined);
    const { commandListener } = loadBackground(browserMock);
    browserMock.tabs.query.mockResolvedValue([{ id: 1 }]);
    await commandListener("toggle-launcher");
    expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({
      action: "shortcut-used",
    });
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
