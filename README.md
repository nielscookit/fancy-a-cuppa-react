# Fancy a Cuppa V3 — React / Vite / MUI

Phase 2 scaffolding only. No timer/media port and no UX redesign yet.

## Production safety

- Existing V2 repository nielscookit/fancy-a-cuppa remains untouched.
- No Supabase URL, key, data migration, schema change or production write access is present.
- All V3 write operations are deliberately disabled.
- V3 localStorage keys have prefix fac-v3: to avoid collisions on nielscookit.github.io.
- GitHub Pages deployment is separate from V2 and does not switch the production URL.

## Requirements

Node.js >=22.12.0, npm.

## Development

```bash
npm install
npm run check:safety
npm test
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

Registry-backed npm install, automated tests and Vite production build passed in GitHub Actions. The generated package-lock.json is committed for reproducible installs, and deployment uses npm ci.

## GitHub Pages

Repo: https://github.com/nielscookit/fancy-a-cuppa-react

GitHub -> Settings -> Pages -> Build and deployment -> Source: GitHub Actions.

Intended development URL (must verify first):
https://nielscookit.github.io/fancy-a-cuppa-react/

## V2 reference, read-only

- V2 code: https://github.com/nielscookit/fancy-a-cuppa/tree/main/app-v2
- Existing main SHA as inspected: 203782e33b4d52184091c171008bccdbb6437057
- Earlier freeze SHA: ae86dd38d3ea0eaf37fc55dac3d2ccbe777e67c5
- Updated V2 main SHA is a reference, not a new backup artifact.

## Next

Port timer/media controller as a React-independent module from V2. Verify repeated playback on iPhone before migrating forms, search or Supabase.
