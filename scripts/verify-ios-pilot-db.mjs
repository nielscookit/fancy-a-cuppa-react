import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.FAC_PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
`);
const read = path => readFileSync(path, 'utf8');
await db.exec(read('tests/fixtures/community-tea-local-schema.sql'));
const fixture = '00000000-0000-4000-8000-000000000001';
const exportPath = process.env.FAC_PILOT_CATALOG_SNAPSHOT;
if (exportPath) {
  const snapshot = JSON.parse(read(exportPath));
  await db.exec(read('docs/product-images-schema.sql'));
  for (const table of ['teas', 'tea_codes', 'tea_preparations', 'tea_product_images']) {
    const payload = snapshot[table];
    assert.ok(Array.isArray(payload) && payload.length > 0, table);
    await db.query(`insert into public.${table} select * from jsonb_populate_recordset(null::public.${table}, $1::jsonb)`, [JSON.stringify(payload)]);
  }
}
await db.exec('begin;\n' + [
  'supabase/migrations/20261115220827_community_tea_catalog.sql',
  'supabase/migrations/20261116122401_community_tea_barcode_update.sql',
  'supabase/pilot/installation-authority.sql',
].map(read).join('\n') + '\ncommit;');

if (exportPath) {
  const snapshot = JSON.parse(read(exportPath));
  for (const table of ['teas', 'tea_codes', 'tea_preparations', 'tea_product_images']) {
    const restored = await db.query(`select to_jsonb(t) row from public.${table} t`);
    const key = table === 'tea_product_images' ? 'tea_id' : 'id';
    const byId = new Map(restored.rows.map(({ row }) => [row[key], row]));
    for (const row of snapshot[table]) {
      const copy = byId.get(row[key]);
      assert.ok(copy, table);
      if (table === 'teas') {
        assert.equal(copy.origin, 'curated');
        assert.equal(copy.revision, 1);
        delete copy.origin;
        delete copy.revision;
      }
      for (const field of Object.keys(row)) {
        if (typeof row[field] === 'string' && /_at$/.test(field)) {
          assert.equal(Date.parse(copy[field]), Date.parse(row[field]), table + ' ' + field);
        } else assert.deepEqual(copy[field], row[field], table + ' ' + field);
      }
    }
  }
  console.log('Public catalog export restored; IDs, preparation, barcode and image data match after the pilot migrations.');
}

const digest = token => createHash('sha256').update(token).digest('hex');
const hash = digest('1'.repeat(64));
const rotated = digest('2'.repeat(64));
const legacyHash = 'a'.repeat(64);
await db.query('insert into tea_community_private.pilot_installations(token_hash) values($1)', [hash]);
let sequence = 0;
const payload = (action, overrides = {}) => ({
  action, brand:'Pilot testing', name:'Assam', category:'black', dose_unit:'g',
  dose_quantity:2, dose_grams:2, dose_water_ml:250, brew_seconds:180,
  write_version:4, request_fingerprint:'b'.repeat(64),
  save_id:'00000000-0000-4000-8000-' + String(++sequence).padStart(12,'0'),
  ...overrides,
});
const query = async (sql, params) => (await db.query(sql, params)).rows[0]?.result;
const identity = token => query('select public.community_tea_pilot_identity($1) result', [token]);
const save = (data, token = hash) => query('select public.community_tea_pilot_save($1::jsonb,$2) result', [JSON.stringify(data), token]);
const direct = (operation, data, writer = legacyHash) => query(
  `select public.${operation}_community_tea($1::jsonb,$2) result`, [JSON.stringify(data), writer]);

await db.exec('set role anon');
await assert.rejects(save(payload('create')), /permission denied/);
await assert.rejects(identity(hash), /permission denied/);
await assert.rejects(db.query('select * from tea_community_private.pilot_installations'), /permission denied/);
assert.ok((await db.query("select id from teas where status='published'")).rows.length > 0);
await db.exec('set role service_role');

await assert.rejects(save(payload('create'), 'f'.repeat(64)), /Pilot write authorization/);
await assert.rejects(direct('add',payload('create')), /Pilot write authorization/);
const unchanged = (await db.query('select count(*)::integer count from teas')).rows[0].count;
for (const version of [undefined, 3, 4]) {
  await assert.rejects(direct('add',payload('create',{write_version:version})), /Pilot write authorization/);
  await assert.rejects(direct('update',payload('update',{write_version:version,id:fixture,expected_revision:1})), /Pilot write authorization/);
}
assert.equal((await db.query('select count(*)::integer count from teas')).rows[0].count, unchanged);
await assert.rejects(direct('update',payload('update',{id:fixture,expected_revision:1})), /Pilot write authorization/);
const curatedPhoto = 'community/00000000-0000-4000-8000-000000000004.jpg';
const curatedEdit = payload('update_barcode', {id:fixture,expected_revision:1,
  name:'Updated catalog tea',brand:'Updated maker',category:'green',dose_grams:3,dose_quantity:3,
  dose_water_ml:275,brew_seconds:240,water_temp_c:90,
  photo_keys:[curatedPhoto],uploaded_photo_keys:[curatedPhoto],
  previous_code_type:null,previous_code_value:null,code_type:'ean_8',code_value:'96385075'});
assert.equal((await save(curatedEdit)).revision, 2);
assert.equal((await save(curatedEdit)).replayed, true);
assert.deepEqual(await query('select public.community_tea_photo_keys($1) result', [fixture]), [curatedPhoto]);
assert.deepEqual((await db.query('select name,brand,category,origin,revision from teas where id=$1',[fixture])).rows[0],
  {name:'Updated catalog tea',brand:'Updated maker',category:'green',origin:'curated',revision:2});
assert.equal((await db.query('select brew_seconds from tea_preparations where tea_id=$1',[fixture])).rows[0].brew_seconds,240);
assert.equal((await db.query('select code_value from tea_codes where tea_id=$1',[fixture])).rows[0].code_value,'96385075');
await assert.rejects(save(payload('update',{id:fixture,expected_revision:1})), /revision conflict/);
await db.exec('reset role');
assert.equal((await db.query('select snapshot from tea_community_private.tea_edit_history where tea_id=$1',[fixture])).rows[0].snapshot.tea.name,'Synthetic Black Tea');
const audit = (await db.query('select installation_id from tea_community_private.pilot_edit_audit where tea_id=$1',[fixture])).rows;
assert.equal(audit.length,1);
assert.ok(audit[0].installation_id);
await db.exec('set role service_role');

const photo = 'community/00000000-0000-4000-8000-000000000002.jpg';
const create = payload('create', {photo_keys:[photo],uploaded_photo_keys:[photo],code_type:'ean_13',code_value:'0850045678906'});
const created = await save(create);
assert.equal(created.revision, 1);
assert.equal((await save(create)).replayed, true);
assert.deepEqual(await query('select public.community_tea_photo_keys($1) result', [created.id]), [photo]);
const writer = await identity(hash);
await assert.rejects(direct('update', payload('update',{id:created.id,expected_revision:1}),writer), /Pilot write authorization/);
await assert.rejects(query('select public.update_community_tea_barcode($1::jsonb,$2) result', [
  JSON.stringify(payload('update_barcode',{id:created.id,expected_revision:1,previous_code_type:'ean_13',
    previous_code_value:'0850045678906',code_type:'ean_8',code_value:'96385074'})), writer]), /Pilot write authorization/);
const edit = await save(payload('update_barcode', {id:created.id,expected_revision:1,previous_code_type:'ean_13',
  previous_code_value:'0850045678906',code_type:'ean_8',code_value:'96385074'}));
assert.equal(edit.revision, 2);
await assert.rejects(save(payload('update',{id:created.id,expected_revision:1})), /revision conflict/);
await db.exec('reset role');
await db.query('update tea_community_private.pilot_installations set revoked_at=now() where token_hash=$1', [hash]);
await db.exec('set role service_role');
assert.equal(await identity(hash), null);
await assert.rejects(save(create), /Pilot write authorization/);
await assert.rejects(save(payload('update',{id:fixture,expected_revision:2})), /Pilot write authorization/);
await db.exec('reset role');
await db.query('update tea_community_private.pilot_installations set token_hash=$2, revoked_at=null where token_hash=$1', [hash,rotated]);
await db.exec('set role service_role');
assert.equal(await identity(rotated), writer);
assert.equal(await identity(hash), null);
assert.equal((await save(create,rotated)).replayed, true);
console.log('PostgreSQL: public reads, legacy CREATE/EDIT denial, authorization, rotation, revocation, idempotency, curated protection, photos and atomic barcode edits passed.');
await db.close();
