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
- `background/background.js` - Bridge verso WebExtension API (tabs, bookmarks, history)
- `content/launcher.js` - IIFE che crea Shadow DOM closed con overlay UI
- `content/launcher.css` - Stili caricati via `browser.runtime.getURL()` nel shadow root

## Convenzioni

- Tutti i selettori CSS usano prefisso `qal-` (classi, non ID)
- Shadow DOM closed per isolamento dalla pagina host
- Manifest V2 (Firefox non supporta pienamente MV3)
- `src/search-utils.js` espone tramite `module.exports` per test e come global per browser
- Config dev files: `.mjs` extension (ESM) per evitare conflitti col CJS dei sorgenti

## Test

- `search-utils.test.js` - Test puri, nessun mock
- `background.test.js` - Mock di `browser.*` API via `globalThis`
- `launcher.test.js` - jsdom, Shadow DOM forzato open per ispezione, timer reali per debounce
