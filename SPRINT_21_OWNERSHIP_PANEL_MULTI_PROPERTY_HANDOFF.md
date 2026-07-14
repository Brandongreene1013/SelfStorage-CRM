# Sprint 21: Ownership Panel Multi-Property Logging

## 1. Objective
Extend the ownership/property workflow so Brandon can record multiple properties under a single owner from the ownership panel, while keeping the Database calling workflow intact.

## 2. Commit Range
- `9b31fb6` — Sprint 21: Log multiple properties per owner from the ownership panel
- `94de35c` — Sprint 21a: Fix scroll-lock leak that froze page scrolling and buried buttons
- `f17eb28` — Fix facility address imports for ownerless lists

## 3. Files Modified / Created
Modified:
- `src/components/Database.jsx`
- `src/components/ui/ModalLayout.jsx`
- `src/components/ImportListModal.jsx`
- `src/components/OwnershipLinksPanel.jsx`
- `src/hooks/useCRM.js`
- `src/hooks/useDatabase.js`
- `src/hooks/useOwnership.js`
- `src/App.jsx`
- `src/components/ClientCard.jsx`

Created:
- `sql/client_ownership_group_link_migration.sql`
- `SPRINT_21_OWNERSHIP_PANEL_MULTI_PROPERTY_HANDOFF.md`

## 4. Behavior Changed
- Ownership panel supports logging multiple properties for one owner / ownership group.
- Ownerless facility/address imports were corrected so imported property data does not vanish when a list does not already have a linked owner.
- Modal scroll-lock behavior was fixed again after a leak froze page scrolling and pushed important footer buttons out of reach.
- CRM-side ownership linking expanded beyond a single owner/property placeholder into a more practical multi-property workflow.

## 5. SQL / Schema Notes
Created migration:
- `sql/client_ownership_group_link_migration.sql`

Before relying on client-to-ownership linking in a fresh environment, confirm this SQL has been run in Supabase and verify with a guarded insert/update/delete. Do not assume the migration has run only because the file exists.

## 6. Why It Matters
The CRM is no longer just a list of individual contacts. It is becoming a relationship map: one owner can have several facilities, several people can relate to one owner, and one call can uncover more than one asset. This sprint moved the ownership/property system closer to that real brokerage model.

## 7. Known Issues / Carry Forward
- Ownership/property UI is still lightweight and Database-centered. It is not a full property management module.
- Property search/filtering was not introduced here.
- Because ownership data touches real relationship records, test future changes with guarded QA records and clean them up immediately.

## 8. Protected Areas Not Touched
- Analyst prompt/model/export files
- TractIQ OAuth / secrets
- Duplicate Review bulk safety logic
- Real owner/contact/property data outside guarded QA fixtures

## 9. Recommended Follow-Up
- Add ownership/property search and filtering.
- Continue improving import mapping so property data lands in the right model even when source lists are messy.
- Keep an eye on modal footer reachability in embedded and PWA contexts.
