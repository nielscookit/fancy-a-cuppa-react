# Fancy a Cuppa V3 — React / Vite / MUI

Independent V3 repository. The functioning V2 application, database schema and
existing database records remain untouched.

## Current direct GitHub Pages URLs

- Main technical V3 app: https://nielscookit.github.io/fancy-a-cuppa-react/
- MUI component lab: https://nielscookit.github.io/fancy-a-cuppa-react/lab/
- Independent iPhone timer/media diagnostic: https://nielscookit.github.io/fancy-a-cuppa-react/timer-test/

The component lab imports the existing ThemeProvider/Roboto Mono but has its own
Vite HTML entry. It previews real MUI TextField/Select/Autocomplete/Button with
local variant/height/radius/color/state controls. Lab state does not touch the
global theme, App, timer or Supabase.

## Isolated timer migration

The framework-independent controllers in `src/timer/` mirror the V2 deadline,
30-second reminder, 5-second milk animation, finishing sound and established
four-video sequence. The UI is intentionally only a diagnostic test page.

Video and audio assets are downloaded from a **pinned V2 commit**, checked by
Git blob SHA-1 and included in the separate V3 build. The live V3 page
does not load media from V2 URLs. No binary files are committed, and V2 is
never modified.

**Required acceptance gate:** repeat video/sound on a real iPhone Safari, test
pause/resume, finishing cues, screen lock, going background/foreground. CI JS
tests cannot prove mobile Safari media autoplay rules.

## Development

```bash
npm ci
npm run check:safety
npm test
npm run verify:catalog
npm run sync:media
npm run build
npm run verify:pages
npm run dev
```

## Database

Main V3 test app connects to the existing Supabase project using a public
publishable key and RLS-protected REST queries. Writes from future forms
will go through the pre-existing community-tea Edge Function. No database
connection or write functions are used in /lab/ or /timer-test/.
