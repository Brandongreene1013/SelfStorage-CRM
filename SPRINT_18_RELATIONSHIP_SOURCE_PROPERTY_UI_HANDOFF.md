# Sprint 18: Relationship Source / Property UI

## 1. Objective
Build the first usable UI layer on top of the Sprint 17 ownership/property foundation while keeping the cold-calling Database workflow intact. Add lead/relationship source tracking for contacts, and let a contact link to an ownership group with one or more properties.

## 2. Files Modified / Created
Modified:
- `src/components/Database.jsx`
- `src/data/constants.js`
- `src/hooks/useDatabase.js`

Created:
- `src/hooks/useOwnership.js`
- `sql/contact_lead_source_migration.sql`
- `sql/contact_ownership_group_link_migration.sql`
- `SPRINT_18_RELATIONSHIP_SOURCE_PROPERTY_UI_HANDOFF.md`

## 3. SQL / Migration Status
Sprint 17 ownership/property schema is live and verified:
- `ownership_groups` exists.
- `properties` exists.
- Insert/delete QA round-trip succeeded for both tables.
- Cleanup verified 0 remaining QA rows.

Sprint 18 contact columns are not live yet:
- `contacts.lead_source` check returned `42703: column contacts.lead_source does not exist`.
- `contacts.ownership_group_id` check returned `42703: column contacts.ownership_group_id does not exist`.

Brandon still needs to run these in Supabase SQL Editor:
1. `sql/contact_lead_source_migration.sql`
2. `sql/contact_ownership_group_link_migration.sql`

Until those are run, the app remains safe because contact insert/update/import paths strip those columns on missing-column errors. Lead source and contact-to-ownership links will not persist until the SQL is live.

## 4. Behavior Changed
- Added a shared `LEAD_SOURCES` list in constants.
- Import mapping can now detect and map lead/relationship source columns.
- Add Contact modal includes Lead / Relationship Source.
- Contact Detail includes Lead / Relationship Source.
- Database search includes lead source text.
- Database filter bar includes an All Lead Sources dropdown.
- Contact cards show Lead Source when present.
- Contact Detail now has a real Owner / Property Links panel:
  - Link a contact to an existing ownership group.
  - Create an ownership group from the contact.
  - Update the linked ownership group from contact fields.
  - Create a property under the linked ownership group.
  - Show linked properties.
  - Update a linked property from contact fields.

## 5. Verification Completed
- `npm run build`: passed.
- `npm run lint`: still fails at the known baseline, 51 problems / 45 errors / 6 warnings. No new lint issue remains from Sprint 18.
- Live Supabase:
  - `ownership_groups` select OK.
  - `properties` select OK.
  - QA ownership group insert OK.
  - QA property insert OK.
  - QA property cleanup OK.
  - QA ownership group cleanup OK.
  - Remaining QA ownership groups: 0.
- Live Supabase confirmed Sprint 18 contact columns are not yet run.

## 6. Known Issues / Next Step
- Run both Sprint 18 contact migrations before expecting lead source/contact ownership links to persist.
- After the migrations run, do a browser click-through:
  - Add a QA contact with Lead Source.
  - Open Contact Detail.
  - Create Ownership Group.
  - Link contact to the group.
  - Add Property.
  - Refresh and confirm link/source/property persist.
  - Delete QA records.
- This sprint did not build a standalone Ownership Groups admin page. Ownership work starts from Contact Detail.
- This sprint did not alter Dashboard stats or Pipeline attention logic.

## 7. What Not To Touch Next
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
