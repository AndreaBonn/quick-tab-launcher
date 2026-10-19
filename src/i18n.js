/* global browser */

const I18N_STORAGE_KEY = "qal_locale";
const I18N_DEFAULT_LOCALE = "it";
const I18N_SUPPORTED_LOCALES = ["it", "en"];

const I18N_MESSAGES = {
  it: {
    "launcher.placeholder": "Cerca schede, segnalibri, cronologia o > azioni",
    "sections.tabs": "Schede aperte",
    "sections.bookmarks": "Segnalibri",
    "sections.history": "Cronologia",
    "sections.recent-active": "Schede recenti",
    "sections.recent-closed": "Chiuse di recente",
    "sections.commands": "Azioni",
    "launcher.fulltextToggle": "Cerca nel testo",
    "launcher.fulltextToggle.tooltip.on":
      "Cerca anche nel testo delle pagine aperte: attivo (Alt+C)",
    "launcher.fulltextToggle.tooltip.off":
      "Cerca anche nel testo delle pagine aperte: spento (Alt+C)",
    "badges.contentMatch": "Nel testo",
    "badges.otherWindow": "Altra finestra",
    "badges.contentMatch.tooltip": "Trovato nel testo della pagina",
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
      "Tiene aperta solo la scheda attuale (le fissate restano)",
    "commands.close-duplicates": "Chiudi schede duplicate",
    "commands.close-duplicates.desc":
      "Lascia una sola copia di ogni pagina aperta più volte",
    "commands.mute-tab": "Silenzia scheda",
    "commands.mute-tab.desc": "Toglie l'audio a questa scheda",
    "commands.unmute-tab": "Attiva audio scheda",
    "commands.unmute-tab.desc": "Ridà l'audio a questa scheda",
    "commands.pin-tab": "Fissa scheda",
    "commands.pin-tab.desc": "La tiene piccola a sinistra, sempre aperta",
    "commands.unpin-tab": "Sblocca scheda",
    "commands.unpin-tab.desc": "La riporta tra le schede normali",
    "commands.duplicate-tab": "Duplica scheda",
    "commands.duplicate-tab.desc":
      "Apre una seconda copia della pagina attuale",
    "commands.sort-tabs-title": "Ordina schede per titolo",
    "commands.sort-tabs-title.desc":
      "Riordina dalla A alla Z le schede di questa finestra",
    "options.title": "Quick Tab Launcher",
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
      "Cerca anche nel testo delle pagine aperte (più lento con molte schede)",
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
    "hints.go": "vai alla scheda",
    "hints.open": "apri",
    "hints.run": "esegui",
    "hints.navigate": "scegli",
    "hints.newTab": "nuova scheda",
    "hints.actions": "azioni",
    "hints.group": "per sito",
    "hints.fulltext": "cerca nel testo",
    "hints.back": "esci dalle azioni",
    "hints.close": "chiudi",
    "hints.help": "tutti i tasti",
    "hints.helpLess": "meno tasti",
    "enterHint.tab": "Vai alla scheda",
    "enterHint.reopen": "Riapri",
    "enterHint.open": "Apri",
    "enterHint.run": "Esegui",
    "launcher.groupToggle": "Per sito",
    "launcher.groupToggle.tooltip": "Raggruppa le schede per sito (Alt+G)",
    "launcher.inputLabel": "Cerca schede, segnalibri e cronologia",
  },
  en: {
    "launcher.placeholder": "Search tabs, bookmarks, history, or > actions",
    "sections.tabs": "Open tabs",
    "sections.bookmarks": "Bookmarks",
    "sections.history": "History",
    "sections.recent-active": "Recent tabs",
    "sections.recent-closed": "Recently closed",
    "sections.commands": "Actions",
    "launcher.fulltextToggle": "Search text",
    "launcher.fulltextToggle.tooltip.on":
      "Also search the text of open pages: on (Alt+C)",
    "launcher.fulltextToggle.tooltip.off":
      "Also search the text of open pages: off (Alt+C)",
    "badges.contentMatch": "In text",
    "badges.otherWindow": "Other window",
    "badges.contentMatch.tooltip": "Found in the text of the page",
    "badges.closeTab": "Close tab",
    "states.empty": "Start typing to search...",
    "states.noResults": "No results for \u00ab{{query}}\u00bb",
    "states.loading": "Searching...",
    "states.error": "Search error. Try again.",
    "duplicates.banner": "{{count}} duplicate tabs found",
    "duplicates.closeAll": "Close duplicates",
    "actions.closeDomainTabs": "Close tabs from {{domain}}",
    "commands.close-other-tabs": "Close other tabs",
    "commands.close-other-tabs.desc":
      "Keeps only the current tab open (pinned tabs stay)",
    "commands.close-duplicates": "Close duplicate tabs",
    "commands.close-duplicates.desc":
      "Keeps one copy of every page open more than once",
    "commands.mute-tab": "Mute tab",
    "commands.mute-tab.desc": "Turns off sound for this tab",
    "commands.unmute-tab": "Unmute tab",
    "commands.unmute-tab.desc": "Turns sound back on for this tab",
    "commands.pin-tab": "Pin tab",
    "commands.pin-tab.desc": "Keeps it small on the left, always open",
    "commands.unpin-tab": "Unpin tab",
    "commands.unpin-tab.desc": "Moves it back among normal tabs",
    "commands.duplicate-tab": "Duplicate tab",
    "commands.duplicate-tab.desc": "Opens a second copy of the current page",
    "commands.sort-tabs-title": "Sort tabs by title",
    "commands.sort-tabs-title.desc": "Reorders this window's tabs from A to Z",
    "options.title": "Quick Tab Launcher",
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
    "hints.go": "go to tab",
    "hints.open": "open",
    "hints.run": "run",
    "hints.navigate": "choose",
    "hints.newTab": "new tab",
    "hints.actions": "actions",
    "hints.group": "by site",
    "hints.fulltext": "search text",
    "hints.back": "leave actions",
    "hints.close": "close",
    "hints.help": "all keys",
    "hints.helpLess": "fewer keys",
    "enterHint.tab": "Go to tab",
    "enterHint.reopen": "Reopen",
    "enterHint.open": "Open",
    "enterHint.run": "Run",
    "launcher.groupToggle": "By site",
    "launcher.groupToggle.tooltip": "Group tabs by site (Alt+G)",
    "launcher.inputLabel": "Search tabs, bookmarks and history",
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
