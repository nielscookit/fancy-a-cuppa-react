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
3. **Schreibschutz.** Nach den beiden UC02-Migrationen den separat gehaltenen SQL-Schritt `supabase/pilot/installation-authority.sql` im genehmigten Cutover anwenden. Er schützt V4-Schreiboperationen auch in PostgreSQL. Der V4-Handler setzt die Installationsprüfung vor Foto-Uploads und prüft im finalen Transaktions-RPC erneut. Legacy-CREATE wird wie Legacy-EDIT abgewiesen. Legacy-EDIT wird gesperrt: Der veröffentlichte Legacy-Client trägt keine Pilotberechtigung und darf weder redaktionelle Daten noch Pilot-Datensätze ändern. Die berechtigte Pilotinstallation darf auch curated-Tees bearbeiten. Herkunft und ID bleiben erhalten; pro Änderung werden vorheriger Zustand und die Installation zur neuen Revision festgehalten. Die abschließende Nutzerentscheidung erlaubt die vorübergehende Sperre beider Legacy-Schreiboperationen. Der produktive Cutover bleibt separat freizugeben.
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

Auf dem iPhone beide Apps parallel prüfen. Für den Pilot den Katalog, bekannte und unbekannte Barcodes, Fotokandidaten und OCR-Vorbefüllung, Voice to Add Tea, CANCEL und ausschließlich freigegebenes SAVE testen. Curated-Tees dürfen ausschließlich nach gültiger Pilotberechtigung gespeichert werden. Anschließend Timerstart per Produkt und Home-Timer ohne Netzwerk, Video, Audio, Quick Access, Live Activity und lokale Benachrichtigung prüfen. Ein erfolgreiches Simulator-Kompilat bestätigt keine Gerätefunktion.


## Einmalig provisionieren und bei Bedarf sperren

Die freigegebene Pilotinstallation erhält ein separates 256-Bit-Token. Der native Code übernimmt es beim Start aus der temporären Xcode-Run-Umgebung, speichert es im gerätegebundenen Keychain und verwendet es nur für native HTTPS-SAVEs. Die WebView erhält weder das Token noch eine Methode, es auszulesen. Die Bridge hat eine feste URL und folgt keinen Redirects. Das Token ist ein Bearer-Nachweis und kann bei Verlust missbraucht werden, bis es gesperrt wird. Der Geräte-Keychain ist keine Remote-Geräteattestierung. Die Datenbank hält nur SHA-256 und eine stabile zufällige Installations-ID.

1. Operator erzeugt ein Token aus 32 zufälligen Bytes (`openssl rand -hex 32`) in geschützter lokaler Sitzung. Das Ergebnis sind genau 64 Kleinbuchstaben/Digits. Im genehmigten SQL-Editor ausschließlich dessen SHA-256-Hash (über die exakt 64 ASCII-Zeichen, ohne Zeilenumbruch) übernehmen. Token selbst nur im Passwortmanager oder geschützten Übergabekanal bereithalten.
2. Nach SQL-Freigabe als Operator `insert into tea_community_private.pilot_installations(token_hash) values ('<SHA256_HEX>') returning id;` ausführen und die ID der Installation im Pilotprotokoll festhalten. Keine Tokenwerte in SQL, Git, Logs oder Chat eintragen.
3. Im getrennten Pilot-Worktree nach der Installation über Xcode das Scheme `App` lokal duplizieren. **Shared** bleibt deaktiviert. Unter **Run → Arguments → Environment Variables** temporär `FAC_IOS_PILOT_PROVISION` mit dem Token setzen. Die Variable gehört nur zu Run. Kein Build Setting und keine `.env` verwenden. Einmal auf dem entsperrten iPhone über dieses Scheme starten und den ausdrücklich genehmigten SAVE-Test durchführen. Den Umgebungswert danach aus dem lokalen Scheme löschen und ohne ihn erneut starten. Die Funktion der Keychain-Übernahme in einem signierten Release-Run ist auf dem physischen iPhone zu bestätigen.
4. Widerruf über die protokollierte ID: `update tea_community_private.pilot_installations set revoked_at=now() where id='<INSTALLATION_ID>';`. GET/Katalog, Fotoabrufe und Timer bleiben verfügbar. Zur Rotation einen neuen Hash für dieselbe ID setzen und `revoked_at` wieder auf NULL setzen. Danach mit dem neuen Token erneut einmalig provisionieren. Dieselbe ID erhält Rate-Limit und SAVE-Belege. Das alte Token bleibt ungültig.

## Abnahme und Rückweg

- Vor Freigabe die schreibenden Legacy-Varianten V2 und V3 prüfen. Die vorübergehende Sperre von Legacy-CREATE und Legacy-EDIT ist freigegeben; der produktive Cutover benötigt weiterhin eine separate Freigabe. Ohne Freigabe bleibt der Cutover ausgesetzt.
- Einen geschützten, konsistenten DB-Snapshot beziehungsweise Dump mit bestätigtem Restore anlegen. Aktive Legacy-Edge-Version und ihre Einstellungen separat sichern. Das SQL-Verfahren mit `scripts/verify-ios-pilot-db.mjs` auf isoliertem PostgreSQL prüfen. Ein optionaler, administrativ exportierter JSON-Katalog kann über `FAC_PILOT_CATALOG_SNAPSHOT` eingelesen werden. Eine Stichprobe aus der öffentlichen API ersetzt keinen vollständigen Datenbank-Dump. Lokales UC02 und Fancy Test wenden den ausdrücklich separaten Pilot-SQL-Schritt nicht an.
- In isolierter Umgebung beide UC02-Migrationen und Pilot-Guard gemeinsam anwenden, Legacy- und V4-Verträge ausführen, Widerruf und Rotation prüfen. Vor Produktion den konsistenten Restore-Punkt, die Abhängigkeiten und Rechte noch einmal kontrollieren. Beim Cutover Schreibfenster vereinbaren, die zwei UC02-Migrationen und den Pilot-Guard in **einer Transaktion** anwenden (beispielsweise `psql -X -v ON_ERROR_STOP=1 --single-transaction` mit drei `-f`-Optionen in dieser Reihenfolge) und die beiden UC02-Versionen im Migrationsverlauf abgestimmt erfassen und erst nach Abnahme den Edge-Schalter aktivieren.
- Falls Probleme auftreten zuerst den Edge-Schalter deaktivieren, gegebenenfalls die Installationsberechtigung widerrufen. Alle Pilot-Schreibdaten, Fotoobjekte, Historien und SAVE-Belege sichern. Bestehende Kataloglesezugriffe prüfen. Legacy-RPCs nur als geprüftes Paar mit den passenden Daten und Grants wiederherstellen. Vor Rückkehr zu alter Legacy-Write-Semantik die seit Cutover geschriebenen Pilot-Datensätze und Barcodes abgleichen. Wiederanlauf und Art des Restores durch 02 freigeben lassen.

## Korrektur für den Bestandskatalog

Das bestehende EDIT ist im nativen Pilotprofil für alle Tees erreichbar. Öffnen des Formulars erteilt keine Schreibberechtigung. Jeder SAVE bleibt über Keychain-Bridge, Edge-Prüfung und transaktionale Autorisierung geschützt. Die gezielte Anpassung in `supabase/pilot/installation-authority.sql` erweitert die vorhandene Update-RPC ausschließlich für einen vom Pilot-Gateway gesetzten Autorisierungskontext. Die Basismigration und Fancy Test behalten ihren bisherigen Schutz. Der SQL-Schritt bricht bei abweichendem Quellstand der bisherigen curated-Prüfung ab.

Name, Hersteller, Kategorie, Zubereitung, Barcode und die erlaubten Galerie-Fotos verwenden denselben Update-Pfad mit Revisionsprüfung. Herkunft `curated` und Katalog-ID bleiben erhalten. `tea_edit_history` bewahrt den vollständigen vorherigen Datensatz, `pilot_edit_audit` ordnet die neue Revision der Installation und einem Zeitpunkt zu. Wiederholtes SAVE erzeugt keinen zweiten Audit-Eintrag. Veröffentlichte curated-Fotos werden über dieselbe signierte Galerie geladen. Die Detailgalerie erhält zusätzlich die bisher ausgewählte externe Produktabbildung. Bereits vorhandene externe Bildzuordnungen werden dabei nicht entfernt.

Empfehlung für 02: Den freigegebenen Legacy-Schreibstopp erst im separat freigegebenen produktiven Cutover anwenden. Der öffentliche CREATE-Zugang wird gemäß der abschließenden Entscheidung beim Cutover gesperrt. Die Barcode-Eindeutigkeit gilt über UPC/EAN-Aliase hinweg; Konflikte rollen die gesamte Änderung zurück. Keine automatische Zusammenführung anhand des Namens vorsehen.

Die Korrektur wurde mit isoliertem PostgreSQL geprüft, einschließlich berechtigtem curated-Update mit Foto und Barcode, erneutem Lesen derselben ID, Historie, Installation-Audit, veralteter Revision, fehlender Berechtigung und Token-Widerruf. Echte Storage-Downloads und der signierte iPhone-Ablauf bleiben vor der Freigabe separat zu prüfen.

## Finaler Cutover mit gesperrten Legacy-Schreibzugriffen

Die freigegebene Entscheidung sperrt CREATE und EDIT über V2 und ältere V3-Clients. Der bestehende Edge-Handler darf weiterlaufen; seine RPC-Aufrufe treffen auf denselben transaktionalen Datenbank-Guard. Alle Create-/Update-Aufrufe ohne den vom autorisierten Pilot-Gateway gesetzten Kontext werden vor SAVE-Belegen, Rate-Limits, Änderungen und Barcode-Zuordnungen verweigert. Die öffentliche SELECT-Berechtigung bleibt unverändert. Der alte Edge-Handler kann eine RPC-Verweigerung als HTTP 500 melden; auch in diesem Fall wurde nichts gespeichert. Eine verständlichere Legacy-Fehlermeldung benötigt ein separates Edge-Deployment.

Der Workflow `.github/workflows/pilot-backend.yml` startet einen eigenen lokalen Supabase-Stack auf einem GitHub-Runner. Die synthetische Basis, beide UC02-Migrationen und der Pilot-Guard gelten ausschließlich dort. `scripts/verify-ios-pilot-local.mjs` prüft mit echten Diensten CREATE/EDIT-Verweigerung, autorisiertes ADD mit drei JPEGs, signierte Downloads und privaten Storage, curated-EDIT mit Foto/Barcode, Idempotenz, Konflikte und Widerruf. Das Skript erwartet eine verifizierte lokale Fixture und eine separat vorbereitete Sandbox. Es verändert keine vorhandene persönliche UC02-Testinstanz automatisch.

### Produktionsbackup und Wiederherstellung

Vor dem produktiven Cutover einen verschlüsselten, außerhalb von Git abgelegten vollständigen DB-Dump mit Rollen/Grants und aktiven Edge-Quellen erstellen. Die freigegebene Verbindungsadresse muss zum Projekt `zfkiiqqyapahxirguxgj` gehören. Die Datenbank-Zugangsdaten über `PGSERVICE` und eine lokal geschützte `PGPASSFILE` verwenden; keine Passwörter in Befehle oder Berichte kopieren. Ein vollständiger `pg_dump -Fc` läuft lesend und konsistent auf dem Produktionsserver. Globale Rollen separat mit `pg_dumpall --roles-only` sichern, Rollenpasswörter dabei geschützt behandeln. Exakte Tools und Versionen vorher über `--help` und die Serverversion prüfen.

Nach Verbindungsprüfung beispielsweise als Operator:
```bash
umask 077
mkdir -p "$HOME/fac-pilot-backup"
PGSERVICE=fac-production pg_dump --format=custom --file="$HOME/fac-pilot-backup/database.dump"
PGSERVICE=fac-production pg_dumpall --roles-only --file="$HOME/fac-pilot-backup/roles.sql"
shasum -a 256 "$HOME/fac-pilot-backup/database.dump" "$HOME/fac-pilot-backup/roles.sql"
```

Die Service-Aliase müssen vorher lokal korrekt eingerichtet sein. Diese Befehle sind vorbereitet und wurden hier nicht gegen Produktion ausgeführt.

Alle Storage-Objekte separat über eine administrative, lesende Exportverbindung einschließlich Bucket, Key, Byte-Länge und SHA-256 sichern. DB-Backups enthalten die Storage-Dateien nicht. Noch vorhandene externe Bild-URLs und Bildzuordnungen im Dump erhalten. Vor jedem Cutover erneut feststellen, ob Storage weiterhin leer ist; ältere Bestandszahlen sind kein aktueller Nachweis.

Den Dump in einem eigenständigen lokalen Supabase-Stack mit kompatibler PostgreSQL-Version wiederherstellen. Rollen und Grants auf die dort vorhandenen Plattformrollen abstimmen; Restore nur gegen nachweislich lokale Testadresse ausführen. Anschließend Tabellenanzahl, alle 167 Bestands-IDs, Barcodes einschließlich kanonischer Keys, Zubereitungen und Bildreferenzen vergleichen. Danach die drei SQL-Schritte in einer Transaktion testen und denselben Vergleich wiederholen. Storage-Dateien über die Storage-API in die isolierte Umgebung einspielen und signierte Downloads gegen die gesicherten Prüfsummen vergleichen.

Der automatisierte lokale Dump-/Restore-Test verwendet synthetische Katalogdaten. Er ersetzt keine erfolgreiche vollständige Wiederherstellung des Produktionsdumps. Ein solcher Nachweis und sein Backup-Zeitpunkt müssen 02 vor der Produktionsfreigabe vorliegen.

### Rückweg

1. V4-Bereitschaft deaktivieren und Installationstoken widerrufen. Das stoppt neue SAVEs; bereits abgeschlossene Transaktionen bleiben erhalten.
2. Post-Cutover-Daten einschließlich Fotos, Audit, Historie und SAVE-Belegen sichern. Änderungen seit dem Backup auflisten und ihre Übernahme beim Restore festlegen.
3. Bei Anwendungsfehlern zunächst die vorhandenen geschützten RPCs beibehalten und einen korrigierten Client/Handler prüfen. Legacy-Schreibzugriffe erst nach ausdrücklicher Rückfreigabe öffnen.
4. Falls DB-Restore erforderlich ist, Schreibfenster halten, den verifizierten Vorab-Stand in isolierter Umgebung wiederherstellen, abgleichen und erst dann das konkrete Produktions-Restore freigeben. Fehlende Post-Cutover-Daten kontrolliert übernehmen. Bucket und Historie nicht pauschal löschen.

### Tatsächlich ausgeführte Abnahme dieses Implementierungsstands

Am 22. November 2026 bestanden die realen lokalen Supabase-Prüfungen im GitHub-Actions-Lauf [45067419789](https://github.com/nielscookit/fancy-a-cuppa-react/actions/runs/45067419789). Der Lauf verwendet pro Ausführung einen eigenen Projektnamen und freie lokale Ports. Er führte PostgreSQL, REST, Edge Runtime und Storage tatsächlich aus. Erfolgreich waren Legacy-CREATE/EDIT-Verweigerung, unberechtigtes V4-SAVE, autorisiertes ADD mit drei JPEGs, signierte Downloads, private Storage-Zugriffe, curated-EDIT mit Foto und Barcode, SAVE-Replay, Revisions-/Barcodekonflikte, Historie und Token-Widerruf. Ein echter pg_dump/pg_restore in eine separate lokale Datenbank bestätigte die gespeicherte curated-Revision.

Der aktuelle öffentliche Produktionskatalog wurde zusätzlich lesend als temporärer JSON-Export gesichert und in PGlite wiederhergestellt. 167 Tees, 110 Barcode-Zuordnungen, 167 Zubereitungen und 142 Bildreferenzen wurden nach den drei SQL-Schritten feldweise mit dem Export verglichen. Dieser Export wurde nicht eingecheckt und enthält keine Secrets. Der gleiche Lauf bestand auch die Tests von Widerruf, Rotation, Idempotenz, Audit und Legacy-Sperren.

Der Xcode-Lauf [45066942404](https://github.com/nielscookit/fancy-a-cuppa-react/actions/runs/45066942404) bestand 371/371 Tests und drei Simulator-Builds. Der vollständige Produktionsdump einschließlich Rollen/Grants und dessen Restore sowie eine physische iPhone-Abnahme bleiben vor dem produktiven Cutover offen. Die hier vorliegende Umgebung besitzt keine direkte PostgreSQL-Backup-Verbindung zum Produktionsprojekt. Katalog-JSON und synthetischer DB-Dump decken diesen vollständigen Wiederherstellungsnachweis nicht ab.

## Automatisierte Abnahme des vorhandenen Mac-Backups

`node scripts/verify-pilot-restore.mjs` verwendet ausschließlich `~/fac-pilot-backup/database.dump` und den passwortfreien Rollenexport `roles.sql`. Der Container muss exakt `fac-pilot-restore` heißen, laufen, Docker-Netzwerkmodus `none` verwenden und darf weder Host-Bind-Mounts noch veröffentlichte Ports oder privilegierten Betrieb besitzen. PostgreSQL wird ausschließlich über `docker exec` an Port 55432 oder 5432 angesprochen. Es wird keine Host-/Produktionsverbindung hergestellt.

Das Skript prüft Repository und Branch sowie unveränderte Restore-/SQL-Eingaben. Andere lokale Änderungen wie Signing werden nicht angefasst. Es löscht weder Container noch bestehende Datenbanken. Die vorhandene Datenbank `fac_restore_check` bleibt erhalten. Jeder Durchlauf legt zwei eindeutig benannte Datenbanken `fac_check_baseline_…` und `fac_check_cutover_…` an; Namen und Container-ID stehen im Bericht. Diese Datenbanken bleiben für die Prüfung erhalten.

Ablauf:
1. Backupdateien hashen, Custom-Archiv und benötigte Erweiterungen prüfen.
2. Rollenexport strikt parsen. CREATE ROLE, erlaubte Rollenattribute und bekannte Mitgliedschaften werden rekonstruiert. Passwörter, sonstiges SQL, Rollen-Settings und unbekannte Syntax führen zum Abbruch. Bootstrap-postgres bleibt der lokale Superuser; diese Abweichung ist ausdrücklich im Bericht aufgeführt.
3. Zwei vollständige Restores ohne `--no-owner`, `--no-acl` oder TOC-Filter und mit `--exit-on-error --single-transaction` ausführen.
4. Katalogdaten und IDs einschließlich Barcodes, Zubereitungen und Bildzuordnungen zwischen den unabhängigen Restores vergleichen. Ownership, ACL und RLS-Policies der vier Katalogtabellen vergleichen.
5. Beide UC02-Migrationen und Pilot-Guard in einer Transaktion in der zweiten Datenbank anwenden. Alle Bestandswerte erneut vergleichen; ausschließlich die neuen Herkunfts-/Revisionsfelder werden beim Datenvergleich ausgeklammert. Der bekannte Sicherungsumfang von 167 Tees, 110 Barcodes, 167 Zubereitungen und 142 Bildzuordnungen muss ebenfalls stimmen. Danach für alle 167 Tees `origin=curated`, `revision=1`, öffentliche Lesbarkeit und fehlende direkte Client-Schreib-RPC-Rechte prüfen.

Der Bericht liegt unter `~/fac-pilot-backup/restore-check-<Zeitpunkt>/report.json` mit Dateirecht 0600. Er enthält Prüfschritte, Hashes, Datensatzanzahlen und Einschränkungen. Backupdaten und Rohfehler von pg_restore werden nicht ins Terminal oder nach GitHub geschrieben. Nach einem Abbruch wird kein Teilerfolg als vollständiger Restore gemeldet. Fehlende Plattform-Erweiterungen werden vor der Rollenänderung festgestellt. Wiederholung ist nur für denselben Container und dasselbe Backuppaar erlaubt, sobald Rollen angelegt wurden; ein eigener Marker prüft diese Zuordnung.

Ein Ergebnis `LOGICAL_RESTORE_AND_CUTOVER_PASSED` bestätigt den vollständigen logischen Archiv-Restore und den isolierten Cutover-Test. Es bestätigt keine identische Supabase-Betriebsumgebung, keine Rollenpasswörter, keine Storage-Dateien und keinen iPhone-Test. Es fehlt außerdem ein unabhängiges Manifest vom Zeitpunkt der Sicherung: Der Datenvergleich prüft die konsistente Wiederherstellung desselben Archivs. Physische Storage-Dateien sind nicht Bestandteil des Dumps.

Die CI-Prüfung erzeugt ein synthetisches vollständiges Custom-Archiv mit 167 Tees auf PostgreSQL 17.11, restauriert es mit dem identischen Skript in einem netzwerklosen Container und prüft die Wiederholbarkeit. Produktionsdateien werden dafür nicht hochgeladen. Die echten Mac-Dateien sind hier nicht verfügbar. Ihr Ergebnis steht erst nach dem lokalen Lauf fest.

Einziger lokaler Prüfbefehl nach Übernahme dieses Commits im Branch `feature/native-ios`:
```bash
node scripts/verify-pilot-restore.mjs
```

Fehlen Erweiterungen wie pg_net oder Supabase-spezifische Objekte, bleibt die Abnahme gesperrt. Es ist dann ein kompatibles PostgreSQL-/Supabase-Image im weiter vollständig isolierten Container erforderlich. Das Skript installiert keine Erweiterungen und öffnet kein Netzwerk automatisch. Der Bericht ist die Rückmeldung an 02; eine produktive Migration wird durch diesen Prüflauf nie ausgelöst.
