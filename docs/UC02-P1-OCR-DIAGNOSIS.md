# UC02 · P1 OCR-Diagnose (nur Fancy Test)

Ausgangsstand `bce57c3`. Keine visuellen oder funktionalen Änderungen an Kamera,
OCR-Konfidenzfilter, Matching, Prefill, Barcode-Scan, Timer oder Supabase.

## Sicherheit

Log-Ausgabe ist nur bei **DEBUG** und exakter Bundle-ID `com.fancyacuppa.test`
aktiv. Keine Fotodaten, Base64, Zugangsdaten, externe KI, Netzwerkübertragung
oder Speicherung in Dateien/Supabase. OCR-Texte können sensibel sein.

## Ablauf auf dem iPhone

1. Fancy-Test-Worktree aktualisieren. Lokale Xcode-Signing-Änderungen erhalten.
2. `npm run build:ios-uc02-local` ausführen und Fancy Test in Xcode starten.
3. Xcode Debug Console öffnen und nach `[FAC-OCR-P1]` filtern.
4. Den Tee aus Test 23 mit **No barcode · Continue** fotografieren.
5. Nach abgeschlossener Identifikation die JSON-Zeile kopieren und gezielt
   an 07 · Bilderkennung & KI zur Auswertung weitergeben.
6. Keine Diagnoseausgaben mit privaten Inhalten in GitHub veröffentlichen.

## Daten

- `id`, `revision`, `photoCount`: eindeutiger Aufnahmedurchlauf
- `photos[].photoIndex`: Zuordnung Foto 1–3
- `photos[].observations[]`: OCR-Text, Konfidenz, Filterentscheidung
- `photos[].acceptedLines`: tatsächlich für Matching genutzte Textzeilen
- `ocrGate`: ob das zuletzt aufgenommene Foto lesbar ist
- `ocrTextUsed`: zusammengefasster tatsächlich übergebener Text
- `catalog`: Einträge, Treffer, Ablehnungsgründe und relevante Teiltreffer
- `prefill`: aktuell mögliche Felder, nicht übernommene Werte und Gründe
- `captureDurationMs`, `ocrDurationMs`, `catalog.catalogWaitMs`,
  `catalog.matchingMs`, `timings.prefillMs`, `timings.totalSinceCaptureMs`

Falls das zuletzt aufgenommene Foto keinen akzeptierten OCR-Text enthält,
wird weiterhin `Couldn't read the details` angezeigt. Die Diagnose
liefert dann einen einzelnen Datensatz mit `stage: ocr_only`.

## Abnahme

Nach CI/Simulator-Build auf iPhone 13 mini prüfen: Kein UI-Unterschied,
weiterhin identisches Matching und ein lesbarer `[FAC-OCR-P1]`-Datensatz.
