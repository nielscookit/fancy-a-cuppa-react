# Fancy a Cuppa · Privater iOS-Pilot

Stand 22. November 2026. Die native App und das Deployment werden getrennt freigegeben. Der Pilot-Build ist vorbereitet. Das Produktionsbackend liefert derzeit nur den bisherigen Katalogvertrag. Dadurch bleibt der V4-Pilot gesperrt.

## Build-Profile

| Profil | Xcode-Konfiguration | App / Extension | Backend |
| --- | --- | --- | --- |
| Fancy Test | Debug | `com.fancyacuppa.test` / `com.fancyacuppa.test.liveactivity` | Verifizierte lokale UC02-Konfiguration und bestehende lokale Tests |
| Normaler nativer Build | Debug oder Release | `com.fancyacuppa.app` / `com.fancyacuppa.app.liveactivity` | Bisheriger Katalogvertrag |
| Privater iOS-Pilot | Release | `com.fancyacuppa.app` / `com.fancyacuppa.app.liveactivity` | Vollständiges UC02 V4 und fester HTTPS-Endpunkt `https://zfkiiqqyapahxirguxgj.supabase.co` |

Der Pilot prüft vor dem Erzeugen von Assets den Katalog mit `origin` und `revision` und fragt den expliziten V4-Status des separaten Endpunkts `community-tea-v4` ab. Pilot-SAVE und Fotoabrufe verwenden ebenfalls nur diesen Endpunkt. Dadurch kann ein V4-Request bei fehlendem Deployment nicht bei der bisherigen Create-RPC landen. Beide Anfragen sind GET. Der produktive API-Schlüssel im Bundle ist der vorhandene Publishable Key. Die Build-Konfiguration übernimmt keine Test-URL oder ATS-Ausnahme. Der Xcode-Build verlangt bei Pilot-Assets die normale Info.plist, die produktive Bundle-ID und Release. Bei vorhandener generierter Fancy-Test-Konfiguration bricht der Pilot-Build ab.

Die V4-Konfiguration aktiviert Editor, Barcode-Update, Foto-Storage, Kandidatenabgleich und strukturierte OCR-Vorbefüllung gemeinsam. Die native OCR erlaubt strukturierte Daten für den bisherigen Test-Bundle oder für den markierten Pilot-Bundle. Die bestehende Debug-Diagnose behält ihre bisherige Beschränkung auf Fancy Test. Die vorhandenen App-Icons, Quick-Access-Schemes, Timer-Medien und Live-Activity-Extension werden übernommen. Der Pilot ersetzt eine vorhandene Installation mit der Bundle-ID `com.fancyacuppa.app`. Fancy Test ist parallel installierbar.

App und Extension verwenden gemeinsam Version 1.0, Build 1. Erhöhe die Buildnummer für eine bereits verteilte Version in beiden Targets gemeinsam. Verwende für die private Geräteinstallation das vorhandene Apple-Team und automatische Signierung für beide Bundle-IDs. Persönliche Signing-Einstellungen gehören in den lokalen Checkout. Die Simulator-Prüfung verwendet deaktiviertes Signing.

## Lesender Produktionsvergleich

- Der veröffentlichte Katalog liefert **167 Tees** sowohl über SQL als auch über den vorhandenen Client mit Publishable Key. **110 Barcode-Zuordnungen** und **167 Zubereitungen** vorhanden. Ein Barcode-Lookup über den echten Client lieferte die erwartete Katalog-ID.
- **142 Zuordnungen für ausgewählte Produktbilder** in `public.tea_product_images`. Kein Eintrag in `teas.photo_url`, keine Storage-Buckets oder -Objekte. Die vorhandenen Bildreferenzen und externen Quellen beim Wechsel erhalten.
- `teas.origin`, `teas.revision`, das private Schema `tea_community_private`, der kanonische Barcode-Index und die V4-Foto-/Barcode-RPCs fehlen. Eine lesende Prüfung mit genau der Normalisierung des vorgesehenen Index fand **keine Barcode-Kollisionen**. Vor dem Cutover wiederholen.
- `community-tea` ist in Version 3 aktiv. Der Handler begrenzt Payloads auf 5.000 Zeichen und routet nur `action === "update"` an die Update-RPC. Andere Actions gehen zur Create-RPC. Deshalb erfolgen Kompatibilitätsprüfungen ausschließlich per GET, auch für Foto- und Barcode-Funktionen.
- Die bestehenden Katalogtabellen haben RLS. Die lesenden Policies beziehen sich auf veröffentlichte Tees. Für die Katalogtabellen sind keine direkten Schreibgrants für `anon` und `authenticated` vorhanden. Diese Rollen haben kein EXECUTE auf den bestehenden Create-/Update-RPCs. Die Edge Function benötigt serverseitig `service_role`, und der Gateway-JWT-Check steht auf `false`.
- Die zwei UC02-Migrationen sind im Produktions-Migrationsverlauf nicht vorhanden. Produktionszugriffe dieser Prüfung waren lesend. Der bestehende Web- und V2-Client kann Legacy-Schreibrequests senden. V4 schützt Bestandsdatensätze als `curated` und verlangt bei Updates eine erwartete Revision. Deshalb kann sich das Verhalten dieser Clients bei EDIT ändern. Vor der gemeinsamen Umschaltung ausdrücklich prüfen und freigeben.

## Änderungen zur gesonderten Freigabe

1. **Datenbank.** Nach wiederholtem Schema- und Kollisionscheck zuerst `supabase/migrations/20261115220827_community_tea_catalog.sql`, anschließend `20261116122401_community_tea_barcode_update.sql` reviewen und in dieser Reihenfolge anwenden. Die erste Migration ergänzt `origin=curated` und `revision=1` bei Bestandsdatensätzen, den eindeutigen kanonischen GTIN-Index, den privaten JPEG-Bucket `community-tea-photos` (1 MiB pro Objekt) sowie Fotoreferenzen, Edit-Historie und idempotente SAVE-Belege. Sie erweitert Create/Update und ergänzt Foto-Lookup und Upload-Kontingent; die zweite Migration ergänzt das atomare Barcode-Update mit Revisions- und Konfliktprüfung.
2. **Storage und Rechte.** Private Bucket-Einstellung, fehlende direkte Zugriffe durch `anon`/`authenticated`, serverseitiges Signieren und die anwendungsseitige Grenze von drei Fotos im isolierten Ablauf prüfen. Historische Objekte für Wiederherstellungen erhalten. Für abgeschlossene und mehrdeutige Uploads ein Verfahren zur späteren, kontrollierten Bereinigung festlegen. Die Edge Function darf ausschließlich die Produktions-HTTPS-URL für signierte Links an den Produktionsclient liefern.
3. **Schreibschutz.** CORS und IP-Limits begrenzen Browser-Ursprünge bzw. Frequenz. Sie autorisieren keine Person oder Installation. Die aktuelle V4-Implementierung authentifiziert keine Pilotnutzer und ordnet Community-Einträge keinem Bearbeiter zu. Eine private iOS-Verteilung macht die öffentliche Edge Function nicht privat. Vor dem Rollout entscheiden, wer produktiv anlegen und bearbeiten darf. Falls nur autorisierte Pilotnutzer schreiben dürfen, benötigen die V4-Schreiboperationen eine serverseitige Authentifizierung und Berechtigungsprüfung mit passender Client-Session. Keine Schlüssel mit Schreibprivilegien in der App hinterlegen. Diese Freigabe samt Umgang mit vorhandenen Legacy-Schreibclients ist offen.
4. **Edge und Bereitschaft.** Den bestehenden V4-Quellcode nach Freigabe unter `community-tea-v4` bereitstellen. Die bisherige `community-tea`-Edge Function bleibt selbst unverändert. Prüfen, wie die gemeinsam genutzten RPCs Legacy-Clients beeinflussen. Die V4-Edge Function hat einen lesenden GET für die Pilot-Bereitschaft. `COMMUNITY_TEA_IOS_PILOT_READY=true` erst nach Schema-, Storage-, Legacy- und Autorisierungsabnahme setzen. Die Antwort ist eine Betriebsfreigabe, kein Ersatz für die Schreibautorisierung oder ein serverseitiger Abschalter für bereits installierte Apps. Deployment und Schalter getrennt freigeben.
5. **Integrationsprüfung.** Freigegebenen Ablauf zuerst in isolierter Umgebung mit bereinigtem Produktionsschema und Testdaten nachstellen. Katalog, Barcode-Konflikte, Legacy-Clients, private Fotos, signierte Downloads, parallele Edits, alte Revision, doppelte SAVE-Requests, Berechtigungsverweigerung, Netzunterbrechung und Wiederholung prüfen. Produktiver Schreib-Smoke-Test erst mit ausdrücklicher Freigabe und gekennzeichnetem Testdatensatz. Bestehende Datensätze ausschließlich lesend prüfen.

## Backup und Rückweg

Vor dem Cutover Schreibfenster abstimmen, verfügbaren Datenbank-Wiederherstellungspunkt und Wiederherstellungsverfahren bestätigen und zusätzlich einen geschützten Export von Schema, Katalogtabellen, Barcode-, Zubereitungs- und Bildzuordnungen erstellen. Aktiven Edge-Quellstand, Gateway-Einstellungen und relevante Umgebungsvariablennamen sichern. Geheimnisse in der vorhandenen geschützten Verwaltung belassen. Wiederherstellung des Exports in einer isolierten Umgebung üben. DB-Backups enthalten Storage-Objekte nicht. Zukünftige V4-Objekte inklusive Referenzen separat sichern. Externe Bilddateien liegen außerhalb des Datenbankprojekts.

Bei Fehlschlag zuerst serverseitig betroffene Schreiboperationen stoppen und die Pilot-Bereitschaft schließen. Lesenden Katalog prüfen. Den kompatiblen Edge-/RPC-Stand anhand des Vorab-Backups gemeinsam wiederherstellen. Den alten Edge-Handler mit neuer Datenbank nicht ungeprüft reaktivieren. Bereits gespeicherte V4-Daten, Fotoobjekte, Revisionen und Belege zuerst exportieren und abgleichen. Post-Cutover-Schreibdaten vor Restore/PITR sichern und den Ausgleich festlegen. Schema und Bucket nicht durch pauschales Löschen zurücksetzen.

## Privates iPhone nach Backend-Freigabe installieren

Den verifizierten Implementierungscommit in einem neuen Worktree neben Fancy Test verwenden. Node 22.12+ und Xcode 26.2 verwenden. Die vorhandene lokale Apple-Signierung in beiden Pilot-Targets konfigurieren.

```bash
cd "$HOME/Documents/fancy-a-cuppa-react" &&
git fetch origin feature/native-ios &&
git worktree add --detach "$HOME/Documents/fancy-a-cuppa-ios-pilot" origin/feature/native-ios &&
cd "$HOME/Documents/fancy-a-cuppa-ios-pilot" &&
npm ci &&
npm run sync:media &&
bash scripts/prepare-ios-ready-sound.sh &&
npm run build:ios-pilot &&
npx cap open ios
```

In Xcode **App → Edit Scheme → Run → Release** wählen, beide Team-/Bundle-Zuordnungen und den iPhone-13-mini-Target prüfen und privat über Run installieren. Bei rotem Backend-Check endet die Befehlskette vor Capacitor-Sync und Xcode.

Auf dem iPhone beide Apps parallel prüfen. Für den Pilot den Katalog, bekannte und unbekannte Barcodes, Fotokandidaten und OCR-Vorbefüllung, Voice to Add Tea, CANCEL und ausschließlich freigegebenes SAVE testen. Curated-Tees müssen geschützt bleiben. Anschließend Timerstart per Produkt und Home-Timer ohne Netzwerk, Video, Audio, Quick Access, Live Activity und lokale Benachrichtigung prüfen. Ein erfolgreiches Simulator-Kompilat bestätigt keine Gerätefunktion.
