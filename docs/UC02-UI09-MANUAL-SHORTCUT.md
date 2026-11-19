# UC02 · UI-09 · Manual Shortcut mit zwei Taps

Basis: `e765a5acdd13735e00596b99ce0a51d17a3eafa7`, Branch `feature/native-ios`, Ziel Fancy Test. Diese Freigabe ersetzt die Ein-Tap-Beschreibung von UI-03 in der vorherigen visuellen Korrekturrunde.

## Änderung

`touchDown` löst kein Aufklappen mehr aus. `openManualShortcut()` behandelt ausschließlich abgeschlossene Taps:

1. Geschlossen: bestehende Animation auf 168 pt ausführen und sofort zurückkehren. Kamera, Barcode-/Foto-Lookups und erkannte Daten bleiben erhalten. Keine Navigation wird vorgemerkt.
2. Bereits aufgeklappt: vorhandenen ADD-Pfad einschließlich Doppelaufruf-, Generationen- und Lifecycle-Guards ausführen.

48/168 pt Breite, 48 pt Höhe, Animation, Beschriftung und Figma-Gestaltung (`571:1187` / `571:1258`) bleiben erhalten. Schließen, Hintergrundwechsel und abgebrochene Berührungen verwenden weiterhin die bestehenden Abbruchpfade.

## Automatisierte Prüfungen

- Angepasste Ereignis-/Zustandsprüfung in `tests/nativeTeaCameraVisuals.test.mjs`.
- Neuer Test `tests/nativeManualShortcut.test.mjs` führt die tatsächlich aus dem Controller gelesenen Swift-Methoden auf macOS aus. Nur UIKit-Zeichnung und Animationsplanung werden ersetzt. Geprüft werden persistentes Aufklappen ohne Navigation, zweiter Tap, schnelle Mehrfachtaps, Schließen und Hintergrundwechsel vor/nach dem zweiten Tap sowie deaktivierte Bedienung.
- Lokal unter Linux: 270 Tests bestanden; der zusätzliche Swift-Test ist mangels Apple-Toolchain explizit übersprungen. Er wird im bestehenden macOS-/Xcode-CI ausgeführt. Tatsächliche CI-Ergebnisse werden mit dem Commit übergeben.
- Safety-Check, Web-Build und Git-Diff-Prüfung erfolgreich. Native Builds und Capacitor-Sync werden zusätzlich vom bestehenden Simulator-Workflow geprüft.

Keine Änderungen an Erkennung, Fotoverwaltung, Formular, UC01, Timer, Medien, Live Activity, Backend, Assets, Layout oder Signing. Keine Übernahme in das iOS Release und kein Merge nach `main`.

## Offene iPhone-Abnahme

- Erster Tap klappt nur auf; auch nach Warten bleibt Kamera offen und ADD NEW TEA sichtbar.
- Zweiter Tap öffnet das bestehende Formular einmalig, mit den bisherigen übernommenen Daten.
- Nach erstem Tap X schließen: auch nach Warten kein Formular.
- Nach erstem/zweitem Tap Sperren oder App-Wechsel: keine verspätete Navigation nach Abbruch.
- Barcode-, Foto- und ADD-/CANCEL-Abläufe als Regression prüfen.

Der Swift-Logiktest und ein erfolgreicher Simulator-Build ersetzen keine physische Touch-/Kamera-Prüfung auf dem iPhone 13 mini.
