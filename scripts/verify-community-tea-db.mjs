import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.FAC_PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table teas(
 id uuid primary key default gen_random_uuid(), brand text, name text, category text, leaf_style text,
 status text, subcategory text, subcategory_other text, updated_at timestamptz
);
create table tea_preparations(
 tea_id uuid primary key references teas, brew_seconds integer, water_temp_c integer,
 dose_teaspoons numeric, dose_grams numeric, dose_bags numeric, dose_measures numeric,
 dose_water_ml integer, updated_at timestamptz
);
create table tea_codes(tea_id uuid not null references teas, code_type text, code_value text, unique(code_type,code_value));
create table tea_write_limits(client_hash text, day date, write_count integer, primary key (client_hash,day));
grant select,insert,update on teas,tea_preparations,tea_write_limits to service_role;
grant select,insert on tea_codes to service_role;
insert into teas(id,brand,name,status) values('00000000-0000-4000-8000-000000000001','Tea maker','Assam','published');
`);
await db.exec(readFileSync('supabase/migrations/20261115220827_community_tea_catalog.sql','utf8'));
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
await db.close();
console.log('Isolated PostgreSQL: cutover, permissions, equal names, deduplication, replay, revision conflict, photo rollback and historical snapshot passed.');
