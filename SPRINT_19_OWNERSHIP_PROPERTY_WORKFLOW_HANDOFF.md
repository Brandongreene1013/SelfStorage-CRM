# Sprint 19: Ownership / Property Workflow

## 1. Objective
Stabilize the Sprint 18 relationship source and ownership/property workflow, verify the live migrations, and add a lightweight ownership management surface that Brandon can use day to day without turning Database into a new module.

## 2. Files Modified / Created
Modified:
- `src/components/Database.jsx`

Created:
- `SPRINT_19_OWNERSHIP_PROPERTY_WORKFLOW_HANDOFF.md`

No new migrations were created.

## 3. Migration Status
No SQL is required from Brandon for Sprint 19.

Live Supabase verified:
- `contacts.lead_source` exists.
- `contacts.ownership_group_id` exists.
- `ownership_groups` exists.
- `properties` exists.
- Guarded QA contact insert/update/delete passed.
- Guarded QA ownership group insert/update/delete passed.
- Guarded QA property insert/update/delete passed.
- Cleanup left 0 Sprint 19 QA contacts, groups, properties, and tasks.

## 4. Exact Behavior Changed
- Added a Database sidebar view: `Owners / Properties`.
- The new view is cross-list, like Call Mode and Duplicate Review.
- Ownership group list shows:
  - Display name
  - Owner entity
  - Relationship classification
  - Linked property count
  - Linked contact count
- Selected ownership group detail shows:
  - Editable group fields
  - Linked contacts, clickable into Contact Detail
  - Linked properties
  - Basic property edit fields
  - Add-property form
- Added Call Mode queue: `All Future Callbacks`.
- Added Database quick filter button: `All Future Callbacks`.

## 5. Lead Source Verification
- Live DB verified a guarded QA contact could save `lead_source`.
- Browser verified:
  - Contact cards show `Lead Source: Facebook Group`.
  - Search finds a contact by `Facebook Group`.
  - Relationship Type filter + Lead Source filter keep the QA contact visible.
  - Contact Detail displays the persisted lead source.
- Import mapping UI still renders; a direct Node import-mapping call was blocked by Vite extensionless import resolution outside the app runtime, so this was not script-verified.

## 6. Ownership Group Workflow Changes
- Contacts can still link to ownership groups from Contact Detail.
- The new Owners / Properties view shows multiple contacts under one ownership group through `contacts.ownership_group_id`.
- Ownership group edit saves display name, owner entity, relationship type, and notes.
- No contact is forced to belong to an ownership group.

## 7. Property Workflow Changes
- Properties remain linked through `properties.ownership_group_id`.
- Owners / Properties view shows linked properties under the selected group.
- Property edit saves facility name, property type, address, and market.
- Add Property creates a property under the selected ownership group.

## 8. Dashboard / Pipeline Attention
- Dashboard Upcoming Callbacks remains next 30 days.
- No Dashboard stat calculation was changed; no fake numbers were added.
- Pipeline Attention was confirmed actionable in code and browser render:
  - Client row button opens edit surface.
  - `Log` opens action logging.
  - `Task` opens task creation.

## 9. Callback Beyond 30 Days Decision
Dashboard Upcoming remains capped at next 30 days.

Callbacks beyond 30 days now live in Database / Call Mode via:
- `All Future Callbacks` queue
- `All Future Callbacks` quick filter

This queue uses the same callback builder as the Dashboard/Call Mode queues, but without the 30-day `windowDays` cap.

## 10. Manual QA Completed
Preflight:
- `npm install`: up to date, existing 8 vulnerabilities reported.
- `npm run build`: passed before changes.

Live Supabase:
- Schema checks passed for all required columns/tables.
- Inserted 2 guarded QA contacts under one ownership group.
- Inserted guarded QA property.
- Updated guarded QA property.
- Updated guarded QA contact lead source.
- Verified linked counts: 2 contacts, 1 property.
- Cleanup verified 0 QA contacts, groups, properties, tasks.

Browser:
- Dashboard rendered cleanly; no visible blank-space regression.
- Pipeline Attention rendered with clickable action buttons.
- Database rendered.
- Owners / Properties sidebar view rendered.
- Guarded QA contact was visible after refresh.
- Contact card showed Lead Source.
- Search by Lead Source worked.
- Relationship Type + Lead Source filters worked.
- Contact Detail showed Owner Entity, Lead Source, ownership group, and property.
- Owners / Properties view showed group, linked contact, linked property, and counts.
- Edited property name in Owners / Properties view.
- Refreshed and confirmed property edit persisted.
- All Future Callbacks queue appeared in Call Mode and opened successfully.

Browser limitation:
- The embedded in-app browser could not click the low footer button in Add Contact modal because the coordinate target landed below the viewport. The modal fields themselves rendered and accepted values correctly. The guarded QA row was seeded through Supabase for the remaining browser checks.

Call Mode / backdated logging:
- Existing Call Mode Activity Date controls still render.
- Full backdated logging mutation was not repeated in browser after the footer-coordinate limitation and timeout in the queue. No code in those paths was changed this sprint.

Duplicate Review:
- Duplicate Review view still renders and was not modified.
- No duplicate cleanup was performed.

## 11. Build Result
`npm run build`: passed.

Existing Vite large chunk warning remains.

## 12. Lint Result
`npm run lint`: still fails at the known baseline:
- 51 problems
- 45 errors
- 6 warnings

No new lint category remains from Sprint 19.

## 13. Known Issues
- Add Contact modal footer can sit low in the embedded browser automation viewport; real UI should still be manually checked in a normal browser.
- No standalone create-ownership-group button was added to Owners / Properties; creation still starts from Contact Detail.
- Property edit in Owners / Properties is intentionally basic: facility name, property type, address, market.
- No property search/filtering yet.
- No `lead_source_notes` field yet.
- Call Mode backdated logging was not fully re-mutated in browser this sprint because the relevant code path was unchanged and browser automation timed out while advancing the future queue.

## 14. What Not To Touch Next
- `api/analyst.js`
- `api/_financialModel.js`
- `src/data/financialModel.js`
- `src/lib/excelModel.js`
- `public/model-template.xlsm`
- TractIQ OAuth/secrets
- Supabase service-role logic
- `app_secrets`
- Duplicate Review safety logic
- Real owner/contact/property records outside guarded QA fixtures

## 15. Recommended Sprint 20 Focus
- Polish ownership/property list UX.
- Add ownership/property search and filtering.
- Add `lead_source_notes`.
- Consider drag-and-drop relationship pipeline sections.
- Plan a separate Analyst/report-reading sprint without touching protected financial model files.
