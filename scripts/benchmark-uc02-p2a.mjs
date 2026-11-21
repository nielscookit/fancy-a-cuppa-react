import { performance } from 'node:perf_hooks';
import { matchFancyTestPhoto, matchPhotoCandidates } from '../src/features/nativeTeaCamera.js';
import { cases, teas } from '../tests/fixtures/uc02-p2a.mjs';

const catalog = [...teas, ...Array.from({ length:250 - teas.length }, (_, i) => ({
  id: 'synthetic-' + i, brand: 'Knospengarten ' + i, rawName: 'Abendkräuter Sonderedition ' + i,
}))];
const corpus = cases.map(([,lines]) => lines);
const p1 = lines => matchPhotoCandidates(lines, catalog);
const p2 = lines => matchFancyTestPhoto(lines, catalog, {nameOnlyEnabled:true});
const now = () => performance.now();
const a = [], b = [], extra = [];
for (let round = 0; round < 220; round++) {
  for (const lines of corpus) {
    const before = now();
    p1(lines);
    const base = now() - before;
    const start = now();
    const full = p1(lines);
    const fallbackStart = now();
    const result = matchFancyTestPhoto(lines, catalog, {nameOnlyEnabled:true, full});
    const total = now() - start;
    if (round < 20) { p2(lines); continue; }
    a.push(base);
    b.push(total);
    if (result.stage === 'name_only') extra.push(total - (fallbackStart - start));
  }
}
const summary = values => {
  values.sort((x,y) => x-y);
  return { n:values.length, medianMs:+values[Math.floor(values.length / 2)].toFixed(3),
    p95Ms:+values[Math.ceil(values.length * 0.95) - 1].toFixed(3) };
};
console.log(JSON.stringify({
  runtime:process.version, platform:process.platform, architecture:process.arch,
  catalog:catalog.length, fixtures:corpus.length,
  P1:summary(a), P2a:summary(b), fallback:summary(extra),
}, null, 2));
