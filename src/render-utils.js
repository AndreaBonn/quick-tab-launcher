/* global escapeHtml, highlightMatch, formatUrl, fuzzyMatch, highlightFuzzyMatch, groupTabsByDomain, t */

const INITIAL_COLORS = [
  "#e06c75",
  "#e5c07b",
  "#61afef",
  "#c678dd",
  "#56b6c2",
  "#98c379",
  "#d19a66",
  "#be5046",
];

const SECTION_KEYS = ["tabs", "bookmarks", "history"];
const SECTION_ICONS = {
  tabs: "\uD83D\uDCC2",
  bookmarks: "\u2B50",
  history: "\uD83D\uDD52",
  "recent-active": "\uD83D\uDD52",
  "recent-closed": "\uD83D\uDCCB",
  commands: "\u26A1",
};

function createElement(tag, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

function createSectionHeader(sectionKey, count) {
  const header = createElement("div", "qal-section-header");
  const icon = createElement("span", "qal-section-icon");
  icon.textContent = SECTION_ICONS[sectionKey] || "";
  const title = createElement("span", "qal-section-title");
  title.textContent = t(`sections.${sectionKey}`);
  const countEl = createElement("span", "qal-section-count");
  countEl.textContent = count;
  header.append(icon, title, countEl);
  return header;
}

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function createInitialFavicon(hostname) {
  const letter = (hostname.replace(/^www\./, "")[0] || "?").toUpperCase();
  const color = INITIAL_COLORS[hashCode(hostname) % INITIAL_COLORS.length];
  const el = createElement("span", "qal-favicon qal-favicon-initial");
  el.textContent = letter;
  el.style.backgroundColor = color;
  return el;
}

function createFavicon(item, sectionKey) {
  const hasFavIcon =
    (sectionKey === "tabs" ||
      sectionKey === "recent-active" ||
      sectionKey === "recent-closed") &&
    item.favIconUrl;

  if (hasFavIcon && /^https?:/.test(item.favIconUrl)) {
    const img = document.createElement("img");
    img.className = "qal-favicon";
    img.width = 16;
    img.height = 16;
    img.src = item.favIconUrl;
    img.onerror = () => {
      img.style.display = "none";
    };
    return img;
  }
  if (item.url) {
    try {
      const hostname = new URL(item.url).hostname;
      return createInitialFavicon(hostname);
    } catch {
      // invalid URL: fall through
    }
  }
  return createElement("span", "qal-favicon");
}

function fuzzyHighlightOrFallback(text, query) {
  if (typeof fuzzyMatch === "function" && query) {
    const match = fuzzyMatch(text, query);
    if (match) return highlightFuzzyMatch(text, match.indices);
  }
  return highlightMatch(text, query);
}

function createResultText(item, query) {
  const container = createElement("div", "qal-result-text");
  const titleEl = createElement("span", "qal-result-title");
  titleEl.innerHTML = fuzzyHighlightOrFallback(item.title || "", query);
  const urlEl = createElement("span", "qal-result-url");
  urlEl.innerHTML = fuzzyHighlightOrFallback(formatUrl(item.url || ""), query);
  container.append(titleEl, urlEl);
  return container;
}

function createResultItem(item, sectionKey, query, index) {
  const el = createElement("div", "qal-result-item");
  el.setAttribute("role", "option");
  el.setAttribute("aria-selected", "false");
  el.dataset.type = sectionKey;
  el.dataset.id = item.id;
  el.dataset.url = item.url || "";
  el.dataset.index = index;
  if (item.sessionId) el.dataset.sessionId = item.sessionId;

  const favicon = createFavicon(item, sectionKey);
  const textContainer = createResultText(item, query);

  if (item.isContentMatch) {
    const contentBadge = createElement("span", "qal-content-badge");
    contentBadge.textContent = "\u2261";
    contentBadge.title = t("badges.contentMatch");
    el.append(favicon, contentBadge, textContainer);
  } else if (sectionKey === "tabs" && item.isCurrentWindow === false) {
    const badge = createElement("span", "qal-window-badge");
    badge.textContent = "\u2197";
    badge.title = t("badges.otherWindow");
    el.append(favicon, badge, textContainer);
  } else {
    el.append(favicon, textContainer);
  }
  if (sectionKey === "tabs") {
    const actions = createElement("div", "qal-result-actions");
    const closeBtn = createElement("button", "qal-close-tab");
    closeBtn.textContent = "\u2715";
    closeBtn.title = t("badges.closeTab");
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
  for (const sectionKey of SECTION_KEYS) {
    const items = results[sectionKey];
    if (items.length === 0) continue;
    const section = createElement("div", "qal-section");
    section.dataset.section = sectionKey;
    section.appendChild(createSectionHeader(sectionKey, items.length));
    for (const item of items) {
      section.appendChild(
        createResultItem(item, sectionKey, query, globalIndex),
      );
      globalIndex++;
    }
    container.appendChild(section);
  }
  updateSelection(container, selectedIndex);
}

function renderGroupedResults(container, results, query, selectedIndex) {
  container.innerHTML = "";
  const totalCount =
    results.tabs.length + results.bookmarks.length + results.history.length;
  if (totalCount === 0) {
    renderNoResults(container, query);
    return;
  }

  let globalIndex = 0;

  if (results.tabs.length > 0) {
    const groups = groupTabsByDomain(results.tabs);
    const section = createElement("div", "qal-section");
    section.dataset.section = "tabs";
    section.appendChild(createSectionHeader("tabs", results.tabs.length));

    for (const group of groups) {
      const domainGroup = createElement("div", "qal-domain-group");

      const header = createElement("div", "qal-domain-header");
      const domainLabel = createElement("span", "qal-domain-label");
      domainLabel.textContent = group.domain;
      const domainCount = createElement("span", "qal-domain-count");
      domainCount.textContent = group.tabs.length;
      const closeAllBtn = createElement("button", "qal-domain-close-all");
      closeAllBtn.textContent = "\u2715";
      closeAllBtn.title = t("actions.closeDomainTabs", {
        domain: group.domain,
      });
      closeAllBtn.dataset.domain = group.domain;
      header.append(domainLabel, domainCount, closeAllBtn);
      domainGroup.appendChild(header);

      for (const tab of group.tabs) {
        domainGroup.appendChild(
          createResultItem(tab, "tabs", query, globalIndex),
        );
        globalIndex++;
      }
      section.appendChild(domainGroup);
    }
    container.appendChild(section);
  }

  for (const sectionKey of ["bookmarks", "history"]) {
    const items = results[sectionKey];
    if (items.length === 0) continue;
    const section = createElement("div", "qal-section");
    section.dataset.section = sectionKey;
    section.appendChild(createSectionHeader(sectionKey, items.length));
    for (const item of items) {
      section.appendChild(
        createResultItem(item, sectionKey, query, globalIndex),
      );
      globalIndex++;
    }
    container.appendChild(section);
  }

  updateSelection(container, selectedIndex);
}

function renderCommandResults(container, commands, query, selectedIndex) {
  container.innerHTML = "";
  if (commands.length === 0) {
    renderNoResults(container, query || ">");
    return;
  }

  const section = createElement("div", "qal-section");
  section.dataset.section = "commands";
  section.appendChild(createSectionHeader("commands", commands.length));

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    const el = createElement("div", "qal-result-item qal-command-item");
    el.setAttribute("role", "option");
    el.setAttribute("aria-selected", "false");
    el.dataset.type = "command";
    el.dataset.id = cmd.id;
    el.dataset.index = i;

    const icon = createElement("span", "qal-command-icon");
    icon.textContent = cmd.icon;
    const textContainer = createElement("div", "qal-result-text");
    const label = createElement("span", "qal-result-title");
    label.innerHTML =
      cmd.matchIndices && typeof highlightFuzzyMatch === "function"
        ? highlightFuzzyMatch(cmd.label, cmd.matchIndices)
        : escapeHtml(cmd.label);
    const desc = createElement("span", "qal-result-url");
    desc.textContent = cmd.description;
    textContainer.append(label, desc);

    el.append(icon, textContainer);
    section.appendChild(el);
  }

  container.appendChild(section);
  updateSelection(container, selectedIndex);
}

function renderRecentTabs(container, recentData) {
  container.innerHTML = "";
  const { recentActive, recentlyClosed } = recentData;

  if (recentActive.length === 0 && recentlyClosed.length === 0) {
    renderEmpty(container);
    return;
  }

  let globalIndex = 0;

  if (recentActive.length > 0) {
    const section = createElement("div", "qal-section");
    section.dataset.section = "recent-active";
    section.appendChild(
      createSectionHeader("recent-active", recentActive.length),
    );
    for (const item of recentActive) {
      section.appendChild(
        createResultItem(item, "recent-active", "", globalIndex),
      );
      globalIndex++;
    }
    container.appendChild(section);
  }

  if (recentlyClosed.length > 0) {
    const section = createElement("div", "qal-section");
    section.dataset.section = "recent-closed";
    section.appendChild(
      createSectionHeader("recent-closed", recentlyClosed.length),
    );
    for (const item of recentlyClosed) {
      section.appendChild(
        createResultItem(item, "recent-closed", "", globalIndex),
      );
      globalIndex++;
    }
    container.appendChild(section);
  }
}

function renderDuplicateBanner(container, count) {
  if (count <= 0) return;
  const existing = container.querySelector(".qal-duplicate-banner");
  if (existing) existing.remove();

  const banner = createElement("div", "qal-duplicate-banner");
  const text = createElement("span", "qal-duplicate-text");
  text.textContent = t("duplicates.banner", { count: String(count) });
  const btn = createElement("button", "qal-duplicate-action");
  btn.textContent = t("duplicates.closeAll");
  banner.append(text, btn);
  container.insertBefore(banner, container.firstChild);
}

function renderEmpty(container) {
  container.innerHTML = "";
  const empty = createElement("div", "qal-empty-state");
  empty.textContent = t("states.empty");
  container.appendChild(empty);
}

function renderNoResults(container, query) {
  container.innerHTML = "";
  const empty = createElement("div", "qal-empty-state");
  const safeQuery = escapeHtml(query);
  empty.innerHTML = t("states.noResults", { query: safeQuery });
  container.appendChild(empty);
}

function renderLoading(container) {
  container.innerHTML = "";
  const loading = createElement("div", "qal-loading");
  loading.textContent = t("states.loading");
  container.appendChild(loading);
}

function renderError(container) {
  container.innerHTML = "";
  const error = createElement("div", "qal-empty-state");
  error.textContent = t("states.error");
  container.appendChild(error);
}

function updateSelection(container, selectedIndex) {
  const items = container.querySelectorAll(".qal-result-item");
  for (let i = 0; i < items.length; i++) {
    const isSelected = i === selectedIndex;
    items[i].classList.toggle("qal-selected", isSelected);
    items[i].setAttribute("aria-selected", String(isSelected));
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
    createFavicon,
    createInitialFavicon,
    createResultItem,
    createResultText,
    createSectionHeader,
    fuzzyHighlightOrFallback,
    hashCode,
    reindexItems,
    renderCommandResults,
    renderDuplicateBanner,
    renderEmpty,
    renderError,
    renderGroupedResults,
    renderLoading,
    renderNoResults,
    renderRecentTabs,
    renderResults,
    updateSelection,
  };
}
