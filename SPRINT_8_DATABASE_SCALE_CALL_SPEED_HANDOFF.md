# Sprint 8: Database Scale + Call Mode Speed

## 1. Sprint Name
Sprint 8: Database Scale + Call Mode Speed.

## 2. Sprint Objective
Make Database and Call Mode faster and safer for high-volume owner calling: quicker queue movement, safer junk-contact deletion, and V1 support for multiple phone numbers per contact.

## 3. Summary of What Changed
- Added Call Mode Left/Right arrow navigation alongside existing N/B/X/V/C shortcuts.
- Added shortcut guards so Call Mode keys do not fire while typing in inputs/textareas/selects or while a modal is open.
- Added a confirmed contact delete flow in Contact Detail and Call Mode.
- Added an Additional Phones editor/display in Contact Detail and Call Mode.
- Added `alternate_phones` contact migration SQL.
- Removed the pre-existing Call Mode outcome index clamp that referenced the Active List queue even when working task-based queues.
- Added dialog semantics to `ModalLayout` so shortcut guards can detect open modals.

## 4. Files Created
- `sql/contact_alternate_phones_migration.sql`
- `SPRINT_8_DATABASE_SCALE_CALL_SPEED_HANDOFF.md`

## 5. Files Modified
- `src/components/Database.jsx`
- `src/hooks/useDatabase.js`
- `src/components/ui/ModalLayout.jsx`

## 6. Arrow-Key Call Mode Navigation
Right Arrow and `N` move to the next contact. Left Arrow and `B` move back. Existing outcome shortcuts remain: `X` no answer, `V` voicemail, `C` callback. Shortcuts are ignored when focus is inside a form control or any modal dialog is open. Call Mode now shows the visible hint: `← / → move through queue`.

## 7. Delete Contact Workflow
Contact Detail and Call Mode now use a confirmation modal with clear irreversible-delete copy. If the contact has open related tasks, the modal warns that those tasks will remain in Tasks and may need cleanup. Tasks are not silently deleted. Deleting from Call Mode advances to the next available queue position.

## 8. Multiple Phone Number Support
V1 uses a new `contacts.alternate_phones` JSONB column. Primary phone remains `contacts.phone` and remains the main dial button. Additional phones have label + phone fields, support Mobile/Office/Owner/Manager/Unknown labels, and render clickable `tel:` links in Contact Detail and Call Mode.

`sql/contact_alternate_phones_migration.sql` has now been run in Supabase and verified live. The previous `42703 column contacts.alternate_phones does not exist` failure is resolved.

Import multi-phone mapping is not fully redesigned in this sprint and should be considered Sprint 9 work.

## 9. Large List / Database Scale Notes
Existing contact counts remain visible in list sidebar, stats bar, and Call Mode progress. The sprint avoided virtualization or a Database rewrite. Duplicate detection now also considers additional phone numbers once the migration is active and phones are saved.

## 10. Contact Hygiene Improvements
Added safe Delete in Contact Detail and Call Mode. Existing hygiene actions remain in place: Remove Duplicates, Add/Move to Master Database, status outcomes, and Promote to Client/Pipeline.

## 11. QA Testing Completed
- `node scripts/qa-seed.mjs status` confirmed no QA records at start.
- `node scripts/qa-seed.mjs seed` created the expected QA list, 5 contacts, and 2 callback tasks.
- `node scripts/qa-seed.mjs status` confirmed the expected seeded records.
- `node scripts/qa-seed.mjs cleanup` removed all QA records.
- Final `status` confirmed 0 QA lists, 0 QA contacts, 0 QA tasks.

## 12. Existing Features Confirmed Working
- Production build passes.
- Lint remains at known baseline: 55 problems, 46 errors, 9 warnings.
- QA seed/cleanup tooling still works and leaves no QA residue.
- Dashboard callback logic and task queues were not changed except through shared data remaining compatible.

## 13. Bugs Fixed
- Removed the pre-existing Call Mode post-outcome index clamp that compared against the Active List queue even when Brandon was working another queue.

## 14. Known Issues / Risks
- The Supabase migration has now been run and verified live.
- Sprint 8.5 completed the live browser click-through for additional phones, delete confirmation, keyboard guards, and Call Mode navigation.
- Related tasks intentionally remain after contact deletion; this is safer than deleting task history automatically, but it can leave orphaned tasks for Brandon to clean manually.

## 15. What Not To Touch in Future Sprints
Do not touch Analyst underwriting, financial model files, Excel export, TractIQ auth/secrets, or service-role key logic unless a sprint explicitly requires it.

## 16. Recommended Sprint 9 Focus
1. Run and verify the alternate phones migration, then smoke-test add/edit/delete phone rows live.
2. Add import mapping for multiple phone-like columns into `alternate_phones`.
3. Consider a task cleanup affordance for orphaned contact tasks after deletion.
4. Make Dashboard callback pills clickable deep links into their exact Call Mode queues.

## 17. Local Testing Completed
- `npm run build`: passed.
- `npm run lint`: known baseline only, 55 problems.
- QA seed/status/cleanup cycle: passed and verified clean.
- Live DB column check confirmed the migration is active.
- Sprint 8.5 live browser QA covered additional phones, contact delete, Call Mode delete, keyboard guards, and reduced-queue navigation.

## 18. Production Testing Completed or Pending
Completed in Sprint 8.5 using QA seed data only. QA records were cleaned up and verified at 0 lists, 0 contacts, and 0 tasks.

## 19. Build / Lint Results
- Build: passed. Same pre-existing Vite large chunk warning.
- Lint: 55 problems (46 errors, 9 warnings), matching the Sprint 7 baseline.

## 20. Commit Hash
Pending. This handoff was written before commit.

## 21. Deployment Notes
No environment variable changes. The Supabase schema migration has been run and verified. Push only after reviewing the completed diff because the production branch deploys immediately.

## 22. Context for ChatGPT Review
Review the safety boundaries: contact deletion warns and does not delete tasks; shortcut guards depend on `ModalLayout` role="dialog"; alternate phone support is intentionally schema-backed rather than hidden in notes. The biggest open item is running the SQL migration and doing a browser click-through with QA contacts.
