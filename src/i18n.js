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
    "options.btn.reset": "Ripristina predefiniti",
    "options.feedback.saved": "Salvato.",
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
    "guide.title": "Prime volte qui?",
    "guide.body":
      "Scrivi per cercare fra schede aperte, segnalibri e cronologia. Invio apre il risultato evidenziato, > mostra le azioni sulle schede.",
    "guide.dismiss": "Ho capito",
    "quick.label": "Azioni:",
    "quick.all": "Tutte (>)",
    "quick.close-duplicates": "Chiudi doppie",
    "quick.mute-tab": "Silenzia",
    "quick.unmute-tab": "Riattiva audio",
    "quick.pin-tab": "Fissa",
    "quick.unpin-tab": "Sblocca",
    "duplicates.banner": "{{count}} schede doppie",
    "duplicates.banner.one": "1 scheda doppia",
    "duplicates.item": "{{title}} ({{count}} in più)",
    "duplicates.more": "e altre {{count}} pagine",
    "duplicates.more.one": "e un'altra pagina",
    "duplicates.closeAll": "Chiudi le copie",
    "duplicates.dismiss": "Non ora",
    "toast.tabClosed": "Scheda chiusa: {{title}}",
    "toast.undo": "Annulla",
    "toast.undo.tooltip": "Riapri le schede appena chiuse (Alt+Z)",
    "toast.restored": "Schede riaperte",
    "done.close-other-tabs": "{{count}} schede chiuse",
    "done.close-other-tabs.one": "1 scheda chiusa",
    "done.close-duplicates": "{{count}} schede doppie chiuse",
    "done.close-duplicates.one": "1 scheda doppia chiusa",
    "done.close-domain": "{{count}} schede di {{domain}} chiuse",
    "done.close-domain.one": "1 scheda di {{domain}} chiusa",
    "done.mute-tab": "Scheda silenziata",
    "done.unmute-tab": "Audio della scheda riattivato",
    "done.pin-tab": "Scheda fissata",
    "done.unpin-tab": "Scheda sbloccata",
    "done.duplicate-tab": "Scheda duplicata",
    "done.sort-tabs-title": "Schede ordinate dalla A alla Z",
    "done.nothing": "Nessuna scheda da chiudere",
    "done.failed": "L'azione non è riuscita",
    "confirm.closeTabs":
      "Chiuderà {{count}} schede. Premi Invio di nuovo per confermare, Esc per annullare.",
    "confirm.closeTabs.one":
      "Chiuderà 1 scheda. Premi Invio di nuovo per confermare, Esc per annullare.",
    "noResults.tipShorter":
      "Prova con meno parole o con una parte del nome del sito.",
    "noResults.tipFulltext":
      "La parola può essere nel testo di una pagina aperta:",
    "noResults.enableFulltext": "cerca anche nel testo",
    "noResults.tipHistory": "La cronologia copre gli ultimi {{days}} giorni:",
    "noResults.openSettings": "cambia nelle impostazioni",
    "sections.command-tabs": "Schede",
    "sections.command-current": "Scheda attuale",
    "launcher.settings": "Impostazioni",
    "hints.closeTab": "chiudi scheda",
    "hints.undo": "annulla",
    "options.label.language": "Lingua",
    "options.language.auto": "Automatica (lingua di Firefox)",
    "options.language.it": "Italiano",
    "options.language.en": "English",
    "options.shortcut.title": "Apri il launcher con",
    "options.shortcut.change": "Cambia scorciatoia",
    "options.shortcut.prompt": "Premi la nuova combinazione, Esc per annullare",
    "options.shortcut.reset": "Ripristina",
    "options.shortcut.saved": "Scorciatoia aggiornata.",
    "options.shortcut.invalid":
      "Usa Ctrl o Alt insieme a una lettera, un numero o un tasto funzione.",
    "options.shortcut.failed": "Firefox non ha accettato questa combinazione.",
    "options.shortcut.none": "nessuna scorciatoia",
    "keys.space": "Spazio",
    "options.legend.advanced": "Avanzate",
    "options.hint.advanced":
      "Ritardo della ricerca, caratteri minimi, indicatore di caricamento",
    "options.hint.fulltextPrivacy":
      "Il testo viene letto sul tuo computer e non lascia il browser.",
    "options.footer": "Quick Tab Launcher by",
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
    "options.btn.reset": "Restore defaults",
    "options.feedback.saved": "Saved.",
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
    "guide.title": "New here?",
    "guide.body":
      "Type to search open tabs, bookmarks and history. Enter opens the highlighted result, > shows tab actions.",
    "guide.dismiss": "Got it",
    "quick.label": "Actions:",
    "quick.all": "All (>)",
    "quick.close-duplicates": "Close duplicates",
    "quick.mute-tab": "Mute",
    "quick.unmute-tab": "Unmute",
    "quick.pin-tab": "Pin",
    "quick.unpin-tab": "Unpin",
    "duplicates.banner": "{{count}} duplicate tabs",
    "duplicates.banner.one": "1 duplicate tab",
    "duplicates.item": "{{title}} ({{count}} extra)",
    "duplicates.more": "and {{count}} more pages",
    "duplicates.more.one": "and 1 more page",
    "duplicates.closeAll": "Close copies",
    "duplicates.dismiss": "Not now",
    "toast.tabClosed": "Tab closed: {{title}}",
    "toast.undo": "Undo",
    "toast.undo.tooltip": "Reopen the tabs just closed (Alt+Z)",
    "toast.restored": "Tabs reopened",
    "done.close-other-tabs": "{{count}} tabs closed",
    "done.close-other-tabs.one": "1 tab closed",
    "done.close-duplicates": "{{count}} duplicate tabs closed",
    "done.close-duplicates.one": "1 duplicate tab closed",
    "done.close-domain": "{{count}} tabs from {{domain}} closed",
    "done.close-domain.one": "1 tab from {{domain}} closed",
    "done.mute-tab": "Tab muted",
    "done.unmute-tab": "Tab sound turned back on",
    "done.pin-tab": "Tab pinned",
    "done.unpin-tab": "Tab unpinned",
    "done.duplicate-tab": "Tab duplicated",
    "done.sort-tabs-title": "Tabs sorted A to Z",
    "done.nothing": "No tabs to close",
    "done.failed": "The action did not work",
    "confirm.closeTabs":
      "This closes {{count}} tabs. Press Enter again to confirm, Esc to cancel.",
    "confirm.closeTabs.one":
      "This closes 1 tab. Press Enter again to confirm, Esc to cancel.",
    "noResults.tipShorter": "Try fewer words, or part of the site's name.",
    "noResults.tipFulltext": "The word may be in the text of an open page:",
    "noResults.enableFulltext": "search page text too",
    "noResults.tipHistory": "History covers the last {{days}} days:",
    "noResults.openSettings": "change it in settings",
    "sections.command-tabs": "Tabs",
    "sections.command-current": "Current tab",
    "launcher.settings": "Settings",
    "hints.closeTab": "close tab",
    "hints.undo": "undo",
    "options.label.language": "Language",
    "options.language.auto": "Automatic (Firefox language)",
    "options.language.it": "Italiano",
    "options.language.en": "English",
    "options.shortcut.title": "Open the launcher with",
    "options.shortcut.change": "Change shortcut",
    "options.shortcut.prompt": "Press the new key combination, Esc to cancel",
    "options.shortcut.reset": "Reset",
    "options.shortcut.saved": "Shortcut updated.",
    "options.shortcut.invalid":
      "Use Ctrl or Alt together with a letter, a digit or a function key.",
    "options.shortcut.failed": "Firefox did not accept this combination.",
    "options.shortcut.none": "no shortcut",
    "keys.space": "Space",
    "options.legend.advanced": "Advanced",
    "options.hint.advanced":
      "Search delay, minimum characters, loading indicator",
    "options.hint.fulltextPrivacy":
      "Page text is read on your computer and never leaves the browser.",
    "options.footer": "Quick Tab Launcher by",
  },
};

// Used for any Firefox language without a translation.
const I18N_FALLBACK_LOCALE = "en";

let i18nCurrentLocale = I18N_DEFAULT_LOCALE;
let i18nHasStoredChoice = false;
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
      // A function replacement keeps "      message = message.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v);" and "$1" in titles literal.
      message = message.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), () =>
        String(v),
      );
    }
  }
  return message;
}

/**
 * Like t(), with a count: uses the "<key>.one" variant for 1 when it exists.
 *
 * @param {string} key - Message key for the plural form.
 * @param {number} count - Quantity, also passed as {{count}}.
 * @param {object} [params] - Extra interpolation values.
 * @returns {string}
 */
function tCount(key, count, params = {}) {
  const dict =
    I18N_MESSAGES[i18nCurrentLocale] || I18N_MESSAGES[I18N_DEFAULT_LOCALE];
  const singularKey = key + ".one";
  const useSingular = count === 1 && dict[singularKey] !== undefined;
  return t(useSingular ? singularKey : key, {
    ...params,
    count: String(count),
  });
}

function getLocale() {
  return i18nCurrentLocale;
}

/**
 * Picks the interface language: the user's explicit choice when valid,
 * otherwise Firefox's own language, otherwise English.
 *
 * @param {string|undefined} stored - Value saved by the settings page.
 * @param {string} uiLanguage - Firefox UI language tag, e.g. "it-IT".
 * @returns {string} A supported locale.
 */
function resolveLocale(stored, uiLanguage) {
  if (I18N_SUPPORTED_LOCALES.includes(stored)) return stored;
  const base = (uiLanguage || "").toLowerCase().split("-")[0];
  return I18N_SUPPORTED_LOCALES.includes(base) ? base : I18N_FALLBACK_LOCALE;
}

function getBrowserLanguage() {
  try {
    return browser.i18n.getUILanguage();
  } catch {
    return typeof navigator !== "undefined" ? navigator.language : "";
  }
}

/** Language Firefox would give: used when the user has not chosen one. */
function detectLocale() {
  return resolveLocale(undefined, getBrowserLanguage());
}

/** "auto" while following Firefox, otherwise the chosen locale. */
function getLocalePreference() {
  return i18nHasStoredChoice ? i18nCurrentLocale : "auto";
}

function notifyLocaleChange(lang) {
  for (const listener of i18nChangeListeners) {
    listener(lang);
  }
}

async function loadLocale() {
  let stored;
  try {
    const result = await browser.storage.local.get(I18N_STORAGE_KEY);
    stored = result[I18N_STORAGE_KEY];
  } catch {
    // Storage unavailable: follow Firefox's language
  }
  i18nHasStoredChoice = I18N_SUPPORTED_LOCALES.includes(stored);
  i18nCurrentLocale = resolveLocale(stored, getBrowserLanguage());
}

/** Forgets the chosen language and goes back to following Firefox. */
async function clearLocale() {
  i18nHasStoredChoice = false;
  i18nCurrentLocale = detectLocale();
  try {
    await browser.storage.local.remove(I18N_STORAGE_KEY);
  } catch {
    // Storage unavailable: change applies in memory only
  }
  notifyLocaleChange(i18nCurrentLocale);
}

async function setLocale(lang) {
  if (!I18N_SUPPORTED_LOCALES.includes(lang)) return;
  i18nCurrentLocale = lang;
  i18nHasStoredChoice = true;
  try {
    await browser.storage.local.set({ [I18N_STORAGE_KEY]: lang });
  } catch {
    // Storage unavailable: locale set in memory only
  }
  notifyLocaleChange(lang);
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
    tCount,
    getLocale,
    resolveLocale,
    detectLocale,
    getLocalePreference,
    clearLocale,
    loadLocale,
    setLocale,
    setLocaleFromStorage,
    onLocaleChange,
    applyTranslations,
  };
}
