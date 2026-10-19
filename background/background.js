/* global browser, QAL_CONFIG, QAL_CONFIG_DEFAULTS, loadUserConfig, mergeWithDefaults, applyConfigToGlobal, CONFIG_STORAGE_KEY, fuzzyScore, deduplicateResults, executeCommand, getRecentTabs, restoreSession, closeDomainTabs, closeDuplicateTabs, getDuplicateSummary, previewCommand, undoClose, getActiveTabState */

const PRODUCT_NAME = "Quick Tab Launcher";
const TOGGLE_COMMAND = "toggle-launcher";

const PRIVILEGED_URL_PATTERNS = [
  /^about:/,
  /^moz-extension:/,
  /^file:/,
  /^chrome:/,
  /^resource:/,
  /^data:/,
  /^javascript:/i,
  /^vbscript:/i,
  // Firefox blocks content scripts on the add-ons site.
  /^https:\/\/addons\.mozilla\.org\//,
];

// Read synchronously by the shortcut handler: openPopup() only works while
// the keyboard shortcut still counts as a user action, i.e. before any await.
let isActiveTabPrivileged = false;

function isPrivilegedUrl(url) {
  if (!url) return true;
  return PRIVILEGED_URL_PATTERNS.some((pattern) => pattern.test(url));
}

async function updatePopupForTab(tabId) {
  try {
    const tab = await browser.tabs.get(tabId);
    isActiveTabPrivileged = isPrivilegedUrl(tab.url);
    if (isActiveTabPrivileged) {
      await browser.browserAction.setPopup({ popup: "popup/popup.html" });
    } else {
      await browser.browserAction.setPopup({ popup: "" });
    }
  } catch (err) {
    console.warn("Quick TAB Launcher: popup update failed", err);
  }
}

async function initConfig() {
  const userConfig = await loadUserConfig();
  const merged = mergeWithDefaults(QAL_CONFIG_DEFAULTS, userConfig);
  applyConfigToGlobal(QAL_CONFIG, merged);
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[CONFIG_STORAGE_KEY]) return;
  const userConfig = changes[CONFIG_STORAGE_KEY].newValue ?? {};
  const merged = mergeWithDefaults(QAL_CONFIG_DEFAULTS, userConfig);
  applyConfigToGlobal(QAL_CONFIG, merged);
});

initConfig();

async function resolveCurrentTabId(sender) {
  if (sender.tab?.id) return sender.tab.id;
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  return activeTab?.id;
}

// Tabs opened before install or update have no content script yet: inject
// the same files the manifest declares, in the same order.
async function injectLauncher(tabId) {
  const [contentScript] = browser.runtime.getManifest().content_scripts;
  for (const file of contentScript.js) {
    await browser.tabs.executeScript(tabId, { file });
  }
}

async function toggleLauncher() {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!activeTab?.id) return;
  try {
    await browser.tabs.sendMessage(activeTab.id, { action: "toggle" });
  } catch {
    // Tab opened before install: no content script yet, inject and retry.
    try {
      await injectLauncher(activeTab.id);
      await browser.tabs.sendMessage(activeTab.id, { action: "toggle" });
    } catch (err) {
      console.log("Quick TAB Launcher: pagina non supportata", err.message);
    }
  }
}

// Lets the welcome page confirm that the user found the shortcut. Nobody may
// be listening, which is fine.
function announceShortcutUsed() {
  browser.runtime
    .sendMessage({ action: "shortcut-used" })
    .catch(() => undefined);
}

browser.commands.onCommand.addListener(async (command) => {
  if (command !== TOGGLE_COMMAND) return;
  if (isActiveTabPrivileged) {
    browser.browserAction.openPopup().catch((err) => {
      console.log("Quick TAB Launcher: popup non aperto", err.message);
    });
    announceShortcutUsed();
    return;
  }
  announceShortcutUsed();
  await toggleLauncher();
});

const WELCOME_PAGE = "welcome/welcome.html";

browser.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== "install") return;
  try {
    await browser.tabs.create({ url: browser.runtime.getURL(WELCOME_PAGE) });
  } catch (err) {
    console.warn("Quick TAB Launcher: welcome page not opened", err);
  }
});

async function refreshActionTitle() {
  try {
    const commands = await browser.commands.getAll();
    const shortcut = commands.find((c) => c.name === TOGGLE_COMMAND)?.shortcut;
    const title = shortcut ? `${PRODUCT_NAME} (${shortcut})` : PRODUCT_NAME;
    await browser.browserAction.setTitle({ title });
  } catch (err) {
    console.warn("Quick TAB Launcher: title update failed", err);
  }
}

refreshActionTitle();

browser.browserAction.onClicked.addListener(async () => {
  await toggleLauncher();
});

browser.tabs.onActivated.addListener((activeInfo) => {
  updatePopupForTab(activeInfo.tabId);
});

// The privileged-page flag follows the active tab of the focused window.
browser.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === browser.windows.WINDOW_ID_NONE) return;
  const [activeTab] = await browser.tabs.query({ active: true, windowId });
  if (activeTab?.id) updatePopupForTab(activeTab.id);
});

browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (activeTab?.id === tabId) {
    updatePopupForTab(tabId);
  }
});

browser.tabs
  .query({ active: true, currentWindow: true })
  .then(([activeTab]) => {
    if (activeTab?.id) updatePopupForTab(activeTab.id);
  });

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "search") {
    const senderWindowId = sender.tab?.windowId;
    handleSearch(message.query, senderWindowId).then(sendResponse);
    return true;
  }

  if (message.action === "navigate") {
    handleNavigate(message, sender.tab?.id);
    return false;
  }

  if (message.action === "close-tab") {
    handleCloseTab(message.tabId).then((ok) =>
      sendResponse({ closed: ok ? 1 : 0 }),
    );
    return true;
  }

  if (message.action === "get-recent-tabs") {
    resolveCurrentTabId(sender)
      .then((tabId) => getRecentTabs(tabId))
      .then(sendResponse);
    return true;
  }

  if (message.action === "get-active-tab-state") {
    getActiveTabState(sender.tab).then(sendResponse);
    return true;
  }

  if (message.action === "preview-command") {
    previewCommand(message.commandId).then(sendResponse);
    return true;
  }

  if (message.action === "undo-close") {
    undoClose(message.count).then(sendResponse);
    return true;
  }

  if (message.action === "get-web-search-state") {
    hasWebSearchPermission().then((enabled) => sendResponse({ enabled }));
    return true;
  }

  if (message.action === "web-search") {
    runWebSearch(message, sender.tab?.id).then((ok) => sendResponse({ ok }));
    return true;
  }

  if (message.action === "open-options") {
    browser.runtime.openOptionsPage();
    return false;
  }

  if (message.action === "refresh-action-title") {
    refreshActionTitle();
    return false;
  }

  if (message.action === "restore-session") {
    restoreSession(message.sessionId);
    return false;
  }

  if (message.action === "get-duplicate-count") {
    getDuplicateSummary().then(sendResponse);
    return true;
  }

  if (message.action === "close-duplicates") {
    closeDuplicateTabs().then(sendResponse);
    return true;
  }

  if (message.action === "execute-command") {
    executeCommand(message.commandId).then(sendResponse);
    return true;
  }

  if (message.action === "close-domain-tabs") {
    closeDomainTabs(message.domain).then(sendResponse);
    return true;
  }

  return false;
});

async function handleSearch(query, senderWindowId) {
  const q = query.trim().toLowerCase();
  if (!q) return { tabs: [], bookmarks: [], history: [] };

  const [tabs, bookmarks, history] = await Promise.all([
    searchTabs(q, senderWindowId),
    searchBookmarks(q),
    searchHistory(q),
  ]);

  return deduplicateResults(tabs, bookmarks, history);
}

function filterTabsByTitleUrl(tabs, query) {
  const results = [];

  for (const tab of tabs) {
    const match =
      typeof fuzzyScore === "function" ? fuzzyScore(tab, query) : null;

    if (match) {
      results.push({ tab, score: match.score });
    } else if (
      tab.title?.toLowerCase().includes(query) ||
      tab.url?.toLowerCase().includes(query)
    ) {
      results.push({ tab, score: 0 });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.map((r) => r.tab);
}

function formatTabResult(tab, currentWindowId, isContentMatch) {
  return {
    id: tab.id,
    title: tab.title || extractDomain(tab.url),
    url: tab.url,
    favIconUrl: tab.favIconUrl || null,
    active: tab.active,
    windowId: tab.windowId,
    isCurrentWindow: tab.windowId === currentWindowId,
    ...(isContentMatch ? { isContentMatch: true } : {}),
  };
}

async function extractTabContent(tabId) {
  try {
    const results = await browser.tabs.executeScript(tabId, {
      file: "content/extract-content.js",
    });
    const raw = results[0] ? String(results[0]) : "";
    return raw.substring(0, QAL_CONFIG.FULLTEXT_MAX_LENGTH).toLowerCase();
  } catch (err) {
    console.warn("Quick TAB Launcher: content extraction failed", err);
    return "";
  }
}

async function fetchTabsContent(tabs) {
  const entries = await Promise.all(
    tabs.map(async (tab) => {
      if (isPrivilegedUrl(tab.url)) return [tab.id, ""];
      return [tab.id, await extractTabContent(tab.id)];
    }),
  );
  return new Map(entries);
}

async function searchTabs(query, currentWindowId) {
  const allTabs = await browser.tabs.query({});
  const titleUrlMatches = filterTabsByTitleUrl(allTabs, query);
  const titleUrlMatchIds = new Set(titleUrlMatches.map((t) => t.id));

  const primaryResults = titleUrlMatches
    .slice(0, QAL_CONFIG.MAX_TAB_RESULTS)
    .map((tab) => formatTabResult(tab, currentWindowId, false));

  if (!QAL_CONFIG.ENABLE_FULLTEXT_SEARCH) {
    return primaryResults;
  }

  const remaining =
    primaryResults.length < QAL_CONFIG.MAX_TAB_RESULTS
      ? allTabs.filter((t) => !titleUrlMatchIds.has(t.id))
      : [];

  if (remaining.length === 0) {
    return primaryResults;
  }

  const contentMap = await fetchTabsContent(remaining);
  const contentMatches = remaining
    .filter((tab) => {
      const content = contentMap.get(tab.id) || "";
      return content.includes(query);
    })
    .map((tab) => formatTabResult(tab, currentWindowId, true));

  return [...primaryResults, ...contentMatches].slice(
    0,
    QAL_CONFIG.MAX_TAB_RESULTS,
  );
}

async function searchBookmarks(query) {
  if (query.length < QAL_CONFIG.MIN_QUERY_LENGTH_EXTENDED) return [];

  const results = await browser.bookmarks.search(query);
  return results
    .filter((bm) => bm.url)
    .slice(0, QAL_CONFIG.MAX_BOOKMARK_RESULTS)
    .map((bm) => ({
      id: bm.id,
      title: bm.title || extractDomain(bm.url),
      url: bm.url,
    }));
}

async function searchHistory(query) {
  if (query.length < QAL_CONFIG.MIN_QUERY_LENGTH_EXTENDED) return [];

  const msPerDay = 24 * 60 * 60 * 1000;
  const startTime = Date.now() - QAL_CONFIG.HISTORY_DAYS * msPerDay;

  const results = await browser.history.search({
    text: query,
    maxResults: QAL_CONFIG.MAX_HISTORY_RESULTS,
    startTime,
  });

  return results.map((h) => ({
    id: h.id,
    title: h.title || extractDomain(h.url),
    url: h.url,
    visitCount: h.visitCount,
    lastVisitTime: h.lastVisitTime,
  }));
}

async function handleNavigate(message, senderTabId) {
  try {
    if (message.type === "tab") {
      await browser.tabs.update(message.tabId, { active: true });
      const tab = await browser.tabs.get(message.tabId);
      await browser.windows.update(tab.windowId, { focused: true });
    } else if (message.type === "bookmark" || message.type === "history") {
      if (isPrivilegedUrl(message.url)) return;
      if (message.openInCurrent) {
        await browser.tabs.update(senderTabId, { url: message.url });
      } else {
        await browser.tabs.create({ url: message.url, active: true });
      }
    }
    if (senderTabId) {
      await browser.tabs.sendMessage(senderTabId, { action: "close" });
    }
  } catch (err) {
    console.log("Quick TAB Launcher: navigazione fallita", err.message);
  }
}

const WEB_SEARCH_PERMISSION = { permissions: ["search"] };

// Optional permission: users turn web search on from the settings page.
async function hasWebSearchPermission() {
  try {
    return await browser.permissions.contains(WEB_SEARCH_PERMISSION);
  } catch {
    return false;
  }
}

/**
 * Searches the web with Firefox's default engine.
 *
 * @param {{query: string, newTab: boolean}} message - From the panel.
 * @param {number|undefined} senderTabId - Tab the overlay is on; absent from the popup.
 * @returns {Promise<boolean>} Whether a search was started.
 */
async function runWebSearch({ query, newTab }, senderTabId) {
  if (!query?.trim() || !(await hasWebSearchPermission())) return false;
  const target =
    newTab || !senderTabId
      ? { disposition: "NEW_TAB" }
      : { tabId: senderTabId };
  try {
    await browser.search.query({ text: query, ...target });
    return true;
  } catch (err) {
    console.log("Quick TAB Launcher: ricerca web fallita", err.message);
    return false;
  }
}

async function handleCloseTab(tabId) {
  try {
    await browser.tabs.remove(tabId);
    return true;
  } catch (err) {
    console.log("Quick TAB Launcher: chiusura tab fallita", err.message);
    return false;
  }
}

function extractDomain(url) {
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { extractTabContent, isPrivilegedUrl, updatePopupForTab };
}
