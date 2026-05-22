/* global browser */

const I18N_STORAGE_KEY = "qal_locale";
const I18N_DEFAULT_LOCALE = "it";
const I18N_SUPPORTED_LOCALES = ["it", "en"];

const I18N_MESSAGES = {
  it: {
    "launcher.placeholder": "Cerca schede, segnalibri, cronologia...",
    "launcher.escHint": "ESC per chiudere",
    "launcher.footer.navigate": "\u2191\u2193 naviga",
    "launcher.footer.open": "\u21B5 apri",
    "launcher.footer.newTab": "Ctrl+\u21B5 nuova scheda",
    "launcher.footer.fulltext": "Alt+C contenuto",
    "launcher.footer.close": "ESC chiudi",
    "launcher.footer.commands": "> comandi",
    "launcher.footer.group": "Alt+G raggruppa",
    "sections.tabs": "Schede aperte",
    "sections.bookmarks": "Segnalibri",
    "sections.history": "Cronologia",
    "sections.recent-active": "Schede recenti",
    "sections.recent-closed": "Chiuse di recente",
    "sections.commands": "Comandi",
    "launcher.fulltextToggle": "Contenuto",
    "launcher.fulltextToggle.tooltip.on":
      "Ricerca nel contenuto attiva (Alt+C)",
    "launcher.fulltextToggle.tooltip.off":
      "Ricerca nel contenuto disattiva (Alt+C)",
    "badges.contentMatch": "Match nel contenuto",
    "badges.otherWindow": "Altra finestra",
    "badges.closeTab": "Chiudi scheda",
    "states.empty": "Inizia a digitare per cercare...",
    "states.noResults": "Nessun risultato per \u00ab{{query}}\u00bb",
    "states.loading": "Ricerca in corso...",
    "states.error": "Errore durante la ricerca. Riprova.",
    "duplicates.banner": "{{count}} schede duplicate trovate",
    "duplicates.closeAll": "Chiudi duplicati",
    "actions.closeDomainTabs": "Chiudi schede di {{domain}}",
    "commands.close-other-tabs": "Chiudi le altre schede",
    "commands.close-other-tabs.desc":
      "Chiudi tutte le schede tranne quella attiva",
    "commands.close-duplicates": "Chiudi schede duplicate",
    "commands.close-duplicates.desc":
      "Rileva e chiudi le schede con URL identico",
    "commands.mute-tab": "Silenzia scheda",
    "commands.mute-tab.desc": "Silenzia la scheda corrente",
    "commands.unmute-tab": "Attiva audio scheda",
    "commands.unmute-tab.desc": "Riattiva l'audio della scheda corrente",
    "commands.pin-tab": "Fissa scheda",
    "commands.pin-tab.desc": "Fissa la scheda corrente",
    "commands.unpin-tab": "Sblocca scheda",
    "commands.unpin-tab.desc": "Sblocca la scheda corrente",
    "commands.duplicate-tab": "Duplica scheda",
    "commands.duplicate-tab.desc": "Crea una copia della scheda corrente",
    "commands.sort-tabs-title": "Ordina schede per titolo",
    "commands.sort-tabs-title.desc":
      "Riordina le schede nella finestra per titolo",
    "options.title": "Quick TAB Launcher by Bonn",
    "options.subtitle": "Impostazioni",
    "options.legend.resultsByType": "Risultati per tipo",
    "options.legend.behavior": "Comportamento",
    "options.label.openTabs": "Schede aperte",
    "options.hint.openTabs": "Massimo risultati da schede aperte",
    "options.label.bookmarks": "Segnalibri",
    "options.hint.bookmarks": "Massimo risultati da segnalibri",
    "options.label.history": "Cronologia",
    "options.hint.history": "Massimo risultati dalla cronologia",
    "options.label.fulltextSearch": "Ricerca nel contenuto delle schede",
    "options.hint.fulltextSearch":
      "Cerca anche nel testo delle pagine aperte (piu lento con molte schede)",
    "options.label.debounce": "Ritardo ricerca (ms)",
    "options.hint.debounce":
      "Attesa prima di avviare la ricerca durante la digitazione (0-2000)",
    "options.label.historyDays": "Giorni cronologia",
    "options.hint.historyDays":
      "Quanti giorni di cronologia includere nella ricerca (1-365)",
    "options.label.minQueryLength":
      "Caratteri minimi per segnalibri e cronologia",
    "options.hint.minQueryLength":
      "Lunghezza minima della query per cercare in segnalibri e cronologia (1-10)",
    "options.label.loadingThreshold": "Soglia indicatore caricamento (ms)",
    "options.hint.loadingThreshold":
      "Attesa prima di mostrare l'indicatore di caricamento (0-5000)",
    "options.btn.save": "Salva impostazioni",
    "options.btn.reset": "Ripristina predefiniti",
    "options.feedback.saved": "Impostazioni salvate.",
    "options.feedback.invalid": "Valori non validi. Controlla i campi.",
    "options.feedback.reset":
      "Impostazioni ripristinate ai valori predefiniti.",
  },
  en: {
    "launcher.placeholder": "Search tabs, bookmarks, history...",
    "launcher.escHint": "ESC to close",
    "launcher.footer.navigate": "\u2191\u2193 navigate",
    "launcher.footer.open": "\u21B5 open",
    "launcher.footer.newTab": "Ctrl+\u21B5 new tab",
    "launcher.footer.fulltext": "Alt+C content",
    "launcher.footer.close": "ESC close",
    "launcher.footer.commands": "> commands",
    "launcher.footer.group": "Alt+G group",
    "sections.tabs": "Open tabs",
    "sections.bookmarks": "Bookmarks",
    "sections.history": "History",
    "sections.recent-active": "Recent tabs",
    "sections.recent-closed": "Recently closed",
    "sections.commands": "Commands",
    "launcher.fulltextToggle": "Content",
    "launcher.fulltextToggle.tooltip.on": "Content search on (Alt+C)",
    "launcher.fulltextToggle.tooltip.off": "Content search off (Alt+C)",
    "badges.contentMatch": "Content match",
    "badges.otherWindow": "Other window",
    "badges.closeTab": "Close tab",
    "states.empty": "Start typing to search...",
    "states.noResults": "No results for \u00ab{{query}}\u00bb",
    "states.loading": "Searching...",
    "states.error": "Search error. Try again.",
    "duplicates.banner": "{{count}} duplicate tabs found",
    "duplicates.closeAll": "Close duplicates",
    "actions.closeDomainTabs": "Close tabs from {{domain}}",
    "commands.close-other-tabs": "Close other tabs",
    "commands.close-other-tabs.desc": "Close all tabs except the active one",
    "commands.close-duplicates": "Close duplicate tabs",
    "commands.close-duplicates.desc": "Find and close tabs with the same URL",
    "commands.mute-tab": "Mute tab",
    "commands.mute-tab.desc": "Mute current tab",
    "commands.unmute-tab": "Unmute tab",
    "commands.unmute-tab.desc": "Unmute current tab",
    "commands.pin-tab": "Pin tab",
    "commands.pin-tab.desc": "Pin current tab",
    "commands.unpin-tab": "Unpin tab",
    "commands.unpin-tab.desc": "Unpin current tab",
    "commands.duplicate-tab": "Duplicate tab",
    "commands.duplicate-tab.desc": "Create a copy of current tab",
    "commands.sort-tabs-title": "Sort tabs by title",
    "commands.sort-tabs-title.desc": "Reorder tabs in window by title",
    "options.title": "Quick TAB Launcher by Bonn",
    "options.subtitle": "Settings",
    "options.legend.resultsByType": "Results by type",
    "options.legend.behavior": "Behavior",
    "options.label.openTabs": "Open tabs",
    "options.hint.openTabs": "Max results from open tabs",
    "options.label.bookmarks": "Bookmarks",
    "options.hint.bookmarks": "Max results from bookmarks",
    "options.label.history": "History",
    "options.hint.history": "Max results from history",
    "options.label.fulltextSearch": "Search tab content",
    "options.hint.fulltextSearch":
      "Also search page text of open tabs (slower with many tabs)",
    "options.label.debounce": "Search delay (ms)",
    "options.hint.debounce":
      "Wait before starting search while typing (0-2000)",
    "options.label.historyDays": "History days",
    "options.hint.historyDays":
      "How many days of history to include in search (1-365)",
    "options.label.minQueryLength": "Min characters for bookmarks and history",
    "options.hint.minQueryLength":
      "Minimum query length to search bookmarks and history (1-10)",
    "options.label.loadingThreshold": "Loading indicator threshold (ms)",
    "options.hint.loadingThreshold":
      "Wait before showing loading indicator (0-5000)",
    "options.btn.save": "Save settings",
    "options.btn.reset": "Restore defaults",
    "options.feedback.saved": "Settings saved.",
    "options.feedback.invalid": "Invalid values. Check fields.",
    "options.feedback.reset": "Settings restored to defaults.",
  },
};

let i18nCurrentLocale = I18N_DEFAULT_LOCALE;
const i18nChangeListeners = [];

function t(key, params) {
  const dict =
    I18N_MESSAGES[i18nCurrentLocale] || I18N_MESSAGES[I18N_DEFAULT_LOCALE];
  let message = dict[key];
  if (message === undefined) {
    return key;
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      message = message.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);
    }
  }
  return message;
}

function getLocale() {
  return i18nCurrentLocale;
}

async function loadLocale() {
  try {
    const result = await browser.storage.local.get(I18N_STORAGE_KEY);
    const stored = result[I18N_STORAGE_KEY];
    if (stored && I18N_SUPPORTED_LOCALES.includes(stored)) {
      i18nCurrentLocale = stored;
    }
  } catch {
    // Storage unavailable: use default
  }
}

async function setLocale(lang) {
  if (!I18N_SUPPORTED_LOCALES.includes(lang)) return;
  i18nCurrentLocale = lang;
  try {
    await browser.storage.local.set({ [I18N_STORAGE_KEY]: lang });
  } catch {
    // Storage unavailable: locale set in memory only
  }
  for (const listener of i18nChangeListeners) {
    listener(lang);
  }
}

function setLocaleFromStorage(lang) {
  if (!I18N_SUPPORTED_LOCALES.includes(lang)) return;
  i18nCurrentLocale = lang;
  for (const listener of i18nChangeListeners) {
    listener(lang);
  }
}

function onLocaleChange(callback) {
  i18nChangeListeners.push(callback);
}

function applyTranslations(root) {
  const elements = root.querySelectorAll("[data-i18n]");
  for (const el of elements) {
    el.textContent = t(el.dataset.i18n);
  }
  const placeholders = root.querySelectorAll("[data-i18n-placeholder]");
  for (const el of placeholders) {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  }
  const titles = root.querySelectorAll("[data-i18n-title]");
  for (const el of titles) {
    el.title = t(el.dataset.i18nTitle);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    I18N_STORAGE_KEY,
    I18N_DEFAULT_LOCALE,
    I18N_SUPPORTED_LOCALES,
    I18N_MESSAGES,
    t,
    getLocale,
    loadLocale,
    setLocale,
    setLocaleFromStorage,
    onLocaleChange,
    applyTranslations,
  };
}
