import { normalizeBrokerageContinuumStage } from './brokerageContinuum.js';

export function dbToCoreClient(row) {
  return {
    id: row.id,
    contactId: row.contact_id,
    primaryPropertyId: row.primary_property_id ?? null,
    sellingMotivation: row.selling_motivation ?? '',
    motivationStrength: row.motivation_strength ?? 'unclear',
    sellingTimeline: row.selling_timeline ?? 'unknown',
    priceExpectations: row.price_expectations ?? '',
    saleBarriers: row.sale_barriers ?? '',
    followUpFrequencyDays: row.follow_up_frequency_days ?? null,
    nextAction: row.next_action ?? '',
    nextActionDueDate: row.next_action_due_date ?? '',
    assignedUser: row.assigned_user ?? 'Brandon Greene',
    brokerageContinuumStage: normalizeBrokerageContinuumStage(row.brokerage_continuum_stage),
    brokerageContinuumStageEnteredAt: row.brokerage_continuum_stage_entered_at ?? row.created_at ?? null,
    brokerageContinuumUpdatedAt: row.brokerage_continuum_updated_at ?? row.updated_at ?? null,
    brokerageContinuumUpdatedBy: row.brokerage_continuum_updated_by ?? '',
    brokerageContinuumNote: row.brokerage_continuum_note ?? '',
    notes: row.notes ?? '',
    lastMeaningfulContactAt: row.last_meaningful_contact_at ?? null,
    status: row.status ?? 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function coreClientToDb(profile) {
  return {
    contact_id: profile.contactId,
    primary_property_id: profile.primaryPropertyId || null,
    selling_motivation: profile.sellingMotivation?.trim() ?? '',
    motivation_strength: profile.motivationStrength || 'unclear',
    selling_timeline: profile.sellingTimeline || 'unknown',
    price_expectations: profile.priceExpectations?.trim() ?? '',
    sale_barriers: profile.saleBarriers?.trim() ?? '',
    follow_up_frequency_days: profile.followUpFrequencyDays
      ? Number(profile.followUpFrequencyDays)
      : null,
    next_action: profile.nextAction?.trim() ?? '',
    next_action_due_date: profile.nextActionDueDate || null,
    assigned_user: profile.assignedUser?.trim() || 'Brandon Greene',
    notes: profile.notes?.trim() ?? '',
    last_meaningful_contact_at: profile.lastMeaningfulContactAt || null,
    status: profile.status || 'active',
    updated_at: new Date().toISOString(),
  };
}

export function dbToBrokerageContinuumHistory(row) {
  return {
    id: row.id,
    coreClientId: row.core_client_id,
    previousStage: row.previous_stage,
    newStage: normalizeBrokerageContinuumStage(row.new_stage),
    changedAt: row.changed_at,
    effectiveAt: row.effective_at,
    changedBy: row.changed_by ?? '',
    changeReason: row.change_reason ?? '',
    changeNote: row.change_note ?? '',
    source: row.source ?? 'manual',
    relatedPropertyId: row.related_property_id ?? null,
    relatedClientId: row.related_client_id ?? null,
    metadata: row.metadata ?? {},
  };
}
