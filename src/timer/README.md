# Confirmed media controller + React integration boundary

The user's real iPhone Safari test on **2026-11-04** confirmed that the
isolated `/timer-test/` plays correctly, including:

- All four clips: `FIllSNB.mp4` → `brewSNB.mp4` → looping `stillSNB.mp4` → `MILKSNB.mp4`.
- Audio cues, timer synchronization and the milk video near completion.
- Reset: paused **first frame** of the first video remains visible; Start replays it.

**Do not modify the working `/timer-test/` or the three underlying controllers
without a regression test and an explicit need.** V2 is still untouched.

## Current integration · 2026-11-11

Home integration and user acceptance are complete; see `../../QA_V3.md`.
Production Home uses the Timer Kit for media and the shared timer/audio/session
logic. The migration notes below record the earlier integration preparation;
they are not pending implementation or repeat-test requests.

## Migration preparation (historical)

- `teaTimerSession.js`: framework-neutral wiring that creates all three
  controllers, preloads 4 videos and exposes Start/Pause/Reset/SetSeconds.
- `useTeaTimer.js`: small React hook adapter returning a state snapshot and
  imperative user-gesture callbacks. It does not render or style anything.
- No changes to `src/App.jsx`, `src/theme.js`, MUI lab or Supabase.
- Source code of validated media controllers and iPhone diagnostic stays
  unchanged; a safe integration point is ready for the approved V3 UI.

## Usage for a future approved UI

```jsx
const videoRefs = useRef([]);
const { snapshot, actions } = useTeaTimer({
  videoRefs,
  assetBase: import.meta.env.BASE_URL + 'media/',
  initialSeconds: 240,
});
```

Render four persistent video elements and populate `videoRefs.current[index]`
before mounting. Keep the media presentation CSS consistent with the validated
`/timer-test/`. Use `snapshot.preload === 'ready'` to enable Start; invoke
`actions.start()` **directly in the button's onClick** to maintain the
iPhone user-gesture permission. There must be no awaiting before the call.

Wait for UX approval before changing the app layout or replacing the existing
technical catalog test screen. Confirm iPhone behavior again after UI integration.
