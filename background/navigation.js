/* global browser, isPrivilegedUrl */

async function handleNavigate(message, senderTabId) {
  try {
    if (message.type === "tab") {
      await browser.tabs.update(message.tabId, { active: true });
      const tab = await browser.tabs.get(message.tabId);
      await browser.windows.update(tab.windowId, { focused: true });
    } else if (message.type === "bookmark" || message.type === "history") {
      if (isPrivilegedUrl(message.url)) return;
      if (message.openInCurrent) {
        await browser.tabs.update(senderTabId, { url: message.url });
      } else {
        await browser.tabs.create({ url: message.url, active: true });
      }
    }
    if (senderTabId) {
      await browser.tabs.sendMessage(senderTabId, { action: "close" });
    }
  } catch (err) {
    console.log("Quick TAB Launcher: navigazione fallita", err.message);
  }
}

const WEB_SEARCH_PERMISSION = { permissions: ["search"] };

// Optional permission: users turn web search on from the settings page.
async function hasWebSearchPermission() {
  try {
    return await browser.permissions.contains(WEB_SEARCH_PERMISSION);
  } catch {
    return false;
  }
}

/**
 * Searches the web with Firefox's default engine.
 *
 * @param {{query: string, newTab: boolean}} message - From the panel.
 * @param {number|undefined} senderTabId - Tab the overlay is on; absent from the popup.
 * @returns {Promise<boolean>} Whether a search was started.
 */
async function runWebSearch({ query, newTab }, senderTabId) {
  if (!query?.trim() || !(await hasWebSearchPermission())) return false;
  const target =
    newTab || !senderTabId
      ? { disposition: "NEW_TAB" }
      : { tabId: senderTabId };
  try {
    await browser.search.query({ text: query, ...target });
    return true;
  } catch (err) {
    console.log("Quick TAB Launcher: ricerca web fallita", err.message);
    return false;
  }
}

async function handleCloseTab(tabId) {
  try {
    await browser.tabs.remove(tabId);
    return true;
  } catch (err) {
    console.log("Quick TAB Launcher: chiusura tab fallita", err.message);
    return false;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { handleNavigate, hasWebSearchPermission, runWebSearch, handleCloseTab };
}
