import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assertLocalDocker, container, sql } from './community-tea-local.mjs';

assertLocalDocker();
const status = execFileSync('supabase', ['status', '-o', 'env'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const endpoints = Object.fromEntries([...status.matchAll(/^(\w+)="([^"\n]*)"$/gm)].map(([, key, value]) => [key, value]));
const dbUrl = new URL(endpoints.DB_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(dbUrl.hostname) || dbUrl.pathname !== '/postgres') {
  throw new Error('The CLI must report a loopback database URL.');
}
const port = execFileSync('docker', ['port', container, '5432/tcp'],
  { encoding: 'utf8' });
if (!port.trim().split('\n').some(line => line.endsWith(':' + dbUrl.port))) {
  throw new Error('The CLI database URL does not match the selected Docker container.');
}
const names = ['teas', 'tea_codes', 'tea_preparations', 'tea_write_limits'];
const count = Number(sql(`select count(*) from unnest(array[${names.map(name => "'public." + name + "'").join(',')}]) name
  where to_regclass(name) is not null;`));
if (count === 0) {
  sql(readFileSync(new URL('../tests/fixtures/community-tea-local-schema.sql', import.meta.url), 'utf8'), { transaction: true });
} else if (count !== names.length) {
  throw new Error('Partial catalogue schema on this container. Inspect it before running setup again.');
}
const sentinel = sql("select count(*) from public.teas where id='00000000-0000-4000-8000-000000000001' and brand='UC02 Fixture';");
if (sentinel !== '1') throw new Error('This container does not contain the UC02 local fixture.');
execFileSync('supabase', ['migration', 'up', '--local'], { stdio: 'inherit' });
if (sql("select origin from public.teas where id='00000000-0000-4000-8000-000000000001';") !== 'curated') {
  throw new Error('The UC02 migration did not classify the local fixture.');
}
console.log('UC02 local catalogue and migration ready.');
