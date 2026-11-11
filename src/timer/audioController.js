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
}) {
  const path = name => assetBase + (soundFiles[name] || MEDIA_ASSETS[name].file);
  const finished = audioFactory(path('finishSound'));
  const almost = audioFactory(path('almostSound'));
  finished.preload = 'auto';
  almost.preload = 'auto';
  let fallback = null;
  let context = null;
  let clickBuffer = null;
  let almostBuffer = null;
  let disposed = false;
  let generation = 0;
  const activeSources = new Set();

  try { context = contextFactory(); }
  catch (error) { onError(error); }
  if (!context) {
    fallback = audioFactory(path('clickSound'));
    fallback.preload = 'auto';
  } else {
    function loadBuffer(name, callback) {
      fetchImpl(path(name))
        .then(response => {
          if (!response.ok) throw new Error('Audio file not available: ' + name);
          return response.arrayBuffer();
        })
        .then(bytes => context.decodeAudioData(bytes))
        .then(buffer => { if (!disposed) callback(buffer); })
        .catch(onError);
    }
    loadBuffer('clickSound', buffer => { clickBuffer = buffer; });
    loadBuffer('almostSound', buffer => { almostBuffer = buffer; });
  }

  function bufferPlay(buffer) {
    if (disposed) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    activeSources.add(source);
    source.onended = () => { activeSources.delete(source); source.disconnect(); };
    source.start();
  }
  function unlock() {
    if (disposed) return;
    if (context && context.state !== 'running') context.resume().catch(onError);
    if (almost.readyState === 0) almost.load();
    if (finished.readyState === 0) finished.load();
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
  function playFinished() {
    if (disposed || (loopFinished && documentRef?.hidden)) return Promise.resolve();
    const current = generation;
    finished.pause();
    try { finished.currentTime = 0; } catch { /* metadata */ }
    finished.muted = false;
    finished.volume = 1;
    finished.loop = loopFinished;
    try { return Promise.resolve(finished.play()).catch(error => {
      // Reset/teardown can intentionally abort a pending browser play request.
      if (!disposed && current === generation) throw error;
    }); }
    catch (error) { return Promise.reject(error); }
  }
  function reset() {
    generation++;
    finished.loop = false;
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
