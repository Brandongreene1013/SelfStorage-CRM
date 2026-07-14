const HTML_ENTITIES = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

const CP1252_TO_UTF8_MOJIBAKE = /[\u00c2\u00c3\u00c5\u00e2\u00ef]/;

const MOJIBAKE_REPLACEMENTS = [
  [/\u00c3\u201a/g, ' '],
  [/[\u00c2\u00b7]+/g, ' '],
  [/\u00e2\u20ac[\u0153\u009d\u009c\u009d]/g, '"'],
  [/\u00e2\u20ac[\u02dc\u2122\u02d9]/g, "'"],
  [/\u00e2\u20ac[\u201c\u009d]/g, '-'],
  [/\u00e2\u20ac\u00a2/g, ' '],
  [/\u00e2\u20ac\u00ba/g, '>'],
  [/\u00e2\u0153\u2026/g, 'Done'],
  [/\u00e2\u02dc\u017d/g, ''],
  [/\u00c3\u00b0\u00c5\u00b8"?/g, ''],
  [/\u00f0[\u0080-\u00bf]{1,3}/g, ''],
  [/\u00ef\u00bf\u00bd/g, ''],
  [/\ufffd/g, ''],
  [/\?{3,}/g, ''],
];

const REDUNDANT_OUTLOOK_PATTERNS = [
  /\s*[.|-]?\s*outlook\s*$/i,
  /\s*\(?microsoft teams meeting\)?\s*$/i,
  /^\s*microsoft teams meeting\s*[-:|]?\s*/i,
  /^\s*location:\s*/i,
];

export function decodeHtmlEntities(value) {
  return String(value).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const key = entity.toLowerCase();
    if (key[0] === '#') {
      const code = key[1] === 'x' ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return HTML_ENTITIES[key] ?? match;
  });
}

function stripControlCharacters(value) {
  return String(value)
    .split('')
    .map(ch => {
      const code = ch.charCodeAt(0);
      return (code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127 ? ' ' : ch;
    })
    .join('');
}

function repairCommonMojibake(value) {
  let text = value;
  for (let i = 0; i < 2 && CP1252_TO_UTF8_MOJIBAKE.test(text); i += 1) {
    try {
      const bytes = Uint8Array.from([...text].map(ch => ch.charCodeAt(0) & 0xff));
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (!decoded || decoded === text) break;
      if ([...decoded].some(ch => ch === '\ufffd' || ch.charCodeAt(0) < 32)) break;
      text = decoded;
    } catch {
      break;
    }
  }
  return text;
}

export function normalizeDisplayText(value, { stripOutlookNoise = false } = {}) {
  if (value == null) return '';
  let text = stripControlCharacters(decodeHtmlEntities(value)).normalize('NFC');
  text = repairCommonMojibake(text);

  for (const [pattern, replacement] of MOJIBAKE_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  if (stripOutlookNoise) {
    for (const pattern of REDUNDANT_OUTLOOK_PATTERNS) {
      text = text.replace(pattern, '');
    }
  }

  return stripControlCharacters(text).replace(/\s+/g, ' ').trim();
}

export function normalizeMeetingText(value) {
  return normalizeDisplayText(value, { stripOutlookNoise: true });
}

export function hasKnownMojibake(value) {
  return /[\u00c2\u00c3\u00c5\u00e2\u00ef]|\?{3,}|&(#x?[0-9a-f]+|[a-z]+);/i.test(String(value ?? ''));
}
