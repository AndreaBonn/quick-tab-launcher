/* global browser, QAL_CONFIG, QAL_CONFIG_DEFAULTS, loadUserConfig, mergeWithDefaults, applyConfigToGlobal, CONFIG_STORAGE_KEY, fuzzyScore, deduplicateResults, executeCommand, getDuplicateCount, getRecentTabs, restoreSession, closeDomainTabs */

const PRIVILEGED_URL_PATTERNS = [
  /^about:/,
  /^moz-extension:/,
  /^file:/,
  /^chrome:/,
  /^resource:/,
  /^data:/,
  /^javascript:/i,
  /^vbscript:/i,
];

function isPrivilegedUrl(url) {
  if (!url) return true;
  return PRIVILEGED_URL_PATTERNS.some((pattern) => pattern.test(url));
}

async function updatePopupForTab(tabId) {
  try {
    const tab = await browser.tabs.get(tabId);
    if (isPrivilegedUrl(tab.url)) {
      await browser.browserAction.setPopup({ popup: "popup/popup.html" });
    } else {
      await browser.browserAction.setPopup({ popup: "" });
    }
  } catch (err) {
    console.warn("Quick Actions Launcher: popup update failed", err);
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

async function toggleLauncher() {
  try {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!activeTab?.id) return;
    await browser.tabs.sendMessage(activeTab.id, { action: "toggle" });
  } catch (err) {
    console.log("Quick Actions Launcher: pagina non supportata", err.message);
  }
}

browser.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-launcher") return;
  await toggleLauncher();
});

browser.browserAction.onClicked.addListener(async () => {
  await toggleLauncher();
});

browser.tabs.onActivated.addListener((activeInfo) => {
  updatePopupForTab(activeInfo.tabId);
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
    handleCloseTab(message.tabId);
    return false;
  }

  if (message.action === "get-recent-tabs") {
    getRecentTabs().then(sendResponse);
    return true;
  }

  if (message.action === "restore-session") {
    restoreSession(message.sessionId);
    return false;
  }

  if (message.action === "get-duplicate-count") {
    getDuplicateCount().then((count) => sendResponse({ count }));
    return true;
  }

  if (message.action === "close-duplicates") {
    const { closeDuplicateTabs } =
      typeof module !== "undefined"
        ? require("./tab-commands.js")
        : { closeDuplicateTabs: globalThis.closeDuplicateTabs };
    if (typeof closeDuplicateTabs === "function") {
      closeDuplicateTabs();
    }
    return false;
  }

  if (message.action === "execute-command") {
    executeCommand(message.commandId).then(sendResponse);
    return true;
  }

  if (message.action === "close-domain-tabs") {
    closeDomainTabs(message.domain);
    return false;
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
    console.warn("Quick Actions Launcher: content extraction failed", err);
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
    console.log("Quick Actions Launcher: navigazione fallita", err.message);
  }
}

async function handleCloseTab(tabId) {
  try {
    await browser.tabs.remove(tabId);
  } catch (err) {
    console.log("Quick Actions Launcher: chiusura tab fallita", err.message);
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
