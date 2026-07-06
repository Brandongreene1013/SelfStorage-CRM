# Sprint 17: Ownership / Property Foundation

## 1. Objective
Turn Sprint 16's relationship-type and owner-entity foundation into a verified live workflow, then lay the low-risk schema foundation for modeling one owner with many properties. The sprint keeps the existing seller-owner cold-call workflow intact.

## 2. Files Modified / Created
Modified:
- `src/components/Dashboard.jsx`
- `src/components/Database.jsx`
- `src/components/tasks/taskUtils.js`

Created:
- `sql/ownership_property_foundation_migration.sql`
- `SPRINT_17_OWNERSHIP_PROPERTY_FOUNDATION_HANDOFF.md`

## 3. Migration Status
Sprint 16 migration is live and verified:
- `contacts.relationship_type` exists and persists.
- `contacts.owner_entity` exists and persists.
- `contacts_relationship_type_check` rejects invalid relationship values.

Sprint 17 migration is created but not live yet:
- `sql/ownership_property_foundation_migration.sql`
- Live Supabase check returned `PGRST205` for `public.ownership_groups`, meaning Brandon still needs to run the SQL in Supabase.

The Sprint 17 migration creates:
- `ownership_groups`
- `properties`
- safe indexes
- comments
- permissive app-data RLS policies

It does not touch existing `contacts` rows and does not force any contact into an ownership group.

## 4. Exact Behavior Changed
- Dashboard Upcoming Callbacks is now bounded to the next 30 days.
- Database Upcoming Callbacks queue uses the same next-30-days definition, so the Dashboard card and queue agree.
- Contact Detail now includes a read-only Owner / Property Links foundation panel showing placeholders for linked ownership group and linked properties.
- No full ownership-group UI was built yet.

## 5. Manual QA Completed
Live Supabase verification:
- Inserted a temporary contact with `relationship_type = buyer` and `owner_entity`.
- Updated that contact to `relationship_type = broker`.
- Confirmed invalid relationship type is rejected by the DB constraint.
- Inserted/deleted temporary QA records only; cleanup verified 0 QA contacts/tasks remaining.

Browser QA:
- Dashboard rendered cleanly with no top blank-space regression visible.
- Dashboard Upcoming card rendered using the new bounded callback count.
- Database rendered Master Database contacts.
- Existing owner/seller contact cards still showed `Owner / Seller`.
- Manual Add Person modal displayed Owner Entity and Relationship Type.
- Created a guarded QA Buyer contact with Owner Entity through the UI.
- Refreshed the app and confirmed Buyer + Owner Entity persisted.
- Edited the QA contact to Broker through Contact Detail and confirmed it persisted.
- Relationship filter worked: Broker showed the QA record; Buyer hid it after the edit.
- Contact Detail rendered the Owner / Property Links placeholder panel on the current source.
- Duplicate Review rendered with the real duplicate count and no localStorage-only warning visible in the sidebar.

Partial Call Mode QA:
- Created a temporary due-today callback task for the QA contact.
- Due Today Call Mode route opened the correct empty-state surface, but the already-loaded app did not pick up the just-created task without a full task reload. I did not force further live mutation because the core Sprint 17 objective was relationship/ownership foundation.

## 6. Build Result
`npm run build`: passed.

Existing large chunk warning remains.

## 7. Lint Result
`npm run lint`: still fails at the known baseline:
- 51 problems
- 45 errors
- 6 warnings

No new lint category was introduced by Sprint 17.

## 8. Known Issues
- Brandon must run `sql/ownership_property_foundation_migration.sql` in Supabase before ownership groups/properties exist live.
- No UI exists yet to create/link ownership groups or property records.
- Contacts are not automatically migrated into ownership groups.
- Upcoming Callbacks is now next 30 days, so callbacks farther out are intentionally not counted in that Dashboard/queue surface.
- Duplicate Review still has real duplicate groups pending manual Brandon review. Do not bulk-delete them.
- Existing lint baseline remains.

## 9. What Not To Touch Next
- `api/analyst.js`
- `api/_financialModel.js`
- `src/data/financialModel.js`
- `src/lib/excelModel.js`
- `public/model-template.xlsm`
- TractIQ OAuth/secrets
- Supabase service-role logic
- `app_secrets`
- Duplicate Review safety logic unless fixing a specific bug
- Real duplicate groups or real owner/contact records outside guarded QA fixtures

## 10. Recommended Sprint 18 Focus
Build the first real UI layer for ownership groups and properties:
- Run and verify the Sprint 17 migration live.
- Add create/edit UI for ownership groups.
- Add create/edit UI for properties.
- Link multiple properties to one ownership group.
- Link multiple contacts to one ownership group.
- Show all properties under one owner without disrupting Database calling.
- Decide where callbacks beyond 30 days should live if Dashboard/Upcoming stays bounded.
