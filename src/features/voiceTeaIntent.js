import { isValidDetailWater } from './teaDetailModel.js';
import { normalizeQuery, teaMatches } from './teaModel.js';

const scan = new Set([
  'tee scannen', 'tee identifizieren', 'scan tea', 'identify tea',
  'scanner oeffnen', 'oeffne den scanner', 'open scanner',
]);
const search = new Set(['tee suchen', 'teesuche oeffnen', 'search tea', 'find tea']);
const add = new Set([
  'neuen tee', 'neuen tee hinzufuegen', 'tee hinzufuegen', 'tee anlegen',
  'add tea', 'add new tea', 'new tea', 'create tea',
]);
const small = [
  'zero null', 'one ein eins', 'two zwei', 'three drei', 'four vier', 'five fuenf',
  'six sechs', 'seven sieben', 'eight acht', 'nine neun', 'ten zehn', 'eleven elf',
  'twelve zwoelf', 'thirteen dreizehn', 'fourteen vierzehn', 'fifteen fuenfzehn',
  'sixteen sechzehn', 'seventeen siebzehn', 'eighteen achtzehn', 'nineteen neunzehn',
];
const tens = ['twenty zwanzig', 'thirty dreissig', 'forty vierzig', 'fifty fuenfzig',
  'sixty sechzig', 'seventy siebzig', 'eighty achtzig', 'ninety neunzig'];
const values = new Map([...small.flatMap((words, n) => words.split(' ').map(word => [word, n])),
  ...tens.flatMap((words, n) => words.split(' ').map(word => [word, (n + 2) * 10]))]);

function wordNumber(text) {
  const words = normalizeQuery(text);
  if (values.has(words)) return values.get(words);
  if (!words.includes(' ') && /tausend|hundert/.test(words)) {
    const parts = words.match(/^(?:(\w*?)tausend)?(?:(\w*?)hundert)?(.*)$/);
    const [, thousands, hundreds, rest] = parts;
    if (thousands !== undefined || hundreds !== undefined) {
      const scale = (value, factor) => value === undefined ? 0 : (value ? values.get(value) : 1) * factor;
      return scale(thousands, 1000) + scale(hundreds, 100) + (rest ? wordNumber(rest) : 0);
    }
  }
  const german = words.match(/^(\w+)und(\w+)$/);
  const english = words.match(/^(\w+) (\w+)$/);
  if (german || english) {
    const [low, high] = german ? german.slice(1) : english.slice(1).reverse();
    if (values.get(low) > 0 && values.get(low) < 10 && values.get(high) >= 20 && values.get(high) % 10 === 0) {
      return values.get(high) + values.get(low);
    }
  }
  const scaled = words.match(/^(?:(\w+) )?(thousand|hundred)(?: (?:and )?(.*))?$/);
  if (scaled) {
    const [, count, factor, rest] = scaled;
    const prefix = count ? values.get(count) : 1;
    const remainder = rest ? wordNumber(rest) : 0;
    const scale = factor === 'hundred' ? 100 : 1000;
    if (prefix > 0 && prefix < 10 && remainder >= 0 && remainder < scale) return prefix * scale + remainder;
  }
  return NaN;
}

const units = /\b(?:millilit(?:er|re)s?|ml|lit(?:er|re)s?|l)\b/giu;
const numberToken = new RegExp('^(?:' + [...values.keys()].join('|') + '|hundred|thousand|and|und)$', 'u');

function extractVolume(text) {
  const matches = [...text.matchAll(units)];
  if (!matches.length) return { query: text };
  if (matches.length !== 1 || text.slice(matches[0].index + matches[0][0].length).trim()) return null;
  const [unit] = matches[0];
  const prefix = text.slice(0, matches[0].index).trimEnd();
  const digits = prefix.match(/(?:^|[\s,])([+-]?\d+(?:[.,]\d+)?)$/);
  let amount;
  let query;
  if (digits) {
    amount = Number(digits[1].replace(',', '.'));
    query = prefix.slice(0, digits.index);
  } else {
    const tokens = prefix.split(/\s+/);
    const words = [];
    while (tokens.length && (normalizeQuery(tokens.at(-1)).split(' ').every(word => numberToken.test(word)) || /hundert|tausend/i.test(tokens.at(-1)))) words.unshift(tokens.pop());
    amount = wordNumber(words.join(' '));
    query = tokens.join(' ');
  }
  const water = amount * (/^l/i.test(unit) ? 1000 : 1);
  if (!isValidDetailWater(water)) return null;
  return { query: query.replace(/\s+(?:mit|with|in|for|fuer)$/iu, ''), water };
}

export function parseVoiceTeaIntent(transcript, teas) {
  const text = String(transcript ?? '').trim().replace(/[.!?]+$/, '');
  const normalized = normalizeQuery(text);
  // Keep action recognition anchored to the complete utterance.
  const command = normalized.split(' ').filter(word => word !== 'bitte' && word !== 'please').join(' ');
  if (scan.has(command)) return { type: 'scan' };
  if (add.has(command)) return { type: 'add' };
  if (search.has(command)) return { type: 'search', query: '' };
  const requestedTea = text.match(/^(?:(?:bitte|please)[\s,]+)?suche[\s,]+(.+)$/iu)?.[1];
  if (requestedTea && command.startsWith('suche ')) {
    const query = requestedTea.replace(/^(?:bitte|please)[\s,]+|[\s,]+(?:bitte|please)$/giu, '').trim();
    if (normalizeQuery(query)) return { type: 'search', query };
  }
  if (command === 'suche') return { type: 'unrecognised' };
  const brew = /^brew\s+/i.test(text) || /\s+aufbr[uü]hen$/i.test(text);
  const parsed = extractVolume(text.replace(/^brew\s+|\s+aufbr[uü]hen$/gi, ''));
  if (!parsed) return { type: 'invalid-water' };
  const query = normalizeQuery(parsed.query);
  if (!query || (brew && parsed.water == null)) return { type: 'unrecognised' };
  if (!Array.isArray(teas) || !teas.length) return { type: 'catalog-unavailable' };
  const exact = teas.filter(tea => [tea.rawName, tea.name, `${tea.brand} ${tea.rawName}`, `${tea.rawName} ${tea.brand}`]
    .some(name => normalizeQuery(name) === query));
  const matches = exact.length ? exact : teas.filter(tea => teaMatches(tea, query));
  if (!matches.length) return { type: 'no-match' };
  if (matches.length > 1 || (brew && exact.length !== 1)) return { type: 'search', query };
  return { type: brew ? 'brew' : 'detail', tea: matches[0], water: parsed.water };
}

export function resolveVoiceTeaIntent(transcripts, teas) {
  const outcomes = transcripts.map(text => parseVoiceTeaIntent(text, teas));
  const actions = outcomes.filter(({ type }) => ['scan', 'add', 'detail', 'search', 'brew'].includes(type));
  const keys = new Set(actions.map(action => JSON.stringify([action.type, action.tea?.id, action.water, action.query])));
  if (keys.size > 1) return { type: 'unrecognised', reason: 'conflicting-transcripts' };
  if (actions[0]?.type === 'brew' && outcomes.some(outcome => outcome.type === 'invalid-water')) return { type: 'invalid-water' };
  return actions[0] ?? outcomes.find(outcome => outcome.type !== 'unrecognised') ?? { type: 'unrecognised' };
}


export function routeVoiceTeaIntent(intent, actions) {
  switch (intent.type) {
    case 'scan':
      actions.scan();
      return true;
    case 'add':
      actions.add();
      return true;
    case 'detail':
      actions.detail(intent.tea, intent.water);
      return true;
    case 'search':
      actions.search(intent.query);
      return true;
    case 'brew': {
      const seconds = Number(intent.tea.brewSeconds);
      if (Number.isFinite(seconds) && seconds >= 60 && seconds <= 1800 && actions.brew(seconds)) return true;
      actions.notice('Timer not ready. Please try again.');
      return false;
    }
    case 'catalog-unavailable':
      actions.notice('Tea catalogue unavailable.');
      return false;
    default:
      return false;
  }
}
