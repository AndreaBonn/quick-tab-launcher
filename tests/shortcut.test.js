import { describe, it, expect } from "vitest";

const { buildShortcut, shortcutToKeys } = require("../src/shortcut.js");

const key = (code, mods = {}) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe("buildShortcut (O1)", () => {
  it("builds Firefox's format from a key press", () => {
    expect(
      buildShortcut(key("Space", { ctrlKey: true, shiftKey: true }), false),
    ).toEqual({ shortcut: "Ctrl+Shift+Space" });
    expect(buildShortcut(key("KeyK", { altKey: true }), false)).toEqual({
      shortcut: "Alt+K",
    });
    expect(buildShortcut(key("Digit3", { ctrlKey: true }), false)).toEqual({
      shortcut: "Ctrl+3",
    });
    expect(buildShortcut(key("ArrowUp", { altKey: true }), false)).toEqual({
      shortcut: "Alt+Up",
    });
  });

  it("uses Command and MacCtrl on Mac", () => {
    expect(buildShortcut(key("KeyP", { metaKey: true }), true)).toEqual({
      shortcut: "Command+P",
    });
    expect(
      buildShortcut(key("Space", { ctrlKey: true, shiftKey: true }), true),
    ).toEqual({ shortcut: "MacCtrl+Shift+Space" });
  });

  it("allows a function key alone", () => {
    expect(buildShortcut(key("F2"), false)).toEqual({ shortcut: "F2" });
  });

  it("waits while only modifiers are held", () => {
    expect(buildShortcut(key("ControlLeft", { ctrlKey: true }), false)).toEqual(
      { pending: true },
    );
    expect(buildShortcut(key("ShiftLeft", { shiftKey: true }), false)).toEqual({
      pending: true,
    });
  });

  it("rejects a letter without Ctrl or Alt", () => {
    expect(buildShortcut(key("KeyA"), false)).toEqual({ error: "invalid" });
    expect(buildShortcut(key("KeyA", { shiftKey: true }), false)).toEqual({
      error: "invalid",
    });
  });

  it("rejects three modifiers and unsupported keys", () => {
    expect(
      buildShortcut(
        key("KeyA", { ctrlKey: true, altKey: true, shiftKey: true }),
        false,
      ),
    ).toEqual({ error: "invalid" });
    expect(buildShortcut(key("Semicolon", { ctrlKey: true }), false)).toEqual({
      error: "invalid",
    });
  });
});

describe("shortcutToKeys", () => {
  it("splits a shortcut into readable keys", () => {
    expect(shortcutToKeys("Ctrl+Shift+Space", false, "Spazio")).toEqual([
      "Ctrl",
      "Shift",
      "Spazio",
    ]);
  });

  it("shows Mac symbols on Mac", () => {
    expect(shortcutToKeys("MacCtrl+Shift+Space", true, "Space")).toEqual([
      "⌃",
      "⇧",
      "Space",
    ]);
    expect(shortcutToKeys("Command+P", true, "Space")).toEqual(["⌘", "P"]);
  });

  it("returns an empty list for no shortcut", () => {
    expect(shortcutToKeys("", false, "Space")).toEqual([]);
  });
});
