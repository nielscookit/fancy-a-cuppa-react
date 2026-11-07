import test from 'node:test';
import assert from 'node:assert/strict';
import {getTeaCategoryIcon, TEA_CATEGORY_ICONS} from '../src/features/teaCategoryIcons.js';
import {normalizeTea} from '../src/data/teaRepository.js';
test('five approved categories have distinct Sharp symbols; Other and historic keys use fallback',()=>{
  assert.deepEqual(TEA_CATEGORY_ICONS,{black:'psychiatry',green:'potted_plant',herbal:'local_florist',fruit:'nutrition',rooibos:'spa',other:'category'});
  for(const key of ['white','oolong','yellow','dark','pu_erh','mate','missing',null,'toString','__proto__']) assert.equal(getTeaCategoryIcon(key),'category');
  for(const category of Object.keys(TEA_CATEGORY_ICONS)) {
    const tea=normalizeTea({id:1,name:'Tea',brand:'Brand',category,tea_preparations:[{dose_bags:1,dose_water_ml:250,brew_seconds:240}]});
    assert.equal(tea.category,category);
    assert.equal(getTeaCategoryIcon(tea.category),TEA_CATEGORY_ICONS[category]);
  }
});
