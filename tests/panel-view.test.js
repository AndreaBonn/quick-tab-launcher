import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

for (const file of ["config-storage", "search-utils", "fuzzy", "i18n", "icons", "hints", "render-utils", "render-states", "render-views", "panel-extras"]) {
  Object.assign(globalThis, require(`../src/${file}.js`));
}
const { createPanelView, createPanelState, isCommandMode } = require("../src/panel-view.js");

function setup() {
  const state = createPanelState();
  const elements = {
    input: document.createElement("input"),
    results: document.createElement("div"),
    footer: document.createElement("div"),
    toastSlot: document.createElement("div"),
  };
  elements.results.activeDescendantOwner = elements.input;
  const view = createPanelView({ state, elements });
  return { state, elements, view };
}

function showTabs(panel, ids = [1, 2]) {
  panel.elements.input.value = "example";
  panel.state.results.tabs = ids.map((id) => ({ id, title: `Page ${id}`, url: `https://example.com/${id}` }));
  panel.view.rebuildFlatResults();
  panel.state.selectedIndex = 0;
  panel.view.renderCurrentView("example");
}

describe("panel view", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setLocaleFromStorage("en");
  });
  afterEach(() => vi.useRealTimers());

  it("creates independent empty panel states", () => {
    const first = createPanelState();
    const second = createPanelState();
    first.results.tabs.push({ id: 1 });
    first.flatResults.push({ id: 1 });
    expect(second.results).toEqual({ tabs: [], bookmarks: [], history: [] });
    expect(second.flatResults).toEqual([]);
    expect(second.selectedIndex).toBe(-1);
    expect(second.footerMode).toBe("recent");
    expect(second.panelUndoCount).toBe(0);
  });

  it.each([[">", true], ["  > close", true], ["search >", false], ["", false]])("recognizes command mode for %j", (query, expected) => {
    expect(isCommandMode(query)).toBe(expected);
  });

  it("cycles selection both ways and announces the selected row", () => {
    const panel = setup();
    showTabs(panel);
    panel.view.selectPrev();
    expect(panel.state.selectedIndex).toBe(1);
    expect(panel.elements.input.getAttribute("aria-activedescendant")).toBe("qal-option-1");
    panel.view.selectNext();
    expect(panel.state.selectedIndex).toBe(0);
    panel.view.selectNext();
    expect(panel.state.selectedIndex).toBe(1);
    panel.view.selectPrev();
    expect(panel.state.selectedIndex).toBe(0);
    expect(panel.elements.results.querySelector('[aria-selected="true"]').textContent).toContain("Page 1");
  });

  it("keeps an empty list unselected", () => {
    const panel = setup();
    panel.view.selectNext();
    panel.view.selectPrev();
    expect(panel.state.selectedIndex).toBe(-1);
    showTabs(panel, [1]);
    panel.view.selectNext();
    expect(panel.state.selectedIndex).toBe(0);
  });

  it("clears the pending confirmation when moving selection", () => {
    const panel = setup();
    showTabs(panel);
    const row = panel.elements.results.querySelector(".qal-result-item");
    row.classList.add("qal-has-confirm");
    row.innerHTML += '<span class="qal-confirm">Confirm</span>';
    panel.state.pendingConfirmId = "close";
    panel.view.selectNext();
    expect(panel.state.pendingConfirmId).toBeNull();
    expect(row.querySelector(".qal-confirm")).toBeNull();
    expect(row.classList.contains("qal-has-confirm")).toBe(false);
    expect(panel.elements.results.querySelector('[aria-selected="true"]').textContent).toContain("Page 2");
    panel.view.clearPendingConfirm();
    expect(panel.state.selectedIndex).toBe(1);
  });

  it("orders grouped rows before bookmarks, history and commands", () => {
    const panel = setup();
    panel.state.isGroupedView = true;
    panel.state.results = {
      tabs: [{ id: 1, url: "https://a.com/1" }, { id: 2, url: "https://b.com" }, { id: 3, url: "https://a.com/2" }],
      bookmarks: [{ id: "b", url: "https://bookmark.com" }],
      history: [{ id: "h", url: "https://history.com" }],
    };
    panel.state.searchCommands = [{ id: "mute-tab", label: "Mute", description: "Mute tab" }];
    panel.view.rebuildFlatResults();
    panel.view.renderCurrentView("tab");
    expect(panel.state.flatResults.map((item) => item.id)).toEqual([1, 3, 2, "b", "h", "mute-tab"]);
    expect([...panel.elements.results.querySelectorAll(".qal-result-item")].map((item) => item.dataset.id)).toEqual(["1", "3", "2", "b", "h", "mute-tab"]);
  });

  it("renders a web search as the only selectable result", () => {
    const panel = setup();
    panel.state.webSearchEnabled = true;
    panel.elements.input.value = "  unknown  ";
    panel.view.rebuildFlatResults();
    panel.view.selectNext();
    panel.view.renderCurrentView(panel.elements.input.value);
    expect(panel.state.flatResults).toEqual([{ type: "web-search", query: "unknown" }]);
    expect(panel.elements.results.querySelector('[data-type="web-search"]').getAttribute("aria-selected")).toBe("true");
    panel.elements.input.value = " ";
    panel.view.rebuildFlatResults();
    expect(panel.state.flatResults).toEqual([]);
  });

  it("removes a tab and updates section count, indexes and selection", () => {
    const panel = setup();
    showTabs(panel, [1, 2, 3]);
    panel.state.selectedIndex = 2;
    panel.view.removeResultItem(panel.elements.results.querySelector('[data-index="1"]'), 2);
    expect(panel.state.results.tabs.map((item) => item.id)).toEqual([1, 3]);
    expect(panel.state.flatResults.map((item) => item.id)).toEqual([1, 3]);
    expect(panel.elements.results.querySelector(".qal-section-count").textContent).toBe("2");
    expect([...panel.elements.results.querySelectorAll(".qal-result-item")].map((item) => item.dataset.index)).toEqual(["0", "1"]);
    expect(panel.state.selectedIndex).toBe(1);
    expect(panel.elements.results.querySelector('[aria-selected="true"]').dataset.id).toBe("3");
  });

  it("removes an empty tab section while retaining commands", () => {
    const panel = setup();
    panel.state.searchCommands = [{ id: "mute-tab", label: "Mute", description: "Mute tab" }];
    showTabs(panel, [1]);
    panel.view.removeResultItem(panel.elements.results.querySelector('[data-type="tabs"]'), 1);
    expect(panel.elements.results.querySelector('[data-section="tabs"]')).toBeNull();
    expect(panel.elements.results.querySelector('[data-type="command"]').dataset.index).toBe("0");
    expect(panel.state.flatResults.map((item) => item.id)).toEqual(["mute-tab"]);
  });

  it.each([false, true])("re-renders after the last tab closes with web search %s", (webSearchEnabled) => {
    const panel = setup();
    panel.state.webSearchEnabled = webSearchEnabled;
    showTabs(panel, [1]);
    panel.view.removeResultItem(panel.elements.results.querySelector(".qal-result-item"), 1);
    expect(panel.state.selectedIndex).toBe(webSearchEnabled ? 0 : -1);
    expect(panel.elements.results.querySelectorAll(".qal-result-item").length).toBe(webSearchEnabled ? 1 : 0);
    expect(panel.elements.results.querySelector(webSearchEnabled ? '[data-type="web-search"]' : ".qal-empty-state").textContent).toContain("example");
  });

  it("renders footer modes and toggles expanded help", () => {
    const panel = setup();
    panel.view.renderFooter();
    const recent = panel.elements.footer.textContent;
    panel.view.setFooterMode("search");
    expect(panel.state.footerMode).toBe("search");
    expect(panel.elements.footer.textContent).not.toBe(recent);
    const search = panel.elements.footer.textContent;
    panel.view.setFooterMode("search");
    expect(panel.elements.footer.textContent).toBe(search);
    panel.view.toggleHelp();
    expect(panel.elements.footer.querySelector('[data-qal-action="toggle-help"]').getAttribute("aria-expanded")).toBe("true");
    expect(panel.elements.footer.textContent.length).toBeGreaterThan(search.length);
    panel.view.toggleHelp();
    expect(panel.elements.footer.textContent).toBe(search);
  });

  it("shows undo with its count and expires exactly after 8000 ms", () => {
    const panel = setup();
    panel.view.showPanelToast("Closed three tabs", 3);
    expect(panel.state.panelUndoCount).toBe(3);
    expect(panel.elements.toastSlot.textContent).toContain("Closed three tabs");
    expect(panel.elements.toastSlot.querySelector('[data-qal-action="undo"]').textContent).toBe(t("toast.undo"));
    vi.advanceTimersByTime(7999);
    expect(panel.elements.toastSlot.textContent).toContain("Closed three tabs");
    vi.advanceTimersByTime(1);
    expect(panel.elements.toastSlot.childElementCount).toBe(0);
    expect(panel.state.panelUndoCount).toBe(0);
  });

  it("replaces a toast, resets its timer and hides it explicitly", () => {
    const panel = setup();
    panel.view.showPanelToast("First", 1);
    vi.advanceTimersByTime(4000);
    panel.view.showPanelToast("Second");
    vi.advanceTimersByTime(4000);
    expect(panel.elements.toastSlot.textContent).toContain("Second");
    expect(panel.elements.toastSlot.querySelector('[data-qal-action="undo"]')).toBeNull();
    expect(panel.state.panelUndoCount).toBe(0);
    panel.view.hidePanelToast();
    expect(panel.elements.toastSlot.childElementCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
