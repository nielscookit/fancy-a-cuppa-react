# Fancy a Cuppa V3 – Funktionstest

## Aktueller Abgleich · 11.11.2026

Die darunterstehende Liste vom 04.11. ist historisch, keine aktuelle Liste fehlender Implementierungen.

| Bereich | Aktueller Nachweis |
|---|---|
| Push nach Timerende auf gesperrtem iPhone | Vom Nutzer bestätigt am 10.11.; Apple-Ablehnung `BadWebPushTopic` durch Entfernen des optionalen Topic-Headers behoben |
| Almost-Time- und Abschlusston bei offener App | Beide vom Nutzer bestätigt |
| Eigene Sounds auf dem Sperrbildschirm | Bewusst spätere native App-Ausbaustufe; Web Push verwendet den Systemton |
| App-Icon | Eigenes Artwork im Repository; kein C-Platzhalter mehr |
| Rückkehr nach Ablauf im Hintergrund | Clock-Catch-up spielt keine verpassten Tonhinweise nach; automatisiert geprüft. Erneuter iPhone-Test der vorherigen Medienfehlermeldung noch offen |
| Reset vor Ablauf / mehrere Timer / Neuladen | Automatische Tests vorhanden; eindeutige, diesen Fällen zugeordnete Gerätebestätigung hier noch nicht dokumentiert |
| Anlegen/Bearbeiten und Scanner | Bestehende Implementierung erhalten; frühere unspezifische Bestätigungen nicht nachträglich einzelnen Testfällen zugeordnet. Keine neuen Datenbank-Schreibtests in dieser Prüfung |

Nächster Gerätetest: 1-Minuten-Timer starten, iPhone sperren, Push abwarten,
App öffnen. Erwartet: abgelaufener Timer, kein nachgeholter Ton und keine
Medienfehlermeldung. Danach Reset und einen vollständigen Durchlauf bei offener
App prüfen (beide Sounds). Falls die Meldung erneut erscheint, bleibt die
Video-/Medienursache gesondert zu untersuchen; der Screenshot allein benennt
die konkret blockierte Medienoperation nicht.

## Historischer Prüfstand

**Stand:** 2026-11-04
**Getestete Umgebung:** iPhone Safari, V3 Haupt-App
**Referenz:** `freeze/v3-2026-11-04-functional`
**Wichtig:** Keine produktiven Tees anlegen, ändern oder löschen, solange es keine getrennte Testdatenbank gibt. Tests mit dem echten Speichern sind deshalb gesondert freizugeben.

## Testablauf auf dem iPhone

| ID | Aktion | Erwartetes Ergebnis | Status |
|---|---|---|---|
| QA-01 | App in Safari neu öffnen, »How do you take it?« antippen | Suchansicht öffnet, Katalog lädt, kein weißer Bildschirm | Zu prüfen |
| QA-02 | In der Suche `Schwarztee`, `Black Tea` und `Assam` eingeben | Passende Ergebnisse ohne Absturz | Zu prüfen |
| QA-03 | Vorhandenen Tee auswählen, mit X schließen, anderen Tee auswählen | Zurück in die Suche, neuer Tee öffnet, kein weißer Bildschirm | Nutzer hat X-Fix bereits bestätigt |
| QA-04 | Wassermenge 250 / 500 / 1000 / 1500 ml ändern | Dosierung wird proportional neu berechnet | **Bestätigt durch Nutzer, V3-Haupt-App, 04.11.2026** |
| QA-05 | »Custom« auswählen, 900 ml eingeben | 900 ml und proportional berechnete Dosierung | **Bestätigt durch Nutzer, V3-Haupt-App, 04.11.2026** |
| QA-06 | Timer beim ersten Öffnen starten | Countdown startet zusammen mit dem Einfüllvideo; kein Blindstart | **Bestätigt durch Nutzer, V3-Haupt-App, 04.11.2026** |
| QA-07 | Fill → Brew → Still Loop → Milk komplett ablaufen lassen | Reihenfolge stimmt; Milch beginnt bei 5 s Restzeit, Abschlusston folgt | **Bestätigt durch Nutzer, V3-Haupt-App, 04.11.2026** |
| QA-08 | Timer pausieren, fortsetzen, zurücksetzen | Pause hält Zeit/Video an, Reset zeigt angehaltenes erstes Frame | **Teilweise bestätigt:** Reset und erneuter Start; Pause/Fortsetzen in der Haupt-App noch nicht separat bestätigt |
| QA-09 | Tee während der laufenden Timer-Wiedergabe mit X schließen | Kein weißer Bildschirm, keine weiterlaufenden Medien | **Bestätigt durch Nutzer, V3-Haupt-App, 04.11.2026** |
| QA-10 | Suche erneut öffnen und »Recently searched« kontrollieren | Ausgewählte Tees werden wieder angeboten | Zu prüfen |
| QA-11 | Formular »Add new tea« öffnen; Felder und dynamische Sorte prüfen; ohne Speichern abbrechen | Formular passt Kategorie/Sorte/Einheit an, kein Schreibzugriff | Zu prüfen |
| QA-12 | Formular »Bearbeiten« öffnen, nichts speichern, abbrechen | Vorherige Teeauswahl bleibt erhalten, kein Schreibzugriff | Zu prüfen |
| QA-13 | Barcode-Schaltfläche antippen und Paketfoto aufnehmen | Barcode wird erkannt oder verständliche Fehlermeldung erscheint | Zu prüfen |
| QA-14 | iPhone in den Hintergrund schicken und wieder öffnen | Timerstand und Video bleiben verständlich und bedienbar | Zu prüfen |

## Sicherungs- und Testregeln

- V2 `nielscookit/fancy-a-cuppa` niemals ändern.
- Stabile separate Testumgebung `/timer-test/` und validierte Mediencontroller nur mit zwingendem Grund verändern.
- Automatische CI-Tests vor jedem V3-Deployment prüfen.
- Reale Supabase-Schreibtests erst in einer isolierten Testumgebung oder nach ausdrücklicher Zustimmung.
- Bei Fehlern Test-ID, iOS-Version, Safari/ChatGPT-Browser, Reproduktionsschritte und Screenshot notieren.

## Nächste Schritte nach den Funktionstests

1. Falls QA-01 bis QA-10 grün: UX-Fluss und MUI-Komponenten visuell finalisieren.
2. Barcode-Kamera (aktuell Fotoaufnahme) und OCR gesondert spezifizieren und implementieren.
3. Sichere End-to-End-Tests für Tee-Anlegen/Bearbeiten mit Testdatensatz/Testumgebung durchführen.
4. Danach PWA-Manifest, Icon, Homescreen und Offline-Verhalten definieren und prüfen.
5. Finalen iPhone-Regressionslauf vor Freigabe.
