/* global renderDuplicateBanner */

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

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createDuplicatesBanner, duplicateSignature };
}
