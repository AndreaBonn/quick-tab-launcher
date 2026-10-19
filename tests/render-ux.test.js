import { describe, it, expect, beforeEach } from "vitest";

const {
  escapeHtml,
  highlightMatch,
  formatUrl,
} = require("../src/search-utils.js");
const { t, setLocaleFromStorage } = require("../src/i18n.js");
const { createIcon } = require("../src/icons.js");

globalThis.escapeHtml = escapeHtml;
globalThis.highlightMatch = highlightMatch;
globalThis.formatUrl = formatUrl;
globalThis.t = t;
globalThis.createIcon = createIcon;

const {
  createResultItem,
  createSectionHeader,
  renderCommandResults,
  updateSelection,
} = require("../src/render-utils.js");

beforeEach(() => setLocaleFromStorage("it"));

describe("enter hint on rows (A3)", () => {
  it("says Go to tab on open tabs and Reopen on closed ones", () => {
    const tab = createResultItem(
      { id: 1, url: "https://a.com" },
      "tabs",
      "",
      0,
    );
    const closed = createResultItem(
      { id: "s", url: "https://a.com", sessionId: "s" },
      "recent-closed",
      "",
      1,
    );
    expect(tab.querySelector(".qal-enter-hint").textContent).toContain(
      t("enterHint.tab"),
    );
    expect(closed.querySelector(".qal-enter-hint").textContent).toContain(
      t("enterHint.reopen"),
    );
  });

  it("says Open on bookmarks and Run on commands", () => {
    const bookmark = createResultItem(
      { id: "b", url: "https://a.com" },
      "bookmarks",
      "",
      0,
    );
    expect(bookmark.querySelector(".qal-enter-hint").textContent).toContain(
      t("enterHint.open"),
    );
    const container = document.createElement("div");
    renderCommandResults(
      container,
      [{ id: "mute-tab", icon: "mute", label: "Silenzia", description: "d" }],
      "",
      0,
    );
    expect(container.querySelector(".qal-enter-hint").textContent).toContain(
      t("enterHint.run"),
    );
  });
});

describe("url line (R1)", () => {
  it("splits the domain from the path", () => {
    const el = createResultItem(
      { id: 1, url: "https://github.com/a/b" },
      "tabs",
      "",
      0,
    );
    expect(el.querySelector(".qal-url-domain").textContent).toBe("github.com");
    expect(el.querySelector(".qal-url-path").textContent).toBe("/a/b");
  });

  it("keeps an empty path for a bare domain", () => {
    const el = createResultItem(
      { id: 1, url: "https://github.com" },
      "tabs",
      "",
      0,
    );
    expect(el.querySelector(".qal-url-domain").textContent).toBe("github.com");
    expect(el.querySelector(".qal-url-path").textContent).toBe("");
  });
});

describe("icons (S1)", () => {
  it("section headers carry an svg icon, not an emoji", () => {
    const header = createSectionHeader("bookmarks", 2);
    const icon = header.querySelector(".qal-section-icon");
    expect(icon.querySelector("svg")).not.toBeNull();
    expect(icon.textContent).toBe("");
  });

  it("the close control is a mouse shortcut that does not nest a control in the option", () => {
    const el = createResultItem({ id: 1, url: "https://a.com" }, "tabs", "", 0);
    const close = el.querySelector(".qal-close-tab");
    expect(close.tagName).toBe("SPAN");
    expect(close.getAttribute("aria-hidden")).toBe("true");
    expect(close.title).toBe(t("badges.closeTab"));
    expect(close.querySelector("svg")).not.toBeNull();
    expect(el.querySelector("button")).toBeNull();
  });
});

describe("updateSelection - active descendant (S8)", () => {
  function buildList(count) {
    const container = document.createElement("div");
    for (let i = 0; i < count; i++) {
      container.appendChild(
        createResultItem({ id: i, url: "https://a.com" }, "tabs", "", i),
      );
    }
    return container;
  }

  it("points the owner input at the selected row", () => {
    const container = buildList(3);
    const input = document.createElement("input");
    container.activeDescendantOwner = input;
    updateSelection(container, 1);
    expect(input.getAttribute("aria-activedescendant")).toBe("qal-option-1");
    expect(container.querySelector("#qal-option-1").className).toContain(
      "qal-selected",
    );
  });

  it("clears the attribute when nothing is selected", () => {
    const container = buildList(2);
    const input = document.createElement("input");
    container.activeDescendantOwner = input;
    updateSelection(container, 0);
    updateSelection(container, -1);
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
  });
});
