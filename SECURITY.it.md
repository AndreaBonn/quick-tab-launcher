[English](./SECURITY.md) | **Italiano**

# Policy di Sicurezza

## Versioni supportate

Il progetto e in sviluppo attivo. Gli aggiornamenti di sicurezza vengono applicati all'ultimo commit sul branch `master`.

## Segnalare una vulnerabilita

Per segnalare una vulnerabilita di sicurezza, apri una issue privata o contatta direttamente il maintainer.

<!-- TODO: sostituire con URL GitHub Security Advisories quando un remote viene configurato -->
<!-- https://github.com/OWNER/REPO/security/advisories/new -->

Includi:
- Descrizione della vulnerabilita
- Passaggi per riprodurla
- Comportamento atteso vs effettivo
- Valutazione dell'impatto (cosa potrebbe ottenere un attaccante)

**Tempi di risposta:**
- Conferma di ricezione: entro 72 ore
- Fix per problemi critici: entro 30 giorni
- Divulgazione pubblica coordinata dopo il rilascio del fix

## Misure di sicurezza implementate

- **Prevenzione XSS**: tutto il testo visibile all'utente viene sanitizzato tramite `escapeHtml()` prima del rendering (`src/search-utils.js:16`)
- **Isolamento DOM**: la UI gira in un Shadow DOM chiuso, impedendo interferenze di stili e script dalla pagina host (`content/launcher.js:33`)
- **Nessun leak globale**: il content script e racchiuso in una IIFE, senza esporre variabili nello scope della pagina (`content/launcher.js:3`)
- **Escaping input nelle regex**: `escapeRegExp()` sanitizza le stringhe di ricerca prima dell'uso nei costruttori `RegExp` (`src/search-utils.js:28`)
- **Pinning delle dipendenze**: `package-lock.json` committato e `npm ci` usato nella CI

## Fuori ambito

I seguenti casi non sono considerati vulnerabilita per questo progetto:

- Self-XSS (attacchi che richiedono alla vittima di incollare codice nella propria console)
- Attacchi di social engineering
- Vulnerabilita in dipendenze di terze parti gia divulgate pubblicamente (segnalarle al maintainer upstream)
- Problemi di sicurezza a livello browser (segnalarli a Mozilla)
- Accesso a dati gia disponibili tramite l'interfaccia nativa di Firefox (schede, segnalibri, cronologia)

## Riconoscimenti

I ricercatori di sicurezza che avranno divulgato responsabilmente vulnerabilita verranno elencati qui.

---

[Torna al README](./README.it.md)
