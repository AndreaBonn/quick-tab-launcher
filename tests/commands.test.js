import { describe, it, expect } from "vitest";

const { escapeHtml } = require("../src/search-utils.js");

globalThis.escapeHtml = escapeHtml;

const { fuzzyMatch } = require("../src/fuzzy.js");

globalThis.fuzzyMatch = fuzzyMatch;

const { t } = require("../src/i18n.js");

globalThis.t = t;

const {
  COMMANDS,
  filterCommands,
  getCommandLabel,
  getCommandDescription,
} = require("../src/commands.js");

describe("COMMANDS", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(COMMANDS)).toBe(true);
    expect(COMMANDS.length).toBeGreaterThan(0);
  });

  it("each command has id and icon", () => {
    for (const cmd of COMMANDS) {
      expect(cmd.id).toBeTruthy();
      expect(cmd.icon).toBeTruthy();
    }
  });

  it("has unique ids", () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("getCommandLabel", () => {
  it("returns translated label for known command", () => {
    const cmd = COMMANDS[0];
    const label = getCommandLabel(cmd);
    expect(label).toBeTruthy();
    expect(label).not.toBe(cmd.id);
  });
});

describe("getCommandDescription", () => {
  it("returns translated description for known command", () => {
    const cmd = COMMANDS[0];
    const desc = getCommandDescription(cmd);
    expect(desc).toBeTruthy();
  });
});

describe("filterCommands", () => {
  it("returns all commands for empty query", () => {
    const results = filterCommands("");
    expect(results).toHaveLength(COMMANDS.length);
  });

  it("returns all commands for null query", () => {
    const results = filterCommands(null);
    expect(results).toHaveLength(COMMANDS.length);
  });

  it("filters commands by fuzzy match", () => {
    const results = filterCommands("chiudi");
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.label.toLowerCase()).toContain("chiudi");
    }
  });

  it("each result has label, description, matchScore, matchIndices", () => {
    const results = filterCommands("sch");
    for (const r of results) {
      expect(r).toHaveProperty("label");
      expect(r).toHaveProperty("description");
      expect(r).toHaveProperty("matchScore");
      expect(r).toHaveProperty("matchIndices");
    }
  });

  it("sorts results by score descending", () => {
    const results = filterCommands("s");
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].matchScore).toBeGreaterThanOrEqual(
        results[i].matchScore,
      );
    }
  });

  it("returns empty for non-matching query", () => {
    const results = filterCommands("xyznonexistent");
    expect(results).toHaveLength(0);
  });

  it("matches via fuzzy: chisc matches Chiudi schede", () => {
    const results = filterCommands("chisc");
    expect(results.length).toBeGreaterThan(0);
  });

  it("preserves command id and icon in results", () => {
    const results = filterCommands("");
    for (const r of results) {
      expect(r.id).toBeTruthy();
      expect(r.icon).toBeTruthy();
    }
  });
});
