# Fancy a Cuppa V3 — migration status

## Milestone 1: V2 audited (read-only)

- Repository: nielscookit/fancy-a-cuppa
- Production V2 source commit (reviewed): 203782e33b4d52184091c171008bccdbb6437057
- Earlier freeze commit: ae86dd38d3ea0eaf37fc55dac3d2ccbe777e67c5
- Neither repository nor database schema changed during preparation.

## Milestone 2–5: isolated React V3 foundation

- Repository: nielscookit/fancy-a-cuppa-react
- React / Vite / MUI; global Roboto Mono
- Page path: /fancy-a-cuppa-react/
- package-lock.json pinned; npm ci used
- GitHub Pages deployment previously succeeded
- V3 browser storage namespaced fac-v3:

## Milestone 6: Supabase adapter

- Existing DB explicitly authorized for V3 development: user says current rows are test data.
- No schema migration, Edge Function deployment, RLS edits, or existing data changes.
- Public publishable key; server-side RLS for public reads.
- Existing Edge Function community-tea for explicit create/update only.
- Barcode lookups preserved; normalized records compatible with V2.
- Tests mock writes; live CI integration check reads without modifying records.
- No UI redesign: technical catalog status only.

## Next

Migrate framework-independent timer and media controller from V2 and run repeated iPhone tests before adding other UI.
