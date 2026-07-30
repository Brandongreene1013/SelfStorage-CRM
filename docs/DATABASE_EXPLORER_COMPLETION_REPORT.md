# Database Explorer / Folder Organization Upgrade

## Outcome

The Database section now provides a file-explorer-style hierarchy for organizing prospecting lists without changing the CRM records inside those lists.

Protected operating views remain pinned and unchanged:

- Master Database
- Core Clients
- All Contacts
- Call Mode
- Owners / Properties
- Duplicate Review
- Markets

User-created lists are organized in Database Explorer. Existing lists remain at Database root after migration.

## Data relationship map

- `contacts` remains the canonical person/facility record.
- `contacts.list_id` remains the legacy home-list relationship.
- `contact_list_memberships` remains the additive many-to-many targeted-list relationship.
- `lists` remains list metadata and receives only optional organizational fields.
- `database_folders` contains folder metadata and self-referencing hierarchy.
- A folder contains lists only. It never owns contacts, memberships, notes, calls, tasks, activity, ownership records, Pipeline records, or import/source history.
- Folder deletion can only delete folder metadata. Populated folders require their immediate contents to move to the parent first.

## Delivered behavior

- Nested folders with a database-enforced maximum depth of 10.
- Cycle, self-move, missing-destination, cross-workspace, duplicate-sibling-name, and stale-write protection.
- Transactional server-side folder creation, rename, move, safe deletion, bulk list move, and archive/restore.
- Audit rows for organizational mutations.
- Drag-and-drop for lists and folders.
- Keyboard-friendly Move To dialogs and bulk list selection.
- Breadcrumbs in both the Explorer and opened list views.
- Organization search across folder name, list name, source, and import filename.
- Name, record-count, and updated-date sorting.
- Recursive folder/list/record counts.
- Import and blank-list destination selection.
- URL-backed list and folder locations for reloadable deep links.
- Archived-list visibility and restore control.
- Migration-aware fallback: existing root lists remain usable before the migration is installed; folder-only mutations are disabled.
- Responsive stacked layout with organization tools prioritized on mobile.

## Migration

Run `sql/database_explorer_migration.sql` once in the Supabase SQL Editor.

The migration is additive, idempotent, and transaction-wrapped. It creates:

- `database_folders`
- `database_explorer_audit`
- organizational columns and indexes on `lists`
- validation triggers
- transactional RPC functions
- project-consistent RLS policies and grants

The checked-in rollback comments remove organization metadata only. They do not delete CRM records.

## Verification

- Production build: passed.
- ESLint: passed with no new errors.
- Full existing Node regression suite: passed.
- Hierarchy unit tests: passed.
- Migration contract tests: passed.
- Stress fixture: 2,000 folders and 10,000 lists; recursive count and search operations remained below the 2-second test ceiling.
- Live read-only schema probe before migration: 1,276 contacts, 14 lists, and expected `database_folders` missing-table response.
- Browser verification:
  - migration-safe root fallback
  - existing-list visibility and record counts
  - organization search
  - list opening with existing cards and actions intact
  - URL deep-link restoration after reload
  - 390 × 844 responsive layout with no horizontal overflow

## Post-migration production smoke test

After the SQL is installed and the deployment is live:

1. Create a root folder and a nested folder.
2. Move one low-risk test list using Move To.
3. Reload and confirm its breadcrumb.
4. Move it back using drag-and-drop.
5. Confirm Call Mode still opens for that list.
6. Import a small test list directly into a folder.
7. Delete the test folder using Move contents to parent.
8. Confirm contacts, notes, tasks, calls, memberships, source, and import history are unchanged.
