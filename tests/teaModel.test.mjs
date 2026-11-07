import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuery, teaMatches, calculateDose, formatDose, initialTeaForm, validateTeaForm, recentTeaIds } from '../src/features/teaModel.js';
import { normalizeBarcode } from '../src/features/scanBarcode.js';
const tea={id:'cloud-1',name:'Tea House · Assam Second Flush',brand:'Tea House',rawName:'Assam Second Flush',category:'black',subcategory:'Assam',type:'loose',qty:6,base:1000,unit:'tsp',brewSeconds:240};
test('keyword search handles translated tea types, umlauts and combined filters',()=>{
  assert.ok(teaMatches(tea,'schwarztee assam'));
  assert.ok(teaMatches(tea,'black tea Assam'));
  assert.ok(teaMatches(tea,'TEA HOUSE'));
  assert.ok(!teaMatches(tea,'green tea'));
  assert.equal(normalizeQuery('Früchtetee'),'fruechtetee');
});
test('reference dosage scales without arbitrary unit conversion',()=>{
  assert.equal(calculateDose(tea,500),3);
  assert.equal(calculateDose(tea,250),1.5);
  assert.equal(formatDose(1.5,'tsp'),'1,5 tsp');
  assert.equal(formatDose(2,'bag'),'2 bags');
});
test('shared V2 form respects exact fields, units and safe numeric validation',()=>{
  const f=initialTeaForm(tea);
  assert.equal(f.mins,'4');
  assert.equal(validateTeaForm(f).base,1000);
  assert.throws(()=>validateTeaForm({...f,unit:'bag'}),/Dosage unit/);
  assert.throws(()=>validateTeaForm({...f,mins:'2.5'}),/whole minutes/);
});
test('recents max five, newest first, unique',()=>{
  assert.deepEqual(recentTeaIds(['a','b','c','d','e'],'c'),['c','a','b','d','e']);
  assert.equal(recentTeaIds(['a','b','c','d','e'],'f').length,5);
});
test('barcode preserves V2 EAN13 normalization',()=>{
  assert.deepEqual(normalizeBarcode({format:'EAN13',text:'0123456789012'}),{type:'upc_a',value:'123456789012'});
  assert.equal(normalizeBarcode({format:'EAN13',text:'invalid'}),null);
});

test('fruit and herbal categories work across English and German queries', () => {
  assert.ok(teaMatches({name:'Beerenmix', category:'fruit',type:'loose'}, 'Früchtetee'));
  assert.ok(teaMatches({name:'Beerenmix', category:'fruit',type:'loose'}, 'fruit tea'));
  assert.ok(teaMatches({name:'Pfefferminz', category:'herbal',type:'loose'}, 'Kräutertee'));
  assert.ok(!teaMatches({name:'Pfefferminz', category:'herbal',type:'loose'}, 'white tea'));
});

test('bag and measure dosage scales with selected vessel size', () => {
  const bag={qty:1,base:250,unit:'bag'};
  assert.equal(calculateDose(bag,500),2);
  assert.equal(formatDose(calculateDose(bag,500),'bag'),'2 bags');
  assert.equal(formatDose(calculateDose({qty:1,base:250,unit:'measure'},900),'measure'),'3,6 measures');
  assert.equal(calculateDose(bag,0),null);
});

test('search matches typed prefixes at the beginning of keywords', () => {
  const tea = { name:'Assam Brahmaputra', brand:'Tea House', category:'black' };
  assert.ok(teaMatches(tea, 'B'));
  assert.ok(teaMatches(tea, 'bra ass'));
  assert.ok(!teaMatches(tea, 'rahma'));
  assert.ok(!teaMatches(tea, 'rba'));
});

test('tea bags use a 250ml cup and round custom amounts up to whole bags', () => {
  const bag = {qty:1, base:200, unit:'bag'};
  for (const [water, count] of [[250,1],[500,2],[1000,4],[900,4],[300,2]]) {
    assert.equal(calculateDose(bag,water),count);
  }
});
