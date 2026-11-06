import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('search, dosage, editor and scanner remain connected',()=>{
  const app=readFileSync('src/App.jsx','utf8');
  const detail=readFileSync('src/components/TeaDetail.jsx','utf8');
  assert.match(app,/TeaSearchBar/);
  assert.match(app,/TeaEditor/);
  assert.match(app,/TeaDetail/);
  assert.match(app,/scanBarcodePhoto/);
  assert.match(app,/Add New Tea/);
  assert.match(detail,/calculateDose/);
});
test('one sheet: search to detail to search; full close to Home',()=>{
  const app=readFileSync('src/App.jsx','utf8');
  assert.equal((app.match(/<Drawer /g)||[]).length,1);
  assert.match(app,/setMode\('prep'\)/);
  assert.match(app,/setMode\('search'\)/);
  assert.match(app,/setMode\('closed'\)/);
  assert.match(app,/onClose=\{openSearch\}/);
  assert.match(app,/onClick=\{closeSheet\}/);
});
test('pinned teas stored locally and removed from duplicate results',()=>{
  const app=readFileSync('src/App.jsx','utf8');
  const card=readFileSync('src/components/TeaCard.jsx','utf8');
  assert.match(app,/fac-v3-pinned-teas/);
  assert.match(app,/recentIds.filter\(id => !pinnedIds.includes\(id\)\)/);
  assert.match(app,/Last Search/);
  assert.match(app,/Pinned Teas/);
  assert.match(card,/onTogglePin/);
});
test('iPhone timer controller remains mounted and retains gesture start',()=>{
  const app=readFileSync('src/App.jsx','utf8');
  const quick=readFileSync('src/components/QuickTimerView.jsx','utf8');
  assert.match(quick,/useTeaTimer/);
  assert.match(quick,/PHASES\.map/);
  assert.match(app,/flushSync\(\(\) => setQuickTimerOpen\(true\)\)/);
  assert.match(app,/quickTimerRef\.current\?\.begin\(seconds\)/);
  assert.match(app,/onBrew=\{startDetailTimer\}/);
  assert.match(app,/onClose=\{closeQuickTimer\}/);
});
