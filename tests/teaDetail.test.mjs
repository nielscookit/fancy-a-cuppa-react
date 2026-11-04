import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatTeaDetailDose, initialDetailMinutes, CATEGORY_ENGLISH } from '../src/features/teaDetailModel.js';

test('Figma Tea Detail copy maps Supabase categories and units without changing existing data',()=>{
  assert.equal(CATEGORY_ENGLISH.black,'BLACK TEA');
  assert.equal(CATEGORY_ENGLISH.green,'GREEN TEA');
  assert.equal(formatTeaDetailDose(1.5,'tsp'),'1,5 tsp');
  assert.equal(formatTeaDetailDose(2,'bag'),'2 bags');
  assert.equal(formatTeaDetailDose(3.6,'measure'),'3,6 measures');
});
test('Tea Detail initial brewing time follows the selected tea',()=>{
  assert.equal(initialDetailMinutes({brewSeconds:240}),4);
  assert.equal(initialDetailMinutes({brewSeconds:180}),3);
  assert.equal(initialDetailMinutes({brewSeconds:3600}),30);
});
test('Figma static assets are local and each is exactly placed',()=>{
  const fs=readFileSync;
  const card=fs('src/components/TeaCard.jsx','utf8');
  const detail=fs('src/components/TeaDetail.jsx','utf8');
  const search=fs('src/components/TeaSearchBar.jsx','utf8');
  const css=fs('src/components/tea-detail.css','utf8');
  for(const item of ['search','scanner','category','close','edit','tune']){
    const svg=fs('public/figma/tea-'+item+'.svg','utf8');
    assert.match(svg,/<svg/);
    assert.ok(svg.length>100);
  }
  const image=fs('public/figma/tea-photo.jpg');
  assert.ok(image.length>10000);
  assert.equal(image[0],0xff);assert.equal(image[1],0xd8);
  for(const asset of ['tea-close.svg','tea-edit.svg','tea-category.svg','tea-photo.jpg']) assert.ok(card.includes(asset));
  assert.match(search,/tea-search\.svg/);
  assert.match(search,/tea-scanner\.svg/);
  assert.match(detail,/tea-tune\.svg/);
  assert.match(detail,/home-minus\.svg/);
  assert.match(detail,/home-plus\.svg/);
  assert.match(css,/height:\s*286px/);
  assert.match(css,/height:\s*192px/);
  assert.match(css,/border-radius:\s*30px/);
  assert.match(css,/height:\s*52px/);
  assert.match(css,/min-height:\s*307px/);
  assert.match(css,/border-radius:\s*40px 40px 0 0/);
  assert.match(css,/#782b40/);
  assert.match(css,/#eeeeec/);
});
