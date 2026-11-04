import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeaTimerSession } from '../src/timer/teaTimerSession.js';

function testSession() {
  const events = [];
  let finishPreload;
  let published;
  let timerState = {
    total: 40, remaining: 40, running: false,
    preparing: false, finished: false, warnedThirty: false,
  };
  const factories = {
    audio: () => ({
      destroy: () => events.push('audio-destroy'),
    }),
    media: ({onPhase}) => ({
      preloadAll: () => new Promise(resolve => { finishPreload = resolve; }),
      reset: () => { events.push('video-reset-first-frame'); onPhase(-1); },
      retryMilkPlayback: () => events.push('milk-retry'),
      destroy: () => events.push('media-destroy'),
    }),
    timer: ({onUpdate, media, audio}) => ({
      state: () => timerState,
      start: () => {
        events.push('start-sync');
        timerState = { ...timerState, running: true };
        onUpdate(timerState);
      },
      pause: () => {
        events.push('pause');
        timerState = { ...timerState, running: false };
        onUpdate(timerState);
      },
      reset: () => {
        media.reset();
        timerState = { ...timerState, running: false, remaining: timerState.total };
        onUpdate(timerState);
      },
      setSeconds: value => {
        events.push('seconds:' + value);
        timerState = { ...timerState, total: value, remaining: value };
        onUpdate(timerState);
      },
      destroy: () => {
        events.push('timer-destroy');
        media.destroy();
        audio.destroy();
      },
    }),
  };
  const session = createTeaTimerSession({
    videos: [{}, {}, {}, {}],
    assetBase: '/fancy-a-cuppa-react/media/',
    initialSeconds: 40,
    factories,
    onChange: value => { published = value; },
  });
  return { session, events, finishPreload: () => finishPreload(), getPublished: () => published };
}

test('React integration boundary waits for every preloaded video before first start', async () => {
  const h = testSession();
  const task = h.session.prefetch();
  assert.equal(h.session.getSnapshot().preload, 'loading');
  assert.equal(h.session.start(), false);
  assert.ok(!h.events.includes('start-sync'));
  h.finishPreload();
  assert.equal(await task, true);
  assert.equal(h.session.getSnapshot().preload, 'ready');
  assert.equal(h.session.start(), true);
  assert.equal(h.events.at(-1), 'start-sync');
  assert.equal(h.getPublished().countdown.running, true);
  h.session.destroy();
});

test('tap action pauses, resets first frame and updates time without UI dependencies', async () => {
  const h = testSession();
  const load = h.session.prefetch();
  h.finishPreload();
  await load;
  assert.equal(h.session.toggle(), true);
  assert.equal(h.session.toggle(), true);
  assert.ok(h.events.includes('pause'));
  h.session.setSeconds(120);
  assert.equal(h.session.getSnapshot().countdown.total, 120);
  h.session.reset();
  assert.equal(h.events.includes('video-reset-first-frame'), true);
  h.session.retryMilk();
  assert.ok(h.events.includes('milk-retry'));
  h.session.destroy();
  assert.deepEqual(h.events.slice(-3), [
    'timer-destroy', 'media-destroy', 'audio-destroy',
  ]);
  assert.equal(h.session.toggle(), false);
});

test('late video prefetch result after React unmount never enables controls', async () => {
  const h = testSession();
  const load = h.session.prefetch();
  h.session.destroy();
  h.finishPreload();
  assert.equal(await load, false);
  assert.equal(h.session.start(), false);
});

test('timer adapter remains isolated from V3 app, shared theme and database', async () => {
  const { readFileSync } = await import('node:fs');
  const adapter = readFileSync('src/timer/useTeaTimer.js', 'utf8');
  const mainApp = readFileSync('src/App.jsx', 'utf8');
  const bridge = readFileSync('src/timer/teaTimerSession.js', 'utf8');
  assert.match(adapter, /from 'react'/);
  assert.match(adapter, /createTeaTimerSession/);
  assert.doesNotMatch(bridge, /from ['"]react['"]/);
  // Restrict this to executable imports/API calls; comments can document
  // that the adapter deliberately does NOT use Supabase or a global theme.
  assert.doesNotMatch(adapter + bridge, /^\\s*import .*?(supabase|createTheme|ThemeProvider)/im);
  assert.doesNotMatch(adapter + bridge, /\\blocalStorage\\s*[.\\[]/);
  assert.doesNotMatch(mainApp, /useTeaTimer|teaTimerSession|timerController/);
});
