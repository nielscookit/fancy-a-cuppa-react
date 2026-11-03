/**
 * Framework-independent countdown controller.
 * Pure JS state with a Date.now deadline, mirroring V2.
 * UI adapters subscribe through onUpdate; no React imports.
 */
export function createTimerController({
  media,
  audio,
  onUpdate = () => {},
  onError = () => {},
  initialSeconds = 120,
  now = () => Date.now(),
  // Bind calls to globalThis: passing native Window timer methods as
  // object properties and invoking them as methods throws "Illegal invocation".
  // This happened in iPhone Safari after the first immediate tick.
  scheduler = {
    setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
    clearInterval: id => globalThis.clearInterval(id),
  },
  documentRef = globalThis.document,
  navigatorRef = globalThis.navigator,
}) {
  if (!media || !audio) throw new Error('Timer requires media and audio controllers.');
  let total = initialSeconds;
  let remaining = initialSeconds;
  let deadline = 0;
  let running = false;
  let finished = false;
  let warnedThirty = false;
  let ticker = null;
  let wakeLock = null;
  let requestId = 0;
  let destroyed = false;

  function state() {
    return { total, remaining, running, finished, warnedThirty };
  }
  function notify() { if (!destroyed) onUpdate(state()); }
  function clearTicker() {
    if (ticker !== null) {
      scheduler.clearInterval(ticker);
      ticker = null;
    }
  }
  function releaseWakeLock() {
    if (wakeLock) {
      const lock = wakeLock;
      wakeLock = null;
      Promise.resolve(lock.release()).catch(onError);
    }
  }
  async function requestWakeLock() {
    if (!running || documentRef?.hidden || !navigatorRef?.wakeLock) return;
    try {
      const lock = await navigatorRef.wakeLock.request('screen');
      if (running && !destroyed) wakeLock = lock;
      else await lock.release();
    } catch { wakeLock = null; } // Optional API; Safari can reject.
  }
  function stop() {
    requestId++;
    clearTicker();
    running = false;
    releaseWakeLock();
    media.pause();
  }
  function tick() {
    if (!running || destroyed) return;
    remaining = Math.max(0, (deadline - now()) / 1000);
    if (remaining <= 0) {
      clearTicker();
      running = false;
      remaining = 0;
      finished = true;
      releaseWakeLock();
      media.finish();
      notify();
      audio.playFinished().catch(onError);
      return;
    }
    if (remaining <= 5) media.milk();
    if (!warnedThirty && remaining <= 30) {
      warnedThirty = true;
      audio.playAlmost();
    }
    notify();
  }
  function setSeconds(value) {
    if (!Number.isFinite(value) || value < 1 || value > 3600) throw new Error('Invalid timer duration.');
    stop();
    media.reset();
    audio.reset();
    total = remaining = value;
    warnedThirty = false;
    finished = false;
    notify();
  }
  function start() {
    if (destroyed || running) return;
    if (finished) {
      media.reset();
      audio.reset();
      remaining = total;
      finished = false;
      warnedThirty = false;
    }
    // Audio and video unlock remain inside the originating iPhone tap.
    // Neither media preload nor failed playback is allowed to block the clock.
    requestId++;
    running = true;
    deadline = now() + remaining * 1000;
    notify(); // Publish the running state immediately after the user gesture.
    // Unlocks still execute synchronously in that same iPhone tap.
    try { audio.unlock(); } catch (error) { onError(error); }
    try { media.unlock(); } catch (error) { onError(error); }
    // Start media synchronously in this gesture where possible. The media
    // controller owns pending loadeddata events and invalidates them on reset.
    try {
      if (remaining === total) media.start();
      else media.resume();
    } catch (error) { onError(error); }
    tick();
    if (running) {
      try {
        ticker = scheduler.setInterval(tick, 100);
      } catch (error) {
        // Do not silently leave a countdown running without a visual update.
        onError(error);
      }
      void requestWakeLock();
    }
  }
  function pause() {
    if (!running) return;
    tick(); // Preserve exact remaining seconds at pause.
    if (!running) return;
    stop();
    notify();
  }
  function toggle() { if (running) pause(); else start(); }
  function visibilityChange() {
    if (!documentRef?.hidden && running) {
      tick();
      void requestWakeLock();
    }
  }
  documentRef?.addEventListener?.('visibilitychange', visibilityChange);
  notify();
  return {
    state,
    start,
    pause,
    toggle,
    tick,
    setSeconds,
    setMinutes: minutes => setSeconds(Math.round(minutes * 60)),
    reset: () => setSeconds(total),
    destroy: () => {
      if (destroyed) return;
      stop();
      destroyed = true;
      documentRef?.removeEventListener?.('visibilitychange', visibilityChange);
      media.destroy();
      audio.destroy();
    },
  };
}
