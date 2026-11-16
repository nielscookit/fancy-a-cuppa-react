import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, readdirSync } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
import { delimiter, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { readUc02Config } from './uc02-ios-config.mjs';

const branch = 'feature/native-ios';
const baseline = 'b4553ef94fe3441bc8e5e5aa04fad63e6b3e5662';
const db = 'supabase_db_fancy-a-cuppa-react';
const api = 'http://127.0.0.1:54321';
const fixture = '00000000-0000-4000-8000-000000000001';
const approved = '20261116122401_community_tea_barcode_update.sql';
const approvedHash = '331a167eaeca09d84633990ed8b805548249c9ca9801a6699116aa1d1f317bb1';
const requiredHistory = ['20261110165850', '20261115220827'];
const root = fileURLToPath(new URL('../', import.meta.url));
const mainCheckout = join(homedir(),'Documents','fancy-a-cuppa-react');
const testCheckout = join(homedir(),'Documents','fancy-a-cuppa-uc02-ios');
const env = Object.fromEntries(['PATH','HOME','TMPDIR','USER','LOGNAME','TERM']
  .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
env.GIT_OPTIONAL_LOCKS = '0';
const localBin = join(root, 'node_modules', '.bin');
const supabaseEnv = { PATH: [localBin, env.PATH].filter(Boolean).join(delimiter) };

class Stop extends Error {}

function exec(file, args, { input, timeout = 30000, extraEnv = {}, cwd = root, testDiagnostics = false } = {}) {
  try {
    return execFileSync(file, args, { cwd, env: { ...env, ...extraEnv },
      encoding: 'utf8', stdio: ['pipe','pipe','pipe'], input, timeout, maxBuffer: 16 * 1024 * 1024 }).trim();
  } catch (error) {
    const reason = error.code === 'ENOENT' ? 'Programm fehlt' : error.code === 'ETIMEDOUT'
      ? 'Zeitlimit erreicht' : Number.isInteger(error.status) ? 'Exit ' + error.status : 'Aufruf fehlgeschlagen';
    if (file === 'supabase' && error.code === 'ENOENT') {
      throw new Stop('Supabase-CLI fehlt. Im Fancy-Test-Worktree einmal npm install --no-save --package-lock=false supabase ausführen.');
    }
    const diagnostics = testDiagnostics ? safeTestDiagnostics(error.stdout) : '';
    // Child output can include values from environment files or fixtures.
    throw new Stop(file + ': ' + reason + (diagnostics ? '\n' + diagnostics : ''));
  }
}

export function safeTestDiagnostics(stdout) {
  const failures = String(stdout ?? '').split(/(?=^\s*not ok \d+ - )/m).slice(1);
  return failures.slice(0, 8).map(failure => {
    // Only emit source locations that exist in this checkout, and diagnostics
    // drawn from fixed literals. Never forward test values or free text.
    const locations = [...failure.matchAll(/(?:^|\/)((?:tests|src)\/[\w./-]+\.m?js):(\d{1,6}):(\d{1,4})/gm)];
    const location = locations.find(([, path]) =>
      !path.split('/').includes('..') && existsSync(join(root, path)));
    const kind = /(?:ERR_ASSERTION|AssertionError)/.test(failure) ? 'AssertionError' : 'Test fehlgeschlagen';
    const operator = failure.match(/^\s*operator:\s*['"]?(strictEqual|deepStrictEqual|match|doesNotMatch|==|!=|===|!==)['"]?\s*$/m)?.[1];
    const font = failure.match(/RobotoMono-(Regular|Medium)\.ttf missing from FACLiveActivityExtension resources/)?.[1];
    return '  ' + kind + (location ? ' · ' + location.slice(1).join(':') : '') +
      (operator ? ' · ' + operator : '') +
      (font ? ' · RobotoMono-' + font + '.ttf fehlt in den Extension-Ressourcen' : '');
  }).join('\n');
}

function requireCheck(ok, message) {
  if (!ok) throw new Stop(message);
}

function git(...args) { return exec('git', args); }

function resolved(path) {
  try { return realpathSync(path); } catch { return null; }
}

function checkGit(report) {
  const head = git('rev-parse', 'HEAD');
  const current = git('rev-parse', '--abbrev-ref', 'HEAD');
  report.info('Commit ' + head + ' · Branch ' + (current === 'HEAD' ? branch + ' (detached)' : current));
  const testPath = resolved(testCheckout);
  requireCheck(testPath && realpathSync(root) === testPath && realpathSync(process.cwd()) === testPath,
    'Runner im vorgesehenen Fancy-Test-Worktree starten.');
  const common = realpathSync(git('rev-parse', '--path-format=absolute', '--git-common-dir'));
  requireCheck(common === resolved(join(mainCheckout, '.git')) && git('rev-parse', '--absolute-git-dir') !== common,
    'Der Test-Worktree gehört nicht zum erwarteten Hauptcheckout.');
  requireCheck(current === branch || current === 'HEAD', 'Falscher Branch.');
  requireCheck(new Set([
    'https://github.com/nielscookit/fancy-a-cuppa-react.git',
    'git@github.com:nielscookit/fancy-a-cuppa-react.git',
  ]).has(git('remote', 'get-url', 'origin')), 'Unerwartetes Git-Repository.');
  try {
    git('merge-base', '--is-ancestor', baseline, head);
    git('merge-base', '--is-ancestor', head, 'refs/remotes/origin/' + branch);
  } catch {
    throw new Stop('HEAD liegt nicht auf dem lokal bekannten feature/native-ios ab dem UC02-Ausgangsstand.');
  }
}

function sql(source, runExec = exec) {
  return runExec('docker', ['exec', '-i', db, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
    '-h', '/var/run/postgresql', '-U', 'postgres', '-d', 'postgres', '-f', '-'], { input: source });
}

function parseStatus(lines) {
  return Object.fromEntries([...lines.matchAll(/^(\w+)="([^"\n]*)"$/gm)].map(([, key, value]) => [key, value]));
}

export async function checkLocal(report, { runExec = exec, request = fetch } = {}) {
  requireCheck(!process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT, 'Docker-Host oder Kontext wurde überschrieben.');
  const context = runExec('docker', ['context','inspect','--format','{{.Endpoints.docker.Host}}']);
  requireCheck(context.startsWith('unix:///') && !context.includes('\n'), 'Lokaler Docker-Unix-Socket erforderlich.');
  const info = JSON.parse(runExec('docker', ['inspect', db, 'supabase_kong_fancy-a-cuppa-react']));
  requireCheck(info.length === 2 && info.every((container, index) =>
    container.State?.Running && container.Config?.Labels?.['com.supabase.cli.project'] === 'fancy-a-cuppa-react' &&
    container.Name === '/' + [db, 'supabase_kong_fancy-a-cuppa-react'][index]),
  'Die erwarteten lokalen Supabase-Container laufen nicht unter demselben Projekt.');
  report.pass('Docker · lokale UC02-Container');

  const status = parseStatus(runExec('supabase', ['status','-o','env'], { cwd:mainCheckout, extraEnv:supabaseEnv }));
  const url = new URL(status.DB_URL);
  requireCheck(url.protocol === 'postgresql:' && ['127.0.0.1','localhost'].includes(url.hostname) &&
    url.pathname === '/postgres' && !url.search && !url.hash &&
    info[0].NetworkSettings?.Ports?.['5432/tcp']?.some(port => port.HostPort === url.port) &&
    info[1].NetworkSettings?.Ports?.['8000/tcp']?.some(port => port.HostPort === '54321') &&
    (status.API_URL || status.SUPABASE_URL) === api,
  'CLI-Endpunkte stimmen nicht mit den lokalen Docker-Portzuordnungen überein.');
  report.pass('Supabase · CLI und Docker stimmen überein');

  const expected = 'UC02 Fixture|Synthetic Black Tea|curated';
  const row = sql(`begin read only;
    select brand || '|' || name || '|' || origin from public.teas where id='${fixture}';
    rollback;`, runExec);
  requireCheck(row === expected, 'Die kuratierte UC02-Fixture fehlt in der Datenbank.');
  const key = status.ANON_KEY || status.PUBLISHABLE_KEY;
  requireCheck(key, 'Kein öffentlicher lokaler Client-Key gefunden.');
  let rows;
  try {
    const response = await request(api + '/rest/v1/teas?select=id,brand,name,origin&id=eq.' + fixture,
      { headers: { apikey:key }, redirect:'error', signal:AbortSignal.timeout(5000) });
    if (!response.ok) throw new Stop('Lokale REST-API meldet HTTP ' + response.status + '.');
    rows = await response.json();
  } catch (error) {
    if (error instanceof Stop) throw error;
    throw new Stop('Lokale REST-API nicht erreichbar oder Antwort ungültig.');
  }
  requireCheck(Array.isArray(rows) && rows.length === 1 && rows[0].id === fixture &&
    [rows[0].brand,rows[0].name,rows[0].origin].join('|') === expected,
  'Die lokale REST-API liefert nicht dieselbe UC02-Fixture.');
  report.pass('UC02-Fixture · SQL und lokale REST-API');
  return status;
}

function checkTrackedExecutionInputs() {
  requireCheck(!git('status','--porcelain','--','package.json','package-lock.json','scripts',
    'capacitor.config.json','vite.native.config.js','supabase/config.toml'),
  'Ausführbare Skripte oder Tool-Konfigurationen weichen vom Commit ab.');
}

function npmStep(report, args, label, extraEnv) {
  const isTest = args[0] === 'test';
  const command = isTest ? [...args, '--', '--test-reporter=tap'] : args;
  const output = exec('npm', command, { timeout: 180000, extraEnv, testDiagnostics:isTest });
  const tally = output.match(/^(?:#|ℹ) (?:pass|tests) (\d+)$/gm)?.join(', ');
  report.pass(label + (tally ? ' · ' + tally : ''));
}

async function build(report, status) {
  const { loadEnv } = await import('vite');
  const config = readUc02Config(loadEnv('uc02-local', root, ['FAC_UC02_', 'VITE_COMMUNITY_TEA_V4']));
  const url = new URL(config.url);
  const addresses = Object.values(networkInterfaces()).flat().map(address => address.address);
  requireCheck(url.port === '54321' && (url.hostname === 'localhost' || addresses.includes(url.hostname)) &&
    [status.ANON_KEY,status.PUBLISHABLE_KEY].includes(config.publishableKey),
  'Fancy Test muss die lokale API dieses Macs und deren öffentlichen Key verwenden.');
  const project = join(root,'ios/App/App.xcodeproj/project.pbxproj');
  const signingBefore = readFileSync(project);
  npmStep(report, ['run','build:ios-uc02-local'], 'Fancy-Test-Build und Capacitor-Sync', {
    FAC_UC02_SUPABASE_URL: config.url, FAC_UC02_SUPABASE_PUBLIC_KEY: config.publishableKey,
    VITE_COMMUNITY_TEA_V4: 'true',
  });
  requireCheck(signingBefore.equals(readFileSync(project)), 'Xcode-Projekt wurde während des Builds verändert.');
  const bundled = JSON.parse(readFileSync(join(root,'ios/App/App/capacitor.config.json'),'utf8'));
  requireCheck(bundled.appId === 'com.fancyacuppa.test', 'Unerwartete Bundle-ID im erzeugten Capacitor-Bundle.');
}

function migrationPlan() {
  const applied = sql('begin read only; select version from supabase_migrations.schema_migrations order by version; rollback;')
    .split('\n').filter(Boolean);
  const directory = join(root,'supabase/migrations');
  const files = readdirSync(directory, { withFileTypes:true });
  requireCheck(files.every(entry => entry.isFile() && /^\d{14}_[\w-]+\.sql$/.test(entry.name)),
    'Unerwartete Dateien im Migrationsverzeichnis.');
  return approvedMigration(applied, files.map(entry => entry.name),
    () => readFileSync(join(directory,approved)));
}

export function approvedMigration(applied, names, loadApproved) {
  const versions = names.map(name => name.slice(0,14));
  requireCheck(new Set(versions).size === versions.length &&
    requiredHistory.every(version => applied.includes(version)) &&
    applied.every(version => versions.includes(version)), 'Lokale Migrationshistorie ist nicht eindeutig.');
  const pending = names.filter(name => !applied.includes(name.slice(0,14)));
  if (!pending.length) return null;
  requireCheck(pending.length === 1 && pending[0] === approved &&
    createHash('sha256').update(loadApproved()).digest('hex') === approvedHash,
  'Ausstehende Migrationen sind für diesen Runner nicht freigegeben.');
  return approved;
}

async function migrate(report) {
  const file = migrationPlan();
  if (!file) { report.skip('Migration · keine ausstehende Migration'); return; }
  requireCheck(process.stdin.isTTY && process.stdout.isTTY, 'Migration erfordert ein interaktives Terminal.');
  const prompt = createInterface({ input:process.stdin, output:process.stdout });
  try {
    requireCheck(await prompt.question('Nur lokal ' + file + ' anwenden? MIGRATE LOCAL eingeben: ') === 'MIGRATE LOCAL',
      'Migration nicht bestätigt.');
  } finally {
    prompt.close();
  }
  checkGit(report);
  await checkLocal(report);
  requireCheck(migrationPlan() === file, 'Migrationsplan hat sich geändert.');
  const source = readFileSync(join(root,'supabase/migrations',file),'utf8');
  requireCheck(createHash('sha256').update(source).digest('hex') === approvedHash,
    'Migration wurde seit der Freigabe verändert.');
  // Execute only the approved bytes through the verified container socket.
  // Record the migration in the same transaction as its DDL.
  const version = file.slice(0,14);
  const name = file.slice(15,-4);
  sql(`begin;
    set local lock_timeout = '5s';
    lock table supabase_migrations.schema_migrations in exclusive mode;
    do $guard$
    begin
      if (select array_agg(version::text order by version) from supabase_migrations.schema_migrations)
           is distinct from array['${requiredHistory.join("','")}']::text[]
        or not exists (select 1 from public.teas where id='${fixture}'
          and brand='UC02 Fixture' and name='Synthetic Black Tea' and origin='curated')
      then raise exception 'Local migration prerequisites changed';
      end if;
    end $guard$;
    ${source}
    insert into supabase_migrations.schema_migrations(version,name,statements)
      values ('${version}','${name}',array[$approved$${source}$approved$]);
    commit;`);
  requireCheck(migrationPlan() === null, 'Migration konnte nicht anhand der Historie bestätigt werden.');
  report.pass('Lokale Migration · ' + file);
}

export function parseAction(args) {
  const words = args.map(arg => arg.toLowerCase());
  if (!words.length || words.join(' ') === 'status') return 'status';
  if (words.join(' ') === 'verify') return 'verify';
  if (words.join(' ') === 'verify --integration') return 'integration';
  if (words.join(' ') === 'build') return 'build';
  if (words.join(' ') === 'migrate local') return 'migrate';
  throw new Stop('Aufruf: status | verify [--integration] | build | migrate local');
}

export async function run(args, { gitCheck = checkGit, localCheck = checkLocal, inputCheck = checkTrackedExecutionInputs,
  runNpm = npmStep, runExec = exec, runBuild = build, runMigration = migrate, output = console.log } = {}) {
  const lines = ['Fancy a Cuppa V3 · UC02 · lokaler Prüfbericht', new Date().toISOString()];
  const report = { info:message => lines.push(message), pass:message => lines.push('BESTANDEN · ' + message),
    skip:message => lines.push('ÜBERSPRUNGEN · ' + message) };
  let step = 'Aufruf';
  try {
    const action = parseAction(args);
    report.info('Modus ' + action.toUpperCase());
    step = 'Git und Worktree';
    gitCheck(report);
    report.pass(step);
    step = 'Lokale Umgebung';
    const status = await localCheck(report);
    if (action !== 'status') {
      step = 'Ausführbare Skripte und Konfiguration';
      inputCheck();
      report.pass(step);
    }
    if (action === 'verify' || action === 'integration') {
      step = 'Automatisierte Tests';
      runNpm(report,['test'],step);
      step = 'Safety-Check';
      runNpm(report,['run','check:safety'],step);
      if (action === 'integration') {
        step = 'Lokale Integrationstests';
        gitCheck(report);
        await localCheck(report);
        runExec(process.execPath, [join(root,'scripts/verify-community-tea-local.mjs')],
          { cwd:mainCheckout, timeout:180000, extraEnv:supabaseEnv });
        report.pass(step);
      } else report.skip('Integration · separat mit verify --integration starten. Diese Prüfung legt lokale Testdaten an.');
    } else if (action === 'build') {
      step = 'Fancy-Test-Build';
      await runBuild(report,status);
      report.info('Manuell: Fancy Test in Xcode öffnen und mit dem vorhandenen Team starten.');
    } else if (action === 'migrate') {
      step = 'Lokale Migration';
      await runMigration(report);
    } else {
      report.skip('Tests, Build und Migration · separat starten');
    }
    return 0;
  } catch (error) {
    lines.push('FEHLGESCHLAGEN · ' + step + ' · ' + (error instanceof Stop ? error.message :
      'Umgebung fehlt, ist ungültig oder liefert kein erwartetes Ergebnis.'));
    lines.push('Manuell: Den genannten Prüfschritt klären und den Runner erneut starten.');
    return 1;
  } finally {
    output(lines.join('\n'));
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await run(process.argv.slice(2));
}
