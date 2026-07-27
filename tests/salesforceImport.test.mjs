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
const fields = names => Object.fromEntries(names.map(name => [name, extracted(null, 0)]));

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
    ...fields([
      'name', 'recordType', 'propertyType', 'propertyClass', 'streetAddress', 'city',
      'state', 'zipCode', 'county', 'website', 'propertyGroup', 'yearBuilt',
      'facilityPhone', 'units', 'rentableSqft', 'acreage', 'occupancy',
      'expansionPotential', 'notes',
    ]),
    name: extracted('Alpha Storage'),
    streetAddress: extracted('101 Main Street'),
    city: extracted('Austin'),
    state: extracted('texas'),
    zipCode: extracted('78701'),
    occupancy: extracted('91%'),
  },
  contacts: [{
    tempId: 'contact-1',
    companyTempId: 'company-1',
    selected: true,
    ...fields([
      'sourceRecordId', 'firstName', 'middleName', 'lastName', 'displayName',
      'jobTitle', 'role', 'company', 'email', 'primaryPhone', 'secondaryPhone',
      'mailingAddress', 'notes',
    ]),
    displayName: extracted('Jane Owner'),
    company: extracted('Alpha Holdings'),
    email: extracted('JANE@EXAMPLE.COM'),
    primaryPhone: extracted('(512) 555-0101'),
  }],
  companies: [{
    tempId: 'company-1',
    selected: true,
    ...fields(['sourceRecordId', 'name', 'companyType', 'website', 'mainPhone', 'mailingAddress', 'notes']),
    name: extracted('Alpha Holdings'),
  }],
  relationships: [{
    relationshipType: 'facility_primary_owner_contact',
    facilityTempId: 'facility-1',
    contactTempId: 'contact-1',
    companyTempId: 'company-1',
    role: 'Owner',
    confidence: .95,
    evidenceText: 'Owner relationship shown',
    screenshotId: 'shot-1',
  }],
  propertyHistory: fields(['lastSaleDate', 'lastSalePrice', 'lastSalePricePsf', 'lastCapRate', 'previousSaleNotes']),
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
assert.equal(draft.facility.occupancy.value, 91);
assert.equal(draft.contacts[0].email.value, 'jane@example.com');
assert.equal(draft.source.sourceUrl.value, 'https://salesforce.example/record/SF-001');

// Sanitized fixture modeled on the supplied two-part Salesforce layout.
const screenshotExample = structuredClone(raw);
screenshotExample.facility.name = extracted('Mesa Park Self Storage');
screenshotExample.facility.recordType = extracted('Self-Storage');
screenshotExample.facility.streetAddress = extracted('100 Example Highway');
screenshotExample.facility.city = extracted('Sample City');
screenshotExample.facility.state = extracted('NM');
screenshotExample.facility.zipCode = extracted('87001');
screenshotExample.facility.yearBuilt = extracted('2005');
screenshotExample.contacts[0].displayName = extracted('Alex Q Sample');
screenshotExample.contacts[0].firstName = extracted('Alex');
screenshotExample.contacts[0].middleName = extracted('Q');
screenshotExample.contacts[0].lastName = extracted('Sample');
screenshotExample.contacts[0].role = extracted('Primary property owner');
screenshotExample.contacts[0].company = extracted('Sample Holdings LLC');
screenshotExample.contacts[0].email = extracted(null, 0);
screenshotExample.contacts[0].primaryPhone = extracted(null, 0);
screenshotExample.companies[0].name = extracted('Sample Holdings LLC');
screenshotExample.companies[0].companyType = extracted('Property owner');
screenshotExample.propertyHistory.lastSaleDate = extracted('12/16/2008');
const screenshotDraft = validateAndNormalizeDraft(screenshotExample, {
  importSessionId: 'screenshot-example',
  screenshotCount: 2,
  method: 'clipboard_screenshot',
});
assert.equal(screenshotDraft.facility.name.value, 'Mesa Park Self Storage');
assert.equal(screenshotDraft.facility.streetAddress.value, '100 Example Highway');
assert.equal(screenshotDraft.facility.state.value, 'NM');
assert.equal(screenshotDraft.facility.yearBuilt.value, 2005);
assert.equal(screenshotDraft.contacts[0].displayName.value, 'Alex Q Sample');
assert.equal(screenshotDraft.companies[0].name.value, 'Sample Holdings LLC');
assert.equal(screenshotDraft.propertyHistory.lastSaleDate.value, '2008-12-16');
assert.equal(screenshotDraft.contacts.some(contact => contact.displayName.value === 'Activity User'), false);
assert.equal(SALESFORCE_EXTRACTION_PROMPT_VERSION, 'salesforce-screenshot-extraction-v2');
assert.match(SALESFORCE_EXTRACTION_PROMPT, /logged a call/i);
assert.match(SALESFORCE_EXTRACTION_PROMPT, /Property Owner \(Contact\)/);

const duplicates = scoreDuplicateCandidates(draft, {
  properties: [{ id: 'property-1', facility_name: 'Alpha Storage', address: '101 Main Street', city: 'Austin', state: 'TX', zip_code: '78701', source_record_id: null }],
  contacts: [{ id: 'contact-existing', owner_name: 'Jane Owner', email: 'jane@example.com', phone: '' }],
  companies: [{ id: 'company-existing', display_name: 'Alpha Holdings' }],
});
assert.equal(duplicates.facility[0].existingId, 'property-1');
assert.equal(duplicates.contacts['contact-1'][0].existingId, 'contact-existing');
assert.equal(duplicates.companies['company-1'][0].existingId, 'company-existing');

const reviewDraft = { ...draft, duplicateCandidates: duplicates };
const incomplete = validateApproval(reviewDraft, {}, {});
assert.equal(incomplete.valid, false);
assert.ok(incomplete.errors.some(error => error.includes('facility duplicate')));

const approved = validateApproval(reviewDraft, {
  facility: { action: 'use_existing', existingId: 'property-1' },
  contacts: { 'contact-1': { action: 'update_blank', existingId: 'contact-existing' } },
  companies: { 'company-1': { action: 'create', existingId: null } },
});
assert.equal(approved.valid, true);

const tampered = validateApproval(reviewDraft, {
  facility: { action: 'use_existing', existingId: 'not-a-candidate' },
  contacts: { 'contact-1': { action: 'skip' } },
  companies: { 'company-1': { action: 'skip' } },
});
assert.equal(tampered.valid, false);
assert.ok(tampered.errors.some(error => error.includes('listed CRM matches')));

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
