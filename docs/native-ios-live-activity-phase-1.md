# Fancy a Cuppa V3 — Live Activity Phase 1 prototype

**Status: isolated native source added; iPhone device acceptance not yet established.**
Source branch: `feature/native-ios`. No React Timer, media, audio, or notification integration.

## Implementation

- Xcode target `FACLiveActivityExtension` embedded inside `App.app/PlugIns`.
- Shared ActivityKit model lives in `ios/App/LiveActivity/FACActivityAttributes.swift` and belongs to both targets.
- Native SwiftUI Live Activity lives in `ios/App/LiveActivity/FACLiveActivityWidget.swift`.
- The existing iOS app icon PNG is linked into the extension's resources (no substitute symbol); the WidgetKit view explicitly loads this loose PNG from the extension bundle, rather than assuming an asset-catalog entry.
- The host app's `NSSupportsLiveActivities` is enabled in `ios/App/App/Info.plist`.
- No JavaScript bridge is installed in Phase 1. The Debug launch hook lives in `SceneDelegate.sceneDidBecomeActive` (the app uses iOS scenes); `AppDelegate` is unchanged.
- **Font caveat:** Roboto Mono is not bundled as a native font. The temporary system monospaced fallback requires a separate licensed font asset and design comparison before final approval.
- `context.isStale` is used as a test-only READY candidate; exact 0:00 repaint is not guaranteed or approved yet.
- Dynamic Island is represented by a minimal required WidgetKit fallback; not a product feature.

## Device procedure (iPhone 13 mini)

1. On the Mac, update the native branch and rebuild with `npm ci && npm test && npm run sync:media && npm run build:native && npx cap sync ios && npx cap open ios`.
2. In Xcode, confirm the new target `FACLiveActivityExtension` appears and that the **existing personal development team is preserved** for the App target. The extension may require selecting the same team locally. Do not commit personal signing credentials.
3. Edit Scheme → Run → Arguments Passed On Launch: add **one** argument `-FACLiveActivityPrototype`.
4. Select the iPhone 13 mini, run the main `App` scheme, then lock the iPhone. The prototype requests a 120-second Live Activity on first foreground activation. Check countdown, original icon, background and the Figma opaque presentation.
5. For the translucent alternative, replace the launch argument with `-FACLiveActivityPrototypeTranslucent`, run again and compare.
6. For an immediate READY mockup, use `-FACLiveActivityPrototypeFinished`. This is a static finished test, not proof of background deadline completion.
7. To clear prior Phase 1 prototypes, use `-FACLiveActivityPrototypeReset` and run once.
8. Remove the Xcode launch argument afterward. Without it, the app has **no prototype side effects**. Existing timer and local notifications remain unchanged.

### Acceptance criteria for Phase 1

- Xcode compiles the app and embedded extension (both targets).
- Real iPhone lock screen shows `Fancy a Cuppa?`, `Brewing your Tea`, the actual app mark and a running countdown.
- The countdown continues when locked or in another app, without React timers.
- Screenshot review against Figma node [357:237](https://www.figma.com/design/3BnWs9duEWUJ3BAQ3JkY0F?node-id=357-237).
- Test prototype finished text `Your cuppa is ready` and `READY`, with limitations documented.
- **Not** acceptance of the integrated React timer, Deep Link, automatic READY, force-quit handling, or full native design freeze.

### Safety

`main`, V2, web/PWA, Supabase, timer controller, media controller and local notification controller must stay untouched. Preserve the native UI-/Design-Freeze `fe51fdc` and Timer-/Media-Freeze `f858e63`. Do not uninstall the app to troubleshoot icon caching without checking local data.

## iPhone 13 mini – first device observations (14 Nov 2026)

- Confirmed by user screenshots: iOS offered Live Activity authorization; running countdown was visible while locked and advanced from 1:20 through 1:07 to 0:54.
- Confirmed by user screenshot: finished layout displayed `Your cuppa is ready` and `READY`. Exact deadline repaint timing has **not** been proven.
- Confirmed by user: tapping the Live Activity opened Fancy a Cuppa. Restoration of a production React timer remains outside Phase 1.
- Defect discovered: the app icon slot remained empty despite the PNG being embedded in the widget bundle. The explicit bundle-PNG lookup is a candidate correction and **requires another physical-device check**.
