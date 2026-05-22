/* global escapeHtml, highlightMatch, formatUrl */

const FAVICON_FALLBACK_BASE = "https://www.google.com/s2/favicons?sz=16&domain=";
const SECTION_META = {
  tabs: { icon: "\uD83D\uDCC2", title: "Schede aperte" },
  bookmarks: { icon: "\u2B50", title: "Segnalibri" },
  history: { icon: "\uD83D\uDD52", title: "Cronologia" },
};

function createElement(tag, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

function createSectionHeader(sectionKey, count) {
  const header = createElement("div", "qal-section-header");
  const meta = SECTION_META[sectionKey];
  const icon = createElement("span", "qal-section-icon");
  icon.textContent = meta.icon;
  const title = createElement("span", "qal-section-title");
  title.textContent = meta.title;
  const countEl = createElement("span", "qal-section-count");
  countEl.textContent = count;
  header.append(icon, title, countEl);
  return header;
}

function createFavicon(item, sectionKey) {
  const favicon = document.createElement("img");
  favicon.className = "qal-favicon";
  favicon.width = 16;
  favicon.height = 16;
  if (sectionKey === "tabs" && item.favIconUrl) {
    favicon.src = item.favIconUrl;
  } else if (item.url) {
    try {
      const hostname = new URL(item.url).hostname;
      favicon.src = FAVICON_FALLBACK_BASE + hostname;
    } catch {
      favicon.src = "";
    }
  }
  favicon.onerror = () => {
    favicon.style.display = "none";
  };
  return favicon;
}

function createResultText(item, query) {
  const container = createElement("div", "qal-result-text");
  const title = createElement("span", "qal-result-title");
  title.innerHTML = highlightMatch(item.title || "", query);
  const url = createElement("span", "qal-result-url");
  url.innerHTML = highlightMatch(formatUrl(item.url || ""), query);
  container.append(title, url);
  return container;
}

function createResultItem(item, sectionKey, query, index) {
  const el = createElement("div", "qal-result-item");
  el.dataset.type = sectionKey;
  el.dataset.id = item.id;
  el.dataset.url = item.url || "";
  el.dataset.index = index;
  const favicon = createFavicon(item, sectionKey);
  const textContainer = createResultText(item, query);
  if (item.isContentMatch) {
    const contentBadge = createElement("span", "qal-content-badge");
    contentBadge.textContent = "\u2261";
    contentBadge.title = "Match nel contenuto";
    el.append(favicon, contentBadge, textContainer);
  } else if (sectionKey === "tabs" && item.isCurrentWindow === false) {
    const badge = createElement("span", "qal-window-badge");
    badge.textContent = "\u2197";
    badge.title = "Altra finestra";
    el.append(favicon, badge, textContainer);
  } else {
    el.append(favicon, textContainer);
  }
  if (sectionKey === "tabs") {
    const actions = createElement("div", "qal-result-actions");
    const closeBtn = createElement("button", "qal-close-tab");
    closeBtn.textContent = "\u2715";
    closeBtn.title = "Chiudi scheda";
    actions.appendChild(closeBtn);
    el.appendChild(actions);
  }
  return el;
}

function renderResults(container, results, query, selectedIndex) {
  container.innerHTML = "";
  const totalCount =
    results.tabs.length + results.bookmarks.length + results.history.length;
  if (totalCount === 0) {
    renderNoResults(container, query);
    return;
  }
  let globalIndex = 0;
  for (const sectionKey of ["tabs", "bookmarks", "history"]) {
    const items = results[sectionKey];
    if (items.length === 0) continue;
    const section = createElement("div", "qal-section");
    section.dataset.section = sectionKey;
    section.appendChild(createSectionHeader(sectionKey, items.length));
    for (const item of items) {
      section.appendChild(createResultItem(item, sectionKey, query, globalIndex));
      globalIndex++;
    }
    container.appendChild(section);
  }
  updateSelection(container, selectedIndex);
}

function renderEmpty(container) {
  container.innerHTML = "";
  const empty = createElement("div", "qal-empty-state");
  empty.textContent = "Inizia a digitare per cercare...";
  container.appendChild(empty);
}

function renderNoResults(container, query) {
  container.innerHTML = "";
  const empty = createElement("div", "qal-empty-state");
  const safeQuery = escapeHtml(query);
  empty.innerHTML = `Nessun risultato per &laquo;${safeQuery}&raquo;`;
  container.appendChild(empty);
}

function renderLoading(container) {
  container.innerHTML = "";
  const loading = createElement("div", "qal-loading");
  loading.textContent = "Ricerca in corso...";
  container.appendChild(loading);
}

function renderError(container) {
  container.innerHTML = "";
  const error = createElement("div", "qal-empty-state");
  error.textContent = "Errore durante la ricerca. Riprova.";
  container.appendChild(error);
}

function updateSelection(container, selectedIndex) {
  const items = container.querySelectorAll(".qal-result-item");
  for (let i = 0; i < items.length; i++) {
    items[i].classList.toggle("qal-selected", i === selectedIndex);
  }
  const selected = items[selectedIndex];
  if (selected?.scrollIntoView) {
    selected.scrollIntoView({ block: "nearest" });
  }
}

function reindexItems(container) {
  const items = container.querySelectorAll(".qal-result-item");
  for (let i = 0; i < items.length; i++) {
    items[i].dataset.index = i;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    createElement,
    createResultItem,
    createSectionHeader,
    renderResults,
    renderEmpty,
    renderNoResults,
    renderLoading,
    renderError,
    updateSelection,
    reindexItems,
  };
}
