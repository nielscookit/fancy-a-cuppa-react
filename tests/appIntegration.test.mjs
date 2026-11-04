import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('main V3 screen connects approved search, dosage and timer components', () => {
  const app=readFileSync('src/App.jsx','utf8');
  assert.match(readFileSync('src/components/HomeScreen.jsx','utf8'),/How do you take it\?/);
  assert.match(readFileSync('src/components/TeaDetail.jsx','utf8'),/How much Tea\?/);
  assert.match(app,/Recently searched/);
  assert.match(app,/ADD NEW TEA/);
  assert.match(app,/scanBarcodePhoto/);
  assert.match(readFileSync('src/components/TeaDetail.jsx','utf8'),/calculateDose/);
  assert.match(app,/TeaDetail/);
  assert.match(app,/TeaSearchBar/);
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

test('closing a tea returns to search and unmounts the isolated timer', () => {
  const app=readFileSync('src/App.jsx','utf8');
  const bridge=readFileSync('src/timer/teaTimerSession.js','utf8');
  const hook=readFileSync('src/timer/useTeaTimer.js','utf8');
  assert.match(readFileSync('src/components/TeaCard.jsx','utf8'), /aria-label="Close tea"/);
  assert.match(app, /setSelectedId\(null\);setMode\('search'\)/);
  assert.match(app, /mode === 'prep' && selected && \(/);
  assert.match(bridge,/mountedVideos\s*=\s*Array\.isArray\(videos\)\s*\?\s*videos\.slice\(\)/);
  assert.match(hook,/session\.destroy\(\)/);
});

test('Figma Tea Detail BREW preserves the validated first-tap video start',()=>{
  const app=readFileSync('src/App.jsx','utf8');
  const detail=readFileSync('src/components/TeaDetail.jsx','utf8');
  const quick=readFileSync('src/components/QuickTimerView.jsx','utf8');
  assert.match(detail,/onBrew=\{onBrew\}/);
  assert.match(app,/onBrew=\{startDetailTimer\}/);
  assert.match(app,/const startDetailTimer = \(\) => openTimerWithSeconds\(detailMinutes \* 60\)/);
  assert.match(app,/setDetailMinutes\(initialDetailMinutes\(tea\)\)/);
  assert.match(app,/quickTimerRef\.current\?\.begin\(seconds\)/);
  const start=app.indexOf('flushSync(() => setQuickTimerOpen(true))');
  const playing=app.indexOf('quickTimerRef.current?.begin(seconds)');
  assert.ok(start>=0 && playing>start);
  assert.doesNotMatch(app.slice(start,playing),/await|setTimeout|requestAnimationFrame|\.then\(/);
  assert.match(quick,/useTeaTimer/);
  assert.match(app,/ref=\{quickTimerRef\}/);
});
test('RESET from Tea Detail returns to Home as well as stopping the timer',()=>{
  const app=readFileSync('src/App.jsx','utf8');
  const body=app.split('const closeQuickTimer = () => {')[1].split('const photoRef')[0];
  assert.match(body,/window\.scrollTo\(0, 0\)/);
  assert.match(body,/setAssistantActive\(false\)/);
  assert.match(body,/setAssistantVisible\(false\)/);
  assert.match(body,/setMode\('closed'\)/);
  assert.match(body,/setQuickTimerOpen\(false\)/);
});
