# Quick Actions Launcher - CLAUDE.md

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

- `src/search-utils.js` - Logica pura condivisa (zero dipendenze browser)
- `src/fuzzy.js` - Fuzzy matching per ricerca (fuzzyMatch, fuzzyScore, highlightFuzzyMatch)
- `src/commands.js` - Registry comandi per command palette (COMMANDS, filterCommands)
- `src/render-utils.js` - Rendering DOM (risultati, comandi, recenti, banner, vista raggruppata)
- `src/config-storage.js` - Config defaults, merge, load/save
- `src/i18n.js` - i18n con dizionario inline (it/en)
- `background/background.js` - Bridge verso WebExtension API (tabs, bookmarks, history, sessions)
- `background/tab-commands.js` - Esecuzione comandi tab (close, mute, pin, sort, duplicates)
- `content/launcher.js` - IIFE che crea Shadow DOM closed con overlay UI
- `content/launcher.css` - Stili caricati via `browser.runtime.getURL()` nel shadow root

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
- Ordine script nel manifest: config-storage, search-utils, fuzzy, i18n, commands, [tab-commands,] render-utils/background, launcher

## Test

- `search-utils.test.js` - Test puri, nessun mock
- `fuzzy.test.js` - Fuzzy matching, scoring, highlighting
- `commands.test.js` - Registry comandi e filtering
- `tab-commands.test.js` - Handler comandi tab con mock browser
- `render-extras.test.js` - Rendering comandi, recenti, banner, vista raggruppata
- `background.test.js` - Mock di `browser.*` API via `globalThis`
- `launcher.test.js` - jsdom, Shadow DOM forzato open per ispezione, timer reali per debounce
- `launcher-features.test.js` - Command mode, recent tabs, grouped view, duplicate banner
