/* global createElement, t, tCount */

function createDuplicatesBanner({ slot, isActive, onClosed, browser, renderBanner = renderDuplicateBanner, warn = console.warn }) {
  const context = {
    slot, isActive, onClosed, browser, renderBanner, warn,
    signature: "", dismissedKey: "qal_duplicates_dismissed",
  };
  return {
    checkDuplicates: checkDuplicates.bind(null, context),
    dismiss: dismissDuplicateBanner.bind(null, context),
    closeDuplicatesFromBanner: closeDuplicatesFromBanner.bind(null, context),
    handleClick: handleDuplicatesBannerClick.bind(null, context),
  };
}

function duplicateSignature(summary) {
  const pages = (summary.groups || []).map((g) => `${g.url}#${g.extra}`);
  return [summary.count, ...pages].join("|");
}

async function checkDuplicates(context) {
  const { browser, isActive, slot, renderBanner, dismissedKey, warn } = context;
  try {
    const summary = await browser.runtime.sendMessage({ action: "get-duplicate-count" });
    if (!isActive() || !summary || summary.count <= 0) return;
    context.signature = duplicateSignature(summary);
    const stored = await browser.storage.local.get(dismissedKey);
    // "Not now" hides the banner until the set of duplicates changes.
    if (stored[dismissedKey] === context.signature) return;
    if (!isActive()) return;
    renderBanner(slot, summary);
  } catch (err) {
    warn("Quick TAB Launcher: duplicate check failed", err);
  }
}

function dismissDuplicateBanner(context, banner) {
  banner.remove();
  context.browser.storage.local
    .set({ [context.dismissedKey]: context.signature })
    .catch((err) => context.warn("Quick TAB Launcher: save failed", err));
}

async function closeDuplicatesFromBanner(context, banner) {
  banner.remove();
  try {
    const result = await context.browser.runtime.sendMessage({ action: "close-duplicates" });
    context.onClosed(result?.closed ?? 0);
  } catch (err) {
    context.warn("Quick TAB Launcher: closing duplicates failed", err);
  }
}

function handleDuplicatesBannerClick(context, e) {
  const dupDismiss = e.target.closest(".qal-duplicate-dismiss");
  if (dupDismiss) {
    e.stopPropagation();
    dismissDuplicateBanner(context, dupDismiss.closest(".qal-duplicate-banner"));
    return;
  }
  const dupAction = e.target.closest(".qal-duplicate-action");
  if (dupAction) {
    e.stopPropagation();
    closeDuplicatesFromBanner(context, dupAction.closest(".qal-duplicate-banner"));
    return;
  }
}

function appendDuplicateGroups(text, groups, more) {
  if (groups.length > 0) {
    const list = createElement("ul", "qal-duplicate-list");
    for (const group of groups) {
      const li = createElement("li", "");
      li.textContent = tCount("duplicates.item", group.extra, {
        title: group.title,
      });
      list.appendChild(li);
    }
    if (more > 0) {
      const li = createElement("li", "");
      li.textContent = tCount("duplicates.more", more);
      list.appendChild(li);
    }
    text.appendChild(list);
  }
}

/**
 * Shows which pages are open more than once, with Close and Not now.
 *
 * @param {HTMLElement} container - Results container.
 * @param {{count: number, groups?: Array, more?: number}} summary - From
 *   the background "get-duplicate-count" message.
 */
function renderDuplicateBanner(container, summary) {
  const { count, groups = [], more = 0 } = summary;
  if (count <= 0) return;
  const existing = container.querySelector(".qal-duplicate-banner");
  if (existing) existing.remove();

  const banner = createElement("div", "qal-duplicate-banner");
  const text = createElement("div", "qal-duplicate-text");
  const headline = createElement("span", "qal-duplicate-headline");
  headline.textContent = tCount("duplicates.banner", count);
  text.appendChild(headline);
  appendDuplicateGroups(text, groups, more);
  const actions = createElement("div", "qal-duplicate-actions");
  const closeBtn = createElement("button", "qal-duplicate-action");
  closeBtn.type = "button";
  closeBtn.textContent = t("duplicates.closeAll");
  const dismissBtn = createElement("button", "qal-duplicate-dismiss");
  dismissBtn.type = "button";
  dismissBtn.textContent = t("duplicates.dismiss");
  actions.append(closeBtn, dismissBtn);
  banner.append(text, actions);
  container.insertBefore(banner, container.firstChild);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createDuplicatesBanner, duplicateSignature, renderDuplicateBanner };
}
