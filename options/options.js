/* global browser, QAL_CONFIG_DEFAULTS, CONFIG_STORAGE_KEY, mergeWithDefaults, t, loadLocale, setLocale, clearLocale, getLocalePreference, applyTranslations, onLocaleChange, setupShortcut, renderShortcut */

const WELCOME_PAGE = "welcome/welcome.html";
const WEB_SEARCH_PERMISSION = { permissions: ["search"] };
const AUTOSAVE_DELAY_MS = 400;

let autosaveTimeout = null;

const FIELD_MAP = [
  {
    inputId: "qal-max-tab-results",
    configKey: "MAX_TAB_RESULTS",
    min: 1,
    max: 50,
  },
  {
    inputId: "qal-max-bookmark-results",
    configKey: "MAX_BOOKMARK_RESULTS",
    min: 1,
    max: 50,
  },
  {
    inputId: "qal-max-history-results",
    configKey: "MAX_HISTORY_RESULTS",
    min: 1,
    max: 50,
  },
  { inputId: "qal-debounce-ms", configKey: "DEBOUNCE_MS", min: 0, max: 2000 },
  { inputId: "qal-history-days", configKey: "HISTORY_DAYS", min: 1, max: 365 },
  {
    inputId: "qal-min-query-length",
    configKey: "MIN_QUERY_LENGTH_EXTENDED",
    min: 1,
    max: 10,
  },
  {
    inputId: "qal-loading-threshold-ms",
    configKey: "LOADING_THRESHOLD_MS",
    min: 0,
    max: 5000,
  },
  {
    inputId: "qal-enable-fulltext-search",
    configKey: "ENABLE_FULLTEXT_SEARCH",
    type: "checkbox",
  },
];

function populateForm(config) {
  for (const field of FIELD_MAP) {
    const input = document.getElementById(field.inputId);
    if (!input) continue;
    if (field.type === "checkbox") {
      input.checked = !!config[field.configKey];
    } else {
      input.value = config[field.configKey];
    }
  }
}

function readFormValues() {
  const values = {};
  for (const field of FIELD_MAP) {
    const input = document.getElementById(field.inputId);
    if (!input) continue;
    if (field.type === "checkbox") {
      values[field.configKey] = input.checked;
    } else {
      // An emptied field reads as NaN, not 0, so validation rejects it.
      const raw = input.value.trim();
      values[field.configKey] = raw === "" ? NaN : Number(raw);
    }
  }
  return values;
}

function validateValues(values) {
  for (const field of FIELD_MAP) {
    if (field.type === "checkbox") continue;
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

function updateLocaleSelect() {
  const select = document.getElementById("qal-locale-select");
  if (select) select.value = getLocalePreference();
}

function setupLocaleSelect() {
  const select = document.getElementById("qal-locale-select");
  if (!select) return;
  select.addEventListener("change", async () => {
    if (select.value === "auto") await clearLocale();
    else await setLocale(select.value);
  });
  updateLocaleSelect();
}

function markInvalidFields(values) {
  for (const field of FIELD_MAP) {
    if (field.type === "checkbox") continue;
    const input = document.getElementById(field.inputId);
    if (!input) continue;
    const val = values[field.configKey];
    const isValid =
      Number.isFinite(val) && val >= field.min && val <= field.max;
    input.toggleAttribute("aria-invalid", !isValid);
  }
}

async function autosave() {
  const values = readFormValues();
  markInvalidFields(values);
  if (!validateValues(values)) {
    showFeedback(t("options.feedback.invalid"), true);
    return;
  }
  await browser.storage.local.set({ [CONFIG_STORAGE_KEY]: values });
  showFeedback(t("options.feedback.saved"));
}

function scheduleAutosave() {
  clearTimeout(autosaveTimeout);
  autosaveTimeout = setTimeout(autosave, AUTOSAVE_DELAY_MS);
}

async function setupWebSearch() {
  const toggle = document.getElementById("qal-web-search");
  if (!toggle) return;
  try {
    toggle.checked = await browser.permissions.contains(WEB_SEARCH_PERMISSION);
  } catch (err) {
    console.warn("Quick TAB Launcher: permission state unavailable", err);
  }
  // Follow changes made elsewhere, e.g. revoked from the add-ons manager.
  const sync = (change) => {
    if (change.permissions?.includes("search")) syncWebSearchToggle(toggle);
  };
  browser.permissions.onAdded?.addListener(sync);
  browser.permissions.onRemoved?.addListener(sync);

  toggle.addEventListener("change", async (event) => {
    // Not part of the saved settings: the permission itself is the state.
    event.stopPropagation();
    try {
      if (!toggle.checked) {
        await browser.permissions.remove(WEB_SEARCH_PERMISSION);
        return;
      }
      // request() must be the first call in the user's click handler.
      const granted = await browser.permissions.request(WEB_SEARCH_PERMISSION);
      toggle.checked = granted;
      if (!granted) showFeedback(t("options.feedback.webSearchDenied"), true);
    } catch (err) {
      console.warn("Quick TAB Launcher: permission change failed", err);
      showFeedback(t("options.feedback.webSearchDenied"), true);
      await syncWebSearchToggle(toggle);
    }
  });
}

async function syncWebSearchToggle(toggle) {
  try {
    toggle.checked = await browser.permissions.contains(WEB_SEARCH_PERMISSION);
  } catch {
    toggle.checked = false;
  }
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
    showFeedback(t("options.feedback.invalid"), true);
    return;
  }
  await browser.storage.local.set({ [CONFIG_STORAGE_KEY]: values });
  showFeedback(t("options.feedback.saved"));
}

async function resetDefaults() {
  await browser.storage.local.remove(CONFIG_STORAGE_KEY);
  populateForm(QAL_CONFIG_DEFAULTS);
  showFeedback(t("options.feedback.reset"));
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadLocale();
  applyTranslations(document);
  setupLocaleSelect();
  setupShortcut();
  setupWebSearch();
  document.getElementById("qal-open-welcome")?.addEventListener("click", () => {
    browser.tabs.create({ url: browser.runtime.getURL(WELCOME_PAGE) });
  });
  loadSettings();

  const form = document.getElementById("qal-options-form");
  if (form) {
    form.addEventListener("submit", saveSettings);
    form.addEventListener("input", scheduleAutosave);
    form.addEventListener("change", scheduleAutosave);
  }

  const resetBtn = document.getElementById("qal-reset-btn");
  if (resetBtn) resetBtn.addEventListener("click", resetDefaults);

  onLocaleChange(() => {
    applyTranslations(document);
    updateLocaleSelect();
    renderShortcut();
  });
});
