import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  QAL_CONFIG_DEFAULTS,
  CONFIG_STORAGE_KEY,
  mergeWithDefaults,
  loadUserConfig,
  saveUserConfig,
  applyConfigToGlobal,
} = require("../src/config-storage.js");

// ---------------------------------------------------------------------------
// mergeWithDefaults
// ---------------------------------------------------------------------------

describe("mergeWithDefaults", () => {
  it("returns defaults when userConfig is empty", () => {
    const defaults = { MAX_TAB_RESULTS: 5, DEBOUNCE_MS: 80 };
    const result = mergeWithDefaults(defaults, {});
    expect(result).toEqual({ MAX_TAB_RESULTS: 5, DEBOUNCE_MS: 80 });
  });

  it("overrides existing keys with userConfig values", () => {
    const defaults = { MAX_TAB_RESULTS: 5, DEBOUNCE_MS: 80 };
    const result = mergeWithDefaults(defaults, { MAX_TAB_RESULTS: 10 });
    expect(result.MAX_TAB_RESULTS).toBe(10);
    expect(result.DEBOUNCE_MS).toBe(80);
  });

  it("ignores unknown keys from userConfig", () => {
    const defaults = { MAX_TAB_RESULTS: 5 };
    const result = mergeWithDefaults(defaults, { UNKNOWN_KEY: 999 });
    expect(result).not.toHaveProperty("UNKNOWN_KEY");
    expect(result.MAX_TAB_RESULTS).toBe(5);
  });

  it("does not mutate the defaults object", () => {
    const defaults = { MAX_TAB_RESULTS: 5 };
    mergeWithDefaults(defaults, { MAX_TAB_RESULTS: 10 });
    expect(defaults.MAX_TAB_RESULTS).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// loadUserConfig
// ---------------------------------------------------------------------------

describe("loadUserConfig", () => {
  beforeEach(() => {
    globalThis.browser = {
      storage: {
        local: {
          get: vi.fn(),
          set: vi.fn(),
        },
      },
    };
  });

  it("returns empty object when storage has no config", async () => {
    globalThis.browser.storage.local.get.mockResolvedValue({});
    const result = await loadUserConfig();
    expect(result).toEqual({});
  });

  it("returns stored config when present", async () => {
    const stored = { MAX_TAB_RESULTS: 8 };
    globalThis.browser.storage.local.get.mockResolvedValue({
      [CONFIG_STORAGE_KEY]: stored,
    });
    const result = await loadUserConfig();
    expect(result).toEqual(stored);
  });

  it("queries storage with the correct key", async () => {
    globalThis.browser.storage.local.get.mockResolvedValue({});
    await loadUserConfig();
    expect(globalThis.browser.storage.local.get).toHaveBeenCalledWith(
      CONFIG_STORAGE_KEY
    );
  });
});

// ---------------------------------------------------------------------------
// saveUserConfig
// ---------------------------------------------------------------------------

describe("saveUserConfig", () => {
  beforeEach(() => {
    globalThis.browser = {
      storage: {
        local: {
          get: vi.fn(),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
  });

  it("writes config under the correct storage key", async () => {
    const config = { MAX_TAB_RESULTS: 7 };
    await saveUserConfig(config);
    expect(globalThis.browser.storage.local.set).toHaveBeenCalledWith({
      [CONFIG_STORAGE_KEY]: config,
    });
  });
});

// ---------------------------------------------------------------------------
// applyConfigToGlobal
// ---------------------------------------------------------------------------

describe("applyConfigToGlobal", () => {
  it("overwrites QAL_CONFIG_DEFAULTS values on the target object", () => {
    const target = { MAX_TAB_RESULTS: 5, DEBOUNCE_MS: 80 };
    const patch = { MAX_TAB_RESULTS: 12 };
    applyConfigToGlobal(target, patch);
    expect(target.MAX_TAB_RESULTS).toBe(12);
    expect(target.DEBOUNCE_MS).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// QAL_CONFIG_DEFAULTS shape
// ---------------------------------------------------------------------------

describe("QAL_CONFIG_DEFAULTS", () => {
  const EXPECTED_KEYS = [
    "MAX_TAB_RESULTS",
    "MAX_BOOKMARK_RESULTS",
    "MAX_HISTORY_RESULTS",
    "DEBOUNCE_MS",
    "HISTORY_DAYS",
    "MIN_QUERY_LENGTH_EXTENDED",
    "LOADING_THRESHOLD_MS",
  ];

  it("contains all required config keys", () => {
    for (const key of EXPECTED_KEYS) {
      expect(QAL_CONFIG_DEFAULTS).toHaveProperty(key);
    }
  });

  it("has positive numeric values for all keys", () => {
    for (const key of EXPECTED_KEYS) {
      expect(typeof QAL_CONFIG_DEFAULTS[key]).toBe("number");
      expect(QAL_CONFIG_DEFAULTS[key]).toBeGreaterThan(0);
    }
  });
});
