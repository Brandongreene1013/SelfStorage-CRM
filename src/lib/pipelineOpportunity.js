import { canonicalLeadSource } from '../data/constants.js';
import { normalizeMailingAddresses } from './mailingAddresses.js';

// `clients` is the legacy table name. Product code treats each row as a
// property-specific pipeline opportunity linked to a canonical contact.
export function dbToPipelineOpportunity(row) {
  return {
    id: row.id,
    contactId: row.contact_id ?? null,
    name: row.name,
    type: row.type,
    propertyType: row.property_type,
    facilityName: row.facility_name,
    address: row.address,
    mailingAddress: row.mailing_address ?? '',
    mailingAddresses: normalizeMailingAddresses(row.mailing_addresses),
    phone: row.phone,
    email: row.email,
    leadSource: canonicalLeadSource(row.lead_source),
    age: row.age ?? null,
    units: row.units,
    sqft: row.sqft,
    desiredSalePrice: row.desired_sale_price ?? null,
    projectedCommissionPct: row.projected_commission_pct ?? null,
    notes: row.notes,
    stageId: row.stage_id,
    storageClass: row.storage_class,
    documents: row.documents ?? [],
    nextActionType: row.next_action_type ?? '',
    nextActionDate: row.next_action_date ?? '',
    nextActionNote: row.next_action_note ?? '',
    leadTemp: row.lead_temp ?? '',
    actionLog: row.action_log ?? [],
    ownershipGroupId: row.ownership_group_id ?? null,
    propertyId: row.property_id ?? null,
    opportunityName: row.opportunity_name ?? '',
    assignedUser: row.assigned_user ?? 'Brandon Greene',
    ownerPricingExpectation: row.owner_pricing_expectation ?? null,
    importantNotes: row.important_notes ?? '',
    stageEnteredAt: row.stage_entered_at ?? null,
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function withCanonicalContact(opportunity, contact) {
  if (!opportunity || !contact || opportunity.contactId !== contact.id) return opportunity;
  return {
    ...opportunity,
    name: contact.ownerName || opportunity.name,
    phone: contact.phone || '',
    email: contact.email || '',
    leadSource: canonicalLeadSource(contact.leadSource),
    age: contact.age ?? null,
    mailingAddress: contact.mailingAddress ?? '',
    mailingAddresses: normalizeMailingAddresses(contact.mailingAddresses),
    notes: contact.notes ?? '',
    leadTemp: contact.leadTemp ?? '',
  };
}
