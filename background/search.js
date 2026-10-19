/* global browser, QAL_CONFIG, fuzzyScore, deduplicateResults, isPrivilegedUrl, extractDomain */

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

  return [...primaryResults, ...contentMatches].slice(0, QAL_CONFIG.MAX_TAB_RESULTS);
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    handleSearch, filterTabsByTitleUrl, formatTabResult, extractTabContent,
    fetchTabsContent, searchTabs, searchBookmarks, searchHistory,
  };
}
