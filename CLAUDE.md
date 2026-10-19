# Quick TAB Launcher by Bonn - CLAUDE.md

## Stack

- Vanilla JS (ES2020+), CSS puro, Manifest V2
- Test: Vitest + jsdom
- Lint: ESLint (flat config)
- CI: GitHub Actions (lint + test + coverage)

## Comandi

```bash
npm test              # Test
npm run lint          # Lint
npm run test:coverage # Coverage
```

## Architettura

- `src/search-utils.js` - Logica pura condivisa (zero dipendenze browser), incl. isPrivilegedUrl, extractDomain
- `src/fuzzy.js` - Fuzzy matching per ricerca (fuzzyMatch, fuzzyScore, highlightFuzzyMatch)
- `src/commands.js` - Registry comandi per command palette (COMMANDS, filterCommands)
- `src/render-utils.js` - Primitive DOM (elementi, favicon, riga risultato, selezione)
- `src/render-views.js` - Viste: risultati flat/raggruppati, comandi, web search, recenti
- `src/render-states.js` - Stati: empty, no-results con tip, loading, error
- `src/panel-view.js` - Stato e operazioni DOM del pannello, condivise da launcher e popup
- `src/panel-controller.js` + `src/panel-actions.js` - Ricerca, conferma, navigazione, tastiera condivise; le differenze launcher/popup passano dai 7 hook `PanelHooks` (mai if sul tipo di host, mai `document.querySelector`)
- `src/config-storage.js` - Config defaults, merge, load/save, loadStoredConfig/applyConfigChange
- `src/i18n.js` - i18n con dizionario inline (it/en); unica eccezione di dimensione, con tetto in eslint
- `background/background.js` - Init e routing dei messaggi via tabella `MESSAGE_ROUTES`
- `background/search.js` - Ricerca su tabs, bookmarks, history, full-text
- `background/navigation.js` - Navigazione, web search, chiusura tab
- `background/tab-commands.js` - Esecuzione comandi tab (close, mute, pin, sort, duplicates)
- `content/launcher.js` - IIFE host del pannello in Shadow DOM closed
- `content/launcher-dom.js` - Costruzione del DOM dell'overlay
- `content/duplicates-banner.js` - Banner duplicati (firma, dismiss, chiusura, render)
- `content/launcher.css` - Stili caricati via `browser.runtime.getURL()` nel shadow root
- `popup/popup.js` - Host sottile del pannello condiviso (fallback su pagine privilegiate)
- `options/options.js` + `options/options-shortcut.js` - Form impostazioni e cattura scorciatoia

## Feature

- Ricerca fuzzy multi-source (tabs, bookmarks, cronologia)
- Command palette: prefisso `>` per comandi rapidi (close, mute, pin, sort, duplicates)
- Recent tabs: tab recenti e chiusi di recente mostrati all'apertura
- Rilevamento e chiusura tab duplicati con banner
- Vista raggruppata per dominio (Alt+G toggle)
- Ricerca full-text nel contenuto delle pagine (Alt+C toggle)
- Chiusura tab direttamente dai risultati
- Dark mode automatico
- i18n italiano/inglese
- Popup fallback per pagine privilegiate

## Convenzioni

- Tutti i selettori CSS usano prefisso `qal-` (classi, non ID)
- Shadow DOM closed per isolamento dalla pagina host
- Manifest V2 (Firefox non supporta pienamente MV3)
- Tutti i moduli `src/*.js` espongono tramite `module.exports` per test e come global per browser
- Config dev files: `.mjs` extension (ESM) per evitare conflitti col CJS dei sorgenti
- Ordine script: fonte unica in `manifest.json` e negli `.html`; i loader dei test lo derivano da lì e `tests/load-order.test.js` verifica file esistenti, globali definiti prima dell'uso e nessuna `const` top-level duplicata (i classic script condividono lo scope). Un modulo nuovo va aggiunto lì, non nei test
- Limiti in ESLint (300 righe file, 30 per funzione, 4 parametri, depth 3, no-undef) senza override, salvo il tetto su i18n.js
- Coverage con soglie in `vitest.config.mjs` appena sotto il misurato: non si abbassano
- Compatibilità: `strict_min_version` 91, niente API più recenti (es. `Object.hasOwn` è Firefox 92)

## Test

- `search-utils.test.js` - Test puri, nessun mock
- `fuzzy.test.js` - Fuzzy matching, scoring, highlighting
- `commands.test.js` - Registry comandi e filtering
- `tab-commands.test.js` - Handler comandi tab con mock browser
- `render-extras.test.js` - Rendering comandi, recenti, banner, vista raggruppata
- `background.test.js` - Mock di `browser.*` API via `globalThis`
- `launcher.test.js` - jsdom, Shadow DOM forzato open per ispezione, timer reali per debounce
- `launcher-features.test.js` - Command mode, recent tabs, grouped view, duplicate banner
