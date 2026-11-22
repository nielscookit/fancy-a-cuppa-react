import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = stripTypeScriptTypes(readFileSync('supabase/functions/community-tea/index.ts','utf8')
  .replace(/^import .*\n/, ''));
let handler;
runInNewContext(source,{
  Deno:{
    serve(callback){handler=callback;},
    env:{get(){return undefined;}},
  },
  Response, URL, TextEncoder, crypto:globalThis.crypto,
  fetch(){throw new Error('Unexpected backend call');},
});
const url='https://example.test/functions/v1/community-tea';

for(const origin of ['https://nielscookit.github.io','capacitor://localhost']){
  test('CORS preflight permits '+origin,async()=>{
    const response=await handler(new Request(url,{
      method:'OPTIONS',
      headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'},
    }));
    assert.equal(response.status,204);
    assert.equal(response.headers.get('access-control-allow-origin'),origin);
    assert.equal(response.headers.get('vary'),'Origin');
  });
}
test('unapproved CORS origin remains rejected',async()=>{
  const response=await handler(new Request(url,{
    method:'OPTIONS',headers:{Origin:'https://untrusted.example'},
  }));
  assert.equal(response.status,403);
  assert.notEqual(response.headers.get('access-control-allow-origin'),'https://untrusted.example');
});
test('native POST reaches backend guard without writing',async()=>{
  const response=await handler(new Request(url,{
    method:'POST',headers:{Origin:'capacitor://localhost','Content-Type':'application/json'},
    body:JSON.stringify({action:'update'}),
  }));
  assert.equal(response.status,503); // Mock deliberately has no environment/secrets.
  assert.equal(response.headers.get('access-control-allow-origin'),'capacitor://localhost');
  assert.deepEqual(await response.json(),{error:'Backend unavailable'});
});
test('unapproved POST remains rejected',async()=>{
  const response=await handler(new Request(url,{
    method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},
    body:JSON.stringify({action:'update'}),
  }));
  assert.equal(response.status,403);
  assert.deepEqual(await response.json(),{error:'Origin not allowed'});
});

function mockSave(fetchImpl, overrides = {}) {
  let saveHandler;
  runInNewContext(source, {
    Deno: { serve(callback) { saveHandler = callback; }, env: { get: () => 'https://backend.test' } },
    Response, TextEncoder, crypto: globalThis.crypto,
    fetch: fetchImpl,
    uuid: /^[0-9a-f-]{36}$/,
    photoBucket: 'community-tea-photos',
    readLimitedText: req => req.text(),
    parsePhotos: () => [{ bytes: new Uint8Array([1, 2, 3]) }],
    sanitizePhoto: bytes => bytes,
  });
  return saveHandler(new Request(url, {
    method: 'POST',
    headers: { Origin: 'capacitor://localhost', 'cf-connecting-ip': '203.0.113.1' },
    body: JSON.stringify({
      action: 'update', write_version: 4, expected_revision: 1,
      id: '00000000-0000-4000-8000-000000000001',
      save_id: '00000000-0000-4000-8000-000000000002',
      photos: [{ jpeg: 'test' }],
      photo_keys: ['foreign-file'],
      uploaded_photo_keys: ['foreign-file'],
      ...overrides,
    }),
  }));
}

test('revision conflict removes only staged files, never historic photo objects', async () => {
  const requests = [];
  const response = await mockSave(async (target, options) => {
    requests.push([target, options]);
    if (target.endsWith('/update_community_tea')) {
      const { p_data } = JSON.parse(options.body);
      assert.equal(p_data.photo_keys.length, 1);
      assert.match(p_data.photo_keys[0], /^community\//);
      assert.deepEqual(p_data.photo_keys, p_data.uploaded_photo_keys);
      return Response.json({ message: 'Tea revision conflict' }, { status: 400 });
    }
    return Response.json({});
  });
  assert.equal(response.status, 409);
  const [upload] = requests.filter(([target]) => target.includes('/community/'));
  const deletes = requests.filter(([, options]) => options.method === 'DELETE');
  assert.equal(deletes.length, 1);
  assert.deepEqual(JSON.parse(deletes[0][1].body).prefixes,
    [upload[0].split('/community-tea-photos/')[1]]);
});

test('an ambiguous database response cannot delete photos of a possibly committed save', async () => {
  const requests = [];
  const response = await mockSave(async (target, options) => {
    requests.push(options.method);
    if (target.endsWith('/update_community_tea')) throw new Error('Connection lost');
    return Response.json({});
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /could not be confirmed/);
  assert.ok(!requests.includes('DELETE'));
});

test('local signed photo links use the configured public URL instead of the runtime container address', async () => {
  let photoHandler;
  const path = 'community/00000000-0000-4000-8000-000000000001.jpg';
  const values = {
    SUPABASE_URL: 'http://kong:8000',
    SUPABASE_SERVICE_ROLE_KEY: 'fixture',
    COMMUNITY_TEA_PUBLIC_URL: 'http://127.0.0.1:54321/',
  };
  runInNewContext(source, {
    Deno: { serve(callback) { photoHandler = callback; }, env: { get: key => values[key] } },
    Response, uuid: /^[0-9a-f-]{36}$/, photoBucket: 'community-tea-photos',
    readLimitedText: request => request.text(),
    fetch: async target => {
      assert.match(target, /^http:\/\/kong:8000\//);
      return target.includes('/rpc/')
        ? Response.json([path])
        : Response.json([{ path, signedURL: '/object/sign/community-tea-photos/' + path }]);
    },
  });
  const response = await photoHandler(new Request(url, {
    method: 'POST',
    body: JSON.stringify({ action: 'photos', write_version: 4, id: '00000000-0000-4000-8000-000000000001' }),
  }));
  assert.equal(response.status, 200);
  const [photo] = await response.json();
  assert.match(photo.url, /^http:\/\/127\.0\.0\.1:54321\/storage\/v1\/object\/sign\//);
});

test('barcode edits use the dedicated version-4 RPC and conflicts return 409', async () => {
  const payload = { action: 'update_barcode', photos: undefined, code_type: 'upc_a',
    code_value: '850045678906', previous_code_type: 'ean_8', previous_code_value: '96385074' };
  const response = await mockSave(async (target, options) => {
    assert.match(target, /\/rpc\/update_community_tea_barcode$/);
    const { p_data } = JSON.parse(options.body);
    assert.equal(p_data.expected_revision, 1);
    assert.equal(p_data.previous_code_value, payload.previous_code_value);
    return Response.json({ message: 'duplicate key value violates unique constraint' }, { status: 409 });
  }, payload);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'Product code already exists.' });
  const legacy = await mockSave(() => assert.fail('Old clients may not use barcode edits'),
    { ...payload, write_version: 3 });
  assert.equal(legacy.status, 400);
});

test('the iOS Pilot readiness route defaults to closed and never calls the backend', async () => {
  const response = await handler(new Request(url + '?capabilities=ios-pilot'));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { contract: 'fancy-a-cuppa/uc02-v4', pilotReady: false });
});

test('the iOS Pilot readiness route reports only the explicitly released contract', async () => {
  let pilotHandler;
  runInNewContext(source, {
    Deno: {
      serve(callback) { pilotHandler = callback; },
      env: { get(key) { return key === 'COMMUNITY_TEA_IOS_PILOT_READY' ? 'true' : undefined; } },
    },
    Response, URL,
    fetch() { throw new Error('Readiness must not call RPC or Storage'); },
  });
  const response = await pilotHandler(new Request(url + '?capabilities=ios-pilot'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { contract: 'fancy-a-cuppa/uc02-v4', pilotReady: true });
});
