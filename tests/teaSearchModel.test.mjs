import test from 'node:test';
import assert from 'node:assert/strict';
import {manufacturerOptions, filterTeaGroups} from '../src/features/teaSearchModel.js';
const teas = [
  {id:'a',rawName:'Kamille',brand:'Meßmer',category:'herbal',keywords:['Abendruhe']},
  {id:'b',rawName:'Kamille Honig',brand:'Twinings',category:'herbal'},
  {id:'c',rawName:'Assam Gold',brand:' Meßmer ',category:'black',subcategory:'Assam'},
  {id:'d',rawName:'Fruit Delight',brand:'TEEKANNE',category:'fruit',type:'bag'},
];
test('manufacturer options are dynamic, unique and content based', () => {
  assert.deepEqual(manufacturerOptions([...teas,{brand:'MESSMER'},{brand:''}]), ['Meßmer','TEEKANNE','Twinings']);
});
test('manufacturer and full text combine with AND for pins and results', () => {
  const options={manufacturer:'Meßmer',query:'KAMIL',pinnedIds:['a','b']};
  const grouped=filterTeaGroups(teas,options);
  assert.deepEqual(grouped.pinned.map(t=>t.id), ['a']);
  assert.deepEqual(grouped.results, []);
  assert.deepEqual(filterTeaGroups(teas,{...options,query:''}).results.map(t=>t.id), ['c']);
  assert.deepEqual(filterTeaGroups(teas,{...options,manufacturer:''}).pinned.map(t=>t.id), ['a','b']);
});
test('category aliases, subtypes, format and stored keywords are searchable', () => {
  for (const query of ['Black Tea','Assam','sam']) {
    assert.deepEqual(filterTeaGroups(teas,{query}).results.map(t=>t.id), ['c']);
  }
  assert.deepEqual(filterTeaGroups(teas,{query:'Fruit'}).results.map(t=>t.id), ['d']);
  assert.deepEqual(filterTeaGroups(teas,{query:'Tea Bag'}).results.map(t=>t.id), ['d']);
  assert.deepEqual(filterTeaGroups(teas,{query:'abend'}).results.map(t=>t.id), ['a']);
  assert.deepEqual(filterTeaGroups(teas,{manufacturer:'Twinings',query:'Assam'}).results, []);
});
test('pinned rows are unique, missing pins ignored and history remains limited to three', () => {
  const grouped=filterTeaGroups(teas,{pinnedIds:['a','a','missing'],recentIds:['a','b','c','d','b']});
  assert.deepEqual(grouped.pinned.map(t=>t.id), ['a']);
  assert.deepEqual(grouped.results.map(t=>t.id), ['b','c','d']);
  assert.deepEqual(grouped.recent.map(t=>t.id), ['b','c','d']);
});
