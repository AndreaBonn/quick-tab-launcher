# Piano 001 - Scomposizione delle god-class

## Obiettivo
Ogni file sorgente rispetta i limiti dimensionali (gate ESLint), launcher e popup condividono
un'unica implementazione del pannello, i quattro bug di divergenza del popup sono chiusi da
test di regressione, e la copertura misura anche popup/ e welcome/. Requisiti in `spec.md`.

## Definition of Done
- [ ] `npm test` verde dopo ogni commit; conteggio test >= 511 e crescente (`Tests N passed`).
- [ ] `npm run lint` verde con le regole dimensionali attive; unico override: `max-lines` su `src/i18n.js`.
- [ ] `tests/load-order.test.js` verde sui 5 punti di caricamento; rosso visto togliendo uno script da popup.html.
- [ ] `git diff 2b8497f -- tests/launcher.test.js tests/launcher-ux.test.js tests/launcher-features.test.js` mostra solo la sostituzione della lista loader (helper); `tests/popup.test.js` solo aggiunte + loader.
- [ ] 4 test di regressione popup (R5.1-R5.4), ciascuno visto rosso prima del fix (nome del test e messaggio nel corpo del commit).
- [ ] `npm run test:coverage` con popup/ e welcome/ inclusi: line >= 98.4%, branch >= 90.7%, thresholds in `vitest.config.mjs`.
- [ ] Nessuna funzione duplicata fra `content/launcher.js` e `popup/popup.js` fra quelle elencate in R4.

## Assunzioni
- Metrica dei limiti = righe di codice (ESLint `skipBlankLines` + `skipComments`), come nei piani precedenti di questo utente. Con le righe fisiche cambierebbe solo il conteggio, non la scomposizione.
- Push escluso: si committa su main locale; il push resta all'utente (la CI committa i badge su main, prima del push serve `git pull --rebase`).
- Il badge di copertura scende temporaneamente dopo T03 (popup entra nel perimetro a 81%): atteso e dichiarato nel commit.
- `CLAUDE.md` è in `.gitignore`: l'aggiornamento della sezione Architettura (T22) è locale, fuori dai commit.
- Nessuna verifica su Firefox reale possibile in autonomia: il proxy runtime è il caricamento classic-script in jsdom (T02). Lo smoke in Firefox (`web-ext run`) resta passo utente.

## Approccio e verdetti per file
| File | Verdetto | Moduli target e API |
|---|---|---|
| content/launcher.js (862) | SCOMPONI | logica pannello -> `src/panel-view.js` + `src/panel-controller.js`; DOM overlay -> `content/launcher-dom.js` `buildOverlayDOM(shadowRoot) -> elements`; banner duplicati -> `content/duplicates-banner.js` `createDuplicatesBanner({slot, onClosed})`. Restano nell'IIFE: init/open/close, page toast, guida, quick actions, bootstrap. Se dopo T13 supera ancora 300: page toast -> `content/page-toast.js` (T14) |
| popup/popup.js (506) | SCOMPONI per dedup | diventa host sottile (~150): captureElements, toggle labels, handleAction, hook verso il controller |
| src/render-utils.js (533) | SCOMPONI in 3 | `render-utils.js` primitive + righe risultato + selezione (createElement, createSection*, favicon, createResultItem, updateSelection, reindexItems); `render-views.js` liste (renderResults, renderGroupedResults, renderCommandResults, appendCommandSection, createWebSearchItem, renderSearchView); `render-states.js` stati (renderRecentTabs, renderDuplicateBanner, renderEmpty, renderNoResults, renderLoading, renderError) |
| background/background.js (390) | SCOMPONI | `background/search.js` (handleSearch..searchHistory), `background/navigation.js` (handleNavigate, hasWebSearchPermission, runWebSearch, handleCloseTab); `isPrivilegedUrl` + `extractDomain` (pure) in `src/search-utils.js`; listener onMessage -> tabella `MESSAGE_ROUTES` |
| options/options.js (315) | SCOMPONI | cattura scorciatoia -> `options/options-shortcut.js` (render/load/capture/apply/reset/setupShortcut); toggle ricerca web resta |
| src/i18n.js (522) | NON SCOMPORRE | 390 righe sono dati; spezzare per lingua aggiunge 2 script in 5 punti di caricamento e 3 loader senza togliere logica. Tabella decisione: guadagno marginale + indirezione = scarta. Override documentato |
| background/tab-commands.js (259) | NON SCOMPORRE | coeso (comandi tab); solo `getRecentTabs` 31 -> <=30 estraendo il mapper di sessione |
| content/extract-content.js | TESTA | espressione restituita a `executeScript`: test via `vm.runInNewContext` con body presente/assente |

**Duplicazione launcher/popup: factory condivisa (scelta) vs sole funzioni pure.** Le pure
(isCommandMode, outcomeMessage) sono ~10 righe: estrarle lascia ~400 righe duplicate impure,
che sono proprio dove stanno i bug di divergenza, e non impedisce la prossima. La factory le
rende strutturalmente impossibili. Due file per il limite di 300 e per il confine naturale:
- `createPanelView({state, elements})` (`src/panel-view.js`, nessun messaging): rebuildFlatResults, renderCurrentView, selectNext/Prev, clearPendingConfirm, removeResultItem, renderFooter/setFooterMode/toggleHelp, showPanelToast/hidePanelToast (undoCount, 8000 ms). Esporta anche `createPanelState()`, `isCommandMode`.
- `createPanelController({elements, hooks})` (`src/panel-controller.js`): crea state e view, espone handleInput (spezzato in scheduleSearch/applySearchReply/handleCommandInput, guardia `searchSeq`), fetchRecentTabs/ActiveTabState/WebSearchState, toggleGroupedView, toggleFulltextSearch, requestConfirm, navigateTo, handleResultClick, closeTab, closeDomainTabs, undoLastClose, refreshCurrentView, handleKeydown, `state` in lettura.
- Hook: `isActive()` (launcher: isVisible; popup: true), `close()` (closeLauncher / window.close), `afterNavigate(item)` (launcher chiude solo su recent-closed e web-search; popup chiude sempre), `runCommand(id)` (launcher: close + page toast esito; popup: execute-command + close), `onNothingToConfirm()`, `onQueryChange(query)` (launcher nasconde quickActions/duplicatesSlot), `onActiveTabState()` (launcher ridisegna quick actions). Solo questi: un hook nuovo si aggiunge quando serve a un host, non prima.

**Ordine: prima convergere, poi deduplicare.** I bug si correggono nel popup con patch minime (Fase 1), così le estrazioni della Fase 2 sono spostamenti puri di codice già identico e non mescolano fix e refactor.

## Sub-task
Ogni task = 1 commit. Verify comune a tutti (`V`): `npm test > run.log 2>&1; grep -E "Tests +[0-9]+ passed|failed" run.log` con conteggio >= precedente, e `npm run lint` verde. Rollback di tutti: `git revert <sha>` (nessun dato, migrazione o deploy).

**Fase 0 - Reti di sicurezza**
T01 (30-45m) chore(lint): regole dimensionali + `no-undef` (con `globals.commonjs`) su src/background/content/options/popup/welcome, override per gli 8 file in violazione elencati per nome. verify: V; togliere un file dall'override fa comparire le sue violazioni (rosso visto). dip: - | seq
T02 (1-1.5h) test(load): `tests/helpers/load-scripts.js` con `scriptsFor(point)` letto da manifest e html; `tests/load-order.test.js` (esistenza, nomi duplicati, globals dichiarati prima, caricamento classic in una finestra JSDOM `runScripts:"outside-only"` per content e popup); `load-launcher.js` e `popup.test.js` usano `scriptsFor`; assorbe `options-page.test.js`. verify: V; rosso visto togliendo `../src/hints.js` da popup.html. dip: T01 | seq
T03 (30m) test(coverage): include popup/ e welcome/; test di extract-content.js; `thresholds` = valori misurati arrotondati per difetto. verify: `npm run test:coverage` mostra le righe popup.js e welcome.js, exit 0. dip: T02 | seq

**Fase 1 - Convergenza del popup (fix con regressione, rosso visto)**
T04 (45m) fix(popup): ignora risposte di ricerca superate (R5.1, guardia searchSeq). Test con due promise manuali risolte in ordine inverso. dip: T03 | seq
T05 (30m) fix(popup): niente conferma se la selezione è cambiata durante la preview (R5.2). dip: T04 | seq
T06 (45m) fix(popup): "chiudi tutte" del dominio nella vista raggruppata (R5.3): messaggio `close-domain-tabs`, toast con undo, ricerca rilanciata. dip: T05 | seq
T07 (30m) fix(popup): log dei fallimenti inghiottiti (R5.4) con spy su console.warn + caso positivo appaiato. dip: T06 | seq
T08 (30m) refactor(config): `loadStoredConfig(target)` e `applyConfigChange(target, changes)` in config-storage.js, usati da launcher e popup; test unitari. verify: V. dip: T07 | seq

**Fase 2 - Pannello condiviso**
T09 (1.5-2h) refactor(panel): `src/panel-view.js` + `tests/panel-view.test.js` (DOM costruito a mano, nessun browser mock: selezione circolare, removeResultItem aggiorna conteggio e indici, riga web-search come unico risultato, toast con undo e timer); launcher lo usa; script aggiunto a manifest content e popup.html. verify: V + load-order verde + diff launcher*.test.js vuoto. dip: T08 | seq
T10 (45m) refactor(popup): popup usa panel-view. dip: T09 | seq
T11 (2-3h) refactor(panel): `src/panel-controller.js` + `tests/panel-controller.test.js` (browser mock da `createBrowserMock`, hook come `vi.fn`: risposta superata ignorata, conferma annullata se la selezione cambia, Alt+W ripetuto invia un solo close-tab, navigateTo per ogni tipo + hook, ricerca rifiutata -> stato errore, preview rifiutata -> onNothingToConfirm); launcher lo usa. dip: T10 | seq
T12 (1h) refactor(popup): popup usa panel-controller; popup.js e launcher.js fuori dall'override `max-lines-per-function`. dip: T11 | seq

**Fase 3 - Residuo del launcher**
T13 (1h) refactor(launcher): `content/launcher-dom.js` con builder <=30 righe + test (elementi restituiti, wiring ARIA input/listbox). dip: T12 | seq
T14 (45m) refactor(launcher): `content/duplicates-banner.js` + test (firma ignorata dopo dismiss, chiusura notifica onClosed). Poi, solo se `max-lines` su launcher.js fallisce ancora: `content/page-toast.js` nello stesso task, commit separato. launcher.js fuori dall'override. dip: T13 | seq

**Fase 4 - Render**
T15 (1h) refactor(render): spostamento puro in render-views.js e render-states.js; i describe relativi si spostano invariati in `tests/render-views.test.js` e `tests/render-states.test.js`. verify: V + load-order. dip: T14 | seq
T16 (1h) refactor(render): accorciare createResultItem, renderGroupedResults, renderDuplicateBanner, renderNoResults con builder nominati; render-utils fuori dall'override. dip: T15 | seq

**Fase 5 - Background**
T17 (30m) refactor(search-utils): isPrivilegedUrl ed extractDomain in src/search-utils.js con i loro test spostati. dip: T16 | seq
T18 (1h) refactor(background): background/search.js; test spostati in `tests/background-search.test.js`, i `toHaveBeenCalled()` senza argomenti dei test spostati diventano `toHaveBeenCalledWith`. dip: T17 | seq
T19 (45m) refactor(background): background/navigation.js con i suoi test. dip: T18 | seq
T20 (1h) refactor(background): tabella `MESSAGE_ROUTES`; test table-driven su ogni azione + azione sconosciuta -> `false` + `navigate` -> `false` (R10). background.js fuori dall'override. dip: T19 | seq
T21 (20m) refactor(tab-commands): getRecentTabs <= 30 righe. dip: T20 | seq

**Fase 6 - Options e chiusura**
T22 (1h) refactor(options): options/options-shortcut.js + script in options.html + test spostati. dip: T21 | seq
T23 (30m) chore: override ridotto a i18n.js con commento motivato; thresholds alzati al misurato; CLAUDE.md (locale) aggiornato su moduli e ordine script. verify: DoD completa. dip: T22 | seq

Stima: 17-23h di lavoro effettivo, +20% buffer per i test d'integrazione a timer reali (launcher-ux 12.5s). Tutto `seq`: i task condividono manifest, html e loader.

## Strategia test
- Rete: launcher*.test.js e popup.test.js invariati; unica modifica la lista loader (T02).
- Nuovi moduli: test diretti sull'API pubblica (T09, T11, T13, T14, T08); per ciascuno rompere una riga del codice e vedere il rosso prima del commit.
- Da spostare: describe di render-utils/extras/ux verso i file mirror (T15), test di ricerca e navigazione da background.test.js (T18, T19), test shortcut da options*.test.js (T22).
- Deboli (BASIS: inferred, da conteggio grep): 41 `toHaveBeenCalled()` senza argomenti in background.test.js, 17 `toBeTruthy()` in launcher.test.js, 10 in render-extras.test.js. Si rinforzano solo quelli che il piano sposta; il resto va a una passata `test-audit` dedicata.

## Fuori scope
- Riscrivere i test d'integrazione a timer reali o accelerarli.
- Cambiare la semantica `sendResponse` del background (un handler che rigetta non risponde mai: candidato per `silent-failure-hunter`, non qui).
- Nuove feature nel popup oltre la parità con il launcher (R5.3 è parità, non feature).
- Migrazione a ES module o bundler.

## Rischi e mitigazioni
- Una `const` top-level spostata in un file nuovo collide nel browser (scope lessicale globale condiviso fra classic script) ma non in Node -> controllo nomi duplicati + caricamento classic in JSDOM (T02).
- Script nuovo dimenticato in manifest o html: suite verde, estensione rotta -> loader derivati dal manifest + load-order (T02).
- Costanti condivise (SECTION_ICONS, CLOSABLE_TYPES) visibili nel browser ma non nei require -> esportarle dal modulo proprietario; il loader classic lo verifica.
- Shadow DOM closed: il controller usa solo `elements`, mai `document.querySelector` (oggi popup.removeResultItem lo fa).
- Gate rosso a metà (Regola dei 3 fix): dopo due tentativi falliti sullo stesso task, revert del task e stop con report.

## Criteri di successo
DoD tutta spuntata con evidenza: output di `npm test`, `npm run lint`, `npm run test:coverage` dell'ultimo commit; `git log --oneline 2b8497f..HEAD` con 23-24 commit atomici; nessun test esistente modificato oltre a spostamenti e loader.
