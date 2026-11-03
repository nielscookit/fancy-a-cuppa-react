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
