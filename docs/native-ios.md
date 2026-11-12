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

1. On a checkout of `feature/native-ios` with network access, run `bash scripts/setup-native-capacitor.sh`. It pins `@capacitor/core`, `@capacitor/ios`, and `@capacitor/cli` to version `8.6.0`, regenerates `package-lock.json` using npm, runs checks/builds, and does **not** commit or deploy. Review and commit both manifests together. Never hand-edit dependency integrity hashes.
2. Verify `npm ci`, `npm test`, `npm run build`, and `npm run build:native` pass. These commands are included in the setup script; inspect its output and validate relative CSS/JS/media references in `dist-native/`.
3. The existing project excludes generated media from Git. Run the established `npm run sync:media` step before a complete native bundle build.
4. On a supported macOS/Xcode environment, run `npx cap add ios`, then `npx cap sync ios`, inspect/check in the generated `ios/` project on this branch.
5. Compile with Xcode or a dedicated GitHub macOS build workflow, **without triggering the existing Pages deployment**.
6. Test on a physical iPhone: offline/static assets, Supabase, video autoplay/unlock, pause/resume/restore, and notification permissions.
7. Implement native notification scheduling/cancellation, custom sound asset, and one-notification-per-finish policy. Review iOS background/foreground behavior.

## Known validation boundary

At this point the exact package versions have been chosen and the reproducible setup script committed, but the current source tree still lacks the actual Capacitor npm dependencies and updated lockfile: the current execution environment cannot reach npm or GitHub via shell, and the existing GitHub Actions queue is blocked. The script has not run. Do not claim installation or build success. The native iOS project is not yet generated. Successful native compilation and iPhone behavior are **not claimed**.
