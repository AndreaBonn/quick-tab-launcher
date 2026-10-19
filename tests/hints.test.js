import { describe, it, expect, beforeEach } from "vitest";

const { t, setLocaleFromStorage } = require("../src/i18n.js");
globalThis.t = t;

const {
  isMacPlatform,
  formatKey,
  getFooterHints,
  renderFooterHints,
} = require("../src/hints.js");
const { createIcon, ICON_SHAPES } = require("../src/icons.js");

describe("isMacPlatform", () => {
  it("detects macOS platform strings", () => {
    expect(isMacPlatform("MacIntel")).toBe(true);
  });

  it("returns false for other platforms and missing values", () => {
    expect(isMacPlatform("Win32")).toBe(false);
    expect(isMacPlatform("Linux x86_64")).toBe(false);
    expect(isMacPlatform(undefined)).toBe(false);
  });
});

describe("formatKey", () => {
  it("uses Mac symbols for modifiers on Mac", () => {
    expect(formatKey("Ctrl", true)).toBe("⌘");
    expect(formatKey("Alt", true)).toBe("⌥");
  });

  it("keeps key names elsewhere and for non-modifiers", () => {
    expect(formatKey("Ctrl", false)).toBe("Ctrl");
    expect(formatKey("↵", true)).toBe("↵");
  });
});

describe("getFooterHints", () => {
  it("shows at most four hints per mode", () => {
    for (const mode of ["recent", "search", "commands"]) {
      const hints = getFooterHints(mode, false);
      expect(hints.length).toBeGreaterThan(0);
      expect(hints.length).toBeLessThanOrEqual(4);
    }
  });

  it("tells what Enter does in each mode", () => {
    expect(getFooterHints("recent", false)[0].id).toBe("enter-go");
    expect(getFooterHints("search", false)[0].id).toBe("enter-open");
    expect(getFooterHints("commands", false)[0].id).toBe("enter-run");
  });

  it("lists every shortcut when expanded", () => {
    const ids = getFooterHints("recent", true).map((h) => h.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "new-tab",
        "group",
        "fulltext",
        "close-tab",
        "undo",
        "esc",
      ]),
    );
    expect(getFooterHints("recent", false).map((h) => h.id)).not.toContain(
      "fulltext",
    );
  });

  it("falls back to the recent set for an unknown mode", () => {
    expect(getFooterHints("nope", false)).toEqual(
      getFooterHints("recent", false),
    );
  });
});

describe("renderFooterHints", () => {
  let footer;

  beforeEach(() => {
    setLocaleFromStorage("it");
    footer = document.createElement("div");
  });

  it("renders keys as kbd elements followed by the label", () => {
    renderFooterHints(footer, {
      mode: "search",
      expanded: false,
      isMac: false,
    });
    const first = footer.querySelector(".qal-hint");
    expect(first.querySelector("kbd").textContent).toBe("↵");
    expect(first.textContent).toContain(t("hints.open"));
  });

  it("renders Mac modifiers on Mac", () => {
    renderFooterHints(footer, { mode: "search", expanded: false, isMac: true });
    const kbds = [...footer.querySelectorAll("kbd")].map((k) => k.textContent);
    expect(kbds).toContain("⌘");
    expect(kbds).not.toContain("Ctrl");
  });

  it("renders the help toggle as a button with its state", () => {
    renderFooterHints(footer, {
      mode: "recent",
      expanded: false,
      isMac: false,
    });
    const btn = footer.querySelector('button[data-qal-action="toggle-help"]');
    expect(btn).not.toBeNull();
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("replaces previous content on re-render", () => {
    renderFooterHints(footer, { mode: "recent", expanded: true, isMac: false });
    const expandedCount = footer.querySelectorAll(".qal-hint").length;
    renderFooterHints(footer, {
      mode: "recent",
      expanded: false,
      isMac: false,
    });
    expect(footer.querySelectorAll(".qal-hint").length).toBeLessThan(
      expandedCount,
    );
  });
});

describe("createIcon", () => {
  it("builds an svg with the shapes of the named icon", () => {
    const svg = createIcon("search");
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.childNodes.length).toBe(ICON_SHAPES.search.length);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("returns null for an unknown icon", () => {
    expect(createIcon("does-not-exist")).toBeNull();
  });
});

describe("isAltShortcut", () => {
  const { isAltShortcut } = require("../src/hints.js");
  const ev = (props) => ({
    key: "",
    code: "",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...props,
  });

  it("matches Alt plus the physical letter, whatever character it types", () => {
    expect(
      isAltShortcut(ev({ altKey: true, code: "KeyG", key: "©" }), "g"),
    ).toBe(true);
    expect(isAltShortcut(ev({ altKey: true, key: "g" }), "g")).toBe(true);
  });

  it("leaves AltGr (Ctrl+Alt) to the keyboard layout", () => {
    expect(
      isAltShortcut(
        ev({ altKey: true, ctrlKey: true, code: "KeyZ", key: "ż" }),
        "z",
      ),
    ).toBe(false);
  });

  it("ignores other letters and plain keys", () => {
    expect(
      isAltShortcut(ev({ altKey: true, code: "KeyH", key: "h" }), "g"),
    ).toBe(false);
    expect(isAltShortcut(ev({ code: "KeyG", key: "g" }), "g")).toBe(false);
  });
});
