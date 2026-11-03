import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MEDIA_ASSETS, V2_SOURCE_COMMIT, V2_SOURCE_REPO } from '../src/timer/mediaManifest.js';

/**
 * Fetch validated files from a PINNED V2 commit, validate Git blob hashes and
 * package into V3 /media/. V2 GitHub repository is never modified.
 * GitHub Pages then serves V3-owned media, without runtime dependence on V2.
 */
const destination = join(process.cwd(), 'public', 'media');
await mkdir(destination, { recursive: true });

for (const { file, sha } of Object.values(MEDIA_ASSETS)) {
  const url = 'https://raw.githubusercontent.com/' + V2_SOURCE_REPO + '/'
    + V2_SOURCE_COMMIT + '/' + encodeURIComponent(file);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Could not fetch ' + file + ': HTTP ' + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  const hash = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
  if (hash !== sha) throw new Error('V2 media content mismatch: ' + file);
  await writeFile(join(destination, file), bytes);
  console.log(file + ': verified ' + bytes.length + ' bytes');
}
