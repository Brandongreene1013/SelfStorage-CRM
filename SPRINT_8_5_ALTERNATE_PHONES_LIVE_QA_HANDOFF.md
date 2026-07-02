# Sprint 8.5: Alternate Phones Migration + Live QA

## 1. Sprint Name
Sprint 8.5: Alternate Phones Migration + Live QA.

## 2. Sprint Objective
Finish the Sprint 8 database/call-mode work by running the alternate phones migration, verifying the production Supabase schema, exercising the new contact-phone and delete workflows against safe QA data, and leaving a clean handoff for the next import-focused sprint.

## 3. Summary of What Changed
- Verified `contacts.alternate_phones` exists in production after Brandon ran the SQL in Supabase.
- Fixed the Call Mode keyboard hint so it renders real arrows: `← / →`.
- Added a Call Mode queue-index clamp so deleted or completed contacts cannot leave the header showing impossible progress like `4 of 3`.
- Live-tested additional phone add/edit/delete/multiple-label behavior in Contact Detail and Call Mode.
- Live-tested Contact Detail delete and Call Mode delete confirmation behavior, including the related-task warning.
- Cleaned all QA records from Supabase after testing.

## 4. Files Created
- `SPRINT_8_5_ALTERNATE_PHONES_LIVE_QA_HANDOFF.md`

## 5. Files Modified
- `src/components/Database.jsx`
- `src/components/ui/ModalLayout.jsx`
- `src/hooks/useDatabase.js`
- `sql/contact_alternate_phones_migration.sql`
- `SPRINT_8_DATABASE_SCALE_CALL_SPEED_HANDOFF.md`

## 6. Migration Status
Brandon ran `sql/contact_alternate_phones_migration.sql` in the Supabase SQL Editor. Verified live with the app's anon key:

```json
{
  "ok": true,
  "rows": 1,
  "sample": { "alternate_phones": [] }
}
```

The prior failure was `42703 column contacts.alternate_phones does not exist`; that is resolved.

## 7. Additional Phones QA
Using `node scripts/qa-seed.mjs seed`, the QA list and contacts were created in production with QA-prefixed names only.

Verified in Contact Detail:
- Added Owner `(555) 222-1001`, saved, and confirmed a clickable `tel:` link.
- Added Office `(555) 333-2002`, saved, then edited it to Manager `(555) 444-3003`.
- Deleted the Owner row and confirmed only the Manager row remained.
- Added Mobile `(555) 555-4004` and Unknown `(555) 666-5005`.
- Confirmed all five labels were exercised across the test sequence: Mobile, Office, Owner, Manager, Unknown.
- Confirmed the primary phone stayed unchanged at `contacts.phone`.

Verified in Call Mode:
- Additional phones rendered on the current contact.
- Saved alternate phones remained visible after closing/reopening the contact flow.
- Additional phone links rendered as `tel:` links alongside the primary phone.

## 8. Delete Contact QA
Contact Detail delete:
- Opened `QA Test Callback Today`.
- Confirmation modal warned: `1 open related task will remain in Tasks and may need cleanup.`
- Confirmed delete.
- Contact count dropped from 5 to 4 and the contact no longer appeared.
- The related task intentionally remained until QA cleanup.

Call Mode delete:
- Started Call Mode from the QA list after reset.
- Deleted `QA Test Owner 1` from Call Mode.
- Confirmation modal used irreversible-delete copy.
- After confirm, Call Mode advanced to `QA Test Owner 2` and the header showed `QA Test Call List — 1 of 2`.
- The deleted contact no longer appeared.

## 9. Arrow Navigation QA
Before the reset, verified:
- `ArrowRight`: `1 of 4` -> `2 of 4` -> `3 of 4` -> `4 of 4`.
- `ArrowLeft`: `4 of 4` -> `3 of 4`.
- `N` moved next and `B` moved back.
- The hint rendered as `Shortcuts: ← / → move through queue. N next, B back, X no answer, V voicemail, C callback.`

After the delete/clamp fix, verified against the reduced QA queue:
- Start: `QA Test Call List — 1 of 2`.
- `ArrowRight`: `2 of 2`.
- `ArrowRight` again: stayed `2 of 2`.
- `ArrowLeft`: returned to `1 of 2`.

## 10. Keyboard Guard QA
- Focused Call Notes, typed `arrow guard test`, pressed `ArrowRight` and `X`.
- The queue position did not change.
- `X` typed into the note instead of logging a no-answer outcome.
- Opened the delete confirmation modal and pressed `ArrowRight`.
- The queue position did not change while the modal was open.

## 11. Bug Fixed During QA
Live testing found an edge case after a contact left the queue: Call Mode could briefly show impossible progress such as `4 of 3`. Added a clamp in `CallQueue` so `index` is brought back inside the current queue length whenever the queue shrinks.

## 12. Import Prep Findings
Current import mapping in `src/hooks/useDatabase.js` still chooses only the first phone-like column:

```js
else if (!fieldMap.phone && /phone|tel|mobile|cell|#|\bnumber\b/i.test(lh)) {
  fieldMap.phone = i;
}
```

It does not yet collect extra phone-like columns into `alternatePhones`, and import inserts do not send `alternate_phones`. Sprint 9 should add:
- `phoneIndexes` collection instead of a single `fieldMap.phone`.
- Primary phone selection from the best first column.
- Alternate phone rows for remaining phone-like columns.
- Labels inferred from headers such as Mobile, Office, Owner, Manager, or Unknown.
- Import verification that saved rows round-trip through `alternate_phones`.

## 13. Existing Features Confirmed Working
- Dashboard callback counts reflected the QA due-today and overdue tasks during seeding.
- Database list selection and contact count updates worked.
- Contact Detail modal opened, saved fields, and deleted contacts.
- Call Mode opened from the active QA list and respected queue navigation.
- Additional phones did not affect primary phone dialing.
- Analyst, financial model, Excel export, TractIQ, secrets, and API functions were untouched.

## 14. QA Data Cleanup
Final cleanup command:

```text
node scripts/qa-seed.mjs cleanup
```

Verified clean:

```text
Lists:    0
Contacts: 0
Tasks:    0
```

No QA lists, QA contacts, or QA tasks remain in production Supabase.

## 15. Build / Lint Results
- `npm run build`: passed.
- Build warning: same pre-existing Vite large chunk warning.
- `npm run lint`: 55 problems (46 errors, 9 warnings), matching the known Sprint 7/Sprint 8 baseline.
- The new queue clamp did not add a lint problem.

## 16. Known Issues / Risks
- Related tasks intentionally remain after manual contact deletion; this is safer than silently deleting history, but it can leave orphaned tasks until cleanup or a future task-management affordance.
- Import does not yet map extra phone columns into `alternate_phones`.
- The app still has the existing lint baseline.
- Production has no staging environment, so push only after reviewing the completed diff.

## 17. What Not To Touch in Future Sprints
Do not touch Analyst underwriting, `api/analyst.js` prompts, `src/data/financialModel.js`, `api/_financialModel.js`, Excel export/template files, TractIQ OAuth, Supabase service-role secrets, or `app_secrets` unless that sprint explicitly requires it.

## 18. Recommended Sprint 9 Focus
1. Import multi-phone columns into `alternate_phones`.
2. Add a post-import preview/verification step for phone mapping.
3. Add an orphan-task cleanup or relink affordance after contact deletion.
4. Consider making Dashboard callback pills deep-link into the exact Call Mode queue.
5. Consider a small Call Mode mobile pass now that keyboard navigation is stable.

## 19. Local Testing Completed
- Live Supabase schema verification for `alternate_phones`.
- QA seed/status/cleanup cycle.
- Browser click-through for Contact Detail additional phones.
- Browser click-through for Contact Detail delete.
- Browser click-through for Call Mode additional phones and delete.
- Browser keyboard tests for arrows, N/B, typing guard, and modal guard.
- Final browser test for reduced-queue clamp.
- Final build and lint.

## 20. Production Testing Completed
Completed with QA-prefixed production records only. All QA records were removed and verified clean.

## 21. Commit Hash
Pending at handoff-writing time.

## 22. Context for ChatGPT Review
Review the `Database.jsx` changes around keyboard guards, queue clamping, delete confirmation, and alternate phone saving. The highest-value follow-up is import mapping for multiple phone columns; the schema and live persistence layer are now ready for it.
