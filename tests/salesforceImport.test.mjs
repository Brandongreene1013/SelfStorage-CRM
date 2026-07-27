import assert from 'node:assert/strict';
import {
  scoreDuplicateCandidates,
  validateAndNormalizeDraft,
  validateApproval,
} from '../api/_salesforceImport.js';
import { clipboardImageFiles } from '../src/lib/salesforceImportClient.js';

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
