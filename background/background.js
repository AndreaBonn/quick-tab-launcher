/* global handleNavigate, hasWebSearchPermission, runWebSearch, handleCloseTab, isPrivilegedUrl, handleSearch, browser, QAL_CONFIG, QAL_CONFIG_DEFAULTS, loadUserConfig, mergeWithDefaults, applyConfigToGlobal, CONFIG_STORAGE_KEY, executeCommand, getRecentTabs, restoreSession, closeDomainTabs, closeDuplicateTabs, getDuplicateSummary, previewCommand, undoClose, getActiveTabState */

const PRODUCT_NAME = "Quick Tab Launcher";
const TOGGLE_COMMAND = "toggle-launcher";

// Read synchronously by the shortcut handler: openPopup() only works while
// the keyboard shortcut still counts as a user action, i.e. before any await.
let isActiveTabPrivileged = false;

async function updatePopupForTab(tabId) {
  try {
    const tab = await browser.tabs.get(tabId);
    isActiveTabPrivileged = isPrivilegedUrl(tab.url);
    if (isActiveTabPrivileged) {
      await browser.browserAction.setPopup({ popup: "popup/popup.html" });
    } else {
      await browser.browserAction.setPopup({ popup: "" });
    }
  } catch (err) {
    console.warn("Quick TAB Launcher: popup update failed", err);
  }
}

async function initConfig() {
  const userConfig = await loadUserConfig();
  const merged = mergeWithDefaults(QAL_CONFIG_DEFAULTS, userConfig);
  applyConfigToGlobal(QAL_CONFIG, merged);
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[CONFIG_STORAGE_KEY]) return;
  const userConfig = changes[CONFIG_STORAGE_KEY].newValue ?? {};
  const merged = mergeWithDefaults(QAL_CONFIG_DEFAULTS, userConfig);
  applyConfigToGlobal(QAL_CONFIG, merged);
});

initConfig();

async function resolveCurrentTabId(sender) {
  if (sender.tab?.id) return sender.tab.id;
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  return activeTab?.id;
}

// Tabs opened before install or update have no content script yet: inject
// the same files the manifest declares, in the same order.
async function injectLauncher(tabId) {
  const [contentScript] = browser.runtime.getManifest().content_scripts;
  for (const file of contentScript.js) {
    await browser.tabs.executeScript(tabId, { file });
  }
}

async function toggleLauncher() {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!activeTab?.id) return;
  try {
    await browser.tabs.sendMessage(activeTab.id, { action: "toggle" });
  } catch {
    // Tab opened before install: no content script yet, inject and retry.
    try {
      await injectLauncher(activeTab.id);
      await browser.tabs.sendMessage(activeTab.id, { action: "toggle" });
    } catch (err) {
      console.log("Quick TAB Launcher: pagina non supportata", err.message);
    }
  }
}

// Lets the welcome page confirm that the user found the shortcut. Nobody may
// be listening, which is fine.
function announceShortcutUsed() {
  browser.runtime
    .sendMessage({ action: "shortcut-used" })
    .catch(() => undefined);
}

browser.commands.onCommand.addListener(async (command) => {
  if (command !== TOGGLE_COMMAND) return;
  if (isActiveTabPrivileged) {
    browser.browserAction.openPopup().catch((err) => {
      console.log("Quick TAB Launcher: popup non aperto", err.message);
    });
    announceShortcutUsed();
    return;
  }
  announceShortcutUsed();
  await toggleLauncher();
});

const WELCOME_PAGE = "welcome/welcome.html";

browser.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== "install") return;
  try {
    await browser.tabs.create({ url: browser.runtime.getURL(WELCOME_PAGE) });
  } catch (err) {
    console.warn("Quick TAB Launcher: welcome page not opened", err);
  }
});

async function refreshActionTitle() {
  try {
    const commands = await browser.commands.getAll();
    const shortcut = commands.find((c) => c.name === TOGGLE_COMMAND)?.shortcut;
    const title = shortcut ? `${PRODUCT_NAME} (${shortcut})` : PRODUCT_NAME;
    await browser.browserAction.setTitle({ title });
  } catch (err) {
    console.warn("Quick TAB Launcher: title update failed", err);
  }
}

refreshActionTitle();

browser.browserAction.onClicked.addListener(async () => {
  await toggleLauncher();
});

browser.tabs.onActivated.addListener((activeInfo) => {
  updatePopupForTab(activeInfo.tabId);
});

// The privileged-page flag follows the active tab of the focused window.
browser.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === browser.windows.WINDOW_ID_NONE) return;
  const [activeTab] = await browser.tabs.query({ active: true, windowId });
  if (activeTab?.id) updatePopupForTab(activeTab.id);
});

browser.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (!changeInfo.url) return;
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (activeTab?.id === tabId) {
    updatePopupForTab(tabId);
  }
});

browser.tabs
  .query({ active: true, currentWindow: true })
  .then(([activeTab]) => {
    if (activeTab?.id) updatePopupForTab(activeTab.id);
  });

function logRouteFailure(action) {
  return (err) =>
    console.warn(`Quick TAB Launcher: "${action}" handler failed`, err);
}

const MESSAGE_ROUTES = {
  search: (message, sender, sendResponse) => {
    const senderWindowId = sender.tab?.windowId;
    handleSearch(message.query, senderWindowId)
      .then(sendResponse)
      .catch(logRouteFailure("search"));
    return true;
  },
  navigate: (message, sender) => {
    handleNavigate(message, sender.tab?.id).catch(logRouteFailure("navigate"));
    return false;
  },
  "close-tab": (message, _sender, sendResponse) => {
    handleCloseTab(message.tabId)
      .then((ok) => sendResponse({ closed: ok ? 1 : 0 }))
      .catch(logRouteFailure("close-tab"));
    return true;
  },
  "get-recent-tabs": (_message, sender, sendResponse) => {
    resolveCurrentTabId(sender)
      .then((tabId) => getRecentTabs(tabId))
      .then(sendResponse)
      .catch(logRouteFailure("get-recent-tabs"));
    return true;
  },
  "get-active-tab-state": (_message, sender, sendResponse) => {
    getActiveTabState(sender.tab)
      .then(sendResponse)
      .catch(logRouteFailure("get-active-tab-state"));
    return true;
  },
  "preview-command": (message, _sender, sendResponse) => {
    previewCommand(message.commandId)
      .then(sendResponse)
      .catch(logRouteFailure("preview-command"));
    return true;
  },
  "undo-close": (message, _sender, sendResponse) => {
    undoClose(message.count)
      .then(sendResponse)
      .catch(logRouteFailure("undo-close"));
    return true;
  },
  "get-web-search-state": (_message, _sender, sendResponse) => {
    hasWebSearchPermission()
      .then((enabled) => sendResponse({ enabled }))
      .catch(logRouteFailure("get-web-search-state"));
    return true;
  },
  "web-search": (message, sender, sendResponse) => {
    runWebSearch(message, sender.tab?.id)
      .then((ok) => sendResponse({ ok }))
      .catch(logRouteFailure("web-search"));
    return true;
  },
  "open-options": () => {
    browser.runtime.openOptionsPage().catch(logRouteFailure("open-options"));
    return false;
  },
  "refresh-action-title": () => {
    refreshActionTitle().catch(logRouteFailure("refresh-action-title"));
    return false;
  },
  "restore-session": (message) => {
    restoreSession(message.sessionId).catch(logRouteFailure("restore-session"));
    return false;
  },
  "get-duplicate-count": (_message, _sender, sendResponse) => {
    getDuplicateSummary()
      .then(sendResponse)
      .catch(logRouteFailure("get-duplicate-count"));
    return true;
  },
  "close-duplicates": (_message, _sender, sendResponse) => {
    closeDuplicateTabs()
      .then(sendResponse)
      .catch(logRouteFailure("close-duplicates"));
    return true;
  },
  "execute-command": (message, _sender, sendResponse) => {
    executeCommand(message.commandId)
      .then(sendResponse)
      .catch(logRouteFailure("execute-command"));
    return true;
  },
  "close-domain-tabs": (message, _sender, sendResponse) => {
    closeDomainTabs(message.domain)
      .then(sendResponse)
      .catch(logRouteFailure("close-domain-tabs"));
    return true;
  },
};

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (typeof message.action !== "string") return false;
  // Object.hasOwn needs Firefox 92; the manifest still supports 91.
  if (!Object.prototype.hasOwnProperty.call(MESSAGE_ROUTES, message.action)) {
    return false;
  }
  return MESSAGE_ROUTES[message.action](message, sender, sendResponse);
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = { isPrivilegedUrl, updatePopupForTab };
}
