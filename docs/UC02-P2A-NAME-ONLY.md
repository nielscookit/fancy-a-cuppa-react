# UC02 P2a · Name-only-Fallback

Fancy Test (`com.fancyacuppa.test`) verwendet P2a nur bei nativer iOS-Plattform
und aktivierter isolierter Build-Konfiguration `uc02IosEnabled`.
Der bisherige Hersteller-und-Namen-Abgleich läuft zuerst und liefert bei
Treffern weiterhin unverändert das Ergebnis.

P2a vergleicht ganze normalisierte OCR-Zeilen oder unmittelbar aufeinanderfolgende
Zeilen mit dem vollständigen Katalognamen. Trennzeichen werden zu Leerzeichen.
Die Regeln für kurze und generische Namen sind bewusst konservativ. Der konkrete
Name „Früchte-Mischung“ ist einschließlich der ausgeschriebenen Bio-Variante
für manuelle Auswahl zugelassen. Ein erkannter widersprechender Hersteller,
ein längerer beobachteter Katalogname oder ein separater Variantenzusatz kann
einen Kandidaten ausschließen. Gleichnamige Kandidaten bleiben getrennt.
Für Tea Detail sind `use_photo`, die aktuelle `photoID` und eine explizit
ausgewählte `teaID` aus dieser Ergebnisliste erforderlich.

Grenzen: OCR-Tippfehler, andere Wortreihenfolgen, zusammengezogene Wörter und
zusätzlicher Text in derselben Zeile können einen Treffer verhindern.
Herstellerkonflikte sind nur bei eindeutigen Signalen erkennbar, etwa einer
beschrifteten Herstellerzeile oder einem lesbaren Katalognamen des Herstellers.
Die vorhandene OCR-Bridge liefert eine flache Zeilenliste. Bei mehreren Fotos
können unmarkierte Fotogrenzen daher wie Zeilenumbrüche wirken.
Die Schutzregeln gelten für Stufe 2. Besonderheiten des bisherigen Matchers in
Stufe 1 bleiben erhalten. P2a ist ein Vorschlag für manuelle Auswahl.

## Reproduzierbare Prüfung

`tests/fixtures/uc02-p2a.mjs` enthält 34 beschriftete synthetische OCR-Fälle
mit Soll-IDs, darunter Test 23, Namensgleichheit, Varianten, Konflikte,
unbekannte Produkte und unvollständige Texte. Ausführen mit
`node --test tests/uc02NameOnlyMatch.test.mjs tests/nativeTeaCamera.test.mjs`.

`node scripts/benchmark-uc02-p2a.mjs` vergleicht auf denselben Texten die
bisherige P1-Stufe mit dem vollständigen P2a-Ablauf. Gemessen unter Node
24.22.3/Linux x64, 250 synthetische Katalogzeilen, 34 OCR-Fixtures, 20
Aufwärmrunden, 6.800 Messungen je Vergleich. Kein Netzwerk, Vision oder Debug-Log.

| Pfad | Median | P95 |
| --- | ---: | ---: |
| P1 | 0,324 ms | 0,593 ms |
| P2a gesamt | 0,708 ms | 1,164 ms |
| Zusätzliche Stufe, wenn ausgeführt (6.200 Messungen) | 0,381 ms | 0,693 ms |

## iPhone-Test

1. Fancy Test über den isolierten Build `npm run build:ios-uc02-local` in Xcode
   auf dem iPhone 13 mini starten. Im Debug-Scheme für den Lauf
   `FAC_OCR_P1_CONSOLE=1` setzen.
2. Test 23 mit Vorderseite wiederholen. Den Vorschlag prüfen und erst danach
   antippen. Mit Vorder- und Rückseite wiederholen. Stufe 1 muss Vorrang haben,
   wenn Vision Hersteller und vollständigen Namen liefert.
3. Zwei gleichnamige Hersteller, Standard/Bio und einen klaren
   Herstellerwiderspruch nachstellen. Ergebnisse vor der Auswahl prüfen.
4. In Xcode nach `[FAC-OCR-P1]` filtern. In `match_complete` die Felder
   `catalog.stage`, `catalog.matchingMs`, `catalog.nameOnlyMs` und
   `catalog.nameOnly` über die gemeinsame ID der OCR-Ausgabe zuordnen.
   Bei aktivierter Diagnose kann `nameOnlyMs` den Aufwand zur Erstellung
   der Entscheidungsdaten einschließen. Gerätelaufzeiten an 07 weitergeben.
5. Barcode, ADD, EDIT, SAVE, BREW und Timer/Medien mit Fancy Test nachprüfen.
