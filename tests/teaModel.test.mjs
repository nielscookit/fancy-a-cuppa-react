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
  assert.equal(formatDose(1.5,'tsp'),'1,5 TL');
  assert.equal(formatDose(2,'bag'),'2 Beutel');
});
test('shared V2 form respects exact fields, units and safe numeric validation',()=>{
  const f=initialTeaForm(tea);
  assert.equal(f.mins,'4');
  assert.equal(validateTeaForm(f).base,1000);
  assert.throws(()=>validateTeaForm({...f,unit:'bag'}),/Einheit/);
  assert.throws(()=>validateTeaForm({...f,mins:'2.5'}),/volle Minuten/);
});
test('recents max five, newest first, unique',()=>{
  assert.deepEqual(recentTeaIds(['a','b','c','d','e'],'c'),['c','a','b','d','e']);
  assert.equal(recentTeaIds(['a','b','c','d','e'],'f').length,5);
});
test('barcode preserves V2 EAN13 normalization',()=>{
  assert.deepEqual(normalizeBarcode({format:'EAN13',text:'0123456789012'}),{type:'upc_a',value:'123456789012'});
  assert.equal(normalizeBarcode({format:'EAN13',text:'invalid'}),null);
});
