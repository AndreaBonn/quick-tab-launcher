/* global browser, QAL_CONFIG, QAL_CONFIG_DEFAULTS, loadUserConfig, mergeWithDefaults, applyConfigToGlobal, CONFIG_STORAGE_KEY */

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

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "search") {
    const senderWindowId = sender.tab?.windowId;
    handleSearch(message.query, senderWindowId).then(sendResponse);
    return true;
  }

  if (message.action === "navigate") {
    handleNavigate(message, sender.tab.id);
    return false;
  }

  if (message.action === "close-tab") {
    handleCloseTab(message.tabId);
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

async function searchTabs(query, currentWindowId) {
  const allTabs = await browser.tabs.query({});
  return allTabs
    .filter(
      (tab) =>
        tab.title?.toLowerCase().includes(query) ||
        tab.url?.toLowerCase().includes(query),
    )
    .slice(0, QAL_CONFIG.MAX_TAB_RESULTS)
    .map((tab) => ({
      id: tab.id,
      title: tab.title || extractDomain(tab.url),
      url: tab.url,
      favIconUrl: tab.favIconUrl || null,
      active: tab.active,
      windowId: tab.windowId,
      isCurrentWindow: tab.windowId === currentWindowId,
    }));
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
      if (message.openInCurrent) {
        await browser.tabs.update(senderTabId, { url: message.url });
      } else {
        await browser.tabs.create({ url: message.url, active: true });
      }
    }
    await browser.tabs.sendMessage(senderTabId, { action: "close" });
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
