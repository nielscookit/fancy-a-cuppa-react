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
