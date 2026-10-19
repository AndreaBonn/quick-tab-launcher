/* global browser, QAL_CONFIG_DEFAULTS, CONFIG_STORAGE_KEY, mergeWithDefaults, t, loadLocale, setLocale, clearLocale, getLocalePreference, applyTranslations, onLocaleChange, buildShortcut, shortcutToKeys */

const TOGGLE_COMMAND = "toggle-launcher";
const AUTOSAVE_DELAY_MS = 400;
const IS_MAC = /mac/i.test(navigator.platform || "");

let autosaveTimeout = null;
let currentShortcut = "";
let isCapturingShortcut = false;

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

function renderShortcut() {
  const container = document.getElementById("qal-shortcut-keys");
  if (!container) return;
  container.textContent = "";
  const keys = shortcutToKeys(currentShortcut, IS_MAC, t("keys.space"));
  if (keys.length === 0) {
    container.textContent = t("options.shortcut.none");
    return;
  }
  for (const key of keys) {
    const kbd = document.createElement("kbd");
    kbd.className = "qal-kbd";
    kbd.textContent = key;
    container.appendChild(kbd);
  }
}

function setShortcutStatus(message, isError = false) {
  const status = document.getElementById("qal-shortcut-status");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("qal-shortcut-status--error", isError);
}

async function loadShortcut() {
  try {
    const commands = await browser.commands.getAll();
    currentShortcut =
      commands.find((c) => c.name === TOGGLE_COMMAND)?.shortcut || "";
  } catch (err) {
    console.warn("Quick TAB Launcher: shortcut unavailable", err);
  }
  renderShortcut();
}

function stopCapture() {
  isCapturingShortcut = false;
  document.removeEventListener("keydown", captureShortcut, true);
  document
    .getElementById("qal-shortcut-change")
    ?.removeAttribute("aria-pressed");
}

async function applyShortcut(shortcut) {
  try {
    await browser.commands.update({ name: TOGGLE_COMMAND, shortcut });
    currentShortcut = shortcut;
    renderShortcut();
    setShortcutStatus(t("options.shortcut.saved"));
    browser.runtime.sendMessage({ action: "refresh-action-title" });
  } catch (err) {
    console.warn("Quick TAB Launcher: shortcut update failed", err);
    setShortcutStatus(t("options.shortcut.failed"), true);
  }
}

function captureShortcut(event) {
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") {
    stopCapture();
    setShortcutStatus("");
    return;
  }
  const result = buildShortcut(event, IS_MAC);
  if (result.pending) return;
  if (result.error) {
    setShortcutStatus(t("options.shortcut.invalid"), true);
    return;
  }
  stopCapture();
  applyShortcut(result.shortcut);
}

function startCapture() {
  if (isCapturingShortcut) return;
  isCapturingShortcut = true;
  document
    .getElementById("qal-shortcut-change")
    ?.setAttribute("aria-pressed", "true");
  setShortcutStatus(t("options.shortcut.prompt"));
  document.addEventListener("keydown", captureShortcut, true);
}

async function resetShortcut() {
  try {
    await browser.commands.reset(TOGGLE_COMMAND);
    await loadShortcut();
    setShortcutStatus(t("options.shortcut.saved"));
    browser.runtime.sendMessage({ action: "refresh-action-title" });
  } catch (err) {
    console.warn("Quick TAB Launcher: shortcut reset failed", err);
    setShortcutStatus(t("options.shortcut.failed"), true);
  }
}

function setupShortcut() {
  const changeBtn = document.getElementById("qal-shortcut-change");
  changeBtn?.addEventListener("click", startCapture);
  // Leaving the button ends recording, so other fields get their keys back.
  changeBtn?.addEventListener("blur", () => {
    if (!isCapturingShortcut) return;
    stopCapture();
    setShortcutStatus("");
  });
  document
    .getElementById("qal-shortcut-reset")
    ?.addEventListener("click", resetShortcut);
  loadShortcut();
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
