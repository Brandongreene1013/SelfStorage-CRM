export const BROKERAGE_CONTINUUM_STAGES = [
  { value: 'research', label: 'Research', shortLabel: 'Research', order: 1, staleAfterDays: 14, objective: 'Obtain enough verified context to begin informed outreach.', tone: 'slate' },
  { value: 'cold_call', label: 'Cold Call', shortLabel: 'Cold Call', order: 2, staleAfterDays: 14, objective: 'Reach the person and earn a substantive first conversation.', tone: 'sky' },
  { value: 'first_appointment', label: '1st Appointment', shortLabel: '1st Appt.', order: 3, staleAfterDays: 14, objective: 'Understand the person, assets, motivation, and potential brokerage need.', tone: 'blue' },
  { value: 'second_appointment', label: '2nd Appointment', shortLabel: '2nd Appt.', order: 4, staleAfterDays: 21, objective: 'Convert trust and advisory work into an exclusive assignment.', tone: 'indigo' },
  { value: 'exclusive_listing', label: 'Exclusive Listing', shortLabel: 'Exclusive', order: 5, staleAfterDays: 14, objective: 'Prepare the assignment for market and coordinate launch.', tone: 'purple' },
  { value: 'market_sell', label: 'Market / Sell', shortLabel: 'Market', order: 6, staleAfterDays: 30, objective: 'Generate qualified buyer interest and competitive tension.', tone: 'violet' },
  { value: 'field_offers', label: 'Field Offers', shortLabel: 'Offers', order: 7, staleAfterDays: 14, objective: 'Maximize price, terms, certainty, and buyer fit.', tone: 'amber' },
  { value: 'contract', label: 'Contract', shortLabel: 'Contract', order: 8, staleAfterDays: null, objective: 'Launch transaction coordination and track contractual obligations.', tone: 'orange' },
  { value: 'due_diligence', label: 'Due Diligence', shortLabel: 'Due Diligence', order: 9, staleAfterDays: null, objective: 'Remove contingencies, protect the deal, and reach closing.', tone: 'rose' },
  { value: 'close', label: 'Close', shortLabel: 'Close', order: 10, staleAfterDays: 7, objective: 'Complete final administration and recognize the transaction.', tone: 'emerald' },
  { value: 'post_close', label: 'Post-Close', shortLabel: 'Post-Close', order: 11, staleAfterDays: 90, objective: 'Maintain the relationship and create future business and referrals.', tone: 'teal' },
];

export const BROKERAGE_CONTINUUM_STAGE_VALUES = BROKERAGE_CONTINUUM_STAGES.map(stage => stage.value);
export const BROKERAGE_CONTINUUM_STAGE_MAP = Object.fromEntries(
  BROKERAGE_CONTINUUM_STAGES.map(stage => [stage.value, stage]),
);

export const BROKERAGE_CONTINUUM_GROUPS = [
  { value: 'prospecting', label: 'Prospecting', stages: ['research', 'cold_call'] },
  { value: 'relationship_development', label: 'Relationship Development', stages: ['first_appointment', 'second_appointment'] },
  { value: 'active_listing', label: 'Active Listing', stages: ['exclusive_listing', 'market_sell', 'field_offers'] },
  { value: 'under_contract', label: 'Under Contract', stages: ['contract', 'due_diligence'] },
  { value: 'completed_relationship', label: 'Completed Relationship', stages: ['close', 'post_close'] },
];

export const BROKERAGE_CONTINUUM_REASONS = [
  { value: 'owner_paused', label: 'Owner paused process' },
  { value: 'listing_withdrawn', label: 'Listing withdrawn' },
  { value: 'listing_expired', label: 'Listing expired' },
  { value: 'lost_contact', label: 'Lost contact' },
  { value: 'contract_terminated', label: 'Contract terminated' },
  { value: 'buyer_defaulted', label: 'Buyer defaulted' },
  { value: 'offers_rejected', label: 'Offers rejected' },
  { value: 'property_not_for_sale', label: 'Property no longer for sale' },
  { value: 'data_correction', label: 'Data correction' },
  { value: 'relationship_reactivated', label: 'Relationship reactivated' },
  { value: 'new_transaction_cycle', label: 'New transaction cycle' },
  { value: 'stage_progression', label: 'Normal stage progression' },
  { value: 'other', label: 'Other' },
];

export const CONTINUUM_NOTE_REQUIRED_REASONS = new Set([
  'other',
  'data_correction',
  'contract_terminated',
  'listing_withdrawn',
  'relationship_reactivated',
]);

const SEARCH_ALIASES = {
  research: ['research'],
  cold_call: ['cold call', 'outreach', 'prospecting'],
  first_appointment: ['first appointment', '1st appointment', 'first appt', '1st appt'],
  second_appointment: ['second appointment', '2nd appointment', 'second appt', '2nd appt'],
  exclusive_listing: ['exclusive listing', 'exclusive', 'listing agreement'],
  market_sell: ['market sell', 'market / sell', 'market', 'marketing'],
  field_offers: ['field offers', 'offers', 'loi'],
  contract: ['contract', 'under contract', 'psa'],
  due_diligence: ['due diligence', 'dd', 'diligence'],
  close: ['close', 'closed', 'closing'],
  post_close: ['post close', 'post-close', 'past client'],
};

export function isBrokerageContinuumStage(value) {
  return BROKERAGE_CONTINUUM_STAGE_VALUES.includes(value);
}

export function normalizeBrokerageContinuumStage(value) {
  return isBrokerageContinuumStage(value) ? value : 'research';
}

export function brokerageContinuumStage(value) {
  return BROKERAGE_CONTINUUM_STAGE_MAP[normalizeBrokerageContinuumStage(value)];
}

export function brokerageContinuumOrder(value) {
  return brokerageContinuumStage(value).order;
}

export function brokerageContinuumDirection(previousStage, newStage) {
  const delta = brokerageContinuumOrder(newStage) - brokerageContinuumOrder(previousStage);
  if (delta > 0) return 'forward';
  if (delta < 0) return 'backward';
  return 'unchanged';
}

export function continuumTransitionRequirements(previousStage, newStage, reason = '') {
  const previousOrder = brokerageContinuumOrder(previousStage);
  const newOrder = brokerageContinuumOrder(newStage);
  const direction = brokerageContinuumDirection(previousStage, newStage);
  const skippedForward = newOrder - previousOrder > 2;
  const removedActiveListing = previousOrder >= brokerageContinuumOrder('exclusive_listing')
    && newOrder < brokerageContinuumOrder('exclusive_listing');
  const reasonRequired = direction === 'backward' || skippedForward || removedActiveListing;
  return {
    direction,
    skippedForward,
    removedActiveListing,
    reasonRequired,
    noteRequired: CONTINUUM_NOTE_REQUIRED_REASONS.has(reason),
  };
}

export function brokerageContinuumSearchMatches(stage, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return true;
  return (SEARCH_ALIASES[normalizeBrokerageContinuumStage(stage)] ?? [])
    .some(alias => alias.includes(normalizedQuery) || normalizedQuery.includes(alias));
}

export function continuumDaysInStage(enteredAt, now = new Date()) {
  const entered = Date.parse(enteredAt || '');
  if (!Number.isFinite(entered)) return 0;
  return Math.max(0, Math.floor((now.getTime() - entered) / 86400000));
}

export function continuumStallThreshold(profile) {
  const stage = brokerageContinuumStage(profile?.brokerageContinuumStage);
  if (stage.value === 'contract' || stage.value === 'due_diligence') return null;
  if (stage.value === 'second_appointment' && ['12_24_months', 'more_than_24_months'].includes(profile?.sellingTimeline)) {
    return Math.max(stage.staleAfterDays ?? 0, 90);
  }
  return stage.staleAfterDays;
}

export function isContinuumStalled(profile, tasks = [], today = new Date().toISOString().slice(0, 10)) {
  const threshold = continuumStallThreshold(profile);
  if (!threshold) return false;
  const days = continuumDaysInStage(profile?.brokerageContinuumStageEnteredAt, new Date(`${today}T12:00:00Z`));
  const relatedTasks = tasks.filter(task => task.status === 'open'
    && task.relatedType === 'contact'
    && task.relatedId === profile?.contactId);
  const hasFutureTask = relatedTasks.some(task => task.dueDate && task.dueDate >= today);
  const hasOverdueTask = relatedTasks.some(task => task.dueDate && task.dueDate < today);
  return days > threshold && (!hasFutureTask || hasOverdueTask);
}

export function suggestedContinuumStageFromPipeline(stageId) {
  const map = {
    1: 'research',
    2: 'cold_call',
    3: 'first_appointment',
    4: 'second_appointment',
    5: 'exclusive_listing',
    6: 'market_sell',
    7: 'field_offers',
    8: 'contract',
    9: 'close',
    10: 'post_close',
  };
  return map[Number(stageId)] ?? null;
}
