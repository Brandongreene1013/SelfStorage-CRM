import { z } from 'zod';

export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_SCREENSHOTS = 6;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 16 * 1024 * 1024;

const scalarSchema = z.union([z.string(), z.number(), z.boolean()]).nullable();
export const extractedValueSchema = z.object({
  value: scalarSchema,
  rawValue: z.string().nullable(),
  normalizedValue: scalarSchema,
  confidence: z.number().min(0).max(1),
  screenshotId: z.string().nullable(),
  evidenceText: z.string().max(1000).nullable(),
  status: z.enum(['extracted', 'not_found', 'ambiguous', 'conflicting', 'user_edited']),
}).strict();

const facilityFields = [
  'name', 'streetAddress', 'city', 'state', 'zipCode',
];
const contactFields = [
  'displayName', 'company', 'email', 'primaryPhone',
];
const companyFields = [];
const historyFields = [];

function extractedObject(fields) {
  return z.object(Object.fromEntries(fields.map(field => [field, extractedValueSchema]))).strict();
}

const contactSchema = extractedObject(contactFields).extend({
  tempId: z.string().min(1).max(100),
  companyTempId: z.string().max(100).nullable().optional(),
  selected: z.boolean().default(true),
}).strict();

const companySchema = extractedObject(companyFields).extend({
  tempId: z.string().min(1).max(100),
  selected: z.boolean().default(true),
}).strict();

const relationshipTypes = [
  'facility_primary_owner_contact',
  'facility_secondary_owner_contact',
  'facility_owner_company',
  'facility_management_company',
  'contact_company',
  'company_parent_company',
  'other',
];

const relationshipSchema = z.object({
  relationshipType: z.enum(relationshipTypes),
  facilityTempId: z.string().max(100).nullable().optional(),
  contactTempId: z.string().max(100).nullable().optional(),
  companyTempId: z.string().max(100).nullable().optional(),
  role: z.string().max(200).default(''),
  confidence: z.number().min(0).max(1),
  evidenceText: z.string().max(1000).nullable(),
  screenshotId: z.string().nullable(),
}).strict();

const warningSchema = z.object({
  code: z.enum([
    'low_confidence', 'conflict', 'multiple_properties', 'cropped',
    'not_salesforce', 'missing_identity', 'other',
  ]),
  message: z.string().min(1).max(2000),
  screenshotIds: z.array(z.string()).max(MAX_SCREENSHOTS).default([]),
  fieldPath: z.string().max(300).nullable().optional(),
}).strict();

export const salesforceImportDraftSchema = z.object({
  importSessionId: z.string().min(1),
  source: z.object({
    system: z.literal('salesforce'),
    method: z.enum(['clipboard_screenshot', 'uploaded_screenshot']),
    screenshotCount: z.number().int().min(1).max(MAX_SCREENSHOTS),
    sourceRecordId: extractedValueSchema,
    sourceUrl: extractedValueSchema,
  }).strict(),
  facility: extractedObject(facilityFields).nullable(),
  contacts: z.array(contactSchema).max(20),
  companies: z.array(companySchema).max(0),
  relationships: z.array(relationshipSchema).max(0),
  propertyHistory: extractedObject(historyFields),
  duplicateCandidates: z.union([z.array(z.any()), z.record(z.string(), z.any())]).default([]),
  warnings: z.array(warningSchema).max(50),
  overallConfidence: z.number().min(0).max(1),
}).strict();

function fieldJsonSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      value: { type: ['string', 'number', 'boolean', 'null'] },
      rawValue: { type: ['string', 'null'] },
      normalizedValue: { type: ['string', 'number', 'boolean', 'null'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      screenshotId: { type: ['string', 'null'] },
      evidenceText: { type: ['string', 'null'] },
      status: { type: 'string', enum: ['extracted', 'not_found', 'ambiguous', 'conflicting'] },
    },
    required: ['value', 'rawValue', 'normalizedValue', 'confidence', 'screenshotId', 'evidenceText', 'status'],
  };
}

function objectFieldsJsonSchema(fields, extra = {}) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      ...Object.fromEntries(fields.map(field => [field, fieldJsonSchema()])),
      ...extra,
    },
    required: [...fields, ...Object.keys(extra).filter(key => !['companyTempId', 'facilityTempId', 'contactTempId'].includes(key))],
  };
}

export const SALESFORCE_DRAFT_TOOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    importSessionId: { type: 'string' },
    source: {
      type: 'object',
      additionalProperties: false,
      properties: {
        system: { type: 'string', enum: ['salesforce'] },
        method: { type: 'string', enum: ['clipboard_screenshot', 'uploaded_screenshot'] },
        screenshotCount: { type: 'integer', minimum: 1, maximum: MAX_SCREENSHOTS },
        sourceRecordId: fieldJsonSchema(),
        sourceUrl: fieldJsonSchema(),
      },
      required: ['system', 'method', 'screenshotCount', 'sourceRecordId', 'sourceUrl'],
    },
    facility: {
      anyOf: [
        objectFieldsJsonSchema(facilityFields),
        { type: 'null' },
      ],
    },
    contacts: {
      type: 'array',
      maxItems: 20,
      items: objectFieldsJsonSchema(contactFields, {
        tempId: { type: 'string' },
        companyTempId: { type: ['string', 'null'] },
        selected: { type: 'boolean' },
      }),
    },
    companies: {
      type: 'array',
      maxItems: 0,
      items: objectFieldsJsonSchema(companyFields, {
        tempId: { type: 'string' },
        selected: { type: 'boolean' },
      }),
    },
    relationships: {
      type: 'array',
      maxItems: 0,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          relationshipType: { type: 'string', enum: relationshipTypes },
          facilityTempId: { type: ['string', 'null'] },
          contactTempId: { type: ['string', 'null'] },
          companyTempId: { type: ['string', 'null'] },
          role: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          evidenceText: { type: ['string', 'null'] },
          screenshotId: { type: ['string', 'null'] },
        },
        required: ['relationshipType', 'facilityTempId', 'contactTempId', 'companyTempId', 'role', 'confidence', 'evidenceText', 'screenshotId'],
      },
    },
    propertyHistory: objectFieldsJsonSchema(historyFields),
    duplicateCandidates: { type: 'array', maxItems: 0 },
    warnings: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          code: { type: 'string', enum: ['low_confidence', 'conflict', 'multiple_properties', 'cropped', 'not_salesforce', 'missing_identity', 'other'] },
          message: { type: 'string' },
          screenshotIds: { type: 'array', items: { type: 'string' }, maxItems: MAX_SCREENSHOTS },
          fieldPath: { type: ['string', 'null'] },
        },
        required: ['code', 'message', 'screenshotIds', 'fieldPath'],
      },
    },
    overallConfidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: [
    'importSessionId', 'source', 'facility', 'contacts', 'companies',
    'relationships', 'propertyHistory', 'duplicateCandidates', 'warnings',
    'overallConfidence',
  ],
};

function cleanString(value, max = 2000) {
  if (value == null) return null;
  const cleaned = String(value).replace(/\s+/g, ' ').trim().slice(0, max);
  return cleaned || null;
}

function normalizeState(value) {
  const states = {
    alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
    colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
    hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
    kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
    massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
    missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
    'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
    oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
    'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
    virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
    wyoming: 'WY', 'district of columbia': 'DC',
  };
  const cleaned = cleanString(value, 50);
  if (!cleaned) return null;
  if (/^[a-z]{2}$/i.test(cleaned)) return cleaned.toUpperCase();
  return states[cleaned.toLowerCase()] || null;
}

function normalizePhone(value) {
  const cleaned = cleanString(value, 100);
  if (!cleaned) return null;
  const digits = cleaned.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 ? cleaned : null;
}

function normalizeEmail(value) {
  const cleaned = cleanString(value, 320)?.toLowerCase();
  return cleaned && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? cleaned : null;
}

function normalizeUrl(value) {
  const cleaned = cleanString(value, 1000);
  if (!cleaned) return null;
  try {
    return new URL(/^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`).toString();
  } catch {
    return null;
  }
}

function numeric(value, { min = -Infinity, max = Infinity } = {}) {
  if (value == null || value === '') return null;
  const number = Number(String(value).replace(/[$,%\s,]/g, ''));
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function normalizeDate(value) {
  const cleaned = cleanString(value, 100);
  if (!cleaned) return null;
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

const normalizers = {
  state: normalizeState,
  zipCode: value => /^\d{5}(?:-\d{4})?$/.test(cleanString(value, 20) || '') ? cleanString(value, 20) : null,
  email: normalizeEmail,
  website: normalizeUrl,
  sourceUrl: normalizeUrl,
  primaryPhone: normalizePhone,
  secondaryPhone: normalizePhone,
  mainPhone: normalizePhone,
  facilityPhone: normalizePhone,
  yearBuilt: value => numeric(value, { min: 1700, max: new Date().getFullYear() + 5 }),
  units: value => numeric(value, { min: 0, max: 1_000_000 }),
  rentableSqft: value => numeric(value, { min: 0 }),
  acreage: value => numeric(value, { min: 0 }),
  occupancy: value => {
    const n = numeric(value, { min: 0, max: 100 });
    return n == null ? null : n;
  },
  lastSaleDate: normalizeDate,
  lastSalePrice: value => numeric(value, { min: 0 }),
  lastSalePricePsf: value => numeric(value, { min: 0 }),
  lastCapRate: value => numeric(value, { min: 0, max: 100 }),
};

function normalizeExtracted(fieldName, extracted) {
  const value = extracted.value;
  const normalize = normalizers[fieldName] || (input => cleanString(input));
  const normalized = normalize(value);
  return {
    ...extracted,
    rawValue: cleanString(extracted.rawValue, 2000),
    value: normalized,
    normalizedValue: normalized,
    evidenceText: cleanString(extracted.evidenceText, 1000),
    status: normalized == null && extracted.status === 'extracted' ? 'ambiguous' : extracted.status,
  };
}

function normalizeEntity(entity, fields) {
  return {
    ...entity,
    ...Object.fromEntries(fields.map(field => [field, normalizeExtracted(field, entity[field])])),
  };
}

function emptyExtracted() {
  return {
    value: null,
    rawValue: null,
    normalizedValue: null,
    confidence: 0,
    screenshotId: null,
    evidenceText: null,
    status: 'not_found',
  };
}

function temporaryFacilityName(facility, contacts, importSessionId) {
  const address = cleanString(facility.streetAddress.value);
  const company = contacts.map(contact => cleanString(contact.company.value)).find(Boolean);
  const owner = contacts.map(contact => cleanString(contact.displayName.value)).find(Boolean);
  if (address) return `Facility at ${address}`;
  if (company) return `Salesforce Prospect — ${company}`;
  if (owner) return `Facility for ${owner}`;
  return `Salesforce Prospect ${String(importSessionId).slice(0, 8)}`;
}

function dedupeEntities(entities, keyFn) {
  const seen = new Map();
  entities.forEach(entity => {
    const key = keyFn(entity);
    if (!key || !seen.has(key)) {
      seen.set(key || entity.tempId, entity);
      return;
    }
    const existing = seen.get(key);
    for (const [field, value] of Object.entries(entity)) {
      if (value?.value != null && (existing[field]?.value == null || value.confidence > existing[field].confidence)) {
        existing[field] = value;
      }
    }
  });
  return [...seen.values()];
}

export function validateAndNormalizeDraft(raw, { importSessionId, screenshotCount, method }) {
  const parsed = salesforceImportDraftSchema.parse({
    ...raw,
    importSessionId,
    source: {
      ...raw.source,
      system: 'salesforce',
      method,
      screenshotCount,
    },
  });
  const contacts = dedupeEntities(
    parsed.contacts.map(contact => normalizeEntity(contact, contactFields)),
    contact => normalizeEmail(contact.email.value)
      || normalizePhone(contact.primaryPhone.value)
      || cleanString(contact.displayName.value)?.toLowerCase(),
  );
  const facility = parsed.facility
    ? normalizeEntity(parsed.facility, facilityFields)
    : normalizeEntity(Object.fromEntries(facilityFields.map(field => [field, emptyExtracted()])), facilityFields);
  const needsTemporaryFacilityName = !facility.name.value;
  if (needsTemporaryFacilityName) {
    const value = temporaryFacilityName(facility, contacts, importSessionId);
    facility.name = {
      value,
      rawValue: null,
      normalizedValue: value,
      confidence: 0,
      screenshotId: null,
      evidenceText: 'Temporary facility name added so this partial Salesforce record can be imported.',
      status: 'ambiguous',
    };
  }
  const companies = dedupeEntities(
    parsed.companies.map(company => normalizeEntity(company, companyFields)),
    company => cleanString(company.name.value)?.toLowerCase(),
  );
  return {
    ...parsed,
    source: {
      ...parsed.source,
      sourceRecordId: normalizeExtracted('sourceRecordId', parsed.source.sourceRecordId),
      sourceUrl: normalizeExtracted('sourceUrl', parsed.source.sourceUrl),
    },
    facility,
    contacts,
    companies,
    propertyHistory: normalizeEntity(parsed.propertyHistory, historyFields),
    duplicateCandidates: [],
    warnings: needsTemporaryFacilityName
      ? [
          ...parsed.warnings,
          {
            code: 'missing_identity',
            message: `A temporary facility name ("${facility.name.value}") was added. You can rename it after import.`,
            screenshotIds: [],
            fieldPath: 'facility.name',
          },
        ]
      : parsed.warnings,
  };
}

function baseNormalize(value) {
  return cleanString(value)?.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() || '';
}

function phoneKey(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : '';
}

function websiteDomain(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) return '';
  try { return new URL(normalized).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function candidate(kind, record, score, reasons) {
  const strength = score >= 100 ? 'exact' : score >= 70 ? 'strong' : score >= 40 ? 'possible' : 'none';
  return {
    kind,
    existingId: record.id,
    score,
    strength,
    reasons,
    display: {
      name: record.name || record.owner_name || record.display_name || record.facility_name || '',
      facilityName: record.facility_name || '',
      address: record.address || record.mailing_address || '',
      email: record.email || '',
      phone: record.phone || '',
    },
  };
}

export function scoreDuplicateCandidates(draft, snapshot) {
  const results = { facility: [], contacts: {}, companies: {} };
  const facility = draft.facility;
  if (facility) {
    const name = baseNormalize(facility.name.value);
    const address = baseNormalize(facility.streetAddress.value);
    const cityState = baseNormalize(`${facility.city.value || ''} ${facility.state.value || ''}`);
    const zip = cleanString(facility.zipCode.value);
    const sourceId = cleanString(draft.source.sourceRecordId.value);
    const domain = websiteDomain(facility.website?.value);
    const phone = phoneKey(facility.facilityPhone?.value);
    results.facility = snapshot.properties.map(record => {
      let score = 0;
      const reasons = [];
      if (sourceId && sourceId === record.source_record_id) { score += 100; reasons.push('Same Salesforce record ID'); }
      if (address && address === baseNormalize(record.address)) { score += 80; reasons.push('Exact normalized address'); }
      if (name && name === baseNormalize(record.facility_name) && zip && zip === record.zip_code) { score += 65; reasons.push('Same facility name and ZIP'); }
      if (name && name === baseNormalize(record.facility_name) && cityState && cityState === baseNormalize(`${record.city || ''} ${record.state || ''}`)) { score += 50; reasons.push('Same facility name and market'); }
      if (domain && domain === websiteDomain(record.website)) { score += 55; reasons.push('Same website domain'); }
      if (phone && phone === phoneKey(record.facility_phone)) { score += 55; reasons.push('Same facility phone'); }
      return candidate('facility', record, score, reasons);
    }).filter(match => match.score >= 40).sort((a, b) => b.score - a.score).slice(0, 5);
  }

  draft.contacts.forEach(contact => {
    const name = baseNormalize(contact.displayName.value);
    const company = baseNormalize(contact.company.value);
    const email = normalizeEmail(contact.email.value);
    const phone = phoneKey(contact.primaryPhone.value);
    const sourceId = cleanString(contact.sourceRecordId?.value);
    results.contacts[contact.tempId] = snapshot.contacts.map(record => {
      let score = 0;
      const reasons = [];
      if (sourceId && sourceId === record.source_record_id) { score += 100; reasons.push('Same Salesforce contact ID'); }
      if (email && email === normalizeEmail(record.email)) { score += 85; reasons.push('Same email'); }
      if (phone && phone === phoneKey(record.phone)) { score += 80; reasons.push('Same phone'); }
      if (name && name === baseNormalize(record.owner_name)) { score += 45; reasons.push('Same normalized name'); }
      if (name && company && name === baseNormalize(record.owner_name) && company === baseNormalize(record.owner_entity || record.company_name)) { score += 30; reasons.push('Same name and company'); }
      return candidate('contact', record, score, reasons);
    }).filter(match => match.score >= 40).sort((a, b) => b.score - a.score).slice(0, 5);
  });

  draft.companies.forEach(company => {
    const name = baseNormalize(company.name.value);
    const address = baseNormalize(company.mailingAddress.value);
    const domain = websiteDomain(company.website.value);
    const phone = phoneKey(company.mainPhone.value);
    const sourceId = cleanString(company.sourceRecordId.value);
    results.companies[company.tempId] = snapshot.companies.map(record => {
      let score = 0;
      const reasons = [];
      if (sourceId && sourceId === record.source_record_id) { score += 100; reasons.push('Same Salesforce company ID'); }
      if (name && name === baseNormalize(record.display_name || record.owner_entity)) { score += 65; reasons.push('Same normalized company name'); }
      if (address && address === baseNormalize(record.mailing_address)) { score += 55; reasons.push('Same mailing address'); }
      if (domain && domain === websiteDomain(record.website)) { score += 55; reasons.push('Same website domain'); }
      if (phone && phone === phoneKey(record.phone)) { score += 55; reasons.push('Same phone'); }
      return candidate('company', record, score, reasons);
    }).filter(match => match.score >= 40).sort((a, b) => b.score - a.score).slice(0, 5);
  });
  return results;
}

export function validateApproval(draft, decisions) {
  const parsed = salesforceImportDraftSchema.parse(draft);
  const errors = [];
  const selectedCount = (parsed.facility ? 1 : 0)
    + parsed.contacts.filter(item => item.selected).length
    + parsed.companies.filter(item => item.selected).length;
  if (selectedCount === 0) errors.push('Select at least one record to import.');
  const contactIds = new Set(parsed.contacts.map(item => item.tempId));
  const companyIds = new Set(parsed.companies.map(item => item.tempId));
  parsed.relationships.forEach((relationship, index) => {
    if (relationship.contactTempId && !contactIds.has(relationship.contactTempId)) {
      errors.push(`Relationship ${index + 1} refers to a contact that was removed.`);
    }
    if (relationship.companyTempId && !companyIds.has(relationship.companyTempId)) {
      errors.push(`Relationship ${index + 1} refers to a company that was removed.`);
    }
    if (!relationship.contactTempId && !relationship.companyTempId) {
      errors.push(`Relationship ${index + 1} must connect a contact or company.`);
    }
  });

  const duplicates = parsed.duplicateCandidates || {};
  const checkDecision = (decision, matches, label) => {
    if (!decision?.action) return;
    if (!['create', 'use_existing', 'update_blank', 'skip'].includes(decision.action)) {
      errors.push(`Choose a valid duplicate action for ${label}.`);
    }
    if (['use_existing', 'update_blank'].includes(decision.action) && !matches.some(match => match.existingId === decision.existingId)) {
      errors.push(`Choose one of the listed CRM matches for ${label}.`);
    }
  };
  checkDecision(decisions?.facility, duplicates.facility || [], 'the facility');
  for (const [tempId, matches] of Object.entries(duplicates.contacts || {})) {
    checkDecision(decisions?.contacts?.[tempId], matches, `contact ${tempId}`);
  }
  for (const [tempId, matches] of Object.entries(duplicates.companies || {})) {
    checkDecision(decisions?.companies?.[tempId], matches, `company ${tempId}`);
  }
  return { valid: errors.length === 0, errors, draft: parsed };
}
