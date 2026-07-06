# Sprint 15: Live QA + Dashboard Layout Fix

## 1. Sprint Objective
Do a focused QA/polish pass on Sprint 14: fix the remaining Dashboard blank-space issue, click through the new callback/follow-up workflow, and repair any broken Sprint 14 behavior without expanding the CRM data model.

## 2. Summary of Changes
- Fixed the Dashboard top blank-space issue by no longer rendering an empty Today's Attack List card when there are no due/overdue attack rows.
- Let Pipeline Attention occupy the top follow-up area by itself when Attack List and Needs Follow-Up are empty, instead of reserving an empty grid column.
- Reduced the shared `EmptyState` vertical padding from `py-20` to `py-8`, making in-card empty states fit the CRM's compact dashboard/workflow surfaces.
- Fixed a backdated Call Mode logging bug found during QA: date inputs now update state on both `input` and `change`, so selected activity dates persist correctly.
- Completed a QA-seeded write-path test for Call Mode phone edit, existing callback completion, backdated activity logging, callback presets, and new callback task creation.
- Cleaned up all QA records after testing.

## 3. Root Cause of Dashboard Blank Space
The large blank space was caused by the top Dashboard grid always rendering Today's Attack List in a two-column/three-column layout even when there were zero attack rows. The empty Attack List used the shared `EmptyState`, whose `py-20` padding created a tall empty card. When Pipeline Attention had real rows, the grid still left the empty Attack List column/area visible, making the top of the Dashboard feel hollow.

Fix:
- Hide the Attack List card entirely when `attackRows.length === 0`.
- If there are no Needs Follow-Up rows either, render Pipeline Attention full width.
- Reduce shared empty-state padding for card-based empty states.

Measured local result:
- KPI strip moved from about `y=663` to `y=567` in the 1280x720 viewport after the layout fix.
- Page scroll height dropped from about `2208` to `2016`.

## 4. Files Created
- `SPRINT_15_LIVE_QA_DASHBOARD_FIX_HANDOFF.md`

## 5. Files Modified
- `src/components/Dashboard.jsx`
- `src/components/Database.jsx`
- `src/components/ui/EmptyState.jsx`

## 6. Bugs Found During QA
- Call Mode activity-date field visually accepted a backdated date, but the call history persisted today's date in Supabase.

## 7. Bugs Fixed
- Added `onInput` alongside `onChange` for activity-date inputs in Contact Detail and Call Mode. Retested against QA data: a Conversation logged with `2026-07-01` persisted to `contacts.call_history` as `2026-07-01`.

## 8. Manual Testing Completed
- Dashboard Callback Command Center rendered with live counts.
- Dashboard card routing:
  - Today's Callbacks opened a clean empty Today's Callbacks Call Mode state.
  - Overdue Callbacks opened a clean empty Overdue Callbacks state when none matched.
  - Upcoming opened the 1-contact Upcoming Callbacks queue.
  - Recent Conversations opened Follow-Up Needed.
  - Appt / BOV Follow-Up routed into Database contacts.
- Database quick filters rendered after selecting All Contacts:
  - Due Today, Overdue, Upcoming opened Call Mode queues without crashing.
  - Call Back, Conversation, Appt Set, Untouched applied `callback`, `conversation`, `appointment`, and `fresh` filters.
- QA-seeded Call Mode tests:
  - Inline primary phone edit saved to Supabase.
  - Existing `alternate_phones` survived primary phone edit.
  - Backdated Conversation outcome saved the selected call-history date.
  - Existing callback task completed from Call Mode.
  - `2 days` callback preset set callback due date to `2026-07-04`.
  - New Call Back outcome created an open call task due `2026-07-04`.
- Duplicate Review rendered and did not show the localStorage-only warning.
- Contact Detail / Owner Research Hub rendered with research links and copy-chip labels.
- QA cleanup verified clean: 0 QA lists, 0 QA contacts, 0 QA tasks remain.

## 9. Build / Lint Results
- `npm run build`: passed. Existing large chunk warning only.
- `npm run lint`: still fails on known baseline, `51 problems (45 errors, 6 warnings)`. No new lint category introduced by this sprint.

## 10. Known Issues
- Existing lint baseline remains.
- Duplicate Review still has 25 real duplicate groups pending manual review in the live data; do not bulk-delete them.
- The Dashboard still has an unused older `PipelineAttention` component beside the active `PipelineAttentionActions` implementation. It is harmless but can be cleaned up in a small follow-up refactor.
- Upcoming callback queue currently means all future open call tasks, not a limited upcoming window.

## 11. What Not To Touch
- `api/analyst.js`
- `api/_financialModel.js`
- `src/data/financialModel.js`
- `src/lib/excelModel.js`
- `public/model-template.xlsm`
- TractIQ OAuth/secrets
- Supabase service-role logic
- `app_secrets`
- Existing duplicate review safety logic unless fixing a specific bug
- Real duplicate groups or real owner/contact records outside guarded QA fixtures

## 12. Recommended Sprint 16 Focus
- Small cleanup: remove the unused older `PipelineAttention` component from `Dashboard.jsx`.
- Consider a bounded Upcoming window, such as next 14 or 30 days, if all-future callbacks becomes noisy.
- Calendar integration for Appointment Set follow-up / meeting creation.
- Then begin database model planning for buyers/institutions/developers/brokers, owner entity, and multiple properties per owner.
