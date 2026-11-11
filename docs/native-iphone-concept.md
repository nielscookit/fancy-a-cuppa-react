# Fancy a Cuppa · Konzept für eine native iPhone-App

Stand: 11.11.2026. Vorschlag zur Besprechung, keine Umsetzungsfreigabe.

## Ziel und Empfehlung

Freunde sollen Fancy a Cuppa installieren und einen Tee-Timer zuverlässig nutzen
können – auch ohne offene App und ohne Internet. Das vorhandene Design bleibt
maßgeblich: Home mit Tasse, bestehende Suche, Details, Dosierhilfe und Teeformular.

**Empfehlung: eine eigenständige iOS-App mit Swift/SwiftUI und einem nativen
Timerkern. Zuerst ein kleiner technischer Nachweis, danach die Oberfläche.**
Die bestehende React/MUI-Web-App läuft weiter. Supabase, Katalog, Medien und
Gestaltung werden weiterverwendet; React-Komponenten selbst sind nicht in SwiftUI
wiederverwendbar. Das bedeutet zusätzliche Oberflächenarbeit und künftig zwei
Clients. Dafür hängt der iPhone-Timer nicht mehr vom Browser-Lebenszyklus ab.

| Weg | Vorteil | Aufwand und Grenze | Einordnung |
|---|---|---|---|
| Native SwiftUI-App | Direkter Zugriff auf iOS-Alarme, Medien und lokale Daten; keine JavaScript-Brücke für den Timer | Oberfläche muss nach bestehenden Vorgaben neu umgesetzt werden | Empfohlen bei Priorität iPhone-Zuverlässigkeit |
| Lokal gebündelte React-Oberfläche in WKWebView plus nativer Timer | Viel bestehender UI-Code bleibt nutzbar | Brücke, WebView-Lebenszyklus und zwei Zustandswelten müssen sauber synchronisiert werden | Alternative, wenn Wiederverwendung wichtiger wird |
| Bestehende Website nur in eine App einbetten | Schnell vorzeigbar | Löst die Timer-/Audio-Probleme nicht ohne zusätzliche native Arbeit | Kein geeigneter Zielzustand |

SwiftUI, AlarmKit und AVFoundation sind Apple-Systemframeworks. Das Konzept
führt weder ein neues Webframework noch eine neue Hosting- oder Datenbankumgebung
ein. Ein iOS-Projekt könnte später isoliert unter `ios/` im bestehenden Repository
liegen; gebaut wird es mit einem eigenen Workflow. Hier werden noch keine
Projektdateien oder neuen Abhängigkeiten angelegt.

## Was die App im Alltag tun soll

Ein Tee wird ausgewählt, die Menge eingestellt und BREW gedrückt. Der native Kern
speichert den Timer und übergibt den Abschluss an iOS. Erst nach erfolgreicher
Planung gilt der Alarm als eingerichtet. Die Tassenanimation folgt diesem Zustand.
Ein nicht abspielbares Video darf einen bereits gestarteten Timer nicht stoppen.

| Situation | Vorgesehenes Verhalten |
|---|---|
| App offen | Countdown und Tassenfilm synchron; Almost-Time-Hinweis und Abschluss genau einmal |
| Bildschirm gesperrt oder App im Hintergrund | iOS übernimmt den Abschluss; keine laufende JavaScript-Schleife erforderlich |
| Kein Internet | Freier Timer, gebündelte Sounds und Medien funktionieren; vorhandener Katalog-Cache bleibt lesbar |
| App erneut geöffnet | Restzeit und Alarmzustand rekonstruieren; keine alten Tonhinweise nachholen |
| RESET | Genau die zu diesem Durchlauf gehörenden Alarme/Hinweise entfernen; Medien auf Idle zurücksetzen |
| Neuer Timer | Neuer Durchlauf mit eigener Kennung; alte Rückmeldungen dürfen ihn nicht verändern |
| Berechtigung fehlt oder Planung scheitert | Verständlich melden, dass kein Hintergrundalarm eingerichtet ist; keine Erfolgssimulation |

Home bleibt bei Start/Reset. Keine zusätzliche Timerseite, keine ungefragten
Buttons unter dem Timer und keine neue Pause-Funktion. Systemdialoge und Apples
Alarmdarstellung gehören zur Plattform; neue App-Hinweise werden mit Stephan
gestalterisch abgestimmt.

## Töne und Alarmzuverlässigkeit

Für den Abschluss ist **AlarmKit ab iOS 26** der bevorzugte Weg. Apple beschreibt
damit Alarme auch über Fokus und Lautlos hinweg sowie eigene Alarmtöne. Das ist
eine andere Funktion als Web Push. [A1, A2]

Für Version 1 schlage ich iOS 26 oder neuer vor. Vor einer Festlegung prüfen wir
die iPhones der vorgesehenen Freunde. Ältere Geräte können zunächst die Web-App
nutzen. Ein zusätzlicher nativer Fallback würde eine zweite Alarmvariante mit
eigenen Grenzen und Tests bedeuten.

**Zwei bewusst unterschiedliche Hinweise:**

- **30 Sekunden vorher:** „Almost time“ als lokale Benachrichtigung mit eigener,
  gebündelter Audiodatei; in offener App kontrolliert durch den nativen Kern.
  Normale Benachrichtigungen können durch Fokus, Lautlos oder Einstellungen
  unterdrückt werden. Dieser Vorhinweis bekommt keine Alarm-Garantie. [A3, A4]
- **Bei null:** AlarmKit mit dem Cuppa-Sound. Klang, Wiederholung, Stoppen und
  Verhalten im Vordergrund müssen im technischen Prototyp auf echten Geräten
  nachgewiesen werden. „Eigener Sound unterstützt“ bedeutet noch nicht, dass
  sich die aktuelle einmalige Tonfolge unverändert als Systemalarm verhält.

Wenn beide Hinweise auch bei Lautlos zwingend hörbar sein sollen, wäre ein zweiter
Alarm zu prüfen. Das kann zwei deutlichere Systemunterbrechungen verursachen und
ist eine UX-Entscheidung, keine stillschweigende technische Voreinstellung.

Die vorhandenen Tonaufnahmen werden übernommen und bei Bedarf ins passende
Systemformat konvertiert. Für lokale Notification-Sounds nennt Apple WAV, AIFF
oder CAF und eine Länge unter 30 Sekunden; MP3-Dateien werden nicht ungeprüft
als Notification-Sound übernommen. [A4]

Kein Dauer-Audio oder stummer Loop, um die App künstlich wachzuhalten. Kein
Internetdienst im kritischen Timerpfad. Der Alarm benötigt die Systemfreigabe;
ein ausgeschaltetes Gerät, Lautstärke, Ausgaberoute und OS-Probleme lassen sich
nicht durch ein absolutes Zuverlässigkeitsversprechen ausschließen. Neustart,
erzwungenes Beenden, Bluetooth und Anrufe gehören ausdrücklich zum Prototyp-Test.

## Technischer Aufbau für Stabilität

Ein zentraler nativer Timerkern besitzt den Zustand. SwiftUI, Medien und
Systemalarm sind seine angebundenen Komponenten. Die UI zählt nur die Anzeige
herunter; sie entscheidet nicht, ob der Tee fertig ist.

Pro Durchlauf werden Kennung, Revision, Dauer, Start-/Endzeit, Zustand und
Systemalarm-IDs dauerhaft gespeichert. Befehle werden seriell verarbeitet.
Für laufende Zeitmessung wird eine monotone Uhr genutzt; Datum und Systemalarm
dienen der Wiederherstellung. Manuelle Uhrzeitänderungen werden gesondert getestet.

Start ist eine bestätigte Transaktion: vorbereiteten Zustand speichern,
Alarm/Hinweis planen, Erfolg zurücklesen, Zustand aktiv setzen. Schlägt ein
Schritt fehl, werden Teilplanungen entfernt. Bei einem Absturz während dieser
Schritte gleicht die App beim nächsten Start die lokalen Einträge mit den
tatsächlich geplanten Systemalarmen ab. Reset ist wiederholbar und räumt auch
zugehörige Hinweise auf. Eine bereits ausgelöste Systemmeldung kann nicht
rückwirkend ungeschehen gemacht werden.

Sounds, Schrift und die vier Videos liegen im App-Paket; die native Mediensteuerung
verwendet AVFoundation. Im Vordergrund bleibt der bekannte Ablauf inklusive
letztem Milchframe und Idle-Reset. Nach einer Unterbrechung wird der passende
Zustand angezeigt statt die gesamte Sequenz nachzuspielen. Pro Hinweis gibt es
einen Verantwortlichen: Systemalarm und App-Audio dürfen nicht gleichzeitig
denselben Abschluss abspielen.

Die native App registriert für ihre eigenen Timer **keinen Web-Push-Auftrag**.
Die bestehende PWA bleibt unabhängig nutzbar. Bereits in der PWA gestartete Timer
werden nicht stillschweigend in die neue App übernommen.

## Teekatalog und vorhandene Funktionen

Die bestehende Supabase-Struktur und `community-tea`-Schnittstelle bleiben die
Grundlage. Die Swift-App erhält einen getrennten Datenadapter. Kategorie-Mapping,
Einheiten, Dosierregeln, Barcode-Normalisierung und Formularvalidierung werden
anhand gemeinsamer Beispieldaten gegen das bestehende Verhalten geprüft.

Der erste Timer funktioniert ohne Katalogdownload. Ein gespeicherter Katalog
erlaubt später Offline-Suche und Dosierhilfe. Anlegen/Bearbeiten braucht zunächst
Internet; bei Fehlern bleibt ein lokaler Entwurf erhalten. Kein automatisches
Wiederholen unbestätigter Schreibvorgänge, solange die API keine dafür geprüfte
Idempotenz garantiert. Pins und Suchverlauf bleiben zunächst gerätelokal.

Vor einer breiteren Freunde-Beta stimmen wir mit dem Datenbank-Chat ab, wer
gemeinsame Tees ändern darf und wie fehlerhafte Änderungen behandelt werden.
Die aktuelle Web-Schreibfunktion sendet keinen persönlichen Login mit; daraus
wird keine ungeprüfte Berechtigungsannahme für eine größere Nutzergruppe abgeleitet.
Es wird jetzt kein Account-System und kein neues Datenmodell eingeführt.

Produktbilder behalten die vereinbarte Zuordnung und Kategorie-Fallbacks.
Für die native Veröffentlichung gehen konkrete Bildnutzung und
Datenschutzangaben an den zuständigen Rechts-/Datenbank-Chat. Keine neue
Bildbeschaffung oder neue rechtliche Freigabe durch dieses technische Konzept.

## Ausbau in überprüfbaren Schritten

| Stufe | Ergebnis | Bedingung für den nächsten Schritt |
|---|---|---|
| 0 · Entscheidungen | Zielgeräte, Mac/Xcode, Apple-Konto und gewünschtes Alarmverhalten geklärt | Voraussetzungen passen; Konzept freigegeben |
| 1 · Alarmnachweis | Kleine native Test-App: Start, Reset, beide Originalsounds, lokale Speicherung | Auf echtem iPhone: gesperrt, offline, beendet, mehrfach gestartet, Reset, Berechtigung entzogen; keine doppelten Alarme |
| 2 · Private Alpha | Home im freigegebenen Design, Tassenmedien, freier Timer, Fehlerbehandlung | Stabiler Alltagsbetrieb auf Stephans iPhone; Verhalten beim Alarm akzeptiert |
| 3 · Freunde-Beta | TestFlight; anschließend Katalog, Details, Dosierhilfe, Pins, Editor und Scanner schrittweise ergänzen | Benannter Funktionsumfang je Build; mehrere Geräte; reproduzierbare Fehlerberichte mit Versionsnummer |
| 4 · Dauerhafte Version | Vollständiger vereinbarter Funktionsumfang, Support/Datenschutz, App-Store-Einreichung | Native Abnahme und Apple-Review; danach kontrollierte Updates |

Die bestehende Web-App ist bereits abgenommen. Die Tests in Stufe 1 gelten für
die **neue native Implementierung**, nicht als Wiederholung offener Web-Tests.
Für neue native Releases: automatisierte Zustands-/Persistenztests,
Schnittstellentests und gezielte Gerätetests. Simulator-Ergebnisse allein reichen
für Alarm und Audio nicht aus. Build-Versionen, Quellstand und Medien sind
reproduzierbar; keine automatisch nachgeladenen Änderungen am Timer-Code.

## Wie Freunde die App bekommen

**Zunächst TestFlight:** Freunde installieren Apples TestFlight-App und öffnen
unseren Einladungslink. Dafür wird eine Apple-Developer-Mitgliedschaft benötigt;
der erste externe Test-Build durchläuft Apples Beta-Prüfung. Ein Build ist bis zu
90 Tage testbar und muss rechtzeitig ersetzt werden. TestFlight ist deshalb eine
Beta-Lösung, kein wartungsfreier Dauervertrieb. [A5, A6]

**Danach App Store:** normale Installation und Updates, ohne das 90-Tage-Limit
eines TestFlight-Builds. Ein nicht gelisteter App-Store-Link wäre eine gesondert
von Apple zu genehmigende Option, nicht automatisch ein privater Freunde-Kanal;
jeder mit diesem Link könnte die App beziehen. [A7]

App-Store-Zulassung ist nicht garantiert. Der eigenständige Nutzen aus
Teekatalog, Dosierhilfe und nativem Teealarm muss in der Einreichung deutlich
werden; eine bloß verpackte Website oder ein austauschbarer Timer genügt nicht
automatisch. [A8]

## Voraussetzungen, Kosten und nächste Entscheidung

- Apple nennt **99 USD pro Jahr** für das Developer Program; der konkrete lokale
  Preis wird bei der Anmeldung angezeigt. Kein Konto oder Abo wird hier eröffnet.
  Freunde brauchen keine eigene kostenpflichtige Developer-Mitgliedschaft. [A5, A9]
- Ein kompatibler Mac mit passendem Xcode ist nötig. Falls dein Mac noch auf
  **Monterey 12** läuft, reicht dieser Softwarestand für Xcode 26 nicht; Apple
  nennt dafür mindestens macOS 15.6. Das genaue Mac-Modell und die für dein
  iPhone passende aktuelle Xcode-Version müssen vorab geprüft werden. [A10]
- Kein zusätzliches Serverhosting für den Timer. Bestehende Supabase-Nutzung
  bleibt für den Katalog; Kapazität und laufende Kosten hängen von der Nutzung ab.
- Zeitaufwand wird erst nach Stufe 1 belastbar geschätzt. SwiftUI bedeutet eine
  neue native Oberfläche, nicht nur einen Export der React-App.

**Nächster Schritt im Gespräch:** Architekturvorschlag und Alarmverhalten festlegen,
dann Mac-Modell/macOS sowie Ziel-iPhones prüfen. Erst danach den kleinen nativen
Alarmnachweis beauftragen. Noch kein vollständiger App-Neubau.

## Primärquellen · geprüft am 11.11.2026

- [A1 · Apple: AlarmKit-Beispiel und Berechtigung](https://developer.apple.com/documentation/alarmkit/scheduling-an-alarm-with-alarmkit)
- [A2 · Apple: AlarmKit, Systemdarstellung und eigene Sounds](https://developer.apple.com/videos/play/wwdc2025/230/)
- [A3 · Apple: Lokale Benachrichtigungen planen und entfernen](https://developer.apple.com/documentation/usernotifications/scheduling-a-notification-locally-from-your-app)
- [A4 · Apple: Eigene Notification-Sounds](https://developer.apple.com/documentation/usernotifications/unnotificationsound)
- [A5 · Apple: TestFlight und externe Tester](https://developer.apple.com/testflight/)
- [A6 · Apple: TestFlight-Laufzeit und Beta-Review](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
- [A7 · Apple: Unlisted App Distribution](https://developer.apple.com/support/unlisted-app-distribution/)
- [A8 · Apple: App Review Guidelines, insbesondere 4.2 und 4.3](https://developer.apple.com/app-store/review/guidelines/)
- [A9 · Apple: Developer-Mitgliedschaft und Preis](https://developer.apple.com/help/account/membership/program-enrollment/)
- [A10 · Apple: Xcode-Systemvoraussetzungen](https://developer.apple.com/xcode/system-requirements)
