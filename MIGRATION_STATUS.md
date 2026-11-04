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

## Milk video / start latency correction

- Reconfirmed V2 media matrix: fill + BrewNEW2, brew, looped still + BlubbKlein, 30s AlmostTime, at 5s MILKSNB + BlubbMILCH, at zero tea-finished.
- Root risk: V3 finish() stopped the media controller while MILKSNB was still waiting for Safari's loadeddata after 0s.
- Updated: milk request survives the timer reaching zero; old steep video stops and pending milk may still play; last milk frame remains visible.
- Running clock state is notified before synchronous audio/video setup; diagnostic page additionally displays tenths and "milk requested/loading".
- Automated tests include milk loaded after zero, resetting during pending load, and immediate start notification.
- Real iPhone playback still needs approval before migration to the production V3 UI.

## 2026-11-03: iPhone test, visible time discrepancy and missing milk

- Screenshots: 00:36 versus live 35.2s; 00:02 versus live 1.2s.
- **Not two independent clock readings.** The old UI rounded up to a whole
  second while the debug line displayed tenths. Both now use one shared
  tenth-second formatter on the diagnostic page.
- Previous "Milk: playing / last frame" was based on a phase variable, not on
  an HTMLMediaElement playing event; it could falsely report playback.
- Added actual native playback telemetry: requested, playing/timeupdate,
  waiting, stalled, play-rejected, media time/duration/ready state and errors.
- Removed duplicate load() in waitReady(), which could interrupt pending play
  on iOS. Also inspect actual MILKSNB.mp4 duration in CI via ffprobe.
- No claim of correct iPhone milk playback until device retest.

- CI runner lacks ffprobe; use a dependency-free parser of MP4 moov/mvhd duration to verify each original clip.

## 2026-11-03: iPhone NotAllowedError confirmed (MILKSNB.mp4)

- Screenshot: milk loaded (readyState 4), time 0.0, never played, explicit
  browser error: "The request is not allowed by the user agent or the platform
  in the current context". This is an autoplay/user-activation restriction,
  **not** a missing video or proof that the person denied a permission dialog.
- First fix: prime the actual muted MILKSNB video with a synchronous play() in
  the original Start tap, then rewind/pause the hidden video. Keep source loaded.
- Milk phase only marked visible after successful play Promise resolution.
- If iOS still rejects playback at -5s, show a "Milchvideo jetzt abspielen"
  button, using a real user gesture to retry (including after timer zero).
- Priming is excluded from the "played" telemetry, and reset prevents late
  priming callbacks from disrupting a new timer session.
- Browser acceptance on iPhone is still unverified until the user retests.

## Cold-start iPhone issue (after working milk fix)

- User reports the very first Start tap counts down but video does not
  begin until another tap or a Reset. Subsequent attempts work.
- Identified risk: `show(0)` awaited `loadeddata` before calling `play()`,
  but iOS can defer the first video's data until play() is requested.
- Additionally `show(0)` awaited the pour-audio `play()` Promise, which could
  block phase completion/transition in Safari.
- Change: request fill.play() directly and synchronously in the initial
  tap, regardless of readyState; separate pour-audio Promise from
  phase transitions. Milk pre-authorization remains unchanged.
- Added diagnostics for fill video readyState/time/playing/rejection and
  tests for cold preload=0 plus a never-settling pour audio promise.
- Real first-start iPhone behavior must be confirmed; V2/lab/DB unaffected.

## 2026-11-04: explicit preload and synchronized first start

- iPhone test confirmed first Start has a video gap while countdown already runs.
- Apple WebKit does not guarantee a full data download for preload="auto".
- Dedicated fetch downloads the full initial MP4 into a same-origin Blob URL
  before enabling the first Start button in the separate timer diagnostic.
- Timer controller now waits for native video "playing" before setting deadline.
- If buffering occurs, visible "Video startet…" status remains and timer
  does not count down invisibly; Reset cancels an in-flight start.
- Added regression tests for video playback synchronization, cancellation,
  full prefetch and failed prefetch; iPhone verification remains pending.
- V2, global theme, component lab, Supabase untouched.

- Legacy clock-only controllers retain immediate starts even if their media
  adapter reports a playback error. Only the explicit startSynced method
  switches to video-confirmed countdowns.
- A failed initial MP4 download exposes a retry action in the test UI.

## 2026-11-04: Missing brew / steep transitions and reset frame

- User confirms first video works after explicit preload, but brew and
  looping steep do not display; first video remains on last frame until milk.
- Root in V3: show(1)/show(2) waited for Safari loadeddata before calling
  play(), which may never be dispatched until playback is requested.
- Explicitly fetch all four compact MP4s (sum < 1 MB) into Blob URLs before
  Start is enabled, with cleanup and cancellation on unmount.
- Brew and steep now call play() immediately without loadeddata gate; previous
  video remains visible until next play Promise succeeds.
- Reset/initial idle always display paused fill at currentTime=0.
- Existing milk preauthorization/transition and synchronized countdown retained.
- Added tests for no-loadeddata middle transitions, all four preloads, reset
  idle frame, and stale transition cancellation.
- Await real iPhone acceptance; no changes to V2, Supabase or MUI lab.


## 2026-11-04: real-device acceptance confirmed

- User confirmed everything works on the iPhone in the isolated timer test:
  video sequence, countdown, milk ending and first-frame Reset.
- Preserve commit d6bfbdba376dc9449400f33b910856871476976c as the
  device-accepted implementation reference for the existing controllers and
  diagnostic page.
- Introduced a new opt-in React hook/bridge (without modifying the accepted
  media controller, standalone test screen, application layout, MUI lab or DB).
- The bridge is tested for preload-before-start, direct tap actions, reset,
  cleanup, and stale async completion after unmount.
- Next: connect the adapter to a user-approved V3 interface; rerun on-device tests.

## 2026-11-04: white screen when closing selected tea with X

- Reproduced by code inspection: TeaTimer renders callback refs into a mutable
  `videoRefs.current` array and passed that same array to createMediaController.
  React sets callback refs to null on unmount. media.destroy() invokes reset()
  and dereferences each video in the now-null array, triggering TypeError and
  potentially crashing the React root (blank white screen on iPhone).
- Fix is strictly inside the new integration adapter:
  `const mountedVideos = videos.slice()` before constructing the media
  controller. Detached DOM nodes remain addressable for synchronous cleanup.
- Regression test simulates React clearing all 4 refs before effect teardown;
  asserts cleanup of every video succeeds without exceptions.
- Existing iPhone-approved media, timer, audio controllers and /timer-test/
  remain untouched. X continues to clear selection and return to search.

## 2026-11-04: Phase-1 functional QA baseline

- Created rollback branch `freeze/v3-2026-11-04-functional` at
  `b5b722620f913e40dec51dceaa0c95e4ca28470c`.
- Added `QA_V3.md`: 14 explicit manual acceptance cases with expected results.
- Added mock-only coverage of tea create/update payloads, invalid-input
  network protection, failure reporting, category aliases, dosage and X-close
  cleanup wiring. No real Supabase writes.
- Existing iPhone-confirmed `/timer-test/`, V2 source and media controllers unchanged.
- Next manual gate: QA-06 through QA-09 inside the integrated main V3 app
  (not just standalone timer test). Real DB writes remain gated pending a
  dedicated test environment.

## 2026-11-04: User acceptance, integrated V3 app

- User explicitly confirmed previous checklist points 1 and 2 working in the V3 main app on iPhone.
- Confirmed: first timer start, complete four-video sequence, Reset and restarting, closing selected tea while timer running, selecting another tea without a white screen or ongoing media.
- Pause/Resume in the integrated app is not separately confirmed by this feedback; QA-08 stays partially open.
- Next manual acceptance: QA-04 and QA-05 (quantity/dosage for preset and custom 900 ml); no write operations necessary.

## 2026-11-04: user confirms preset and custom dose calculations

- User confirmed checklist point 3: switching 250/500/1000/1500 ml and custom 900 ml updates dosage as expected in integrated V3.
- QA-04 and QA-05 accepted on actual iPhone. Next: QA-11 to QA-13 form and photo barcode checks, without production database writes.

## 2026-11-04: Figma Phase 1A Home only

- Figma 01 · Home (node 19:47), source screenshot 375 × 812.
- User approved primary label "Fancy a Cuppa" (visually uppercase per Figma).
- Implemented Figma-aligned white home canvas, 66px exact Figma SVG
  plus/minus controls, 28px Bold time label, exact 66px pill buttons at
  82px and 8px from the bottom and 375px horizontal reference.
- Quick minute selection defaults to 2 and persists under isolated V3 key.
- Existing tea assistant below Home stays functional; secondary button
  opens it by smooth scrolling without introducing a separate route.
- The primary action is EXPLICITLY a temporary English notice: auto-start
  of the separate quick timer belongs to Phase 1B and is not claimed working.
- No timer/audio/media controllers, standalone /timer-test/, Supabase data
  adapters, V2 or MUI lab changes. Pre-implementation fallback branch:
  freeze/v3-before-figma-phase1a at `9568483a62fae87c4a33e0eae6174d7711f6db04`.
- Next: Phase 1B direct BREW tap to standalone timer view must retain the
  original iPhone media user-gesture semantics and preload all four clips
  before enabling Start. Then obtain real iPhone acceptance.

## 2026-11-04: approved Phase 1A navigation refinement

- User accepted Home layout and +/- minutes; requested primary label
  "Fancy a Cuppa?" with a literal question mark.
- "How do you take it?" is now a reversible selected-state control:
  grey when inactive; Figma dark grey #323234 with white type while
  the assistant area is active.
- On Home-to-assistant scroll the *same button* follows page until its
  top reaches 12px, then is position:fixed at 12px. Tapping it again
  scrolls smoothly to Home; on return it resumes its original bottom
  position and inactive colour. Manual scrolling is handled too.
- Assistant content receives sufficient top clearance so the pinned
  button does not obscure content. Tea Detail Figma implementation is
  still Phase 2; existing V3 search/card/dosing is retained unchanged.
- No changes to V2, validated timer/audio/media controllers or Supabase.

## 2026-11-04: Home assistant button press semantics and eased scrolling

- Selection is now toggled immediately on the "HOW DO YOU TAKE IT?"
  button press; passive scroll/resize events ONLY update its 12px pinned
  position and NEVER change selected colour.
- Pressing selected button immediately deselects (light grey) and
  programmatically returns to Home. The dark/grey state updates before
  starting the motion in the next animation frame.
- Smooth scroll now uses decelerating ease-out cubic with distance-aware
  duration 300–560ms rather than browser-defined native smooth behaviour.
- Touch/pointer, wheel and keyboard can interrupt scripted motion.
  Repeated pressing reverses the movement without a queued animation.
- iOS Reduce Motion preference bypasses animation.
- No changes to V2, Supabase, /timer-test/, or validated
  timer/audio/media controllers. Tea Detail Figma remains separate phase.

## 2026-11-04: correction after iPhone screen recording

- Source: user-provided 6.5-second screen recording. Visible content moves
  continuously, but the assistant button visibly snaps at the moment
  JS toggles absolute placement to fixed placement near the top.
  The reverse journey shows the same mismatch.
- Replaced JS observer / `assistantPinned` state and fixed positioning with
  one native CSS sticky wrapper in normal document flow (top 12px).
- Initial location retains original Figma bottom-8px placement via
  `margin-top:-74px; height:66px; margin-bottom:8px`; the 8px
  compensation keeps the lower content anchor exactly where it was.
- Selected state still changes on press only, independently of scroll
  position. Existing 300–560ms ease-out scroll controller unchanged.
- No changes to iPhone validated video/audio/timer controller, media files,
  /timer-test/, V2, Supabase, or existing Tea Detail features.
- New mobile video check required to confirm elimination of visual snap.

## 2026-11-04: Phase 1B Quick Timer (Home -> dedicated view)

- QuickTimerView is mounted behind Home at all times and calls the
  existing useTeaTimer adapter / createTeaTimerSession. Four short MP4s
  preload as blobs on first render, BEFORE enabling Home start.
- The Home "FANCY A CUPPA?" button calls quickTimerRef.begin(seconds)
  synchronously inside the tap. begin() invokes setSeconds() and start()
  with no Promise/await or delayed effect between them; required for iOS.
- On success Home is covered by a full-viewport timer view. Pause/Resume,
  Reset, Back to Home use existing session actions. Back resets immediately;
  timer remains mounted/preloaded so repeated starts do not stall.
- Timer-view button styling matches Home: primary #782B40,
  secondary #EEEEEC, height 66px, radius 100px, Roboto Mono 16/600.
- Rest of timer layout is provisional pending approved Figma design.
- Preloader error enables a retry action; no pretend auto-start after an
  asynchronous preload (Safari user activation would be lost).
- Regression tests added; QA_PHASE_1B.md documents real iPhone acceptance.
- Validated timer/audio/media controllers, standalone /timer-test/, V2,
  Supabase, MUI Lab remain unchanged.

- iPhone playback guard: `flushSync(() => setQuickTimerOpen(true))` makes the previously pre-mounted video container visible synchronously within the original tap BEFORE invoking media.play/unlock; avoids starting under an inert/opacity-zero ancestor and preserves user activation.

## 2026-11-04: first iPhone QuickTimer video failure / recovery

- User-provided 73s iPhone recording inspected (25 sampled frames).
  Countdown continues with the initial cup image nearly static after the
  Fill sequence; no visible Brew/Steep/Milk progression during the minute.
- Suspected integration-specific cause: QuickTimerView preloads all four
  videos under an opacity-zero ancestor, unlike the approved visible
  inline TeaTimer and /timer-test/. WebKit may defer decoded frames or
  suspend playback for video elements composited as fully transparent.
- Adapter presentation fix: persistent QuickTimerView now remains an opaque,
  normal-compositing layer BEHIND the opaque Home/assistant page while idle.
  Only z-index/pointer events change when active; this keeps the existing
  user-tap media start and preloaded video DOM elements.
- Added video-currentTime watchdog (4.5s unchanged with running countdown),
  explicit-tap RESTART VIDEO & TIMER, missed milk PLAY MILK VIDEO retry
  via existing session.retryMilk(), plus visible stage label for diagnosis.
- BACK TO HOME is now top control; RESET is wired separately and never calls
  onClose. Removed duplicate reset in parent close action.
- Core timer/audio/media controllers, useTeaTimer adapter and /timer-test/
  unchanged. Need real iPhone validation; simulator/CI cannot confirm Safari
  media compositor behaviour.
