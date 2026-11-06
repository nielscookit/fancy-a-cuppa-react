import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CATEGORY_LABELS, LEAF_STYLE_LABELS, initialTeaForm,
  validateTeaForm, teaMatches,
} from '../src/features/teaModel.js';
import {
  normalizeTea, listTeas, assertLegacyWriteIsSafe, saveTea,
} from '../src/data/teaRepository.js';

const prepared = {
  dose_teaspoons:null,dose_grams:3,dose_bags:null,dose_measures:null,
  dose_water_ml:250,brew_seconds:240,water_temp_c:95,
  instructions:'Steep in freshly boiled water',source_label:'Packaging',
};
function cloudRow(i=1, overrides={}) {
  return {
    id:'id-'+i,brand:'Tea Manufacturer',name:'Tea '+i,
    category:'black',subcategory:null,subcategory_other:null,
    leaf_style:'whole',photo_url:null,tea_codes:[],
    tea_preparations:[prepared],...overrides,
  };
}
test('read model supports all 12 current Supabase categories',()=>{
  const keys=['black','green','white','oolong','yellow','dark','pu_erh',
    'herbal','fruit','rooibos','mate','other'];
  assert.deepEqual(Object.keys(CATEGORY_LABELS).sort(),keys.sort());
  for(const category of keys){
    assert.ok(teaMatches({category,name:'tea',rawName:'tea',type:'loose'},category));
  }
  assert.equal(LEAF_STYLE_LABELS.fannings_dust,'Fannings / dust');
  assert.equal(LEAF_STYLE_LABELS.powder,'Powder');
});

test('normalization preserves optional subtype, leaf style, photo, preparation and barcode',()=>{
  const tea=normalizeTea(cloudRow(1,{
    category:'pu_erh',leaf_style:'ctc',subcategory:null,
    photo_url:'https://example.org/tea.jpg',
    tea_codes:[{code_type:'ean_13',code_value:'4006381333931'}],
  }));
  assert.equal(tea.category,'pu_erh');
  assert.equal(tea.subcategory,null);
  assert.equal(tea.leafStyle,'ctc');
  assert.equal(tea.photoUrl,'https://example.org/tea.jpg');
  assert.equal(tea.instructions,'Steep in freshly boiled water');
  assert.equal(tea.sourceLabel,'Packaging');
  assert.deepEqual(tea.code,{type:'ean_13',value:'4006381333931'});
  assert.ok(teaMatches(tea,'4006381333931'));
  assert.ok(teaMatches(tea,'ctc'));
  assert.ok(teaMatches(tea,'pu erh'));
  assert.equal(normalizeTea(cloudRow(2,{photo_url:'javascript:alert(1)'})).photoUrl,null);
});

test('optional subtype remains blank in the form and is valid in new schema',()=>{
  const tea=normalizeTea(cloudRow(3));
  const initial=initialTeaForm(tea);
  assert.equal(initial.subcategory,'');
  assert.equal(initial.leafStyle,'whole');
  assert.equal(initial.instructions,'Steep in freshly boiled water');
  const payload=validateTeaForm(initial);
  assert.equal(payload.subcategory,null);
  assert.equal(payload.leafStyle,'whole');
  assert.equal(payload.temperature,95);
});

test('search handles German/English categories, leaf forms and mixed terms',()=>{
  const tea=normalizeTea(cloudRow(4,{category:'yellow',leaf_style:'fannings_dust'}));
  assert.ok(teaMatches(tea,'gelber tee fannings'));
  assert.ok(teaMatches(tea,'yellow tea Tea Manufacturer'));
  assert.ok(!teaMatches(tea,'black tea'));
  assert.ok(teaMatches(normalizeTea(cloudRow(5,{category:'fruit'})),'Früchtetee'));
  assert.ok(teaMatches(normalizeTea(cloudRow(6,{category:'mate'})),'Maté'));
});

test('catalogue pagination reads beyond 500 results without inventing missing entries',async()=>{
  const all=Array.from({length:501},(_,i)=>cloudRow(i+1));
  const requests=[];
  const fetchImpl=async url=>{
    requests.push(url);
    const u=new URL(url);
    const offset=Number(u.searchParams.get('offset'));
    const limit=Number(u.searchParams.get('limit'));
    assert.equal(limit,500);
    assert.match(u.searchParams.get('select'),/leaf_style,photo_url,tea_codes/);
    return {ok:true,json:async()=>all.slice(offset,offset+limit)};
  };
  const teas=await listTeas({fetchImpl});
  assert.equal(teas.length,501);
  assert.equal(requests.length,2);
  assert.match(requests[0],/offset=0/);
  assert.match(requests[1],/offset=500/);
});

test('legacy RPC guard blocks edits that would overwrite existing leaf style',()=>{
  const original=normalizeTea(cloudRow());
  const form={...validateTeaForm(initialTeaForm(original)),original};
  assert.throws(()=>assertLegacyWriteIsSafe(form),/database write API/);
  assert.throws(()=>assertLegacyWriteIsSafe({...form,subcategory:'Assam'}),/database write API/);
  const safeOriginal={...original,subcategory:'Assam',leafStyle:'other'};
  const safe=validateTeaForm(initialTeaForm(safeOriginal));
  assert.equal(assertLegacyWriteIsSafe({...safe,original:safeOriginal}),true);
});

test('legacy API rejects new categories, missing subtype and new photo without network write',async()=>{
  const initial=initialTeaForm();
  const working={...initial,name:'Test',brand:'Test',
    subcategory:'Assam',leafStyle:'whole'};
  let called=false;
  const forbidden=[
    {...working,category:'yellow'},
    {...working,subcategory:''},
    {...working,photoUrl:'https://example.org/new.jpg'},
    {...working,leafStyle:'powder'},
  ];
  for(const item of forbidden){
    await assert.rejects(saveTea(validateTeaForm(item),{
      fetchImpl:()=>{called=true;throw Error('Unexpected database write');},
    }),/database write API/);
  }
  assert.equal(called,false);
});

test('new editor exposes all schema fields but does not directly modify database',()=>{
  const ui=readFileSync('src/components/TeaEditor.jsx','utf8');
  for(const field of ['Category','Tea subtype (optional)','Leaf style (optional)',
    'Photo URL (optional)','Preparation instructions (optional)',
    'Preparation source (optional)','Barcode type (optional)','Barcode value']){
    assert.ok(ui.includes(field),field);
  }
  assert.match(ui,/validateTeaForm/);
  assert.match(ui,/createTea/);
  assert.match(ui,/updateTea/);
  assert.doesNotMatch(ui,/service_role|SUPABASE_SERVICE_ROLE_KEY/);
});
