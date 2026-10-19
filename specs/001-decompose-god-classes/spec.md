# Spec 001 - Scomposizione delle god-class

Stato: approvata per esecuzione autonoma. Data: 2026-10-19. Baseline: commit `2b8497f`,
511 test verdi in 21 file, line 98.41% e branch 90.7% sul perimetro attuale
(src, background, content, options).

## Contesto misurato

- ESLint con `max-lines` 300, `max-lines-per-function` 30 (entrambi in righe di codice,
  `skipBlankLines` + `skipComments`), `max-params` 4, `max-depth` 3: 21 violazioni in 8 file
  (launcher.js 862 righe di codice, i18n.js 522, render-utils.js 533, popup.js 506,
  background.js 390, options.js 315; funzioni lunghe in launcher, popup, render-utils,
  background, tab-commands).
- `no-undef` attivo segnalerebbe solo `module` (26) e `require` (1): gli header
  `/* global */` sono oggi completi.
- Copertura di popup/ e welcome/ misurata a parte: popup.js 81.3% line, 62.3% branch;
  welcome.js 95.9% / 91.7%.
- I test d'integrazione caricano i moduli con liste `MODULES` scritte a mano, non dal
  manifest: un modulo nuovo dimenticato in `manifest.json` o in un `.html` passa tutta la
  suite e rompe l'estensione.

## Requisiti

- **R1 Nessuna regressione.** Dopo ogni commit `npm test` è verde, il numero di test non
  scende, e gli `it` esistenti di `tests/launcher*.test.js` e `tests/popup.test.js` restano
  testualmente invariati (consentite solo aggiunte e la sostituzione della lista dei loader).
- **R2 Limiti dimensionali come gate.** A fine lavoro `npm run lint` applica le quattro regole
  dimensionali su src, background, content, options, popup, welcome senza override, tranne
  `max-lines` su `src/i18n.js` (dizionario, vedi R8). Esempio: aggiungere 40 righe di codice
  a una funzione di `src/panel-view.js` fa fallire `npm run lint`.
- **R3 Contratto di caricamento.** Per ogni punto di caricamento (background, content script,
  popup.html, options.html, welcome.html) un test verifica che i file esistano, che nessun
  nome top-level sia dichiarato due volte, che ogni nome dell'header `/* global */` sia
  dichiarato da un file precedente o dalle API del browser, e che gli script eseguiti come
  classic script in un'unica finestra jsdom si carichino senza eccezioni.
  Esempio: togliere `../src/hints.js` da popup.html fa fallire il test con il nome del file.
- **R4 Una sola implementazione del pannello.** Ricerca, selezione, conferma, navigazione,
  chiusura tab, undo e tastiera esistono una volta sola, condivise da launcher e popup; le
  differenze passano da hook nominati.
- **R5 Bug di divergenza del popup corretti**, ciascuno con un test che fallisce prima del fix:
  - R5.1 una risposta di ricerca arrivata dopo una più recente non sovrascrive i risultati
    (dato: digito "gh", poi "so"; la risposta di "gh" arriva per ultima; allora la lista
    mostra i risultati di "so");
  - R5.2 la striscia di conferma non compare se la selezione è cambiata durante la preview;
  - R5.3 il bottone "chiudi tutte" di un dominio nella vista raggruppata del popup chiude le
    tab del dominio e mostra il toast con undo (oggi il click non fa nulla);
  - R5.4 i fallimenti di config, stato tab, ricerca web e tab recenti vengono loggati con
    `console.warn` invece di essere inghiottiti.
- **R6 Copertura effettiva.** coverage.include comprende popup/ e welcome/;
  `content/extract-content.js` ha un test; `coverage.thresholds` impedisce di scendere sotto
  il valore misurato. Obiettivo finale sul perimetro allargato: line >= 98.4%, branch >= 90.7%.
- **R7 Test sui moduli nuovi.** Ogni modulo estratto ha un file di test diretto che ne
  verifica il comportamento attraverso l'API pubblica, con il rosso visto rompendo il codice.
- **R8 Non scomporre ciò che è coeso.** `src/i18n.js` resta un file (dizionario it/en +
  logica, la parità delle chiavi è già testata); `background/tab-commands.js` resta un file
  (si accorcia solo `getRecentTabs`); `welcome.js`, `panel-extras.js`, `hints.js`,
  `shortcut.js` non si toccano.
- **R9 Commit atomici su main**, Conventional Commits in inglese, un cambiamento logico per
  commit: spostamento, accorciamento e fix non si mescolano.
- **R10 Errore osservabile.** Il router dei messaggi del background mantiene la semantica
  attuale: azione sconosciuta restituisce `false`, `navigate` è fire-and-forget, le azioni
  asincrone rispondono via `sendResponse` con `return true`.
