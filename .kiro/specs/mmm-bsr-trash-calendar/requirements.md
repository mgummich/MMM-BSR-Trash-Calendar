# Anforderungsdokument

## Einleitung

MMM-BSR-Trash-Calendar ist ein MagicMirror²-Modul, das die Abfuhrtermine der Berliner Stadtreinigung (BSR) und des Entsorgers ALBA für eine konfigurierte Berliner Adresse anzeigt. Das Modul ruft die Daten über die BSR-API ab und stellt die nächsten Abholtermine mit Abfallart, Farbe und Datum übersichtlich auf dem MagicMirror dar.

## Glossar

- **Modul**: Das MagicMirror²-Modul MMM-BSR-Trash-Calendar, bestehend aus Frontend (MMM-BSR-Trash-Calendar.js), Backend (node_helper.js) und Stylesheet (MMM-BSR-Trash-Calendar.css)
- **Node_Helper**: Die serverseitige Komponente des Moduls, die HTTP-Anfragen an die BSR-API stellt und Daten an das Frontend weiterleitet
- **Frontend**: Die clientseitige Komponente des Moduls, die die Abfuhrtermine im MagicMirror-Interface rendert
- **BSR_API**: Die REST-Schnittstelle der Berliner Stadtreinigung unter `umnewforms.bsr.de`, bestehend aus Adress-Lookup und Abfuhrkalender-Endpunkten
- **AdressSchlüssel**: Der eindeutige Identifikator (AddrKey) einer Berliner Adresse, der von der BSR_API zurückgegeben wird und für Kalenderabfragen benötigt wird
- **Abfallkategorie**: Eine der von der BSR definierten Abfallarten: BI (Biogut), HM (Hausmüll), LT (Laubtonne), WS (Wertstoffe), WB (Weihnachtsbaum)
- **Abfuhrtermin**: Ein geplanter Abholtermin für eine bestimmte Abfallkategorie an einer bestimmten Adresse
- **ALBA**: Privater Entsorgungsdienstleister, der in Teilen Berlins die Wertstoffabholung (WS) übernimmt
- **Konfiguration**: Die vom Benutzer in der MagicMirror-config.js definierten Einstellungen des Moduls (Straße, Hausnummer, Anzeigeoptionen)
- **Cache**: Dateibasierter Zwischenspeicher im Modulverzeichnis, in dem der AdressSchlüssel und die Abfuhrtermine persistent gespeichert werden, um unnötige API-Aufrufe zu vermeiden und Neustarts des MagicMirror zu überstehen

## Anforderungen

### Anforderung 1: Adressauflösung

**User Story:** Als Benutzer möchte ich meine Berliner Adresse (Straße und Hausnummer) konfigurieren, damit das Modul die passenden Abfuhrtermine für meinen Standort abrufen kann. Alternativ kann ich einen bekannten AdressSchlüssel direkt angeben, um die Adressauflösung zu überspringen.

#### Akzeptanzkriterien

1. WHEN das Modul gestartet wird und kein gültiger Cache vorliegt (oder der Cache verworfen wurde), THE Node_Helper SHALL die BSR_API mit der konfigurierten Straße und Hausnummer abfragen, um den AdressSchlüssel zu ermitteln
2. WHEN die BSR_API einen gültigen AdressSchlüssel zurückgibt, THE Node_Helper SHALL den AdressSchlüssel für nachfolgende Kalenderabfragen speichern
3. IF die BSR_API keinen passenden AdressSchlüssel für die konfigurierte Adresse findet, THEN THE Frontend SHALL eine Fehlermeldung „Adresse nicht gefunden" anzeigen
4. IF die BSR_API bei der Adressauflösung nicht erreichbar ist, THEN THE Node_Helper SHALL den gleichen Retry-Mechanismus mit exponentiellem Backoff wie bei fehlgeschlagenen Terminabrufen verwenden (siehe Anforderung 2.6)
5. THE Node_Helper SHALL für jeden API-Aufruf (Adressauflösung und Terminabruf) ein Timeout von 30 Sekunden setzen, um hängende Verbindungen zu vermeiden
6. THE Node_Helper SHALL sicherstellen, dass zu jedem Zeitpunkt maximal ein API-Aufruf gleichzeitig aktiv ist, um doppelte Anfragen zu verhindern
7. IF der Benutzer einen `addressKey` direkt in der Konfiguration angibt, THEN THE Node_Helper SHALL die Adressauflösung über die BSR_API überspringen und den konfigurierten AdressSchlüssel direkt für Kalenderabfragen verwenden

### Anforderung 2: Abruf der Abfuhrtermine

**User Story:** Als Benutzer möchte ich, dass das Modul automatisch die aktuellen Abfuhrtermine von der BSR-API abruft, damit ich stets aktuelle Informationen sehe.

#### Akzeptanzkriterien

1. WHEN ein gültiger AdressSchlüssel vorliegt, THE Node_Helper SHALL die Abfuhrtermine über den JSON-Endpunkt der BSR_API abrufen
2. THE Node_Helper SHALL Abfuhrtermine für den aktuellen und den folgenden Monat abrufen, um einen lückenlosen Überblick zu gewährleisten
3. WHEN die Abfuhrtermine erfolgreich abgerufen wurden, THE Node_Helper SHALL die Daten per Socket-Notification an das Frontend senden
4. THE Node_Helper SHALL die Abfuhrtermine in einem konfigurierbaren Intervall (Standard: 24 Stunden) automatisch aktualisieren
5. IF der Abruf der Abfuhrtermine fehlschlägt, THEN THE Node_Helper SHALL die zuletzt erfolgreich abgerufenen Daten beibehalten und einen Retry-Mechanismus starten, der unabhängig vom regulären Aktualisierungsintervall arbeitet
6. THE Node_Helper SHALL bei fehlgeschlagenen API-Abrufen ein exponentielles Backoff für Retries verwenden, beginnend bei 5 Minuten und verdoppelnd bis maximal 2 Stunden (5 Min → 10 Min → 20 Min → 40 Min → 80 Min → 120 Min)
7. WHEN ein Retry innerhalb des regulären Aktualisierungsintervalls erfolgreich ist, THE Node_Helper SHALL das reguläre Intervall ab dem Zeitpunkt des erfolgreichen Retries neu starten
8. WHEN das reguläre Aktualisierungsintervall erreicht wird während ein Retry-Zyklus aktiv ist, THE Node_Helper SHALL das reguläre Intervall auslassen und den laufenden Retry-Zyklus fortsetzen
9. WHEN ein Retry erfolgreich ist, THE Node_Helper SHALL den Retry-Zähler zurücksetzen und zum regulären Aktualisierungsintervall zurückkehren

### Anforderung 3: Darstellung der Abfuhrtermine

**User Story:** Als Benutzer möchte ich die nächsten Abfuhrtermine übersichtlich auf meinem MagicMirror sehen, damit ich weiß, wann welcher Abfall abgeholt wird.

#### Akzeptanzkriterien

1. THE Frontend SHALL die Abfuhrtermine als sortierte Liste anzeigen, wobei der nächste Termin zuerst erscheint
2. THE Frontend SHALL für jeden Abfuhrtermin das Datum, die Abfallkategorie und den Entsorgungsdienstleister (BSR oder ALBA) anzeigen
3. THE Frontend SHALL die Anzahl der angezeigten Abfuhrtermine auf einen konfigurierbaren Wert begrenzen (Standard: 5)
4. WHEN keine Abfuhrtermine vorliegen, THE Frontend SHALL die Meldung „Keine Termine verfügbar" anzeigen
5. WHILE das Modul auf den ersten Datenabruf wartet, THE Frontend SHALL eine Lademeldung anzeigen

### Anforderung 4: Visuelle Unterscheidung der Abfallkategorien

**User Story:** Als Benutzer möchte ich die verschiedenen Abfallarten visuell unterscheiden können, damit ich auf einen Blick erkenne, welche Tonne bereitgestellt werden muss.

#### Akzeptanzkriterien

1. THE Frontend SHALL jede Abfallkategorie mit einer eindeutigen Farbe darstellen: Biogut (BI) in Braun, Hausmüll (HM) in Grau, Laubtonne (LT) in Grün, Wertstoffe (WS) in Gelb, Weihnachtsbaum (WB) in Dunkelgrün
2. THE Frontend SHALL neben jeder Abfallkategorie ein passendes Icon aus der Font-Awesome-Bibliothek anzeigen
3. THE Frontend SHALL den deutschen Klartextnamen der Abfallkategorie anstelle des Kürzels anzeigen (z.B. „Hausmüll" statt „HM")

### Anforderung 5: Konfigurierbarkeit

**User Story:** Als Benutzer möchte ich das Modul flexibel konfigurieren können, damit es sich in mein MagicMirror-Setup einfügt.

#### Akzeptanzkriterien

1. THE Modul SHALL folgende Pflicht-Konfigurationsparameter erfordern: Straßenname und Hausnummer — ODER alternativ ein direkt angegebener `addressKey`
2. THE Modul SHALL folgende optionale Konfigurationsparameter mit Standardwerten bereitstellen: Datumsformat (Standard: „dd.MM.yyyy"), Anzahl angezeigter Termine (Standard: 5), Aktualisierungsintervall in Millisekunden (Standard: 86400000), anzuzeigende Abfallkategorien (Standard: alle Kategorien)
3. IF der Benutzer `addressKey` in der Konfiguration angibt, THEN SHALL `street` und `houseNumber` optional sein und die Adressauflösung wird übersprungen
4. IF weder `addressKey` noch `street`+`houseNumber` konfiguriert sind, THEN THE Frontend SHALL eine Fehlermeldung mit den fehlenden Parametern anzeigen
5. WHEN der Benutzer bestimmte Abfallkategorien in der Konfiguration ausschließt, THE Frontend SHALL nur die konfigurierten Abfallkategorien anzeigen
6. IF Pflicht-Konfigurationsparameter fehlen, THEN THE Frontend SHALL eine Fehlermeldung mit den fehlenden Parametern anzeigen

### Anforderung 6: Hervorhebung bevorstehender Abholungen

**User Story:** Als Benutzer möchte ich Abholtermine, die heute oder morgen stattfinden, besonders hervorgehoben sehen, damit ich keine Abholung verpasse.

#### Akzeptanzkriterien

1. WHEN ein Abfuhrtermin auf den heutigen Tag fällt, THE Frontend SHALL diesen Termin mit dem Label „Heute" und einer auffälligen Hervorhebung darstellen
2. WHEN ein Abfuhrtermin auf den morgigen Tag fällt, THE Frontend SHALL diesen Termin mit dem Label „Morgen" und einer leichten Hervorhebung darstellen
3. THE Frontend SHALL für alle anderen Termine das konfigurierte Datumsformat verwenden

### Anforderung 7: Kommunikation zwischen Frontend und Node_Helper

**User Story:** Als Entwickler möchte ich, dass Frontend und Backend über definierte Socket-Notifications kommunizieren, damit die Architektur dem MagicMirror²-Standard entspricht.

#### Akzeptanzkriterien

1. WHEN das Frontend initialisiert wird, THE Frontend SHALL eine Socket-Notification mit der Konfiguration an den Node_Helper senden
2. WHEN der Node_Helper Abfuhrtermine empfängt, THE Node_Helper SHALL eine Socket-Notification mit den aufbereiteten Termindaten an das Frontend senden
3. IF ein Fehler im Node_Helper auftritt, THEN THE Node_Helper SHALL eine Fehler-Socket-Notification mit einer beschreibenden Fehlermeldung an das Frontend senden
4. THE Frontend SHALL bei Empfang neuer Termindaten die Anzeige automatisch aktualisieren

### Anforderung 8: Warnhinweise der BSR

**User Story:** Als Benutzer möchte ich Warnhinweise der BSR (z.B. Terminverschiebungen wegen Feiertagen) sehen, damit ich über Änderungen informiert bin.

#### Akzeptanzkriterien

1. WHEN ein Abfuhrtermin ein nicht-leeres Feld „warningText" enthält, THE Frontend SHALL den Warnhinweis unterhalb des betroffenen Termins anzeigen
2. THE Frontend SHALL Warnhinweise visuell vom regulären Termintext unterscheiden

### Anforderung 9: Testkonzept

**User Story:** Als Entwickler möchte ich eine umfassende Teststrategie für das Modul haben, damit die Korrektheit der Kernlogik (Datenverarbeitung, Datumsberechnung, Filterung, Konfigurationsvalidierung) sichergestellt und Regressionen frühzeitig erkannt werden.

#### Akzeptanzkriterien

1. THE Modul SHALL Unit-Tests für alle reinen Funktionen bereitstellen, die Datenparsing, Datumsberechnung und Kategoriefilterung abdecken
2. THE Modul SHALL Integrationstests bereitstellen, die das Zusammenspiel zwischen Node_Helper und Frontend über Socket-Notifications verifizieren
3. THE Modul SHALL Property-Based-Tests bereitstellen, die für beliebige gültige API-Antworten prüfen, dass das Parsing eine sortierte, vollständige Liste von Abfuhrterminen erzeugt
4. THE Modul SHALL Property-Based-Tests bereitstellen, die für beliebige gültige Konfigurationen prüfen, dass die Konfigurationsvalidierung entweder eine gültige Konfiguration mit Standardwerten oder eine beschreibende Fehlermeldung zurückgibt
5. WHEN ein Abfuhrtermin-Datensatz geparst, in das interne Format überführt und zurück serialisiert wird, THE Modul SHALL durch einen Round-Trip-Property-Based-Test sicherstellen, dass das Ergebnis dem Ausgangsdatensatz entspricht
6. THE Modul SHALL Property-Based-Tests bereitstellen, die prüfen, dass die Filterung nach Abfallkategorien idempotent ist: ein bereits gefiltertes Ergebnis erneut zu filtern ergibt dasselbe Ergebnis
7. IF ungültige oder fehlerhafte API-Antworten als Eingabe verwendet werden, THEN THE Modul SHALL in den Tests sicherstellen, dass ein definierter Fehler zurückgegeben wird und kein unbehandelter Ausnahmefehler auftritt
8. THE Modul SHALL einem TDD-Ansatz folgen, bei dem Tests vor der Implementierung geschrieben werden, und die Testfälle im BDD-Stil (Gegeben/Wenn/Dann) formuliert sind

#### BDD-Testfälle

**Szenario 1: Erfolgreiche Adressauflösung**

- Gegeben: Eine gültige Berliner Adresse (Straße und Hausnummer)
- Wenn: Das Modul die BSR-API abfragt
- Dann: Wird ein gültiger AdressSchlüssel zurückgegeben

**Szenario 2: Adresse nicht gefunden**

- Gegeben: Eine ungültige Adresse
- Wenn: Das Modul die BSR-API abfragt
- Dann: Wird die Fehlermeldung „Adresse nicht gefunden" angezeigt

**Szenario 3: Abfuhrtermine werden sortiert angezeigt**

- Gegeben: Mehrere Abfuhrtermine mit unterschiedlichen Daten
- Wenn: Die Termine im Frontend dargestellt werden
- Dann: Erscheinen die Termine aufsteigend nach Datum sortiert

**Szenario 4: Kategoriefilterung**

- Gegeben: Abfuhrtermine für BI, HM, WS und die Konfiguration categories: ["HM", "WS"]
- Wenn: Die Termine gefiltert werden
- Dann: Werden nur HM und WS Termine angezeigt

**Szenario 5: Heutiger Termin wird hervorgehoben**

- Gegeben: Ein Abfuhrtermin mit dem heutigen Datum
- Wenn: Der Termin im Frontend dargestellt wird
- Dann: Wird er mit dem Label „Heute" und auffälliger Hervorhebung angezeigt

**Szenario 6: Cache wird beim Neustart geladen**

- Gegeben: Eine gültige Cache-Datei mit zukünftigen Terminen
- Wenn: Das MagicMirror neu gestartet wird
- Dann: Werden die gecachten Termine sofort angezeigt ohne API-Aufruf

**Szenario 7: Warnhinweis wird angezeigt**

- Gegeben: Ein Abfuhrtermin mit nicht-leerem warningText
- Wenn: Der Termin im Frontend dargestellt wird
- Dann: Wird der Warnhinweis unterhalb des Termins angezeigt

**Szenario 8: Ungültige API-Antwort**

- Gegeben: Eine fehlerhafte API-Antwort (z.B. fehlendes dates-Feld)
- Wenn: Die Antwort geparst wird
- Dann: Wird ein definierter Fehler zurückgegeben

**Szenario 9: Unbekannte Kategorie in Konfiguration**

- Gegeben: Die Konfiguration categories: ["HM", "XX"]
- Wenn: Die Konfiguration validiert wird
- Dann: Wird "XX" ignoriert und eine Warnung protokolliert

**Szenario 10: API nicht erreichbar mit gültigem Cache**

- Gegeben: Eine gültige Cache-Datei mit zukünftigen Terminen und die BSR-API ist nicht erreichbar
- Wenn: Das Modul versucht, die Abfuhrtermine zu aktualisieren
- Dann: Werden die gecachten Termine weiterhin angezeigt und ein erneuter Abruf wird beim nächsten Intervall geplant

**Szenario 11: API nicht erreichbar ohne Cache**

- Gegeben: Keine Cache-Datei vorhanden und die BSR-API ist nicht erreichbar
- Wenn: Das Modul gestartet wird
- Dann: Wird eine Fehlermeldung angezeigt und ein erneuter Abruf wird nach dem konfigurierten Intervall geplant

**Szenario 12: Cache abgelaufen und API nicht erreichbar**

- Gegeben: Eine Cache-Datei, deren Termine alle in der Vergangenheit liegen, und die BSR-API ist nicht erreichbar
- Wenn: Das Modul versucht, neue Termine abzurufen
- Dann: Werden die veralteten Cache-Daten als Fallback angezeigt, eine Warnung wird protokolliert und ein erneuter Abruf wird beim nächsten Intervall geplant

**Szenario 13: Cache-Daten unterscheiden sich von API-Daten**

- Gegeben: Eine Cache-Datei mit Terminen und die BSR-API liefert aktualisierte Termine (z.B. verschobene Abholtermine wegen Feiertagen)
- Wenn: Das Modul die Abfuhrtermine erfolgreich von der API abruft
- Dann: Werden die neuen API-Daten im Cache gespeichert, die Anzeige wird mit den neuen Terminen aktualisiert und die alten Cache-Daten werden überschrieben

**Szenario 14: Retry mit exponentiellem Backoff bei API-Fehler**

- Gegeben: Ein fehlgeschlagener API-Abruf
- Wenn: Der erste Retry nach 5 Minuten ebenfalls fehlschlägt
- Dann: Wird der nächste Retry nach 10 Minuten geplant und die gecachten Daten bleiben angezeigt

**Szenario 15: Reguläres Intervall wird bei aktivem Retry übersprungen**

- Gegeben: Ein laufender Retry-Zyklus (z.B. nach 3 fehlgeschlagenen Versuchen) und das reguläre 24h-Aktualisierungsintervall wird erreicht
- Wenn: Das reguläre Intervall fällig wird
- Dann: Wird das reguläre Intervall ausgelassen und der Retry-Zyklus läuft weiter

**Szenario 16: Erfolgreicher Retry setzt reguläres Intervall zurück**

- Gegeben: Ein laufender Retry-Zyklus nach mehreren fehlgeschlagenen Versuchen
- Wenn: Ein Retry erfolgreich neue Daten von der API abruft
- Dann: Wird der Retry-Zähler zurückgesetzt, die neuen Daten werden angezeigt und gespeichert, und das reguläre 24h-Intervall startet ab diesem Zeitpunkt neu

**Szenario 17: Adresse in Konfiguration geändert**

- Gegeben: Eine Cache-Datei mit Daten für „Bergmannstr. 12" und die Konfiguration wird auf „Oranienstr. 5" geändert
- Wenn: Das MagicMirror neu gestartet wird
- Dann: Wird der gesamte Cache verworfen, eine neue Adressauflösung durchgeführt und neue Termine abgerufen

**Szenario 18: Mehrere Abfallarten am selben Tag**

- Gegeben: Abfuhrtermine für Hausmüll und Biogut am selben Datum
- Wenn: Die Termine im Frontend dargestellt werden
- Dann: Werden beide Termine als separate Einträge mit jeweiliger Farbe und Icon angezeigt

**Szenario 19: Jahreswechsel Dezember-Januar**

- Gegeben: Das aktuelle Datum ist im Dezember
- Wenn: Das Modul Termine für den aktuellen und folgenden Monat abruft
- Dann: Werden Termine für Dezember des aktuellen Jahres und Januar des Folgejahres korrekt abgerufen und angezeigt

**Szenario 20: Leeres categories-Array**

- Gegeben: Die Konfiguration categories: []
- Wenn: Die Konfiguration validiert wird
- Dann: Werden alle verfügbaren Abfallkategorien angezeigt und eine Warnung protokolliert

**Szenario 21: API-Timeout**

- Gegeben: Die BSR-API antwortet nicht innerhalb von 30 Sekunden
- Wenn: Der Node_Helper auf die Antwort wartet
- Dann: Wird der Aufruf abgebrochen, die gecachten Daten beibehalten und der Retry-Mechanismus gestartet

**Szenario 22: Morgiger Termin wird hervorgehoben**

- Gegeben: Ein Abfuhrtermin mit dem morgigen Datum
- Wenn: Der Termin im Frontend dargestellt wird
- Dann: Wird er mit dem Label „Morgen" und einer leichten Hervorhebung angezeigt

**Szenario 23: maxEntries begrenzt die Anzeige**

- Gegeben: 10 Abfuhrtermine und die Konfiguration maxEntries: 3
- Wenn: Die Termine im Frontend dargestellt werden
- Dann: Werden nur die 3 chronologisch nächsten Termine angezeigt

**Szenario 24: Pflicht-Konfigurationsparameter fehlen**

- Gegeben: Eine Konfiguration ohne Straßenname
- Wenn: Das Modul gestartet wird
- Dann: Wird eine Fehlermeldung mit dem fehlenden Parameter „street" angezeigt

### Anforderung 10: Dokumentation und Nutzungsanleitung

**User Story:** Als Benutzer möchte ich eine verständliche Dokumentation mit Installationsanleitung, Konfigurationsbeispielen und Nutzungshinweisen haben, damit ich das Modul schnell und fehlerfrei einrichten und verwenden kann.

#### Akzeptanzkriterien

1. THE Modul SHALL eine README.md-Datei bereitstellen, die eine Schritt-für-Schritt-Installationsanleitung für MagicMirror² enthält
2. THE Modul SHALL in der README.md mindestens ein vollständiges Konfigurationsbeispiel mit allen Pflicht- und optionalen Parametern bereitstellen
3. THE Modul SHALL in der README.md eine Beschreibung aller konfigurierbaren Parameter mit Datentyp, Standardwert und Erläuterung in tabellarischer Form bereitstellen
4. THE Modul SHALL in der README.md einen Abschnitt zu den API-Abhängigkeiten (BSR_API-Endpunkte, Datenformat, Ratenlimits) bereitstellen, damit Entwickler die externe Schnittstelle nachvollziehen können
5. THE Modul SHALL in der README.md mindestens einen Screenshot der Modulanzeige im MagicMirror bereitstellen, damit Benutzer das erwartete Erscheinungsbild kennen
6. WHEN sich Konfigurationsparameter oder das Verhalten des Moduls ändern, THE Modul SHALL die README.md entsprechend aktualisieren, damit die Dokumentation stets dem aktuellen Stand entspricht

### Anforderung 11: Caching und API-Schonung

**User Story:** Als Benutzer möchte ich, dass das Modul API-Aufrufe auf ein Minimum reduziert und Daten persistent zwischenspeichert, damit die BSR_API nicht unnötig belastet wird und das Modul auch nach einem Neustart sofort Daten anzeigen kann.

#### Akzeptanzkriterien

1. WHEN das Modul gestartet wird und ein gültiger AdressSchlüssel im Cache vorliegt, THE Node_Helper SHALL den gecachten AdressSchlüssel verwenden und keine erneute Adressauflösung über die BSR_API durchführen
2. WHEN das Modul erstmalig einen AdressSchlüssel von der BSR_API erhält, THE Node_Helper SHALL den AdressSchlüssel in einer dateibasierten Cache-Datei im Modulverzeichnis persistent speichern
3. WHEN gecachte Abfuhrtermine vorliegen, die mindestens einen zukünftigen Termin enthalten, und das Aktualisierungsintervall noch nicht abgelaufen ist, THE Node_Helper SHALL die gecachten Daten verwenden und keinen API-Abruf durchführen
4. WHEN das konfigurierte Aktualisierungsintervall seit dem letzten erfolgreichen API-Abruf abgelaufen ist, THE Node_Helper SHALL neue Abfuhrtermine von der BSR_API abrufen, unabhängig davon ob die gecachten Daten noch zukünftige Termine enthalten
5. WHEN neue Abfuhrtermine erfolgreich von der BSR_API abgerufen wurden, THE Node_Helper SHALL die Daten zusammen mit einem Zeitstempel in der dateibasierten Cache-Datei persistent speichern
6. WHEN das MagicMirror neu gestartet wird, THE Node_Helper SHALL die Cache-Datei einlesen und die gespeicherten Daten sofort an das Frontend senden, bevor ein API-Abruf erwogen wird
7. THE Node_Helper SHALL die Cache-Datei im JSON-Format speichern, bestehend aus AdressSchlüssel, Abfuhrterminen und dem Zeitstempel des letzten erfolgreichen Abrufs
8. IF die Cache-Datei beschädigt oder nicht lesbar ist, THEN THE Node_Helper SHALL die Datei verwerfen, eine Warnung protokollieren und die Daten erneut von der BSR_API abrufen
9. WHEN die konfigurierte Adresse (Straße oder Hausnummer) sich von der im Cache gespeicherten Adresse unterscheidet, THE Node_Helper SHALL den gesamten Cache verwerfen und eine neue Adressauflösung sowie einen neuen Terminabruf durchführen

### Anforderung 12: Auswahl der Müllkategorien

**User Story:** Als Benutzer möchte ich auswählen können, welche Müllkategorien auf dem MagicMirror angezeigt werden, damit ich nur die für mich relevanten Abfuhrtermine sehe.

#### Akzeptanzkriterien

1. THE Modul SHALL dem Benutzer ermöglichen, die anzuzeigenden Abfallkategorien (BI, HM, LT, WS, WB) über den Konfigurationsparameter `categories` als Array in der config.js festzulegen
2. WHEN der Benutzer keine `categories` in der Konfiguration angibt, THE Modul SHALL alle verfügbaren Abfallkategorien (BI, HM, LT, WS, WB) anzeigen
3. WHEN der Benutzer bestimmte Abfallkategorien in `categories` konfiguriert, THE Frontend SHALL ausschließlich Abfuhrtermine der konfigurierten Kategorien anzeigen
4. IF eine in `categories` konfigurierte Kategorie nicht den gültigen Werten (BI, HM, LT, WS, WB) entspricht, THEN THE Modul SHALL die unbekannte Kategorie ignorieren und eine Warnung protokollieren
5. THE Modul SHALL die Konfiguration von `categories` als einfaches String-Array bereitstellen (z.B. `categories: ["HM", "WS"]`), damit die Auswahl für den Benutzer leicht verständlich und schnell anpassbar ist
6. IF das `categories`-Array leer ist oder nach Entfernung ungültiger Kategorien leer wird, THEN THE Modul SHALL alle verfügbaren Abfallkategorien anzeigen und eine Warnung protokollieren

### Anforderung 13: CI/CD-Pipeline und Code-Qualitätssicherung

**User Story:** Als Entwickler möchte ich, dass bei jedem Commit und Pull Request automatisch Tests, Linting und Code-Qualitätsprüfungen ausgeführt werden, damit keine fehlerhaften oder stilistisch inkonsistenten Änderungen in den Hauptbranch gelangen.

#### Akzeptanzkriterien

1. THE Modul SHALL eine GitHub Actions Workflow-Datei (`.github/workflows/ci.yml`) bereitstellen, die bei jedem Push und Pull Request auf den `main`-Branch automatisch ausgeführt wird
2. THE CI-Pipeline SHALL folgende Schritte in dieser Reihenfolge ausführen: Linting, Unit-Tests, Property-Based-Tests, Integrationstests
3. IF ein Schritt in der CI-Pipeline fehlschlägt, THEN THE Pipeline SHALL den gesamten Workflow als fehlgeschlagen markieren und den Merge blockieren
4. THE Modul SHALL ESLint mit einer projektspezifischen Konfiguration (`.eslintrc.json`) bereitstellen, die konsistente Code-Standards für JavaScript durchsetzt
5. THE Modul SHALL Prettier mit einer projektspezifischen Konfiguration (`.prettierrc`) bereitstellen, die einheitliche Code-Formatierung sicherstellt
6. THE Modul SHALL Git-Hooks über Husky bereitstellen, die vor jedem Commit (`pre-commit`) automatisch Linting und Formatierung auf den geänderten Dateien ausführen
7. THE Modul SHALL lint-staged konfigurieren, damit nur die tatsächlich geänderten Dateien bei einem Commit geprüft werden, um die Commit-Geschwindigkeit zu erhalten
8. THE Modul SHALL commitlint mit der Conventional Commits Konvention konfigurieren, damit Commit-Messages dem Format `type(scope): description` entsprechen (z.B. `feat: add address resolution`, `fix: handle empty categories`)
9. THE CI-Pipeline SHALL auf Node.js LTS-Versionen (18.x und 20.x) getestet werden, um Kompatibilität sicherzustellen
10. THE Modul SHALL eine `.editorconfig`-Datei bereitstellen, die grundlegende Editor-Einstellungen (Einrückung, Zeilenende, Zeichensatz) projektübergreifend vereinheitlicht
11. THE Modul SHALL eine `.gitignore`-Datei bereitstellen, die `node_modules/`, `cache.json`, OS-spezifische Dateien, IDE-Konfigurationen, Test-Coverage-Berichte und Log-Dateien vom Repository ausschließt

#### BDD-Testfälle

**Szenario 25: CI-Pipeline blockiert fehlerhaften Merge**

- Gegeben: Ein Pull Request mit einem fehlschlagenden Unit-Test
- Wenn: Die CI-Pipeline ausgeführt wird
- Dann: Wird der Workflow als fehlgeschlagen markiert und der Merge blockiert

**Szenario 26: Pre-Commit-Hook verhindert unformatierten Code**

- Gegeben: Eine JavaScript-Datei mit inkonsistenter Formatierung
- Wenn: Ein Entwickler versucht, die Datei zu committen
- Dann: Wird der Commit abgelehnt und die Formatierungsfehler werden angezeigt

**Szenario 27: Commit-Message entspricht nicht Conventional Commits**

- Gegeben: Eine Commit-Message wie „fixed stuff"
- Wenn: Ein Entwickler versucht, den Commit auszuführen
- Dann: Wird der Commit abgelehnt und ein Hinweis auf das erwartete Format angezeigt

**Szenario 28: Direkter AdressSchlüssel überspringt Adressauflösung**

- Gegeben: Eine Konfiguration mit `addressKey: "10965_Bergmannstr._12"` (ohne `street`/`houseNumber`)
- Wenn: Das Modul gestartet wird
- Dann: Wird die BSR-API für die Adressauflösung nicht aufgerufen und der konfigurierte AdressSchlüssel direkt für Kalenderabfragen verwendet

**Szenario 29: Weder addressKey noch street+houseNumber konfiguriert**

- Gegeben: Eine Konfiguration ohne `addressKey`, `street` und `houseNumber`
- Wenn: Das Modul gestartet wird
- Dann: Wird eine Fehlermeldung mit den fehlenden Parametern angezeigt

### Anforderung 14: Live-API-Tests

**User Story:** Als Entwickler möchte ich automatisierte Tests haben, die die echte BSR-API abfragen, damit ich sicherstellen kann, dass die API-Integration korrekt funktioniert und Änderungen an der API frühzeitig erkannt werden.

#### Akzeptanzkriterien

1. THE Modul SHALL Integrationstests bereitstellen, die die echte BSR-API abfragen (Live-Tests), um die korrekte Adressauflösung und den Kalenderabruf zu verifizieren
2. Live-API-Tests SHALL nur ausgeführt werden, wenn die Umgebungsvariable `BSR_LIVE_TESTS=true` gesetzt ist, damit sie nicht standardmäßig in der CI-Pipeline laufen
3. WHEN ein Live-Test die Adressauflösung testet, SHALL er eine bekannte Berliner Testadresse verwenden und prüfen, dass ein gültiger AdressSchlüssel zurückgegeben wird
4. WHEN ein Live-Test den Kalenderabruf testet, SHALL er einen bekannten AdressSchlüssel verwenden und prüfen, dass eine gültige Liste von Abfuhrterminen zurückgegeben wird
5. Live-API-Tests SHALL einen Timeout von mindestens 30 Sekunden haben, um langsame API-Antworten zu tolerieren
