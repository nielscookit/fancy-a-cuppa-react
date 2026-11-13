import { MEDIA_ASSETS } from './mediaManifest.js';

const clips = ['fill', 'brew', 'steep', 'milk'];
const idle = -1;

export function createNativeVideoController({
  videos, assetBase, onPhase = () => {}, onError = () => {},
  audioFactory = url => new Audio(url),
  schedule = setTimeout, unschedule = clearTimeout,
  log = (event, details) => console.info('[FAC Milk]', event, details),
}) {
  const url = name => assetBase + MEDIA_ASSETS[name].file;
  const pour = audioFactory(url('pourSound'));
  const milkSound = audioFactory(url('milkSound'));
  let phase = idle;
  let pending = null;
  let paused = true;
  let finished = false;
  let milkRequested = false;
  let request = 0;
  let cancelPlayback = () => {};
  let cancelSeek = () => {};
  const attached = new Set();

  function attach(index) {
    const video = videos[index];
    if (!attached.has(index)) {
      attached.add(index);
      video.preload = 'none';
      video.loop = index === 2;
      video.src = url(clips[index]);
    }
    return video;
  }

  function logMilk(event) {
    const video = videos[3];
    log(event, {
      ms: Math.round(performance.now()), src: video.currentSrc,
      currentTime: video.currentTime, readyState: video.readyState,
      networkState: video.networkState, paused: video.paused,
      error: video.error ? { code: video.error.code, message: video.error.message } : null,
    });
  }

  const milkListeners = ['loadedmetadata', 'playing', 'waiting', 'stalled', 'ended', 'error', 'timeupdate']
    .map(event => {
      const listener = () => logMilk(event);
      videos[3].addEventListener(event, listener);
      return () => videos[3].removeEventListener(event, listener);
    });

  function display(index) {
    phase = index;
    videos.forEach((video, i) => video.classList.toggle('visible', i === Math.max(0, index)));
    onPhase(index);
  }

  function stopSounds() {
    for (const sound of [pour, milkSound]) sound.pause();
  }

  function pause() {
    paused = true;
    request++;
    cancelPlayback();
    videos.forEach(video => video.pause());
    stopSounds();
  }

  function reset() {
    pause();
    cancelSeek();
    pending = null;
    finished = false;
    milkRequested = false;
    videos.forEach(video => {
      if (video.readyState >= 1 && video.currentTime !== 0) video.currentTime = 0;
    });
    display(idle);
  }

  function play(index, { resume = false, onPlaying, onFailure = onError, cue = true } = {}) {
    cancelPlayback();
    const video = attach(index);
    const previous = phase;
    if (pending !== null && pending !== index) videos[pending].pause();
    const id = ++request;
    pending = index;
    paused = false;
    if (!resume && video.readyState >= 1 && video.currentTime !== 0) video.currentTime = 0;

    let settled = false;
    let deadline;
    function confirm() {
      if (settled || id !== request || paused || pending !== index) return;
      cleanup();
      pending = null;
      if (previous >= 0 && previous !== index) videos[previous].pause();
      stopSounds();
      display(index);
      if (index === 0 && !resume) {
        // Prepare Milk after Fill confirms, without a competing play() call.
        attach(3).preload = 'auto';
        logMilk('warmup');
      }
      onPlaying?.();
      if (id !== request || paused) return;
      const sound = index === 0 ? pour : index === 3 ? milkSound : null;
      if (sound && cue && !resume) {
        sound.currentTime = 0;
        sound.play()?.catch(onError);
      }
    }
    function fail(error) {
      if (settled || id !== request || pending !== index) return;
      cleanup();
      video.pause();
      if (index === 3) {
        // Keep the previous frame and allow an explicit later retry.
        pending = null;
      }
      onFailure(error);
    }
    function onMediaError() {
      fail(new Error(clips[index] + ' playback failed (media error ' + video.error?.code + ').'));
    }
    function cleanup() {
      settled = true;
      if (deadline !== undefined) unschedule(deadline);
      if (video.style) video.style.visibility = '';
      video.removeEventListener('playing', confirm);
      video.removeEventListener('error', onMediaError);
    }
    cancelPlayback = cleanup;
    // Keep the incoming element renderable while its opacity still hides it.
    if (video.style) video.style.visibility = 'visible';
    video.addEventListener('playing', confirm);
    video.addEventListener('error', onMediaError);
    try {
      // Same direct call as the device-tested Fill probe.
      if (index !== 3) {
        video.play()?.then(confirm, fail);
        return;
      }
      logMilk('play requested');
      const playback = video.play();
      if (!settled) deadline = schedule(() => {
        logMilk('play stalled');
        fail(new Error('Milk playback did not start.'));
      }, 5000);
      playback?.then(() => {
        if (!settled || id === request) logMilk('play fulfilled');
        confirm();
      }, error => {
        if (!settled || id === request) logMilk('play rejected: ' + error.message);
        fail(error);
      });
    } catch (error) {
      fail(error);
    }
  }

  const ended = videos.map((video, index) => {
    function advance() {
      if (paused || pending !== null || phase !== index) return;
      if (index < 2) play(index + 1);
    }
    video.addEventListener('ended', advance);
    return () => video.removeEventListener('ended', advance);
  });

  function milk() {
    if (paused || phase === 3 || milkRequested) return;
    milkRequested = true;
    play(3);
  }

  function restore(state) {
    reset();
    const fillEnd = videos[0].duration || 5.041667;
    const brewEnd = fillEnd + (videos[1].duration || 15.041667);
    const index = state.finished || state.remaining <= 5 ? 3
      : state.elapsed < fillEnd ? 0 : state.elapsed < brewEnd ? 1 : 2;
    const offset = [state.elapsed, state.elapsed - fillEnd, state.elapsed - brewEnd, 5 - state.remaining][index];
    const video = attach(index);
    finished = state.finished;
    display(index);
    function seek() {
      cancelSeek();
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      const end = Math.max(0, video.duration - 0.05);
      video.currentTime = finished ? end : index === 2 ? offset % video.duration : Math.min(end, offset);
    }
    cancelSeek = () => video.removeEventListener('loadedmetadata', seek);
    if (video.readyState >= 1) seek();
    else {
      video.addEventListener('loadedmetadata', seek);
      video.preload = 'metadata';
    }
    if (state.running) play(index, { resume: true, cue: false });
  }

  return {
    async preloadForStart() { attach(0); display(idle); },
    unlock() {},
    start: () => play(0),
    startSynced: (onPlaying, onFailure) => play(0, { onPlaying, onFailure }),
    pause,
    resume() {
      if (finished) return;
      const index = pending ?? Math.max(0, phase);
      // A restored clip may still be waiting for its seekable metadata.
      play(index, { resume: pending === null || phase === index });
    },
    reset,
    milk,
    finish() { finished = true; milk(); },
    restore,
    retryMilkPlayback() { if (phase === 3 || finished) play(3); },
    destroy() { reset(); ended.forEach(remove => remove()); milkListeners.forEach(remove => remove()); },
  };
}
