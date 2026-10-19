/* global createElement, setResultsRole, t, escapeHtml */

function renderEmpty(container) {
  container.innerHTML = "";
  setResultsRole(container, "status");
  const empty = createElement("div", "qal-empty-state");
  empty.textContent = t("states.empty");
  container.appendChild(empty);
}

function createTip(text, action, actionLabel) {
  const li = createElement("li", "");
  li.textContent = text + (action ? " " : "");
  if (action) {
    const btn = createElement("button", "qal-link-btn");
    btn.type = "button";
    btn.dataset.qalAction = action;
    btn.textContent = actionLabel;
    li.appendChild(btn);
  }
  return li;
}

function appendWebSearchTip(list, tips) {
  if (tips.webSearchEnabled === false) {
    list.appendChild(
      createTip(
        t("noResults.tipWeb"),
        "open-options",
        t("noResults.enableWeb"),
      ),
    );
  }
}

function appendNoResultsTips(empty, tips) {
  if (!tips) return;
  const list = createElement("ul", "qal-tips");
  list.appendChild(createTip(t("noResults.tipShorter")));
  if (!tips.fulltextEnabled) {
    list.appendChild(
      createTip(
        t("noResults.tipFulltext"),
        "enable-fulltext",
        t("noResults.enableFulltext"),
      ),
    );
  }
  list.appendChild(
    createTip(
      t("noResults.tipHistory", { days: String(tips.historyDays) }),
      "open-options",
      t("noResults.openSettings"),
    ),
  );
  appendWebSearchTip(list, tips);
  empty.appendChild(list);
}

/**
 * Empty result state. With `tips`, also suggests what to try next.
 *
 * @param {HTMLElement} container - Results container.
 * @param {string} query - Search text, echoed back.
 * @param {{fulltextEnabled: boolean, historyDays: number}} [tips]
 */
function renderNoResults(container, query, tips) {
  container.innerHTML = "";
  setResultsRole(container, "status");
  const empty = createElement("div", "qal-empty-state");
  const message = createElement("p", "qal-empty-message");
  message.innerHTML = t("states.noResults", { query: escapeHtml(query) });
  empty.appendChild(message);
  appendNoResultsTips(empty, tips);
  container.appendChild(empty);
}

function renderLoading(container) {
  container.innerHTML = "";
  setResultsRole(container, "status");
  const loading = createElement("div", "qal-loading");
  loading.textContent = t("states.loading");
  container.appendChild(loading);
}

function renderError(container) {
  container.innerHTML = "";
  setResultsRole(container, "status");
  const error = createElement("div", "qal-empty-state");
  error.textContent = t("states.error");
  container.appendChild(error);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    renderEmpty,
    createTip,
    renderNoResults,
    renderLoading,
    renderError,
  };
}
