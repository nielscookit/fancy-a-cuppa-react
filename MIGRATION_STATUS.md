# Fancy a Cuppa V3 — migration status

## Completed

1. V2 repository audited; production V2 untouched.
2. React/Vite/MUI scaffold, pinned lockfile, global Roboto Mono.
3. Independent GitHub Pages deployment.
4. Supabase catalog REST/Edge Function adapter; live read verified, writes mocked.
5. Component Lab as independent Vite entry:
   - /fancy-a-cuppa-react/lab/
   - Real MUI TextField, Select, Autocomplete, Button
   - Interactive variant, height, radius, semantic color, state
   - Lab-only React state/sx, no global theme edits or database calls
   - Responsive iPhone layout, no new packages

## Next

Port media/timer logic into React-independent controller in src/timer.
Test repeatable playback on iPhone before further migration.
