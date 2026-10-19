import { describe, it, expect, afterEach, vi } from "vitest";
import {
  createBrowserMock,
  loadLauncher,
  cleanupLauncher,
  settle,
  press,
  type,
} from "./helpers/load-launcher.js";

// A function, so every search gets a fresh copy the launcher may modify.
const SEARCH_TABS = () => ({
  tabs: [
    { id: 10, title: "Pull requests", url: "https://github.com/pulls" },
    { id: 11, title: "Issues", url: "https://github.com/issues" },
  ],
  bookmarks: [],
  history: [],
});

async function openWith(replies = {}, store = {}) {
  document.documentElement.innerHTML = "<head></head><body></body>";
  const browserMock = createBrowserMock(replies);
  Object.assign(browserMock.store, store);
  const { shadowRoot, messageListener } = await loadLauncher(browserMock);
  messageListener({ action: "toggle" });
  await settle();
  const input = shadowRoot.querySelector(".qal-input");
  return { browserMock, shadowRoot, input, messageListener };
}

function sentActions(browserMock) {
  return browserMock.runtime.sendMessage.mock.calls.map(([m]) => m);
}

afterEach(cleanupLauncher);

describe("first-run guide (A1)", () => {
  it("shows the guide on the first openings", async () => {
    const { shadowRoot } = await openWith();
    const guide = shadowRoot.querySelector(".qal-guide");
    expect(guide.hidden).toBe(false);
    expect(guide.textContent).toContain("Prime volte qui?");
  });

  it("Got it hides the guide and remembers it", async () => {
    const { shadowRoot, browserMock } = await openWith();
    shadowRoot.querySelector('[data-qal-action="dismiss-guide"]').click();
    expect(shadowRoot.querySelector(".qal-guide").hidden).toBe(true);
    await settle();
    expect(browserMock.store.qal_guide.dismissed).toBe(true);
  });

  it("stays hidden once dismissed", async () => {
    const { shadowRoot } = await openWith(
      {},
      { qal_guide: { opens: 2, dismissed: true } },
    );
    expect(shadowRoot.querySelector(".qal-guide").hidden).toBe(true);
  });

  it("stops by itself after the first ten openings", async () => {
    const { shadowRoot } = await openWith(
      {},
      { qal_guide: { opens: 10, dismissed: false } },
    );
    expect(shadowRoot.querySelector(".qal-guide").hidden).toBe(true);
  });
});

describe("quick actions (A5, C4)", () => {
  it("offers the applicable actions as chips while nothing is typed", async () => {
    const { shadowRoot } = await openWith({
      "get-active-tab-state": { muted: true, pinned: false },
    });
    const chips = [...shadowRoot.querySelectorAll(".qal-chip")].map(
      (c) => c.textContent,
    );
    expect(chips).toEqual([
      "Chiudi doppie",
      "Riattiva audio",
      "Fissa",
      "Tutte (>)",
    ]);
  });

  it("runs the chip's action", async () => {
    const { shadowRoot, browserMock } = await openWith({
      "get-active-tab-state": { muted: false, pinned: false },
      "execute-command": { success: true },
    });
    const mute = [...shadowRoot.querySelectorAll(".qal-chip")].find(
      (c) => c.dataset.commandId === "mute-tab",
    );
    mute.click();
    expect(sentActions(browserMock)).toContainEqual({
      action: "execute-command",
      commandId: "mute-tab",
    });
  });

  it("hides the chips while searching and shows them again when cleared", async () => {
    const { shadowRoot, input } = await openWith();
    const row = shadowRoot.querySelector(".qal-quick-actions");
    await type(input, "git");
    expect(row.hidden).toBe(true);
    await type(input, "");
    expect(row.hidden).toBe(false);
  });

  it("All (>) switches to the actions list", async () => {
    const { shadowRoot, input } = await openWith();
    shadowRoot.querySelector('[data-qal-action="show-commands"]').click();
    expect(input.value).toBe(">");
    expect(shadowRoot.querySelector(".qal-command-item")).not.toBeNull();
  });
});

describe("duplicates banner (A4)", () => {
  const summary = {
    count: 3,
    groups: [
      { title: "Pull requests", url: "https://gh.com/p", extra: 2 },
      { title: "MDN", url: "https://mdn.org", extra: 1 },
    ],
    more: 0,
  };

  it("names the duplicated pages", async () => {
    const { shadowRoot } = await openWith({ "get-duplicate-count": summary });
    const banner = shadowRoot.querySelector(".qal-duplicate-banner");
    expect(banner.textContent).toContain("3 schede doppie");
    expect(banner.textContent).toContain("Pull requests (2 in più)");
    expect(banner.textContent).toContain("MDN (1 in più)");
  });

  it("Not now hides it until the duplicates change", async () => {
    const { shadowRoot, browserMock, messageListener } = await openWith({
      "get-duplicate-count": summary,
    });
    shadowRoot.querySelector(".qal-duplicate-dismiss").click();
    expect(shadowRoot.querySelector(".qal-duplicate-banner")).toBeNull();
    await settle();

    messageListener({ action: "toggle" });
    messageListener({ action: "toggle" });
    await settle();
    expect(shadowRoot.querySelector(".qal-duplicate-banner")).toBeNull();

    browserMock.store.qal_duplicates_dismissed = "something else";
    messageListener({ action: "toggle" });
    messageListener({ action: "toggle" });
    await settle();
    expect(shadowRoot.querySelector(".qal-duplicate-banner")).not.toBeNull();
  });

  it("closing the copies reports how many and offers undo", async () => {
    const { shadowRoot, browserMock } = await openWith({
      "get-duplicate-count": summary,
      "close-duplicates": { closed: 3 },
    });
    shadowRoot.querySelector(".qal-duplicate-action").click();
    await settle();
    const toast = shadowRoot.querySelector(".qal-toast-slot .qal-toast");
    expect(toast.textContent).toContain("3 schede doppie chiuse");
    toast.querySelector('[data-qal-action="undo"]').click();
    await settle();
    expect(sentActions(browserMock)).toContainEqual({
      action: "undo-close",
      count: 3,
    });
  });
});

describe("closing tabs from the panel (R5, R6)", () => {
  it("Alt+W closes the selected tab and offers undo", async () => {
    const { shadowRoot, browserMock, input } = await openWith({
      search: SEARCH_TABS,
      "close-tab": { closed: 1 },
    });
    await type(input, "git");

    const event = press(input, "w", { code: "KeyW", altKey: true });
    await settle();

    expect(event.defaultPrevented).toBe(true);
    expect(sentActions(browserMock)).toContainEqual({
      action: "close-tab",
      tabId: 10,
    });
    expect(shadowRoot.querySelectorAll(".qal-result-item")).toHaveLength(1);
    expect(shadowRoot.querySelector(".qal-toast").textContent).toContain(
      "Scheda chiusa: Pull requests",
    );
  });

  it("offers no undo when the tab could not be closed", async () => {
    const { shadowRoot, input } = await openWith({
      search: SEARCH_TABS,
      "close-tab": { closed: 0 },
    });
    await type(input, "git");
    press(input, "w", { code: "KeyW", altKey: true });
    await settle();
    expect(shadowRoot.querySelector(".qal-toast")).toBeNull();
    expect(shadowRoot.querySelectorAll(".qal-result-item")).toHaveLength(2);
  });

  it("holding Alt+W closes one tab per press, not on key repeat", async () => {
    const { browserMock, input } = await openWith({
      search: SEARCH_TABS,
      "close-tab": { closed: 1 },
    });
    await type(input, "git");
    press(input, "w", { code: "KeyW", altKey: true });
    press(input, "w", { code: "KeyW", altKey: true, repeat: true });
    await settle();
    const closes = sentActions(browserMock).filter(
      (m) => m.action === "close-tab",
    );
    expect(closes).toHaveLength(1);
  });

  it("Alt+Z reopens the tab just closed", async () => {
    const { browserMock, input } = await openWith({
      search: SEARCH_TABS,
      "close-tab": { closed: 1 },
    });
    await type(input, "git");
    press(input, "w", { code: "KeyW", altKey: true });
    await settle();

    press(input, "z", { code: "KeyZ", altKey: true });
    await settle();

    expect(sentActions(browserMock)).toContainEqual({
      action: "undo-close",
      count: 1,
    });
  });

  it("Alt+Z does nothing when there is nothing to undo", async () => {
    const { browserMock, input } = await openWith();
    const event = press(input, "z", { code: "KeyZ", altKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(sentActions(browserMock).map((m) => m.action)).not.toContain(
      "undo-close",
    );
  });

  it("the selected row shows its close button", async () => {
    const { shadowRoot, input } = await openWith({ search: SEARCH_TABS });
    await type(input, "git");
    const selected = shadowRoot.querySelector(".qal-result-item.qal-selected");
    expect(selected.querySelector(".qal-close-tab")).not.toBeNull();
  });
});

describe("actions in normal search (R7)", () => {
  it("lists a matching action when nothing else matches, and runs it", async () => {
    const { shadowRoot, browserMock, input } = await openWith({
      "execute-command": { success: true },
    });
    await type(input, "silenzia");

    const section = shadowRoot.querySelector(
      '.qal-section[data-section="commands"]',
    );
    expect(section.textContent).toContain("Silenzia scheda");

    press(input, "Enter");
    await settle();
    expect(sentActions(browserMock)).toContainEqual({
      action: "execute-command",
      commandId: "mute-tab",
    });
  });

  it("puts actions after the regular results", async () => {
    const { shadowRoot, input } = await openWith({ search: SEARCH_TABS });
    await type(input, "duplica");
    const sections = [...shadowRoot.querySelectorAll(".qal-section")].map(
      (s) => s.dataset.section,
    );
    expect(sections).toEqual(["tabs", "commands"]);
  });
});

describe("no results (R8)", () => {
  it("suggests what to try, including text search", async () => {
    const { shadowRoot, input } = await openWith();
    await type(input, "fattura iva");
    const tips = shadowRoot.querySelector(".qal-tips");
    expect(tips.textContent).toContain("meno parole");
    expect(tips.textContent).toContain("30 giorni");
    expect(
      tips.querySelector('[data-qal-action="enable-fulltext"]'),
    ).not.toBeNull();
  });

  it("the text search tip turns text search on", async () => {
    const { shadowRoot, input } = await openWith();
    globalThis.QAL_CONFIG.ENABLE_FULLTEXT_SEARCH = false;
    await type(input, "fattura iva");
    shadowRoot.querySelector('[data-qal-action="enable-fulltext"]').click();
    expect(globalThis.QAL_CONFIG.ENABLE_FULLTEXT_SEARCH).toBe(true);
    globalThis.QAL_CONFIG.ENABLE_FULLTEXT_SEARCH = false;
  });
});

describe("confirming actions that close tabs (C1)", () => {
  async function openCommands(affected) {
    const ctx = await openWith({
      "preview-command": { affected },
      "execute-command": { success: true, closed: affected },
    });
    await type(ctx.input, ">altre");
    return ctx;
  }

  it("the first Enter asks to confirm and says how many tabs", async () => {
    const { shadowRoot, browserMock, input } = await openCommands(4);
    press(input, "Enter");
    await settle();
    expect(shadowRoot.querySelector(".qal-confirm").textContent).toContain(
      "Chiuderà 4 schede",
    );
    expect(sentActions(browserMock).map((m) => m.action)).not.toContain(
      "execute-command",
    );
  });

  it("the second Enter runs it", async () => {
    const { browserMock, input } = await openCommands(4);
    press(input, "Enter");
    await settle();
    press(input, "Enter");
    await settle();
    expect(sentActions(browserMock)).toContainEqual({
      action: "execute-command",
      commandId: "close-other-tabs",
    });
  });

  it("Esc cancels the confirmation without closing the panel", async () => {
    const { shadowRoot, browserMock, input } = await openCommands(4);
    press(input, "Enter");
    await settle();
    press(input, "Escape");
    expect(shadowRoot.querySelector(".qal-confirm")).toBeNull();
    expect(shadowRoot.querySelector(".qal-overlay").style.display).toBe("");
    press(input, "Enter");
    await settle();
    expect(sentActions(browserMock).map((m) => m.action)).not.toContain(
      "execute-command",
    );
  });

  it("with nothing to close it says so instead of asking", async () => {
    const { shadowRoot, browserMock, input } = await openCommands(0);
    press(input, "Enter");
    await settle();
    expect(shadowRoot.querySelector(".qal-page-toast-slot").textContent).toBe(
      "Nessuna scheda da chiudere",
    );
    expect(sentActions(browserMock).map((m) => m.action)).not.toContain(
      "execute-command",
    );
  });
});

describe("outcome message after an action (C2)", () => {
  it("says what happened, with undo when tabs were closed", async () => {
    const { shadowRoot, browserMock, input } = await openWith({
      "preview-command": { affected: 2 },
      "execute-command": { success: true, closed: 2 },
    });
    await type(input, ">altre");
    press(input, "Enter");
    await settle();
    press(input, "Enter");
    await settle();

    const slot = shadowRoot.querySelector(".qal-page-toast-slot");
    expect(slot.textContent).toContain("2 schede chiuse");
    slot.querySelector('[data-qal-action="undo"]').click();
    await settle();
    expect(sentActions(browserMock)).toContainEqual({
      action: "undo-close",
      count: 2,
    });
  });

  it("confirms a non-closing action without undo", async () => {
    const { shadowRoot, input } = await openWith({
      "execute-command": { success: true },
    });
    await type(input, ">silenzia");
    press(input, "Enter");
    await settle();
    const slot = shadowRoot.querySelector(".qal-page-toast-slot");
    expect(slot.textContent).toBe("Scheda silenziata");
    expect(slot.querySelector('[data-qal-action="undo"]')).toBeNull();
  });

  it("says when the action failed", async () => {
    const { shadowRoot, input } = await openWith({
      "execute-command": { success: false, error: "x" },
    });
    await type(input, ">silenzia");
    press(input, "Enter");
    await settle();
    expect(
      shadowRoot.querySelector(".qal-page-toast-slot").textContent,
    ).toContain("non è riuscita");
  });
});

describe("settings button (S6)", () => {
  it("opens the settings and closes the panel", async () => {
    const { shadowRoot, browserMock } = await openWith();
    const btn = shadowRoot.querySelector('[data-qal-action="open-options"]');
    expect(btn.getAttribute("aria-label")).toBe("Impostazioni");
    btn.click();
    expect(sentActions(browserMock)).toContainEqual({ action: "open-options" });
    expect(shadowRoot.querySelector(".qal-overlay").style.display).toBe("none");
  });
});

describe("recently closed rows can be reopened by Enter (A3 wording)", () => {
  it("labels a recently closed tab with Reopen", async () => {
    const { shadowRoot } = await openWith({
      "get-recent-tabs": {
        recentActive: [],
        recentlyClosed: [
          { id: "s1", sessionId: "s1", title: "Meteo", url: "https://m.it" },
        ],
      },
    });
    const hint = shadowRoot.querySelector(
      ".qal-result-item.qal-selected .qal-enter-hint",
    );
    expect(hint.textContent).toContain("Riapri");
  });
});

vi.setConfig({ testTimeout: 10000 });

describe("language follows Firefox (L1)", () => {
  async function openIn(uiLanguage, store = {}) {
    document.documentElement.innerHTML = "<head></head><body></body>";
    const browserMock = createBrowserMock();
    browserMock.i18n.getUILanguage = () => uiLanguage;
    Object.assign(browserMock.store, store);
    const { shadowRoot } = await loadLauncher(browserMock);
    return shadowRoot;
  }

  it("an English Firefox gets an English panel with nothing stored", async () => {
    const shadowRoot = await openIn("en-US");
    expect(shadowRoot.querySelector(".qal-input").placeholder).toBe(
      "Search tabs, bookmarks, history, or > actions",
    );
  });

  it("an explicit choice wins over Firefox's language", async () => {
    const shadowRoot = await openIn("en-US", { qal_locale: "it" });
    expect(shadowRoot.querySelector(".qal-input").placeholder).toContain(
      "Cerca schede",
    );
  });
});

describe("review fixes - timing and state", () => {
  it("a toggle that arrives before the panel is ready opens it once ready (#1)", async () => {
    document.documentElement.innerHTML = "<head></head><body></body>";
    const browserMock = createBrowserMock();
    let releaseLocale;
    const realGet = browserMock.storage.local.get;
    browserMock.storage.local.get = vi.fn((key) =>
      key === "qal_locale"
        ? new Promise((resolve) => {
            releaseLocale = () => resolve({});
          })
        : realGet(key),
    );
    // Keep the shadow root open past the helper, which restores attachShadow
    // before this delayed bootstrap creates the panel.
    const originalAttachShadow = HTMLElement.prototype.attachShadow;
    HTMLElement.prototype.attachShadow = function (options) {
      return originalAttachShadow.call(this, { ...options, mode: "open" });
    };
    try {
      await loadLauncher(browserMock);
      const listener =
        browserMock.runtime.onMessage.addListener.mock.calls[0][0];
      listener({ action: "toggle" });
      expect(document.getElementById("qal-shadow-host")).toBeNull();

      releaseLocale();
      await settle();

      const host = document.getElementById("qal-shadow-host");
      const overlay = host.shadowRoot.querySelector(".qal-overlay");
      expect(overlay.style.display).toBe("");
    } finally {
      HTMLElement.prototype.attachShadow = originalAttachShadow;
    }
  });

  it("closing a recent tab keeps the selection on the same row (#4)", async () => {
    const recent = (ids) => ({
      recentActive: ids.map((id) => ({
        id,
        title: `T${id}`,
        url: `https://t${id}.com`,
      })),
      recentlyClosed: [],
    });
    let ids = [1, 2, 3, 4];
    const { shadowRoot, input } = await openWith({
      "get-recent-tabs": () => recent(ids),
      "close-tab": (msg) => {
        ids = ids.filter((id) => id !== msg.tabId);
        return { closed: 1 };
      },
    });
    press(input, "ArrowDown");
    press(input, "ArrowDown");
    press(input, "w", { code: "KeyW", altKey: true });
    await settle();
    const selected = shadowRoot.querySelector(".qal-result-item.qal-selected");
    expect(selected.querySelector(".qal-result-title").textContent).toBe("T4");
  });

  it("reopening the panel keeps the page toast's undo working (#6)", async () => {
    const { shadowRoot, browserMock, input, messageListener } = await openWith({
      "preview-command": { affected: 2 },
      "execute-command": { success: true, closed: 2 },
    });
    await type(input, ">altre");
    press(input, "Enter");
    await settle();
    press(input, "Enter");
    await settle();
    messageListener({ action: "toggle" });
    await settle();
    shadowRoot
      .querySelector('.qal-page-toast-slot [data-qal-action="undo"]')
      .click();
    await settle();
    expect(sentActions(browserMock)).toContainEqual({
      action: "undo-close",
      count: 2,
    });
  });

  it("the duplicates banner is outside the result list and hides while searching (#7)", async () => {
    const { shadowRoot, input } = await openWith({
      "get-duplicate-count": { count: 1, groups: [], more: 0 },
    });
    const banner = shadowRoot.querySelector(".qal-duplicate-banner");
    expect(banner.closest(".qal-results")).toBeNull();
    await type(input, "git");
    expect(shadowRoot.querySelector(".qal-duplicates-slot").hidden).toBe(true);
  });

  it("drops a search reply that arrives after a newer keystroke (#8)", async () => {
    let releaseFirst;
    const { shadowRoot, input } = await openWith({
      search: (msg) =>
        msg.query === "old"
          ? new Promise((resolve) => {
              releaseFirst = () =>
                resolve({
                  tabs: [{ id: 1, title: "Stale", url: "https://s.com" }],
                  bookmarks: [],
                  history: [],
                });
            })
          : {
              tabs: [{ id: 2, title: "Fresh", url: "https://f.com" }],
              bookmarks: [],
              history: [],
            },
    });
    await type(input, "old");
    await type(input, "new");
    releaseFirst();
    await settle();
    const titles = [...shadowRoot.querySelectorAll(".qal-result-title")].map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(["Fresh"]);
  });
});

describe("accessibility of the result list", () => {
  it("is a listbox of grouped options while it shows results", async () => {
    const { shadowRoot, input } = await openWith({ search: SEARCH_TABS });
    await type(input, "git");
    const list = shadowRoot.querySelector(".qal-results");
    expect(list.getAttribute("role")).toBe("listbox");
    const group = list.querySelector('[role="group"]');
    expect(group.getAttribute("aria-labelledby")).toBe("qal-section-tabs");
    expect(list.querySelector(".qal-close-tab").tabIndex).toBe(-1);
  });

  it("becomes a status message, without an active option, when empty", async () => {
    const { shadowRoot, input } = await openWith({ search: SEARCH_TABS });
    await type(input, "git");
    expect(input.hasAttribute("aria-activedescendant")).toBe(true);
    const browserReplies = globalThis.browser.runtime.sendMessage;
    browserReplies.mockImplementation(async () => ({
      tabs: [],
      bookmarks: [],
      history: [],
    }));
    await type(input, "zzzz");
    expect(shadowRoot.querySelector(".qal-results").getAttribute("role")).toBe(
      "status",
    );
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
  });
});

describe("web search when nothing matches (R9)", () => {
  it("offers to search the web when the user turned it on", async () => {
    const { shadowRoot, browserMock, input } = await openWith({
      "get-web-search-state": { enabled: true },
    });
    await type(input, "fattura iva");
    const row = shadowRoot.querySelector(".qal-result-item.qal-selected");
    expect(row.textContent).toContain("Cerca «fattura iva» sul web");
    expect(shadowRoot.querySelector(".qal-results").getAttribute("role")).toBe(
      "listbox",
    );

    press(input, "Enter");
    expect(sentActions(browserMock)).toContainEqual({
      action: "web-search",
      query: "fattura iva",
      newTab: false,
    });
    expect(shadowRoot.querySelector(".qal-overlay").style.display).toBe("none");
  });

  it("Ctrl+Enter searches in a new tab", async () => {
    const { browserMock, input } = await openWith({
      "get-web-search-state": { enabled: true },
    });
    await type(input, "fattura iva");
    press(input, "Enter", { ctrlKey: true });
    expect(sentActions(browserMock)).toContainEqual({
      action: "web-search",
      query: "fattura iva",
      newTab: true,
    });
  });

  it("without the permission, says where to turn it on", async () => {
    const { shadowRoot, input } = await openWith({
      "get-web-search-state": { enabled: false },
    });
    await type(input, "fattura iva");
    expect(shadowRoot.querySelector(".qal-tips").textContent).toContain(
      "cercare sul web",
    );
    expect(
      shadowRoot.querySelector('.qal-result-item[data-type="web-search"]'),
    ).toBeNull();
  });
});

describe("web row after closing the last result (R9 review)", () => {
  it("shows the web row that Enter will run", async () => {
    const { shadowRoot, browserMock, input } = await openWith({
      "get-web-search-state": { enabled: true },
      search: () => ({
        tabs: [{ id: 5, title: "Solo", url: "https://solo.com" }],
        bookmarks: [],
        history: [],
      }),
      "close-tab": { closed: 1 },
    });
    await type(input, "solo");
    press(input, "w", { code: "KeyW", altKey: true });
    await settle();

    const row = shadowRoot.querySelector(".qal-result-item.qal-selected");
    expect(row.dataset.type).toBe("web-search");
    press(input, "Enter");
    expect(sentActions(browserMock)).toContainEqual({
      action: "web-search",
      query: "solo",
      newTab: false,
    });
  });
});

describe("late search reply after close and reopen", () => {
  it("does not paint stale results over the empty input", async () => {
    let answer;
    const { shadowRoot, input, messageListener } = await openWith({
      search: () => new Promise((resolve) => { answer = resolve; }),
    });
    input.value = "git";
    input.dispatchEvent(new Event("input"));
    await settle(globalThis.QAL_CONFIG.DEBOUNCE_MS + 60);
    expect(answer).toBeTypeOf("function");

    messageListener({ action: "toggle" });
    messageListener({ action: "toggle" });
    await settle();
    answer(SEARCH_TABS());
    await settle();

    expect(shadowRoot.querySelector(".qal-input").value).toBe("");
    expect(shadowRoot.querySelector(".qal-results").textContent).not.toContain("Pull requests");
  });
});
