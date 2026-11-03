# Timer migration boundary

Phase 3 will introduce a React-independent media/timer controller here.
No React imports inside the controller; React is responsible for UI and user actions.

Verified sources in V2 (2026-11-03):
- app-v2/index.html: timer/media implementation around lines 827–1067
- video-integration-test/index.html: isolated repeatability test

Preserve iPhone unlock, preload, playback, pause/reset and media sequencing
where practical. Do not paste V2 DOM manipulation directly into React.

No live timer/media implementation is added in phase 2.
