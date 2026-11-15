import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assertLocalDocker, sql } from './community-tea-local.mjs';

assertLocalDocker();
const status = execFileSync('supabase', ['status', '-o', 'env'], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});
const env = Object.fromEntries([...status.matchAll(/^(\w+)="([^"\n]*)"$/gm)].map(([, key, value]) => [key, value]));
const url = new URL(env.API_URL || env.SUPABASE_URL);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && /^https?:$/.test(url.protocol),
  'Only a loopback Supabase API URL is supported.');
const key = env.ANON_KEY || env.PUBLISHABLE_KEY;
assert.ok(key, 'Local Supabase status did not report a public client key.');
const publicHeaders = { apikey: key, ...(env.ANON_KEY && { Authorization: 'Bearer ' + env.ANON_KEY }) };
const editorial = '00000000-0000-4000-8000-000000000001';
assert.equal(sql(`select brand from public.teas where id='${editorial}' and origin='curated';`), 'UC02 Fixture');
const sentinel = await fetch(new URL('/rest/v1/teas?select=id,brand,origin&id=eq.' + editorial,url), { headers: publicHeaders, redirect: 'error' });
assert.equal(sentinel.status, 200, 'The local REST API must be running.');
assert.equal((await sentinel.json())[0]?.brand, 'UC02 Fixture', 'The REST API must expose the local fixture.');

const jpeg = readFileSync(new URL('../tests/fixtures/community-tea-local-photo.b64', import.meta.url), 'utf8').trim();
const run = crypto.randomUUID();
const random = crypto.getRandomValues(new Uint32Array(2));
const ip = '198.18.' + (random[0] % 254 + 1) + '.' + (random[1] % 254 + 1);
const upc = String(random[0]) + String(random[1]).padStart(10, '0');
const code = upc.slice(0, 11);
const check = (10 - [...code].reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 1 : 3), 0) % 10) % 10;
const barcode = code + check;
const base = { brand: 'UC02 Fixture', name: 'Synthetic ' + run, category: 'black',
  dose_unit: 'g', dose_quantity: 2, dose_grams: 2, dose_water_ml: 250, brew_seconds: 180 };
const send = data => fetch(new URL('/functions/v1/community-tea', url), {
  method: 'POST', signal: AbortSignal.timeout(30000), redirect: 'error',
  headers: { ...publicHeaders, 'Content-Type': 'application/json',
    Origin: 'capacitor://localhost', 'cf-connecting-ip': ip },
  body: JSON.stringify({ write_version: 4, save_id: crypto.randomUUID(), ...data }),
});
async function expect(response, expected) {
  const text = await response.text();
  assert.equal(response.status, expected, text);
  return JSON.parse(text);
}
async function gallery(id) {
  const images = await expect(await send({ action: 'photos', id }), 200);
  for (const photo of images) {
    assert.match(photo.key, /^community\/[a-f0-9-]{36}\.jpg$/);
    const imageUrl = new URL(photo.url);
    assert.equal(imageUrl.origin, url.origin, 'Signed URL must stay local.');
    const data = await fetch(imageUrl, { redirect: 'error' });
    assert.equal(data.status, 200);
    assert.match(data.headers.get('content-type'), /image\/jpeg/);
    assert.ok((await data.arrayBuffer()).byteLength > 0);
  }
  return images.map(photo => photo.key);
}
const { id, revision } = await expect(await send({ ...base, action: 'create',
  code_type: 'ean_13', code_value: '0' + barcode, photos: [{ jpeg }, { jpeg }, { jpeg }],
}), 200);
assert.match(id, /^[a-f0-9-]{36}$/);
assert.equal(revision, 1);
const original = await gallery(id);
assert.equal(original.length, 3);
assert.equal(new Set(original).size, 3);
console.log('PASS CREATE and reload three photos through actual Storage signed URLs');

for (const method of ['POST','GET']) {
  const path = method === 'POST' ? 'community/' + run + '.jpg' : original[0];
  const denied = await fetch(new URL('/storage/v1/object/community-tea-photos/' + path, url), {
    method, redirect: 'error', headers: { ...publicHeaders, 'Content-Type': 'image/jpeg' },
    ...(method === 'POST' && { body: Buffer.from(jpeg, 'base64') }),
  });
  assert.ok(!denied.ok, 'Anonymous unsigned Storage access must be rejected: ' + method);
}
console.log('PASS anonymous direct Storage uploads and unsigned reads denied');

const edit = { ...base, action: 'update', id, expected_revision: 1,
  photos: [{ key: original[2] }, { jpeg }, { key: original[0] }] };
assert.equal((await expect(await send(edit), 200)).revision, 2);
const updated = await gallery(id);
assert.equal(updated.length, 3);
assert.equal(updated[0], original[2]);
assert.equal(updated[2], original[0]);
assert.ok(!original.includes(updated[1]));
assert.equal(sql(`select (snapshot->'photos'->1->>'object_key') from tea_community_private.tea_edit_history
 where tea_id='${id}' and revision=1;`), original[1]);
assert.equal(sql(`select count(*) from storage.objects where bucket_id='community-tea-photos' and name='${original[1]}';`), '1');
console.log('PASS EDIT, photo order, replacement and historical image retention');

await expect(await send({ ...base, action: 'update', id: editorial, expected_revision: 1 }), 403);
await expect(await send({ ...base, action: 'create', code_type: 'upc_a', code_value: barcode }), 409);
await expect(await send(edit), 409);
console.log('PASS editorial protection, UPC/EAN uniqueness, and stale revision conflict');

const objectCount = () => sql("select count(*) from storage.objects where bucket_id='community-tea-photos';");
const beforeFailure = objectCount();
// The second input passes base64 and marker checks, then fails JPEG decoding
// after the first image has already been written to actual Storage.
await expect(await send({ ...edit, expected_revision: 2,
  photos: [{ jpeg }, { jpeg: Buffer.from([255, 216, 255, 0, 0]).toString('base64') }],
}), 400);
assert.equal(objectCount(), beforeFailure);
assert.deepEqual(await gallery(id), updated);
console.log('PASS rejected second image rolls back its staged upload and preserves existing photos');

const limit = sql("select file_size_limit from storage.buckets where id='community-tea-photos';");
assert.match(limit, /^\d+$/);
try {
  sql("update storage.buckets set file_size_limit=1 where id='community-tea-photos';");
  const failed = await expect(await send({ ...edit, expected_revision: 2, photos: [{ jpeg }] }), 503);
  assert.match(failed.error, /Photo upload failed/);
} finally {
  sql(`update storage.buckets set file_size_limit=${limit} where id='community-tea-photos';`);
}
assert.equal(objectCount(), beforeFailure);
assert.deepEqual(await gallery(id), updated);
console.log('PASS actual Storage write rejection preserves existing photos and restores the fixture bucket limit');
