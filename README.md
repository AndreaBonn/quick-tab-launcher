# Quick Actions Launcher

Estensione Firefox che fornisce una palette comandi stile Spotlight/Alfred. Cerca in tempo reale tra schede aperte, segnalibri e cronologia recente, navigando ai risultati via tastiera.

## Funzionalità

- Attivazione con `Ctrl+Shift+Space`
- Ricerca real-time in schede aperte, segnalibri e cronologia (ultimi 30 giorni)
- Navigazione completa da tastiera (frecce, Enter, Esc, Tab)
- Dark/light mode automatico
- Highlight dei termini di ricerca nei risultati
- Pulsante per chiudere schede direttamente dal launcher
- Deduplicazione risultati tra categorie
- Isolamento DOM tramite Shadow DOM closed

## Requisiti

- Firefox 91+
- Node.js 20+ (solo per sviluppo/test)

## Installazione (sviluppo)

```bash
git clone <repo-url>
cd quick-tab-launcher__firefox

# Installa dipendenze dev (test, lint)
npm install
```

### Caricamento in Firefox

1. Apri Firefox, naviga a `about:debugging#/runtime/this-firefox`
2. Clicca "Carica componente aggiuntivo temporaneo..."
3. Seleziona il file `manifest.json` dalla root del progetto
4. L'estensione e' attiva. Premi `Ctrl+Shift+Space` su qualsiasi pagina.

## Test

```bash
npm test              # Esegui test
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## Lint

```bash
npm run lint          # Verifica
npm run lint:fix      # Correggi automaticamente
```

## Struttura

```
manifest.json           Manifest V2 dell'estensione
background/
  background.js         Command listener, search API, navigazione
content/
  launcher.js           Overlay DOM, input, risultati, keyboard nav
  launcher.css          Stili (iniettato nel Shadow DOM)
src/
  search-utils.js       Logica pura condivisa: highlight, dedup, format
tests/
  search-utils.test.js  Test logica pura
  background.test.js    Test background script con browser API mock
  launcher.test.js      Test UI launcher con jsdom
icons/                  SVG placeholder (sostituire con PNG per release)
```

## Scorciatoie da tastiera

| Tasto | Azione |
|-------|--------|
| `Ctrl+Shift+Space` | Apri/chiudi launcher |
| Freccia giu / Tab | Risultato successivo |
| Freccia su | Risultato precedente |
| Enter | Apri risultato selezionato |
| Ctrl+Enter | Apri in nuova scheda |
| Esc | Chiudi launcher |

## Icone

Le icone SVG in `icons/` sono placeholder. Per la release, sostituirle con file PNG nelle dimensioni 16x16, 32x32, 48x48, 96x96 e aggiornare i path nel `manifest.json` da `.svg` a `.png`.

## Limitazioni (v1.0)

- Ricerca solo nelle schede della finestra corrente
- Nessuna ricerca full-text nel contenuto delle pagine
- Nessuna pagina impostazioni (valori hardcoded)
- Non funziona su pagine `about:`, `moz-extension:`, `file:`
