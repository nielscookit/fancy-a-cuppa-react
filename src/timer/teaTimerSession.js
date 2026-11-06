import { createAudioController } from './audioController.js';
import { createMediaController } from './mediaController.js';
import { createTimerController } from './timerController.js';

/**
 * Reusable, React-independent wiring for the iPhone-validated V3 controllers.
 * The caller supplies 4 mounted <video> elements and a single state subscriber.
 * No DOM layout, Supabase, global theme, or production app code is changed.
 */
export function createTeaTimerSession({
  videos,
  assetBase,
  initialSeconds = 240,
  onChange = () => {},
  factories = {},
}) {
  // React callback refs are set to null during unmount (close tea / switch
  // tea). The media controller must retain the original four DOM nodes for
  // its teardown. Do not pass React's MUTABLE videoRefs.current array itself.
  // Otherwise media.destroy() -> reset() may dereference null and crash the
  // entire app when the selected tea card is closed.
  const stillMedia = !videos;
  const mountedVideos = Array.isArray(videos) ? videos.slice() : videos;
  const makeAudio = factories.audio || createAudioController;
  const makeMedia = factories.media || createMediaController;
  const makeTimer = factories.timer || createTimerController;
  let disposed = false;
  let preload = stillMedia ? 'ready' : 'loading';
  let phase = -1;
  let error = null;
  let countdown = {
    total: initialSeconds, remaining: initialSeconds,
    running: false, preparing: false, finished: false, warnedThirty: false,
  };
  function snapshot() {
    return { countdown: { ...countdown }, preload, phase, error };
  }
  function notify() { if (!disposed) onChange(snapshot()); }
  function reportError(reason) {
    if (disposed) return;
    error = reason instanceof Error ? reason.message : String(reason);
    notify();
  }
  const audio = makeAudio({ assetBase, onError: reportError });
  let media;
  let timer;
  try {
    const noop = () => {};
    media = stillMedia ? {
      start: noop, resume: noop, pause: noop, reset: noop,
      unlock: noop, milk: noop, finish: noop, destroy: noop, retryMilkPlayback: noop,
    } : makeMedia({
      videos: mountedVideos, assetBase,
      onError: reportError,
      onPhase: nextPhase => { phase = nextPhase; notify(); },
    });
    timer = makeTimer({
      media, audio, initialSeconds,
      onError: reportError,
      onUpdate: next => { countdown = next; notify(); },
    });
  } catch (failure) {
    media?.destroy();
    audio.destroy();
    throw failure;
  }

  // This never starts the countdown. It can safely run on mount.
  // All 4 clips must be cached before the first Start tap is enabled.
  function prefetch() {
    if (disposed) return Promise.reject(new Error('Timer session destroyed.'));
    if (preload === 'ready') return Promise.resolve(true);
    preload = 'loading';
    error = null;
    notify();
    return media.preloadAll().then(() => {
      if (disposed) return false;
      preload = 'ready';
      notify();
      return true;
    }).catch(failure => {
      if (disposed) return false;
      preload = 'error';
      reportError(failure);
      return false;
    });
  }

  // Must be invoked directly from the user click/tap, not in an effect or
  // .then() callback, to preserve the iOS media unlock behavior.
  function start() {
    if (disposed || preload !== 'ready') return false;
    timer.start();
    return true;
  }
  function toggle() {
    if (disposed) return false;
    const current = timer.state();
    if (current.running || current.preparing) {
      timer.pause();
      return true;
    }
    return start();
  }
  function reset() {
    if (disposed) return;
    timer.reset(); // Validated behavior: paused fill frame remains visible.
  }
  function setSeconds(value) {
    if (disposed) return;
    timer.setSeconds(value);
  }
  function retryMilk() {
    if (disposed) return;
    media.retryMilkPlayback();
  }
  function destroy() {
    if (disposed) return;
    disposed = true;
    timer.destroy();
  }

  notify();
  return {
    getSnapshot: snapshot,
    prefetch,
    start,
    toggle,
    pause: () => { if (!disposed) timer.pause(); },
    reset,
    setSeconds,
    retryMilk,
    destroy,
  };
}
