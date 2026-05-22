import { describe, it, expect, beforeEach } from "vitest";

const {
  escapeHtml,
  highlightMatch,
  formatUrl,
} = require("../src/search-utils.js");

const { t } = require("../src/i18n.js");

// Expose globals required by render-utils.js
globalThis.escapeHtml = escapeHtml;
globalThis.highlightMatch = highlightMatch;
globalThis.formatUrl = formatUrl;
globalThis.t = t;

const {
  hashCode,
  createInitialFavicon,
  createFavicon,
  createElement,
  createSectionHeader,
  renderEmpty,
  renderLoading,
  renderError,
  renderNoResults,
  updateSelection,
  reindexItems,
} = require("../src/render-utils.js");

// ---------------------------------------------------------------------------
// hashCode
// ---------------------------------------------------------------------------

describe("hashCode", () => {
  it("returns a non-negative integer", () => {
    expect(hashCode("example.com")).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(hashCode("example.com"))).toBe(true);
  });

  it("returns the same value for the same input", () => {
    expect(hashCode("github.com")).toBe(hashCode("github.com"));
  });

  it("returns different values for different inputs", () => {
    expect(hashCode("github.com")).not.toBe(hashCode("gitlab.com"));
  });

  it("returns 0 for empty string", () => {
    expect(hashCode("")).toBe(0);
  });

  it("handles single character", () => {
    const result = hashCode("a");
    expect(result).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createInitialFavicon
// ---------------------------------------------------------------------------

describe("createInitialFavicon", () => {
  it("creates a span with the first letter uppercased", () => {
    const el = createInitialFavicon("github.com");
    expect(el.tagName).toBe("SPAN");
    expect(el.textContent).toBe("G");
  });

  it("strips www. prefix before picking the letter", () => {
    const el = createInitialFavicon("www.example.com");
    expect(el.textContent).toBe("E");
  });

  it("uses ? for empty hostname", () => {
    const el = createInitialFavicon("");
    expect(el.textContent).toBe("?");
  });

  it("applies qal-favicon and qal-favicon-initial classes", () => {
    const el = createInitialFavicon("test.org");
    expect(el.className).toContain("qal-favicon");
    expect(el.className).toContain("qal-favicon-initial");
  });

  it("sets a background color from the palette", () => {
    const el = createInitialFavicon("example.com");
    expect(el.style.backgroundColor).toBeTruthy();
  });

  it("assigns deterministic color for the same hostname", () => {
    const a = createInitialFavicon("example.com");
    const b = createInitialFavicon("example.com");
    expect(a.style.backgroundColor).toBe(b.style.backgroundColor);
  });

  it("assigns different colors for most different hostnames", () => {
    const hosts = ["a.com", "b.com", "c.com", "d.com", "e.com", "f.com", "g.com", "h.com"];
    const colors = new Set(hosts.map((h) => createInitialFavicon(h).style.backgroundColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// createFavicon
// ---------------------------------------------------------------------------

describe("createFavicon", () => {
  it("returns an img for tabs with favIconUrl", () => {
    const el = createFavicon(
      { favIconUrl: "https://example.com/icon.png", url: "https://example.com" },
      "tabs",
    );
    expect(el.tagName).toBe("IMG");
    expect(el.src).toContain("icon.png");
  });

  it("returns an initial span for bookmarks", () => {
    const el = createFavicon(
      { url: "https://github.com/repo" },
      "bookmarks",
    );
    expect(el.tagName).toBe("SPAN");
    expect(el.textContent).toBe("G");
  });

  it("returns an initial span for history", () => {
    const el = createFavicon(
      { url: "https://docs.python.org/3/" },
      "history",
    );
    expect(el.tagName).toBe("SPAN");
    expect(el.textContent).toBe("D");
  });

  it("returns empty span for item without url", () => {
    const el = createFavicon({}, "bookmarks");
    expect(el.tagName).toBe("SPAN");
    expect(el.className).toBe("qal-favicon");
  });

  it("returns empty span for invalid url", () => {
    const el = createFavicon({ url: "not-a-url" }, "bookmarks");
    expect(el.tagName).toBe("SPAN");
    expect(el.className).toBe("qal-favicon");
  });

  it("returns initial span for tab without favIconUrl", () => {
    const el = createFavicon(
      { url: "https://example.com" },
      "tabs",
    );
    expect(el.tagName).toBe("SPAN");
    expect(el.textContent).toBe("E");
  });
});

// ---------------------------------------------------------------------------
// createElement
// ---------------------------------------------------------------------------

describe("createElement", () => {
  it("creates element with given tag", () => {
    const el = createElement("div");
    expect(el.tagName).toBe("DIV");
  });

  it("assigns className when provided", () => {
    const el = createElement("span", "qal-test");
    expect(el.className).toBe("qal-test");
  });

  it("leaves className empty when not provided", () => {
    const el = createElement("p");
    expect(el.className).toBe("");
  });
});

// ---------------------------------------------------------------------------
// createSectionHeader
// ---------------------------------------------------------------------------

describe("createSectionHeader", () => {
  it("creates header with icon, title and count", () => {
    const header = createSectionHeader("tabs", 3);
    expect(header.querySelector(".qal-section-icon")).toBeTruthy();
    expect(header.querySelector(".qal-section-title")).toBeTruthy();
    expect(header.querySelector(".qal-section-count").textContent).toBe("3");
  });
});

// ---------------------------------------------------------------------------
// render functions
// ---------------------------------------------------------------------------

describe("renderEmpty", () => {
  it("renders empty state message into container", () => {
    const container = document.createElement("div");
    renderEmpty(container);
    expect(container.querySelector(".qal-empty-state")).toBeTruthy();
  });

  it("clears previous content", () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>old</p>";
    renderEmpty(container);
    expect(container.querySelectorAll("p").length).toBe(0);
  });
});

describe("renderLoading", () => {
  it("renders loading indicator", () => {
    const container = document.createElement("div");
    renderLoading(container);
    expect(container.querySelector(".qal-loading")).toBeTruthy();
  });
});

describe("renderError", () => {
  it("renders error state", () => {
    const container = document.createElement("div");
    renderError(container);
    expect(container.querySelector(".qal-empty-state")).toBeTruthy();
  });
});

describe("renderNoResults", () => {
  it("renders no-results message with escaped query", () => {
    const container = document.createElement("div");
    renderNoResults(container, "<script>");
    const text = container.querySelector(".qal-empty-state").innerHTML;
    expect(text).not.toContain("<script>");
  });
});

// ---------------------------------------------------------------------------
// updateSelection
// ---------------------------------------------------------------------------

describe("updateSelection", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    for (let i = 0; i < 3; i++) {
      const item = document.createElement("div");
      item.className = "qal-result-item";
      container.appendChild(item);
    }
  });

  it("sets aria-selected true on selected index", () => {
    updateSelection(container, 1);
    const items = container.querySelectorAll(".qal-result-item");
    expect(items[0].getAttribute("aria-selected")).toBe("false");
    expect(items[1].getAttribute("aria-selected")).toBe("true");
    expect(items[2].getAttribute("aria-selected")).toBe("false");
  });

  it("adds qal-selected class on selected index", () => {
    updateSelection(container, 0);
    const items = container.querySelectorAll(".qal-result-item");
    expect(items[0].classList.contains("qal-selected")).toBe(true);
    expect(items[1].classList.contains("qal-selected")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reindexItems
// ---------------------------------------------------------------------------

describe("reindexItems", () => {
  it("sets sequential data-index on all items", () => {
    const container = document.createElement("div");
    for (let i = 0; i < 3; i++) {
      const item = document.createElement("div");
      item.className = "qal-result-item";
      item.dataset.index = 99;
      container.appendChild(item);
    }
    reindexItems(container);
    const items = container.querySelectorAll(".qal-result-item");
    expect(items[0].dataset.index).toBe("0");
    expect(items[1].dataset.index).toBe("1");
    expect(items[2].dataset.index).toBe("2");
  });
});
