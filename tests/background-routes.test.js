import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserMock, loadBackground } from "./helpers/load-background.js";

const SENDER = { tab: { id: 17, windowId: 4 } };
const SEARCH_RESULTS = [{ type: "tab", tabId: 23, title: "Example" }];
const CLOSED_RESULT = { closed: 2 };

const ASYNC_ROUTES = [
  { action: "search", handler: "handleSearch", fields: { query: "example" }, args: ["example", 4], value: SEARCH_RESULTS, response: SEARCH_RESULTS },
  { action: "close-tab", handler: "handleCloseTab", fields: { tabId: 23 }, args: [23], value: true, response: { closed: 1 } },
  { action: "close-tab", handler: "handleCloseTab", fields: { tabId: 23 }, args: [23], value: false, response: { closed: 0 } },
  { action: "get-recent-tabs", handler: "getRecentTabs", args: [17], value: SEARCH_RESULTS, response: SEARCH_RESULTS },
  { action: "get-active-tab-state", handler: "getActiveTabState", args: [SENDER.tab], value: { pinned: true, muted: false }, response: { pinned: true, muted: false } },
  { action: "preview-command", handler: "previewCommand", fields: { commandId: "close-duplicates" }, args: ["close-duplicates"], value: { count: 2 }, response: { count: 2 } },
  { action: "undo-close", handler: "undoClose", fields: { count: 2 }, args: [2], value: { restored: 2 }, response: { restored: 2 } },
  { action: "get-web-search-state", handler: "hasWebSearchPermission", args: [], value: true, response: { enabled: true } },
  { action: "get-web-search-state", handler: "hasWebSearchPermission", args: [], value: false, response: { enabled: false } },
  { action: "web-search", handler: "runWebSearch", fields: { query: "example", newTab: false }, value: true, response: { ok: true } },
  { action: "web-search", handler: "runWebSearch", fields: { query: "example", newTab: false }, value: false, response: { ok: false } },
  { action: "get-duplicate-count", handler: "getDuplicateSummary", args: [], value: { count: 2, signature: "example" }, response: { count: 2, signature: "example" } },
  { action: "close-duplicates", handler: "closeDuplicateTabs", args: [], value: CLOSED_RESULT, response: CLOSED_RESULT },
  { action: "execute-command", handler: "executeCommand", fields: { commandId: "close-duplicates" }, args: ["close-duplicates"], value: CLOSED_RESULT, response: CLOSED_RESULT },
  { action: "close-domain-tabs", handler: "closeDomainTabs", fields: { domain: "example.com" }, args: ["example.com"], value: CLOSED_RESULT, response: CLOSED_RESULT },
];

describe("background message routes", () => {
  let browserMock;
  let messageListener;

  beforeEach(async () => {
    browserMock = createBrowserMock();
    ({ messageListener } = loadBackground(browserMock));
    await Promise.resolve();
    browserMock.commands.getAll.mockClear();
    browserMock.browserAction.setTitle.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(ASYNC_ROUTES)("$action keeps the channel open and sends $response", async ({ action, handler, fields, args, value, response }) => {
    let resolve;
    const pending = new Promise((complete) => { resolve = complete; });
    const operation = vi.fn().mockReturnValue(pending);
    vi.stubGlobal(handler, operation);
    const message = { action, ...fields };
    const sendResponse = vi.fn();

    expect(messageListener(message, SENDER, sendResponse)).toBe(true);
    expect(sendResponse).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(operation).toHaveBeenCalledExactlyOnceWith(
      ...(args ?? [message, 17]),
    ));

    resolve(value);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledExactlyOnceWith(response));
  });

  it.each([
    { action: "navigate", fields: { type: "tab", tabId: 23 }, handler: "handleNavigate" },
    { action: "open-options" },
    { action: "refresh-action-title" },
    { action: "restore-session", fields: { sessionId: "session-23" }, handler: "restoreSession" },
  ])("$action returns false without sending a response", async ({ action, fields, handler }) => {
    const operation = vi.fn().mockResolvedValue(undefined);
    if (handler) vi.stubGlobal(handler, operation);
    const message = { action, ...fields };
    const sendResponse = vi.fn();

    expect(messageListener(message, SENDER, sendResponse)).toBe(false);
    if (action === "navigate") expect(operation).toHaveBeenCalledExactlyOnceWith(message, 17);
    if (action === "restore-session") expect(operation).toHaveBeenCalledExactlyOnceWith("session-23");
    if (action === "open-options") expect(browserMock.runtime.openOptionsPage).toHaveBeenCalledExactlyOnceWith();
    if (action === "refresh-action-title") {
      expect(browserMock.commands.getAll).toHaveBeenCalledExactlyOnceWith();
      await vi.waitFor(() => expect(browserMock.browserAction.setTitle).toHaveBeenCalledExactlyOnceWith({ title: "Quick Tab Launcher (Ctrl+Shift+Space)" }));
    }
    await Promise.resolve();
    expect(sendResponse).not.toHaveBeenCalled();
  });

  it.each([
    { action: "unknown-action" },
    { action: "toString" },
    { action: "constructor" },
    { action: ["open-options"] },
    { action: { toString: () => "open-options" } },
  ])("ignores unknown action $action", async ({ action }) => {
    const sendResponse = vi.fn();
    expect(messageListener({ action }, SENDER, sendResponse)).toBe(false);
    await Promise.resolve();
    expect(sendResponse).not.toHaveBeenCalled();

    expect(messageListener({ action: "open-options" }, SENDER, sendResponse)).toBe(false);
    expect(browserMock.runtime.openOptionsPage).toHaveBeenCalledExactlyOnceWith();
  });

  it.each([
    { action: "search", handler: "handleSearch", fields: { query: "example" }, args: ["example", undefined], value: SEARCH_RESULTS },
    { action: "web-search", handler: "runWebSearch", fields: { query: "example" }, value: true },
    { action: "get-recent-tabs", handler: "getRecentTabs", args: [31], value: SEARCH_RESULTS },
  ])("$action supports a sender without a tab", async ({ action, handler, fields, args, value }) => {
    browserMock.tabs.query.mockResolvedValue([{ id: 31 }]);
    const operation = vi.fn().mockResolvedValue(value);
    vi.stubGlobal(handler, operation);
    const message = { action, ...fields };
    const sendResponse = vi.fn();

    expect(messageListener(message, {}, sendResponse)).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledExactlyOnceWith(
      action === "web-search" ? { ok: true } : SEARCH_RESULTS,
    ));
    expect(operation).toHaveBeenCalledExactlyOnceWith(...(args ?? [message, undefined]));
    if (action === "get-recent-tabs") expect(browserMock.tabs.query).toHaveBeenCalledExactlyOnceWith({ active: true, currentWindow: true });
  });
});
