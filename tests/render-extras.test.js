import { describe, it, expect, beforeEach } from "vitest";

const {
  escapeHtml,
  highlightMatch,
  formatUrl,
  groupTabsByDomain,
} = require("../src/search-utils.js");

globalThis.escapeHtml = escapeHtml;
globalThis.highlightMatch = highlightMatch;
globalThis.formatUrl = formatUrl;
globalThis.groupTabsByDomain = groupTabsByDomain;

const { fuzzyMatch, highlightFuzzyMatch } = require("../src/fuzzy.js");

globalThis.fuzzyMatch = fuzzyMatch;
globalThis.highlightFuzzyMatch = highlightFuzzyMatch;

const { t } = require("../src/i18n.js");

globalThis.t = t;

const {
  fuzzyHighlightOrFallback,
  createResultText,
  renderCommandResults,
  renderRecentTabs,
  renderDuplicateBanner,
  renderGroupedResults,
  renderResults,
} = require("../src/render-utils.js");

describe("fuzzyHighlightOrFallback", () => {
  it("uses fuzzy highlighting when match found", () => {
    const result = fuzzyHighlightOrFallback("Facebook", "fbk");
    expect(result).toContain('<mark class="qal-highlight">');
    expect(result).toContain("F");
  });

  it("falls back to substring highlight when no fuzzy match", () => {
    const result = fuzzyHighlightOrFallback("Hello World", "world");
    expect(result).toContain('<mark class="qal-highlight">World</mark>');
  });

  it("returns escaped text for empty query", () => {
    const result = fuzzyHighlightOrFallback("<div>", "");
    expect(result).toContain("&lt;div&gt;");
  });
});

describe("createResultText", () => {
  it("creates container with title and url", () => {
    const container = createResultText(
      { title: "Test Page", url: "https://example.com/path" },
      "test",
    );
    expect(container.querySelector(".qal-result-title")).toBeTruthy();
    expect(container.querySelector(".qal-result-url")).toBeTruthy();
  });

  it("highlights fuzzy matches in title", () => {
    const container = createResultText(
      { title: "Facebook", url: "https://fb.com" },
      "fbk",
    );
    const title = container.querySelector(".qal-result-title");
    expect(title.innerHTML).toContain('<mark class="qal-highlight">');
  });
});

describe("renderCommandResults", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
  });

  it("renders command items with icons and labels", () => {
    const commands = [
      {
        id: "mute-tab",
        icon: "\uD83D\uDD07",
        label: "Silenzia scheda",
        description: "Silenzia la scheda corrente",
        matchScore: 0,
        matchIndices: null,
      },
    ];
    renderCommandResults(container, commands, "", 0);

    const items = container.querySelectorAll(".qal-command-item");
    expect(items).toHaveLength(1);
    expect(items[0].dataset.type).toBe("command");
    expect(items[0].dataset.id).toBe("mute-tab");
  });

  it("renders section header with commands count", () => {
    const commands = [
      {
        id: "a",
        icon: "x",
        label: "A",
        description: "",
        matchScore: 0,
        matchIndices: null,
      },
      {
        id: "b",
        icon: "y",
        label: "B",
        description: "",
        matchScore: 0,
        matchIndices: null,
      },
    ];
    renderCommandResults(container, commands, "", 0);

    const count = container.querySelector(".qal-section-count");
    expect(count.textContent).toBe("2");
  });

  it("renders no-results when commands array is empty", () => {
    renderCommandResults(container, [], "xyz", -1);
    expect(container.querySelector(".qal-empty-state")).toBeTruthy();
  });

  it("highlights matching characters in label", () => {
    const commands = [
      {
        id: "test",
        icon: "x",
        label: "Chiudi schede",
        description: "",
        matchScore: 5,
        matchIndices: [0, 1, 2],
      },
    ];
    renderCommandResults(container, commands, "chi", 0);

    const title = container.querySelector(".qal-result-title");
    expect(title.innerHTML).toContain('<mark class="qal-highlight">');
  });

  it("sets selection on specified index", () => {
    const commands = [
      {
        id: "a",
        icon: "x",
        label: "A",
        description: "",
        matchScore: 0,
        matchIndices: null,
      },
      {
        id: "b",
        icon: "y",
        label: "B",
        description: "",
        matchScore: 0,
        matchIndices: null,
      },
    ];
    renderCommandResults(container, commands, "", 1);

    const items = container.querySelectorAll(".qal-result-item");
    expect(items[1].classList.contains("qal-selected")).toBe(true);
    expect(items[0].classList.contains("qal-selected")).toBe(false);
  });
});

describe("renderRecentTabs", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
  });

  it("renders recent active tabs section", () => {
    renderRecentTabs(container, {
      recentActive: [
        { id: 1, title: "Tab A", url: "https://a.com", favIconUrl: null },
      ],
      recentlyClosed: [],
    });

    const section = container.querySelector(
      '.qal-section[data-section="recent-active"]',
    );
    expect(section).toBeTruthy();
    expect(section.querySelectorAll(".qal-result-item")).toHaveLength(1);
  });

  it("renders recently closed tabs section", () => {
    renderRecentTabs(container, {
      recentActive: [],
      recentlyClosed: [
        {
          id: "s1",
          title: "Closed",
          url: "https://closed.com",
          sessionId: "s1",
        },
      ],
    });

    const section = container.querySelector(
      '.qal-section[data-section="recent-closed"]',
    );
    expect(section).toBeTruthy();
  });

  it("renders both sections when both have data", () => {
    renderRecentTabs(container, {
      recentActive: [
        { id: 1, title: "Active", url: "https://a.com", favIconUrl: null },
      ],
      recentlyClosed: [
        { id: "s1", title: "Closed", url: "https://b.com", sessionId: "s1" },
      ],
    });

    const sections = container.querySelectorAll(".qal-section");
    expect(sections).toHaveLength(2);
  });

  it("renders empty state when no data", () => {
    renderRecentTabs(container, {
      recentActive: [],
      recentlyClosed: [],
    });

    expect(container.querySelector(".qal-empty-state")).toBeTruthy();
  });

  it("assigns sequential indices across sections", () => {
    renderRecentTabs(container, {
      recentActive: [
        { id: 1, title: "A", url: "https://a.com" },
        { id: 2, title: "B", url: "https://b.com" },
      ],
      recentlyClosed: [
        { id: "s1", title: "C", url: "https://c.com", sessionId: "s1" },
      ],
    });

    const items = container.querySelectorAll(".qal-result-item");
    expect(items[0].dataset.index).toBe("0");
    expect(items[1].dataset.index).toBe("1");
    expect(items[2].dataset.index).toBe("2");
  });
});

describe("renderDuplicateBanner", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
  });

  it("renders banner with count and action button", () => {
    renderDuplicateBanner(container, 3);
    const banner = container.querySelector(".qal-duplicate-banner");
    expect(banner).toBeTruthy();
    expect(banner.querySelector(".qal-duplicate-text").textContent).toContain(
      "3",
    );
    expect(banner.querySelector(".qal-duplicate-action")).toBeTruthy();
  });

  it("inserts banner at top of container", () => {
    container.appendChild(document.createElement("div"));
    renderDuplicateBanner(container, 2);
    expect(container.firstChild.className).toBe("qal-duplicate-banner");
  });

  it("does not render for count <= 0", () => {
    renderDuplicateBanner(container, 0);
    expect(container.querySelector(".qal-duplicate-banner")).toBeNull();
  });

  it("removes existing banner before adding new one", () => {
    renderDuplicateBanner(container, 2);
    renderDuplicateBanner(container, 5);
    const banners = container.querySelectorAll(".qal-duplicate-banner");
    expect(banners).toHaveLength(1);
    expect(
      banners[0].querySelector(".qal-duplicate-text").textContent,
    ).toContain("5");
  });
});

describe("renderGroupedResults", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
  });

  it("groups tabs by domain", () => {
    const results = {
      tabs: [
        { id: 1, title: "GH 1", url: "https://github.com/a", favIconUrl: null },
        { id: 2, title: "GH 2", url: "https://github.com/b", favIconUrl: null },
        { id: 3, title: "SO", url: "https://stackoverflow.com/q", favIconUrl: null },
      ],
      bookmarks: [],
      history: [],
    };

    renderGroupedResults(container, results, "", 0);

    const domainGroups = container.querySelectorAll(".qal-domain-group");
    expect(domainGroups).toHaveLength(2);
  });

  it("shows domain label in group header", () => {
    const results = {
      tabs: [
        { id: 1, title: "T", url: "https://github.com", favIconUrl: null },
      ],
      bookmarks: [],
      history: [],
    };

    renderGroupedResults(container, results, "", 0);

    const label = container.querySelector(".qal-domain-label");
    expect(label.textContent).toBe("github.com");
  });

  it("shows close-all button with domain data attribute", () => {
    const results = {
      tabs: [
        { id: 1, title: "T", url: "https://test.com", favIconUrl: null },
      ],
      bookmarks: [],
      history: [],
    };

    renderGroupedResults(container, results, "", 0);

    const closeBtn = container.querySelector(".qal-domain-close-all");
    expect(closeBtn).toBeTruthy();
    expect(closeBtn.dataset.domain).toBe("test.com");
  });

  it("renders bookmarks and history sections normally", () => {
    const results = {
      tabs: [],
      bookmarks: [{ id: "b1", title: "BM", url: "https://bm.com" }],
      history: [{ id: "h1", title: "H", url: "https://h.com" }],
    };

    renderGroupedResults(container, results, "", 0);

    const sections = container.querySelectorAll(".qal-section");
    expect(sections).toHaveLength(2);
  });

  it("shows no-results for empty results", () => {
    renderGroupedResults(
      container,
      { tabs: [], bookmarks: [], history: [] },
      "test",
      -1,
    );
    expect(container.querySelector(".qal-empty-state")).toBeTruthy();
  });

  it("maintains correct global indexing across domain groups", () => {
    const results = {
      tabs: [
        { id: 1, title: "A", url: "https://a.com", favIconUrl: null },
        { id: 2, title: "B", url: "https://b.com", favIconUrl: null },
      ],
      bookmarks: [{ id: "b1", title: "C", url: "https://c.com" }],
      history: [],
    };

    renderGroupedResults(container, results, "", 0);

    const items = container.querySelectorAll(".qal-result-item");
    expect(items[0].dataset.index).toBe("0");
    expect(items[1].dataset.index).toBe("1");
    expect(items[2].dataset.index).toBe("2");
  });
});

describe("groupTabsByDomain", () => {
  it("groups tabs by hostname", () => {
    const tabs = [
      { url: "https://github.com/a" },
      { url: "https://github.com/b" },
      { url: "https://google.com" },
    ];

    const groups = groupTabsByDomain(tabs);
    expect(groups).toHaveLength(2);
    expect(groups[0].domain).toBe("github.com");
    expect(groups[0].tabs).toHaveLength(2);
    expect(groups[1].domain).toBe("google.com");
  });

  it("handles invalid URLs", () => {
    const tabs = [{ url: "not-a-url" }];
    const groups = groupTabsByDomain(tabs);
    expect(groups[0].domain).toBe("other");
  });

  it("handles empty array", () => {
    expect(groupTabsByDomain([])).toHaveLength(0);
  });

  it("preserves tab order within groups", () => {
    const tabs = [
      { id: 1, url: "https://a.com/first" },
      { id: 2, url: "https://a.com/second" },
    ];
    const groups = groupTabsByDomain(tabs);
    expect(groups[0].tabs[0].id).toBe(1);
    expect(groups[0].tabs[1].id).toBe(2);
  });
});

describe("renderResults with fuzzy highlighting", () => {
  it("highlights fuzzy matches in tab titles", () => {
    const container = document.createElement("div");
    const results = {
      tabs: [
        { id: 1, title: "Facebook", url: "https://fb.com", favIconUrl: null },
      ],
      bookmarks: [],
      history: [],
    };

    renderResults(container, results, "fbk", 0);

    const title = container.querySelector(".qal-result-title");
    expect(title.innerHTML).toContain('<mark class="qal-highlight">');
  });
});
