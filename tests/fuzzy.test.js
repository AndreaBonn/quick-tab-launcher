import { describe, it, expect } from "vitest";

const { escapeHtml } = require("../src/search-utils.js");

// Expose escapeHtml as global for highlightFuzzyMatch
globalThis.escapeHtml = escapeHtml;

const {
  fuzzyMatch,
  fuzzyScore,
  highlightFuzzyMatch,
  FUZZY_BONUS_CONSECUTIVE,
  FUZZY_BONUS_WORD_BOUNDARY,
  FUZZY_BONUS_BASE,
} = require("../src/fuzzy.js");

describe("fuzzyMatch", () => {
  it("matches exact substring", () => {
    const result = fuzzyMatch("Facebook", "face");
    expect(result).not.toBeNull();
    expect(result.indices).toEqual([0, 1, 2, 3]);
  });

  it("matches non-consecutive characters", () => {
    const result = fuzzyMatch("Facebook", "fbk");
    expect(result).not.toBeNull();
    expect(result.indices).toHaveLength(3);
  });

  it("matches case-insensitively", () => {
    const result = fuzzyMatch("GitHub", "git");
    expect(result).not.toBeNull();
    expect(result.indices).toEqual([0, 1, 2]);
  });

  it("finds capitalized Tag when searching lowercase tag", () => {
    const result = fuzzyMatch("Tag Manager", "tag");
    expect(result).not.toBeNull();
    expect(result.indices).toEqual([0, 1, 2]);
  });

  it("finds lowercase tag when searching uppercase TAG", () => {
    const result = fuzzyMatch("price tag label", "TAG");
    expect(result).not.toBeNull();
  });

  it("returns null when query does not match", () => {
    expect(fuzzyMatch("Hello", "xyz")).toBeNull();
  });

  it("returns null when query is longer than text", () => {
    expect(fuzzyMatch("ab", "abc")).toBeNull();
  });

  it("returns null for empty query", () => {
    expect(fuzzyMatch("text", "")).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(fuzzyMatch("", "query")).toBeNull();
  });

  it("returns null for null inputs", () => {
    expect(fuzzyMatch(null, "q")).toBeNull();
    expect(fuzzyMatch("t", null)).toBeNull();
  });

  it("scores consecutive matches higher than isolated", () => {
    const consecutive = fuzzyMatch("abcdef", "abc");
    const isolated = fuzzyMatch("axbxcx", "abc");
    expect(consecutive.score).toBeGreaterThan(isolated.score);
  });

  it("scores word boundary matches higher than mid-word", () => {
    const boundary = fuzzyMatch("hello-world", "w");
    const midWord = fuzzyMatch("showdown", "w");
    expect(boundary.score).toBeGreaterThan(midWord.score);
  });

  it("gives word boundary bonus for first character", () => {
    const result = fuzzyMatch("hello", "h");
    expect(result.score).toBe(FUZZY_BONUS_WORD_BOUNDARY);
  });

  it("gives consecutive bonus for adjacent matches", () => {
    const result = fuzzyMatch("abc", "ab");
    expect(result.score).toBe(
      FUZZY_BONUS_WORD_BOUNDARY + FUZZY_BONUS_CONSECUTIVE,
    );
  });

  it("gives base bonus for isolated mid-word match", () => {
    const result = fuzzyMatch("abcdef", "d");
    expect(result.score).toBe(FUZZY_BONUS_BASE);
  });

  it("handles special regex characters in query", () => {
    const result = fuzzyMatch("price $100", "$1");
    expect(result).not.toBeNull();
  });

  it("finds Gmail with gml", () => {
    const result = fuzzyMatch("Gmail - Inbox", "gml");
    expect(result).not.toBeNull();
  });

  it("matches word boundary after various separators", () => {
    const dot = fuzzyMatch("foo.bar", "b");
    const slash = fuzzyMatch("foo/bar", "b");
    const underscore = fuzzyMatch("foo_bar", "b");
    const space = fuzzyMatch("foo bar", "b");

    expect(dot.score).toBe(FUZZY_BONUS_WORD_BOUNDARY);
    expect(slash.score).toBe(FUZZY_BONUS_WORD_BOUNDARY);
    expect(underscore.score).toBe(FUZZY_BONUS_WORD_BOUNDARY);
    expect(space.score).toBe(FUZZY_BONUS_WORD_BOUNDARY);
  });
});

describe("fuzzyScore", () => {
  it("returns score from title match", () => {
    const result = fuzzyScore(
      { title: "Facebook", url: "https://other.com" },
      "face",
    );
    expect(result).not.toBeNull();
    expect(result.score).toBeGreaterThan(0);
  });

  it("returns score from URL match when title does not match", () => {
    const result = fuzzyScore(
      { title: "My Page", url: "https://facebook.com" },
      "face",
    );
    expect(result).not.toBeNull();
    expect(result.score).toBeGreaterThan(0);
  });

  it("returns best score between title and URL", () => {
    const result = fuzzyScore(
      { title: "Facebook Home", url: "https://facebook.com" },
      "face",
    );
    expect(result).not.toBeNull();
    expect(result.score).toBeGreaterThan(0);
  });

  it("returns null when neither title nor URL match", () => {
    const result = fuzzyScore(
      { title: "Hello", url: "https://world.com" },
      "xyz",
    );
    expect(result).toBeNull();
  });

  it("handles missing title and url", () => {
    const result = fuzzyScore({}, "query");
    expect(result).toBeNull();
  });
});

describe("highlightFuzzyMatch", () => {
  it("highlights matched characters", () => {
    const result = highlightFuzzyMatch("Facebook", [0, 4, 7]);
    expect(result).toContain('<mark class="qal-highlight">F</mark>');
    expect(result).toContain('<mark class="qal-highlight">b</mark>');
    expect(result).toContain('<mark class="qal-highlight">k</mark>');
  });

  it("groups consecutive matches in one mark tag", () => {
    const result = highlightFuzzyMatch("Hello", [0, 1, 2]);
    expect(result).toBe('<mark class="qal-highlight">Hel</mark>lo');
  });

  it("escapes HTML in text", () => {
    const result = highlightFuzzyMatch("<script>", [0]);
    expect(result).toContain("&lt;");
    expect(result).not.toContain("<script>");
  });

  it("returns escaped text for empty indices", () => {
    const result = highlightFuzzyMatch("Hello", []);
    expect(result).toBe("Hello");
  });

  it("returns empty string for null text", () => {
    expect(highlightFuzzyMatch(null, [0])).toBe("");
  });

  it("returns escaped text for null indices", () => {
    expect(highlightFuzzyMatch("Hello", null)).toBe("Hello");
  });

  it("handles single character text", () => {
    const result = highlightFuzzyMatch("A", [0]);
    expect(result).toBe('<mark class="qal-highlight">A</mark>');
  });

  it("handles multiple non-consecutive groups", () => {
    const result = highlightFuzzyMatch("abcdef", [0, 1, 3, 4]);
    expect(result).toBe(
      '<mark class="qal-highlight">ab</mark>c<mark class="qal-highlight">de</mark>f',
    );
  });
});
