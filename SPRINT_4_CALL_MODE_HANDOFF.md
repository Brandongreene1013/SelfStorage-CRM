# Sprint 4: Call Mode / Broker Calling Workspace

## 1. Sprint Name

Sprint 4: Call Mode / Broker Calling Workspace.

## 2. Sprint Objective

Build a fast one-contact-at-a-time calling cockpit inside Database so Brandon can work active self-storage owner lists with less tab switching, fewer missed follow-ups, and faster outcome logging.

## 3. Summary of What Changed

- Added a Database sidebar entry named `Call Mode` with the active list queue count.
- Added `Start Call Mode` / `Resume Call Mode` button in the active list toolbar.
- Replaced the old compact call queue experience with a large broker workspace focused on one owner at a time.
- Added contact identity, facility, status, phone, address, last call, next task, notes, outcomes, research, related tasks, call history, activity, and promote action in one screen.
- Kept outcome logging on the existing Database contact status/call history path.
- Kept task creation on the universal task engine created in Sprint 2 and consolidated in Sprint 3.

## 4. Files Created

- `SPRINT_4_CALL_MODE_HANDOFF.md`

## 5. Files Modified

- `src/components/Database.jsx`

No Analyst, underwriting, Excel, TractIQ, Supabase secrets, or financial model files were touched.

## 6. Call Mode Workflow

1. Open Database.
2. Select an active list such as Master Database or All Contacts.
3. Click `Start Call Mode` from the toolbar, or `Call Mode` from the sidebar.
4. Work one contact at a time.
5. Log an outcome, save notes, create a follow-up if needed, or move to the next contact.
6. Exit back to the normal Database list view.

The header shows current list name, queue position, percent progress, and Exit.

## 7. Task Integration

- Call Mode reads open related tasks through `taskApi.getRelatedTasks('contact', current.id)`.
- The primary next action is computed with `getNextOpenTask`.
- Related tasks render through the existing `RelatedTasks` primitive, so completion and task creation use the universal task system.
- `Call Back` creates a dated contact task with `taskType: 'call'`, `relatedType: 'contact'`, `source: 'database'`.
- Conversation, Left VM, and Appt Set can create optional follow-up tasks before moving on.

## 8. Call Outcome Handling

Outcome buttons shown:

- No Answer
- Left VM
- Conversation
- Appt Set
- Not Interested
- Call Back

All outcomes call the existing `updateContactStatus` flow through `handleCallOutcome`. `Call Back` requires a callback date before logging and creates the universal task. Conversation-style outcomes pause to offer a follow-up task rather than immediately losing context.

## 9. Notes Handling

- Call Mode has a large call notes textarea.
- `Save Note` writes through the existing `updateContactNotes` handler.
- Moving next/previous auto-saves unsaved note changes first.
- The note draft is scoped to the active contact so typed notes do not bleed between contacts.
- A small Saved/Unsaved indicator shows note state.

## 10. Promote-to-Client Handling

The workspace exposes `Promote to Client / Pipeline` using the existing `onContactToClients` mapping from `App.jsx`. No duplicate promotion system was added.

## 11. UX Improvements

- Larger phone-first calling layout.
- Clickable `tel:` phone number.
- Clickable address link to Google Maps.
- Research strip for Google Search, Google Maps, LinkedIn, and Whitepages.
- Related task panel and call history visible beside the current contact.
- Keyboard shortcuts added when not typing in fields:
  - `N` next
  - `B` back
  - `X` no answer
  - `V` voicemail
  - `C` callback

## 12. Existing Features Confirmed Working

Local browser smoke confirmed:

- Dashboard renders.
- Database renders.
- List selection works.
- `Start Call Mode` appears for an active list.
- Call Mode opens with live contact data.
- Phone link, notes area, outcome buttons, research links, tasks, call history, and promote button render.
- Browser console showed no errors during the smoke.

Build confirmed the app still compiles.

## 13. Bugs Fixed

- `Call Back` handling now accepts a note override from Call Mode so the logged call and callback task use the current workspace note draft.
- Keyboard shortcuts were adjusted to satisfy the React Compiler hook rules.
- Notes were changed from effect-reset state to contact-scoped draft state to avoid React Compiler `set-state-in-effect` lint regression.

## 14. Known Issues / Risks

- The repo lint baseline still fails from existing unrelated errors across API files, React compiler hook rules, and unused variables. Sprint 4 returned to the known baseline count and did not add a new lint category.
- The old compact queue component remains in `Database.jsx` as unused legacy code. It is not rendered, and build/lint baseline is not worsened by it, but it should be deleted in a cleanup pass.
- I did not use a real owner record for destructive outcome QA during local smoke. Production outcome QA should use a temporary QA contact/list and clean it up after verification.

## 15. What Not To Touch in Future Sprints

Do not touch these unless the sprint explicitly requires it:

- `api/analyst.js`
- `api/_financialModel.js`
- `src/data/financialModel.js`
- `src/lib/excelModel.js`
- `public/model-template.xlsm`
- TractIQ OAuth/auth/secrets flow
- Supabase service role key logic

## 16. Recommended Sprint 5 Focus

Sprint 5 should focus on controlled production QA and cleanup:

- Remove the unused legacy call queue component.
- Add a safe QA seed/delete script for temporary contacts and callback tasks.
- Consider task edit support from `TaskModal` so existing tasks can be edited from Call Mode.
- Add due-call follow-up queue entry if Brandon wants a separate mode for overdue call tasks.
- Consider a lightweight meeting creation path from Appt Set if Calendar supports it cleanly.

## 17. Local Testing Completed

Commands:

- `npm run build` passed.
- `npm run lint` failed at known baseline only.

Browser local smoke at `http://127.0.0.1:5173/`:

- App loaded with no console errors.
- Database nav opened.
- All Contacts list selected.
- `Start Call Mode` appeared.
- Call Mode opened on contact 1 of 456.
- Verified contact identity, facility, phone, address, notes, all outcome buttons, callback date, research links, related tasks, call history, activity, promote button, and keyboard shortcut hint.

## 18. Production Testing Completed or Pending

Pending until the Sprint 4 commit is pushed and Vercel deploys.

Production smoke plan:

1. Open `https://self-storage-crm.vercel.app/`.
2. Confirm Dashboard, Database, Call Mode, Clients, Pipeline, Analyst, and Calendar render.
3. Use a temporary QA contact/list for callback task creation.
4. Confirm callback task appears in the task surfaces.
5. Delete temporary QA records.

## 19. Build / Lint Results

- Build: passed with the existing Vite large chunk warning.
- Lint: failed with `57 problems (48 errors, 9 warnings)`, matching the known baseline after Sprint 4 fixes.

Known lint categories include unrelated `process` globals in API files, pre-existing React Compiler hook findings, and pre-existing unused variables.

## 20. Commit Hash

Implementation commit:

- `2c80b4d` - `Sprint 4: Build broker call mode workspace`

## 21. Deployment Notes

Push to `claude/storage-investment-crm-vV018` to trigger Vercel production deployment. Mirror to `main` after production branch is updated.

## 22. Context for ChatGPT Review

Sprint 4 intentionally builds on Sprint 2/3 primitives rather than creating a second task or call logging system. The important review points are:

- Outcome logging should continue using Database contact status/call history.
- Callback and follow-up work should continue using universal tasks.
- Notes should save through existing contact notes.
- Promotion should continue using the existing contact-to-client mapping.
- The Analyst, underwriting model, Excel export, TractIQ auth, and serverless API files were intentionally left alone.
