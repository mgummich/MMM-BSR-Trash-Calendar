# Implementation Plan: MMM-BSR-Trash-Calendar

## Overview

MagicMirror²-Modul zur Anzeige von BSR/ALBA-Abfuhrterminen für eine konfigurierte Berliner Adresse. Implementierung folgt dem TDD/BDD-Ansatz: Tests werden vor der Implementierung geschrieben. Jede Aufgabe ist ein logischer, committbarer Schritt. Reine Funktionen (utils.js) werden zuerst implementiert, dann Backend (node_helper.js), dann Frontend (MMM-BSR-Trash-Calendar.js), dann CSS, dann Dokumentation.

## Tasks

- [x] 1. Projekt-Scaffolding und Tooling-Setup
  - [x] 1.1 Erstelle package.json mit allen Dependencies und npm Scripts
    - Dependencies: vitest, fast-check (devDependencies), node-fetch (dependency)
    - DevDependencies: eslint, prettier, husky, lint-staged, commitlint, @commitlint/config-conventional
    - Scripts: lint, lint:fix, format, format:check, test, test:unit, test:property, test:integration, prepare
    - _Requirements: 13.1, 13.2, 13.4, 13.5, 13.6, 13.7, 13.8_
  - [x] 1.2 Erstelle Tooling-Konfigurationsdateien
    - `.eslintrc.json`: eslint:recommended + MagicMirror-Globals (Module, Log, MM)
    - `.prettierrc`: 2 Spaces, Semikolons, doppelte Anführungszeichen, 100 Zeichen
    - `.commitlintrc.json`: @commitlint/config-conventional
    - `.lintstagedrc.json`: ESLint + Prettier auf .js, .json, .css
    - `.editorconfig`: UTF-8, LF, 2 Spaces, Trailing Whitespace entfernen
    - _Requirements: 13.4, 13.5, 13.8, 13.10_
  - [x] 1.3 Erstelle .gitignore
    - node_modules/, cache.json, .DS_Store, Thumbs.db, .vscode/, .idea/, coverage/, \*.log, .env
    - _Requirements: 13.11_
  - [x] 1.4 Erstelle GitHub Actions CI-Pipeline (.github/workflows/ci.yml)
    - Trigger: push/PR auf main
    - Matrix: Node.js 18.x, 20.x
    - Schritte: npm ci → lint → format:check → test:unit → test:property → test:integration
    - _Requirements: 13.1, 13.2, 13.3, 13.9_
  - [x] 1.5 Erstelle Husky Git-Hooks
    - `.husky/pre-commit`: lint-staged ausführen
    - `.husky/commit-msg`: commitlint ausführen
    - _Requirements: 13.6, 13.7, 13.8_
  - [x] 1.6 Erstelle leere Verzeichnisstruktur und Stub-Dateien
    - `utils.js`, `node_helper.js`, `MMM-BSR-Trash-Calendar.js`, `MMM-BSR-Trash-Calendar.css`
    - `tests/unit/`, `tests/property/`, `tests/integration/`
    - Stub-Exporte in utils.js, damit Tests importieren können
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 2. Checkpoint — Tooling verifizieren
  - Sicherstellen, dass `npm install`, `npm run lint` und `npm test` ohne Fehler durchlaufen (leere Tests). Bei Fragen den Benutzer konsultieren.

- [ ] 3. Utils: Reine Funktionen — Tests und Implementierung
  - [x] 3.1 Schreibe Unit-Tests für Konfigurationsvalidierung (tests/unit/config.test.js)
    - BDD-Szenario 24: Pflicht-Parameter fehlen → Fehlermeldung mit „street"
    - BDD-Szenario 9: Unbekannte Kategorie „XX" → ignoriert + Warnung
    - BDD-Szenario 20: Leeres categories-Array → Fallback auf alle + Warnung
    - Standardwerte für optionale Parameter testen
    - _Requirements: 5.1, 5.2, 5.4, 12.4, 12.6_
  - [x] 3.2 Implementiere validateConfig und sanitizeCategories in utils.js
    - validateConfig: Pflichtfelder prüfen, Standardwerte setzen, bereinigte Config oder Fehler zurückgeben
    - sanitizeCategories: Ungültige Kategorien entfernen, Fallback auf alle bei leerem Ergebnis
    - CATEGORY_MAP-Konstante definieren (BI, HM, LT, WS, WB mit Name, Farbe, Icon)
    - _Requirements: 5.1, 5.2, 5.4, 12.4, 12.6_
  - [x] 3.3 Schreibe Property-Tests für Konfigurationsvalidierung (tests/property/config.property.js)
    - **Property 5: Konfigurationsvalidierung — gültige Config oder Fehler**
    - **Validates: Requirements 5.1, 5.2, 5.4, 9.4**
  - [x] 3.4 Schreibe Property-Tests für Kategorie-Bereinigung (tests/property/filtering.property.js — Property 13)
    - **Property 13: Kategorie-Bereinigung — Fallback auf alle Kategorien**
    - **Validates: Requirements 12.4, 12.6**
  - [x] 3.5 Schreibe Unit-Tests für Parsing und Sortierung (tests/unit/utils.test.js)
    - BDD-Szenario 3: Termine aufsteigend sortiert
    - BDD-Szenario 8: Ungültige API-Antwort → definierter Fehler
    - BDD-Szenario 18: Mehrere Abfallarten am selben Tag → separate Einträge
    - BDD-Szenario 19: Jahreswechsel Dezember-Januar
    - Feste Kategorie-Mappings testen (4.1, 4.2, 4.3): Alle 5 Kategorien mit Name, Farbe, Icon
    - _Requirements: 3.1, 3.2, 4.1, 4.2, 4.3, 9.1_
  - [x] 3.6 Implementiere parsePickupDates, sortByDate, filterPastDates, getCategoryDisplay, getMonthRange in utils.js
    - parsePickupDates: API-Antwort → Array<PickupDate>, nur zukünftige Termine, sortiert, serviceDate_actual (dd.MM.yyyy) → ISO (YYYY-MM-DD)
    - sortByDate: Aufsteigend nach Datum
    - filterPastDates: Entfernt Termine vor heute
    - getCategoryDisplay: Kürzel → { name, color, icon }
    - getMonthRange: Aktueller + Folgemonat (inkl. Jahreswechsel Dez→Jan)
    - _Requirements: 3.1, 3.2, 2.2, 4.1, 4.2, 4.3_
  - [x] 3.7 Schreibe Property-Tests für Parsing (tests/property/parsing.property.js)
    - **Property 1: Parsing erzeugt sortierte, vollständige Terminliste**
    - **Validates: Requirements 3.1, 9.3**
  - [x] 3.8 Schreibe Property-Tests für Round-Trip (tests/property/parsing.property.js — Property 7)
    - **Property 7: Round-Trip — Parse und Serialize**
    - **Validates: Requirements 9.5**
  - [x] 3.9 Schreibe Property-Tests für ungültige Eingaben (tests/property/parsing.property.js — Property 9)
    - **Property 9: Ungültige Eingaben erzeugen definierten Fehler**
    - **Validates: Requirements 9.7**
  - [x] 3.10 Schreibe Property-Tests für Monatsbereich (tests/property/calendar.property.js)
    - **Property 15: Monatsbereich mit Jahreswechsel**
    - **Validates: Requirements 2.2**
  - [x] 3.11 Schreibe Unit-Tests für Filterung und Darstellung (tests/unit/utils.test.js — Ergänzung)
    - BDD-Szenario 4: Kategoriefilterung — nur konfigurierte Kategorien
    - BDD-Szenario 5: Heutiger Termin → Label „Heute" + Hervorhebung
    - BDD-Szenario 22: Morgiger Termin → Label „Morgen"
    - BDD-Szenario 23: maxEntries begrenzt Anzeige (3 von 10)
    - BDD-Szenario 7: Warnhinweis wird angezeigt
    - Leere Terminliste (3.4): „Keine Termine verfügbar"
    - _Requirements: 3.3, 5.3, 6.1, 6.2, 6.3, 8.1, 12.3_
  - [x] 3.12 Implementiere filterByCategories, formatDate, getRelativeLabel, serializePickupDate in utils.js
    - filterByCategories: Filtert nach Abfallkategorien
    - formatDate: Formatiert Datum nach Konfiguration
    - getRelativeLabel: „Heute", „Morgen" oder null
    - serializePickupDate: Internes Format → API-Format (für Round-Trip-Tests)
    - _Requirements: 3.3, 5.3, 6.1, 6.2, 6.3, 8.1, 12.3_
  - [x] 3.13 Schreibe Property-Tests für Filterung (tests/property/filtering.property.js — Property 4, 8)
    - **Property 4: Kategoriefilterung liefert nur konfigurierte Kategorien**
    - **Validates: Requirements 5.3, 12.3**
    - **Property 8: Idempotenz der Kategoriefilterung**
    - **Validates: Requirements 9.6**
  - [x] 3.14 Schreibe Property-Tests für Darstellung (tests/property/display.property.js)
    - **Property 2: Darstellung enthält alle Pflichtfelder und Warnhinweise**
    - **Validates: Requirements 3.2, 8.1**
    - **Property 3: maxEntries begrenzt die Ausgabe**
    - **Validates: Requirements 3.3**
    - **Property 6: Datumsklassifikation — Heute, Morgen oder null**
    - **Validates: Requirements 6.1, 6.2, 6.3**

- [x] 4. Checkpoint — Alle Utils-Tests bestehen
  - Sicherstellen, dass alle Unit-Tests und Property-Tests für utils.js bestehen. Bei Fragen den Benutzer konsultieren.

- [x] 5. Cache-Logik — Tests und Implementierung
  - [x] 5.1 Schreibe Unit-Tests für Cache-Funktionen (tests/unit/utils.test.js — Ergänzung)
    - BDD-Szenario 6: Cache beim Neustart → gecachte Termine sofort angezeigt
    - BDD-Szenario 17: Adresse geändert → Cache verworfen + Neuabruf
    - Beschädigter Cache (11.8): Verwerfen und Neuabruf
    - Cache-Intervall abgelaufen vs. nicht abgelaufen
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9_
  - [x] 5.2 Implementiere isCacheValid, isCacheAddressMatch, loadCache, saveCache in utils.js
    - isCacheValid: Prüft Intervall + zukünftige Termine
    - isCacheAddressMatch: Vergleicht Straße + Hausnummer
    - loadCache: Liest JSON-Datei, gibt null bei Fehler
    - saveCache: Schreibt JSON-Datei mit Zeitstempel
    - _Requirements: 11.1, 11.3, 11.4, 11.7, 11.8, 11.9_
  - [x] 5.3 Schreibe Property-Tests für Cache (tests/property/cache.property.js)
    - **Property 10: Cache-Validierung — Intervall bestimmt Aktualisierung**
    - **Validates: Requirements 11.3, 11.4**
    - **Property 11: Cache Round-Trip — Save und Load**
    - **Validates: Requirements 11.7**
    - **Property 12: Cache-Invalidierung bei Adressänderung**
    - **Validates: Requirements 11.9**

- [x] 6. Retry-Logik — Tests und Implementierung
  - [x] 6.1 Schreibe Unit-Tests für Retry und Backoff (tests/unit/retry.test.js)
    - BDD-Szenario 14: Retry mit exponentiellem Backoff (5 Min → 10 Min)
    - BDD-Szenario 15: Reguläres Intervall bei aktivem Retry übersprungen
    - BDD-Szenario 16: Erfolgreicher Retry setzt Intervall zurück
    - Backoff-Sequenz: 5→10→20→40→80→120 Min (Maximum)
    - _Requirements: 2.5, 2.6, 2.7, 2.8, 2.9_
  - [x] 6.2 Implementiere calculateRetryDelay in utils.js
    - Formel: min(5 × 2^retryCount, 120) Minuten in Millisekunden
    - _Requirements: 2.6_
  - [x] 6.3 Schreibe Property-Tests für Retry-Backoff (tests/property/retry.property.js)
    - **Property 14: Exponentielles Backoff — korrekte Berechnung**
    - **Validates: Requirements 2.6**

- [x] 7. Checkpoint — Alle reinen Funktionen getestet und implementiert
  - Sicherstellen, dass alle Unit-Tests und Property-Tests bestehen. Bei Fragen den Benutzer konsultieren.

- [x] 8. Node_Helper — Tests und Implementierung
  - [x] 8.1 Schreibe Integrationstests für Socket-Kommunikation (tests/integration/socket.test.js)
    - BDD-Szenario 1: Erfolgreiche Adressauflösung → AdressSchlüssel
    - BDD-Szenario 2: Adresse nicht gefunden → Fehlermeldung
    - BDD-Szenario 10: API nicht erreichbar mit Cache → gecachte Daten + Retry
    - BDD-Szenario 11: API nicht erreichbar ohne Cache → Fehlermeldung + Retry
    - BDD-Szenario 12: Cache abgelaufen, API nicht erreichbar → veraltete Daten als Fallback
    - BDD-Szenario 13: Cache vs. API-Daten → neue Daten überschreiben Cache
    - BDD-Szenario 6: Cache beim Neustart → gecachte Termine sofort angezeigt
    - BDD-Szenario 17: Adresse geändert → Cache verworfen + Neuabruf
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.3, 2.4, 2.5, 7.1, 7.2, 7.3, 7.4, 11.1, 11.2, 11.5, 11.6, 11.9_
  - [x] 8.2 Implementiere node_helper.js
    - NodeHelper.create mit start(), socketNotificationReceived(), resolveAddress(), fetchPickupDates(), executeApiCall()
    - Concurrency Guard (requestLock), Retry-Zyklus (scheduleRetry), reguläres Update (scheduleUpdate)
    - handleApiError(), handleApiSuccess()
    - 30s Timeout für alle API-Aufrufe
    - Cache laden/speichern via utils.js Funktionen
    - Socket-Notifications: BSR_INIT_MODULE, BSR_PICKUP_DATA, BSR_ERROR
    - _Requirements: 1.1–1.6, 2.1–2.9, 7.1–7.4, 11.1–11.9_
  - [x] 8.3 Schreibe Integrationstests für Concurrency Guard (tests/integration/concurrency.test.js)
    - BDD-Szenario 21: API-Timeout → Abbruch nach 30s + Retry
    - **Property 16: Concurrency Guard — maximal ein aktiver Aufruf**
    - **Validates: Requirements 1.5, 1.6**

- [x] 9. Checkpoint — Node_Helper getestet und implementiert
  - Sicherstellen, dass alle Integrationstests bestehen. Bei Fragen den Benutzer konsultieren.

- [x] 10. Frontend — Implementierung
  - [x] 10.1 Implementiere MMM-BSR-Trash-Calendar.js
    - Module.register mit defaults, start(), getDom(), getStyles(), socketNotificationReceived()
    - Zustände: loading, error, data, empty
    - getDom(): Lade-/Fehlermeldung, sortierte Terminliste mit Farbe, Icon, Kategoriename, Datum, Entsorgungsdienstleister
    - Hervorhebung für „Heute" und „Morgen" via CSS-Klassen (.today, .tomorrow)
    - Warnhinweise unterhalb betroffener Termine
    - maxEntries-Begrenzung
    - Ladezustand (3.5): „Lade Abfuhrtermine..."
    - Leerer Zustand (3.4): „Keine Termine verfügbar"
    - _Requirements: 3.1–3.5, 4.1–4.3, 5.3, 6.1–6.3, 7.1, 7.4, 8.1, 8.2_

- [x] 11. Stylesheet — Implementierung
  - [x] 11.1 Implementiere MMM-BSR-Trash-Calendar.css
    - .bsr-trash-calendar (Container)
    - .bsr-entry, .bsr-entry.today, .bsr-entry.tomorrow (Hervorhebungen)
    - .bsr-category-icon (farbiges Icon), .bsr-category-name, .bsr-date
    - .bsr-warning (Warnhinweis), .bsr-error (Fehlermeldung), .bsr-loading (Lademeldung)
    - Farben gemäß CATEGORY_MAP
    - _Requirements: 4.1, 4.2, 6.1, 6.2, 8.2_

- [x] 12. Checkpoint — Modul vollständig integriert
  - Sicherstellen, dass alle Tests (Unit, Property, Integration) bestehen und alle Komponenten korrekt verdrahtet sind. Bei Fragen den Benutzer konsultieren.

- [x] 13. Dokumentation
  - [x] 13.1 Erstelle README.md (in Englisch)
    - Schritt-für-Schritt-Installationsanleitung für MagicMirror²
    - Vollständiges Konfigurationsbeispiel mit allen Pflicht- und optionalen Parametern
    - Parametertabelle mit Datentyp, Standardwert und Erläuterung
    - Abschnitt zu API-Abhängigkeiten (BSR-API-Endpunkte, Datenformat)
    - Screenshot-Platzhalter für Modulanzeige
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 14. Final Checkpoint — Alle Tests bestehen, Modul bereit
  - Sicherstellen, dass alle Tests bestehen, Linting und Formatierung korrekt sind, und die CI-Pipeline erfolgreich durchläuft. Bei Fragen den Benutzer konsultieren.

## Notes

- Tasks mit `*` sind optional und können für ein schnelleres MVP übersprungen werden
- Jede Task referenziert spezifische Anforderungen für Nachverfolgbarkeit
- TDD-Ansatz: Tests werden vor der Implementierung geschrieben (Anforderung 9.8)
- Jede abgeschlossene Task sollte als eigenständiger Git-Commit festgehalten werden (Conventional Commits)
- Property-Tests validieren universelle Korrektheitseigenschaften mit min. 100 Iterationen
- Unit-Tests validieren spezifische BDD-Szenarien und Randfälle
- Dokumentation (README.md, Code-Kommentare, JSDoc) wird in Englisch verfasst (Anforderung 10)
