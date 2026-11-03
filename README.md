# Fancy a Cuppa V3 — React / Vite / MUI

V3 is an isolated development repository. The V2 repository is unchanged.

## Apps / URLs

- Technical V3 test page: https://nielscookit.github.io/fancy-a-cuppa-react/
- Independent MUI component lab: https://nielscookit.github.io/fancy-a-cuppa-react/lab/

The lab has its own HTML entry (`lab/index.html`) and React root (`src/lab/main.jsx`).
It uses the shared read-only theme definition (`src/theme.js`) with Roboto Mono.
All preview overrides are local `sx` props; no theme object or global styles are mutated.
No lab component imports the Supabase repository or timer.

The current lab previews real MUI TextField, Select, Autocomplete and Button:
variant, height (px), radius (px), semantic theme color and available interaction
states. Preview values remain only in React state; no persistence or API writes.

## Database

The V3 main test page uses the existing Supabase catalog with publishable key
and public RLS-protected REST reads. Explicit create/update actions use the
existing Edge Function `community-tea`; the lab never does. Live CI runs
read-only integration checks, with writes mocked.

## Development

```bash
npm ci
npm run check:safety
npm test
npm run verify:catalog
npm run dev
```

Locally open /fancy-a-cuppa-react/lab/ (or /lab/ if using vite's dev fallback);
the production build publishes the exact /fancy-a-cuppa-react/lab/ path.

## Deployment

Push to main triggers a pinned-dependency `npm ci`, safety check,
tests, live Supabase read, multi-page Vite build and GitHub Pages deployment.

## V2 isolation

- Repository: nielscookit/fancy-a-cuppa; inspected SHA 203782e33b4d52184091c171008bccdbb6437057.
- Existing earlier freeze SHA ae86dd38d3ea0eaf37fc55dac3d2ccbe777e67c5.
- Do not alter V2 sources during V3 migration.
- Keep React-independent media controller in src/timer, with iPhone-repeatability tests before further migration.
