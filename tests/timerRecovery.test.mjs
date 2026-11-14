import test from 'node:test';
import assert from 'node:assert/strict';
import {createTimerController} from '../src/timer/timerController.js';
import {readTimerSession,persistTimerSession} from '../src/timer/timerPersistence.js';
function harness(saved) {
 let clock=100000, persisted, sound=0;
 const media={pause(){},restore(){},reset(){},destroy(){},finish(){},milk(){},unlock(){},resume(){},start(){}};
 const audio={reset(){},unlock(){},playAlmost(){},playFinished(){sound++;return Promise.resolve()},destroy(){}};
 const timer=createTimerController({media,audio,now:()=>clock,onPersist:s=>persisted=s,
 scheduler:{setInterval:()=>1,clearInterval(){}},documentRef:null,navigatorRef:null});
 if(saved) timer.restore(saved);
 return {timer,setClock:v=>clock=v,get persisted(){return persisted},get sound(){return sound}};
}
test('running reload retains original deadline, including preload time',()=>{
 const h=harness({status:'running',total:60,remaining:60,deadline:140000});
 assert.equal(h.timer.state().remaining,40);
 h.setClock(110000);h.timer.tick();assert.equal(h.timer.state().remaining,30);
 assert.equal(h.persisted.deadline,140000);
});
test('paused reload stays paused and resume creates a new deadline',()=>{
 const h=harness({status:'paused',total:60,remaining:23,deadline:null});
 h.setClock(200000);h.timer.tick();assert.equal(h.timer.state().remaining,23);
 assert.equal(h.timer.state().running,false);
 h.timer.start();assert.equal(h.persisted.deadline,223000);
});
test('expired and finished recovery never replay an old alarm',()=>{
 for(const status of ['running','finished']){
 const h=harness({status,total:60,remaining:0,deadline:90000});
 assert.equal(h.timer.state().finished,true);assert.equal(h.sound,0);
 }
});
test('reset clears persisted session and destroy does not persist a false pause',()=>{
 const h=harness({status:'running',total:60,remaining:60,deadline:140000});
 h.timer.destroy();assert.equal(h.persisted.running,true);
 const other=harness({status:'paused',total:60,remaining:20});other.timer.reset();
 let item='old'; const storage={getItem:()=>item,setItem:(_,v)=>item=v,removeItem:()=>item=null};
 persistTimerSession(storage,'test',other.persisted);assert.equal(item,null);
});
test('corrupt or unavailable storage cannot break timer recovery',()=>{
 for(const raw of ['bad','{}','null',JSON.stringify({version:1,status:'running',total:60,remaining:60,deadline:'bad'})])
 assert.equal(readTimerSession({getItem:()=>raw},'x'),null);
 assert.doesNotThrow(()=>persistTimerSession({getItem(){throw Error()}},'x',{running:true,total:60,remaining:60}));
});

test('native Home restores persisted states without waiting on video metadata', async () => {
  const { createTeaTimerSession } = await import('../src/timer/teaTimerSession.js');
  for (const [status, remaining, deadline, expected] of [
    ['none', 60, null, 'none'],
    ['running', 60, Date.now() + 40000, 'running'],
    ['paused', 23, null, 'paused'],
    ['finished', 0, null, 'finished'],
    ['running', 60, Date.now() - 1000, 'finished'],
    ['paused', 60, null, 'none'],
  ]) {
    const restored = [];
    const session = createTeaTimerSession({
      videos: [{}, {}, {}, {}], assetBase: './media/', storageKey: 'timer',
      storage: { getItem: () => status === 'none' ? null
        : JSON.stringify({ version: 1, status, total: 60, remaining, deadline }) },
      factories: {
        audio: () => ({ destroy() {} }),
        media: () => ({
          preloadAll: () => assert.fail('Native recovery must not wait for metadata'),
          preloadForStart: async diagnosis => {
            assert.equal(diagnosis.storedStatus, status);
            assert.equal(diagnosis.restoreStatus, expected);
          },
        }),
        timer: () => ({ restore: state => restored.push(state), destroy() {} }),
      },
    });
    assert.equal(await session.prefetch(), true);
    assert.equal(session.getSnapshot().preload, 'ready');
    assert.deepEqual(restored.map(state => state.status), expected === 'none' ? [] : [status]);
    session.destroy();
  }
});

function lifecycleHarness(resetOnBackgroundExpiry = true) {
  let clock = 100_000;
  let item = null;
  const calls = [];
  const documentRef = new EventTarget();
  documentRef.hidden = false;
  const storage = {
    getItem: () => item,
    setItem: (_, value) => { item = value; },
    removeItem: () => { item = null; },
  };
  const timer = createTimerController({
    media: {
      start() {}, pause() {}, unlock() {}, resume() {},
      reset() { calls.push('fill idle'); },
      restore(state) { calls.push(state.finished ? 'restore milk' : 'restore active'); },
      milk() { calls.push('milk'); },
      finish() { calls.push('finish'); },
    },
    audio: {
      unlock() {}, playAlmost() {},
      reset() { calls.push('audio reset'); },
      async playFinished() { calls.push('ready'); },
    },
    documentRef,
    navigatorRef: null,
    scheduler: { setInterval: () => 1, clearInterval() {} },
    now: () => clock,
    initialSeconds: 60,
    resetOnBackgroundExpiry,
    onPersist: state => persistTimerSession(storage, 'timer', state),
  });
  return {
    timer, calls,
    setClock: value => { clock = value; },
    get stored() { return readTimerSession(storage, 'timer'); },
    visibility(hidden) {
      documentRef.hidden = hidden;
      documentRef.dispatchEvent(new Event('visibilitychange'));
    },
    foreground() { documentRef.dispatchEvent(new Event('fac:native-foreground')); },
  };
}

test('native expiry returns to idle even if timers and visibility events were suspended', () => {
  const h = lifecycleHarness();
  h.timer.start();
  h.setClock(161_000);
  h.foreground();
  assert.equal(h.timer.state().remaining, 60);
  assert.equal(h.timer.state().finished, false);
  assert.equal(h.timer.state().running, false);
  assert.equal(h.stored, null);
  assert.deepEqual(h.calls, ['fill idle', 'audio reset']);
  h.timer.start();
  assert.equal(h.stored.deadline, 221_000);
});

test('native expiry resets on a hidden tick or when visibility catches up first', () => {
  for (const catchUp of [h => h.timer.tick(), h => h.visibility(false)]) {
    const h = lifecycleHarness();
    h.timer.start();
    h.visibility(true);
    h.setClock(161_000);
    catchUp(h);
    assert.equal(h.stored, null);
    assert.deepEqual(h.calls, ['fill idle', 'audio reset']);
  }
});

test('native foreground preserves running and paused timers and their restorable state', () => {
  const h = lifecycleHarness();
  h.timer.restore({ status: 'running', total: 60, deadline: 160_000 });
  h.setClock(125_000);
  h.foreground();
  assert.equal(h.stored.deadline, 160_000);
  h.timer.pause();
  h.setClock(170_000);
  h.foreground();
  assert.equal(h.stored.status, 'paused');
  assert.equal(h.stored.remaining, 35);
  assert.deepEqual(h.calls, ['restore active']);
});

test('native cold recovery clears expired running and previously finished sessions without restoring milk', () => {
  for (const status of ['running', 'finished']) {
    const h = lifecycleHarness();
    h.timer.restore({ status, total: 90, remaining: 0, deadline: 99_000 });
    assert.equal(h.timer.state().remaining, 90);
    assert.equal(h.stored, null);
    assert.deepEqual(h.calls, ['fill idle', 'audio reset']);
  }
});

test('native foreground finish still plays Ready and Web keeps its existing background finish', () => {
  const native = lifecycleHarness();
  native.timer.start();
  native.setClock(160_000);
  native.timer.tick();
  assert.equal(native.timer.state().finished, true);
  assert.deepEqual(native.calls, ['finish', 'ready']);
  native.foreground();
  assert.deepEqual(native.calls, ['finish', 'ready', 'fill idle', 'audio reset']);

  const web = lifecycleHarness(false);
  web.timer.start();
  web.visibility(true);
  web.setClock(160_000);
  web.foreground();
  web.visibility(false);
  assert.equal(web.timer.state().finished, true);
  assert.deepEqual(web.calls, ['finish']);
});
