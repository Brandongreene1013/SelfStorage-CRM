# Sprint 16: Database Expansion Foundation

## 1. Sprint Objective
Start expanding Storage Hero from a seller-owner cold-call database into a broader self-storage relationship database without disrupting the existing seller/call workflow. This sprint deliberately lays a low-risk foundation: relationship type classification, optional owner entity, small Dashboard cleanup, and planning for future multiple-property ownership modeling.

## 2. Summary of Changes
- Added a shared relationship/contact type vocabulary: Storage Owner / Seller, Buyer, Institution, Developer, Broker, Vendor, Lender, Attorney / Consultant, Other.
- Added optional `ownerEntity` support in the app model, import parser, manual add form, contact detail modal, Database cards, duplicate merge fill-blanks logic, and Owner Research copy chips.
- Added a relationship type filter to the Database contact toolbar.
- Existing contacts default in the app to `Storage Owner / Seller`, preserving the current owner/seller calling workflow.
- Added import mapping support for relationship type and owner entity columns.
- Removed the unused older `PipelineAttention` component from `Dashboard.jsx`; the active `PipelineAttentionActions` implementation remains.
- Left Upcoming Callbacks as all future open call tasks for now; a 14/30-day window is still a product choice.

## 3. Files Created
- `sql/contact_relationship_foundation_migration.sql`
- `SPRINT_16_DATABASE_EXPANSION_FOUNDATION_HANDOFF.md`

## 4. Files Modified
- `src/data/constants.js`
- `src/hooks/useDatabase.js`
- `src/components/Database.jsx`
- `src/components/ResearchLinks.jsx`
- `src/lib/researchLinks.js`
- `src/lib/duplicateReview.js`
- `src/components/Dashboard.jsx`

Note: the working tree also already contained uncommitted Sprint 14/15 changes in `src/App.jsx`, `src/components/tasks/taskUtils.js`, and `src/components/ui/EmptyState.jsx`; those were preserved.

## 5. Data / Schema Changes
Migration file: `sql/contact_relationship_foundation_migration.sql`

It adds:
- `contacts.relationship_type text not null default 'storage_owner_seller'`
- `contacts.owner_entity text`
- a check constraint for the allowed relationship types
- an index on `relationship_type`
- comments explaining both columns

The frontend includes missing-column fallbacks for contact insert/update paths, so the app should not crash before the migration is run. However, relationship type and owner entity will only persist after Brandon runs the SQL in Supabase.

## 6. Manual Testing Completed
- `npm run build` passed.
- `npm run lint` still fails at the known baseline: 51 problems, 45 errors, 6 warnings.
- Confirmed local Vite server responds HTTP 200 at `http://127.0.0.1:5173`.
- Confirmed old `PipelineAttention` is removed and only `PipelineAttentionActions` is referenced.
- Confirmed protected Analyst/financial/TractIQ files were not modified.

No real contacts, tasks, duplicate groups, or owner records were deleted.

## 7. Build / Lint Results
- `npm run build`: passed. Existing large chunk warning only.
- `npm run lint`: failed on known baseline categories, still 51 problems (45 errors, 6 warnings). No new relationship-type-specific lint category was introduced.

## 8. Known Issues
- Brandon still needs to run `sql/contact_relationship_foundation_migration.sql` before the new columns persist live.
- No full browser click-through was completed in this session beyond local HTTP response and build verification.
- Duplicate Review still has real duplicate groups pending manual review. Do not bulk-delete them.
- Upcoming callback queue still includes all future open call tasks.
- Existing lint baseline remains.

## 9. What Not To Touch
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

## 10. Recommendation for Sprint 17
Run the Sprint 16 migration, verify live saves for `relationship_type` and `owner_entity`, then build a proper ownership/property model. Also consider whether Upcoming Callbacks should default to the next 14 or 30 days instead of all future callbacks.

## 11. Multiple Properties Under One Owner Recommendation
Use a separate ownership model rather than stuffing multiple properties into contact notes.

Recommended low-risk structure:
- `ownership_groups`: one record per legal/person ownership group, with display name, owner entity, notes, and relationship classification.
- `properties`: one record per facility/property, linked to an ownership group, with facility name, address, market, property metadata, and source fields.
- `contacts`: people and relationship records linked optionally to an ownership group and/or property.

Why: one owner can hold many facilities, one facility can have multiple people tied to it, and buyers/brokers/lenders may not own a property at all. Keeping contacts, ownership groups, and properties separate avoids turning one Database contact card into a brittle mega-record.
