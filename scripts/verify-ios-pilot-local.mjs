import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { assertLocalDocker, sql, container } from './community-tea-local.mjs';

// This test expects a dedicated, already migrated local pilot sandbox.
assertLocalDocker();
const status = execFileSync('supabase', ['status', '-o', 'env'], { encoding:'utf8', stdio:['ignore','pipe','pipe'] });
const env = Object.fromEntries([...status.matchAll(/^(\w+)="([^"\n]*)"$/gm)].map(([,k,v]) => [k,v]));
const api = new URL(env.API_URL || env.SUPABASE_URL);
assert.ok(['127.0.0.1','localhost'].includes(api.hostname));
const db = new URL(env.DB_URL);
assert.ok(['127.0.0.1','localhost'].includes(db.hostname) && db.pathname === '/postgres');
assert.ok(execFileSync('docker',['port',container,'5432/tcp'],{encoding:'utf8'}).trim().split('\n').some(line=>line.endsWith(':'+db.port)));
assert.equal(sql("select brand from teas where id='00000000-0000-4000-8000-000000000001'"),'UC02 Fixture');
assert.equal(sql("select to_regprocedure('public.community_tea_pilot_save(jsonb,text)') is not null"),'t');
const token = randomBytes(32).toString('hex');
const hash = createHash('sha256').update(token).digest('hex');
const installation = randomUUID();
const headers = { apikey:env.ANON_KEY || env.PUBLISHABLE_KEY, 'Content-Type':'application/json' };
if (env.ANON_KEY) headers.Authorization='Bearer '+env.ANON_KEY;
const jpeg = readFileSync(new URL('../tests/fixtures/community-tea-local-photo.b64',import.meta.url),'utf8').trim();
const fixture = '00000000-0000-4000-8000-000000000001';
const data = {brand:'Pilot Fixture',name:'Pilot '+randomUUID(),category:'black',dose_unit:'g',dose_quantity:2,dose_grams:2,dose_water_ml:250,brew_seconds:180};
const send = (body, credential=token, endpoint='community-tea-v4') => fetch(new URL('/functions/v1/'+endpoint,api),{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),
  headers:{...headers,'cf-connecting-ip':'198.18.0.1',...(credential && {'x-fac-pilot-token':credential})},body:JSON.stringify(body),
});
async function expect(response, code) {
  assert.equal(response.status,code,'Unexpected local response status');
  return response.json();
}
async function gallery(id) {
  const photos=await expect(await send({action:'photos',write_version:4,id},null),200);
  for(const image of photos) {
    assert.equal(new URL(image.url).origin,api.origin);
    const response=await fetch(image.url,{redirect:'error'});
    assert.equal(response.status,200);
    const bytes=Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length>0);
    assert.equal(bytes[0],255);
    assert.equal(bytes[1],216);
    // Compare a downloaded backup with an independent signed read. The
    // sanitizer re-encodes uploads, so the original upload bytes can differ.
    const again=await fetch(image.url,{redirect:'error'});
    assert.equal(again.status,200);
    assert.deepEqual(Buffer.from(await again.arrayBuffer()),bytes);
  }
  return photos;
}
sql(`insert into tea_community_private.pilot_installations(id,token_hash) values('${installation}','${hash}')`);
try {
  for(const version of [undefined,3,4]) {
    for(const action of ['create','update']) {
      const response=await send({...data,action,id:fixture,write_version:version,expected_revision:1,save_id:randomUUID()},null,'community-tea');
      assert.ok(!response.ok,'Legacy writes must fail');
    }
  }
  await expect(await send({...data,action:'create',write_version:4,save_id:randomUUID()},null),403);
  const createdData={...data,action:'create',write_version:4,save_id:randomUUID(),photos:[{jpeg},{jpeg},{jpeg}]};
  const created=await expect(await send(createdData),200);
  assert.equal((await expect(await send(createdData),200)).replayed,true);
  const images=await gallery(created.id);
  assert.equal(images.length,3);
  const unsigned=await fetch(new URL('/storage/v1/object/community-tea-photos/'+images[0].key,api),{headers,redirect:'error'});
  assert.ok(!unsigned.ok);
  const edit={...data,name:'Changed '+randomUUID(),action:'update_barcode',id:fixture,write_version:4,expected_revision:1,save_id:randomUUID(),
    previous_code_type:null,previous_code_value:null,code_type:'ean_8',code_value:'96385074',photos:[{jpeg}]};
  assert.equal((await expect(await send(edit),200)).revision,2);
  assert.equal((await gallery(fixture)).length,1);
  assert.equal(sql(`select origin||':'||revision from teas where id='${fixture}'`),'curated:2');
  assert.equal(sql(`select snapshot->'tea'->>'brand' from tea_community_private.tea_edit_history where tea_id='${fixture}' and revision=1`),'UC02 Fixture');
  assert.equal(sql(`select count(*) from tea_community_private.pilot_edit_audit where tea_id='${fixture}'`),'1');
  await expect(await send({...edit,save_id:randomUUID()}),409);
  await expect(await send({...createdData,save_id:randomUUID(),code_type:'ean_8',code_value:'96385074'}),409);
  sql(`update tea_community_private.pilot_installations set revoked_at=now() where id='${installation}'`);
  await expect(await send({...createdData,save_id:randomUUID()}),403);
  const catalog=await fetch(new URL('/rest/v1/teas?select=id',api),{headers,redirect:'error'});
  assert.equal(catalog.status,200);
  assert.ok((await catalog.json()).some(row=>row.id===fixture));
  console.log('PASS real local Edge/REST/Storage: legacy denied, authorized ADD/curated EDIT, three uploads, signed downloads, private Storage, replay, conflicts, history and revoked SAVE.');

  // Exercise a database dump and restore in a separate database inside this sandbox.
  const dump=execFileSync('docker',['exec',container,'pg_dump','-U','postgres','-d','postgres','-Fc','-n','public','-n','tea_community_private']);
  const restore='pilot_restore_'+randomBytes(6).toString('hex');
  execFileSync('docker',['exec',container,'createdb','-U','postgres',restore]);
  try {
    execFileSync('docker',['exec',container,'psql','-U','postgres','-d',restore,'-v','ON_ERROR_STOP=1','-c','drop schema public cascade'],{stdio:'pipe'});
    execFileSync('docker',['exec','-i',container,'pg_restore','-U','postgres','-d',restore,'--exit-on-error','--no-owner','--no-privileges'],{input:dump,stdio:['pipe','pipe','pipe']});
    const restored=execFileSync('docker',['exec',container,'psql','-X','-qAt','-U','postgres','-d',restore,'-c',`select origin||':'||revision from public.teas where id='${fixture}'`],{encoding:'utf8'}).trim();
    assert.equal(restored,'curated:2');
    console.log('PASS local database dump restored to a separate database; curated revision preserved.');
  } finally { execFileSync('docker',['exec',container,'dropdb','-U','postgres',restore]); }
} finally {
  sql(`update tea_community_private.pilot_installations set revoked_at=now() where id='${installation}'`);
}
