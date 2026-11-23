import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseRoleSetting } from './verify-pilot-restore.mjs';

// Only the synthetic, networkless fixture container in the restore CI job.
assert.equal(process.env.CI, 'true');
const container='fac-pilot-restore';
const inspect=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
assert.equal(inspect.HostConfig.NetworkMode,'none');
const pg=source=>execFileSync('docker',['exec','-i','-e','PGOPTIONS=-c default_transaction_read_only=off',container,
  'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-'],
  {input:source,encoding:'utf8'}).trim();
assert.equal(pg("select current_setting('server_version_num')::integer/10000;"),'17');
const quote=value=>'"'+value.replaceAll('"','""')+'"';
const expected=[
  ['\\$user','public','extensions'],
  ['postgres','public','auth','extensions'],
  ['auth'],
  ['public','extensions','realtime'],
  ['storage'],
];
const statements=readFileSync('tests/fixtures/pilot-search-paths.sql','utf8').split('\n').filter(line=>line.startsWith('ALTER ROLE'));
assert.equal(statements.length,5);
for(const [index,statement] of statements.entries()) {
  const source=statement.match(/ SET search_path TO (.+);$/)[1];
  const parsed=parseRoleSetting('search_path',source);
  const evaluate=expression=>{
    const result=pg('begin;\n'+['postgres','\\$user','extensions','auth','realtime','storage']
      .map(name=>'create schema if not exists '+quote(name)+';').join('\n')
      +'\nset search_path to '+expression+";\nselect json_build_object('configured',current_setting('search_path'),'resolved',current_schemas(false));\nrollback;");
    return JSON.parse(result);
  };
  const original=evaluate(source);
  const rebuilt=evaluate(parsed.value);
  assert.deepEqual(original.resolved,expected[index],statement);
  assert.deepEqual(rebuilt.resolved,original.resolved,statement);
  console.log('PASS PostgreSQL 17 original and rebuilt '+statement.match(/^ALTER ROLE (\w+)/)[1]
    +' path '+JSON.stringify(original.resolved));
}
