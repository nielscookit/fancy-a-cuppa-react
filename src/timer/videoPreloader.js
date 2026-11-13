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
export function preloadBundledVideo({ video, url, signal, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Video load cancelled.'));
      return;
    }

    function cleanup() {
      clearTimeout(timeout);
      video.removeEventListener('loadedmetadata', onMetadata);
      video.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    }
    function fail(error) {
      cleanup();
      reject(error);
    }
    function onMetadata() {
      if (!Number.isFinite(video.duration) || video.duration <= 0 ||
          video.videoWidth <= 0 || video.videoHeight <= 0) {
        fail(new Error('Invalid video metadata.'));
        return;
      }
      cleanup();
      resolve();
    }
    function onError() {
      fail(new Error('Video could not be loaded (media error ' + (video.error?.code ?? 'unknown') + ').'));
    }
    function onAbort() {
      fail(new Error('Video load cancelled.'));
    }

    // WKWebView can defer the first frame until play(). Metadata is enough
    // to initialize the clip without requiring playback before the Start tap.
    const timeout = setTimeout(() => fail(new Error('Video metadata load timed out.')), timeoutMs);
    video.addEventListener('loadedmetadata', onMetadata);
    video.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      video.preload = 'auto';
      video.src = url;
      video.load();
    } catch (error) {
      fail(error);
    }
  });
}
