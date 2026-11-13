/**
 * iOS can ignore <video preload="auto">. Fetch the entire short MP4
 * and use these exact downloaded bytes as the media element's Blob URL.
 */
export async function prefetchVideoAsBlob({
  video, url,
  fetchImpl = (...args) => globalThis.fetch(...args),
  createObjectURL = blob => globalThis.URL.createObjectURL(blob),
  revokeObjectURL = url => globalThis.URL.revokeObjectURL(url),
  signal,
}) {
  if (!video || !url) throw new Error('Missing video or URL.');
  if (signal?.aborted) throw new Error('Video download cancelled.');
  const response = await fetchImpl(url, { cache: 'force-cache', signal });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const blob = await response.blob();
  if (signal?.aborted) throw new Error('Video download cancelled.');
  if (!blob || blob.size < 1000) throw new Error('Incomplete video download.');
  const objectURL = createObjectURL(blob);
  try {
    video.src = objectURL;
    video.preload = 'auto';
    video.load();
  } catch (error) {
    revokeObjectURL(objectURL);
    throw error;
  }
  return () => revokeObjectURL(objectURL);
}


// Capacitor's iOS asset handler can serve MP4s without an HTTP status.
export async function preloadBundledVideo({ video, url, signal, timeoutMs = 15000 }) {
  // Retry only a silent stall, with the original per-clip deadline split
  // between the two attempts. A media error or abort must reach the caller.
  if (await loadVideoMetadata(video, url, signal, timeoutMs / 2)) return;
  if (await loadVideoMetadata(video, url, signal, timeoutMs / 2)) return;
  throw new Error('Video metadata load timed out.');
}

function loadVideoMetadata(video, url, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Video load cancelled.'));
      return;
    }

    let timeout;
    function cleanup() {
      clearTimeout(timeout);
      video.removeEventListener('loadedmetadata', checkMetadata);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    }
    function fail(error) {
      cleanup();
      reject(error);
    }
    function checkMetadata() {
      // Check the selected source and state, since a queued event can
      // belong to the load that was just replaced.
      if (!video.currentSrc || video.currentSrc !== video.src || video.readyState < 1) return false;
      if (!Number.isFinite(video.duration) || video.duration <= 0 ||
          !(video.videoWidth > 0 && video.videoHeight > 0)) {
        fail(new Error('Invalid video metadata.'));
      } else {
        cleanup();
        resolve(true);
      }
      return true;
    }
    function onError() {
      if (!video.error) return;
      fail(new Error('Video could not be loaded (media error ' + video.error.code + ').'));
    }
    function onAbort() {
      fail(new Error('Video load cancelled.'));
    }

    // Keep valid metadata when the previous attempt completed late.
    const sameSource = video.src && (video.src === url || (video.baseURI && new URL(url, video.baseURI).href === video.src));
    if (sameSource && !video.error && checkMetadata()) return;

    video.addEventListener('loadedmetadata', checkMetadata);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
    timeout = setTimeout(() => {
      if (video.error) onError();
      else if (!checkMetadata()) {
        cleanup();
        resolve(false);
      }
    }, timeoutMs);
    try {
      video.preload = 'metadata';
      video.src = url;
      video.load();
      checkMetadata();
    } catch (error) {
      fail(error);
    }
  });
}
