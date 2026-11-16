import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { approvedMigration, checkLocal, run, safeTestDiagnostics } from '../scripts/run-uc02-local.mjs';

const id = '00000000-0000-4000-8000-000000000001';
const password = 'private-test-password';
const report = { pass() {} };
function localFixture({ label = 'fancy-a-cuppa-react', origin = 'curated', host = '127.0.0.1', brand = 'UC02 Fixture' } = {}) {
  const calls = [];
  const runExec = (file, args, options) => {
    calls.push([file, args]);
    if (args[0] === 'context') return 'unix:///var/run/docker.sock';
    if (args[0] === 'inspect') {
      return JSON.stringify(args.slice(1).map((name, i) => ({
        Name:'/' + name, State:{ Running:true }, Config:{ Labels:{ 'com.supabase.cli.project':label } },
        NetworkSettings:{ Ports:{ [i ? '8000/tcp' : '5432/tcp']:[{ HostPort:i ? '54321' : '54322' }] } },
      })));
    }
    if (file === 'supabase') {
      assert.deepEqual(args,['status','-o','env']);
      return `DB_URL="postgresql://postgres:${password}@${host}:54322/postgres"\nAPI_URL="http://127.0.0.1:54321"\nANON_KEY="public-local-fixture"`;
    }
    assert.equal(file,'docker');
    assert.equal(args[0],'exec');
    assert.match(options.input,/^begin read only;/);
    assert.match(options.input,/rollback;/);
    return 'UC02 Fixture|Synthetic Black Tea|' + origin;
  };
  const request = async (url, options) => {
    calls.push(['HTTP GET', url]);
    assert.equal(options.redirect, 'error');
    assert.equal(new URL(url).origin, 'http://127.0.0.1:54321');
    return Response.json([{ id, brand, name:'Synthetic Black Tea', origin:'curated' }]);
  };
  return { calls, runExec, request };
}

test('default STATUS uses Git and read-only local probes, and reports to stdout', async () => {
  const fixture = localFixture();
  let report;
  const result = await run([], {
    gitCheck() {},
    localCheck: out => checkLocal(out, fixture),
    inputCheck: assert.fail, runNpm: assert.fail, runExec: assert.fail,
    runBuild: assert.fail, runMigration: assert.fail, output: value => report = value,
  });
  assert.equal(result,0);
  assert.deepEqual(fixture.calls.map(([tool,args]) => [tool, Array.isArray(args) ? args[0] : 'fixture']),
    [['docker','context'],['docker','inspect'],['supabase','status'],['docker','exec'],['HTTP GET','fixture']]);
  assert.match(report,/BESTANDEN · UC02-Fixture/);
  assert.doesNotMatch(report,new RegExp(password));
});

test('wrong checkout, Docker project, database, or API fixture blocks the build', async () => {
  for (const values of [{ label:'other-project' }, { host:'cloud.example.com' }, { origin:'community' }, { brand:'not the fixture' }]) {
    let report;
    assert.equal(await run(['build'], {
      gitCheck() {}, localCheck: out => checkLocal(out,localFixture(values)),
      inputCheck: assert.fail, runBuild: assert.fail, output: value => report = value,
    }),1);
    assert.match(report,/FEHLGESCHLAGEN · Lokale Umgebung/);
    assert.doesNotMatch(report,new RegExp(password));
  }
  assert.equal(await run(['build'], {
    gitCheck(){ throw new Error(password); }, localCheck:assert.fail, runBuild:assert.fail,
    output(value){ assert.doesNotMatch(value,new RegExp(password)); },
  }),1);
});

test('VERIFY does not run database-writing integration unless expressly selected', async () => {
  const calls = [];
  const options = {
    gitCheck(){ calls.push('git'); }, localCheck(){ calls.push('local'); }, inputCheck(){},
    runNpm(_out,args){ calls.push(args.join(' ')); }, runExec(){ calls.push('integration'); },
    runBuild: assert.fail, runMigration: assert.fail, output(){},
  };
  assert.equal(await run(['verify'],options),0);
  assert.deepEqual(calls.splice(0),['git','local','test','run check:safety']);
  assert.equal(await run(['verify','--integration'],options),0);
  assert.deepEqual(calls,['git','local','test','run check:safety','git','local','integration']);
});

test('migration plan only accepts the exact approved bytes after the two prerequisites', () => {
  const versions = ['20261110165850','20261115220827'];
  const file = '20261116122401_community_tea_barcode_update.sql';
  const names = [...versions.map(version => version + '_baseline.sql'),file];
  const load = () => readFileSync('supabase/migrations/' + file);
  assert.equal(approvedMigration(versions,names,load),file);
  assert.equal(approvedMigration([...versions,file.slice(0,14)],names,assert.fail),null);
  assert.throws(() => approvedMigration(versions,names,()=>'unapproved SQL'),/nicht freigegeben/);
  assert.throws(() => approvedMigration(versions,[...names,'20261117000000_other.sql'],assert.fail),/nicht freigegeben/);
  assert.throws(() => approvedMigration(versions.slice(1),names,assert.fail),/nicht eindeutig/);
});

test('npm test reports the assertion location without copying secret values', () => {
  const report = safeTestDiagnostics([
    'not ok 1 - rejected value password=secret-fixture',
    '  location: file:///checkout/tests/nativeLiveActivityPrototype.test.mjs:32:12',
    '  code: ERR_ASSERTION',
    '  operator: strictEqual',
    '  expected: secret-fixture',
    '  actual: token-fixture',
  ].join('\n'));
  assert.match(report, /AssertionError · tests\/nativeLiveActivityPrototype\.test\.mjs:32:12 · strictEqual/);
  assert.doesNotMatch(report, /secret-fixture|token-fixture|password/);
});
