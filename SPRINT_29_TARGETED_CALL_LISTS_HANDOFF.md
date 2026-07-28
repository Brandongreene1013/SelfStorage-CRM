# Sprint 29 — Targeted Call Lists & Bulk Contact Selection

Date: 2026-07-28
Branch: `claude/storage-investment-crm-vV018`

## Objective
Make Database lists behave like CRM segments instead of folders. One canonical
contact can remain in Master Database while also appearing in multiple targeted
call lists, with professional multi-select controls for building call blocks.

## What changed
- Added a checkbox to the upper-right action area of every Database contact card.
- Selected cards receive an amber selection outline.
- Added a sticky bulk-action bar with:
  - selected-person count;
  - add to an existing call list;
  - create a new targeted call list and add the selection;
  - remove from the active targeted list;
  - clear selection;
  - select all currently visible contacts.
- Added `contact_list_memberships`, a normalized many-to-many join table.
- Targeted-list membership is additive: adding or dragging a Master contact to a
  call list does not change `contacts.list_id` and does not duplicate the person.
- List views, sidebar counts, saved Call Mode sessions, and Active List Call Mode
  queues all include additive members.
- Per-card list actions now say **Add to…**, not **Move to…**.
- Removing a person from a call list keeps the contact in Master Database.
- Deleting a list removes the segment and preserves its people. Legacy contacts
  whose home was that list are safely re-homed to Master Database first.

## Schema migration — pending
Run `sql/contact_list_memberships_migration.sql` in the Supabase SQL Editor.
It is idempotent and creates:
- `public.contact_list_memberships`
- unique `(contact_id, list_id)` membership
- cascade cleanup when a contact/list is deleted
- permissive anon/authenticated RLS matching the CRM's existing app-data model

Until the migration runs, the UI loads safely and shows a clear migration
message when selection mode is used. It will not silently move or duplicate
contacts.

## Verification
- `npm run lint` passes.
- `npm test` passes, including `tests/listMemberships.test.mjs`.
- `npm run build` passes; the existing large-chunk warning remains.
- Local browser QA against live read-only CRM data:
  - Master Database loaded.
  - Card checkbox selected one person.
  - Card selection outline and selected count rendered.
  - Bulk action bar rendered with existing-list picker and migration notice.
  - New-list dialog rendered the selected count and preservation explanation.
  - No browser console errors.
- No contact/list writes were performed during browser QA because the migration
  is intentionally still pending.

## Files
- `sql/contact_list_memberships_migration.sql`
- `src/lib/listMemberships.js`
- `src/hooks/useDatabase.js`
- `src/components/Database.jsx`
- `tests/listMemberships.test.mjs`
- `package.json`

## Go-live verification after Brandon runs the migration
1. Refresh the CRM.
2. Open Database → Master Database.
3. Select two guarded/test contacts.
4. Create a targeted test list from the bulk bar.
5. Confirm both appear in that list and still appear in Master Database.
6. Start Call Mode from the targeted list and confirm both are in the queue.
7. Remove them from the targeted list and confirm they remain in Master.
8. Delete the empty test list.

