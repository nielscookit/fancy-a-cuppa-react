# Framework-independent V3 timer and media controllers

Sources are pinned to the validated V2 main SHA 203782e33b4d52184091c171008bccdbb6437057
and the preserved video integration test. V2 remains unchanged.

- `mediaController.js`: video fill → brew → looping still → milk;
  matching V2 sounds, 1.03s bubble cue, milk sound +60ms, session-token cleanup.
- `audioController.js`: V2-style WebAudio preload/click/30-second cue
  and HTMLAudioElement timer-finished sound.
- `timerController.js`: timestamp-based countdown, pause/resume/reset,
  30/5-second thresholds, wake lock and background visibility handling.
- `mediaManifest.js`: known Git content hashes; checked at download time.
- `scripts/sync-v2-media.mjs`: copies verified media from the immutable V2
  source commit into V3 public/media; no changes or requests to V2 write APIs.

The controllers do not import React. A dedicated /timer-test/ page will
mount and exercise these modules before any timer migration into the main app.

iPhone Safari remains the acceptance gate: repeated start/restart, media
sequencing, no lost audio, visibility and screen lock. Automated JS tests
cannot substitute for real device confirmation.
