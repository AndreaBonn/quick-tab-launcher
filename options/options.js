/* global browser, QAL_CONFIG_DEFAULTS, CONFIG_STORAGE_KEY, mergeWithDefaults */

const FIELD_MAP = [
  { inputId: "qal-max-tab-results", configKey: "MAX_TAB_RESULTS", min: 1, max: 50 },
  { inputId: "qal-max-bookmark-results", configKey: "MAX_BOOKMARK_RESULTS", min: 1, max: 50 },
  { inputId: "qal-max-history-results", configKey: "MAX_HISTORY_RESULTS", min: 1, max: 50 },
  { inputId: "qal-debounce-ms", configKey: "DEBOUNCE_MS", min: 0, max: 2000 },
  { inputId: "qal-history-days", configKey: "HISTORY_DAYS", min: 1, max: 365 },
  { inputId: "qal-min-query-length", configKey: "MIN_QUERY_LENGTH_EXTENDED", min: 1, max: 10 },
  { inputId: "qal-loading-threshold-ms", configKey: "LOADING_THRESHOLD_MS", min: 0, max: 5000 },
];

function populateForm(config) {
  for (const field of FIELD_MAP) {
    const input = document.getElementById(field.inputId);
    if (input) input.value = config[field.configKey];
  }
}

function readFormValues() {
  const values = {};
  for (const field of FIELD_MAP) {
    const input = document.getElementById(field.inputId);
    if (input) values[field.configKey] = Number(input.value);
  }
  return values;
}

function validateValues(values) {
  for (const field of FIELD_MAP) {
    const val = values[field.configKey];
    if (!Number.isFinite(val) || val < field.min || val > field.max) {
      return false;
    }
  }
  return true;
}

function showFeedback(message, isError = false) {
  const el = document.getElementById("qal-feedback");
  if (!el) return;
  el.textContent = message;
  el.className = isError
    ? "qal-options-feedback qal-options-feedback--error"
    : "qal-options-feedback qal-options-feedback--success";
  setTimeout(() => {
    el.textContent = "";
    el.className = "qal-options-feedback";
  }, 3000);
}

async function loadSettings() {
  const result = await browser.storage.local.get(CONFIG_STORAGE_KEY);
  const userConfig = result[CONFIG_STORAGE_KEY] ?? {};
  const config = mergeWithDefaults(QAL_CONFIG_DEFAULTS, userConfig);
  populateForm(config);
}

async function saveSettings(event) {
  event.preventDefault();
  const values = readFormValues();
  if (!validateValues(values)) {
    showFeedback("Valori non validi. Controlla i campi.", true);
    return;
  }
  await browser.storage.local.set({ [CONFIG_STORAGE_KEY]: values });
  showFeedback("Impostazioni salvate.");
}

async function resetDefaults() {
  await browser.storage.local.remove(CONFIG_STORAGE_KEY);
  populateForm(QAL_CONFIG_DEFAULTS);
  showFeedback("Impostazioni ripristinate ai valori predefiniti.");
}

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();

  const form = document.getElementById("qal-options-form");
  if (form) form.addEventListener("submit", saveSettings);

  const resetBtn = document.getElementById("qal-reset-btn");
  if (resetBtn) resetBtn.addEventListener("click", resetDefaults);
});
