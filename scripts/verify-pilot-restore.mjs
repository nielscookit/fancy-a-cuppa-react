import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function parseRoles(source) {
  if (/\bPASSWORD\b/i.test(source)) throw Error('Rollenexport enthält PASSWORD. Passwortfreien Export verwenden.');
  const names = new Set(), attributes = new Map(), memberships = [];
  const identifier = '(?:"([a-z_][a-z0-9_]*)"|([a-z_][a-z0-9_]*))';
  const nameOf = match => match[1] || match[2];
  for (const line of source.split('\n').map(line=>line.trim())) {
    if (!line || line.startsWith('--') || /^\\(?:un)?restrict [a-zA-Z0-9]+$/.test(line)
      || /^SET (?:default_transaction_read_only|client_encoding|standard_conforming_strings) = (?:off|'UTF8'|on);$/.test(line)) continue;
    let m = line.match(new RegExp('^CREATE ROLE '+identifier+';$'));
    if (m) { names.add(nameOf(m)); continue; }
    m = line.match(new RegExp('^ALTER ROLE '+identifier+' WITH (.+);$'));
    if (m) {
      const options=m[3].split(/\s+/);
      const flags=new Set(['SUPERUSER','NOSUPERUSER','INHERIT','NOINHERIT','CREATEROLE','NOCREATEROLE','CREATEDB','NOCREATEDB','LOGIN','NOLOGIN','REPLICATION','NOREPLICATION','BYPASSRLS','NOBYPASSRLS']);
      if (!options.every(option=>flags.has(option))) throw Error('Nicht unterstützte Rollenattribute im Export.');
      attributes.set(nameOf(m), options);
      continue;
    }
    const grantor = line.match(/ GRANTED BY ("?[a-z_][a-z0-9_]*"?);$/)?.[1].replaceAll('"','');
    const grant = line.replace(/ GRANTED BY ("?[a-z_][a-z0-9_]*"?);$/, ';');
    m = grant.match(new RegExp('^GRANT '+identifier+' TO '+identifier+'(?: WITH (.+))?;$'));
    if (m) {
      const options=m[5];
      if (options && options!=='ADMIN OPTION') {
        const parts=options.split(/,\s*/);
        if(!parts.every(option=>/^(?:ADMIN|INHERIT|SET) (?:TRUE|FALSE)$/.test(option))
          || new Set(parts.map(option=>option.split(' ')[0])).size!==parts.length) {
          throw Error('Nicht unterstützte Mitgliedschaftsoptionen.');
        }
      }
      memberships.push({role:m[1]||m[2],member:m[3]||m[4],options,grantor});
      continue;
    }
    throw Error('Nicht unterstützte Anweisung im Rollenexport. Kein Rollen-SQL ausgeführt.');
  }
  if (!names.has('anon') || !names.has('authenticated') || !names.has('service_role')) throw Error('Supabase-Basisrollen fehlen.');
  if ([...attributes.keys()].some(name=>!names.has(name))
    || memberships.some(m=>[m.role,m.member,m.grantor].filter(Boolean).some(name=>!names.has(name) && !/^pg_[a-z_]+$/.test(name)))) {
    throw Error('Unbekannte Rollenreferenz.');
  }
  return { names:[...names], attributes, memberships };
}

export function validateContainer(value) {
  if (value.Name !== '/fac-pilot-restore' || value.State?.Running !== true
    || value.HostConfig?.NetworkMode !== 'none' || value.HostConfig?.Privileged
    || value.HostConfig?.PidMode === 'host' || value.HostConfig?.IpcMode === 'host'
    || Object.keys(value.NetworkSettings?.Networks ?? {}).some(name=>name !== 'none')
    || (value.Mounts ?? []).some(m=>m.Type === 'bind')
    || Object.values(value.NetworkSettings?.Ports ?? {}).some(bindings=>bindings?.length)
    || Object.keys(value.HostConfig?.PortBindings ?? {}).length) {
    throw Error('Restore-Container ist nicht eindeutig netzwerkisoliert oder besitzt Host-Bindings.');
  }
}

const q = value => '"' + value.replaceAll('"','""') + '"';
const literal = value => "'" + value.replaceAll("'","''") + "'";
const tables=['teas','tea_codes','tea_preparations','tea_product_images'];

export async function main() {
  process.umask(0o077);
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const backup=join(homedir(),'fac-pilot-backup');
  const stamp=new Date().toISOString().replaceAll(':','-')+'-'+randomBytes(3).toString('hex');
  const reportDir=join(backup,'restore-check-'+stamp);
  mkdirSync(reportDir,{recursive:true,mode:0o700});
  const report={ date:new Date().toISOString(), status:'FAILED', steps:[], limitations:[], databases:[], container:'fac-pilot-restore' };
  let stage='Vorprüfung';
  const execute=(command,args,input)=>execFileSync(command,args,{input,encoding:'utf8',maxBuffer:256*1024*1024,stdio:['pipe','pipe','pipe']});
  const docker=args=>execute('docker',args);
  const container='fac-pilot-restore';
  let port;
  const pg=(database,source)=>execute('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-p',String(port),'-d',database,'-f','-'],source).trim();
  const rows=(database,source)=>JSON.parse(pg(database,source));
  try {
    const branch=execute('git',['-C',root,'rev-parse','--abbrev-ref','HEAD']).trim();
    const origin=execute('git',['-C',root,'remote','get-url','origin']).trim();
    if(branch!=='feature/native-ios' || !/[:/]nielscookit\/fancy-a-cuppa-react(?:\.git)?$/.test(origin)) throw Error('Falscher Branch oder falsches Repository.');
    report.commit=execute('git',['-C',root,'rev-parse','HEAD']).trim();
    const changes=execute('git',['-C',root,'status','--porcelain','--untracked-files=no','--','scripts/verify-pilot-restore.mjs','supabase/migrations','supabase/pilot']).trim();
    if (changes) throw Error('Restore-Skript oder SQL-Dateien enthalten lokale Änderungen.');
    const host=process.env.DOCKER_HOST || docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']).trim();
    if (!host.startsWith('unix://') || process.env.DOCKER_CONTEXT && process.env.DOCKER_HOST) throw Error('Lokaler Docker-Kontext ist nicht eindeutig.');
    const inspect=JSON.parse(docker(['inspect',container]))[0];
    validateContainer(inspect);
    const dump=readFileSync(realpathSync(join(backup,'database.dump')));
    if(dump.subarray(0,5).toString()!=='PGDMP') throw Error('Kein PostgreSQL-Custom-Dump.');
    const roleText=readFileSync(realpathSync(join(backup,'roles.sql')),'utf8');
    const roles=parseRoles(roleText);
    report.dumpSha256=createHash('sha256').update(dump).digest('hex');
    report.rolesSha256=createHash('sha256').update(roleText).digest('hex');
    report.roles=roles.names;
    for(const candidate of [55432,5432]) {
      try { docker(['exec',container,'pg_isready','-U','postgres','-p',String(candidate)]); port=candidate;break; } catch {}
    }
    if(!port) throw Error('PostgreSQL im isolierten Container nicht erreichbar.');
    report.port=port;
    const version=Number(pg('postgres',"select current_setting('server_version_num');"));
    if(version<170000 || version>=180000) throw Error('PostgreSQL 17 wird benötigt.');
    report.serverVersion=pg('postgres','select version();');
    const existing=rows('postgres',"select coalesce(json_agg(rolname),'[]') from pg_roles where rolname !~ '^pg_';");
    const markerPath='/tmp/fac-pilot-restore-owner.json';
    let marker;
    try { marker=JSON.parse(docker(['exec',container,'cat',markerPath])); } catch {}
    const ours=marker?.tool==='fac-pilot-restore-v1' && marker?.container===inspect.Id
      && marker?.dump===report.dumpSha256 && marker?.roles===report.rolesSha256;
    if(existing.some(name=>name!=='postgres') && !ours) throw Error('Container enthält fremde Rollen oder einen anderen Restore. Keine Rollen geändert.');
    if(ours && existing.some(name=>name!=='postgres' && !roles.names.includes(name))) throw Error('Unerwartete Rolle im Restore-Container.');
    report.containerId=inspect.Id;
    const copyPath='/tmp/fac-restore-'+stamp+'.dump';
    execute('docker',['exec','-i',container,'sh','-c','umask 077; cat > "$1"','sh',copyPath],dump);
    const toc=docker(['exec',container,'pg_restore','--list',copyPath]);
    const extensions=[...toc.matchAll(/^\d+; \d+ \d+ EXTENSION - ([^\s]+)\s*$/gm)].map(m=>m[1]);
    const available=rows('postgres',"select json_agg(name) from pg_available_extensions;");
    const missing=extensions.filter(name=>!available.includes(name));
    report.extensions={ required:extensions, missing };
    if(missing.length) throw Error('Supabase-Erweiterungen im Container fehlen: '+missing.join(', ')+'. Vollständiger Restore blockiert; es werden keine Archivobjekte ausgelassen.');
    for(const name of tables) {
      if(!new RegExp('TABLE DATA public '+name+'(?:\\s|$)').test(toc)) throw Error('Katalogtabelle fehlt im Archiv: '+name);
    }
    report.steps.push('Archiv, Rollen, Container und Erweiterungen geprüft');
    stage='Rollen vorbereiten';
    // Execute only statements reconstructed from the strict, password-free grammar.
    // PostgreSQL remains the bootstrap superuser in this networkless container.
    execute('docker',['exec','-i',container,'sh','-c','umask 077; cat > "$1"','sh',markerPath],
      JSON.stringify({tool:'fac-pilot-restore-v1',container:inspect.Id,dump:report.dumpSha256,roles:report.rolesSha256}));
    for(const name of roles.names) {
      if(name!=='postgres' && !existing.includes(name)) pg('postgres','create role '+q(name)+';');
      if(name!=='postgres' && roles.attributes.has(name)) pg('postgres','alter role '+q(name)+' with '+roles.attributes.get(name).join(' ')+';');
    }
    for(const m of roles.memberships) pg('postgres','grant '+q(m.role)+' to '+q(m.member)+(m.options?' with '+m.options:'')+(m.grantor?' granted by '+q(m.grantor):'')+';');
    report.limitations.push('Bootstrap-Rolle postgres bleibt lokaler Superuser. Rollenpasswörter, externe Dienste und Betriebssystemkonfiguration sind nicht Bestandteil dieses Nachweises.');
    const suffix=randomBytes(6).toString('hex');
    for(const label of ['baseline','cutover']) {
      stage='Vollständiger Restore '+label;
      const database='fac_check_'+label+'_'+suffix;
      pg('postgres','create database '+q(database)+' template template0;');
      report.databases.push(database);
      if(/^\d+; \d+ \d+ SCHEMA - public\s/m.test(toc)) pg(database,'drop schema public;');
      // No --no-owner, no --no-acl and no TOC filtering.
      docker(['exec',container,'pg_restore','--exit-on-error','--single-transaction','-U','postgres','-p',String(port),'-d',database,copyPath]);
      report.steps.push('Vollständiges Archiv einschließlich Ownership und ACL restauriert: '+label);
    }
    const [baseline,target]=report.databases;
    const snapshot=database=>Object.fromEntries(tables.map(table=>[table,rows(database,
      'select coalesce(json_agg(to_jsonb(t)'+(table==='teas'?" - 'origin' - 'revision'":'')+' order by '+(table==='tea_product_images'?'tea_id':'id')+"),'[]') from public."+table+' t;')]));
    const data=snapshot(baseline);
    if(JSON.stringify(data)!==JSON.stringify(snapshot(target))) throw Error('Die beiden vollständigen Restores weichen voneinander ab.');
    report.counts=Object.fromEntries(tables.map(t=>[t,data[t].length]));
    const expectedCounts={teas:167,tea_codes:110,tea_preparations:167,tea_product_images:142};
    for(const [table,count] of Object.entries(expectedCounts)) {
      if(data[table].length!==count) throw Error('Abweichender Backupumfang bei '+table+': erwartet '+count+', gefunden '+data[table].length+'.');
    }
    const permissions=database=>pg(database,`select json_agg(row_to_json(p) order by tablename,policyname) from pg_policies p where schemaname='public' and tablename in ('teas','tea_codes','tea_preparations','tea_product_images');`)
      +'\n'+pg(database,`select json_agg(json_build_array(c.relname,pg_get_userbyid(c.relowner),c.relrowsecurity,c.relacl::text) order by c.relname) from pg_class c where c.relnamespace='public'::regnamespace and c.relname in ('teas','tea_codes','tea_preparations','tea_product_images');`);
    const before=permissions(baseline);
    if(before!==permissions(target)) throw Error('Rechte der unabhängigen Restores stimmen nicht überein.');
    stage='Cutover-Transaktion';
    pg(target,'begin;\n'+[
      'supabase/migrations/20261115220827_community_tea_catalog.sql',
      'supabase/migrations/20261116122401_community_tea_barcode_update.sql',
      'supabase/pilot/installation-authority.sql',
    ].map(path=>readFileSync(join(root,path),'utf8')).join('\n')+'\ncommit;');
    if(JSON.stringify(data)!==JSON.stringify(snapshot(target))) throw Error('Cutover hat Bestandsdaten verändert.');
    if(before!==permissions(target)) throw Error('Cutover hat Katalog-SELECT-Rechte oder RLS verändert.');
    if(pg(target,"select count(*) from teas where origin='curated' and revision=1;")!=='167') throw Error('Herkunft oder Revision der Bestandsdaten fehlerhaft.');
    for(const role of ['anon','authenticated']) {
      if(pg(target,'set role '+q(role)+'; select count(*) from public.teas;')!=='167') throw Error('Öffentliche Katalogsicht unvollständig.');
      const rights=rows(target,"select json_agg(has_function_privilege("+literal(role)+",oid,'execute')) from pg_proc where pronamespace='public'::regnamespace and proname in ('add_community_tea','update_community_tea','update_community_tea_barcode','community_tea_pilot_save');");
      if(rights.length!==4 || rights.some(Boolean)) throw Error('Unberechtigte RPC-Ausführungsrechte.');
    }
    report.steps.push('Katalogdaten, IDs, Barcodes, Zubereitungen und Bildzuordnungen in beiden Restores identisch');
    report.steps.push('Cutover atomar erfolgreich; alle Bestandsdaten und Katalog-Leserechte erhalten; direkte Client-RPCs gesperrt');
    report.limitations.push('Kein früheres Produktionsmanifest vorhanden: Die beiden unabhängigen Restores werden gegen dasselbe gesicherte Archiv verglichen.');
    report.limitations.push('Storage-Dateien sind nicht im DB-Dump. Edge-Runtime, signierte Downloads, Keychain und iPhone bleiben eigene Prüfungen.');
    report.status='LOGICAL_RESTORE_AND_CUTOVER_PASSED';
  } catch(error) {
    report.failedStage=stage;
    // Never print pg_restore/psql stderr: archive DDL and values may contain secrets.
    report.error=error.status!==undefined ? 'Lokales Werkzeug fehlgeschlagen; vollständiger Restore nicht bestätigt (Exit '+error.status+').' : error.message;
    process.exitCode=1;
  } finally {
    const output=join(reportDir,'report.json');
    writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
    console.log(report.status+'\nBericht: '+output);
    if(report.error) console.log(report.failedStage+': '+report.error);
    console.log('Produktiver Cutover bleibt bis zur Freigabe durch 02 gesperrt.');
  }
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
