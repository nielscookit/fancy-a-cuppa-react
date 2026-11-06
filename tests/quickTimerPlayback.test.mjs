import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextVideoProgress, VIDEO_STALL_THRESHOLD_MS } from '../src/features/quickVideoProgress.js';

test('video frame advances prevent false frozen-video reports', () => {
  let state={phase:0,time:0,unchangedMs:0};
  for (let i=1;i<=40;i++) {
    state=nextVideoProgress(state,{phase:i>8?1:0,time:i>8?i-8:i,elapsedMs:1000});
    assert.equal(state.stalled,false);
  }
});

test('stalled video is detected while countdown may continue independently', () => {
  let state={phase:0,time:4.9,unchangedMs:0};
  for(let n=0;n<4;n++) {
    state=nextVideoProgress(state,{phase:0,time:4.9});
    assert.equal(state.stalled,false);
  }
  state=nextVideoProgress(state,{phase:0,time:4.9});
  assert.equal(VIDEO_STALL_THRESHOLD_MS,4500);
  assert.equal(state.stalled,true);
  assert.equal(state.unchangedMs,5000);
  state=nextVideoProgress(state,{phase:1,time:0.1});
  assert.equal(state.stalled,false);
  assert.equal(state.unchangedMs,0);
});

test('QuickTimer overlay remains optically rendered behind Home until activation', () => {
  const css=readFileSync('src/components/quick-timer.css','utf8');
  const home=readFileSync('src/components/home.css','utf8');
  const app=readFileSync('src/App.jsx','utf8');
  assert.match(css,/\.fac-quick-timer\s*\{[\s\S]*?z-index:\s*0/);
  assert.match(css,/\.fac-quick-timer--active\s*\{\s*z-index:\s*1400/);
  assert.doesNotMatch(css,/opacity:\s*0/);
  assert.match(home,/\.fac-home\s*\{\s*position:\s*relative;\s*z-index:\s*1/);
  // The overlay is composited but never exposed behind the long page.
  assert.match(app,/className="fac-app-page"/);
  assert.match(app,/minHeight:\s*'100svh'/);
  assert.match(app,/bgcolor:\s*'background\.default'/);
  const start=app.indexOf('<Box className="fac-app-page"');
  const homeView=app.indexOf('<HomeScreen', start);
  const drawer=app.indexOf('<Drawer anchor="bottom"', homeView);
  const timer=app.indexOf('<QuickTimerView', drawer);
  assert.ok(start >= 0 && homeView > start && drawer > homeView && timer > drawer,
    'Opaque Home layer, bottom Drawer and preloaded timer stay distinct');
  assert.match(app,/flushSync\(\(\) => setQuickTimerOpen\(true\)\)/);
});

test('RESET ends the quick session and returns Home; PAUSE/RESUME is the only other control', () => {
  const src=readFileSync('src/components/QuickTimerView.jsx','utf8');
  const app=readFileSync('src/App.jsx','utf8');
  const reset=src.split('const onReset = () => {')[1].split('const milkMissing')[0];
  assert.match(reset,/actions\.reset\(\);\s*onClose\?\.\(\)/);
  assert.match(src,/onClick=\{onReset\}/);
  assert.match(src,/onClick=\{onPrimary\}/);
  assert.match(src,/const playbackLabel = countdown\.finished \? 'FINISHED'/);
  assert.match(src,/countdown\.running \|\| countdown\.preparing \? 'PAUSE' : 'RESUME'/);
  assert.match(src,/Brewing · /);
  assert.doesNotMatch(src,/onBack|BACK TO HOME|RESTART VIDEO & TIMER|PLAY MILK VIDEO|onRestartStalled/);
  assert.equal((src.match(/<Button\b/g) || []).length, 2,
    'Exactly two buttons on the quick timer page');
  assert.doesNotMatch(app.split('const closeQuickTimer = () => {')[1].split('const photoRef')[0],/\.reset\(/);
  assert.match(app,/setQuickTimerOpen\(false\)/);
});

test('stage diagnostic is independent of the validated media controller', () => {
  const view=readFileSync('src/components/QuickTimerView.jsx','utf8');
  assert.match(view,/nextVideoProgress/);
  assert.match(view,/videoRefs\.current\[phase\]/);
  assert.match(view,/setPlaybackStalled\(sample\.stalled\)/);
  assert.doesNotMatch(view,/createMediaController\(/);
});

test('iOS rubber-band scroll never reveals the preloaded inactive timer', () => {
  const css=readFileSync('src/components/home.css','utf8');
  const timerCss=readFileSync('src/components/quick-timer.css','utf8');
  const app=readFileSync('src/App.jsx','utf8');
  assert.match(css,/html,\s*body\s*\{\s*overscroll-behavior-y:\s*none/);
  const shield=css.split('.fac-viewport-shield {')[1].split('}')[0];
  assert.match(shield,/position:\s*fixed/);
  assert.match(shield,/inset:\s*-200px 0/);
  assert.match(shield,/z-index:\s*1/);
  assert.match(shield,/background-color:\s*#ffffff/);
  assert.match(shield,/pointer-events:\s*none/);

  const page=app.split('<Box className="fac-app-page"')[1].split('}>')[0];
  assert.match(page,/zIndex:\s*2/);
  assert.match(page,/minHeight:\s*'100svh'/);

  const shieldAt=app.indexOf('<Box className="fac-viewport-shield"');
  const pageAt=app.indexOf('<Box className="fac-app-page"');
  const timerAt=app.indexOf('<QuickTimerView',pageAt);
  assert.ok(shieldAt>=0 && pageAt>shieldAt && timerAt>pageAt,
    'The fixed mask, opaque page and pre-mounted timer remain separate siblings');
  assert.match(timerCss,/\.fac-quick-timer\s*\{[\s\S]*?z-index:\s*0/);
  assert.match(timerCss,/\.fac-quick-timer--active\s*\{\s*z-index:\s*1400/);
  assert.doesNotMatch(timerCss,/opacity:\s*0|visibility:\s*hidden/);
});
