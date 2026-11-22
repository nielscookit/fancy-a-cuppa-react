import { isValidDetailWater } from './teaDetailModel.js';
import { CATEGORY_LABELS, normalizeQuery, teaMatches } from './teaModel.js';

const scan = new Set([
  'scannen', 'scanner', 'scan',
  'scanner oeffnen', 'den scanner oeffnen', 'oeffne scanner', 'oeffne den scanner', 'mach den scanner auf', 'scanner starten',
  'tee scannen', 'barcode scannen', 'teepackung scannen', 'tee identifizieren',
  'open scanner', 'open the scanner', 'start scanner', 'start the scanner',
  'scan tea', 'scan the tea', 'scan barcode', 'scan the barcode', 'scan tea packaging', 'identify tea',
]);
const search = new Set([
  'suchen', 'suche', 'suche tee', 'such tee', 'finde tee', 'search',
  'tee suchen', 'teesuche oeffnen', 'oeffne suche', 'oeffne teesuche', 'oeffne die teesuche', 'oeffne die suche',
  'search tea', 'find tea', 'open search', 'open tea search', 'open the tea search',
]);
const add = new Set([
  'anlegen', 'hinzufuegen', 'add', 'neuer tee', 'create new tea',
  'neuen tee', 'einen neuen tee anlegen', 'neuen tee hinzufuegen', 'tee hinzufuegen', 'tee anlegen',
  'fuege neuen tee hinzu', 'fuege einen neuen tee hinzu', 'erstelle einen neuen tee', 'tee erfassen',
  'add tea', 'add new tea', 'add a new tea', 'new tea', 'create tea', 'create a new tea',
]);

const politeLead = /^(?:(?:kannst du|könntest du|koenntest du|could you|can you|ich moechte|ich möchte|i would like to)[\s,]+)?(?:(?:bitte|please)[\s,]+)?/iu;
const searchPrefix = /^(?:(?:ich[\s,]+(?:suche|such)|suche|such|finde)|(?:öffne|oeffne)[\s,]+(?:die[\s,]+)?(?:suche|teesuche)[\s,]+nach|search[\s,]+for|find)[\s,]+/iu;
const searchSuffix = /^nach[\s,]+(.+)[\s,]+suchen$/iu;
const searchModifiers = /^(?:(?:bitte|please|mal)[\s,]+)*(?:(?:nach|tee[\s,]+von|tea[\s,]+by)[\s,]+)?/iu;
const unrecognised = { type: 'unrecognised' };

function fixedVoiceCommand(text) {
  const command = normalizeQuery(text.replace(politeLead, ''))
    .split(' ').filter(word => !['bitte', 'please', 'mal', 'mir'].includes(word)).join(' ');
  if (scan.has(command)
    || /^(?:(?:oeffne|starte|start) (?:den )?scanner|mach (?:den )?scanner auf)$/.test(command)
    || /^(?:scanne (?:einen |den )?(?:tee|barcode|teepackung)|(?:(?:einen|den) )?(?:tee|barcode|teepackung) (?:ein)?scannen)$/.test(command)) return { type: 'scan' };
  if (add.has(command)
    || /^(?:(?:(?:einen )?(?:neuen )?tee) (?:anlegen|hinzufuegen|erstellen|erfassen)|fuege (?:einen )?(?:neuen )?tee hinzu|lege (?:einen )?(?:neuen )?tee an|erstelle (?:einen )?(?:neuen )?tee)$/.test(command)) return { type: 'add' };
  if (search.has(command) || /^(?:(?:oeffne|zeig|zeige) (?:die )?(?:suche|teesuche))$/.test(command)) return { type: 'search', query: '' };
}

function explicitVoiceCommand(text) {
  // Politeness is removed from the command wrapper only. Keep the original
  // spelling and any interior words in spoken product and manufacturer names.
  const spoken = text.replace(politeLead, '');
  const command = normalizeQuery(spoken).replace(/ (?:bitte|please)$/u, '');
  const clauses = spoken.split(/(?:[;.!?]+|,|\s+(?:und|oder|and|or|dann|then)\s+)/iu);
  const isAction = part => fixedVoiceCommand(part) || searchPrefix.test(part) || searchSuffix.test(part) || /^(?:starte|start|brew)\s+/iu.test(part);
  if (clauses.length > 1 && isAction(clauses[0].trim())
    && clauses.slice(1).some(part => isAction(part.trim()))) return unrecognised;
  const fixed = fixedVoiceCommand(spoken);
  if (fixed) return fixed;
  if (fixedVoiceCommand(spoken.replace(/\s+(?:und|oder|and|or|dann|then)$/iu, ''))) return unrecognised;
  if (/^(?:neu|neuen|new|find|oeffne(?: den| die)?|suche (?:nach|tee von)|finde(?: tee von)?|search for|find tea by|oeffne (?:die )?(?:suche|teesuche) nach)$/u.test(command)) return unrecognised;
  const addPrefix = spoken.match(/^[^,;]+(?=[,;])/u)?.[0];
  if (addPrefix && fixedVoiceCommand(addPrefix)?.type === 'add') {
    return makeAddIntent(spoken.slice(addPrefix.length + 1));
  }
  const addWords = /\S+/g;
  const boundaries = [...spoken.matchAll(addWords)].map(word => word.index).slice(1, 9).reverse();
  const addBoundary = boundaries.find(index => fixedVoiceCommand(spoken.slice(0, index).trimEnd())?.type === 'add');
  if (addBoundary != null) return makeAddIntent(spoken.slice(addBoundary));
  const prefix = spoken.match(searchPrefix)?.[0];
  const suffixQuery = spoken.match(searchSuffix)?.[1];
  if (!prefix && !suffixQuery) return undefined;
  let term = suffixQuery ?? spoken.slice(prefix.length).replace(searchModifiers, '');
  if (/^ich\s+such/iu.test(spoken)) term = term.replace(/^(?:einen|eine|ein)\s+/iu, '');
  const query = term.replace(/,\s*(?:bitte|please)$/iu, '').trim();
  return normalizeQuery(query) ? { type: 'search', query } : unrecognised;
}

const small = [
  'zero null', 'one ein eins einen eine', 'two zwei', 'three drei', 'four vier', 'five fuenf',
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

const categoryNames = new Map([
  ...Object.entries(CATEGORY_LABELS).map(([key, label]) => [normalizeQuery(label), key]),
  ['schwarztee', 'black'], ['schwarzer tee', 'black'], ['gruentee', 'green'],
  ['gruener tee', 'green'], ['fruechtetee', 'fruit'], ['fruechte tee', 'fruit'],
  ['kraeutertee', 'herbal'], ['weisser tee', 'white'], ['weisstee', 'white'],
]);
const fieldLabel = /^(teename|name|hersteller|marke|kategorie|dosierung|menge|wasser(?:menge)?|ziehzeit|temperatur)\b[\s:=]*/iu;
const dosageUnit = '(?:gramm|grams?|g|teebeutel|beutel|tea bags?|teelöffel|tl|tsp)';
const waterUnit = '(?:millilit(?:er|re)s?|ml|lit(?:er|re)s?|l)';
const durationUnit = '(?:minuten?|minutes?|mins?)';
const heatUnit = '(?:grad(?:\\s+celsius)?|°\\s*c|°|celsius)';
const unlabeledCategory = /\s+(schwarztee|gr(?:ü|ue)ntee|fr(?:ü|ue)chtetee|kr(?:ä|ae)utertee|wei(?:ß|ss)tee)$/iu;
const ambiguousText = /\b(?:oder|or)\b|^(?:und|and|dann|then)\b/iu;
const measureWords = new RegExp('(?:^|\\s)(?:' + [dosageUnit, waterUnit, durationUnit, heatUnit].join('|') + ')(?:\\s|$)', 'iu');
const numberWord = '(?:' + [...values.keys()].map(word => word.replace(/ae/g, '(?:ae|ä)').replace(/oe/g, '(?:oe|ö)')
  .replace(/ue/g, '(?:ue|ü)').replace(/ss/g, '(?:ss|ß)')).join('|') + '|hundred|thousand|und|and|[\\p{L}]*(?:hundert|tausend)[\\p{L}]*)';
// A metric may be adjacent to another metric in an unpunctuated transcript.
// Keep the number and unit together and never split a decimal comma.
const metric = new RegExp('(?<![\\p{L}\\d.,+-])(?:[+-]?\\d+(?:[.,]\\d+)?|' + numberWord + '(?:\\s+' + numberWord + ')*)'
  + '\\s*(?:' + dosageUnit + '|' + waterUnit + '|' + durationUnit + '|' + heatUnit + ')(?![\\p{L}\\d])', 'giu');
const metricUnit = new RegExp('\\s*(' + dosageUnit + '|' + waterUnit + '|' + durationUnit + '|' + heatUnit + ')$', 'iu');

function amountIn(text) {
  return /^[+-]?\d+(?:[.,]\d+)?$/.test(text) ? Number(text.replace(',', '.')) : wordNumber(text);
}

function makeAddIntent(input) {
  const fields = new Map();
  const set = (key, value) => {
    if (!fields.has(key)) fields.set(key, new Map());
    fields.get(key).set(typeof value === 'string' ? normalizeQuery(value) : JSON.stringify(value), value);
  };
  const clauses = input
    .replace(/\s+(?=(?:teename|hersteller|marke|kategorie|dosierung|wassermenge|ziehzeit|temperatur)\b)/giu, ';')
    .split(/;|(?<!\d),|,(?!\d)/u).map(part => part.trim()).filter(Boolean);
  for (const clause of clauses) {
    const label = clause.match(fieldLabel)?.[1].toLowerCase();
    const value = clause.replace(fieldLabel, '').trim();
    if (!value) continue;
    const measures = [...value.matchAll(metric)];
    if (label === 'kategorie' || (!label && categoryNames.has(normalizeQuery(value)))) {
      set('category', categoryNames.get(normalizeQuery(value)) ?? null);
      continue;
    }
    const identity = label === 'hersteller' || label === 'marke' ? 'brand'
      : label === 'name' || label === 'teename' || !label ? 'rawName' : null;
    let beforeMeasure = measures.length ? value.slice(0, measures[0].index).trim() : value;
    const separators = measures.map((match, index) => {
      const end = match.index + match[0].length;
      return value.slice(end, measures[index + 1]?.index).trim();
    });
    const cleanMeasures = measures.length && separators.every(separator => /^(?:auf|pro|mit|per|for|in|und|and)?$/iu.test(separator))
      && (!beforeMeasure || (identity && !/\d|\b(?:bis|to|oder|or|minus)\b|[+–—-]$/iu.test(beforeMeasure)));
    if (cleanMeasures && identity === 'brand') {
      // Speech may omit the pause between an explicit brand and a category.
      const category = beforeMeasure.match(unlabeledCategory);
      if (category) {
        beforeMeasure = beforeMeasure.slice(0, category.index);
        set('category', categoryNames.get(normalizeQuery(category[1])));
      }
    }
    if (identity && beforeMeasure && (cleanMeasures || !measures.length)
      && /\p{L}/u.test(beforeMeasure) && !ambiguousText.test(beforeMeasure)
      && (label || !/[\d°]/u.test(beforeMeasure) || !measureWords.test(beforeMeasure))) {
      set(identity, beforeMeasure);
    }
    if (!cleanMeasures) continue;
    for (const match of measures) {
      const text = match[0];
      const unitMatch = text.match(metricUnit);
      const unit = unitMatch[1].toLowerCase();
      const amount = amountIn(text.slice(0, unitMatch.index).trim());
      if (!Number.isFinite(amount)) continue;
      if (new RegExp('^' + dosageUnit + '$', 'iu').test(unit) && (!label || label === 'dosierung' || label === 'menge' || identity)) {
        const kind = /beutel|bag/u.test(unit) ? 'bag' : /teelöffel|tl|tsp/u.test(unit) ? 'tsp' : 'g';
        set('dose', amount > 0 && amount <= 100 && (kind !== 'bag' || Number.isInteger(amount))
          ? { type: kind === 'bag' ? 'bag' : 'loose', unit: kind, qty: amount } : null);
      } else if (new RegExp('^' + waterUnit + '$', 'iu').test(unit) && (!label || label.startsWith('wasser') || label === 'dosierung' || identity)) {
        const ml = amount * (/^l/u.test(unit) ? 1000 : 1);
        set('base', Number.isInteger(ml) && ml >= 50 && ml <= 10000 ? ml : null);
      } else if (new RegExp('^' + durationUnit + '$', 'iu').test(unit) && (!label || label === 'ziehzeit' || identity)) {
        set('brewSeconds', Number.isInteger(amount) && amount >= 1 && amount <= 30 ? amount * 60 : null);
      } else if (new RegExp('^' + heatUnit + '$', 'iu').test(unit) && (!label || label === 'temperatur' || identity)) {
        set('temperature', Number.isInteger(amount) && amount >= 40 && amount <= 100 ? amount : null);
      }
    }
  }
  const prefill = {};
  for (const [key, candidates] of fields) {
    if (candidates.size !== 1) continue;
    const [value] = candidates.values();
    if (value == null) continue;
    if (key === 'dose') Object.assign(prefill, value);
    else prefill[key] = value;
  }
  return Object.keys(prefill).length ? { type: 'add', prefill } : { type: 'add' };
}

// Only spelling-equivalent compounds participate in the exact identity guard.
const exactVoiceName = value => normalizeQuery(value).replace(/\bfruechte tee\b/g, 'fruechtetee');

export function parseVoiceTeaIntent(transcript, teas) {
  const text = String(transcript ?? '').trim().replace(/[.!?]+$/, '');
  const command = explicitVoiceCommand(text);
  if (command) return command;
  const startCommand = text.match(/^(starte|start|brew)(?=\s|$)/iu)?.[0];
  const brew = Boolean(startCommand);
  const parsed = extractVolume(startCommand ? text.slice(startCommand.length).trim() : text);
  if (!parsed) return { type: 'invalid-water' };
  const query = normalizeQuery(parsed.query);
  if (!query || (startCommand?.toLowerCase() === 'brew' && parsed.water == null)) return { type: 'unrecognised' };
  if (!Array.isArray(teas) || !teas.length) return { type: 'catalog-unavailable' };
  const exactQuery = exactVoiceName(query);
  const exact = teas.filter(tea => [tea.rawName, tea.name, `${tea.brand} ${tea.rawName}`, `${tea.rawName} ${tea.brand}`]
    .some(name => exactVoiceName(name) === exactQuery));
  const matches = exact.length ? exact : teas.filter(tea => teaMatches(tea, query));
  if (!matches.length) return { type: 'no-match' };
  if (matches.length > 1 || (brew && exact.length !== 1)) return { type: 'search', query };
  return { type: brew ? 'brew' : 'detail', tea: matches[0], water: parsed.water };
}

export function resolveVoiceTeaIntent(transcripts, teas) {
  const outcomes = transcripts.map(text => parseVoiceTeaIntent(text, teas));
  const actions = outcomes.filter(({ type }) => ['scan', 'add', 'detail', 'search', 'brew'].includes(type));
  const keys = new Set(actions.map(action => JSON.stringify([action.type, action.tea?.id, action.water, normalizeQuery(action.query), Object.entries(action.prefill ?? {}).sort()])));
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
      if (intent.prefill) actions.add(intent.prefill);
      else actions.add();
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
