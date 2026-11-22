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
3. **Schreibschutz.** Nach den beiden UC02-Migrationen den separat gehaltenen SQL-Schritt `supabase/pilot/installation-authority.sql` im genehmigten Cutover anwenden. Er schützt V4-Schreiboperationen auch in PostgreSQL. Der V4-Handler setzt die Installationsprüfung vor Foto-Uploads und prüft im finalen Transaktions-RPC erneut. Legacy-CREATE ohne V4-Parameter bleibt möglich. Legacy-EDIT wird gesperrt: Der veröffentlichte Legacy-Client trägt keine Pilotberechtigung und darf weder redaktionelle Daten noch Pilot-Datensätze ändern. Auch Legacy-CREATE mit gleichem Namen hat nach den V4-Migrationen andere Semantik: Die bisherige Create-RPC konnte einen Barcode an einen vorhandenen Tee anhängen, V4 kann stattdessen einen neuen gleichnamigen Tee erstellen oder einen eindeutigen Barcode-Konflikt melden. Diese Abweichungen für V2 und ältere V3-Clients müssen vor dem Cutover gesondert freigegeben werden.
4. **Edge und Bereitschaft.** Nur `community-tea-v4` über `supabase/functions/community-tea-v4/index.ts` deployen. Der bestehende produktive `community-tea`-Handler bleibt auf seinem aktiven Stand. Die beiden Endpunkte verwenden dieselben Katalogtabellen und werden durch den Datenbank-Guard getrennt. `COMMUNITY_TEA_IOS_PILOT_READY` bleibt bis zum abgeschlossenen Schema-, Storage-, Legacy- und Autorisierungscheck deaktiviert. Der lesende Build-Check prüft den neuen Vertrag und die Erreichbarkeit der Autorisierungs-RPC. Die Einstellung sperrt auch in bereits installierten Apps neue V4-SAVEs am Edge. Öffentliche Lesezugriffe und der Fotoabruf für veröffentlichte Community-Tees bleiben erreichbar.
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


## Einmalig provisionieren und bei Bedarf sperren

Die freigegebene Pilotinstallation erhält ein separates 256-Bit-Token. Der native Code übernimmt es beim Start aus der temporären Xcode-Run-Umgebung, speichert es im gerätegebundenen Keychain und verwendet es nur für native HTTPS-SAVEs. Die WebView erhält weder das Token noch eine Methode, es auszulesen. Die Bridge hat eine feste URL und folgt keinen Redirects. Das Token ist ein Bearer-Nachweis und kann bei Verlust missbraucht werden, bis es gesperrt wird. Der Geräte-Keychain ist keine Remote-Geräteattestierung. Die Datenbank hält nur SHA-256 und eine stabile zufällige Installations-ID.

1. Operator erzeugt ein Token aus 32 zufälligen Bytes (`openssl rand -hex 32`) in geschützter lokaler Sitzung. Das Ergebnis sind genau 64 Kleinbuchstaben/Digits. Im genehmigten SQL-Editor ausschließlich dessen SHA-256-Hash (über die exakt 64 ASCII-Zeichen, ohne Zeilenumbruch) übernehmen. Token selbst nur im Passwortmanager oder geschützten Übergabekanal bereithalten.
2. Nach SQL-Freigabe als Operator `insert into tea_community_private.pilot_installations(token_hash) values ('<SHA256_HEX>') returning id;` ausführen und die ID der Installation im Pilotprotokoll festhalten. Keine Tokenwerte in SQL, Git, Logs oder Chat eintragen.
3. Im getrennten Pilot-Worktree nach der Installation über Xcode das Scheme `App` lokal duplizieren. **Shared** bleibt deaktiviert. Unter **Run → Arguments → Environment Variables** temporär `FAC_IOS_PILOT_PROVISION` mit dem Token setzen. Die Variable gehört nur zu Run. Kein Build Setting und keine `.env` verwenden. Einmal auf dem entsperrten iPhone über dieses Scheme starten und den ausdrücklich genehmigten SAVE-Test durchführen. Den Umgebungswert danach aus dem lokalen Scheme löschen und ohne ihn erneut starten. Die Funktion der Keychain-Übernahme in einem signierten Release-Run ist auf dem physischen iPhone zu bestätigen.
4. Widerruf über die protokollierte ID: `update tea_community_private.pilot_installations set revoked_at=now() where id='<INSTALLATION_ID>';`. GET/Katalog, Fotoabrufe und Timer bleiben verfügbar. Zur Rotation einen neuen Hash für dieselbe ID setzen und `revoked_at` wieder auf NULL setzen. Danach mit dem neuen Token erneut einmalig provisionieren. Dieselbe ID erhält Rate-Limit und SAVE-Belege. Das alte Token bleibt ungültig.

## Abnahme und Rückweg

- Vor Freigabe die schreibenden Legacy-Varianten V2 und V3 prüfen. Freigabe muss die geänderte Legacy-CREATE-Semantik und Legacy-EDIT-Sperre einschließen. Ohne Freigabe bleibt der Cutover ausgesetzt.
- Einen geschützten, konsistenten DB-Snapshot beziehungsweise Dump mit bestätigtem Restore anlegen. Aktive Legacy-Edge-Version und ihre Einstellungen separat sichern. Das SQL-Verfahren mit `scripts/verify-ios-pilot-db.mjs` auf isoliertem PostgreSQL prüfen. Ein optionaler, administrativ exportierter JSON-Katalog kann über `FAC_PILOT_CATALOG_SNAPSHOT` eingelesen werden. Eine Stichprobe aus der öffentlichen API ersetzt keinen vollständigen Datenbank-Dump. Lokales UC02 und Fancy Test wenden den ausdrücklich separaten Pilot-SQL-Schritt nicht an.
- In isolierter Umgebung beide UC02-Migrationen und Pilot-Guard gemeinsam anwenden, Legacy- und V4-Verträge ausführen, Widerruf und Rotation prüfen. Vor Produktion den konsistenten Restore-Punkt, die Abhängigkeiten und Rechte noch einmal kontrollieren. Beim Cutover Schreibfenster vereinbaren, die zwei UC02-Migrationen und den Pilot-Guard in **einer Transaktion** anwenden (beispielsweise `psql -X -v ON_ERROR_STOP=1 --single-transaction` mit drei `-f`-Optionen in dieser Reihenfolge) und die beiden UC02-Versionen im Migrationsverlauf abgestimmt erfassen und erst nach Abnahme den Edge-Schalter aktivieren.
- Falls Probleme auftreten zuerst den Edge-Schalter deaktivieren, gegebenenfalls die Installationsberechtigung widerrufen. Alle Pilot-Schreibdaten, Fotoobjekte, Historien und SAVE-Belege sichern. Bestehende Kataloglesezugriffe prüfen. Legacy-RPCs nur als geprüftes Paar mit den passenden Daten und Grants wiederherstellen. Vor Rückkehr zu alter Legacy-Write-Semantik die seit Cutover geschriebenen Pilot-Datensätze und Barcodes abgleichen. Wiederanlauf und Art des Restores durch 02 freigeben lassen.
