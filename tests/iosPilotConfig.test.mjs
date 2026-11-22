import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { verifyIosPilotBackend } from '../scripts/ios-pilot-config.mjs';
import { supabaseConfig } from '../src/data/supabaseConfig.js';

const ready = { contract: 'fancy-a-cuppa/uc02-v4', pilotReady: true };
const catalog = () => Response.json([{ origin: 'curated', revision: 1 }]);

test('iOS Pilot checks the production catalog and explicit V4 readiness with GET only', async () => {
  const urls = [];
  const result = await verifyIosPilotBackend(async (url, options) => {
    urls.push(url);
    assert.equal(new URL(url).origin, supabaseConfig.url);
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.body, undefined);
    assert.equal(options.headers.apikey, supabaseConfig.publishableKey);
    return url.includes('/rest/') ? catalog() : Response.json(ready);
  });
  assert.deepEqual(result, { ...supabaseConfig, communityFunction: '/functions/v1/community-tea-v4' });
  assert.match(urls[1], /community-tea-v4\?capabilities=ios-pilot$/);
  assert.equal(urls.length, 2);
});

test('iOS Pilot stops for legacy schema, legacy Edge Function, disabled readiness or offline', async () => {
  for (const fetchImpl of [
    async url => url.includes('/rest/') ? Response.json([], { status: 400 }) : Response.json(ready),
    async url => url.includes('/rest/') ? catalog() : new Response(null, { status: 405 }),
    async url => url.includes('/rest/') ? catalog() : Response.json({ ...ready, pilotReady: false }),
    async url => url.includes('/rest/') ? catalog() : Response.json({ ...ready, contract: 'legacy' }),
    async () => { throw new Error('network unavailable'); },
  ]) {
    await assert.rejects(verifyIosPilotBackend(fetchImpl), /iOS Pilot blocked/);
  }
});

test('iOS Pilot Xcode guard binds marked assets to the production Release configuration', () => {
  const project = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
  const phase = project.split('\n').find(line => line.includes('fac-ios-pilot'));
  assert.ok(phase);
  assert.match(phase, /CONFIGURATION.*!= Release/);
  assert.match(phase, /INFOPLIST_FILE.*!= App\/Info\.plist/);
  assert.match(phase, /PRODUCT_BUNDLE_IDENTIFIER.*!= com\.fancyacuppa\.app/);
  assert.match(phase, /fac-uc02-local/);
});

test('iOS Pilot bundle configuration embeds V4 and production settings with the ready contract', async t => {
  const native = (await import('../vite.native.config.js')).default;
  t.mock.method(globalThis, 'fetch', async url => url.includes('/rest/') ? catalog() : Response.json(ready));
  const { plugins } = await native({ mode: 'ios-pilot' });
  const client = plugins.find(plugin => plugin.name === 'fac-uc02-v4-client');
  const id = new URL('../src/data/supabaseConfig.js', import.meta.url).pathname;
  const { code } = client.transform('', id);
  assert.match(code, /uc02IosEnabled = true/);
  assert.ok(code.includes(supabaseConfig.url));
  assert.doesNotMatch(code, /http:|127\.0\.0\.1|fac-uc02-local/);
  assert.equal(plugins.find(plugin => plugin.name === 'fac-ios-pilot-build').transformIndexHtml()[0].attrs.name, 'fac-ios-pilot');

  const regular = await native({ mode: 'native' });
  assert.ok(!regular.plugins.some(plugin => plugin.name === 'fac-uc02-v4-client'));
  assert.equal(globalThis.fetch.mock.callCount(), 2);
});
