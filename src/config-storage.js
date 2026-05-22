/* global browser */

const CONFIG_STORAGE_KEY = "qal_user_config";

const QAL_CONFIG_DEFAULTS = {
  MAX_TAB_RESULTS: 5,
  MAX_BOOKMARK_RESULTS: 5,
  MAX_HISTORY_RESULTS: 5,
  DEBOUNCE_MS: 80,
  HISTORY_DAYS: 30,
  MIN_QUERY_LENGTH_EXTENDED: 2,
  LOADING_THRESHOLD_MS: 300,
  ENABLE_FULLTEXT_SEARCH: false,
  FULLTEXT_MAX_LENGTH: 10000,
};

/**
 * Merges userConfig into defaults, ignoring unknown keys.
 * Does not mutate the defaults object.
 *
 * @param {object} defaults - Reference config with all valid keys.
 * @param {object} userConfig - Partial user overrides from storage.
 * @returns {object} New merged config object.
 */
function mergeWithDefaults(defaults, userConfig) {
  const merged = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (Object.prototype.hasOwnProperty.call(userConfig, key)) {
      merged[key] = userConfig[key];
    }
  }
  return merged;
}

/**
 * Reads user config from browser.storage.local.
 *
 * @returns {Promise<object>} Stored config or empty object if absent.
 */
async function loadUserConfig() {
  const result = await browser.storage.local.get(CONFIG_STORAGE_KEY);
  return result[CONFIG_STORAGE_KEY] ?? {};
}

/**
 * Persists config to browser.storage.local.
 *
 * @param {object} config - Config object to store.
 * @returns {Promise<void>}
 */
async function saveUserConfig(config) {
  await browser.storage.local.set({ [CONFIG_STORAGE_KEY]: config });
}

/**
 * Applies a config patch onto a target object in-place.
 *
 * @param {object} target - The global config object to update.
 * @param {object} patch - Partial config values to apply.
 */
function applyConfigToGlobal(target, patch) {
  Object.assign(target, patch);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CONFIG_STORAGE_KEY,
    QAL_CONFIG_DEFAULTS,
    mergeWithDefaults,
    loadUserConfig,
    saveUserConfig,
    applyConfigToGlobal,
  };
}
