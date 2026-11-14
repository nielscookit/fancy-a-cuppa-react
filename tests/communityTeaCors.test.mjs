import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync('supabase/functions/community-tea/index.ts','utf8')
  .replaceAll('body:unknown','body')
  .replace('let data:Record<string,unknown>;','let data;');
let handler;
runInNewContext(source,{
  Deno:{
    serve(callback){handler=callback;},
    env:{get(){return undefined;}},
  },
  Response, TextEncoder, crypto:globalThis.crypto,
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
