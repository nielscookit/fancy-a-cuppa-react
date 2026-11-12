# Fancy a Cuppa V3 – native iOS preparation

Status: **Scaffold only** on `feature/native-ios`. No iOS/Xcode project has been generated, compiled, signed or installed.

## Scope and invariants

- React/MUI, timer, media, Supabase and the approved Figma UI remain the source of truth.
- The existing `npm run build` and GitHub Pages workflow stay unchanged.
- The native WebView bundle uses `vite.native.config.js`: relative asset base (`./`), app entry only, output `dist-native/`.
- `capacitor.config.json` points to `dist-native/`. Bundle identifier `com.fancyacuppa.app` is **provisional** and must be confirmed before signing/distribution.
- Never use `server.url` to ship the public website inside the native app.
- Do not enable native local notifications alongside web push until deduplication and lifecycle have been implemented.

## Next steps (not yet executed)

1. Resolve compatible pinned Capacitor core/CLI/iOS versions, add them to `package.json`, and regenerate `package-lock.json` with npm. Never hand-edit dependency integrity hashes.
2. Run `npm ci`, `npm test`, `npm run build`, and `npm run build:native`. Validate relative CSS/JS/media references in `dist-native/`.
3. The existing project excludes generated media from Git. Run the established `npm run sync:media` step before a complete native bundle build.
4. On a supported macOS/Xcode environment, run `npx cap add ios`, then `npx cap sync ios`, inspect/check in the generated `ios/` project on this branch.
5. Compile with Xcode or a dedicated GitHub macOS build workflow, **without triggering the existing Pages deployment**.
6. Test on a physical iPhone: offline/static assets, Supabase, video autoplay/unlock, pause/resume/restore, and notification permissions.
7. Implement native notification scheduling/cancellation, custom sound asset, and one-notification-per-finish policy. Review iOS background/foreground behavior.

## Known validation boundary

The current source tree supports preparation of the web asset build; it does not yet contain the Capacitor npm dependencies or generated iOS project. Successful native compilation and iPhone behavior are **not claimed**.
