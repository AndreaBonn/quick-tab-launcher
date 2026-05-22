/**
 * Tab command execution handlers for Quick Actions.
 * Operates on browser.tabs / browser.sessions API.
 */

/* global browser, normalizeUrl */

async function executeCommand(commandId) {
  const handlers = {
    "close-other-tabs": closeOtherTabs,
    "close-duplicates": closeDuplicateTabs,
    "mute-tab": () => toggleMuteTab(true),
    "unmute-tab": () => toggleMuteTab(false),
    "pin-tab": () => togglePinTab(true),
    "unpin-tab": () => togglePinTab(false),
    "duplicate-tab": duplicateCurrentTab,
    "sort-tabs-title": sortTabsByTitle,
  };

  const handler = handlers[commandId];
  if (!handler) return { success: false, error: "Unknown command" };

  try {
    const result = (await handler()) || {};
    return { success: true, ...result };
  } catch (err) {
    console.log("Quick Actions: command failed", commandId, err.message);
    return { success: false, error: err.message };
  }
}

async function getActiveTab() {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  return tab;
}

async function closeOtherTabs() {
  const tabs = await browser.tabs.query({ currentWindow: true });
  const toClose = tabs.filter((t) => !t.active && !t.pinned).map((t) => t.id);
  if (toClose.length > 0) await browser.tabs.remove(toClose);
  return { closed: toClose.length };
}

async function findDuplicateTabs() {
  const tabs = await browser.tabs.query({});
  const groups = new Map();

  for (const tab of tabs) {
    const key = normalizeUrl(tab.url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tab);
  }

  const duplicates = [];
  for (const [, tabGroup] of groups) {
    if (tabGroup.length <= 1) continue;
    const keep = tabGroup.find((t) => t.active) || tabGroup[0];
    const dupes = tabGroup.filter((t) => t.id !== keep.id);
    duplicates.push({ keep, dupes });
  }

  return duplicates;
}

async function closeDuplicateTabs() {
  const duplicates = await findDuplicateTabs();
  const toClose = duplicates.flatMap((g) => g.dupes.map((t) => t.id));
  if (toClose.length > 0) await browser.tabs.remove(toClose);
  return { closed: toClose.length };
}

async function getDuplicateCount() {
  const duplicates = await findDuplicateTabs();
  return duplicates.reduce((sum, g) => sum + g.dupes.length, 0);
}

async function toggleMuteTab(muted) {
  const tab = await getActiveTab();
  if (tab) await browser.tabs.update(tab.id, { muted });
}

async function togglePinTab(pinned) {
  const tab = await getActiveTab();
  if (tab) await browser.tabs.update(tab.id, { pinned });
}

async function duplicateCurrentTab() {
  const tab = await getActiveTab();
  if (tab) await browser.tabs.duplicate(tab.id);
}

async function sortTabsByTitle() {
  const tabs = await browser.tabs.query({
    currentWindow: true,
    pinned: false,
  });
  const sorted = [...tabs].sort((a, b) =>
    (a.title || "").localeCompare(b.title || ""),
  );
  for (let i = 0; i < sorted.length; i++) {
    await browser.tabs.move(sorted[i].id, { index: i });
  }
}

async function closeDomainTabs(domain) {
  const tabs = await browser.tabs.query({});
  const toClose = tabs
    .filter((tab) => {
      try {
        return new URL(tab.url).hostname === domain;
      } catch {
        return false;
      }
    })
    .filter((tab) => !tab.active)
    .map((tab) => tab.id);
  if (toClose.length > 0) await browser.tabs.remove(toClose);
  return { closed: toClose.length };
}

async function getRecentTabs() {
  const [recentActive, recentlyClosed] = await Promise.all([
    browser.tabs.query({}).then((tabs) =>
      [...tabs]
        .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))
        .slice(0, 8)
        .map((tab) => ({
          id: tab.id,
          title: tab.title || "",
          url: tab.url || "",
          favIconUrl: tab.favIconUrl || null,
        })),
    ),
    browser.sessions
      .getRecentlyClosed({ maxResults: 8 })
      .then((sessions) =>
        sessions
          .filter((s) => s.tab)
          .map((s) => ({
            id: s.tab.sessionId || s.tab.url,
            title: s.tab.title || "",
            url: s.tab.url || "",
            favIconUrl: s.tab.favIconUrl || null,
            sessionId: s.tab.sessionId,
          })),
      )
      .catch(() => []),
  ]);

  return { recentActive, recentlyClosed };
}

async function restoreSession(sessionId) {
  await browser.sessions.restore(sessionId);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    executeCommand,
    findDuplicateTabs,
    closeDuplicateTabs,
    getDuplicateCount,
    closeOtherTabs,
    toggleMuteTab,
    togglePinTab,
    duplicateCurrentTab,
    sortTabsByTitle,
    closeDomainTabs,
    getRecentTabs,
    restoreSession,
  };
}
