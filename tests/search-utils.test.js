import { describe, it, expect } from "vitest";

const {
  QAL_CONFIG,
  escapeHtml,
  escapeRegExp,
  highlightMatch,
  formatUrl,
  deduplicateResults,
  normalizeUrl,
  buildFlatResults,
} = require("../src/search-utils.js");

describe("QAL_CONFIG", () => {
  it("has expected default values", () => {
    expect(QAL_CONFIG.MAX_TAB_RESULTS).toBe(5);
    expect(QAL_CONFIG.MAX_BOOKMARK_RESULTS).toBe(5);
    expect(QAL_CONFIG.MAX_HISTORY_RESULTS).toBe(5);
    expect(QAL_CONFIG.DEBOUNCE_MS).toBe(80);
    expect(QAL_CONFIG.HISTORY_DAYS).toBe(30);
    expect(QAL_CONFIG.MIN_QUERY_LENGTH_EXTENDED).toBe(2);
    expect(QAL_CONFIG.LOADING_THRESHOLD_MS).toBe(300);
  });
});

describe("escapeHtml", () => {
  it("escapes all dangerous characters", () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
    );
  });

  it("escapes ampersands", () => {
    expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
  });

  it("escapes single quotes", () => {
    expect(escapeHtml("it's")).toBe("it&#039;s");
  });

  it("returns empty string for null/undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml("")).toBe("");
  });

  it("passes through safe strings unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});

describe("escapeRegExp", () => {
  it("escapes regex special characters", () => {
    expect(escapeRegExp("foo.bar*baz")).toBe("foo\\.bar\\*baz");
  });

  it("escapes all regex metacharacters", () => {
    const input = ".*+?^${}()|[]\\";
    const result = escapeRegExp(input);
    expect(() => new RegExp(result)).not.toThrow();
  });

  it("leaves alphanumeric strings unchanged", () => {
    expect(escapeRegExp("foobar123")).toBe("foobar123");
  });
});

describe("highlightMatch", () => {
  it("wraps matching substring in mark tag", () => {
    expect(highlightMatch("Hello World", "world")).toBe(
      'Hello <mark class="qal-highlight">World</mark>'
    );
  });

  it("is case-insensitive", () => {
    expect(highlightMatch("GitHub", "git")).toBe(
      '<mark class="qal-highlight">Git</mark>Hub'
    );
  });

  it("highlights multiple occurrences", () => {
    const result = highlightMatch("test a test", "test");
    expect(result).toBe(
      '<mark class="qal-highlight">test</mark> a <mark class="qal-highlight">test</mark>'
    );
  });

  it("escapes HTML in text before highlighting", () => {
    const result = highlightMatch("<b>bold</b>", "bold");
    expect(result).toContain("&lt;b&gt;");
    expect(result).toContain('<mark class="qal-highlight">bold</mark>');
  });

  it("handles regex special chars in query", () => {
    const result = highlightMatch("price: $100.00", "$100");
    expect(result).toContain('<mark class="qal-highlight">$100</mark>');
  });

  it("returns escaped text when query is empty", () => {
    expect(highlightMatch("foo <bar>", "")).toBe("foo &lt;bar&gt;");
  });

  it("returns empty string for null text", () => {
    expect(highlightMatch(null, "query")).toBe("");
  });

  it("returns escaped text for null query", () => {
    expect(highlightMatch("foo", null)).toBe("foo");
  });
});

describe("formatUrl", () => {
  it("extracts hostname and path", () => {
    expect(formatUrl("https://example.com/path/to/page")).toBe(
      "example.com/path/to/page"
    );
  });

  it("strips trailing slash from root URL", () => {
    expect(formatUrl("https://example.com/")).toBe("example.com");
  });

  it("preserves subdomains", () => {
    expect(formatUrl("https://docs.example.com/api")).toBe(
      "docs.example.com/api"
    );
  });

  it("returns empty string for null/undefined", () => {
    expect(formatUrl(null)).toBe("");
    expect(formatUrl(undefined)).toBe("");
    expect(formatUrl("")).toBe("");
  });

  it("returns raw string for invalid URL", () => {
    expect(formatUrl("not-a-url")).toBe("not-a-url");
  });
});

describe("normalizeUrl", () => {
  it("strips query params and fragments", () => {
    expect(normalizeUrl("https://example.com/page?q=1#section")).toBe(
      "https://example.com/page"
    );
  });

  it("strips trailing slash", () => {
    expect(normalizeUrl("https://example.com/")).toBe(
      "https://example.com"
    );
  });

  it("returns empty string for null/undefined", () => {
    expect(normalizeUrl(null)).toBe("");
    expect(normalizeUrl(undefined)).toBe("");
    expect(normalizeUrl("")).toBe("");
  });

  it("handles invalid URLs by stripping trailing slash", () => {
    expect(normalizeUrl("not-a-url/")).toBe("not-a-url");
  });

  it("treats http and https as different", () => {
    expect(normalizeUrl("http://example.com")).not.toBe(
      normalizeUrl("https://example.com")
    );
  });
});

describe("deduplicateResults", () => {
  const tabs = [
    { id: 1, title: "Tab 1", url: "https://example.com/page" },
    { id: 2, title: "Tab 2", url: "https://other.com" },
  ];

  it("removes bookmarks that match tab URLs", () => {
    const bookmarks = [
      { id: "b1", title: "Bookmark 1", url: "https://example.com/page" },
      { id: "b2", title: "Bookmark 2", url: "https://unique.com" },
    ];
    const result = deduplicateResults(tabs, bookmarks, []);
    expect(result.bookmarks).toHaveLength(1);
    expect(result.bookmarks[0].id).toBe("b2");
  });

  it("removes history that matches tab or bookmark URLs", () => {
    const bookmarks = [
      { id: "b1", title: "BM", url: "https://unique.com" },
    ];
    const history = [
      { id: "h1", title: "H1", url: "https://example.com/page" },
      { id: "h2", title: "H2", url: "https://unique.com" },
      { id: "h3", title: "H3", url: "https://brand-new.com" },
    ];
    const result = deduplicateResults(tabs, bookmarks, history);
    expect(result.history).toHaveLength(1);
    expect(result.history[0].id).toBe("h3");
  });

  it("keeps all tabs unchanged", () => {
    const result = deduplicateResults(tabs, [], []);
    expect(result.tabs).toHaveLength(2);
    expect(result.tabs).toBe(tabs);
  });

  it("handles empty inputs", () => {
    const result = deduplicateResults([], [], []);
    expect(result.tabs).toHaveLength(0);
    expect(result.bookmarks).toHaveLength(0);
    expect(result.history).toHaveLength(0);
  });

  it("deduplicates ignoring query params", () => {
    const bookmarks = [
      { id: "b1", title: "BM", url: "https://example.com/page?ref=bm" },
    ];
    const result = deduplicateResults(tabs, bookmarks, []);
    expect(result.bookmarks).toHaveLength(0);
  });
});

describe("buildFlatResults", () => {
  it("concatenates tabs, bookmarks, history with type annotation", () => {
    const results = {
      tabs: [{ id: 1, title: "T1" }],
      bookmarks: [{ id: "b1", title: "B1" }],
      history: [{ id: "h1", title: "H1" }],
    };
    const flat = buildFlatResults(results);
    expect(flat).toHaveLength(3);
    expect(flat[0].type).toBe("tab");
    expect(flat[1].type).toBe("bookmark");
    expect(flat[2].type).toBe("history");
  });

  it("preserves original item properties", () => {
    const results = {
      tabs: [{ id: 1, title: "T1", url: "https://a.com" }],
      bookmarks: [],
      history: [],
    };
    const flat = buildFlatResults(results);
    expect(flat[0].id).toBe(1);
    expect(flat[0].title).toBe("T1");
    expect(flat[0].url).toBe("https://a.com");
  });

  it("returns empty array for empty results", () => {
    expect(buildFlatResults({ tabs: [], bookmarks: [], history: [] })).toEqual(
      []
    );
  });

  it("maintains order: tabs first, then bookmarks, then history", () => {
    const results = {
      tabs: [{ id: 1 }],
      bookmarks: [{ id: 2 }],
      history: [{ id: 3 }],
    };
    const flat = buildFlatResults(results);
    expect(flat.map((r) => r.type)).toEqual(["tab", "bookmark", "history"]);
  });
});
