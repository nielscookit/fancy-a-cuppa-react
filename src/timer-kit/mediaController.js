import { Capacitor } from '@capacitor/core';
import { MEDIA_ASSETS } from './mediaManifest.js';
import { preloadBundledVideo, prefetchVideoAsBlob } from '../timer/videoPreloader.js';

/**
 * React-independent HTMLVideoElement / HTMLAudioElement controller.
 * V2 timing, sounds and transition sequence are retained.
 * React (or a standalone test page) only supplies four mounted video elements.
 */
export function createMediaController({
  videos,
  assetBase,
  platform = Capacitor.getPlatform(),
  onError = () => {},
  onPhase = () => {},
  onMilkRequested = () => {},
  onMilkEvent = () => {},
  onFillEvent = () => {},
  audioFactory = url => new Audio(url),
  schedule = setTimeout,
  clearSchedule = clearTimeout,
}) {
  if (!Array.isArray(videos) || videos.length !== 4 || videos.some(video => !video)) {
    throw new Error('Media controller requires four mounted video elements.');
  }
  if (typeof assetBase !== 'string' || !assetBase.endsWith('/')) {
    throw new Error('Media assetBase must end with a slash.');
  }
  const bundledVideos = platform === 'ios';
  const path = name => assetBase + MEDIA_ASSETS[name].file;
  const sources = ['fill', 'brew', 'steep', 'milk'];
  const sounds = {
    pour: audioFactory(path('pourSound')),
    bubble: audioFactory(path('bubbleSound')),
    milk: audioFactory(path('milkSound')),
  };
  for (const a of Object.values(sounds)) a.preload = 'auto';

  let active = false;
  let phase = -1;
  let transitioning = false;
  let pendingPhase = null;
  let milkStarted = false;
  let bubblePlayed = false;
  let lastStillTime = 0;
  let milkSoundTriggered = false;
  let milkSoundTimer = null;
  let milkLastEvent = 'idle';
  let milkEverPlayed = false;
  let milkPriming = false;
  let milkPrimed = false;
  let milkBlocked = false;
  let fillLastEvent = 'idle';
  let fillEverPlayed = false;
  let fillBlocked = false;
  let fillStartHandler = null;
  let sourcesAttached = false;
  const videoPreloadPromises = Array(4).fill(null);
  const videoBlobCleanups = Array(4).fill(null);
  const preloadAbort = new AbortController();
  let session = 0;
  let transitionId = 0;
  let destroyed = false;
  const listeners = [];

  function getMilkStatus() {
    const video = videos[3];
    const duration = Number(video.duration);
    return {
      requested: milkStarted,
      phase,
      event: milkLastEvent,
      everPlayed: milkEverPlayed,
      priming: milkPriming,
      primed: milkPrimed,
      blocked: milkBlocked,
      currentTime: Number(video.currentTime) || 0,
      duration: Number.isFinite(duration) ? duration : null,
      readyState: video.readyState,
      paused: !!video.paused,
      ended: !!video.ended,
      errorCode: video.error?.code || null,
    };
  }
  function getFillStatus() {
    const video = videos[0];
    return {
      event: fillLastEvent,
      everPlayed: fillEverPlayed,
      blocked: fillBlocked,
      currentTime: Number(video.currentTime) || 0,
      readyState: video.readyState,
      paused: !!video.paused,
      errorCode: video.error?.code || null,
    };
  }
  function fillEvent(event) {
    fillLastEvent = event;
    if (event === 'playing' ||
      (event === 'timeupdate' && videos[0].currentTime > 0.05)) {
      fillEverPlayed = true;
      fillBlocked = false;
    }
    if (!destroyed) onFillEvent(getFillStatus());
    if (event === 'playing') fillStarted();
  }
  function takeFillStartHandler() {
    const handler = fillStartHandler;
    fillStartHandler = null;
    if (handler?.timeout != null) clearSchedule(handler.timeout);
    return handler;
  }

  function fillStarted() {
    if (active) takeFillStartHandler()?.onPlaying();
  }

  function fillFailed(error) {
    takeFillStartHandler()?.onFailure(error);
  }

  function milkEvent(event) {
    milkLastEvent = event;
    // Hidden priming playback is NOT evidence that the milk animation
    // appeared at the end of the timer.
    if (milkStarted && !milkPriming &&
      (event === 'playing' || event === 'play-started' ||
        (event === 'timeupdate' && videos[3].currentTime > 0.05))) {
      milkEverPlayed = true;
      milkBlocked = false;
    }
    if (!destroyed) onMilkEvent(getMilkStatus());
  }

  function listen(element, name, fn) {
    element.addEventListener(name, fn);
    listeners.push(() => element.removeEventListener(name, fn));
  }
  videos.forEach((video, i) => {
    if (!bundledVideos) video.src = path(sources[i]);
    video.muted = true;
    video.defaultMuted = true;
    video.preload = 'auto';
    video.loop = i === 2;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.removeAttribute('hidden');
    if (!bundledVideos) video.load();
  });

  // The preview should never go blank, including the initial load and Reset.
  // Once the first video has a decodable frame, keep it visible and paused.
  videos[0].classList.add('visible');
  listen(videos[0], 'loadeddata', () => {
    if (!active && phase === -1) {
      videos[0].pause();
      try { videos[0].currentTime = 0; } catch { /* not yet seekable */ }
      videos[0].classList.add('visible');
    }
  });
  for (const event of ['playing', 'timeupdate', 'waiting', 'stalled', 'error', 'ended']) {
    listen(videos[0], event, () => fillEvent(event));
    listen(videos[3], event, () => milkEvent(event));
  }
  function ready(video) {
    return video.readyState >= 2;
  }

  function preloadVideo(index, { fetchImpl, createObjectURL, revokeObjectURL } = {}) {
    if (destroyed) return Promise.reject(new Error('Media controller disposed.'));
    if (videoPreloadPromises[index]) return videoPreloadPromises[index];
    const video = videos[index];
    const url = path(sources[index]);
    const signal = preloadAbort.signal;
    // Keep the explicit Blob preload for Safari and the Homescreen PWA.
    const startedAt = performance.now();
    const loading = bundledVideos
      ? preloadBundledVideo({ video, url, signal })
      : prefetchVideoAsBlob({ video, url, signal, fetchImpl, createObjectURL, revokeObjectURL });
    const promise = loading.then(cleanup => {
      if (destroyed || preloadAbort.signal.aborted) {
        cleanup?.();
        throw new Error('Media controller disposed.');
      }
      videoBlobCleanups[index] = cleanup;
      if (bundledVideos) {
        console.info('[FAC media] metadata ready', sources[index], Math.round(performance.now() - startedAt),
          'ms load;', Math.round(performance.now()), 'ms since navigation');
      }
      if (index === 0) fillEvent(bundledVideos ? 'metadata-loaded' : 'file-prefetched');
      return true;
    }).catch(error => {
      if (videoPreloadPromises[index] === promise) videoPreloadPromises[index] = null;
      const failure = new Error(sources[index] + ' video preload: ' + error.message, { cause: error });
      if (!destroyed) {
        if (bundledVideos) console.warn('[FAC media] metadata failed', sources[index],
          Math.round(performance.now() - startedAt), 'ms', video.readyState, video.networkState, error.message);
        onError(failure);
      }
      throw bundledVideos ? failure : error;
    });
    videoPreloadPromises[index] = promise;
    return promise;
  }
  const preloadFill = options => preloadVideo(0, options);
  async function preloadAll(options) {
    if (!bundledVideos) return Promise.all(sources.map((_, index) => preloadVideo(index, options)));
    // Let the local scheme handler finish one metadata read before starting
    // the next. Parallel callers share the existing per-video promises.
    const loaded = [];
    for (const index of sources.keys()) loaded.push(await preloadVideo(index, options));
    return loaded;
  }
  function logVideo(event, index) {
    const video = videos[index];
    console.info('[FAC media]', sources[index], event, {
      ms: Math.round(performance.now()),
      readyState: video.readyState,
      networkState: video.networkState,
      currentSrc: video.currentSrc,
      error: video.error ? { code: video.error.code, message: video.error.message } : null,
    });
  }

  async function preloadForStart(recovery = {}) {
    if (destroyed || sourcesAttached) return;
    sourcesAttached = true;
    console.info('[FAC media] native-recovery-v1', {
      platform, preload: 'attach-sources', ...recovery,
    });
    // Let WebKit warm up the sources, but leave any deferred metadata read
    // to play(). A background load() retry could abort a pending play().
    videos.forEach((video, index) => {
      for (const event of ['loadstart', 'loadedmetadata', 'playing', 'waiting', 'stalled', 'abort', 'error', 'ended']) {
        listen(video, event, () => logVideo(event, index));
      }
      video.preload = 'metadata';
      video.src = path(sources[index]);
      logVideo('source attached', index);
    });
  }
  function waitReady(video) {
    if (ready(video)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error('Video could not be loaded.')); };
      const cleanup = () => {
        video.removeEventListener('loadeddata', done);
        video.removeEventListener('error', fail);
      };
      video.addEventListener('loadeddata', done);
      video.addEventListener('error', fail);
      // Already called load() once during construction. Calling it again
      // can abort an in-progress video play request in Safari.
    });
  }
  function stopSounds() {
    if (milkSoundTimer != null) clearSchedule(milkSoundTimer);
    milkSoundTimer = null;
    for (const audio of Object.values(sounds)) {
      audio.pause();
      try { audio.currentTime = 0; } catch { /* metadata not ready */ }
    }
  }
  function reset() {
    session++;
    transitionId++;
    active = false;
    phase = -1;
    transitioning = false;
    pendingPhase = null;
    milkStarted = false;
    bubblePlayed = false;
    lastStillTime = 0;
    milkSoundTriggered = false;
    milkLastEvent = 'idle';
    milkEverPlayed = false;
    milkPriming = false;
    milkPrimed = false;
    milkBlocked = false;
    fillLastEvent = 'idle';
    fillEverPlayed = false;
    fillBlocked = false;
    takeFillStartHandler();
    stopSounds();
    videos.forEach((video, index) => {
      video.pause();
      if (index === 0) video.classList.add('visible');
      else video.classList.remove('visible');
      try { video.currentTime = 0; } catch { /* metadata not ready */ }
    });
    // Phase -1 means idle, but the first VIDEO FRAME remains visible.
    onPhase(-1);
    if (!destroyed) {
      milkEvent('reset');
      fillEvent('reset');
    }
  }

  // iOS WKWebView can reject a later .play() (NotAllowedError), even for
  // an already-loaded muted video. Prime the ACTUAL milk <video> element
  // synchronously in the initial Start tap, before any Promise/await.
  // Preloading the media file alone does not grant playback permission.
  function primeMilkVideo() {
    if (destroyed || milkStarted || milkPriming || milkPrimed) return;
    const id = session;
    const video = videos[3];
    milkPriming = true;
    milkEvent('priming');
    let playResult;
    try {
      playResult = video.play();
    } catch {
      milkPriming = false;
      milkEvent('prime-rejected');
      return;
    }
    Promise.resolve(playResult).then(() => {
      if (destroyed || id !== session) return;
      milkPrimed = true;
      milkPriming = false;
      if (!milkStarted) {
        // Keep its element authorized, but rewind while invisible.
        video.pause();
        try { video.currentTime = 0; } catch { /* metadata not ready */ }
        milkEvent('primed');
      }
    }).catch(() => {
      if (destroyed || id !== session) return;
      milkPriming = false;
      // Actual playback may still work at -5s, or via the explicit tap.
      milkEvent('prime-rejected');
    });
  }

  // All playback requests are issued in the direct user gesture.
  function unlock() {
    if (destroyed) return;
    primeMilkVideo();
    const audio = sounds.milk;
    audio.muted = true;
    let p;
    try { p = audio.play(); } catch { audio.muted = false; return; }
    if (p?.then) {
      p.then(() => {
        if (destroyed) return;
        audio.pause();
        try { audio.currentTime = 0; } catch { /* metadata not ready */ }
        audio.muted = false;
      }).catch(() => { audio.muted = false; });
    } else audio.muted = false;
  }

  function playMilkSound(id) {
    if (!active || id !== session || milkSoundTriggered || destroyed) return;
    milkSoundTriggered = true;
    sounds.milk.pause();
    try { sounds.milk.currentTime = 0; } catch { /* metadata not ready */ }
    sounds.milk.play().catch(error => onError(error));
  }
  function onStillTime() {
    const t = videos[2].currentTime;
    if (t < lastStillTime - 0.2) bubblePlayed = false;
    if (active && phase === 2 && !bubblePlayed && t >= 1.03) {
      bubblePlayed = true;
      try {
        sounds.bubble.currentTime = 0;
        sounds.bubble.play().catch(error => onError(error));
      } catch (error) { onError(error); }
    }
    lastStillTime = t;
  }
  // Timer Kit: Steep animation remains silent; no loop bubble cue.

  async function show(i) {
    if (!active || destroyed || (transitioning && i !== 3)) return;
    transitioning = true;
    pendingPhase = i;
    const id = session;
    const ownTransition = ++transitionId;
    const next = videos[i];
    const previous = phase >= 0 ? videos[phase] : null;
    try {
      // On iPhone, 'loadeddata' may never fire until play() is requested.
      // Native clips can request playback before metadata is available.
      // Keep the existing deferred Milk path for browser/PWA Blob URLs.
      if (i === 3 && !bundledVideos && !ready(next)) await waitReady(next);
      if (!active || destroyed || id !== session || ownTransition !== transitionId) return;
      if (bundledVideos && next.error) next.load();
      if (bundledVideos) logVideo('play requested', i);
      try { next.currentTime = 0; } catch (error) {
        // Do not block a muted MP4 play() merely because metadata is pending.
        if (i === 3 && !bundledVideos) throw error;
      }
      if (i === 2) { bubblePlayed = false; lastStillTime = 0; }
      if (i === 3) {
        if (milkSoundTimer != null) clearSchedule(milkSoundTimer);
        milkSoundTriggered = false;
        sounds.milk.pause();
        sounds.milk.currentTime = 0;
      }
      if (i === 3) {
        milkEvent('play-requested');
        try {
          // Wait for *confirmed* playback before claiming a visible milk phase.
          // An iOS NotAllowedError leaves the previous frame in place and
          // exposes a genuine tap-to-play fallback instead.
          const p = next.play();
          if (p?.then) await p;
        } catch (error) {
          if (destroyed || id !== session || ownTransition !== transitionId) return;
          milkBlocked = true;
          milkEvent('play-rejected');
          onError(new Error('Milk video playback blocked: ' +
            (error?.message || String(error))));
          return;
        }
        if (destroyed || id !== session || ownTransition !== transitionId) return;
        milkBlocked = false;
        milkPriming = false;
        milkEvent('play-started');
        next.classList.add('visible');
      } else if (i === 0) {
        // First play() MUST be in the original user gesture.
        next.classList.add('visible');
        fillEvent('play-requested');
        const playback = next.play();
        const isCurrent = () => !destroyed && id === session && ownTransition === transitionId;
        if (playback?.then) playback.then(() => {
          // play() can resolve on a repeat start even without a new playing event.
          if (bundledVideos && isCurrent()) fillStarted();
        }).catch(error => {
          if (!isCurrent()) return;
          fillBlocked = true;
          fillEvent('play-rejected');
          fillFailed(error);
          onError(new Error('Video 0 playback failed: ' +
            (error?.message || String(error))));
        });
      } else {
        // Ended transitions are asynchronous. Start the next loaded Blob
        // immediately; only remove the preceding final frame after actual
        // playback was accepted. Prevents the first video from staying on screen.
        const p = next.play();
        try {
          if (p?.then) await p;
        } catch (error) {
          if (!destroyed && id === session && ownTransition === transitionId) {
            onError(new Error('Video ' + i + ' playback failed: ' +
              (error?.message || String(error))));
          }
          return;
        }
        if (destroyed || id !== session || ownTransition !== transitionId) return;
        next.classList.add('visible');
      }
      if (i === 0) {
        // Pour sound and video are independent. Waiting on an HTMLAudioElement
        // play() Promise here could lock the phase in "transitioning" and make
        // the first video appear only after another button press.
        try {
          sounds.pour.currentTime = 0;
          const audioPromise = sounds.pour.play();
          audioPromise?.catch(error => onError(error));
        } catch (error) { onError(error); }
      } else {
        sounds.pour.pause();
        try { sounds.pour.currentTime = 0; } catch { /* metadata */ }
      }
      if (destroyed || id !== session || ownTransition !== transitionId) return;
      if (previous && previous !== next) {
        previous.classList.remove('visible');
        previous.pause();
      }
      phase = i;
      onPhase(i);
      if (i === 3) milkSoundTimer = schedule(() => playMilkSound(id), 60);
    } catch (error) {
      if (i === 0 && bundledVideos) fillFailed(error);
      onError(error);
    }
    finally {
      if (ownTransition === transitionId) {
        transitioning = false;
        pendingPhase = null;
      }
    }
  }

  listen(videos[0], 'ended', () => {
    sounds.pour.pause();
    try { sounds.pour.currentTime = 0; } catch { /* metadata */ }
    if (active && !milkStarted) void show(1);
  });
  listen(videos[1], 'ended', () => {
    if (active && !milkStarted) void show(2);
  });
  listen(videos[3], 'ended', () => { active = false; });

  function pause() {
    active = false;
    // Retain an interrupted destination for resume, but ignore its old play promise.
    transitionId++;
    transitioning = false;
    takeFillStartHandler();
    videos.forEach(v => v.pause());
    stopSounds();
  }

  function startMilk() {
    if (destroyed || !active || milkStarted) return;
    milkStarted = true;
    milkPriming = false;
    onMilkRequested();
    milkEvent('requested');
    // Loading is asynchronous in Safari; do NOT cancel this request at 0s.
    void show(3);
  }

  // Reload recovery seeks to the current phase without replaying old sounds.
  function restore(state) {
    reset();
    active = state.running;
    const fillDuration = Number.isFinite(videos[0].duration) ? videos[0].duration : 5.041667;
    const brewDuration = Number.isFinite(videos[1].duration) ? videos[1].duration : 15.041667;
    let index, time;
    if (state.finished || state.remaining <= 5) {
      index = 3;
      time = state.finished ? Infinity : 5 - state.remaining;
      milkStarted = true;
      milkSoundTriggered = true;
    } else if (state.elapsed < fillDuration) { index = 0; time = state.elapsed; }
    else if (state.elapsed < fillDuration + brewDuration) { index = 1; time = state.elapsed - fillDuration; }
    else { index = 2; time = state.elapsed - fillDuration - brewDuration; }
    phase = index;
    onPhase(index);
    const ownSession = session;
    const video = videos[index];
    videos.forEach((item, i) => item.classList.toggle('visible', i === index));
    function playRestoredVideo() {
      video.play()?.catch(() => {
        if (!destroyed && ownSession === session && active) {
          onError(new Error('Tap the countdown to pause, then tap again to resume video and sound.'));
        }
      });
    }
    function seek() {
      if (destroyed || ownSession !== session) return;
      const duration = Number(video.duration);
      if (!Number.isFinite(duration) || duration <= 0) return;
      const target = time === Infinity ? Math.max(0,duration - 0.05)
        : index === 2 ? time % duration : Math.min(time,Math.max(0,duration - 0.05));
      try { video.currentTime = target; } catch (error) { onError(error); }
      if (active && (!bundledVideos || video.paused)) playRestoredVideo();
    }
    if (video.readyState >= 1) seek();
    else {
      const loaded = () => { video.removeEventListener('loadedmetadata', loaded); seek(); };
      listen(video, 'loadedmetadata', loaded);
      // A running timer can request playback even if WebKit defers metadata.
      if (bundledVideos && active) playRestoredVideo();
    }
  }

  return {
    ready: () => videos.every(ready),
    prepare: () => Promise.all(videos.map(waitReady)),
    preloadFill,
    preloadAll,
    ...(bundledVideos ? { preloadForStart } : {}),
    restore,
    unlock,
    reset,
    start: () => { active = true; void show(0); },
    startSynced: (onPlaying, onFailure = onError) => {
      if (destroyed) return;
      takeFillStartHandler();
      const handler = { onPlaying, onFailure };
      fillStartHandler = handler;
      if (bundledVideos) {
        handler.timeout = schedule(() => {
          if (fillStartHandler !== handler) return;
          logVideo('playback timed out', 0);
          fillFailed(new Error('Fill video playback timed out.'));
        }, 8000);
      }
      active = true;
      void show(0); // Calls play() synchronously in the initiating iPhone tap.
    },
    resume: () => {
      active = true;
      if (pendingPhase !== null) void show(pendingPhase);
      else if (phase >= 0) videos[phase].play().catch(error => onError(error));
      else void show(0);
    },
    pause,
    milk: startMilk,
    finish: () => {
      // A backgrounded browser can jump straight across the five-second cue.
      startMilk();
      if (!milkStarted) {
        pause();
        return;
      }
      // The countdown ends before the milk clip necessarily finishes.
      // Keep the milk video playing, or keep its pending loadeddata handler
      // alive so it can start even when loading crosses timer zero.
      // Stop previous video loops immediately to prevent endless steeping.
      for (const video of videos.slice(0, 3)) video.pause();
      sounds.pour.pause();
      sounds.bubble.pause();
      // Do not call stopSounds()/pause(): that would cancel milk playback.
      // The milk video's ended event leaves its final frame visible.
    },
    get milkStarted() { return milkStarted; },
    get phase() { return phase; },
    getMilkStatus,
    getFillStatus,
    retryMilkPlayback: () => {
      if (!milkStarted || destroyed) return;
      // Called synchronously from a user tap in the diagnostic UI.
      milkBlocked = false;
      milkEvent('manual-retry');
      void show(3);
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      reset();
      listeners.forEach(remove => remove());
      preloadAbort.abort();
      videoBlobCleanups.forEach(cleanup => cleanup?.());
    },
  };
}
