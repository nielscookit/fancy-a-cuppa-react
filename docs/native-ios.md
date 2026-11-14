# Fancy a Cuppa V3 – native iOS integration

Source branch: `feature/native-ios`. The React Web/PWA remains the baseline. Do not change V2, main, Pages deployment, UX, or Supabase.

**Freigegebener nativer UI-/Designstand:** [UI-/Design-Freeze 01 · Quellstand `fe51fdc`](native-ios-ui-design-freeze-01.md). Dieser dokumentiert die aktuelle iPhone-Oberfläche; Live Activity, iOS-Notification-Icon, Sperrbildschirm-Mediensteuerung und ausstehende Systemtests sind nicht mit eingefroren.

## Current native setup

- Capacitor Core/iOS/CLI 8.6.0 and Local Notifications 8.3.1 are pinned in package.json and lockfile.
- `vite.native.config.js` produces `dist-native/` with relative URLs. The existing Pages build is separate.
- The generated Xcode project is in `ios/App/`. A successful unsigned simulator build is not an iPhone device test.
- `capacitor.config.json` uses `LocalNotifications.presentationOptions: []` to suppress notification UI/sound **while the native app is in the foreground**. Foreground playback remains the original React/Web Audio controller.

## Phase 1: native completion notification

- `src/push/usePushNotifications.js` selects exactly one implementation: the existing Supabase Web Push for browsers/PWA, or `src/push/nativeNotificationController.js` for native Capacitor.
- React HomeScreen, timer controller, videos, Memo and Ready MP3 playback are unchanged.
- Native controller receives the *existing* absolute deadline via `onPersist` from the timer. It uses a fixed notification ID, replacing the previous schedule on resume and cancelling on pause/reset/finish.
- It checks permissions without a prompt at mount and requests them only through the existing Start/BREW gesture.
- Native operation calls are serialized, so a stale schedule cannot remain after a later cancellation.
- Native notifications now request `Ready.caf` (IMA4/CAF) instead of the iOS system tone. The original `public/audio/Ready.mp3` remains unchanged for foreground playback and the PWA.
- `scripts/prepare-ios-ready-sound.sh` uses macOS `afconvert` and `afinfo` to produce a compliant file from the original MP3; conversion fails if duration cannot be verified or is >=30 seconds. No trimming or playback changes.
- The Xcode project explicitly includes `ios/App/App/Ready.caf` as a resource at the **main `.app` bundle root**, not just in Capacitor's WebView assets. `.github/workflows/native-ios-xcode.yml` checks the built product contains the exact generated CAF and commits the native binary only after a successful build.
- No audio background-mode entitlement is requested. iOS notification presentation is still suppressed in the foreground via `LocalNotifications.presentationOptions: []`.
- Actual delivery, foreground suppression, permission prompts, lock screen and iOS interruption cases require physical iPhone testing.

## Verification

- `node --test` covers scheduling, fixed-ID deduplication, pause/resume, reset, permissions and overlapping async actions.
- The isolated workflow `.github/workflows/native-capacitor-build.yml` can regenerate lockfile and test both Web/PWA and native WebView builds without deploying.
- `.github/workflows/native-ios-xcode.yml` validates an unsigned Simulator Xcode compilation on a macOS runner, **not** a signed device build.
- Do not describe a workflow configuration commit as build success until its run concludes successfully.

## Next work

1. Run unit tests and Web/native WebView builds after plugin installation.
2. Run `npx cap sync ios` and unsigned Xcode Simulator build; review generated iOS project changes.
3. Test on iPhone with Start, Pause, Resume, Reset, app open/locked/reopened, and permission denied/granted.
4. Confirm the macOS runner converted and included Ready.caf in the final Xcode bundle, then verify actual delivery and suppression on a physical iPhone.
5. Review desired notification behavior when the app is installed both as PWA and native app (separate installations may still each have pending notifications).

## Ready sound validation boundaries

- The custom sound has been referenced in the notification adapter and Xcode project. Actual `Ready.caf` conversion and inclusion are **only verified after** the updated macOS Actions job completes successfully; no green build is assumed merely from workflow creation.
- Apple's local-notification sound limit is less than 30 seconds, and iOS system settings (Silent Mode, Focus, notification permissions) may suppress playback. A native local notification cannot loop until RESET.
- Never alter the existing React foreground `Ready.mp3` or PWA server-based Web Push as part of native sound preparation.
