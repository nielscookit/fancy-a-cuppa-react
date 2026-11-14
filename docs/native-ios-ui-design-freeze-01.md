# Fancy a Cuppa V3 – Native iOS UI-/Design-Freeze 01

**Status:** UI/Design freigegeben und dokumentiert · **Datum:** 14.11.2026  
**Quellstand (unveränderliche Referenz):** [`fe51fdc8bfbf208eb2e0fd784848c78588a38b75`](https://github.com/nielscookit/fancy-a-cuppa-react/commit/fe51fdc8bfbf208eb2e0fd784848c78588a38b75)  
**Branch:** `feature/native-ios` · **Gerätereferenz:** iPhone 13 mini  
**Geltungsbereich:** bereits implementierte native iOS-Oberfläche auf Basis React/MUI innerhalb von Capacitor. **Nicht** Web/PWA-Freeze, nicht App-Store- oder vollständiger Integrations-Freeze.

## Freigabeumfang

Die vorhandene Benutzeroberfläche und ihre Interaktionsmuster sind auf dem Quellstand oben freigegeben. Dazu gehören:

| Bereich | Eingefrorene Bestandteile | Figma-Referenz |
| --- | --- | --- |
| Home | Timer an Home gebunden, Tassen-/Medienfläche, Zeiten, Buttons, Idle/Running/Pause/Finished/Reset und Positionierung | [Home · 232:85](https://www.figma.com/design/3BnWs9duEWUJ3BAQ3JkY0F?node-id=232-85) |
| Tea Search | Bottom Sheet, Suche, Herstellerfilter, Pinned/Last Search Results, ADD NEW TEA, Navigation | [Tea Search · 184:427](https://www.figma.com/design/3BnWs9duEWUJ3BAQ3JkY0F?node-id=184-427) |
| Tea Detail | Karte/Bild, Teeangaben, Dosierhilfe, Wassermengen-/Zeitsteuerung, BREW, Edit-Zugang | [Tea Detail · 232:286](https://www.figma.com/design/3BnWs9duEWUJ3BAQ3JkY0F?node-id=232-286) |
| Add New Tea | Formularfelder, Pflichtfelder, Validierung, Scrollbereich, CANCEL/SAVE, Tastaturführung | [Add New Tea · 257:429](https://www.figma.com/design/3BnWs9duEWUJ3BAQ3JkY0F?node-id=257-429) |
| Edit Tea | Vorbelegte Daten, Formular, CANCEL/SAVE, Scroll-/Fokusverhalten | [Edit Tea · 258:595](https://www.figma.com/design/3BnWs9duEWUJ3BAQ3JkY0F?node-id=258-595) |

**Verbindliche Designreferenz:** [Fancy a Cuppa V3 – Figma](https://www.figma.com/design/3BnWs9duEWUJ3BAQ3JkY0F), insbesondere **01 · Design System** und **04 · Screen Flow**. Die oben genannten Node-IDs entstammen den bereits vereinbarten Freigabereferenzen; bei späteren Abweichungen zwischen Code und aktuellem Figma-Stand zuerst abgleichen, nicht stillschweigend ändern.

## Eingefrorene UI-Regeln

- **Mobile-first.** Roboto Mono, vorhandene MUI-Komponenten, Material Symbols Sharp und die bestehenden Farb-Tokens. Kein eigenständiges Re-Design.
- **Controls:** freigegebene Buttons 66 CSS-px, Eingabefelder 48 CSS-px, Standardradius 6 CSS-px; Filled Inputs. Für einzelne Pills/Controls gelten ihre bereits freigegebenen Sondermaße.
- **Farben:** bestehende Tokenbelegung bewahren, insbesondere Dark Gray `#1B272B`, Soft Lime `#B9FC69` und die bisherigen neutralen Flächen. Validierungsfehler sind weiterhin separat gekennzeichnet.
- **Native Bottom Sheets:** Search, Detail, Add und Edit beginnen **52 CSS-px** unter der sichtbaren oberen Kante. Die festen Action-Footer von Search/Detail haben den freigegebenen **14-CSS-px**-Abstand unten; bestehende Safe-Area-/Geräteabhängigkeiten bei neuen Gerätemodellen gesondert prüfen.
- **Home-Geometrie:** 48 CSS-px zwischen Timer und oberem Action-Button, 16 CSS-px zwischen Action-Buttons, 14 CSS-px unterer Abstand auf dem geprüften Gerät. Die bestehende Scrollführung erhalten.
- **Add/Edit:** SAVE/CANCEL bleiben im scrollbaren Formularbereich. Zwischen dem letzten Formularfeld und den Aktionen gilt der vereinbarte Abstand von 48 CSS-px, zwischen den beiden Buttons 16 CSS-px.
- **Native Tastatur:** beim Editieren bleibt die Sheet-Top-Position stabil. Nur der interne Formularbereich scrollt, um das fokussierte Feld oberhalb der Tastatur zu zeigen; keine unkontrollierte Verschiebung des gesamten Sheets. Nutzerbestätigung auf iPhone 13 mini am 14.11.2026.
- **Interaktion und Wording:** Home → Search → Detail → optional Edit bzw. Add; BREW startet den bestehenden Home-Timer, keine neue Timer-Seite, keine eigenmächtigen Änderungen an Beschriftung, Fokus-/Fehlerzuständen, Animationen oder Bedienlogik.

## Nachweis und Grenzen der Abnahme

- **Auf iPhone 13 mini vom Nutzer bestätigt:** App-Start, Home- und Sheet-Layout, Search/Detail-Grundabläufe, Add und Edit einschließlich SAVE nach Supabase-Origin-Korrektur; native Tastatur-/Fokuskorrektur nach `fe51fdc` ausdrücklich als funktionierend rückgemeldet.
- **Abnahmeliste:** ursprünglich 18 Tests; nach erfolgreichem Edit-Speichern **15 bestanden, 3 offen**. Die später ausdrücklich bestätigte Tastaturkorrektur ergänzt den Nachweis, ersetzt die offenen Tests aber nicht.
- **Noch offen:** Test 07 (Custom-Wassermenge vollständig), Test 14 (Barcode-Erkennung bekannt/unbekannt), Test 17 (Sperrbildschirm-/Benachrichtigungsverhalten als vollständiger Systemtest). Einzelne bereits durchgeführte Teilprüfungen gelten nicht als komplette Freigabe dieser Tests.
- **Keine erneute vollständige Figma-Pixelprüfung** oder neuer iPhone-Modelltest durch diesen Dokumentations-Commit. Auf weiteren Gerätemodellen können freizugebende Safe-Area-Anpassungen notwendig werden.

## Ausdrücklich NICHT eingefroren / separate Arbeitsaufträge

1. **Live Activity** (ActivityKit/WidgetKit/SwiftUI): konzeptionell geplant; keine Implementierung oder Designfreigabe durch dieses Dokument.
2. **Falsches Symbol der lokalen iOS-Benachrichtigung:** Das alte blaue Capacitor-Icon erschien auch nach Clean Build und Neustart auf dem Sperrbildschirm. Ursache am installierten iPhone nicht bewiesen.
3. **Ungewollte iOS-Mediensteuerung:** zusätzliche Play-/Scrub-Oberfläche mit leerer Grafik und negativer Zeit am Sperrbildschirm. HTML5-Video ist eine plausible Hypothese, aber keine bestätigte Ursache.
4. **Systemintegration / Lifecycle / Gerätetests:** Hintergrundbenachrichtigungen, Audio-/Video-Unterbrechungen, Scanner-Barcode-Erkennung, Custom-Wassermenge und Tests auf weiteren iPhone-Modellen.
5. **Release- und Veröffentlichungsschritte:** Code-Commit, automatisierter Test, iPhone-Abnahme, TestFlight und App Store sind unterschiedliche Zustände.

Diese Themen dürfen separat weiterentwickelt werden, dürfen aber nicht ohne erneute UX-/Designfreigabe die hier eingefrorenen Screens oder Interaktionsmuster verändern. Eine Live Activity ersetzt nicht automatisch die bestehende lokale End-Benachrichtigung oder die iOS-Mediensteuerung.

## Getrennte technische Referenz / Schutzregeln

**Bereits iPhone-validierter Timer-/Medien-Freeze:** [`f858e63202666ea850f29b85b159ae08ae5ace48`](https://github.com/nielscookit/fancy-a-cuppa-react/commit/f858e63202666ea850f29b85b159ae08ae5ace48). Das ist **nicht** derselbe Freeze wie der UI-/Design-Freeze `fe51fdc`.

Bei künftigen Systemintegrationen folgende Implementierungen schützen und Änderungen gezielt prüfen: `src/components/HomeScreen.jsx`, `src/timer/`, `src/timer-kit/`, `src/push/nativeNotificationController.js` sowie die freigegebenen Sheet-/Form-Komponenten. Timer, Memo/Ready, Fill → Brew → Steep → Milk, Endframe und Reset nicht nebenbei umbauen.

- **GitHub:** `feature/native-ios` bleibt für native Arbeit; `main` (Web/PWA) und V2 unverändert.
- **Supabase:** bestehende Daten und Schnittstellen unverändert; keine produktiven Datensätze ohne gesonderten Auftrag verändern.
- **Figma:** maßgeblich für spätere, ausdrücklich freigegebene Designänderungen.
- **Änderungsprozess:** Abweichung beschreiben → Designfreigabe einholen → isoliert implementieren → Tests/Build → iPhone-Abnahme → gegebenenfalls neue Freeze-Revision.
- Dieser Freeze ist eine **Freigabe des bestehenden UI-Designstands**, keine Behauptung eines vollständig getesteten und veröffentlichten nativen Produkts.
