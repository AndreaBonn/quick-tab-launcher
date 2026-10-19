import { vi } from "vitest";

const {
  QAL_CONFIG,
  deduplicateResults,
  normalizeUrl,
} = require("../../src/search-utils.js");

/**
 * Browser API mock factory.
 * Returns a mock `browser` object matching the WebExtension APIs
 * used by background.js.
 */
export function createBrowserMock() {
  return {
    commands: {
      onCommand: { addListener: vi.fn() },
      getAll: vi
        .fn()
        .mockResolvedValue([
          { name: "toggle-launcher", shortcut: "Ctrl+Shift+Space" },
        ]),
    },
    browserAction: {
      onClicked: { addListener: vi.fn() },
      setPopup: vi.fn().mockResolvedValue(undefined),
      setTitle: vi.fn().mockResolvedValue(undefined),
      openPopup: vi.fn().mockResolvedValue(undefined),
    },
    runtime: {
      onMessage: { addListener: vi.fn() },
      openOptionsPage: vi.fn().mockResolvedValue(undefined),
      onInstalled: { addListener: vi.fn() },
      sendMessage: vi.fn().mockResolvedValue(undefined),
      getManifest: vi.fn(() => ({
        content_scripts: [{ js: ["src/i18n.js", "content/launcher.js"] }],
      })),
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: { addListener: vi.fn() },
    },
    tabs: {
      query: vi.fn().mockResolvedValue([]),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue({}),
      get: vi
        .fn()
        .mockResolvedValue({ windowId: 1, url: "https://example.com" }),
      create: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue(undefined),
      executeScript: vi.fn().mockResolvedValue([]),
      onActivated: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
    },
    bookmarks: {
      search: vi.fn().mockResolvedValue([]),
    },
    history: {
      search: vi.fn().mockResolvedValue([]),
    },
    windows: {
      update: vi.fn().mockResolvedValue({}),
      onFocusChanged: { addListener: vi.fn() },
      WINDOW_ID_NONE: -1,
    },
  };
}

/**
 * Loads background.js in a controlled environment.
 * Captures the listener callbacks registered on browser.commands and browser.runtime.
 */
const {
  QAL_CONFIG_DEFAULTS,
  CONFIG_STORAGE_KEY,
  mergeWithDefaults,
  loadUserConfig,
  saveUserConfig,
  applyConfigToGlobal,
} = require("../../src/config-storage.js");

export function loadBackground(browserMock) {
  globalThis.browser = browserMock;
  globalThis.QAL_CONFIG = QAL_CONFIG;
  globalThis.QAL_CONFIG_DEFAULTS = QAL_CONFIG_DEFAULTS;
  globalThis.CONFIG_STORAGE_KEY = CONFIG_STORAGE_KEY;
  globalThis.mergeWithDefaults = mergeWithDefaults;
  globalThis.loadUserConfig = loadUserConfig;
  globalThis.saveUserConfig = saveUserConfig;
  globalThis.applyConfigToGlobal = applyConfigToGlobal;
  globalThis.deduplicateResults = deduplicateResults;
  globalThis.normalizeUrl = normalizeUrl;

  Object.assign(globalThis, require("../../src/search-utils.js"));

  delete require.cache[require.resolve("../../background/search.js")];
  Object.assign(globalThis, require("../../background/search.js"));

  // Clear module cache to re-execute background.js
  delete require.cache[require.resolve("../../background/background.js")];
  const bg = require("../../background/background.js");

  // Expose testable internals to globalThis for unit tests
  if (bg && bg.isPrivilegedUrl) {
    globalThis.isPrivilegedUrl = bg.isPrivilegedUrl;
  }
  if (bg && bg.updatePopupForTab) {
    globalThis.updatePopupForTab = bg.updatePopupForTab;
  }

  const commandListener =
    browserMock.commands.onCommand.addListener.mock.calls[0][0];
  const messageListener =
    browserMock.runtime.onMessage.addListener.mock.calls[0][0];
  const browserActionListener =
    browserMock.browserAction.onClicked.addListener.mock.calls[0][0];
  const tabActivatedListener =
    browserMock.tabs.onActivated.addListener.mock.calls[0]?.[0];
  const tabUpdatedListener =
    browserMock.tabs.onUpdated.addListener.mock.calls[0]?.[0];

  // Reset call history accumulated during module load (init queries, etc.)
  // so individual tests can assert cleanly on their own interactions.
  browserMock.tabs.query.mockClear();
  browserMock.tabs.sendMessage.mockClear();
  browserMock.browserAction.setPopup.mockClear();

  return {
    commandListener,
    messageListener,
    browserActionListener,
    tabActivatedListener,
    tabUpdatedListener,
  };
}

