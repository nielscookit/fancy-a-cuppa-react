import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithOxc } from 'vite';

// Render the actual React editor, using the existing compiler. Effects and writes
// do not run on the server; only the configuration flag is injected for this test.
const require = createRequire(import.meta.url);
const source = readFileSync('src/components/TeaEditor.jsx', 'utf8')
  .replace(/import \{ communityTeaV4[^;]+;/, 'const communityTeaV4 = true;')
  .replace('import.meta.env.BASE_URL', "'/'")
  .replace("'../features/teaModel.js'", JSON.stringify(new URL('../src/features/teaModel.js', import.meta.url).href));
const transformed = await transformWithOxc(source, 'TeaEditor.jsx', { jsx: { runtime:'automatic' } });
const code = transformed.code.replace(/from ["'](react(?:\/jsx-runtime)?|@mui\/material)["']/g,
  (_, name) => 'from ' + JSON.stringify(pathToFileURL(require.resolve(name)).href));
const { default: TeaEditor } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const render = props => renderToStaticMarkup(createElement(TeaEditor, {
  nativeIOS:true, onCancel() {}, onSaved() {}, onScanBarcode() {}, ...props,
}));

test('Fancy Test EMPTY uses barcode-first layout, three units and a 1 MIN editable stepper', () => {
  const html = render();
  assert.match(html, /fac-sheet-editor--uc02/);
  assert.ok(html.indexOf('fac-uc02-barcode') < html.indexOf('Tea Name'));
  for (const label of ['Scan barcode','Manufacturer','Category','Subtype','Leaf style','Quantity','Water (ml)']) {
    assert.ok(html.includes(label), label);
  }
  assert.match(html, /aria-label="Brewing time in minutes"[^>]*min="1"[^>]*max="30"[^>]*value="1"/);
  assert.match(html, /fac-editor-photo-button/);
  assert.match(html, /figma\/uc02-barcode-add\.svg/);
  assert.doesNotMatch(html, />measures<|USE THIS TEA|IDENTIFY TEA/);
  assert.ok(html.indexOf('Temperature') < html.indexOf('fac-editor-time'));
  assert.ok(html.indexOf('CANCEL') < html.indexOf('>SAVE<'));
});

test('Fancy Test PREFILLED renders only supplied photos and reliably labelled values', () => {
  const photo = 'data:image/jpeg;base64,test';
  const html = render({ photos:[photo,photo], prefill:{rawName:'Actual tea',brand:'Actual brand',brewSeconds:240},
    barcode:{type:'ean_8',value:'96385074'} });
  assert.match(html, /value="Actual tea"/);
  assert.match(html, /value="Actual brand"/);
  assert.match(html, /value="96385074"/);
  assert.match(html, /aria-label="Brewing time in minutes"[^>]*value="4"/);
  assert.match(html, /View tea photo 1/);
  assert.match(html, /View tea photo 2/);
  assert.match(html, /Remove tea photo 1/);
  assert.doesNotMatch(html, /View tea photo 3|fac-editor-photo-button/);
});

test('native gallery caps transferred photos at three and offers no fourth photo', () => {
  const html = render({photos:Array(4).fill('data:image/jpeg;base64,test')});
  assert.match(html, /View tea photo 3/);
  assert.doesNotMatch(html, /View tea photo 4|aria-label="Add a tea photo"/);
});

test('Web/PWA retains its existing field order, measure choice and empty brewing time', () => {
  const html = render({nativeIOS:false});
  assert.doesNotMatch(html, /fac-sheet-editor--uc02|fac-editor-time__value/);
  assert.ok(html.indexOf('Tea name') < html.indexOf('Barcode (EAN / UPC)'));
  assert.match(html, />measures<|>measures<\/button>/);
  assert.match(html, /aria-label="Brewing time \(minutes\)"[^>]*value=""/);
});
