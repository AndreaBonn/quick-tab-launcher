import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";
import { scriptsFor, pageFor } from "./helpers/load-scripts.js";
import { checkBindings } from "./helpers/script-contract.js";
import { createBrowserMock } from "./helpers/load-launcher.js";

const POINTS = ["background", "content", "popup", "options", "welcome"];
const event = () => ({ addListener: vi.fn() });

function browserForLoad() {
  const browser = createBrowserMock();
  browser.commands = { getAll: vi.fn(async () => [{ name: "toggle-launcher", shortcut: "Ctrl+Shift+Space" }]), onCommand: event() };
  browser.runtime.onInstalled = event();
  browser.tabs = { query: vi.fn(async () => []), onActivated: event(), onUpdated: event() };
  browser.windows = { onFocusChanged: event() };
  browser.browserAction = { setTitle: vi.fn(async () => {}), onClicked: event() };
  browser.permissions = { contains: vi.fn(async () => false), onAdded: event(), onRemoved: event() };
  return browser;
}

function sourcesFor(point) {
  return scriptsFor(point).map((file) => ({ file, source: fs.readFileSync(file, "utf8") }));
}

function loadWindow(point, errors = []) {
  const virtualConsole = new VirtualConsole();
  for (const type of ["jsdomError", "error", "warn"]) {
    virtualConsole.on(type, (...args) => errors.push(args));
  }
  const dom = new JSDOM(pageFor(point), {
    runScripts: "outside-only",
    url: "https://extension.test/",
    virtualConsole,
  });
  dom.window.browser = browserForLoad();
  return dom;
}

describe.each(POINTS)("%s loading contract", (point) => {
  it("resolves every registered script to an existing file", () => {
    const scripts = scriptsFor(point);
    expect(scripts.length).toBeGreaterThan(0);
    for (const file of scripts) expect(fs.statSync(file).isFile(), file).toBe(true);
  });

  it("provides globals before their consumers without duplicate bindings", () => {
    const dom = loadWindow(point);
    try {
      const owners = checkBindings(dom.window, sourcesFor(point));
      expect(owners.size).toBeGreaterThan(0);
    } finally {
      dom.window.close();
    }
  });

  it("initializes through classic scripts in a shared browser scope", async () => {
    const errors = [];
    const dom = loadWindow(point, errors);
    const { window } = dom;
    try {
      const loaded = new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));
      for (const { file, source } of sourcesFor(point)) {
        vm.runInContext(source, dom.getInternalVMContext(), { filename: file });
      }
      await loaded;
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      expect(window.eval('t("keys.space")')).toBe("Spazio");
      if (point === "options") {
        expect(window.document.querySelector("#qal-max-tab-results").value).toBe("5");
      } else if (point === "popup") {
        expect(window.document.querySelector(".qal-input").placeholder).toBe(window.eval('t("launcher.placeholder")'));
        expect(window.browser.runtime.sendMessage).toHaveBeenCalledWith({ action: "get-recent-tabs" });
      } else {
        expect(window.browser.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
      }
      expect(errors).toEqual([]);
    } finally {
      window.close();
    }
  });
});

describe("loading contract diagnostics", () => {
  it("captures and saves a shortcut through the scripts registered by the options page", async () => {
    const dom = loadWindow("options");
    const { window } = dom;
    window.browser.commands.update = vi.fn(async () => {});
    try {
      const loaded = new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));
      for (const { file, source } of sourcesFor("options")) {
        vm.runInContext(source, dom.getInternalVMContext(), { filename: file });
      }
      await loaded;
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      expect([...window.document.querySelectorAll("#qal-shortcut-keys kbd")].map((key) => key.textContent)).toEqual(["Ctrl", "Shift", "Spazio"]);
      window.document.getElementById("qal-shortcut-change").click();
      window.document.dispatchEvent(new window.KeyboardEvent("keydown", { code: "KeyK", key: "K", ctrlKey: true, shiftKey: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      expect(window.browser.commands.update).toHaveBeenCalledWith({ name: "toggle-launcher", shortcut: "Ctrl+Shift+K" });
      expect([...window.document.querySelectorAll("#qal-shortcut-keys kbd")].map((key) => key.textContent)).toEqual(["Ctrl", "Shift", "K"]);
      expect(window.browser.runtime.sendMessage).toHaveBeenCalledWith({ action: "refresh-action-title" });
    } finally {
      window.close();
    }
  });

  it("loads the shared panel view from the content manifest before the launcher", () => {
    const dom = loadWindow("content");
    try {
      for (const { file, source } of sourcesFor("content").slice(0, -1)) {
        vm.runInContext(source, dom.getInternalVMContext(), { filename: file });
      }
      const state = dom.window.eval("createPanelState()");
      const elements = {
        input: dom.window.document.createElement("input"),
        results: dom.window.document.createElement("div"),
      };
      elements.input.value = "example";
      state.webSearchEnabled = true;
      const view = dom.window.eval("createPanelView")({ state, elements });
      view.rebuildFlatResults();
      view.renderCurrentView(elements.input.value);
      view.selectNext();
      expect(state.flatResults).toEqual([{ type: "web-search", query: "example" }]);
      expect(elements.results.querySelector('[data-type="web-search"]').getAttribute("aria-selected")).toBe("true");
    } finally {
      dom.window.close();
    }
  });

  it("rejects a missing provider and accepts the same consumer after its provider", () => {
    const dom = new JSDOM();
    const provider = { file: "provider.js", source: "const sharedValue = 42;" };
    const consumer = { file: "consumer.js", source: "/* global sharedValue */\nfunction readValue() { return sharedValue; }" };
    try {
      expect(() => checkBindings(dom.window, [consumer])).toThrow("consumer.js: sharedValue needs a script loaded earlier");
      expect(checkBindings(dom.window, [provider, consumer]).get("sharedValue")).toBe("provider.js");
    } finally {
      dom.window.close();
    }
  });

  it.each(["const sharedValue = 42;", "function sharedValue() {}"])("rejects duplicate top-level bindings: %s", (source) => {
    const dom = new JSDOM();
    const first = { file: "first.js", source };
    try {
      expect(() => checkBindings(dom.window, [first, { file: "second.js", source }])).toThrow("second.js: duplicate sharedValue from first.js");
      expect(checkBindings(dom.window, [first]).get("sharedValue")).toBe("first.js");
    } finally {
      dom.window.close();
    }
  });
});

describe.each(["content", "popup"])("%s panel controller loading", (point) => {
  it("routes navigation through the controller loaded before its host", () => {
    const dom = loadWindow(point);
    try {
      for (const { file, source } of sourcesFor(point).slice(0, -1)) {
        vm.runInContext(source, dom.getInternalVMContext(), { filename: file });
      }
      const hooks = { afterNavigate: vi.fn() };
      const controller = dom.window.eval("createPanelController")({
        state: dom.window.eval("createPanelState()"), elements: {}, hooks,
      });
      controller.navigateTo({ type: "recent-closed", sessionId: "restorable" });
      expect(dom.window.browser.runtime.sendMessage).toHaveBeenCalledWith({ action: "restore-session", sessionId: "restorable" });
      expect(hooks.afterNavigate).toHaveBeenCalledWith({ type: "recent-closed", sessionId: "restorable" });
    } finally {
      dom.window.close();
    }
  });
});

describe("launcher DOM loading", () => {
  it("builds an overlay using the DOM module loaded before the launcher", () => {
    const dom = loadWindow("content");
    try {
      for (const { file, source } of sourcesFor("content").slice(0, -1)) {
        vm.runInContext(source, dom.getInternalVMContext(), { filename: file });
      }
      const root = dom.window.document.createElement("div").attachShadow({ mode: "closed" });
      const elements = dom.window.eval("createOverlayDOM")(root);
      dom.window.eval("translateOverlayDOM")(elements);
      expect(elements.input.getAttribute("aria-controls")).toBe(elements.results.id);
      expect(elements.input.placeholder).toBe(dom.window.eval('t("launcher.placeholder")'));
      expect(root.querySelector('[role="listbox"]')).toBe(elements.results);
    } finally {
      dom.window.close();
    }
  });
});

describe("duplicates banner loading", () => {
  it("loads the banner controller before the launcher and renders through its dependencies", async () => {
    const dom = loadWindow("content");
    try {
      for (const { file, source } of sourcesFor("content").slice(0, -1)) {
        vm.runInContext(source, dom.getInternalVMContext(), { filename: file });
      }
      dom.window.browser.runtime.sendMessage.mockResolvedValue({ count: 2 });
      const slot = dom.window.document.createElement("div");
      const onClosed = vi.fn();
      const banner = dom.window.eval("createDuplicatesBanner")({
        slot, browser: dom.window.browser, isActive: () => true, onClosed,
      });
      await banner.checkDuplicates();
      expect(slot.querySelector(".qal-duplicate-banner").textContent).toContain(dom.window.eval('tCount("duplicates.banner", 2)'));
      banner.dismiss(slot.firstElementChild);
      expect(dom.window.browser.store.qal_duplicates_dismissed).toBe("2");
    } finally {
      dom.window.close();
    }
  });
});
