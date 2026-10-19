import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { scriptsFor } from "./helpers/load-scripts.js";
import {
  createBrowserMock,
  settle,
  press,
  type,
} from "./helpers/load-launcher.js";

const POPUP_HTML = fs.readFileSync(
  path.join(__dirname, "../popup/popup.html"),
  "utf8",
);
const SCRIPTS = scriptsFor("popup");
const POPUP_ENTRY = SCRIPTS.at(-1);

const SEARCH_TABS = () => ({
  tabs: [
    { id: 1, title: "GH a", url: "https://github.com/a" },
    { id: 2, title: "SO", url: "https://stackoverflow.com/q" },
    { id: 3, title: "GH b", url: "https://github.com/b" },
  ],
  bookmarks: [],
  history: [],
});

async function openPopup(replies = {}, configureBrowser = () => {}) {
  const body = POPUP_HTML.slice(
    POPUP_HTML.indexOf("<body"),
    POPUP_HTML.indexOf("<script"),
  ).replace(/<body[^>]*>/, "");
  document.body.className = "qal-popup";
  document.body.innerHTML = body;
  const browserMock = createBrowserMock(replies);
  configureBrowser(browserMock);
  browserMock.runtime.openOptionsPage = vi.fn();
  globalThis.browser = browserMock;
  for (const modulePath of SCRIPTS.slice(0, -1)) {
    Object.assign(globalThis, require(modulePath));
  }
  globalThis.setLocaleFromStorage("it");
  window.close = vi.fn();
  delete require.cache[require.resolve(POPUP_ENTRY)];
  require(POPUP_ENTRY);
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await settle();
  return { browserMock, input: document.querySelector(".qal-input") };
}

function sent(browserMock) {
  return browserMock.runtime.sendMessage.mock.calls.map(([m]) => m);
}

async function openRegressionPopup(replies = {}, configureBrowser) {
  const registrations = vi.spyOn(document, "addEventListener");
  try {
    return await openPopup(replies, configureBrowser);
  } finally {
    for (const [event, listener] of registrations.mock.calls) {
      if (event === "DOMContentLoaded") document.removeEventListener(event, listener);
    }
    registrations.mockRestore();
  }
}

afterEach(() => {
  document.body.innerHTML = "";
  delete globalThis.browser;
});

describe("popup - same tools as the overlay (N3)", () => {
  it.each([
    ["config", "config load failed"],
    ["get-active-tab-state", "tab state unavailable"],
    ["get-web-search-state", "web search state unavailable"],
    ["get-recent-tabs", "recent tabs unavailable"],
  ])("warns on %s failure and keeps search and navigation working", async (action, warning) => {
    const error = new Error(`${action} unavailable`);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { browserMock, input } = await openRegressionPopup({
        search: SEARCH_TABS,
        [action]: () => Promise.reject(error),
      }, (mock) => {
        if (action === "config") {
          mock.storage.local.get.mockImplementation(async (key) => {
            if (key === "qal_user_config") throw error;
            return {};
          });
        }
      });
      await type(input, "gh");
      expect(document.querySelector(".qal-results").textContent).toContain("GH a");
      press(input, "Enter");
      expect(sent(browserMock)).toContainEqual({ action: "navigate", type: "tab", tabId: 1 });
      expect(warn).toHaveBeenCalledWith(`Quick TAB Launcher popup: ${warning}`, error);
    } finally {
      warn.mockRestore();
    }
  });

  it("closes a domain from grouped results, refreshes and offers undo", async () => {
    let domainClosed = false;
    const { browserMock, input } = await openRegressionPopup({
      search: () => ({
        ...SEARCH_TABS(),
        tabs: domainClosed ? [SEARCH_TABS().tabs[1]] : SEARCH_TABS().tabs,
      }),
      "close-domain-tabs": () => { domainClosed = true; return { closed: 2 }; },
    });
    press(input, "g", { code: "KeyG", altKey: true });
    await type(input, "x");
    document.querySelector('.qal-domain-close-all[data-domain="github.com"]').click();
    await settle(globalThis.QAL_CONFIG.DEBOUNCE_MS + 60);
    expect(sent(browserMock)).toContainEqual({
      action: "close-domain-tabs", domain: "github.com",
    });
    expect(document.querySelector(".qal-toast-slot").textContent).toContain("2 schede di github.com chiuse");
    expect(document.querySelector(".qal-results").textContent).toContain("SO");
    expect(document.querySelector(".qal-results").textContent).not.toContain("GH a");
    expect(browserMock.runtime.sendMessage.mock.calls.filter(([m]) => m.action === "search")).toHaveLength(2);
    document.querySelector('[data-qal-action="undo"]').click();
    await settle();
    expect(sent(browserMock)).toContainEqual({ action: "undo-close", count: 2 });
  });

  it("does not confirm a command after selection changes during preview", async () => {
    let resolvePreview;
    const preview = new Promise((resolve) => { resolvePreview = resolve; });
    const { browserMock, input } = await openRegressionPopup({
      "preview-command": () => preview,
    });
    await type(input, ">");
    press(input, "Enter");
    expect(sent(browserMock)).toContainEqual({
      action: "preview-command", commandId: "close-other-tabs",
    });
    press(input, "ArrowDown");
    const selected = document.querySelector('.qal-result-item[aria-selected="true"]');
    expect(selected.textContent).toContain("Chiudi schede duplicate");
    resolvePreview({ affected: 2 });
    await settle();
    expect(document.querySelector(".qal-confirm")).toBeNull();
    expect(selected.getAttribute("aria-selected")).toBe("true");
  });

  it("keeps the newer search results when the older reply arrives last", async () => {
    let resolveOlder;
    let resolveNewer;
    const older = new Promise((resolve) => { resolveOlder = resolve; });
    const newer = new Promise((resolve) => { resolveNewer = resolve; });
    const { input } = await openRegressionPopup({
      search: ({ query }) => query === "gh" ? older : newer,
    });
    await type(input, "gh");
    await type(input, "so");
    resolveNewer({ tabs: [SEARCH_TABS().tabs[1]], bookmarks: [], history: [] });
    await settle();
    expect(document.querySelector(".qal-results").textContent).toContain("SO");
    resolveOlder({ tabs: [SEARCH_TABS().tabs[0]], bookmarks: [], history: [] });
    await settle();
    expect(document.querySelector(".qal-results").textContent).toContain("SO");
    expect(document.querySelector(".qal-results").textContent).not.toContain("GH a");
  });

  it("shows the By site and Search text toggles with their labels", async () => {
    await openPopup();
    expect(document.querySelector(".qal-group-toggle").textContent).toBe(
      "Per sito",
    );
    expect(document.querySelector(".qal-fulltext-toggle").textContent).toBe(
      "Cerca nel testo",
    );
  });

  it("Alt+G groups results by site and Enter opens the highlighted row", async () => {
    const { browserMock, input } = await openPopup({ search: SEARCH_TABS });
    press(input, "g", { code: "KeyG", altKey: true });
    await type(input, "x");
    expect(
      document.querySelector(".qal-group-toggle").getAttribute("aria-pressed"),
    ).toBe("true");

    press(input, "ArrowDown");
    press(input, "Enter");

    expect(sent(browserMock)).toContainEqual(
      expect.objectContaining({ action: "navigate", tabId: 3 }),
    );
  });

  it("the Search text toggle saves the setting", async () => {
    const { browserMock } = await openPopup();
    const before = globalThis.QAL_CONFIG.ENABLE_FULLTEXT_SEARCH;
    document.querySelector(".qal-fulltext-toggle").click();
    await settle();
    expect(browserMock.store.qal_user_config.ENABLE_FULLTEXT_SEARCH).toBe(
      !before,
    );
    globalThis.QAL_CONFIG.ENABLE_FULLTEXT_SEARCH = before;
  });

  it("an empty search suggests what to try", async () => {
    const { input } = await openPopup();
    await type(input, "fattura iva");
    expect(document.querySelector(".qal-tips").textContent).toContain(
      "meno parole",
    );
  });

  it("finds actions without the > prefix", async () => {
    const { input } = await openPopup();
    await type(input, "silenzia");
    expect(
      document.querySelector('.qal-section[data-section="commands"]')
        .textContent,
    ).toContain("Silenzia scheda");
  });

  it("Alt+W closes the selected tab and offers undo", async () => {
    const { browserMock, input } = await openPopup({
      search: SEARCH_TABS,
      "close-tab": { closed: 1 },
    });
    await type(input, "x");
    press(input, "w", { code: "KeyW", altKey: true });
    await settle();
    expect(sent(browserMock)).toContainEqual({ action: "close-tab", tabId: 1 });
    document.querySelector('[data-qal-action="undo"]').click();
    await settle();
    expect(sent(browserMock)).toContainEqual({
      action: "undo-close",
      count: 1,
    });
  });

  it("asks to confirm before closing other tabs", async () => {
    const { browserMock, input } = await openPopup({
      "preview-command": { affected: 2 },
    });
    await type(input, ">altre");
    press(input, "Enter");
    await settle();
    expect(document.querySelector(".qal-confirm").textContent).toContain(
      "Chiuderà 2 schede",
    );
    expect(window.close).not.toHaveBeenCalled();
    press(input, "Enter");
    expect(sent(browserMock)).toContainEqual({
      action: "execute-command",
      commandId: "close-other-tabs",
    });
    expect(window.close).toHaveBeenCalled();
  });

  it("has no branding row and renders keys in the footer", async () => {
    await openPopup();
    expect(document.querySelector(".qal-branding")).toBeNull();
    expect(document.querySelectorAll(".qal-footer kbd").length).toBeGreaterThan(
      0,
    );
  });
});
