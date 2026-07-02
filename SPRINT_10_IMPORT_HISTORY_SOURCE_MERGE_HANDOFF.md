# Storage Hunters CRM - Sprint 10 Handoff

## Sprint Goal
Sprint 10 adds import provenance and a safer duplicate workflow to the Database import flow:

- Track source metadata for imported contacts and imported lists.
- Show source context where Brandon actually works contacts.
- Add a lightweight Import History panel.
- Add a conservative duplicate mode that appends missing phones/notes to existing contacts instead of creating duplicate rows.

## Files Changed
- `src/hooks/useDatabase.js`
- `src/components/ImportListModal.jsx`
- `src/components/Database.jsx`
- `sql/contact_import_source_tracking_migration.sql`
- `qa-import-fixtures/duplicate-append-source.csv`
- `SPRINT_10_IMPORT_HISTORY_SOURCE_MERGE_HANDOFF.md`

## Schema Migration
Run this file in the Supabase SQL Editor:

`sql/contact_import_source_tracking_migration.sql`

It adds:

- `contacts.source`
- `contacts.import_filename`
- `contacts.imported_at`
- `lists.import_filename`
- `lists.import_row_count`
- `lists.ready_to_call_count`
- `lists.duplicate_skipped_count`
- `lists.merged_duplicate_count`
- `lists.additional_phone_count`

The app is migration-tolerant. If these columns do not exist yet, import and update operations fall back to the existing schema instead of breaking.

## Source Tracking
Imported contacts now get source metadata from the modal:

1. Explicit source selection, if Brandon picks one.
2. Uploaded filename, if source is set to "Use filename."
3. `Manual / Unknown` fallback.

The source is saved on new contacts when the migration has been run. Before migration, it still appears at the list level where the existing `lists.source` column is available.

## Import History
The Database sidebar now includes a compact Import History panel showing the latest imported lists, excluding Master Database.

Each row shows:

- list name
- source badge
- import date
- imported/callable counts
- skipped/appended duplicate counts when available
- Open button
- Call button

Counts use new list metadata when present and gracefully fall back to live contact counts when the migration has not run yet.

## Duplicate Append Mode
The import modal now has three duplicate modes:

- Import anyway
- Skip possible duplicates
- Append missing phones/notes

Append mode is conservative:

- It does not create a new contact for duplicate rows.
- It adds missing primary/imported phones into `alternatePhones`.
- It fills blank fields only.
- It does not overwrite existing populated fields.
- It appends import notes/source context to notes.
- It does not merge clients or pipeline records.

Duplicate preview now shows both the reason and the matched existing contact name.

## Visible Source Badges
Source badges now appear in:

- Database contact cards
- Contact detail modal
- Call Mode header/contact area
- Import History rows

The badge falls back from `contact.source` to the contact's list source when needed.

## QA Fixture
Added:

`qa-import-fixtures/duplicate-append-source.csv`

This includes one duplicate-style North Star row with a new alternate phone and one fresh row, so future sessions can test append behavior without real-owner data.

## Verification Run
Build:

`npm run build`

Result: passed.

Parser QA:

Loaded `qa-import-fixtures/duplicate-append-source.csv` through Vite SSR with one existing North Star contact. Result:

- 2 total rows
- 2 ready to call
- 1 possible duplicate
- duplicate reasons included phone, email, owner/address, and facility/market
- duplicate match returned the existing contact
- extra phone was captured for append

Lint:

`npm run lint`

Result: existing baseline only: 55 problems, 46 errors, 9 warnings. Sprint 10 did not worsen the lint count.

QA seed status:

`node scripts/qa-seed.mjs status`

Result:

- Lists: 0
- Contacts: 0
- Tasks: 0

## Live Schema Check
Before this sprint, live Supabase did not yet have the new Sprint 10 columns:

- `contacts.source` missing
- list import metadata columns missing

That is expected until Brandon runs the migration SQL.

## Notes For Next Session
- After Brandon runs `sql/contact_import_source_tracking_migration.sql`, verify that new imports populate contact/list metadata directly.
- A deeper future sprint could add a full Import Detail screen or audit trail table. Sprint 10 intentionally stayed lightweight and list-based.
- Master Database imports can append duplicates and insert new contacts, but they do not currently update Master Database list metadata because Master DB is an existing pinned list.

