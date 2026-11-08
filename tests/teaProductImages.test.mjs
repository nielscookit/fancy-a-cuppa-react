import test from 'node:test';
import assert from 'node:assert/strict';
import {getTeaProductImage,safeImageUrl} from '../src/data/teaProductImages.js';
const id='0f4b0839-4c46-47a6-9fbd-528a539cb1a4';
test('only safe HTTPS image and source URLs are accepted',()=>{
 for(const url of ['javascript:alert(1)','http://example.com/a','data:image/png;base64,a','https://u:p@example.com'])assert.equal(safeImageUrl(url),null);
 assert.equal(safeImageUrl('https://example.com/a'),'https://example.com/a');
});
test('queries only selected projection by tea id; no private notes or keys',async()=>{
 const result=await getTeaProductImage('cloud-'+id,{fetchImpl:async(url,options)=>{
 const u=new URL(url);assert.equal(u.pathname,'/rest/v1/tea_product_images');assert.equal(u.searchParams.get('tea_id'),'eq.'+id);assert.equal(u.searchParams.get('select'),'source_image_url,source_page_url');assert.ok(options.headers.apikey.startsWith('sb_publishable_'));
 return {ok:true,json:async()=>[{source_image_url:'https://example.com/image.jpg',source_page_url:'https://example.com/product'}]};
 }});assert.deepEqual(result,{url:'https://example.com/image.jpg',sourcePage:'https://example.com/product'});
});
test('missing data, unavailable API and invalid IDs fall back without an image',async()=>{
 assert.equal(await getTeaProductImage('local',{fetchImpl:()=>{throw Error('must not fetch')}}),null);
 assert.equal(await getTeaProductImage(id,{fetchImpl:async()=>({ok:false})}),null);
 assert.equal(await getTeaProductImage(id,{fetchImpl:async()=>({ok:true,json:async()=>[]})}),null);
});
