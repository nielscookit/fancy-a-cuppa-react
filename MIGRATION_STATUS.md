# Fancy a Cuppa V3 — migration status

## Milestone 1: V2 audited (read-only)

- V2 repository: nielscookit/fancy-a-cuppa
- Main reference: 203782e33b4d52184091c171008bccdbb6437057
- Earlier freeze reference: ae86dd38d3ea0eaf37fc55dac3d2ccbe777e67c5
- Latest source is referenced but not backed up by a newly created V2 branch.
- Productive URL could not be freshly verified from this runtime.
- V2 repository unchanged, Supabase unchanged.

## Milestone 2: Independent V3 scaffold

- New repository nielscookit/fancy-a-cuppa-react
- React / Vite / MUI; global Roboto Mono
- Base path /fancy-a-cuppa-react/
- No productive Supabase connectivity; writes blocked
- V3-only localStorage prefix fac-v3:
- GitHub Actions Pages workflow included
- Local Node syntax and built-in tests passed before publication
- npm install / automated tests / production build succeeded on GitHub Actions
- package-lock.json generated in CI and committed; deployments now use npm ci
- Live Pages activation/deployment pending a repository Pages setting

## Next

- Inspect initial GitHub Actions run and verify the Pages deployment.
- Generate and commit package-lock.json after registry-backed installation.
- Phase 3: isolated, framework-independent timer + media controller with iPhone repeatability tests.
