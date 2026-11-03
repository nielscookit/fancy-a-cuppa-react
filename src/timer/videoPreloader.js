/**
 * iOS can ignore <video preload="auto">. Fetch the entire short MP4
 * and use these exact downloaded bytes as the media element's Blob URL.
 */
export async function prefetchVideoAsBlob({
  video, url,
  fetchImpl = (...args) => globalThis.fetch(...args),
  createObjectURL = blob => globalThis.URL.createObjectURL(blob),
  revokeObjectURL = url => globalThis.URL.revokeObjectURL(url),
}) {
  if (!video || !url) throw new Error('Missing video or URL.');
  const response = await fetchImpl(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const blob = await response.blob();
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
