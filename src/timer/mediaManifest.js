/**
 * Pinned, known-working V2 media content from the read-only production repository.
 * These are Git blob SHA-1 values, checked before any downloaded bytes are used.
 */
export const V2_SOURCE_COMMIT = '203782e33b4d52184091c171008bccdbb6437057';
export const V2_SOURCE_REPO = 'nielscookit/fancy-a-cuppa';

export const MEDIA_ASSETS = Object.freeze({
  fill: Object.freeze({ file: 'FIllSNB.mp4', sha: '5093267f4848bd9591f3527507c405dc09bc8b6d' }),
  brew: Object.freeze({ file: 'brewSNB.mp4', sha: 'dde1d38d741824f7748cc429f78b98bb71fb4776' }),
  steep: Object.freeze({ file: 'stillSNB.mp4', sha: '23c3e4ba1dee30d14944d9ba8d044f3b2f6e5eb7' }),
  milk: Object.freeze({ file: 'MILKSNB.mp4', sha: '1b91d794e985cc99d5f4aae823ce530746fd3118' }),
  pourSound: Object.freeze({ file: 'BrewNEW2.mp3', sha: 'a76883e3187e35b33f2a1783adf89b9cc36056df' }),
  bubbleSound: Object.freeze({ file: 'BlubbKlein.mp3', sha: '9300ad4dc71edf2712daf1ff55307a95106a6653' }),
  milkSound: Object.freeze({ file: 'BlubbMILCH.mp3', sha: '4b38714331129772604ac44d22f7c5287968d409' }),
  almostSound: Object.freeze({ file: 'AlmostTime.mp3', sha: 'fc14fe2fa133f3a03fb6e2a537cd01f499ccd86d' }),
  finishSound: Object.freeze({ file: 'tea-finished.mp3', sha: '9bf8e902f56c4b2df8a692fe32fc4a0ba5be3e84' }),
  clickSound: Object.freeze({ file: 'click2.mp3', sha: 'f96a638d5f3ae28c3cfff5878f13dcfeabc532ac' }),
});
