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
