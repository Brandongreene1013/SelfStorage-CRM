const CRM_IMPORT_HEADERS = [
  'Facility Name',
  'Property Address',
  'City',
  'State',
  'Lead Source',
  'Relationship Type',
  'Source',
  'Assigned Broker',
  'BOV Date',
  'As-Is Valuation',
  'Current NOI',
  'Valuation Cap Rate',
  'Occupancy',
  'Confidence',
  'Review Required',
  'BOV File Name',
  'Property Folder',
  'Import Quality',
  'Notes',
];

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const keyText = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const hasValue = value => value != null && clean(value) !== '';
const rowHasValues = row => (row ?? []).some(hasValue);

function quoteDelimited(value, delimiter) {
  const text = clean(value);
  if (!text.includes(delimiter) && !/[\r\n"]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function matrixToDelimitedText(matrix, delimiter = '\t') {
  return (matrix ?? [])
    .map(row => row.map(value => quoteDelimited(value, delimiter)).join(delimiter))
    .join('\n');
}

function headerScore(row) {
  const signals = [
    /^(facility|property|company)( name)?$/,
    /^(property|facility|street|site)? ?address$/,
    /^city$/,
    /^state$/,
    /^(owner|contact)( name)?$/,
    /^(primary )?(phone|telephone|mobile|cell)$/,
    /^email( address)?$/,
    /^(lead )?source$/,
    /^relationship type$/,
    /^notes?$/,
    /^assigned broker$/,
    /^bov date$/,
  ];
  const cells = row.map(keyText);
  return signals.reduce(
    (score, pattern) => score + (cells.some(cell => pattern.test(cell)) ? 1 : 0),
    0,
  );
}

function findHeaderRowIndex(rows) {
  let bestIndex = 0;
  let bestScore = -1;
  rows.slice(0, 25).forEach((row, index) => {
    const score = headerScore(row);
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });
  return bestScore >= 2 ? bestIndex : 0;
}

function isLegacyBovHeader(row) {
  const headers = new Set(row.map(keyText));
  return headers.has('property folder name')
    && headers.has('property name')
    && headers.has('lead agent')
    && headers.has('review underwriting notes');
}

function usable(value) {
  const text = clean(value);
  return /^(not found|n\/a|n\/a - no bov|n\/a - bov not located)$/i.test(text) ? '' : text;
}

function usableAddress(value) {
  const text = usable(value);
  return /^(multiple|multiple locations|ten locations)$/i.test(text) ? '' : text;
}

function validState(value) {
  const text = clean(value).toUpperCase();
  return /^[A-Z]{2}$/.test(text) ? text : '';
}

function formatValue(label, value) {
  const text = clean(value);
  return text ? `${label}: ${text}` : '';
}

function normalizeLegacyBovRows(rows, headerIndex) {
  const headers = rows[headerIndex].map(clean);
  const index = Object.fromEntries(headers.map((header, column) => [header, column]));
  const records = new Map();

  for (const row of rows.slice(headerIndex + 1)) {
    if (!rowHasValues(row)) continue;
    const canonicalBroker = clean(row[index['Lead Agent']]);
    const compactBroker = clean(row[3]);
    const canonical = !!canonicalBroker;
    const compactReview = !canonical && !!clean(row[1]) && !!clean(row[2]) && !!compactBroker;
    if (!canonical && !compactReview) continue;

    const folder = clean(row[index['Property Folder Name']] ?? row[1]);
    const facilityName = clean(row[index['Property Name']] ?? row[2]) || folder;
    if (!facilityName || facilityName === '`') continue;
    const identity = keyText(folder) || keyText(facilityName);
    if (!identity) continue;

    const current = records.get(identity);
    if (canonical) {
      const reviewNote = current?.reviewNote ?? '';
      records.set(identity, {
        facilityName,
        address: usableAddress(row[index['Property Address']]),
        city: usable(row[index.City]),
        state: validState(row[index.State]),
        broker: canonicalBroker,
        bovDate: clean(row[index['BOV Date']]),
        valuation: row[index['As-Is Valuation']] ?? '',
        noi: row[index['Current NOI']] ?? '',
        capRate: row[index['Valuation Cap Rate']] ?? '',
        occupancy: row[index.Occupancy] ?? '',
        confidence: clean(row[index.Confidence]),
        reviewRequired: clean(row[index['Review Required']]),
        bovFile: /^not found\b/i.test(usable(row[index['BOV File Name']]))
          ? ''
          : usable(row[index['BOV File Name']]),
        folder,
        propertyType: clean(row[index['Property Type']]),
        auditNote: clean(row[index['Review / Underwriting Notes']]),
        reviewNote,
        importQuality: 'Broker pipeline',
      });
      continue;
    }

    const reviewNote = [
      formatValue('Review issue', row[5]),
      formatValue('Audit note', row[6]),
    ].filter(Boolean).join(' | ');
    if (current) {
      current.reviewNote = [current.reviewNote, reviewNote].filter(Boolean).join(' | ');
    } else {
      records.set(identity, {
        facilityName,
        address: '',
        city: '',
        state: '',
        broker: compactBroker,
        bovDate: '',
        valuation: '',
        noi: '',
        capRate: '',
        occupancy: '',
        confidence: clean(row[4]),
        reviewRequired: 'Yes',
        bovFile: '',
        folder,
        propertyType: '',
        auditNote: '',
        reviewNote,
        importQuality: 'Broker review queue',
      });
    }
  }

  const normalizedRows = [...records.values()].map(record => {
    const notes = [
      '2024 Legacy BOV follow-up',
      formatValue('Prior broker', record.broker),
      record.importQuality === 'Broker review queue'
        ? 'Included from the broker review queue; uncertainty does not block CRM import.'
        : 'Included from the broker main pipeline.',
      formatValue('Property type', record.propertyType),
      formatValue('BOV date', record.bovDate),
      formatValue('As-is valuation', record.valuation),
      formatValue('Current NOI', record.noi),
      formatValue('Valuation cap rate', record.capRate),
      formatValue('Occupancy', record.occupancy),
      formatValue('Audit confidence', record.confidence),
      formatValue('Original review required', record.reviewRequired),
      record.bovFile ? formatValue('BOV file', record.bovFile) : 'BOV file: not located',
      formatValue('Property folder', record.folder),
      formatValue('Audit note', record.auditNote),
      record.reviewNote,
    ].filter(Boolean).join(' | ');

    return [
      record.facilityName,
      record.address,
      record.city,
      record.state,
      'Salesforce',
      'Storage Owner / Seller',
      '2024 Legacy BOV Audit',
      record.broker,
      record.bovDate,
      record.valuation,
      record.noi,
      record.capRate,
      record.occupancy,
      record.confidence,
      record.reviewRequired,
      record.bovFile,
      record.folder,
      record.importQuality,
      notes,
    ];
  });

  return [CRM_IMPORT_HEADERS, ...normalizedRows];
}

export function normalizeWorksheetRows(inputRows, sheetName = '') {
  const rows = (inputRows ?? [])
    .map(row => Array.isArray(row) ? row : [])
    .filter(rowHasValues);
  if (rows.length === 0) {
    return { matrix: [], format: 'empty', formatLabel: 'Empty worksheet', sheetName };
  }

  const bovHeaderIndex = rows.slice(0, 25).findIndex(isLegacyBovHeader);
  if (bovHeaderIndex >= 0) {
    const matrix = normalizeLegacyBovRows(rows, bovHeaderIndex);
    return {
      matrix,
      format: 'legacy-bov-broker-tab',
      formatLabel: '2024 BOV broker tab normalized',
      sheetName,
      rowCount: Math.max(0, matrix.length - 1),
    };
  }

  const headerIndex = findHeaderRowIndex(rows);
  const matrix = rows.slice(headerIndex);
  return {
    matrix,
    format: headerIndex > 0 ? 'table-with-preamble' : 'standard-table',
    formatLabel: headerIndex > 0 ? `Header detected on row ${headerIndex + 1}` : 'Standard table',
    sheetName,
    rowCount: Math.max(0, matrix.length - 1),
  };
}

export function chooseBestWorksheet(options, fixedListName = '') {
  if (!options?.length) return null;
  const listKey = keyText(fixedListName);
  const listTokens = listKey.split(' ').filter(Boolean);
  const brokerAliases = [
    { broker: 'emily', aliases: ['emily', 'ed'] },
    { broker: 'brendan', aliases: ['brendan', 'bl'] },
    { broker: 'hunter', aliases: ['hunter', 'hr'] },
  ];
  const requestedBroker = brokerAliases.find(({ aliases }) =>
    aliases.some(alias => listTokens.includes(alias))
  )?.broker;
  return [...options].sort((a, b) => {
    const score = option => {
      const sheetKey = keyText(option.name);
      const brokerMatch = requestedBroker && sheetKey.includes(requestedBroker) ? 10000 : 0;
      const listMatch = listKey && (listKey.includes(sheetKey) || sheetKey.includes(listKey)) ? 2000 : 0;
      const sharedTokens = listKey
        ? [...new Set(listKey.split(' '))].filter(token => token.length >= 4 && sheetKey.includes(token)).length
        : 0;
      const recognizedFormat = option.format === 'legacy-bov-broker-tab' ? 1000 : 0;
      const utilitySheet = /\b(processing|log|guide|instructions?|read ?me|summary)\b/.test(sheetKey) ? 100000 : 0;
      const usefulRows = (option.contactsCount ?? option.rowCount ?? 0) * 10;
      const readyRows = option.readyCount ?? 0;
      const warnings = (option.mappingWarningCount ?? 0) * 20;
      return brokerMatch + listMatch + (sharedTokens * 300) + recognizedFormat + usefulRows + readyRows - warnings - utilitySheet;
    };
    return score(b) - score(a);
  })[0];
}

export { CRM_IMPORT_HEADERS };
