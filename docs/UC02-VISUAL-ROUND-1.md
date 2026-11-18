# UC02 · Visuelle Korrekturrunde 1

Basis: `aa747e9a3ec0a7de294da287c581d1350ca1c517`, Entwicklungsbranch `feature/native-ios`. Ziel ist Fancy Test auf dem iPhone 13 mini. Keine Übernahme in das iOS Release.

## Tatsächliche Änderungen

| Auftrag | Korrektur |
| --- | --- |
| UI-01 | Figma-Komponente `544:3139` als transparentes @3x-Asset mit vier separaten grünen Ecken. Resizable-Caps erhalten die Eckgeometrie. Die Berechnung von `finderRect` und dessen Übergabe an VisionKit bleiben unverändert. |
| UI-02 | Weißer 24-pt-Loader aus `548:4129`, kontinuierliche Rotation mit einer Sekunde pro Umdrehung. Kein Neustart der Animation bei jedem Render. Statuswechsel, Hintergrund, Kamera-Unverfügbarkeit und Schließen entfernen die Animation. Das bisherige orange Asset bleibt für den Kamera-Fehlerzustand erhalten. |
| UI-03 | Nachgereichte Referenzen `571:1187` / `571:1258`: 48 → 168 pt, Höhe 48 pt, weißes ADD NEW TEA mit 15-pt-Schrift und dem bestehenden Pfeil. Aufklappen beim Drücken, Öffnen von ADD beim Loslassen innerhalb derselben Schaltfläche, ohne zweiten Bestätigungstap. Animation 180 ms. Abgebrochene Berührungen und Hintergrundwechsel verhindern verspätete Navigation. Während der Erweiterung ist der sonst überlappende Papierkorb vorübergehend ausgeblendet; seine normale Position bleibt erhalten. |
| UI-04 | Eigener Zustand für einen verifizierten Barcode: `Found your tea!` und Success-Haken `#37D17D` aus `547:3268`. 700 ms lesbares Feedback, danach automatische Navigation mit der bereits akzeptierten Barcode-ID. Keine neue Bestätigung. Schließen/Hintergrund brechen den ausstehenden Übergang ab; Rückkehr nimmt ihn nur für denselben noch gültigen Treffer wieder auf. Unbekannter Barcode und Fehler behalten ihre getrennten Zustände. |
| UI-05 | Oberer Papierkorb behält Position, Auswahl und Löschaktion. Hintergrund `#1B272B` mit 80 % Deckkraft; vorhandenes Papierkorb-Glyph als weißes Template. Close und Manual bleiben in ihrer bisherigen Gestaltung. |
| UI-06 | Getrennte Figma-Assets für das obere weiße Info-Icon (`566:510`) und die untere grüne Handlungsanweisung (`566:523`, `#B9FC69`). |
| UI-07 | Nach einem verbleibenden Foto: `Scan brewing details`. Ab zwei verbleibenden Fotos: `Let's add your tea`. In beiden Fällen `ADD NEW TEA`. Bestehende Löschung und erneute Identifikation bestimmen den Zustand anhand der noch vorhandenen Fotos; Drei-Foto-Limit unverändert. |
| UI-08 | Die Eingabebreite des Zeitwerts folgt einer bzw. zwei Ziffern. Die vollständige Gruppe aus Zahl, Abstand und MIN ist zentriert; kein leerer Ziffernplatz links bei 1–9. Bestehende 66-pt-Buttons, Position, Validierung und Bedienung bleiben erhalten. |

## Nachgewiesene Ursachen im bisherigen Code

- Durchgehende `lineDashPattern` statt des freigegebenen Eckmarkierungs-Assets.
- Loader-Datei war aus einem Fehlerzustand exportiert und hatte keine Rotationsanimation.
- Bekannter Barcode rief unmittelbar `finish("use")` auf; ein eigener sichtbarer Erfolgszustand fehlte.
- Oberes und unteres Info-Icon waren nicht getrennt.
- No-match-Anweisung war unabhängig von der Fotoanzahl immer identisch.
- Feste Eingabebreite von zwei Zeichen mit rechtsbündiger Zahl verschob die sichtbare Gesamtbeschriftung bei einstelligen Werten.

Die Ursachen sind aus Code und Ressourcen belegt. Die Wirkung auf dem physischen iPhone ist noch nicht bestätigt.

## Prüfumfang

- `npm test`: 270 Tests bestanden. Neue Prüfungen lesen die tatsächlichen PNG-Pixel (weiß / Success-Grün / Lime, Transparenz und separate Ecken), prüfen die nativen Status-/Lifecycle-/Navigations-Guards und rendern das React-Formular mit 1, 9, 10 und 30 MIN.
- `npm run check:safety` und `git diff --check`: erfolgreich.
- Web-Build, Native-Build und isolierter Fancy-Test-Build mit Capacitor-Sync: erfolgreich. Für den isolierten Build wurden lokale CI-Fixture-Einstellungen verwendet; das ist kein realer Backend-Test.
- Xcode-Simulator-Build: nach dem Commit über den bestehenden Xcode-26.2-Workflow prüfen; das tatsächliche Ergebnis wird mit Commit und Workflow-Link übergeben.
- Ein interaktiver Chromium-Lauf konnte in dieser Ausführungsumgebung nicht gestartet werden. Rendering-/Quelltextprüfungen sind kein Pixel- oder Touch-Test.
- Keine Dateien aus UC01, Timer, Audio/Video, Live Activity, AlarmKit, Supabase oder Signing geändert. Bestehende Recognition-, Upload- und Save-Pfade werden weiterverwendet.

## Offene iPhone-Abnahme mit 02

1. Vier grüne Ecken; Barcode-Erkennung arbeitet in derselben Region wie zuvor.
2. Weißer Loader dreht während Barcode-/Fotosuche und stoppt bei Treffer, Fehler, Hintergrund und Schließen. Rückkehr startet ihn nur im Suchzustand.
3. Manual Shortcut gedrückt halten: erweiterte Form kontrollieren. Loslassen innerhalb öffnet ADD; außerhalb oder abgebrochene Geste öffnet nichts. Foto-/Barcode-Übernahme und CANCEL bleiben erhalten.
4. Bekannten Barcode scannen: Found your tea! mit grünem Haken ist kurz lesbar, danach richtige Tea Detail. X oder Sperren während der Rückmeldung darf keine doppelte/verspätete Navigation auslösen.
5. Oberen Papierkorb und Thumbnail-Auswahl prüfen, einschließlich zusätzlicher Aufnahme und Löschen während einer ausstehenden Erkennung.
6. Kein Treffer mit einem / zwei / drei Fotos; anschließend auf zwei / ein Foto reduzieren und Anweisung erneut prüfen. Drittes Foto weiterhin möglich.
7. Oberes Info weiß, unteres Info grün. Warnungen/Fehler getrennt vom Erfolg.
8. 1 / 9 / 10 / 30 MIN, manuelle Eingabe und Plus/Minus visuell prüfen; danach SAVE/CANCEL und vollständigen BREW-Ablauf als Regression prüfen.

Bestehenden Fancy-Test-Worktree und persönliche Signing-Einstellungen erhalten. Kein Reset, kein Überschreiben der lokalen Xcode-Projektdatei und keine Produktivmigration.
