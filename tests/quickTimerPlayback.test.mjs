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
  assert.match(app,/bgcolor:'background\.default'/);
  assert.match(app,/flushSync\(\(\) => setQuickTimerOpen\(true\)\)/);
});

test('RESET only resets; BACK TO HOME is the sole exit action', () => {
  const src=readFileSync('src/components/QuickTimerView.jsx','utf8');
  const app=readFileSync('src/App.jsx','utf8');
  const reset=src.split('const onReset = () => {')[1].split('const onBack = () => {')[0];
  const back=src.split('const onBack = () => {')[1].split('const onRestartStalled = () => {')[0];
  assert.match(reset,/actions\.reset\(\)/);
  assert.doesNotMatch(reset,/onClose/);
  assert.match(back,/actions\.reset\(\)/);
  assert.match(back,/onClose\?\.\(\)/);
  assert.match(src,/onClick=\{onReset\}/);
  assert.match(src,/onClick=\{onBack\}/);
  assert.match(src,/RESTART VIDEO & TIMER/);
  assert.match(src,/onClick=\{actions\.retryMilk\}/);
  assert.match(src,/Brewing · /);
  assert.doesNotMatch(app.split('const closeQuickTimer = () => {')[1].split('const photoRef')[0],/\.reset\(/);
});

test('stage diagnostic is independent of the validated media controller', () => {
  const view=readFileSync('src/components/QuickTimerView.jsx','utf8');
  assert.match(view,/nextVideoProgress/);
  assert.match(view,/videoRefs\.current\[phase\]/);
  assert.match(view,/setPlaybackStalled\(sample\.stalled\)/);
  assert.doesNotMatch(view,/createMediaController\(/);
});
