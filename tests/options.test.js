import { describe, it, expect, vi } from "vitest";

const {
  QAL_CONFIG_DEFAULTS,
  CONFIG_STORAGE_KEY,
  mergeWithDefaults,
} = require("../src/config-storage.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal browser mock with storage support.
 */
function createBrowserMock(storedConfig = {}) {
  const storage = {
    [CONFIG_STORAGE_KEY]: storedConfig,
  };
  return {
    storage: {
      local: {
        get: vi.fn(async (key) => {
          if (storage[key] !== undefined) return { [key]: storage[key] };
          return {};
        }),
        set: vi.fn(async (items) => {
          Object.assign(storage, items);
        }),
        remove: vi.fn(async () => {
          delete storage[CONFIG_STORAGE_KEY];
        }),
      },
    },
  };
}

/**
 * Builds the options page DOM and loads options.js.
 */
function loadOptionsPage(browserMock) {
  globalThis.browser = browserMock;
  globalThis.QAL_CONFIG_DEFAULTS = QAL_CONFIG_DEFAULTS;
  globalThis.CONFIG_STORAGE_KEY = CONFIG_STORAGE_KEY;
  globalThis.mergeWithDefaults = mergeWithDefaults;

  // Minimal DOM matching options.html structure
  document.body.innerHTML = `
    <form id="qal-options-form">
      <input id="qal-max-tab-results" type="number" />
      <input id="qal-max-bookmark-results" type="number" />
      <input id="qal-max-history-results" type="number" />
      <input id="qal-debounce-ms" type="number" />
      <input id="qal-history-days" type="number" />
      <input id="qal-min-query-length" type="number" />
      <input id="qal-loading-threshold-ms" type="number" />
      <button type="submit" id="qal-save-btn">Salva</button>
      <button type="button" id="qal-reset-btn">Ripristina</button>
      <p id="qal-feedback" class="qal-options-feedback"></p>
    </form>
  `;

  delete require.cache[require.resolve("../options/options.js")];
  require("../options/options.js");

  // Trigger DOMContentLoaded to initialize
  document.dispatchEvent(new Event("DOMContentLoaded"));
}

// ---------------------------------------------------------------------------
// Test: form population
// ---------------------------------------------------------------------------

describe("options page - form population", () => {
  it("populates inputs with stored values when config exists in storage", async () => {
    const stored = {
      MAX_TAB_RESULTS: 8,
      MAX_BOOKMARK_RESULTS: 7,
      MAX_HISTORY_RESULTS: 6,
      DEBOUNCE_MS: 120,
      HISTORY_DAYS: 14,
      MIN_QUERY_LENGTH_EXTENDED: 3,
      LOADING_THRESHOLD_MS: 500,
    };
    const mock = createBrowserMock(stored);
    loadOptionsPage(mock);

    // Wait for async loadSettings to complete
    await new Promise((r) => setTimeout(r, 0));

    expect(document.getElementById("qal-max-tab-results").value).toBe("8");
    expect(document.getElementById("qal-max-bookmark-results").value).toBe("7");
    expect(document.getElementById("qal-debounce-ms").value).toBe("120");
  });

  it("populates inputs with defaults when storage is empty", async () => {
    const mock = createBrowserMock({});
    mock.storage.local.get = vi.fn().mockResolvedValue({});
    loadOptionsPage(mock);

    await new Promise((r) => setTimeout(r, 0));

    expect(document.getElementById("qal-max-tab-results").value).toBe(
      String(QAL_CONFIG_DEFAULTS.MAX_TAB_RESULTS)
    );
    expect(document.getElementById("qal-debounce-ms").value).toBe(
      String(QAL_CONFIG_DEFAULTS.DEBOUNCE_MS)
    );
  });
});

// ---------------------------------------------------------------------------
// Test: save
// ---------------------------------------------------------------------------

describe("options page - save", () => {
  it("writes correct values to storage on form submit", async () => {
    const mock = createBrowserMock({});
    mock.storage.local.get = vi.fn().mockResolvedValue({});
    loadOptionsPage(mock);
    await new Promise((r) => setTimeout(r, 0));

    // Set input values
    document.getElementById("qal-max-tab-results").value = "9";
    document.getElementById("qal-max-bookmark-results").value = "4";
    document.getElementById("qal-max-history-results").value = "4";
    document.getElementById("qal-debounce-ms").value = "100";
    document.getElementById("qal-history-days").value = "7";
    document.getElementById("qal-min-query-length").value = "2";
    document.getElementById("qal-loading-threshold-ms").value = "200";

    document
      .getElementById("qal-options-form")
      .dispatchEvent(new Event("submit", { cancelable: true }));

    await new Promise((r) => setTimeout(r, 0));

    expect(mock.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        [CONFIG_STORAGE_KEY]: expect.objectContaining({
          MAX_TAB_RESULTS: 9,
          DEBOUNCE_MS: 100,
        }),
      })
    );
  });

  it("rejects negative values and does not save", async () => {
    const mock = createBrowserMock({});
    mock.storage.local.get = vi.fn().mockResolvedValue({});
    loadOptionsPage(mock);
    await new Promise((r) => setTimeout(r, 0));

    document.getElementById("qal-max-tab-results").value = "-1";
    document.getElementById("qal-max-bookmark-results").value = "5";
    document.getElementById("qal-max-history-results").value = "5";
    document.getElementById("qal-debounce-ms").value = "80";
    document.getElementById("qal-history-days").value = "30";
    document.getElementById("qal-min-query-length").value = "2";
    document.getElementById("qal-loading-threshold-ms").value = "300";

    document
      .getElementById("qal-options-form")
      .dispatchEvent(new Event("submit", { cancelable: true }));

    await new Promise((r) => setTimeout(r, 0));

    expect(mock.storage.local.set).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test: reset
// ---------------------------------------------------------------------------

describe("options page - reset", () => {
  it("repopulates form with defaults after reset", async () => {
    const stored = { MAX_TAB_RESULTS: 20 };
    const mock = createBrowserMock(stored);
    loadOptionsPage(mock);
    await new Promise((r) => setTimeout(r, 0));

    document.getElementById("qal-reset-btn").click();
    await new Promise((r) => setTimeout(r, 0));

    expect(document.getElementById("qal-max-tab-results").value).toBe(
      String(QAL_CONFIG_DEFAULTS.MAX_TAB_RESULTS)
    );
  });
});
