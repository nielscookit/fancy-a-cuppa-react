# UC02 · P3 OCR-Prefill in Fancy Test

Die native Kamera sendet die bisherigen `photoText.lines` weiterhin an die
beiden bestehenden Katalog-Matcher. Die konfigurierte Fancy-Test-App
(`com.fancyacuppa.test`) kann zusätzlich `photoText.observations` anfordern.
Jede Beobachtung enthält `text` (Vision-Original), `confidence` (0 bis 1),
`photoIndex` (ab 1 in der aktuellen Fotoauswahl), `order` (Vision-Reihenfolge
pro Foto, ab 0) und `boundingBox` mit `x`, `y`, `width`, `height`.
Die Box verwendet Vision-Koordinaten von 0 bis 1 mit Ursprung unten links.

Nur ein aktuelles, von der Kamera akzeptiertes `no_match` kann P3-Felder in
ADD übernehmen. Ein Lookup-Fehler, ein Timeout oder eine abgelehnte
Katalogauswahl liefert kein P3-Prefill. Die am selben Ablauf gescannten Barcodes
und Foto-Vorschauen gehen weiter über ihre bestehenden Schnittstellen.

Explizite Feldnamen bleiben unterstützt. Ohne Feldnamen verwendet P3 wenige
buchstabengetreu erkannte Markennamen und eine passende Produktüberschrift.
Die Heuristik deckt keine beliebigen Logos oder Layouts ab. Zubereitungswerte
ohne eindeutigen Zusammenhang, widersprüchliche Werte und abweichende
Beutelrezepte bleiben zur Eingabe. Bei einer eindeutig erkannten Ziehzeitspanne
wird nur die Untergrenze ins Formular übernommen. Evidenz, Spannen und Gründe
verbleiben im Arbeitsspeicher. Der bestehende SAVE-Pfad bekommt nur Formularwerte.

## Gerätetest für 02 und 07

1. Fancy-Test-Worktree per Fast-forward aktualisieren und die vorhandene
   `.env.uc02-local.local` mit vom iPhone erreichbarer lokaler API verwenden.
   `npm run build:ios-uc02-local` ausführen. Im Xcode-Schema `App` mit
   Konfiguration `Debug` das iPhone auswählen und Fancy Test starten.
2. dm Bio Schwangerschaftstee fotografieren. Bei `No match found` über
   `ADD NEW TEA` öffnen. Hersteller, vollständigen Produktnamen, Kategorie,
   Zubereitungswerte sowie leer gebliebene Felder direkt an der Packung prüfen.
   Foto-Vorschau und gegebenenfalls unbekannten Barcode kontrollieren.
3. Eine bekannte Packung, einen abgelehnten Kandidaten, einen Scan mit
   unterbrochener Netzwerkverbindung und eine gelöschte Aufnahme prüfen. Bei
   keinem dieser Abläufe darf ein verworfenes Ergebnis neue Felder befüllen.
   Änderungen müssen im Formular editierbar bleiben. SAVE erfolgt per Tap.
4. Vorm Vergleich auf beiden Ständen im Xcode-Schema unter
   **Run → Arguments → Environment Variables** `FAC_OCR_P1_CONSOLE=1` setzen.
   Dieselbe Verpackung, Seite, Fotoanzahl und Licht verwenden. Je Stand fünf
   Durchläufe messen. Die `[FAC-OCR-P1]`-Einträge nach `id` zuordnen und jeweils
   `ocrDurationMs`, `timings.prefillMs` und die Zeit bis zur sichtbaren ADD-Ansicht
   erfassen. Für P3 enthält `structuredPrefill` übernommene Feldnamen und
   Ablehnungsgründe. Parserzeit und Zeit bis zur sichtbaren Ansicht getrennt
   dokumentieren. Mit 07 Feldentscheidungen und Messwerte teilen. Der vorhandene
   P1-Konsolenauszug enthält Klartext aus der Verpackung.

## P3.1 · OCR-Regressionen von der Geräteabnahme

Die Fixtures verwenden die gemeldeten OCR-Textausschnitte. Positionen,
Konfidenzen und die genaue Trennung der Fragmente sind für reproduzierbare
Tests nachgebildet. Der Rohdump des iPhones lag bei der Implementierung nicht vor.

| Verpackung | In den Fixtures übernommen | In den Fixtures leer |
| --- | --- | --- |
| Twinings English Breakfast | TWININGS, ENGLISH BREAKFAST und 100 °C bei zusammenhängendem Zubereitungsblock | Ziehzeit aus `-4 min`, Dosis und Wassermenge ohne belegtes Paar |
| dm Bio Schwangerschaftstee | SCHWANGERSCHAFTSTEE und 5 Minuten aus dem vollständig lesbaren Bereich 5–6 Minuten | Hersteller bei `amBio` und Beuteldosierung bei 200 ml |

Beim erneuten iPhone-Test dieselben Seiten fotografieren. Werte im Formular
erst nach `No match found` vergleichen, die vorhandenen Defaults von
übernommenen OCR-Feldern anhand von `structuredPrefill.acceptedFields`
unterscheiden und `ocrDurationMs` sowie `timings.prefillMs` dokumentieren.
Die Temperatur bleibt offen, wenn die echten OCR-Boxen keinen gemeinsamen
Zubereitungsblock bestätigen.

## P3.2 · Lesbare Namen und beschriftete Ziehzeit

Nur die Formularwerte werden formatiert. Der OCR-Text für die Diagnose
bleibt erhalten. Bei Twinings genügt der belegte Markenname zusammen mit dem
vollständigen Titel im selben Foto. Sind ENGLISH und BREAKFAST getrennt
erkannt, müssen sie weiterhin räumlich zusammenpassen. Die Marke kann
außerhalb des bisherigen Logobereichs stehen. Unvollständige oder
widersprüchliche Identitäten bleiben von diesem Pfad ausgeschlossen.

Eine explizite Ziehzeit kann als Textzeile, Anweisung oder separater
Wert unter der passenden Beschriftung erkannt werden. Bei vollständig
lesbaren Bereichen übernimmt das Formular die Untergrenze. Ein
abgeschnittener Wert wie -4 min bleibt offen. Die übrigen Feldregeln gelten
weiterhin.

Beim Gerätetest Vorder- und Rückseite beider Packungen erneut aufnehmen.
Nach „No match found“ im ADD-Formular für dmBio
Schwangerschaftstee und 5 MIN prüfen. Für Twinings den Hersteller Twinings
und den Produktnamen English Breakfast prüfen. Die Temperatur nur
erwarten, wenn der Zubereitungsblock im Testlauf eindeutig erkannt wird.
In den Xcode-Protokollen unter structuredPrefill.acceptedFields verifizieren,
ob die Ziehzeit aus OCR stammt. Einen realen Katalogtreffer gegenprüfen.

## P3.3 · Bestätigte Textfragmente und Wassermenge

Die Regressionstests verwenden die gemeldeten OCR-Fragmente beider
Aufnahmen. Die Positionen der OCR-Boxen wurden nachgebildet. Die exakten
Gerätekoordinaten sind offen.

- `EBio`, `SCHWANGER-` und `SCHAFTSTEE` auf der Vorderseite sowie
  `mindestens 5 Minuten ziehen` auf der Rückseite ergeben
  Schwangerschaftstee und 5 MIN. Der Hersteller bleibt ohne eindeutiges
  Markenfragment offen.
- `TWININGS®`, `ENGLISH`, `BREAKFAST` und `Rich & Balanced` ergeben
  Twinings und English Breakfast. Der Werbezusatz bleibt außerhalb des
  Produktnamens. Ein zusammenhängender Block aus `100°C`, `250 ml` und
  `3-4 min` erlaubt 100 °C, 250 ml Wasser und 3 MIN. Daraus ergibt sich
  keine Teedosierung.

P3.2 verlangte beim Schwangerschaftstee eine hoch positionierte,
eng gesetzte Überschrift. Für die exakten dmBio- und Twinings-Fragmente
lässt P3.3 zusätzliche Abstände und unterschiedliche Zeilenhöhen zu,
wenn sie im selben Bild weiterhin als Titelblock plausibel sind. Ein
eindeutig gelesener registrierter Twinings-Aufdruck kann unabhängig vom
Produktnamen übernommen werden. Als einzelner Wert wird Wasser nur aus
einem vollständigen Zubereitungsblock übernommen. Unverbundene oder
widersprüchliche Mengen bleiben offen.

Beim iPhone-Test in Fancy Test beide Packungen erneut vorne und hinten
fotografieren. In ADD NEW TEA nach „No match found“ die genannten Werte
prüfen. In den Xcode-Protokollen zeigt `structuredPrefill.acceptedFields`
die übernommenen Felder, darunter `base` für die Wassermenge.
`structuredPrefill.rejected` zeigt die Gründe für offene Felder. Den
bekannten Katalogtreffer und seinen Abbruchpfad gegenprüfen.
