import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import {
  DEFAULT_QUICK_MINUTES, MAX_QUICK_MINUTES, MIN_QUICK_MINUTES,
  QUICK_MINUTES_KEY, readQuickMinutes, saveQuickMinutes, stepQuickMinutes,
} from '../src/features/quickTimer.js';

test('quick timer steps and bounds are preserved', () => {
  assert.equal(DEFAULT_QUICK_MINUTES,2);
  assert.equal(stepQuickMinutes(2,1),3);
  assert.equal(stepQuickMinutes(3,-1),2);
  assert.equal(stepQuickMinutes(1,-1),MIN_QUICK_MINUTES);
  assert.equal(stepQuickMinutes(30,1),MAX_QUICK_MINUTES);
});
test('quick timer local storage is V3-only', () => {
  const entries = new Map();
  const storage = {getItem:key=>entries.get(key)||null,setItem:(key,value)=>entries.set(key,value)};
  assert.equal(QUICK_MINUTES_KEY,'fac-v3:quick-timer-minutes');
  assert.equal(readQuickMinutes(storage),2);
  assert.equal(saveQuickMinutes(6,storage),true);
  assert.equal(readQuickMinutes(storage),6);
});
test('Figma Home 152:151 uses approved image and button text',()=>{
  const home=readFileSync('src/components/HomeScreen.jsx','utf8');
  const css=readFileSync('src/components/home.css','utf8');
  assert.match(home,/Fancy a Cuppa/);
  assert.match(home,/How do you take it\?/);
  assert.match(home,/home-tea\.png/);
  assert.ok(statSync('public/images/home-tea.png').size>100000);
  assert.match(css,/aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(css,/top:\s*72px/);
  assert.match(css,/#B9FC69/i);
  assert.match(css,/#1B272B/i);
  assert.match(home,/home-minus\.svg/);
  assert.match(home,/home-plus\.svg/);
});
test('one MUI bottom drawer replaces previous scroll navigation',()=>{
  const app=readFileSync('src/App.jsx','utf8');
  const css=readFileSync('src/components/tea-sheet.css','utf8');
  assert.match(app,/<Drawer anchor="bottom"/);
  assert.match(app,/mode === 'prep' && selected/);
  assert.match(app,/mode === 'search'/);
  assert.match(app,/onClose=\{closeSheet\}/);
  assert.doesNotMatch(app,/animateScrollTo/);
  assert.match(css,/overflow-y:\s*auto/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
});
test('validated timer start remains synchronous in original tap',()=>{
  const app=readFileSync('src/App.jsx','utf8');
  assert.match(app,/<QuickTimerView/);
  const show=app.indexOf('flushSync(() => setQuickTimerOpen(true))');
  const play=app.indexOf('quickTimerRef.current?.begin(seconds)');
  assert.ok(show>=0&&play>show);
  assert.doesNotMatch(app.slice(show,play),/await|\.then\(|setTimeout\(|requestAnimationFrame\(/);
});
test('Figma 66px minus/plus assets are local',()=>{
  for(const icon of ['minus','plus']){
    const svg=readFileSync('public/figma/home-'+icon+'.svg','utf8');
    assert.match(svg,/<svg width="66" height="66"/);
    assert.doesNotMatch(svg,/figma\.com/);
  }
});
