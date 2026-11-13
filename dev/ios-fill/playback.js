const video = document.querySelector('video');
const output = document.querySelector('pre');
const button = document.querySelector('button');
const startedAt = performance.now();
let attempt = 0;
let requestedAt = null;

function report(event, details = {}) {
  const now = performance.now();
  const entry = {
    attempt,
    elapsedMs: Math.round(now - startedAt),
    sincePlayMs: requestedAt === null ? null : Math.round(now - requestedAt),
    currentTime: video.currentTime,
    readyState: video.readyState,
    networkState: video.networkState,
    paused: video.paused,
    currentSrc: video.currentSrc,
    error: video.error && { code: video.error.code, message: video.error.message },
    ...details,
  };
  console.info('[FAC Fill probe]', event, entry);
  output.textContent += event + ' ' + JSON.stringify(entry) + '\n';
}

for (const event of ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay',
  'play', 'playing', 'timeupdate', 'waiting', 'stalled', 'suspend', 'pause', 'ended', 'abort', 'error']) {
  video.addEventListener(event, () => report(event));
}

button.addEventListener('click', () => {
  attempt++;
  requestedAt = performance.now();
  report('play() requested');
  try {
    const playback = video.play();
    const requestedAttempt = attempt;
    report('play() returned', { promise: Boolean(playback?.then) });
    playback?.then(
      () => report('play() fulfilled', { requestedAttempt }),
      error => report('play() rejected', { requestedAttempt, name: error.name, message: error.message }),
    );
  } catch (error) {
    report('play() threw', { name: error.name, message: error.message });
  }
});

report('source configured', { src: video.src, origin: location.origin });
