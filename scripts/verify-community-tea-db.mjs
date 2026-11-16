import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.FAC_PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
alter role service_role bypassrls;
`);
await db.exec(readFileSync('tests/fixtures/community-tea-local-schema.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261115220827_community_tea_catalog.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261116122401_community_tea_barcode_update.sql','utf8'));
const old = '00000000-0000-4000-8000-000000000001';
const key = 'community/00000000-0000-4000-8000-000000000002.jpg';
const client = 'a'.repeat(64);
let sequence = 0;
const id = () => '00000000-0000-4000-8000-' + String(++sequence).padStart(12,'0');
const base = { brand:'Tea maker', name:'Assam', category:'black', dose_unit:'g', dose_quantity:2,
 dose_grams:2, dose_water_ml:250, brew_seconds:180, write_version:4, request_fingerprint:'b'.repeat(64) };
const call = async (action,data) => (
 await db.query(`select public.${action}_community_tea($1::jsonb,$2) result`,[JSON.stringify(data),client])
).rows[0].result;
await db.exec('set role anon');
await assert.rejects(call('add',{...base,save_id:id()}),/permission denied/);
await db.exec('set role service_role');
assert.equal((await db.query('select origin from teas where id=$1',[old])).rows[0].origin,'curated');
await assert.rejects(call('update',{...base,id:old,save_id:id(),expected_revision:1}),/read-only/);
const initial = {...base, save_id:id(), photo_keys:[key], uploaded_photo_keys:[key],
 code_type:'ean_13', code_value:'0850045678906'};
const created = await call('add',initial);
assert.equal(created.revision,1);
assert.equal((await call('add',initial)).replayed,true);
assert.equal((await db.query('select origin from teas where id=$1',[created.id])).rows[0].origin,'community');
assert.notEqual((await call('add',{...base,save_id:id()})).id,created.id);
await assert.rejects(call('add',{...base,save_id:id(),code_type:'upc_a',code_value:'850045678906'}),/unique/);
await assert.rejects(call('update',{...base,write_version:3,id:created.id}),/revision conflict/);
await assert.rejects(call('update',{...base,save_id:id(),id:created.id,expected_revision:1,
 photo_keys:['community/00000000-0000-4000-8000-000000000003.jpg']}),/Invalid photo reference/);
assert.deepEqual((await db.query('select public.community_tea_photo_keys($1) photos',[created.id])).rows[0].photos,[key]);
const updated=await call('update',{...base,save_id:id(),id:created.id,expected_revision:1,photo_keys:[]});
assert.equal(updated.revision,2);
await assert.rejects(call('update',{...base,save_id:id(),id:created.id,expected_revision:1}),/revision conflict/);
await db.exec('reset role');
const history=(await db.query('select snapshot from tea_community_private.tea_edit_history where tea_id=$1',[created.id])).rows;
assert.equal(history.length,1);
assert.equal(history[0].snapshot.photos[0].object_key,key);
assert.equal(history[0].snapshot.tea.revision,1);
await db.exec('set role service_role');
const owner = await call('add',{...base,save_id:id(),code_type:'upc_a',code_value:'123456789012'});
const missing = await call('add',{...base,save_id:id()});
const barcodeEdit = async data => (await db.query(
  'select public.update_community_tea_barcode($1::jsonb,$2) result',[JSON.stringify(data),client],
)).rows[0].result;
const codes = async tea => (await db.query(
  'select code_type,code_value from tea_codes where tea_id=$1 order by code_type',[tea],
)).rows;
await db.exec('set role anon');
await assert.rejects(barcodeEdit({...base,save_id:id()}),/permission denied/);
await db.exec('set role service_role');
const patch = {...base,id:created.id,expected_revision:2,
  previous_code_type:'ean_13',previous_code_value:'0850045678906'};
await assert.rejects(barcodeEdit({...patch,save_id:id(),id:old,expected_revision:1,
  code_type:'ean_8',code_value:'96385074'}),/read-only/);
await assert.rejects(barcodeEdit({...patch,save_id:id(),code_type:'ean_13',code_value:'0123456789012'}),/unique/);
assert.deepEqual(await codes(created.id),[{code_type:'ean_13',code_value:'0850045678906'}]);
assert.deepEqual(await codes(owner.id),[{code_type:'upc_a',code_value:'123456789012'}]);
await assert.rejects(barcodeEdit({...patch,save_id:id(),code_type:null,code_value:null}),/Invalid barcode/);
await assert.rejects(barcodeEdit({...patch,save_id:id(),previous_code_value:'9999999999999',
  code_type:'ean_8',code_value:'96385074'}),/barcode conflict/);
assert.equal((await db.query('select revision from teas where id=$1',[created.id])).rows[0].revision,2);
const replacement = {...patch, save_id:id(),code_type:'ean_8',code_value:'96385074'};
assert.equal((await barcodeEdit(replacement)).revision,3);
assert.equal((await barcodeEdit(replacement)).replayed,true);
assert.deepEqual(await codes(created.id),[{code_type:'ean_8',code_value:'96385074'}]);
await assert.rejects(barcodeEdit({...replacement,save_id:id()}),/revision conflict/);
assert.equal((await barcodeEdit({...base,save_id:id(),id:missing.id,expected_revision:1,
  previous_code_type:null,previous_code_value:null,code_type:'upc_a',code_value:'850045678906'})).revision,2);
assert.deepEqual(await codes(missing.id),[{code_type:'upc_a',code_value:'850045678906'}]);
await db.exec('reset role');
const previousCode = (await db.query(
  'select snapshot from tea_community_private.tea_edit_history where tea_id=$1 and revision=2',[created.id],
)).rows[0].snapshot.codes[0];
assert.equal(previousCode.code_value,'0850045678906');
console.log('Isolated PostgreSQL: barcode addition, atomic replacement, UPC/EAN conflict rollback, protection, replay and code history passed.');
await db.close();
console.log('Isolated PostgreSQL: cutover, permissions, equal names, deduplication, replay, revision conflict, photo rollback and historical snapshot passed.');
