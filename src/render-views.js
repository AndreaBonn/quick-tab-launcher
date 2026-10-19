/* global createElement, appendIcon, createEnterHint, createSection, createResultItem, setResultsRole, updateSelection, renderEmpty, renderNoResults, groupTabsByDomain, escapeHtml, highlightFuzzyMatch, t */
const SECTION_KEYS = ["tabs", "bookmarks", "history"];

function renderResults(container, results, query, selectedIndex) {
  container.innerHTML = "";
  setResultsRole(container, "listbox");
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
    const section = createSection(sectionKey, items.length);
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

function createDomainGroup(group) {
  const domainGroup = createElement("div", "qal-domain-group");
  const header = createElement("div", "qal-domain-header");
  const domainLabel = createElement("span", "qal-domain-label");
  domainLabel.textContent = group.domain;
  const domainCount = createElement("span", "qal-domain-count");
  domainCount.textContent = group.tabs.length;
  // Mouse-only like the per-row close control: a listbox may own only options
  // and groups, and keyboard focus never leaves the input anyway.
  const closeAllBtn = createElement("span", "qal-domain-close-all");
  closeAllBtn.setAttribute("aria-hidden", "true");
  closeAllBtn.textContent = "\u2715";
  closeAllBtn.title = t("actions.closeDomainTabs", {
    domain: group.domain,
  });
  closeAllBtn.dataset.domain = group.domain;
  header.append(domainLabel, domainCount, closeAllBtn);
  domainGroup.appendChild(header);
  return domainGroup;
}

function appendGroupedTabs(container, tabs, query) {
  let globalIndex = 0;
  if (tabs.length === 0) return globalIndex;
  const groups = groupTabsByDomain(tabs);
  const section = createSection("tabs", tabs.length);
  for (const group of groups) {
    const domainGroup = createDomainGroup(group);
    for (const tab of group.tabs) {
      domainGroup.appendChild(
        createResultItem(tab, "tabs", query, globalIndex),
      );
      globalIndex++;
    }
    section.appendChild(domainGroup);
  }
  container.appendChild(section);
  return globalIndex;
}

function renderGroupedResults(container, results, query, selectedIndex) {
  container.innerHTML = "";
  setResultsRole(container, "listbox");
  const totalCount =
    results.tabs.length + results.bookmarks.length + results.history.length;
  if (totalCount === 0) {
    renderNoResults(container, query);
    return;
  }
  let globalIndex = appendGroupedTabs(container, results.tabs, query);
  for (const sectionKey of ["bookmarks", "history"]) {
    const items = results[sectionKey];
    if (items.length === 0) continue;
    const section = createSection(sectionKey, items.length);
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

function createCommandItem(cmd, index) {
  const el = createElement("div", "qal-result-item qal-command-item");
  el.setAttribute("role", "option");
  el.setAttribute("aria-selected", "false");
  el.dataset.type = "command";
  el.dataset.id = cmd.id;
  el.dataset.index = index;
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
  return el;
}

/**
 * Appends a section of commands after the rows already in the container.
 *
 * @param {HTMLElement} container - Results container.
 * @param {Array<object>} commands - Commands to list.
 * @param {number} startIndex - Index of the first command in the flat list.
 * @param {string} [sectionKey] - Section title key under "sections.".
 */
function appendCommandSection(
  container,
  commands,
  startIndex,
  sectionKey = "commands",
) {
  const section = createSection(sectionKey, commands.length);
  commands.forEach((cmd, i) => {
    section.appendChild(createCommandItem(cmd, startIndex + i));
  });
  container.appendChild(section);
}

/**
 * Search view shared by the overlay and the popup: results (flat or by site),
 * then matching actions, or the empty state with tips when nothing matches.
 *
 * @param {HTMLElement} container - Results container.
 * @param {object} view - { results, commands, query, selectedIndex, grouped, tips }.
 */
function createWebSearchItem(query, index) {
  const el = createElement("div", "qal-result-item qal-command-item");
  el.setAttribute("role", "option");
  el.setAttribute("aria-selected", "false");
  el.dataset.type = "web-search";
  el.dataset.index = index;
  const icon = createElement("span", "qal-command-icon");
  appendIcon(icon, "search");
  const text = createElement("div", "qal-result-text");
  const title = createElement("span", "qal-result-title");
  title.textContent = t("webSearch.title", { query });
  const desc = createElement("span", "qal-result-url qal-command-desc");
  desc.textContent = t("webSearch.desc");
  text.append(title, desc);
  el.append(icon, text, createEnterHint("web-search"));
  return el;
}

function renderSearchView(container, view) {
  const { results, commands, query, selectedIndex, grouped, tips } = view;
  const total =
    results.tabs.length + results.bookmarks.length + results.history.length;
  if (total === 0 && commands.length === 0) {
    if (tips?.webSearchEnabled) {
      // Nothing local matched: the way out is the web, as the only option.
      container.innerHTML = "";
      setResultsRole(container, "listbox");
      const section = createSection("web", 1);
      section.appendChild(createWebSearchItem(query.trim(), 0));
      container.appendChild(section);
      updateSelection(container, selectedIndex);
      return;
    }
    renderNoResults(container, query, tips);
    return;
  }
  const render = grouped ? renderGroupedResults : renderResults;
  if (total > 0) render(container, results, query, selectedIndex);
  else container.textContent = "";
  setResultsRole(container, "listbox");
  if (commands.length > 0) {
    appendCommandSection(container, commands, total);
    updateSelection(container, selectedIndex);
  }
}

function renderCommandResults(container, commands, query, selectedIndex) {
  container.innerHTML = "";
  setResultsRole(container, "listbox");
  if (commands.length === 0) {
    renderNoResults(container, query || ">");
    return;
  }

  // Unfiltered list: one section per group, in the registry order the caller
  // already uses for its flat list. Filtered list: one section by relevance.
  const isGrouped = !query && commands.every((cmd) => cmd.group);
  if (isGrouped) {
    let index = 0;
    for (const group of ["tabs", "current"]) {
      const inGroup = commands.filter((cmd) => cmd.group === group);
      if (inGroup.length === 0) continue;
      appendCommandSection(container, inGroup, index, `command-${group}`);
      index += inGroup.length;
    }
  } else {
    appendCommandSection(container, commands, 0);
  }
  updateSelection(container, selectedIndex);
}

function renderRecentTabs(container, recentData) {
  container.innerHTML = "";
  setResultsRole(container, "listbox");
  const { recentActive, recentlyClosed } = recentData;

  if (recentActive.length === 0 && recentlyClosed.length === 0) {
    renderEmpty(container);
    return;
  }

  let globalIndex = 0;

  for (const [sectionKey, items] of [
    ["recent-active", recentActive],
    ["recent-closed", recentlyClosed],
  ]) {
    if (items.length === 0) continue;
    const section = createSection(sectionKey, items.length);
    for (const item of items) {
      section.appendChild(createResultItem(item, sectionKey, "", globalIndex));
      globalIndex++;
    }
    container.appendChild(section);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    renderResults,
    renderGroupedResults,
    createCommandItem,
    appendCommandSection,
    createWebSearchItem,
    renderSearchView,
    renderCommandResults,
    renderRecentTabs,
  };
}
