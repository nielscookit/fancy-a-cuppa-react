import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CATEGORY_LABELS, UI_CATEGORY_LABELS, getUiTeaCategory, LEAF_STYLE_LABELS, initialTeaForm,
  validateTeaForm, teaMatches,
} from '../src/features/teaModel.js';
import {
  normalizeTea, listTeas, saveTea,
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

test('write API accepts optional subtypes and preserves leaf style when editing', async () => {
  const original = normalizeTea(cloudRow());
  const form = validateTeaForm(initialTeaForm(original));
  const fetchImpl = async (_url, request) => {
    const body = JSON.parse(request.body);
    assert.equal(body.action, 'update');
    assert.equal(body.write_version, 3);
    assert.equal(body.subcategory, form.subcategory);
    assert.equal(body.leaf_style, original.leafStyle);
    return {ok:true, json:async () => ({updated:true})};
  };
  assert.deepEqual(await saveTea({...form, original}, {fetchImpl}), {updated:true});
});

test('write API creates a tea without a subtype and rejects changes to hidden metadata', async () => {
  const form = validateTeaForm({...initialTeaForm(), name:'Test', brand:'Test', leafStyle:'powder'});
  const fetchImpl = async (_url, request) => {
    const body = JSON.parse(request.body);
    assert.equal(body.action, 'create');
    assert.equal(body.subcategory, null);
    assert.equal(body.leaf_style, 'powder');
    return {ok:true, json:async () => ({id:'test'})};
  };
  assert.deepEqual(await saveTea(form, {fetchImpl}), {id:'test'});
  await assert.rejects(saveTea({...form, photoUrl:'https://example.org/new.jpg'}, {
    fetchImpl:() => assert.fail('Unexpected database write'),
  }), /cannot be changed here/);
});

test('editor exposes the ten approved fields and retains the guarded write path',()=>{
  const ui=readFileSync('src/components/TeaEditor.jsx','utf8');
  assert.deepEqual([...ui.matchAll(/<Field label="([^"]+)"/g)].map(match=>match[1]), [
    'Tea name','Manufacturer','Category','Tea subtype (optional)','Leaf style (optional)',
    'Reference quantity','Dosage unit','Reference water (ml)','Brewing time (minutes)',
    'Temperature (°C, optional)',
  ]);
  assert.match(ui,/initialTeaForm\(tea\)/);
  assert.match(ui,/payload.original=tea/);
  assert.match(ui,/validateTeaForm/);
  assert.match(ui,/createTea/);
  assert.match(ui,/updateTea/);
  assert.doesNotMatch(ui,/service_role|SUPABASE_SERVICE_ROLE_KEY/);
});

test('tea editor offers exactly the six approved categories',()=>{
  assert.deepEqual(Object.entries(UI_CATEGORY_LABELS),[
    ['black','Black Tea'],
    ['green','Green Tea'],
    ['fruit','Fruit'],
    ['herbal','Herbal'],
    ['rooibos','Rooibos'],
    ['other','Other'],
  ]);
  assert.equal(Object.keys(CATEGORY_LABELS).length,12,
    'Retain the twelve Supabase enum keys for backwards-compatible reading');
  const editor=readFileSync('src/components/TeaEditor.jsx','utf8');
  assert.match(editor,/const cats=options\(UI_CATEGORY_LABELS\)/);
  assert.doesNotMatch(editor,/const cats=options\(CATEGORY_LABELS\)/);
  for(const legacy of ['white','oolong','yellow','dark','pu_erh','mate']){
    assert.ok(!(legacy in UI_CATEGORY_LABELS),
      'No extra category choices in Add/Edit Tea: '+legacy);
  }
});

test('all six non-selected Supabase keys are represented under Other in the UI',()=>{
  for (const category of ['white','oolong','yellow','dark','pu_erh','mate']) {
    assert.equal(getUiTeaCategory(category),'other');
    const tea=normalizeTea(cloudRow(77,{category}));
    assert.ok(teaMatches(tea,'Other'), 'Other search must include '+category);
    assert.ok(teaMatches(tea,category), 'Underlying category remains searchable');
    assert.equal(tea.category,category, 'Reading must not rewrite Supabase data');
    assert.equal(initialTeaForm(tea).category,category, 'Editing retains original raw category');
  }
  for (const category of Object.keys(UI_CATEGORY_LABELS)) {
    assert.equal(getUiTeaCategory(category),category);
  }
  assert.equal(getUiTeaCategory('unrecognised'),'other');
  assert.equal(getUiTeaCategory(null),'other');
});

test('Tea Card and Edit dropdown use Other for legacy categories but retain raw form data',()=>{
  const card=readFileSync('src/components/TeaCard.jsx','utf8');
  const editor=readFileSync('src/components/TeaEditor.jsx','utf8');
  assert.match(card,/const uiCategory=getUiTeaCategory\(tea.category\)/);
  assert.match(card,/CATEGORY_ENGLISH\[uiCategory\]/);
  assert.match(card,/getCategoryVisual\(uiCategory\)/);
  assert.match(editor,/value=\{getUiTeaCategory\(form.category\)\}/);
  assert.match(editor,/const next=initialTeaForm\(tea\)/);
  assert.doesNotMatch(editor,/form.category=getUiTeaCategory/);
});
