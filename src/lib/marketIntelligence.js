// Frontend re-export of the canonical market-intelligence engine so the app and
// the serverless pipeline share one implementation (same pattern as
// src/lib/activityAnalytics.js). Do not fork this logic.
export * from '../../api/_marketIntelligence.js';
