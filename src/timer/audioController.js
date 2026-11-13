import { Capacitor } from '@capacitor/core';
import { MEDIA_ASSETS } from './mediaManifest.js';

/**
 * V2 sound handling extracted from the DOM script.
 * The timer only calls this adapter; no React dependency.
 */
export function createAudioController({
  assetBase,
  soundFiles = {},
  loopFinished = false,
  documentRef = globalThis.document,
  onError = () => {},
  audioFactory = url => new Audio(url),
  contextFactory = () => {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    return Context ? new Context() : null;
  },
  fetchImpl = fetch,
  platform = Capacitor.getPlatform(),
  locationRef = globalThis.location,
}) {
  const path = name => assetBase + (soundFiles[name] || MEDIA_ASSETS[name].file);
  const localIosAudio = platform === 'ios' && locationRef?.protocol === 'capacitor:';
  const finished = audioFactory(path('finishSound'));
  const almost = audioFactory(path('almostSound'));
  finished.preload = 'auto';
  almost.preload = 'auto';
  let fallback = null;
  let context = null;
  let clickBuffer = null;
  let almostBuffer = null;
  let finishBufferReady = null;
  let finishBuffer = null;
  let finishPlayback = 0;
  let disposed = false;
  let generation = 0;
  const activeSources = new Set();
  let keepAliveSource = null;
  let keepAliveGain = null;

  // iOS can shut down an idle audio device and refuse to restart it at 0:00.
  // Keep the unlocked Web Audio output active during a foreground run.
  function armAudioOutput() {
    if (disposed || !context || context.state !== 'running' ||
        keepAliveSource || !context.createBuffer || !context.createGain) return;
    const sampleRate = context.sampleRate || 44100;
    const buffer = context.createBuffer(1, Math.max(1, Math.floor(sampleRate / 10)), sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.sin(i * 2 * Math.PI * 220 / sampleRate) * 0.000001;
    const source = context.createBufferSource();
    const gain = context.createGain();
    gain.gain.value = 0.01;
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    gain.connect(context.destination);
    source.onended = () => { activeSources.delete(source); source.disconnect(); };
    source.start();
    activeSources.add(source);
    keepAliveSource = source;
    keepAliveGain = gain;
  }
  function stopAudioOutput() {
    if (keepAliveSource) {
      try { keepAliveSource.stop(); } catch { /* already stopped */ }
      try { keepAliveSource.disconnect(); } catch { /* already disconnected */ }
      activeSources.delete(keepAliveSource);
      keepAliveSource = null;
    }
    try { keepAliveGain?.disconnect(); } catch { /* already disconnected */ }
    keepAliveGain = null;
  }

  try { context = contextFactory(); }
  catch (error) { onError(error); }
  if (!context) {
    fallback = audioFactory(path('clickSound'));
    fallback.preload = 'auto';
  } else {
    function loadBuffer(name, callback) {
      const url = path(name);
      const resolved = localIosAudio ? new URL(url, locationRef.href) : null;
      const bundled = resolved?.protocol === 'capacitor:' && resolved.host === locationRef.host;
      return Promise.resolve()
        .then(() => bundled
          ? fetchImpl(url, { signal: AbortSignal.timeout(5000) })
          : fetchImpl(url))
        .then(response => {
          // The Capacitor scheme handler serves local MP3s as URLResponse.
          if (!response.ok && !(bundled && response.status === 0)) {
            throw new Error('Audio file not available: ' + name);
          }
          return response.arrayBuffer();
        })
        .then(bytes => {
          if (!bytes.byteLength) throw new Error('Empty audio file: ' + name);
          return context.decodeAudioData(bytes);
        })
        .then(buffer => { if (!disposed) callback(buffer); return buffer; })
        .catch(error => {
          // Native playback can recover using the corresponding media element.
          if (!disposed && !bundled) onError(error);
        });
    }
    loadBuffer('clickSound', buffer => { clickBuffer = buffer; });
    loadBuffer('almostSound', buffer => { almostBuffer = buffer; });
    finishBufferReady = loadBuffer('finishSound', buffer => { finishBuffer = buffer; });
  }

  function bufferPlay(buffer, loop = false) {
    if (disposed) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.connect(context.destination);
    activeSources.add(source);
    source.onended = () => { activeSources.delete(source); source.disconnect(); };
    source.start();
  }
  function unlock() {
    if (disposed) return;
    if (context) {
      // Called directly from Start, not at the end of the timer.
      if (context.state === 'running') armAudioOutput();
      else {
        const current = generation;
        Promise.resolve(context.resume()).then(() => {
          if (current === generation) armAudioOutput();
        }).catch(() => {
          // Playback handles a possible temporary iOS audio interruption.
        });
      }
    }
    if (almost.readyState === 0) almost.load();
    if (finished.readyState === 0) finished.load();
    if (localIosAudio && !finishBuffer && (!loopFinished || !documentRef?.hidden)) {
      // Authorize the same fallback element during the Start gesture.
      const request = ++finishPlayback;
      finished.muted = true;
      try {
        Promise.resolve(finished.play()).catch(() => {}).then(() => {
          if (disposed || request !== finishPlayback) return;
          finished.pause();
          try { finished.currentTime = 0; } catch { /* metadata */ }
          finished.muted = false;
        });
      } catch {
        finished.muted = false;
      }
    }
  }
  function playAlmost() {
    if (disposed) return;
    const current = generation;
    if (context && almostBuffer) {
      if (context.state === 'running') bufferPlay(almostBuffer);
      else context.resume().then(() => {
        if (!disposed && current === generation) bufferPlay(almostBuffer);
      }).catch(onError);
    } else almost.play().catch(onError);
  }
  function playClick() {
    if (disposed) return;
    if (context && clickBuffer) {
      if (context.state !== 'running') context.resume().catch(onError);
      bufferPlay(clickBuffer);
      return;
    }
    if (!fallback) {
      fallback = audioFactory(path('clickSound'));
      fallback.preload = 'auto';
    }
    fallback.pause();
    try { fallback.currentTime = 0; } catch { /* metadata */ }
    fallback.play().catch(onError);
  }
  function playHtmlFinished(current) {
    if (disposed || current !== generation || (loopFinished && documentRef?.hidden)) return Promise.resolve();
    finishPlayback++;
    finished.pause();
    try { finished.currentTime = 0; } catch { /* metadata */ }
    finished.muted = false;
    finished.volume = 1;
    finished.loop = loopFinished;
    try {
      return Promise.resolve(finished.play()).catch(error => {
        if (!disposed && current === generation) throw error;
      });
    } catch (error) { return Promise.reject(error); }
  }
  function playFinished() {
    if (disposed || (loopFinished && documentRef?.hidden)) return Promise.resolve();
    const current = generation;
    if (!context) return playHtmlFinished(current);
    return Promise.resolve(finishBufferReady).then(async buffer => {
      if (disposed || current !== generation || (loopFinished && documentRef?.hidden)) return;
      if (!buffer && !localIosAudio) throw new Error('Ready.mp3 konnte nicht geladen werden.');
      try {
        if (!buffer) throw new Error('Ready.mp3 konnte nicht geladen werden.');
        // Normally running since Start; resume only after an iOS interruption.
        if (context.state !== 'running') await context.resume();
        if (disposed || current !== generation || (loopFinished && documentRef?.hidden)) return;
        bufferPlay(buffer, loopFinished);
        stopAudioOutput();
      } catch {
        if (disposed || current !== generation || (loopFinished && documentRef?.hidden)) return;
        // Last resort if the Web Audio output was interrupted.
        // Surface one error only if both audio paths fail.
        try { await playHtmlFinished(current); }
        catch {
          if (!disposed && current === generation) {
            if (localIosAudio) {
              throw new Error(buffer ? 'Ready-Ton konnte nicht gestartet werden.' :
                'Ready.mp3 konnte nicht geladen oder abgespielt werden.');
            }
            throw new Error('Ready-Ton konnte nicht gestartet werden. Bitte Safari bzw. die Homescreen-App neu öffnen.');
          }
        }
      }
    });
  }
  function reset() {
    generation++;
    finishPlayback++;
    if (localIosAudio) finished.muted = false;
    finished.loop = false;
    stopAudioOutput();
    for (const source of activeSources) {
      try { source.stop(); } catch { /* already ended */ }
      source.disconnect();
    }
    activeSources.clear();
    for (const audio of [finished, almost, fallback].filter(Boolean)) {
      audio.pause();
      try { audio.currentTime = 0; } catch { /* metadata */ }
    }
  }
  function visibilityChange() {
    // Foreground alarm only: never leave a loop to resume unexpectedly on return.
    if (documentRef?.hidden) reset();
  }
  if (loopFinished) documentRef?.addEventListener?.('visibilitychange', visibilityChange);
  function destroy() {
    if (disposed) return;
    disposed = true;
    reset();
    if (loopFinished) documentRef?.removeEventListener?.('visibilitychange', visibilityChange);
    if (context) context.close().catch(onError);
  }
  return { unlock, playAlmost, playClick, playFinished, reset, destroy };
}
