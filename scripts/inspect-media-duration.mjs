import { readFileSync } from 'node:fs';

export function listBoxes(data, start = 0, limit = data.length) {
  const found = [];
  let p = start;
  while (p + 8 <= limit) {
    let size = data.readUInt32BE(p);
    const type = data.toString('ascii', p + 4, p + 8);
    let header = 8;
    if (size === 1) {
      if (p + 16 > limit) break;
      size = Number(data.readBigUInt64BE(p + 8));
      header = 16;
    } else if (size === 0) size = limit - p;
    if (!Number.isSafeInteger(size) || size < header || p + size > limit) break;
    found.push({ type, dataStart: p + header, end: p + size });
    p += size;
  }
  return found;
}

export function mp4DurationSeconds(data) {
  const moov = listBoxes(data).find(box => box.type === 'moov');
  if (!moov) throw new Error('Missing moov atom');
  const mvhd = listBoxes(data, moov.dataStart, moov.end).find(box => box.type === 'mvhd');
  if (!mvhd) throw new Error('Missing mvhd atom');
  const version = data.readUInt8(mvhd.dataStart);
  const scalePosition = mvhd.dataStart + (version === 0 ? 12 : 20);
  const durationPosition = mvhd.dataStart + (version === 0 ? 16 : 24);
  if (version !== 0 && version !== 1) throw new Error('Unsupported mvhd version');
  const timescale = data.readUInt32BE(scalePosition);
  const duration = version === 0
    ? data.readUInt32BE(durationPosition)
    : Number(data.readBigUInt64BE(durationPosition));
  if (!timescale || !Number.isFinite(duration)) throw new Error('Invalid MP4 duration');
  return duration / timescale;
}

if (process.argv[1]?.endsWith('/inspect-media-duration.mjs')) {
  for (const file of ['public/media/MILKSNB.mp4','public/media/FIllSNB.mp4','public/media/brewSNB.mp4','public/media/stillSNB.mp4']) {
    const length = mp4DurationSeconds(readFileSync(file));
    console.log(file + ': ' + length.toFixed(3) + ' seconds');
  }
}
