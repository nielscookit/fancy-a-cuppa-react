# V3 Phase 1B – Quick Timer acceptance on iPhone

1. Open Home. While the four clips are downloading, FANCY A CUPPA? is temporarily disabled.
2. Set 2 MIN → 3 MIN using + and tap FANCY A CUPPA?.
3. A separate timer view appears immediately. Countdown must begin when the first Fill video actually plays.
4. Video order remains Fill → Brew → Still Loop → Milk, with all original V2 sounds.
5. Tap PAUSE, then RESUME. Clock and video continue in sync.
6. Tap RESET. Clock returns to 3 minutes and first Fill frame remains visible.
7. Tap BACK TO HOME during playback. All playback stops; Home returns with the chosen 3 MIN.
8. Tap FANCY A CUPPA? again without reloading. Video and timer start reliably from frame one.
9. Select a different minute duration on Home, start again. Verify the new time is used.
10. Navigate HOW DO YOU TAKE IT? and check the pre-existing tea catalog/TeaTimer remains functional.
11. Repeat from iPhone Safari (or ChatGPT in-app browser); check no autoplay-blocked or blank videos.

Do not modify V2, the separate /timer-test/ page, the tested controllers or the production Supabase data.
Timer visuals are interim; only the pill button styling matches Home design at this phase.

## 2026-11-04: retest after user screen recording

- User video shows countdown progressing 60→0 while cup imagery remains almost
  static after the first seconds. The Brew/Steep/Milk progression was not visible.
- Keep Home video session mounted but render it *under* the opaque Home page
  at normal opacity instead of as an opacity:0 video overlay; show on tap
  through z-index promotion without a compositor opacity switch.
- Visual stage label indicates Fill/Brew/Steep/Milk in the provisional UI.
- A 4.5s video-currentTime watchdog warns of a stalled phase and offers
  an explicit-tap RESTART VIDEO & TIMER recovery.
- If milk does not appear by the last 2s or at finish, PLAY MILK VIDEO is
  available via the existing validated retryMilk action.
- BACK TO HOME moved to top to avoid iPhone bottom-browser controls.
  RESET does not close the overlay.
- Verify on the user's real iPhone before marking any of these fixes accepted.
