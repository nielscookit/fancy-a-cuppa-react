# Fancy a Cuppa V3 — React / Vite / MUI

Phase 2: React scaffold plus connection to the existing Supabase test catalog. The V2 repository and database schema remain untouched. No timer/media port and no UX redesign yet.

## Catalog API

- V3 uses the existing Supabase project's **publishable** key for anonymous public RLS-protected REST reads.
- Reads public published teas and nested tea_preparations; barcode lookups read tea_codes.
- createTea/updateTea use existing community-tea Edge Function; no direct table writes or service role credentials.
- Deletion is unsupported in the V2 API and remains unsupported in V3.
- Live CI integration test uses reads only; write requests are tested with mocked fetch.
- A temporary debug page shows catalog status and tea names, not the approved product UI.
- No new npm dependencies were added for the database.

## Development

```bash
npm ci
npm run check:safety
npm test
npm run verify:catalog
npm run dev
```

## Deploy

GitHub Actions tests and builds on each push to main.

- Source: GitHub Actions
- URL: https://nielscookit.github.io/fancy-a-cuppa-react/
- Vite base: /fancy-a-cuppa-react/
- Browser localStorage keys have prefix fac-v3:

## V2 isolation

- Existing V2: nielscookit/fancy-a-cuppa, SHA 203782e33b4d52184091c171008bccdbb6437057 as reviewed.
- Existing earlier freeze SHA ae86dd38d3ea0eaf37fc55dac3d2ccbe777e67c5.
- Same Supabase project, but no table/schema/Edge Function modifications.
- UI elements will be migrated only after an independently functioning media controller is tested on iPhone.

## Next

Port the timer and media controller as a React-independent module while preserving V2 iPhone behavior.
