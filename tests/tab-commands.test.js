import { describe, it, expect, vi, beforeEach } from "vitest";

const { normalizeUrl } = require("../src/search-utils.js");

globalThis.normalizeUrl = normalizeUrl;

function createBrowserMock() {
  return {
    tabs: {
      query: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue(undefined),
      duplicate: vi.fn().mockResolvedValue({}),
      move: vi.fn().mockResolvedValue({}),
    },
    sessions: {
      getRecentlyClosed: vi.fn().mockResolvedValue([]),
      restore: vi.fn().mockResolvedValue(undefined),
    },
  };
}

let browserMock;

function loadTabCommands() {
  browserMock = createBrowserMock();
  globalThis.browser = browserMock;
  delete require.cache[require.resolve("../background/tab-commands.js")];
  return require("../background/tab-commands.js");
}

describe("executeCommand", () => {
  let mod;

  beforeEach(() => {
    mod = loadTabCommands();
  });

  it("returns success false for unknown command", async () => {
    const result = await mod.executeCommand("unknown");
    expect(result.success).toBe(false);
  });

  it("returns success true for valid command", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, active: true, pinned: false },
    ]);
    const result = await mod.executeCommand("close-other-tabs");
    expect(result.success).toBe(true);
  });
});

describe("closeOtherTabs", () => {
  let mod;

  beforeEach(() => {
    mod = loadTabCommands();
  });

  it("removes non-active non-pinned tabs", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, active: true, pinned: false },
      { id: 2, active: false, pinned: false },
      { id: 3, active: false, pinned: true },
      { id: 4, active: false, pinned: false },
    ]);

    const result = await mod.closeOtherTabs();
    expect(browserMock.tabs.remove).toHaveBeenCalledWith([2, 4]);
    expect(result.closed).toBe(2);
  });

  it("does not remove any tab when only active exists", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, active: true, pinned: false },
    ]);

    const result = await mod.closeOtherTabs();
    expect(browserMock.tabs.remove).not.toHaveBeenCalled();
    expect(result.closed).toBe(0);
  });
});

describe("findDuplicateTabs", () => {
  let mod;

  beforeEach(() => {
    mod = loadTabCommands();
  });

  it("finds tabs with same normalized URL", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, url: "https://example.com/page", active: false },
      { id: 2, url: "https://example.com/page?ref=1", active: false },
      { id: 3, url: "https://other.com", active: false },
    ]);

    const duplicates = await mod.findDuplicateTabs();
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0].dupes).toHaveLength(1);
  });

  it("keeps active tab over non-active when finding duplicates", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, url: "https://example.com", active: false },
      { id: 2, url: "https://example.com", active: true },
    ]);

    const duplicates = await mod.findDuplicateTabs();
    expect(duplicates[0].keep.id).toBe(2);
    expect(duplicates[0].dupes[0].id).toBe(1);
  });

  it("returns empty for no duplicates", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, url: "https://a.com", active: false },
      { id: 2, url: "https://b.com", active: false },
    ]);

    const duplicates = await mod.findDuplicateTabs();
    expect(duplicates).toHaveLength(0);
  });
});

describe("closeDuplicateTabs", () => {
  let mod;

  beforeEach(() => {
    mod = loadTabCommands();
  });

  it("removes duplicate tabs", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, url: "https://example.com", active: true },
      { id: 2, url: "https://example.com", active: false },
      { id: 3, url: "https://example.com", active: false },
    ]);

    const result = await mod.closeDuplicateTabs();
    expect(browserMock.tabs.remove).toHaveBeenCalledWith([2, 3]);
    expect(result.closed).toBe(2);
  });
});

describe("getDuplicateCount", () => {
  let mod;

  beforeEach(() => {
    mod = loadTabCommands();
  });

  it("returns total number of duplicate tabs", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, url: "https://a.com", active: true },
      { id: 2, url: "https://a.com", active: false },
      { id: 3, url: "https://b.com", active: false },
      { id: 4, url: "https://b.com", active: false },
    ]);

    const count = await mod.getDuplicateCount();
    expect(count).toBe(2);
  });
});

describe("toggleMuteTab", () => {
  let mod;

  beforeEach(() => {
    mod = loadTabCommands();
  });

  it("mutes the active tab", async () => {
    browserMock.tabs.query.mockResolvedValue([{ id: 5, active: true }]);
    await mod.toggleMuteTab(true);
    expect(browserMock.tabs.update).toHaveBeenCalledWith(5, { muted: true });
  });

  it("unmutes the active tab", async () => {
    browserMock.tabs.query.mockResolvedValue([{ id: 5, active: true }]);
    await mod.toggleMuteTab(false);
    expect(browserMock.tabs.update).toHaveBeenCalledWith(5, { muted: false });
  });
});

describe("togglePinTab", () => {
  let mod;

  beforeEach(() => {
    mod = loadTabCommands();
  });

  it("pins the active tab", async () => {
    browserMock.tabs.query.mockResolvedValue([{ id: 7, active: true }]);
    await mod.togglePinTab(true);
    expect(browserMock.tabs.update).toHaveBeenCalledWith(7, { pinned: true });
  });
});

describe("duplicateCurrentTab", () => {
  let mod;

  beforeEach(() => {
    mod = loadTabCommands();
  });

  it("duplicates the active tab", async () => {
    browserMock.tabs.query.mockResolvedValue([{ id: 8, active: true }]);
    await mod.duplicateCurrentTab();
    expect(browserMock.tabs.duplicate).toHaveBeenCalledWith(8);
  });
});

describe("sortTabsByTitle", () => {
  let mod;

  beforeEach(() => {
    mod = loadTabCommands();
  });

  it("sorts tabs alphabetically by title", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, title: "Zeta" },
      { id: 2, title: "Alpha" },
      { id: 3, title: "Mu" },
    ]);

    await mod.sortTabsByTitle();

    const moveCalls = browserMock.tabs.move.mock.calls;
    expect(moveCalls[0]).toEqual([2, { index: 0 }]);
    expect(moveCalls[1]).toEqual([3, { index: 1 }]);
    expect(moveCalls[2]).toEqual([1, { index: 2 }]);
  });
});

describe("closeDomainTabs", () => {
  let mod;

  beforeEach(() => {
    mod = loadTabCommands();
  });

  it("closes non-active tabs from specified domain", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, url: "https://github.com/a", active: true },
      { id: 2, url: "https://github.com/b", active: false },
      { id: 3, url: "https://other.com", active: false },
    ]);

    const result = await mod.closeDomainTabs("github.com");
    expect(browserMock.tabs.remove).toHaveBeenCalledWith([2]);
    expect(result.closed).toBe(1);
  });

  it("does not close active tab from domain", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, url: "https://github.com", active: true },
    ]);

    const result = await mod.closeDomainTabs("github.com");
    expect(browserMock.tabs.remove).not.toHaveBeenCalled();
    expect(result.closed).toBe(0);
  });
});

describe("getRecentTabs", () => {
  let mod;

  beforeEach(() => {
    mod = loadTabCommands();
  });

  it("returns recent active tabs sorted by lastAccessed", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, title: "Old", url: "https://old.com", lastAccessed: 100 },
      { id: 2, title: "New", url: "https://new.com", lastAccessed: 200 },
    ]);

    const result = await mod.getRecentTabs();
    expect(result.recentActive).toHaveLength(2);
    expect(result.recentActive[0].title).toBe("New");
  });

  it("returns recently closed tabs from sessions API", async () => {
    browserMock.sessions.getRecentlyClosed.mockResolvedValue([
      {
        tab: {
          sessionId: "s1",
          title: "Closed Tab",
          url: "https://closed.com",
          favIconUrl: null,
        },
      },
      { window: { sessionId: "w1" } },
    ]);

    const result = await mod.getRecentTabs();
    expect(result.recentlyClosed).toHaveLength(1);
    expect(result.recentlyClosed[0].title).toBe("Closed Tab");
    expect(result.recentlyClosed[0].sessionId).toBe("s1");
  });

  it("handles sessions API failure gracefully", async () => {
    browserMock.sessions.getRecentlyClosed.mockRejectedValue(
      new Error("not available"),
    );

    const result = await mod.getRecentTabs();
    expect(result.recentlyClosed).toHaveLength(0);
    expect(result.recentActive).toBeTruthy();
  });
});

describe("restoreSession", () => {
  let mod;

  beforeEach(() => {
    mod = loadTabCommands();
  });

  it("calls browser.sessions.restore with sessionId", async () => {
    await mod.restoreSession("session-123");
    expect(browserMock.sessions.restore).toHaveBeenCalledWith("session-123");
  });
});

describe("getRecentTabs - current tab left out (A2)", () => {
  let mod;

  beforeEach(() => {
    mod = loadTabCommands();
  });

  it("does not list the tab the user is on, so Enter goes back one tab", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, title: "Here", url: "https://here.com", lastAccessed: 300 },
      { id: 2, title: "Before", url: "https://before.com", lastAccessed: 200 },
    ]);

    const result = await mod.getRecentTabs(1);

    expect(result.recentActive.map((t) => t.id)).toEqual([2]);
  });

  it("keeps every tab when no current tab is given", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, title: "Here", url: "https://here.com", lastAccessed: 300 },
      { id: 2, title: "Before", url: "https://before.com", lastAccessed: 200 },
    ]);
    const result = await mod.getRecentTabs();
    expect(result.recentActive.map((t) => t.id)).toEqual([1, 2]);
  });
});

describe("getDuplicateSummary (A4)", () => {
  let mod;

  beforeEach(() => {
    mod = loadTabCommands();
  });

  it("names each duplicated page with how many extra copies it has", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, title: "PR", url: "https://gh.com/pr", active: true },
      { id: 2, title: "PR", url: "https://gh.com/pr" },
      { id: 3, title: "PR", url: "https://gh.com/pr" },
      { id: 4, title: "MDN", url: "https://mdn.org/q" },
      { id: 5, title: "MDN", url: "https://mdn.org/q" },
      { id: 6, title: "Solo", url: "https://solo.com" },
    ]);

    const summary = await mod.getDuplicateSummary();

    expect(summary.count).toBe(3);
    expect(summary.groups).toEqual([
      { title: "PR", url: "https://gh.com/pr", extra: 2 },
      { title: "MDN", url: "https://mdn.org/q", extra: 1 },
    ]);
    expect(summary.more).toBe(0);
  });

  it("lists at most three pages and counts the rest", async () => {
    const tabs = [];
    for (let i = 0; i < 5; i++) {
      tabs.push({ id: i * 2, title: `P${i}`, url: `https://p${i}.com` });
      tabs.push({ id: i * 2 + 1, title: `P${i}`, url: `https://p${i}.com` });
    }
    browserMock.tabs.query.mockResolvedValue(tabs);

    const summary = await mod.getDuplicateSummary();

    expect(summary.count).toBe(5);
    expect(summary.groups).toHaveLength(3);
    expect(summary.more).toBe(2);
  });

  it("reports nothing when there are no duplicates", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, title: "A", url: "https://a.com" },
    ]);
    expect(await mod.getDuplicateSummary()).toEqual({
      count: 0,
      groups: [],
      more: 0,
    });
  });
});

describe("previewCommand (C1)", () => {
  let mod;

  beforeEach(() => {
    mod = loadTabCommands();
  });

  it("counts the tabs Close other tabs would close, skipping pinned ones", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, active: true },
      { id: 2 },
      { id: 3, pinned: true },
      { id: 4 },
    ]);
    expect(await mod.previewCommand("close-other-tabs")).toEqual({
      affected: 2,
    });
  });

  it("counts the duplicate copies for Close duplicates", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { id: 1, url: "https://a.com", active: true },
      { id: 2, url: "https://a.com" },
    ]);
    expect(await mod.previewCommand("close-duplicates")).toEqual({
      affected: 1,
    });
  });

  it("returns zero for commands that close nothing", async () => {
    expect(await mod.previewCommand("mute-tab")).toEqual({ affected: 0 });
  });
});

describe("undoClose (R6)", () => {
  let mod;

  beforeEach(() => {
    mod = loadTabCommands();
  });

  it("reopens as many tabs as were closed", async () => {
    browserMock.sessions.restore.mockResolvedValue({ tab: {} });
    expect(await mod.undoClose(3)).toEqual({ restored: 3 });
    expect(browserMock.sessions.restore).toHaveBeenCalledTimes(3);
  });

  it("stops when there is nothing left to reopen", async () => {
    browserMock.sessions.restore
      .mockResolvedValueOnce({ tab: {} })
      .mockResolvedValueOnce(undefined);
    expect(await mod.undoClose(3)).toEqual({ restored: 1 });
  });
});

describe("getActiveTabState (C4)", () => {
  let mod;

  beforeEach(() => {
    mod = loadTabCommands();
  });

  it("reads mute and pin state from the given tab", async () => {
    expect(
      await mod.getActiveTabState({ mutedInfo: { muted: true }, pinned: false }),
    ).toEqual({ muted: true, pinned: false });
  });

  it("falls back to the active tab, and to null when there is none", async () => {
    browserMock.tabs.query.mockResolvedValueOnce([{ id: 1, pinned: true }]);
    expect(await mod.getActiveTabState()).toEqual({
      muted: false,
      pinned: true,
    });
    browserMock.tabs.query.mockResolvedValueOnce([]);
    expect(await mod.getActiveTabState()).toBeNull();
  });
});
