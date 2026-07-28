import assert from 'node:assert/strict';
import {
  chooseBestWorksheet,
  CRM_IMPORT_HEADERS,
  matrixToDelimitedText,
  normalizeWorksheetRows,
} from '../src/lib/spreadsheetImport.js';

const legacyRows = [
  [
    'Proposal Year', 'Property Folder Name', 'Property Name', 'Property Address',
    'City', 'State', 'Property Type', 'Lead Agent', 'Supporting Agents',
    'As-Is Valuation', 'Current NOI', 'Valuation Cap Rate', 'Occupancy',
    'Confidence', 'Review Required', 'BOV File Name', 'BOV Date',
    'Review / Underwriting Notes',
  ],
  [
    '2024', 'Alpha Storage - Austin, TX', 'Alpha Storage', '101 Main Street',
    'Austin', 'TX', 'Self-Storage', 'Emily Dempsey', '', 2500000, 150000,
    0.06, 0.9, 'High', 'No', 'BOV_Alpha.pdf', '2024-09-01', 'Main row note.',
  ],
  [
    '2024', 'Alpha Storage - Austin, TX', 'Alpha Storage', 'Emily Dempsey',
    'Low', 'Unclear lead agent', 'Review row note.',
  ],
  [
    '2024', 'Beta RV - Dallas, TX', 'Beta RV Storage', 'Emily Dempsey',
    'Low', 'BOV not located', 'Keep this uncertain facility.',
  ],
];

const normalized = normalizeWorksheetRows(legacyRows, 'Emily Pipeline');
assert.equal(normalized.format, 'legacy-bov-broker-tab');
assert.equal(normalized.rowCount, 2);
assert.deepEqual(normalized.matrix[0], CRM_IMPORT_HEADERS);
assert.equal(normalized.matrix[1][0], 'Alpha Storage');
assert.equal(normalized.matrix[1][1], '101 Main Street');
assert.equal(normalized.matrix[1][4], 'Salesforce');
assert.match(normalized.matrix[1][18], /Review row note/);
assert.equal(normalized.matrix[2][0], 'Beta RV Storage');
assert.equal(normalized.matrix[2][1], '');
assert.match(normalized.matrix[2][18], /uncertainty does not block CRM import/i);

const withPreamble = normalizeWorksheetRows([
  ['Prepared for 2024 follow-up'],
  [],
  ['Company Name', 'Property Address', 'City', 'State'],
  ['Gamma Storage', '22 Oak Road', 'Denver', 'CO'],
], 'Export');
assert.equal(withPreamble.format, 'table-with-preamble');
assert.equal(withPreamble.matrix[0][0], 'Company Name');
assert.match(matrixToDelimitedText(withPreamble.matrix), /^Company Name\tProperty Address/m);

const chosen = chooseBestWorksheet([
  { name: 'CRM Import', contactsCount: 60, readyCount: 60, mappingWarningCount: 0, format: 'standard-table' },
  { name: 'Emily', contactsCount: 24, readyCount: 24, mappingWarningCount: 0, format: 'legacy-bov-broker-tab' },
  { name: 'Brendan', contactsCount: 18, readyCount: 18, mappingWarningCount: 0, format: 'legacy-bov-broker-tab' },
  { name: 'Processing Log', contactsCount: 77, readyCount: 77, mappingWarningCount: 0, format: 'standard-table' },
], 'Emily 2024 BOV Follow-Up');
assert.equal(chosen.name, 'Emily');
assert.equal(chooseBestWorksheet([
  { name: 'Master BOV Audit', contactsCount: 76, readyCount: 76, mappingWarningCount: 0, format: 'legacy-bov-broker-tab' },
  { name: 'Emily Pipeline', contactsCount: 24, readyCount: 24, mappingWarningCount: 0, format: 'legacy-bov-broker-tab' },
  { name: 'Brendan Pipeline', contactsCount: 18, readyCount: 18, mappingWarningCount: 0, format: 'legacy-bov-broker-tab' },
  { name: 'Hunter Pipeline', contactsCount: 18, readyCount: 18, mappingWarningCount: 0, format: 'legacy-bov-broker-tab' },
], 'BL').name, 'Brendan Pipeline');
assert.equal(chooseBestWorksheet([
  { name: 'Master BOV Audit', contactsCount: 76, readyCount: 76, mappingWarningCount: 0, format: 'legacy-bov-broker-tab' },
  { name: 'Emily Pipeline', contactsCount: 24, readyCount: 24, mappingWarningCount: 0, format: 'legacy-bov-broker-tab' },
], 'ED').name, 'Emily Pipeline');
assert.equal(chooseBestWorksheet([
  { name: 'Master BOV Audit', contactsCount: 76, readyCount: 76, mappingWarningCount: 0, format: 'legacy-bov-broker-tab' },
  { name: 'Hunter Pipeline', contactsCount: 18, readyCount: 18, mappingWarningCount: 0, format: 'legacy-bov-broker-tab' },
], 'HR').name, 'Hunter Pipeline');

const masterChosen = chooseBestWorksheet([
  { name: 'Master BOV Audit', contactsCount: 76, readyCount: 76, mappingWarningCount: 0, format: 'legacy-bov-broker-tab' },
  { name: 'Processing Log', contactsCount: 77, readyCount: 77, mappingWarningCount: 0, format: 'standard-table' },
], 'Master Database');
assert.equal(masterChosen.name, 'Master BOV Audit');

console.log('spreadsheet import tests passed');
