# UC02 · Fancy Test · Implementierung vom 18. November 2026

Basis: `41e718487f0a4c357866333815e6f78a66d0f07e`, ausschließlich Entwicklungsbranch `feature/native-ios`. Keine Integration in das iOS Release, kein Merge nach `main`, keine Migration und kein Deployment.

## Implementierung

- Vorhandener VisionKit-Controller, Aufnahme und Apple Vision bleiben die Grundlage. Explizite Zustände für Barcode, unbekannten/unlesbaren Barcode, Foto, Identifikation, unlesbares Foto, Kandidaten, kein Treffer und Netzwerkfehler.
- Bekannter Barcode schließt weiterhin direkt zur bestehenden Detailnavigation. Ein unbekannter, nativ akzeptierter Barcode bleibt für ADD erhalten. Sein Status verschwindet nicht nach einem Timer.
- Fotoaufnahme identifiziert automatisch. Maximal drei komprimierte In-Memory-Aufnahmen, auswählbare Thumbnails und Löschung der gewählten Aufnahme. Nach jeder Änderung werden OCR/Katalog-Ergebnisse invalidiert und ausschließlich die verbleibenden Fotos ausgewertet. Ein unlesbares neues Foto bleibt gespeichert und sichtbar.
- SCAN BARCODE AGAIN bleibt nach der ersten erfolgreichen Aufnahme dauerhaft gesperrt, auch nach Löschen aller Fotos. Während Aufnahme/Erkennung keine konkurrierenden Scans.
- Echte Kandidaten benötigen weiterhin den vollständigen Hersteller und Produktnamen im erkannten Text. Mehrere unterschiedliche Katalog-IDs werden als einzelne Zeilen angeboten; deren Auswahl öffnet unmittelbar Tea Detail. Keine Beispielprodukte. Rejection verwirft Kandidaten und deren Prefill.
- Foto-/Barcode-Request-IDs, Abbruchsignale und Foto-Revisionen verhindern verspätete Datenübernahme. Das Schließen stoppt Requests, erhält aber kurzzeitig den bereits nativ akzeptierten Abschlussdatensatz für die Bridge-Antwort.
- Fehlgeschlagener Barcode-Lookup wird beim nächsten `online`-Ereignis einmal automatisch mit demselben Barcode wiederholt. Auch eine Wiederverbindung während des noch fehlschlagenden Requests wird berücksichtigt. Moduswechsel und Schließen verhindern weitere Wiederholung. Ein erfolgloser Katalogabruf wird nicht als bestätigter Nichttreffer behandelt.
- Kamera ohne Berechtigung/Verfügbarkeit zeigt den freigegebenen Fehlerzustand mit X. Der gezielte Barcode-Erfassungsmodus des Formulars erhält seine separate Rückgabe ohne Katalog-/Foto-Navigation.

## Figma und Formular

Erneut geprüft: Seite `490:698`, Kamera-/Fehler-/Trefferzustände sowie EMPTY `578:1523`, PREFILLED `579:3036` und Photo unreadable `548:3708`.

Die neue React-Formulargestaltung ist an `nativeIOS && communityTeaV4` gebunden. Web/PWA behält die bisherige Darstellung. Swift-Kameraänderungen liegen auf dem Entwicklungsbranch; sie werden nicht als iOS Release veröffentlicht.

- Foto leer: 66 px; mit Fotos: Hero 264 px, 66-px-Thumbnails, Auswahl/Trash/Add bleiben erhalten.
- Barcode-Zeile 48 px oberhalb Tea Name; zwei Inhaltsseparatoren und Feldgruppen entsprechend Referenz.
- Neue Auswahl nur `g`, `tsp`, `bags`. Bestehende `measure`-Dosierungen bleiben unverändert erhalten; ein Hinweis erklärt, dass bei manueller Auswahl einer anderen Einheit auch die Menge angepasst werden muss. Keine automatische Umrechnung.
- Native Standardziehzeit 1 MIN; bestehende EDIT-Ziehzeit bleibt erhalten. Editierbarer Stepper 1–30 Minuten nach Temperature. Eindeutige, ausdrücklich beschriftete OCR-Ziehzeit wird übernommen, Intervalle/mehrdeutige Werte nicht.
- CANCEL/SAVE bleiben im Formular-Scrollbereich. Bestehende Validierung, Save-Sperre, Konfliktbehandlung und Foto-Persistenz unverändert weiterverwendet.
- Das Plus im Barcode-Feld ist ebenfalls ein lokales Figma-Asset und benötigt keine externe Icon-Schrift.
- Transparente PNGs aus den freigegebenen Figma-Vektoren, @3x; liegen unter `public/figma/uc02-*.png`. Capacitor kopiert sie ohne Änderungen am Xcode-Projekt. Native Kategorie-Marker verwenden das bereits gebündelte Material-Symbols-Sharp-Font und die bestehende Kategoriezuordnung.

Figma-Assetquellen: Info `547:3193`, Close `493:366`, Manual `543:2943`, Check `547:3338`, Offline `578:833`, Open `554:4700`, Add photo `578:1860`, Delete `582:3227`, Error `548:3447`, Cancel `578:806`, Progress `578:785`, Barcode Add `578:1897`.

## Tatsächliche Prüfungen in der Entwicklungsumgebung

- `npm test`: 262 Tests bestanden, keine übersprungen. Enthält Bridge-/Request-Rennen, Online-Retry, Kandidatenauswahl/Rejection, Foto-Invalidierung, OCR-Labels und gerenderte React-Formulare (SSR).
- `npm run check:safety`: bestanden.
- `git diff --check`: bestanden.
- `npm run build`: erfolgreich.
- `npm run build:native`: erfolgreich.
- `npm run build:ios-uc02-local`: mit ausschließlich lokalen CI-Fixture-Einstellungen erfolgreich; Capacitor-Sync enthalten. Der öffentliche Fixture-Key ist keine reale Backend-Testverbindung.
- Persönliche Signing-Einstellungen, Bundle-IDs, Projektdatei, Timer-, Audio-, Video-, AlarmKit-, Widget- und Backend-Dateien nicht geändert.
- Der bestehende Simulator-Workflow berücksichtigt künftig auch die betroffenen UC02-Frontend-/Asset-/Testdateien.
- Xcode steht in der Linux-Entwicklungsumgebung nicht zur Verfügung. Der bestehende macOS-/Xcode-26.2-GitHub-Workflow wird durch die Änderung der Kamera-Datei ausgelöst. Der erste Implementierungsstand `846e8a8` wurde im [Workflow 44402039968](https://github.com/nielscookit/fancy-a-cuppa-react/actions/runs/44402039968) erfolgreich als normale App und als isolierte Fancy-Test-App einschließlich Extension gebaut. Die abschließende Safe-Area-/Asset-Korrektur wird erneut durch denselben Workflow geprüft; dessen Ergebnis wird in der Übergabe genannt.

## Offene Prüfungen / Grenzen

- `http://127.0.0.1:54321/rest/v1/` war hier nicht erreichbar (HTTP 000 / Verbindungsfehler). Kein echter Supabase-, Storage- oder End-to-End-Test durchgeführt. Keine Aussage, dass die zuletzt gemeldete Backend-Erreichbarkeit auf dem iPhone behoben sei.
- Interaktiver Chromium-Test konnte wegen einer Ausführungsbeschränkung (`socket() failed: Operation not permitted`) nicht starten. SSR-Tests bestätigen gerenderte Elemente, keine Pixelpositionen oder Touch-/Keyboard-Interaktionen.
- Kein physischer iPhone-Test. Die oberen Kamera-Bedienelemente berücksichtigen die vorhandene Safe Area/Notch; Figma-Koordinaten gelten für die unbeschnittene Canvas. Native VisionKit-Kamera, OCR-Qualität, Hintergrund/Rückkehr, Netzwerkwechsel, Safe Area und tatsächliche Figma-Übereinstimmung müssen auf dem iPhone geprüft werden. Ein Simulator-Build ersetzt diese Abnahme nicht.
- Ohne extern messbaren Verbindungswechsel kann ein JavaScript-`online`-Ereignis ausbleiben, etwa wenn nur der lokale Supabase-Prozess wieder startet. Die automatische einmalige Wiederholung bei einem echten Netzwerkwechsel ist automatisiert geprüft; das WKWebView-Verhalten bleibt ein Gerätetest.
- Keine gemessenen Time-to-Brew-Werte vom iPhone vorhanden.

## Fancy Test auf dem Mac aktualisieren

Im bestehenden Fancy-Test-Worktree arbeiten. Keine Dateien zurücksetzen, kein automatisches Stash und keine neue Signing-Konfiguration übernehmen.

```bash
cd "$HOME/Documents/fancy-a-cuppa-uc02-ios"
git status --short --branch
git fetch origin feature/native-ios
git merge --ff-only origin/feature/native-ios
npm ci
npm test
npm run check:safety
npm run build:ios-uc02-local
npx cap open ios
```

Bei Merge-Abbruch wegen lokaler Änderungen stoppen und den konkreten Konflikt prüfen; nicht resetten. Die vorhandene `.env.uc02-local.local` weiterverwenden. API-Endpunkt muss vom iPhone erreichbar sein (Mac-LAN-IP, kein iPhone-Loopback), ebenso signierte Foto-URLs. Keine Keys in Berichte kopieren.

In Xcode Scheme App, Debug, Gerät iPhone 13 mini und die vorhandene persönliche Signing-Konfiguration verwenden. Vor Run kontrollieren: `Fancy Test`, `com.fancyacuppa.test`, passende Test-Extension. Nur die vorhandene Fancy-Test-Installation aktualisieren. Die normale App nicht löschen oder überschreiben.

## Gemeinsame iPhone-Abnahme mit 02

1. Lokales Backend und Katalog/Fotodownload vom Gerät erreichbar nachweisen; erst dann End-to-End-Testergebnisse werten.
2. UC01 Timer-/Scanner-Widgets, Cold/Warm Start, X-Rückkehr, keine doppelte Kamera und kein Timer-Reset.
3. Bekannter Barcode → direkt richtige Detailseite; unbekannter Barcode bleibt bis zum ersten Foto sichtbar; Continue und erneuter Barcode-Scan vor dem ersten Foto.
4. Nach erster Aufnahme kein erneuter Barcode-Scan, auch nach Löschen aller Fotos. Automatische Identifikation; unlesbares Foto mit Thumbnail und Wiederaufnahme; maximal drei Fotos; Auswahl/Trash/Neuaufnahme.
5. Ein und mehrere echte Kandidaten wählen; Rejection → kein Treffer; ADD enthält keine verworfenen Katalogwerte. Fotos/unbekannter Barcode bleiben erhalten.
6. EMPTY/PREFILLED und EDIT einschließlich Barcode, Keyboard, Dosierung/Legacy-measures, Stepper 1/30 und gespeicherter Ziehzeit, kleine Viewports und Scroll bis SAVE/CANCEL prüfen.
7. Pflichtfelder, Doppel-SAVE, Cancel, fehlgeschlagener Upload/Save und Dublettenkonflikt mit realem lokalen Backend; Fotos/Eingaben bei Fehler erhalten.
8. Verbindung während Barcode-Lookup trennen und wiederherstellen: einmaliger Retry ohne erneuten Scan. Moduswechsel/Schließen während ausstehender Antworten testen.
9. Detail → BREW vollständig, Memo/Ready/AlarmKit, RESET, Hintergrund-/Medien-Regressionen prüfen.
10. Reale Zeit Widget-/Scanner-Tap bis nutzbare Kamera und START bis Timerbeginn messen; keine geschätzten Werte als Messung eintragen.

Status bleibt bis dahin: implementiert und automatisiert geprüft; iPhone-Abnahme und Produktfreigabe offen.
