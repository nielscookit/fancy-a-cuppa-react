# UC02 · P1 OCR-Diagnose (nur Fancy Test)

Ausgangsstand `bce57c3`. Keine visuellen oder funktionalen Änderungen an Kamera,
OCR-Konfidenzfilter, Matching, Prefill, Barcode-Scan, Timer oder Supabase.

## Sicherheit

Log-Ausgabe ist nur bei **DEBUG** und exakter Bundle-ID `com.fancyacuppa.test`
möglich. Die Ausgabe muss für den Xcode-Lauf explizit aktiviert werden.
Sie geht an die Debug-Konsole (stdout), ohne `NSLog` oder Speicherung durch
die Diagnose. Keine Fotos, Base64, Zugangsdaten oder Netzwerkübertragung.
Die Konsole enthält OCR-Klartext. Für Test 23 nur die Testverpackung erfassen,
keine privaten Texte und keine Veröffentlichung des Konsolenverlaufs.

## Ablauf auf dem iPhone

1. Fancy-Test-Worktree aktualisieren. Lokale Xcode-Signing-Änderungen erhalten.
2. `npm run build:ios-uc02-local` ausführen. In Xcode unter **Product → Scheme →
   Edit Scheme → Run → Arguments → Environment Variables** den Eintrag
   `FAC_OCR_P1_CONSOLE=1` aktivieren. Fancy Test per Run auf dem iPhone starten.
3. Xcode Debug Console öffnen und nach `[FAC-OCR-P1]` filtern.
4. Den Tee aus Test 23 mit **No barcode · Continue** fotografieren.
5. Nach abgeschlossener Identifikation die JSON-Zeilen mit derselben `id`
   kopieren. `ocr_complete` enthält die OCR-Ausgabe und `match_complete` die
   tatsächliche Entscheidung. Die Reihenfolge der Konsolenzeilen kann abweichen.
6. Keine Diagnoseausgaben mit privaten Inhalten in GitHub veröffentlichen.

## Daten

- `id`, `revision`, `photoCount`: eindeutiger Aufnahmedurchlauf
- `photos[].photoIndex`: Zuordnung Foto 1–3
- `photos[].observations[]`: OCR-Text, Konfidenz, Filterentscheidung
- `photos[].acceptedLines`: tatsächlich für Matching genutzte Textzeilen
- `ocrGate`: ob das zuletzt aufgenommene Foto lesbar ist
- Akzeptierte OCR-Zeilen in Foto-Reihenfolge ergeben gemeinsam den Matching-Input.
- `catalog`: Einträge, Treffer, Ablehnungsgründe und relevante Teiltreffer
- `prefill`: tatsächlich ausgeführter Parser-Zweig bei `no_match`, sonst `null`
- `captureDurationMs`, `captureToOCRMs`, `ocrDurationMs`,
  `catalog.catalogWaitMs`, `catalog.matchingMs`, `timings.prefillMs` und
  `timings.processingMs` sind monoton gemessene Teilzeiten.
  Bei `trigger: photo_deleted` sind die Aufnahmezeiten `null`.
- `ocr_only` steht für ein unlesbares letztes Foto ohne Katalogabfrage.
  `match_timeout` kennzeichnet einen nativen Lookup-Timeout.
- Abgebrochene oder überholte Durchläufe können einen OCR-Eintrag ohne späteren
  Matching-Eintrag haben. Ein bereits ausgegebener Eintrag bleibt im
  aktuellen Konsolenverlauf.

## Abnahme

Nach CI/Simulator-Build auf iPhone 13 mini prüfen: Kein UI-Unterschied,
weiterhin identisches Matching und korrelierbare `[FAC-OCR-P1]`-Datensätze.
