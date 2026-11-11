import { createAudioController } from './audioController.js';

// Change this one value to 'original' to restore the previous Home cues.
export const ACTIVE_HOME_SOUND_PROFILE = 'memo-ready';
export const HOME_SOUND_PROFILES = Object.freeze({
  original: Object.freeze({ soundFiles: Object.freeze({}), loopFinished: false }),
  'memo-ready': Object.freeze({
    // assetBase points to the existing V3 /media/ directory.
    soundFiles: Object.freeze({ almostSound: '../audio/Memo.mp3', finishSound: '../audio/Ready.mp3' }),
    loopFinished: true,
  }),
});

export function createHomeAudioController(options, profile = ACTIVE_HOME_SOUND_PROFILE) {
  if (!HOME_SOUND_PROFILES[profile]) throw new Error('Unknown Home sound profile.');
  return createAudioController({ ...options, ...HOME_SOUND_PROFILES[profile] });
}
