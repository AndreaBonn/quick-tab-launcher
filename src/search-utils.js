/**
 * Logica pura condivisa tra background e content script.
 * Zero dipendenze browser - testabile in isolamento.
 */

/* global QAL_CONFIG_DEFAULTS */

const _defaults =
  typeof QAL_CONFIG_DEFAULTS !== "undefined"
    ? QAL_CONFIG_DEFAULTS
    : require("./config-storage.js").QAL_CONFIG_DEFAULTS;

const QAL_CONFIG = { ..._defaults };

function escapeHtml(text) {
  if (!text) return "";
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightMatch(text, query) {
  if (!query || !text) return escapeHtml(text || "");
  const escaped = escapeHtml(text);
  const escapedQuery = escapeRegExp(escapeHtml(query));
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  return escaped.replace(regex, '<mark class="qal-highlight">$1</mark>');
}

function formatUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.hostname}${path}`;
  } catch {
    return url;
  }
}

function deduplicateResults(tabs, bookmarks, history) {
  const tabUrls = new Set(tabs.map((tab) => normalizeUrl(tab.url)));

  const dedupedBookmarks = bookmarks.filter(
    (bm) => !tabUrls.has(normalizeUrl(bm.url)),
  );

  const bookmarkUrls = new Set(
    dedupedBookmarks.map((bm) => normalizeUrl(bm.url)),
  );
  const dedupedHistory = history.filter((h) => {
    const normalized = normalizeUrl(h.url);
    return !tabUrls.has(normalized) && !bookmarkUrls.has(normalized);
  });

  return {
    tabs,
    bookmarks: dedupedBookmarks,
    history: dedupedHistory,
  };
}

function normalizeUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(
      /\/$/,
      "",
    );
  } catch {
    return url.replace(/\/$/, "");
  }
}

function buildFlatResults(results) {
  const flat = [];
  for (const tab of results.tabs) {
    flat.push({ ...tab, type: "tab" });
  }
  for (const bm of results.bookmarks) {
    flat.push({ ...bm, type: "bookmark" });
  }
  for (const h of results.history) {
    flat.push({ ...h, type: "history" });
  }
  return flat;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    QAL_CONFIG,
    escapeHtml,
    escapeRegExp,
    highlightMatch,
    formatUrl,
    deduplicateResults,
    normalizeUrl,
    buildFlatResults,
  };
}
