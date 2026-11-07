import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatTeaDetailDose, initialDetailMinutes, CATEGORY_ENGLISH } from '../src/features/teaDetailModel.js';

test('Figma Tea Detail copy maps Supabase categories and units without changing existing data',()=>{
  assert.equal(CATEGORY_ENGLISH.black,'BLACK TEA');
  assert.equal(CATEGORY_ENGLISH.green,'GREEN TEA');
  assert.equal(CATEGORY_ENGLISH.fruit,'FRUIT');
  assert.equal(CATEGORY_ENGLISH.herbal,'HERBAL');
  assert.equal(CATEGORY_ENGLISH.other,'OTHER');
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
  for(const item of ['search','sheet-scanner','category','detail-close','detail-pin','detail-pin-selected','edit','tune']){
    const svg=fs('public/figma/tea-'+item+'.svg','utf8');
    assert.match(svg,/<svg/);
    assert.ok(svg.length>100);
  }
  for(const asset of ['tea-detail-close.svg','tea-detail-pin.svg','tea-detail-pin-selected.svg','tea-edit.svg','tea-category.svg']) assert.ok(card.includes(asset));
  assert.doesNotMatch(card,/tea-photo-square\.jpg|tea\.photoUrl|tea\.imageUrl/);
  assert.match(card,/getCategoryVisual\(uiCategory\)/);
  assert.match(search,/tea-search\.svg/);
  assert.match(search,/tea-sheet-scanner\.svg/);
  assert.match(detail,/tea-tune\.svg/);
  assert.match(detail,/tea-v2-minus\.svg/);
  assert.match(detail,/tea-v2-plus\.svg/);
  assert.match(css,/height:\s*286px/);
  assert.match(css,/height:\s*192px/);
  assert.match(css,/border-radius:\s*30px/);
  assert.match(css,/height:\s*52px/);
  assert.match(css,/min-height:\s*757px/);
  assert.match(css,/border-radius:\s*30px 30px 0 0/);
  assert.match(css,/height:\s*52px; margin:\s*48px 8px 0/);
  assert.match(css,/font-size:\s*34px; font-weight:\s*700; line-height:\s*41px/);
  assert.match(css,/padding:\s*0 8px 48px/);
  for(const name of ['minus','plus']){
    const svg=fs('public/figma/tea-v2-'+name+'.svg','utf8');
    assert.match(svg,/<svg width="66" height="66"/);
  }
  assert.match(css,/#782b40/);
  assert.match(css,/#eeeeec/);
});

test('Figma 123:144 vertical geometry aligns at y=545, 645, 692, 740, 854', () => {
  const css=readFileSync('src/components/tea-detail.css','utf8');
  const container=css.split('.fac-tea-detail {')[1].split('}')[0];
  const card=css.split('.fac-tea-card {')[1].split('}')[0];
  const panel=css.split('.fac-tea-result {')[1].split('}')[0];
  assert.match(container,/background:\s*#fff/);
  assert.match(container,/min-height:\s*757px/);
  assert.match(card,/box-shadow:\s*none/);
  assert.match(panel,/margin-top:\s*48px/);
  assert.doesNotMatch(panel,/border-radius/);
  assert.match(css,/margin:\s*19px 24px 0/);
  assert.match(css,/margin-top:\s*47px/);
  const water=211+286+48;
  const dose=water+52+48;
  const divider=dose+28+19;
  const timer=divider+1+47;
  const brew=timer+66+48;
  assert.deepEqual([water,dose,divider,timer,brew,brew+66+48],
    [545,645,692,740,854,968]);
});

test('Figma 123:144 leaves the photograph bottom edge square (0px)', () => {
  const css = readFileSync('src/components/tea-detail.css', 'utf8');
  const card = css.split('.fac-tea-card {')[1].split('}')[0];
  const image = css.split('.fac-tea-card__image-area {')[1].split('}')[0];
  const photo = css.split('.fac-tea-card__photo {')[1].split('}')[0];
  assert.match(card, /border-radius:\s*30px 30px 0 0/);
  assert.doesNotMatch(image, /border-radius|clip-path/);
  assert.doesNotMatch(photo, /border-radius|clip-path/);
});

