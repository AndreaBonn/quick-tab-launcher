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
  isCommandApplicable,
  matchCommandsForSearch,
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

describe("command groups (C3)", () => {
  it("lists whole-window actions before current-tab actions", () => {
    const groups = COMMANDS.map((c) => c.group);
    expect(new Set(groups)).toEqual(new Set(["tabs", "current"]));
    expect(groups.indexOf("current")).toBeGreaterThan(
      groups.lastIndexOf("tabs"),
    );
  });

  it("asks for confirmation only on commands that close several tabs (C1)", () => {
    const confirmed = COMMANDS.filter((c) => c.confirm).map((c) => c.id);
    expect(confirmed.sort()).toEqual(["close-duplicates", "close-other-tabs"]);
  });
});

describe("isCommandApplicable (C4)", () => {
  const byId = (id) => COMMANDS.find((c) => c.id === id);

  it("offers Mute on an audible tab and hides Unmute", () => {
    const tab = { muted: false, pinned: false };
    expect(isCommandApplicable(byId("mute-tab"), tab)).toBe(true);
    expect(isCommandApplicable(byId("unmute-tab"), tab)).toBe(false);
  });

  it("offers Unmute and Unpin on a muted pinned tab", () => {
    const tab = { muted: true, pinned: true };
    expect(isCommandApplicable(byId("unmute-tab"), tab)).toBe(true);
    expect(isCommandApplicable(byId("mute-tab"), tab)).toBe(false);
    expect(isCommandApplicable(byId("unpin-tab"), tab)).toBe(true);
    expect(isCommandApplicable(byId("pin-tab"), tab)).toBe(false);
  });

  it("shows every command when the tab state is unknown", () => {
    for (const cmd of COMMANDS) {
      expect(isCommandApplicable(cmd, null)).toBe(true);
    }
  });

  it("filterCommands drops the non-applicable toggle", () => {
    const ids = filterCommands("", { muted: false, pinned: false }).map(
      (c) => c.id,
    );
    expect(ids).toContain("mute-tab");
    expect(ids).not.toContain("unmute-tab");
    expect(ids).not.toContain("unpin-tab");
  });
});

describe("matchCommandsForSearch (R7)", () => {
  it("finds an action by a word of its label without the > prefix", () => {
    const ids = matchCommandsForSearch("silenzia", null).map((c) => c.id);
    expect(ids).toEqual(["mute-tab"]);
  });

  it("matches word starts, case-insensitive", () => {
    const ids = matchCommandsForSearch("Duplica", null).map((c) => c.id);
    expect(ids).toContain("duplicate-tab");
  });

  it("ignores short queries to keep normal searches clean", () => {
    expect(matchCommandsForSearch("ch", null)).toEqual([]);
  });

  it("does not match scattered letters the way fuzzy search would", () => {
    expect(matchCommandsForSearch("git", null)).toEqual([]);
    expect(matchCommandsForSearch("chisc", null)).toEqual([]);
  });

  it("respects the current tab state", () => {
    const ids = matchCommandsForSearch("scheda", {
      muted: false,
      pinned: false,
    }).map((c) => c.id);
    expect(ids).toContain("mute-tab");
    expect(ids).not.toContain("unmute-tab");
  });
});
