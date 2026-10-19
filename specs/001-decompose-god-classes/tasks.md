# Tasks 001 - Scomposizione delle god-class

Verify comune V: `npm test` verde con conteggio test non decrescente + `npm run lint` verde. Rollback: `git revert`.

- [ ] T01 chore(lint): regole dimensionali + no-undef, override per gli 8 file in violazione | R2 | verify V + rosso togliendo un override
- [ ] T02 test(load): scriptsFor() da manifest/html, tests/load-order.test.js, loader derivati | R3 R1 | verify V + rosso togliendo hints.js da popup.html
- [ ] T03 test(coverage): popup/ e welcome/ inclusi, test extract-content.js, thresholds | R6 | verify test:coverage exit 0 con righe popup/welcome
- [ ] T04 fix(popup): risposte di ricerca superate ignorate | R5.1 | verify rosso prima, V dopo
- [ ] T05 fix(popup): conferma solo se la selezione non è cambiata | R5.2 | verify rosso prima, V dopo
- [ ] T06 fix(popup): chiudi tutte le tab del dominio nella vista raggruppata | R5.3 | verify rosso prima, V dopo
- [ ] T07 fix(popup): log dei fallimenti inghiottiti | R5.4 | verify rosso prima, V dopo
- [ ] T08 refactor(config): loadStoredConfig + applyConfigChange condivisi | R4 | verify V + test unitari
- [ ] T09 refactor(panel): src/panel-view.js + test, usato dal launcher | R4 R7 | verify V + load-order + diff launcher*.test vuoto
- [ ] T10 refactor(popup): popup su panel-view | R4 | verify V
- [ ] T11 refactor(panel): src/panel-controller.js + test, usato dal launcher | R4 R7 | verify V + rosso visto rompendo searchSeq
- [ ] T12 refactor(popup): popup su panel-controller | R4 R2 | verify V + override ridotto
- [ ] T13 refactor(launcher): content/launcher-dom.js + test | R2 R7 | verify V
- [ ] T14 refactor(launcher): content/duplicates-banner.js + test (+ page-toast.js se serve) | R2 R7 | verify V + launcher.js fuori override
- [ ] T15 refactor(render): render-views.js e render-states.js, test spostati | R2 | verify V + load-order
- [ ] T16 refactor(render): funzioni di render <= 30 righe | R2 | verify V + render-utils fuori override
- [ ] T17 refactor(search-utils): isPrivilegedUrl ed extractDomain puri | R2 | verify V
- [ ] T18 refactor(background): background/search.js, test spostati e rinforzati | R2 R7 | verify V
- [ ] T19 refactor(background): background/navigation.js, test spostati | R2 | verify V
- [ ] T20 refactor(background): MESSAGE_ROUTES con test table-driven | R2 R10 | verify V + background.js fuori override
- [ ] T21 refactor(tab-commands): getRecentTabs <= 30 righe | R2 | verify V
- [ ] T22 refactor(options): options/options-shortcut.js, test spostati | R2 | verify V + options.js fuori override
- [ ] T23 chore: override solo i18n.js, thresholds al misurato, CLAUDE.md locale | R2 R6 R8 | verify DoD completa
