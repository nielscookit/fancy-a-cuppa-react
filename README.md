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

## Current status and next stage

Timer and push acceptance on the user's iPhone is complete. See
[QA_V3.md](QA_V3.md) for the current record; old migration plans are historical.
The [native iPhone app concept](docs/native-iphone-concept.md) describes a proposed
separate iOS client, reliable local alerts and distribution to friends. It is a
concept only, not a built or released native app.

## Timer and media

The framework-independent controllers in `src/timer/` mirror the V2 deadline,
30-second reminder, 5-second milk animation, finishing sound and established
four-video sequence. The production timer lives on Home; the diagnostic pages
remain separate. Current Home playback uses the Timer Kit media controller.

Video and audio assets are downloaded from a **pinned V2 commit**, checked by
Git blob SHA-1 and included in the separate V3 build. The live V3 page
does not load media from V2 URLs. No binary files are committed, and V2 is
never modified.

Real iPhone acceptance is complete. Relevant future timer changes require
targeted regression checks; CI alone cannot prove iPhone media behavior.

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

The V3 app connects to the existing Supabase project using a public
publishable key and RLS-protected REST queries. Existing Add/Edit forms
write through the pre-existing community-tea Edge Function. No database
connection or write functions are used in /lab/ or /timer-test/.
