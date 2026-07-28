import assert from 'node:assert/strict';
import {
  scoreDuplicateCandidates,
  validateAndNormalizeDraft,
  validateApproval,
} from '../api/_salesforceImport.js';
import { clipboardImageFiles } from '../src/lib/salesforceImportClient.js';
import {
  SALESFORCE_EXTRACTION_PROMPT,
  SALESFORCE_EXTRACTION_PROMPT_VERSION,
  SALESFORCE_IMPORT_SCHEMA_VERSION,
} from '../api/_salesforceExtractionPrompt.js';

const extracted = (value, confidence = .9) => ({
  value,
  rawValue: value == null ? null : String(value),
  normalizedValue: value,
  confidence,
  screenshotId: 'shot-1',
  evidenceText: value == null ? null : `Visible: ${value}`,
  status: value == null ? 'not_found' : 'extracted',
});

const raw = {
  importSessionId: 'ignored',
  source: {
    system: 'salesforce',
    method: 'clipboard_screenshot',
    screenshotCount: 1,
    sourceRecordId: extracted('SF-001'),
    sourceUrl: extracted('salesforce.example/record/SF-001'),
  },
  facility: {
    name: extracted('Alpha Storage'),
    streetAddress: extracted('101 Main Street'),
    city: extracted('Austin'),
    state: extracted('texas'),
    zipCode: extracted('78701'),
  },
  contacts: [{
    tempId: 'contact-1',
    companyTempId: null,
    selected: true,
    displayName: extracted('Jane Owner'),
    company: extracted('Alpha Holdings'),
    email: extracted('JANE@EXAMPLE.COM'),
    primaryPhone: extracted('(512) 555-0101'),
  }],
  companies: [],
  relationships: [],
  propertyHistory: {},
  duplicateCandidates: [],
  warnings: [],
  overallConfidence: .92,
};

const draft = validateAndNormalizeDraft(raw, {
  importSessionId: 'session-1',
  screenshotCount: 1,
  method: 'clipboard_screenshot',
});
assert.equal(draft.importSessionId, 'session-1');
assert.equal(draft.facility.state.value, 'TX');
assert.equal(draft.contacts[0].email.value, 'jane@example.com');
assert.equal(draft.source.sourceUrl.value, 'https://salesforce.example/record/SF-001');
assert.deepEqual(draft.companies, []);
assert.deepEqual(draft.relationships, []);
assert.deepEqual(draft.propertyHistory, {});

// Sanitized fixture modeled on the supplied two-part Salesforce layout.
const screenshotExample = structuredClone(raw);
screenshotExample.facility.name = extracted('Mesa Park Self Storage');
screenshotExample.facility.streetAddress = extracted('100 Example Highway');
screenshotExample.facility.city = extracted('Sample City');
screenshotExample.facility.state = extracted('NM');
screenshotExample.facility.zipCode = extracted('87001');
screenshotExample.contacts[0].displayName = extracted('Alex Q Sample');
screenshotExample.contacts[0].company = extracted('Sample Holdings LLC');
screenshotExample.contacts[0].email = extracted(null, 0);
screenshotExample.contacts[0].primaryPhone = extracted(null, 0);
const screenshotDraft = validateAndNormalizeDraft(screenshotExample, {
  importSessionId: 'screenshot-example',
  screenshotCount: 2,
  method: 'clipboard_screenshot',
});
assert.equal(screenshotDraft.facility.name.value, 'Mesa Park Self Storage');
assert.equal(screenshotDraft.facility.streetAddress.value, '100 Example Highway');
assert.equal(screenshotDraft.contacts[0].displayName.value, 'Alex Q Sample');
assert.equal(screenshotDraft.contacts[0].company.value, 'Sample Holdings LLC');
assert.equal(SALESFORCE_EXTRACTION_PROMPT_VERSION, 'salesforce-screenshot-extraction-v5-partial-capture');
assert.equal(SALESFORCE_IMPORT_SCHEMA_VERSION, 'salesforce-import-draft-v2-core');
assert.match(SALESFORCE_EXTRACTION_PROMPT, /only the minimum prospecting information/i);
assert.match(SALESFORCE_EXTRACTION_PROMPT, /Do not extract record type/i);
assert.match(SALESFORCE_EXTRACTION_PROMPT, /logged a call/i);
assert.match(SALESFORCE_EXTRACTION_PROMPT, /Company Name -> facility\.name/);
assert.match(SALESFORCE_EXTRACTION_PROMPT, /Property Owner \(Company\).*contacts\[\]\.company/);
assert.match(SALESFORCE_EXTRACTION_PROMPT, /Use Company Name as the facility-name fallback/);
assert.match(SALESFORCE_EXTRACTION_PROMPT, /Always return a partial structured draft/);

const duplicates = scoreDuplicateCandidates(draft, {
  properties: [{ id: 'property-1', facility_name: 'Alpha Storage', address: '101 Main Street', city: 'Austin', state: 'TX', zip_code: '78701', source_record_id: null }],
  contacts: [{ id: 'contact-existing', owner_name: 'Jane Owner', email: 'jane@example.com', phone: '' }],
  companies: [],
});
assert.equal(duplicates.facility[0].existingId, 'property-1');
assert.equal(duplicates.contacts['contact-1'][0].existingId, 'contact-existing');

const reviewDraft = { ...draft, duplicateCandidates: duplicates };
const quickImport = validateApproval(reviewDraft, {});
assert.equal(quickImport.valid, true);

const approved = validateApproval(reviewDraft, {
  facility: { action: 'use_existing', existingId: 'property-1' },
  contacts: { 'contact-1': { action: 'update_blank', existingId: 'contact-existing' } },
  companies: {},
});
assert.equal(approved.valid, true);

const tampered = validateApproval(reviewDraft, {
  facility: { action: 'use_existing', existingId: 'not-a-candidate' },
  contacts: { 'contact-1': { action: 'skip' } },
  companies: {},
});
assert.equal(tampered.valid, false);
assert.ok(tampered.errors.some(error => error.includes('listed CRM matches')));

const partialRaw = structuredClone(raw);
partialRaw.facility = null;
partialRaw.contacts[0].company = extracted(null, 0);
partialRaw.contacts[0].email = extracted(null, 0);
partialRaw.contacts[0].primaryPhone = extracted(null, 0);
const partialDraft = validateAndNormalizeDraft(partialRaw, {
  importSessionId: 'partial-session',
  screenshotCount: 1,
  method: 'uploaded_screenshot',
});
assert.equal(partialDraft.facility.name.value, 'Facility for Jane Owner');
assert.equal(partialDraft.facility.streetAddress.value, null);
assert.ok(partialDraft.warnings.some(warning => warning.code === 'missing_identity'));
assert.equal(validateApproval(partialDraft, {}).valid, true);

const minimalRaw = structuredClone(raw);
minimalRaw.facility = null;
minimalRaw.contacts = [];
const minimalDraft = validateAndNormalizeDraft(minimalRaw, {
  importSessionId: 'minimal-session',
  screenshotCount: 1,
  method: 'uploaded_screenshot',
});
assert.equal(minimalDraft.facility.name.value, 'Salesforce Prospect minimal-');
assert.equal(validateApproval(minimalDraft, {}).valid, true);

if (typeof File !== 'undefined') {
  const pasted = clipboardImageFiles({
    items: [
      { kind: 'string', type: 'text/plain', getAsFile: () => null },
      { kind: 'file', type: 'image/png', getAsFile: () => new File(['png'], '', { type: 'image/png' }) },
    ],
  });
  assert.equal(pasted.length, 1);
  assert.equal(pasted[0].type, 'image/png');
}

console.log('salesforceImport tests passed');
