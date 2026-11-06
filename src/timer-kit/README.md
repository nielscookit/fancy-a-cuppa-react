# Timer Kit Lab (isolated, development branch)

This lab is **not** a replacement for the existing V3 timer or the validated `/timer-test/`.

## Media files

Upload the four optimized MP4 files to this branch under:

- `public/media/timer-kit/fill.mp4`
- `public/media/timer-kit/brew.mp4`
- `public/media/timer-kit/steep.mp4`
- `public/media/timer-kit/milk.mp4`

The files are optimized H.264 MP4s, 750x750, 24 fps, silent, Faststart.
The existing V3 audio cues remain in `public/media/` and are copied by the existing CI `sync:media` step.

## Run locally

```sh
npm ci
npm run sync:media
npm run dev
```

Open `http://127.0.0.1:5173/fancy-a-cuppa-react/timer-lab/` (or the URL shown by Vite).
The existing build workflow must include `timer-lab/index.html` in Vite inputs.

## Architecture

- `mediaController.js`: **isolated copy** of the validated media controller, with only the preloader import changed. This keeps the production controller untouched and resolves the lab-local media manifest.
- `mediaManifest.js`: lab video paths, existing V3 audio paths.
- `../timer/timerController.js`: existing unchanged JS countdown.
- `../timer/audioController.js`: existing unchanged audio engine.
- `TimerKitLab.jsx`: mounted video elements, direct user-gesture start, diagnostics.
- `timer-kit.css`: 375x375 white stage with soft-edge mask.

The lab remains separate from `src/App.jsx`, `src/components/QuickTimerView.jsx`, and `src/timer-test/`. No Supabase access.

## iPhone acceptance checks

1. Fresh page load: wait for `Media: ready`.
2. Start: Fill immediately plays and clock starts at the `playing` event.
3. Fill → Brew → Steep, including repeated Steep loop.
4. At 30s: almost-done sound; at 5s: Milk; at zero: finish audio.
5. Reset: first Fill frame remains visible.
6. Perform 5 consecutive runs; test Pause, Resume, Reset mid-transition.
7. Lock the screen, switch apps, return; inspect clock correction and playback state.
8. Check the event log and media error fields for rejected play requests.
9. Inspect white mask at 375px; no sharp square edges or black frames.

Do **not** merge the branch or replace production assets before live iPhone acceptance.
