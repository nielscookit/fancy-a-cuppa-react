# Fancy a Cuppa V3 — migration status

## Complete
- V2 main reference 203782e33b4d52184091c171008bccdbb6437057; V2 unchanged.
- React, Vite, MUI 7, Roboto Mono, pinned npm lockfile, independent GitHub Pages.
- Existing Supabase reads verified (two teas); writes mocked in tests.
- /lab/ standalone real MUI component lab, local preview-only settings.
- React-independent timer, audio, media controllers based on V2 timing.
- /timer-test/ diagnostic to verify real iPhone behavior before further app migration.
- 10 V2 audio/video files copied at deployment from pinned SHA and blob-hash checked;
  runtime assets served from independent V3 GitHub Pages path.

## Outstanding
- GitHub Actions build and route/media integrity check.
- Repeated real iPhone Safari playback test; critical acceptance gate.
- React timer UI integration only after successful hardware confirmation.
- Production V2 has not been changed and must not be changed.

## iPhone finding / follow-up

- Reported: video loop running without advancing clock or working start/reset.
- Fault found in implementation: countdown start was gated behind prepare() resolving for all 4 videos.
- Fix: countdown and reset independent from media loading; first video playback initiated inside the tap if ready.
- Diagnostic last-action indicator added; automated tests for pending preload, playback errors and steep-loop abort at zero.
- Must confirm actual iPhone Safari behavior before merging timer into main app.

## 2026-11-03: confirmed iPhone timer root cause

- User reported video playing, no periodic clock updates, clock jumped on Pause.
- Reproduced `TypeError: Illegal invocation` in a real Chromium browser by
  calling a detached native setInterval through an unrelated scheduler object.
- The existing timer default scheduler used precisely this erroneous pattern.
- Fixed by wrapping globalThis.setInterval/clearInterval with receiver-safe arrows.
- Added regression test emulating a strict browser receiver plus a visible error
  callback if periodic scheduling ever fails.
- Verify on actual iPhone before accepting migration; React, app, lab, V2 and
  Supabase otherwise unchanged.
