/* global escapeHtml, highlightMatch, formatUrl, fuzzyMatch, highlightFuzzyMatch, groupTabsByDomain, t, createIcon */

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
  tabs: "tabs",
  bookmarks: "star",
  history: "clock",
  "recent-active": "tabs",
  "recent-closed": "restore",
  commands: "bolt",
};

// What Enter does on a row, shown on the selected one.
const ENTER_HINT_KEYS = {
  tabs: "enterHint.tab",
  "recent-active": "enterHint.tab",
  "recent-closed": "enterHint.reopen",
  bookmarks: "enterHint.open",
  history: "enterHint.open",
  command: "enterHint.run",
};

function createElement(tag, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

function appendIcon(parent, name) {
  const icon = typeof createIcon === "function" ? createIcon(name) : null;
  if (icon) parent.appendChild(icon);
}

function createEnterHint(kind) {
  const hint = createElement("span", "qal-enter-hint");
  hint.setAttribute("aria-hidden", "true");
  hint.textContent = "\u21B5 " + t(ENTER_HINT_KEYS[kind]);
  return hint;
}

function createSectionHeader(sectionKey, count) {
  const header = createElement("div", "qal-section-header");
  const icon = createElement("span", "qal-section-icon");
  appendIcon(icon, SECTION_ICONS[sectionKey]);
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
  const url = formatUrl(item.url || "");
  const domain = url.split("/")[0];
  const domainEl = createElement("span", "qal-url-domain");
  domainEl.innerHTML = fuzzyHighlightOrFallback(domain, query);
  const pathEl = createElement("span", "qal-url-path");
  pathEl.innerHTML = fuzzyHighlightOrFallback(url.slice(domain.length), query);
  urlEl.append(domainEl, pathEl);
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

  el.append(favicon, textContainer);
  if (item.isContentMatch) {
    const contentBadge = createElement("span", "qal-content-badge");
    contentBadge.textContent = t("badges.contentMatch");
    contentBadge.title = t("badges.contentMatch.tooltip");
    el.appendChild(contentBadge);
  } else if (sectionKey === "tabs" && item.isCurrentWindow === false) {
    const badge = createElement("span", "qal-window-badge");
    badge.textContent = t("badges.otherWindow");
    el.appendChild(badge);
  }
  if (ENTER_HINT_KEYS[sectionKey]) el.appendChild(createEnterHint(sectionKey));
  if (sectionKey === "tabs") {
    const actions = createElement("div", "qal-result-actions");
    const closeBtn = createElement("button", "qal-close-tab");
    closeBtn.type = "button";
    appendIcon(closeBtn, "close");
    if (!closeBtn.firstChild) closeBtn.textContent = "\u2715";
    closeBtn.title = t("badges.closeTab");
    closeBtn.setAttribute("aria-label", t("badges.closeTab"));
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
    appendIcon(icon, cmd.icon);
    const textContainer = createElement("div", "qal-result-text");
    const label = createElement("span", "qal-result-title");
    label.innerHTML =
      cmd.matchIndices && typeof highlightFuzzyMatch === "function"
        ? highlightFuzzyMatch(cmd.label, cmd.matchIndices)
        : escapeHtml(cmd.label);
    const desc = createElement("span", "qal-result-url qal-command-desc");
    desc.textContent = cmd.description;
    textContainer.append(label, desc);

    el.append(icon, textContainer, createEnterHint("command"));
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
    items[i].id = `qal-option-${i}`;
    items[i].classList.toggle("qal-selected", isSelected);
    items[i].setAttribute("aria-selected", String(isSelected));
  }
  const selected = items[selectedIndex];
  // The focused input announces the active row to screen readers; the caller
  // links it by setting `activeDescendantOwner` on the results container.
  const owner = container.activeDescendantOwner;
  if (owner) {
    if (selected) owner.setAttribute("aria-activedescendant", selected.id);
    else owner.removeAttribute("aria-activedescendant");
  }
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
