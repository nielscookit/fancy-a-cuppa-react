# V3 custom timer sounds

Upload the new audio files here without replacing the original media:

- `Memo.mp3`: active Almost Time cue (30 seconds remaining).
- `Ready.mp3`: active completion cue; repeats in the foreground until Reset.

Selection is centralized in `src/timer/homeSoundProfile.js`. Change
`ACTIVE_HOME_SOUND_PROFILE` from `memo-ready` to `original` to restore the previous
Home sounds and their single-play behavior. Original `AlmostTime.mp3` and `tea-finished.mp3`
remain available through the pinned V2 media manifest and build process.

Reset, teardown and hiding the app stop playback. Returning to the app never
restarts an old alarm. iPhone Web Push cannot play these MP3 files or provide a
continuous custom alarm on the lock screen. Diagnostic pages retain their
original sound profile. Uploading other files does not automatically select them.
