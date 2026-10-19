/* global highlightMatch, formatUrl, fuzzyMatch, highlightFuzzyMatch, t, createIcon */

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

const SECTION_ICONS = {
  tabs: "tabs",
  bookmarks: "star",
  history: "clock",
  "recent-active": "tabs",
  "recent-closed": "restore",
  commands: "bolt",
  web: "search",
  "command-tabs": "tabs",
  "command-current": "bolt",
};

// What Enter does on a row, shown on the selected one.
const ENTER_HINT_KEYS = {
  tabs: "enterHint.tab",
  "recent-active": "enterHint.tab",
  "recent-closed": "enterHint.reopen",
  bookmarks: "enterHint.open",
  history: "enterHint.open",
  command: "enterHint.run",
  "web-search": "enterHint.search",
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

// The results container is a listbox only while it holds options; empty,
// loading and error messages are announced as a status instead.
function setResultsRole(container, role) {
  container.setAttribute("role", role);
  if (role !== "listbox") {
    container.activeDescendantOwner?.removeAttribute("aria-activedescendant");
  }
}

function createSection(sectionKey, count) {
  const section = createElement("div", "qal-section");
  section.dataset.section = sectionKey;
  section.setAttribute("role", "group");
  const header = createSectionHeader(sectionKey, count);
  header.id = `qal-section-${sectionKey}`;
  section.setAttribute("aria-labelledby", header.id);
  section.appendChild(header);
  return section;
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
    img.alt = "";
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

function appendResultBadge(el, item, sectionKey) {
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
}

function appendResultActions(el, sectionKey) {
  if (sectionKey === "tabs" || sectionKey === "recent-active") {
    const actions = createElement("div", "qal-result-actions");
    // Not a <button>: controls cannot sit inside an option. Mouse users click
    // it, keyboard and screen reader users close the selected row with Alt+W.
    const closeBtn = createElement("span", "qal-close-tab");
    appendIcon(closeBtn, "close");
    if (!closeBtn.firstChild) closeBtn.textContent = "\u2715";
    closeBtn.title = t("badges.closeTab");
    closeBtn.setAttribute("aria-hidden", "true");
    actions.appendChild(closeBtn);
    el.appendChild(actions);
  }
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
  appendResultBadge(el, item, sectionKey);
  if (ENTER_HINT_KEYS[sectionKey]) el.appendChild(createEnterHint(sectionKey));
  appendResultActions(el, sectionKey);
  return el;
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
    appendIcon,
    createEnterHint,
    setResultsRole,
    createSection,
    createSectionHeader,
    hashCode,
    createInitialFavicon,
    createFavicon,
    fuzzyHighlightOrFallback,
    createResultText,
    createResultItem,
    updateSelection,
    reindexItems,
  };
}
