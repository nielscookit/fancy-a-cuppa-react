import { MEDIA_ASSETS } from './mediaManifest.js';

/**
 * React-independent HTMLVideoElement / HTMLAudioElement controller.
 * V2 timing, sounds and transition sequence are retained.
 * React (or a standalone test page) only supplies four mounted video elements.
 */
export function createMediaController({
  videos,
  assetBase,
  onError = () => {},
  onPhase = () => {},
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
  let milkStarted = false;
  let bubblePlayed = false;
  let lastStillTime = 0;
  let milkSoundTriggered = false;
  let milkSoundTimer = null;
  let session = 0;
  let transitionId = 0;
  let destroyed = false;
  const listeners = [];

  function listen(element, name, fn) {
    element.addEventListener(name, fn);
    listeners.push(() => element.removeEventListener(name, fn));
  }
  videos.forEach((video, i) => {
    video.src = path(sources[i]);
    video.muted = true;
    video.defaultMuted = true;
    video.preload = 'auto';
    video.loop = i === 2;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.removeAttribute('hidden');
    video.load();
  });

  function ready(video) {
    return video.readyState >= 2;
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
      video.load();
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
    milkStarted = false;
    bubblePlayed = false;
    lastStillTime = 0;
    milkSoundTriggered = false;
    stopSounds();
    videos.forEach(video => {
      video.pause();
      video.classList.remove('visible');
      try { video.currentTime = 0; } catch { /* metadata not ready */ }
    });
    onPhase(-1);
  }

  // Call in the same direct user-gesture handler as timer start; copied from V2.
  function unlock() {
    if (destroyed) return;
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
  listen(videos[2], 'timeupdate', onStillTime);

  async function show(i) {
    if (!active || destroyed || (transitioning && i !== 3)) return;
    transitioning = true;
    const id = session;
    const ownTransition = ++transitionId;
    const next = videos[i];
    const previous = phase >= 0 ? videos[phase] : null;
    try {
      await waitReady(next);
      if (!active || destroyed || id !== session || ownTransition !== transitionId) return;
      next.currentTime = 0;
      if (i === 2) { bubblePlayed = false; lastStillTime = 0; }
      if (i === 3) {
        if (milkSoundTimer != null) clearSchedule(milkSoundTimer);
        milkSoundTriggered = false;
        sounds.milk.pause();
        sounds.milk.currentTime = 0;
      }
      next.classList.add('visible');
      const p = next.play();
      p?.catch(error => onError(error));
      if (i === 0) {
        try {
          sounds.pour.currentTime = 0;
          await sounds.pour.play();
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
    } catch (error) { onError(error); }
    finally { if (ownTransition === transitionId) transitioning = false; }
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
    videos.forEach(v => v.pause());
    stopSounds();
  }

  return {
    ready: () => videos.every(ready),
    prepare: () => Promise.all(videos.map(waitReady)),
    unlock,
    reset,
    start: () => { active = true; void show(0); },
    resume: () => {
      active = true;
      if (phase >= 0) videos[phase].play().catch(error => onError(error));
      else void show(0);
    },
    pause,
    milk: () => { if (!milkStarted) { milkStarted = true; void show(3); } },
    finish: () => {
      // The final milk video is intentionally allowed to finish after timer 0.
      if (!milkStarted) pause();
    },
    get milkStarted() { return milkStarted; },
    get phase() { return phase; },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      reset();
      listeners.forEach(remove => remove());
    },
  };
}
