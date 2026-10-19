import { vi } from "vitest";

const MODULES = [
  "../../src/config-storage.js",
  "../../src/search-utils.js",
  "../../src/fuzzy.js",
  "../../src/i18n.js",
  "../../src/commands.js",
  "../../src/icons.js",
  "../../src/hints.js",
  "../../src/render-utils.js",
  "../../src/panel-extras.js",
  "../../src/onboarding.js",
];

/**
 * Browser mock with an in-memory storage and per-action message replies.
 *
 * @param {object} replies - action name -> reply value or function(message).
 */
export function createBrowserMock(replies = {}) {
  const store = {};
  return {
    store,
    i18n: { getUILanguage: () => "it-IT" },
    runtime: {
      getURL: vi.fn((path) => `moz-extension://fake-id/${path}`),
      sendMessage: vi.fn(async (message) => {
        const reply = replies[message.action];
        if (typeof reply === "function") return reply(message);
        if (reply !== undefined) return reply;
        if (message.action === "search") {
          return { tabs: [], bookmarks: [], history: [] };
        }
        if (message.action === "get-recent-tabs") {
          return { recentActive: [], recentlyClosed: [] };
        }
        if (message.action === "get-duplicate-count") return { count: 0 };
        return {};
      }),
      onMessage: { addListener: vi.fn() },
    },
    storage: {
      local: {
        get: vi.fn(async (key) => (key in store ? { [key]: store[key] } : {})),
        set: vi.fn(async (items) => Object.assign(store, items)),
      },
      onChanged: { addListener: vi.fn() },
    },
  };
}

/**
 * Loads every launcher dependency as a global, then launcher.js itself, with
 * the shadow root forced open so tests can inspect it.
 */
export async function loadLauncher(browserMock) {
  globalThis.browser = browserMock;
  for (const path of MODULES) {
    Object.assign(globalThis, require(path));
  }
  require("../../src/i18n.js").setLocaleFromStorage("it");

  let shadowRoot = null;
  const originalAttachShadow = HTMLElement.prototype.attachShadow;
  HTMLElement.prototype.attachShadow = function (options) {
    shadowRoot = originalAttachShadow.call(this, { ...options, mode: "open" });
    return shadowRoot;
  };
  delete require.cache[require.resolve("../../content/launcher.js")];
  require("../../content/launcher.js");
  await new Promise((r) => setTimeout(r, 0));
  HTMLElement.prototype.attachShadow = originalAttachShadow;

  const messageListener =
    browserMock.runtime.onMessage.addListener.mock.calls[0][0];
  return { shadowRoot, messageListener };
}

export function cleanupLauncher() {
  document.getElementById("qal-shadow-host")?.remove();
  delete globalThis.browser;
}

export function settle(ms = 30) {
  return new Promise((r) => setTimeout(r, ms));
}

export function press(input, key, extra = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    cancelable: true,
    ...extra,
  });
  input.dispatchEvent(event);
  return event;
}

export async function type(input, text) {
  input.value = text;
  input.dispatchEvent(new Event("input"));
  await settle(globalThis.QAL_CONFIG.DEBOUNCE_MS + 60);
}
