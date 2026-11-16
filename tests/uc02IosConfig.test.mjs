import assert from 'node:assert/strict';
import test from 'node:test';
import { readUc02Config } from '../scripts/uc02-ios-config.mjs';
import { supabaseConfig, uc02IosConfig } from '../src/data/supabaseConfig.js';
import { communityTeaV4 } from '../src/data/teaRepository.js';

const testConfig = {
  VITE_COMMUNITY_TEA_V4: 'true',
  FAC_UC02_SUPABASE_URL: 'http://127.0.0.1:54321/',
  FAC_UC02_SUPABASE_PUBLIC_KEY: 'sb_publishable_fixture',
};
const jwt = role => 'header.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.signature';

test('UC02 accepts a simulator or device origin and a public key', () => {
  assert.deepEqual(readUc02Config(testConfig), {
    url: 'http://127.0.0.1:54321', publishableKey: testConfig.FAC_UC02_SUPABASE_PUBLIC_KEY,
  });
  const device = readUc02Config({
    ...testConfig, FAC_UC02_SUPABASE_URL: 'http://192.168.2.5:54321',
    FAC_UC02_SUPABASE_PUBLIC_KEY: jwt('anon'),
  });
  assert.equal(device.url, 'http://192.168.2.5:54321');
});

test('UC02 refuses implicit activation, remote targets and private credentials', () => {
  assert.throws(() => readUc02Config({ ...testConfig, VITE_COMMUNITY_TEA_V4: 'false' }));
  for (const url of [supabaseConfig.url, 'http://8.8.8.8:54321', 'http://192.168.2.5:54321/rest/v1']) {
    assert.throws(() => readUc02Config({ ...testConfig, FAC_UC02_SUPABASE_URL: url }));
  }
  for (const key of [undefined, 'sb_secret_fixture', jwt('service_role'), jwt('authenticated')]) {
    assert.throws(() => readUc02Config({ ...testConfig, FAC_UC02_SUPABASE_PUBLIC_KEY: key }));
  }
});

test('default client has the existing HTTPS endpoint and UC02 is off', () => {
  assert.match(supabaseConfig.url, /^https:\/\/[^/]+\.supabase\.co$/);
  assert.equal(uc02IosConfig, null);
  assert.equal(communityTeaV4, false);
});
