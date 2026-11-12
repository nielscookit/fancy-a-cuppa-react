# Fancy a Cuppa V3 – native iOS integration

Source branch: `feature/native-ios`. The React Web/PWA remains the baseline. Do not change V2, main, Pages deployment, UX, or Supabase.

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
- Local notification sound is the **system tone only** in phase 1. A bundled custom Ready sound (CAF/WAV) is **not yet implemented or tested**. No new audio background-mode entitlement is requested.
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
4. Design and add a short valid native Ready sound asset with correct iOS bundle inclusion; verify actual delivery and suppression on physical iPhone.
5. Review desired notification behavior when the app is installed both as PWA and native app (separate installations may still each have pending notifications).
