import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CATEGORY_BACKGROUND, CATEGORY_IMAGE_CONFIG, SUPPORTED_TEA_CATEGORIES,
  getCategoryVisual,
} from '../src/features/categoryImages.js';

test('category images are the four approved PNGs with exact Vite asset paths',()=>{
  const expected={
    black:'black-tea.png',
    green:'green-tea.png',
    fruit:'fruit-tea.png',
    herbal:'herbal-tea.png',
  };
  assert.deepEqual(Object.keys(CATEGORY_IMAGE_CONFIG).sort(),Object.keys(expected).sort());
  for(const [category,filename] of Object.entries(expected)){
    const visual=getCategoryVisual(category,'/fancy-a-cuppa-react/');
    assert.equal(visual.kind,'image');
    assert.equal(visual.imageUrl,'/fancy-a-cuppa-react/images/categories/'+filename);
    assert.equal(visual.backgroundColor,'#E8FBCB');
    assert.equal(visual.objectFit,'cover');
    assert.equal(visual.scale,1);
    assert.equal(visual.positionX,50);
    assert.equal(visual.positionY,50);
  }
});

test('all remaining Supabase categories use Soft Lime, no image or symbol',()=>{
  const noPicture=['white','oolong','rooibos','other',
    'yellow','dark','pu_erh','mate'];
  assert.equal(CATEGORY_BACKGROUND,'#E8FBCB');
  assert.equal(SUPPORTED_TEA_CATEGORIES.length,12);
  for(const key of noPicture){
    const visual=getCategoryVisual(key);
    assert.equal(visual.kind,'colour');
    assert.equal(visual.backgroundColor,'#E8FBCB');
    assert.equal(visual.imageUrl,null);
  }
  assert.equal(getCategoryVisual('unknown').imageUrl,null);
});

test('category-specific crop settings are independently editable in one model',()=>{
  for(const key of Object.keys(CATEGORY_IMAGE_CONFIG)){
    const img=CATEGORY_IMAGE_CONFIG[key];
    assert.equal(typeof img.scale,'number');
    assert.equal(typeof img.positionX,'number');
    assert.equal(typeof img.positionY,'number');
    assert.ok(['cover','contain','fill','none','scale-down'].includes(img.objectFit));
    assert.ok(!Object.values(img).some(x=>typeof x==='string' && x.endsWith('.webp')));
  }
  assert.notEqual(CATEGORY_IMAGE_CONFIG.black,CATEGORY_IMAGE_CONFIG.green);
  const model=readFileSync('src/features/categoryImages.js','utf8');
  assert.match(model,/images\/categories\//);
});

test('TeaCard does not render individual product photos or a colour-only symbol',()=>{
  const card=readFileSync('src/components/TeaCard.jsx','utf8');
  const css=readFileSync('src/components/tea-detail.css','utf8');
  assert.match(card,/getCategoryVisual\(tea.category\)/);
  assert.match(card,/showImage && \(/);
  assert.match(card,/setFailedImageUrl\(visual.imageUrl\)/);
  assert.match(card,/visual.positionX/);
  assert.match(card,/visual.positionY/);
  assert.match(card,/visual.scale/);
  assert.doesNotMatch(card,/tea\.photoUrl|tea\.imageUrl|tea-photo-square\.jpg/);
  assert.doesNotMatch(card,/black-tea\.png|fruit-tea\.png|herbal-tea\.png|green-tea\.png/);
  const imageRule=css.split('.fac-tea-card__photo {')[1].split('}')[0];
  assert.doesNotMatch(imageRule,/border-radius|opacity|filter/);
  assert.match(css,/background:\s*#E8FBCB/);
});

test('Tea Editor no longer includes the product photo field',()=>{
  const editor=readFileSync('src/components/TeaEditor.jsx','utf8');
  assert.doesNotMatch(editor,/Photo URL \(optional\)|label="Photo"|label="Foto"/);
  const detailLabels=readFileSync('src/features/teaDetailModel.js','utf8');
  assert.match(detailLabels,/FRUIT INFUSIONS/);
  assert.match(detailLabels,/HERBAL INFUSIONS/);
  assert.match(detailLabels,/OTHER INFUSIONS/);
});
