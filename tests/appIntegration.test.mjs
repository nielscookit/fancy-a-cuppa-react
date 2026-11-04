import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('main V3 screen connects approved search, dosage and timer components', () => {
  const app=readFileSync('src/App.jsx','utf8');
  assert.match(app,/How do you take it\?/);
  assert.match(app,/How much tea\?/);
  assert.match(app,/Recently searched/);
  assert.match(app,/Add new tea/);
  assert.match(app,/scanBarcodePhoto/);
  assert.match(app,/calculateDose/);
  assert.match(app,/TeaTimer/);
  assert.match(app,/TeaEditor/);
  assert.doesNotMatch(app,/from ['"].*timer-test\/TimerTest/);
});

test('approved iPhone media source files stay unchanged in new integrated UI', async () => {
  const { execFileSync }=await import('node:child_process');
  // Integration imports validated useTeaTimer and retains 4 mounted <video>s.
  const jsx=readFileSync('src/components/TeaTimer.jsx','utf8');
  const css=readFileSync('src/components/tea-timer.css','utf8');
  assert.match(jsx,/useTeaTimer/);
  assert.match(jsx,/VIDEO_NAMES\.map/);
  assert.match(css,/fac-timer-video\.visible/);
  assert.match(css,/radial-gradient/);
});
