import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserMock } from "./helpers/load-launcher.js";

for (const file of ["config-storage", "search-utils", "fuzzy", "i18n", "icons", "hints", "render-utils", "panel-extras", "commands", "panel-view", "panel-actions"]) {
  Object.assign(globalThis, require(`../src/${file}.js`));
}

const emptyResults = () => ({ tabs: [], bookmarks: [], history: [] });
const tabResults = (title = "Latest page") => ({ ...emptyResults(), tabs: [{ id: 7, title, url: "https://example.com" }] });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(replies = {}) {
  const state = createPanelState();
  const elements = Object.fromEntries(["input", "results", "footer", "toastSlot", "groupToggle", "fulltextToggle"].map((name) => [name, document.createElement(name === "input" ? "input" : "div")]));
  document.body.append(elements.results);
  elements.results.activeDescendantOwner = elements.input;
  const hooks = Object.fromEntries(["close", "afterNavigate", "runCommand", "onNothingToConfirm", "onQueryChange", "onActiveTabState"].map((name) => [name, vi.fn()]));
  hooks.isActive = vi.fn(() => true);
  globalThis.browser = createBrowserMock(replies);
  const { createPanelController } = require("../src/panel-controller.js");
  return { state, elements, hooks, controller: createPanelController({ state, elements, hooks }) };
}
async function search(panel, query) {
  panel.elements.input.value = query;
  panel.controller.handleInput();
  await vi.advanceTimersByTimeAsync(QAL_CONFIG.DEBOUNCE_MS);
}
function showCommand(panel, command = { id: "close-duplicates", confirm: true, label: "Close duplicates", description: "Close" }) {
  panel.state.flatResults = [{ ...command, type: "command" }];
  panel.state.selectedIndex = 0;
  renderCommandResults(panel.elements.results, [command], "", 0);
  return panel.state.flatResults[0];
}
function key(panel, value, extra = {}) {
  const event = new KeyboardEvent("keydown", { key: value, cancelable: true, ...extra });
  panel.controller.handleKeydown(event);
  return event;
}

describe("panel controller", () => {
  beforeEach(() => { vi.useFakeTimers(); setLocaleFromStorage("en"); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren(); delete globalThis.browser; });

  it("ignores an older successful reply after a newer search", async () => {
    const old = deferred();
    const panel = setup({ search: ({ query }) => query === "old" ? old.promise : tabResults() });
    await search(panel, "old");
    await search(panel, "new");
    old.resolve(tabResults("Obsolete page"));
    await Promise.resolve();
    await Promise.resolve();
    expect(panel.elements.results.textContent).toContain("Latest page");
    expect(panel.state.results.tabs[0].title).toBe("Latest page");
    expect(panel.hooks.onQueryChange).toHaveBeenLastCalledWith("new");
  });

  it("ignores an obsolete rejection without cancelling the newer loading timer", async () => {
    const old = deferred();
    const current = deferred();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const panel = setup({ search: ({ query }) => query === "old" ? old.promise : current.promise });
    await search(panel, "old");
    await search(panel, "new");
    old.reject(new Error("Old failure"));
    await vi.advanceTimersByTimeAsync(QAL_CONFIG.LOADING_THRESHOLD_MS);
    expect(panel.elements.results.textContent).toContain(t("states.loading"));
    current.resolve(tabResults());
    await vi.advanceTimersByTimeAsync(0);
    expect(panel.elements.results.textContent).toContain("Latest page");
    expect(error).not.toHaveBeenCalled();
  });

  it("renders and logs a current search rejection", async () => {
    const failure = new Error("Search failed");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const panel = setup({ search: () => Promise.reject(failure) });
    await search(panel, "query");
    expect(panel.elements.results.querySelector(".qal-empty-state").textContent).toContain(t("states.error"));
    expect(error).toHaveBeenCalledWith("Quick TAB Launcher: search error", failure);
  });

  it.each(["resolve", "reject"])("ignores search %s after the host closes", async (finish) => {
    const request = deferred();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const panel = setup({ search: () => request.promise });
    await search(panel, "query");
    const before = panel.elements.results.innerHTML;
    panel.hooks.isActive.mockReturnValue(false);
    request[finish](finish === "resolve" ? tabResults() : new Error("Closed"));
    await vi.advanceTimersByTimeAsync(0);
    expect(panel.elements.results.innerHTML).toBe(before);
    expect(error).not.toHaveBeenCalled();
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ action: "search", query: "query" });
  });

  it("cancels confirmation when selection changes during preview", async () => {
    const preview = deferred();
    const panel = setup({ "preview-command": () => preview.promise });
    const item = showCommand(panel);
    const pending = panel.controller.requestConfirm(item);
    panel.state.flatResults.push({ id: "mute-tab", type: "command" });
    panel.state.selectedIndex = 1;
    preview.resolve({ affected: 3 });
    await pending;
    expect(panel.state.pendingConfirmId).toBeNull();
    expect(panel.elements.results.querySelector(".qal-confirm")).toBeNull();
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ action: "preview-command", commandId: item.id });
  });

  it("confirms only the second activation and Escape cancels the strip", async () => {
    const panel = setup({ "preview-command": { affected: 3 } });
    const item = showCommand(panel);
    await panel.controller.requestConfirm(item);
    expect(panel.elements.results.querySelector(".qal-confirm").textContent).toContain("3");
    panel.controller.navigateTo(item, false);
    expect(panel.hooks.runCommand).toHaveBeenCalledWith(item.id);
    key(panel, "Escape");
    expect(panel.state.pendingConfirmId).toBeNull();
    expect(panel.hooks.close).not.toHaveBeenCalled();
    key(panel, "Escape");
    expect(panel.hooks.close).toHaveBeenCalledOnce();
  });

  it("reports nothing to confirm when preview rejects", async () => {
    const failure = new Error("Preview failed");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const panel = setup({ "preview-command": () => Promise.reject(failure) });
    const item = showCommand(panel);
    await panel.controller.requestConfirm(item);
    expect(panel.hooks.onNothingToConfirm).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("Quick TAB Launcher: preview failed", failure);
  });

  it.each([
    [{ type: "tab", id: 3 }, false, { action: "navigate", type: "tab", tabId: 3 }],
    [{ type: "recent-active", id: 3 }, false, { action: "navigate", type: "tab", tabId: 3 }],
    [{ type: "recent-closed", sessionId: "s" }, false, { action: "restore-session", sessionId: "s" }],
    [{ type: "web-search", query: "words" }, true, { action: "web-search", query: "words", newTab: true }],
    [{ type: "bookmark", url: "https://example.com" }, false, { action: "navigate", type: "bookmark", url: "https://example.com", openInCurrent: true }],
    [{ type: "history", url: "https://example.com" }, true, { action: "navigate", type: "history", url: "https://example.com", openInCurrent: false }],
  ])("navigates %j and delegates the host outcome", (item, newTab, message) => {
    const panel = setup();
    panel.controller.navigateTo(item, newTab);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(message);
    expect(panel.hooks.afterNavigate).toHaveBeenCalledWith(item);
  });

  it("delegates commands without navigating or closing the host itself", () => {
    const panel = setup();
    panel.controller.navigateTo({ type: "command", id: "mute-tab" });
    expect(panel.hooks.runCommand).toHaveBeenCalledWith("mute-tab");
    expect(panel.hooks.afterNavigate).not.toHaveBeenCalled();
  });

  it("sends only one close-tab for repeated Alt+W and concurrent key presses", async () => {
    const pending = deferred();
    const panel = setup({ search: () => tabResults(), "close-tab": () => pending.promise });
    await search(panel, "example");
    key(panel, "w", { altKey: true, code: "KeyW" });
    key(panel, "w", { altKey: true, code: "KeyW", repeat: true });
    key(panel, "w", { altKey: true, code: "KeyW" });
    expect(browser.runtime.sendMessage.mock.calls.filter(([m]) => m.action === "close-tab")).toEqual([[{ action: "close-tab", tabId: 7 }]]);
    pending.resolve({ closed: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(panel.state.results.tabs).toEqual([]);
    expect(panel.elements.toastSlot.textContent).toContain("Latest page");
    expect(panel.state.panelUndoCount).toBe(1);
  });

  it("closes a domain, refreshes results and restores the closed count", async () => {
    const panel = setup({ search: () => tabResults(), "close-domain-tabs": { closed: 2 } });
    await search(panel, "example");
    await panel.controller.closeDomainTabsFromPanel("example.com");
    expect(panel.elements.toastSlot.textContent).toContain("example.com");
    expect(panel.state.panelUndoCount).toBe(2);
    await panel.controller.undoLastClose();
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ action: "undo-close", count: 2 });
    expect(panel.state.panelUndoCount).toBe(0);
    await vi.advanceTimersByTimeAsync(QAL_CONFIG.DEBOUNCE_MS);
    expect(panel.elements.results.textContent).toContain("Latest page");
  });

  it("fetches recent, active and web search state and notifies the host", async () => {
    const active = { muted: true };
    const panel = setup({ "get-active-tab-state": active, "get-web-search-state": { enabled: true }, "get-recent-tabs": { recentActive: [{ id: 1, title: "Recent" }], recentlyClosed: [{ sessionId: "s", title: "Closed" }] } });
    await panel.controller.fetchRecentTabs(1);
    await panel.controller.fetchActiveTabState();
    await panel.controller.fetchWebSearchState();
    expect(panel.state.flatResults.map((item) => item.type)).toEqual(["recent-active", "recent-closed"]);
    expect(panel.state.selectedIndex).toBe(1);
    expect(panel.elements.results.textContent).toContain("Closed");
    expect(panel.state.activeTabState).toEqual(active);
    expect(panel.hooks.onActiveTabState).toHaveBeenCalledOnce();
    expect(panel.state.webSearchEnabled).toBe(true);
  });

  it("switches command, search and recent modes and handles selection keys", async () => {
    const panel = setup({ search: () => tabResults() });
    await search(panel, ">mute");
    expect(panel.state.footerMode).toBe("commands");
    expect(panel.state.flatResults[0].type).toBe("command");
    await search(panel, "example");
    expect(panel.state.footerMode).toBe("search");
    expect(key(panel, "ArrowDown").defaultPrevented).toBe(true);
    key(panel, "ArrowUp");
    key(panel, "Tab");
    expect(panel.state.selectedIndex).toBe(0);
    key(panel, "Enter", { ctrlKey: true });
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ action: "navigate", type: "tab", tabId: 7 });
    await search(panel, "");
    expect(panel.state.footerMode).toBe("recent");
    expect(panel.state.selectedIndex).toBe(-1);
  });

  it("toggles grouping, fulltext persistence and help through shortcuts", async () => {
    const panel = setup({ search: () => tabResults() });
    await search(panel, "example");
    key(panel, "g", { altKey: true, code: "KeyG" });
    expect(panel.elements.groupToggle.getAttribute("aria-pressed")).toBe("true");
    expect(panel.elements.results.querySelector(".qal-domain-header").textContent).toContain("example.com");
    const before = QAL_CONFIG.ENABLE_FULLTEXT_SEARCH;
    await panel.controller.toggleFulltextSearch();
    expect(QAL_CONFIG.ENABLE_FULLTEXT_SEARCH).toBe(!before);
    expect(panel.elements.fulltextToggle.getAttribute("aria-pressed")).toBe(String(!before));
    expect(browser.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ qal_user_config: expect.objectContaining({ ENABLE_FULLTEXT_SEARCH: !before }) }));
    QAL_CONFIG.ENABLE_FULLTEXT_SEARCH = before;
    await search(panel, "");
    key(panel, "?");
    expect(panel.state.isHelpExpanded).toBe(true);
  });
});

describe("panel controller action boundaries", () => {
  beforeEach(() => { vi.useFakeTimers(); setLocaleFromStorage("en"); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren(); delete globalThis.browser; });

  it("routes result clicks, close buttons and domain headers without navigating on close", async () => {
    const panel = setup({ search: () => tabResults(), "close-tab": { closed: 1 }, "close-domain-tabs": { closed: 1 } });
    await search(panel, "example");
    const click = (target) => {
      const event = { target, stopPropagation: vi.fn(), ctrlKey: true, metaKey: false };
      panel.controller.handleResultClick(event);
      return event;
    };
    click(panel.elements.results.querySelector(".qal-result-item"));
    expect(panel.hooks.afterNavigate).toHaveBeenCalledWith(expect.objectContaining({ id: 7, type: "tab" }));
    panel.controller.toggleGroupedView();
    const header = panel.elements.results.querySelector(".qal-domain-header");
    click(header);
    expect(header.parentElement.classList.contains("qal-collapsed")).toBe(true);
    click(header);
    expect(header.parentElement.classList.contains("qal-collapsed")).toBe(false);
    const domainEvent = click(panel.elements.results.querySelector(".qal-domain-close-all"));
    expect(domainEvent.stopPropagation).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(QAL_CONFIG.DEBOUNCE_MS);
    const closeEvent = click(panel.elements.results.querySelector(".qal-close-tab"));
    expect(closeEvent.stopPropagation).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(0);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ action: "close-tab", tabId: 7 });
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ action: "close-domain-tabs", domain: "example.com" });
    expect(panel.hooks.afterNavigate).toHaveBeenCalledTimes(1);
    expect(panel.state.results.tabs).toEqual([]);
  });

  it.each([
    ["get-recent-tabs", "recent tabs unavailable", "fetchRecentTabs"],
    ["get-active-tab-state", "tab state unavailable", "fetchActiveTabState"],
    ["get-web-search-state", "web search state unavailable", "fetchWebSearchState"],
  ])("logs %s failures with a caller supplied diagnostic prefix", async (action, warning, method) => {
    const failure = new Error("Unavailable");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const panel = setup({ [action]: () => Promise.reject(failure) });
    const { createPanelController } = require("../src/panel-controller.js");
    const controller = createPanelController({ ...panel, logPrefix: "Quick TAB Launcher popup" });
    await controller[method]();
    expect(warn).toHaveBeenCalledWith(`Quick TAB Launcher popup: ${warning}`, failure);
    expect(panel.state.activeTabState).toBeNull();
    expect(panel.state.webSearchEnabled).toBe(false);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ action });
  });

  it("does not render recent tabs over a query or an inactive host", async () => {
    const pending = deferred();
    const panel = setup({ "get-recent-tabs": () => pending.promise, search: () => tabResults() });
    const recent = panel.controller.fetchRecentTabs();
    await search(panel, "example");
    pending.resolve({ recentActive: [{ id: 8, title: "Recent" }], recentlyClosed: [] });
    await recent;
    expect(panel.elements.results.textContent).toContain("Latest page");
    panel.elements.input.value = "";
    panel.hooks.isActive.mockReturnValue(false);
    await panel.controller.fetchRecentTabs();
    expect(panel.elements.results.textContent).toContain("Latest page");
    panel.hooks.isActive.mockReturnValue(true);
    await panel.controller.fetchRecentTabs();
    expect(panel.elements.results.textContent).toContain("Recent");
  });

  it("refreshes a failed tab close and a failed domain close and logs both", async () => {
    const failure = new Error("Close failed");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const panel = setup({ search: () => tabResults(), "close-tab": () => Promise.reject(failure), "close-domain-tabs": () => Promise.reject(failure) });
    await search(panel, "example");
    await panel.controller.closeTab(0);
    expect(panel.state.isClosingTab).toBe(false);
    await panel.controller.closeDomainTabsFromPanel("example.com");
    await vi.advanceTimersByTimeAsync(QAL_CONFIG.DEBOUNCE_MS);
    expect(panel.elements.results.textContent).toContain("Latest page");
    expect(warn).toHaveBeenCalledWith("Quick TAB Launcher: close failed", failure);
    expect(warn).toHaveBeenCalledWith("Quick TAB Launcher: closing site tabs failed", failure);
  });

  it("logs undo and config failures while keeping search usable", async () => {
    const failure = new Error("Unavailable");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const panel = setup({ search: () => tabResults(), "undo-close": () => Promise.reject(failure) });
    const before = QAL_CONFIG.ENABLE_FULLTEXT_SEARCH;
    browser.storage.local.set.mockRejectedValue(failure);
    panel.state.panelUndoCount = 2;
    key(panel, "z", { altKey: true, code: "KeyZ" });
    await vi.advanceTimersByTimeAsync(0);
    await panel.controller.toggleFulltextSearch();
    await search(panel, "example");
    expect(panel.elements.results.textContent).toContain("Latest page");
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ action: "undo-close", count: 2 });
    expect(warn).toHaveBeenCalledWith("Quick TAB Launcher: undo failed", failure);
    expect(warn).toHaveBeenCalledWith("Quick TAB Launcher: config save failed", failure);
    QAL_CONFIG.ENABLE_FULLTEXT_SEARCH = before;
  });
});

describe("panel controller guards", () => {
  beforeEach(() => { vi.useFakeTimers(); setLocaleFromStorage("en"); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); document.body.replaceChildren(); delete globalThis.browser; });

  const sentActions = () => browser.runtime.sendMessage.mock.calls.map(([message]) => message.action);

  it("does not repeat Alt+W for a held key once the first close has completed", async () => {
    const panel = setup({ search: () => tabResults(), "close-tab": { closed: 0 } });
    await search(panel, "example");
    key(panel, "w", { altKey: true, code: "KeyW" });
    await vi.advanceTimersByTimeAsync(0);
    expect(panel.state.isClosingTab).toBe(false);
    key(panel, "w", { altKey: true, code: "KeyW", repeat: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(sentActions().filter((action) => action === "close-tab")).toHaveLength(1);
    key(panel, "w", { altKey: true, code: "KeyW" });
    expect(sentActions().filter((action) => action === "close-tab")).toHaveLength(2);
  });

  it.each([0, -1])("sends no undo message for a count of %i", async (count) => {
    const panel = setup();
    await panel.controller.requestUndo(count);
    expect(sentActions()).not.toContain("undo-close");
    await panel.controller.requestUndo(2);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ action: "undo-close", count: 2 });
  });

  it("never shows the loading state after a fast reply has been rendered", async () => {
    const panel = setup({ search: () => tabResults() });
    await search(panel, "example");
    expect(panel.elements.results.textContent).toContain("Latest page");
    await vi.advanceTimersByTimeAsync(QAL_CONFIG.LOADING_THRESHOLD_MS * 2);
    expect(panel.elements.results.textContent).toContain("Latest page");
    expect(panel.elements.results.textContent).not.toContain(t("states.loading"));
  });

  it("does not fetch or render when refreshing an inactive host", async () => {
    const panel = setup({ search: () => tabResults(), "get-recent-tabs": { recentActive: [{ id: 1, title: "Recent" }], recentlyClosed: [] } });
    await search(panel, "example");
    const before = panel.elements.results.innerHTML;
    browser.runtime.sendMessage.mockClear();
    panel.hooks.isActive.mockReturnValue(false);
    panel.controller.refreshCurrentView();
    panel.elements.input.value = "";
    panel.controller.refreshCurrentView();
    await vi.advanceTimersByTimeAsync(QAL_CONFIG.DEBOUNCE_MS);
    expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
    expect(panel.elements.results.innerHTML).toBe(before);
    panel.hooks.isActive.mockReturnValue(true);
    panel.controller.refreshCurrentView();
    await vi.advanceTimersByTimeAsync(0);
    expect(sentActions()).toContain("get-recent-tabs");
  });
});
