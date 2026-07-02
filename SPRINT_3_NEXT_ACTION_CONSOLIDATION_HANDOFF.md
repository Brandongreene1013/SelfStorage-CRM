# Sprint 3 - Next-Action Consolidation + Live Task QA

## 1. Sprint Name
Sprint 3: Next-Action Consolidation + Live Task QA

## 2. Sprint Objective
Make universal tasks the primary source of truth for "What does Brandon need to do next?" while preserving legacy `nextActionType` / `nextActionDate` / `nextActionNote` fields as fallback display data. This sprint also live-tested the Sprint 2 task engine against the real Supabase project and fixed a Database contact-card interaction issue found during QA.

## 3. Summary of What Changed
- `ClientCard` now reads the earliest open universal task for that client and displays it in the primary "Next Action" slot.
- `ClientCard`'s "+ Set Next Action" / existing legacy-next-action button now opens `TaskModal` and creates a universal task instead of writing legacy next-action fields.
- `PipelineBoard` now shows the earliest open universal task inline on each kanban card, plus a compact clickable task-count chip.
- Pipeline "+ Set Action" now creates a universal task through `TaskModal`; the old top-level `ActionModal` route was removed from `App.jsx`.
- Database contact cards now show universal tasks as their primary next action and use `TaskModal` for new next actions.
- Database contact cards now have a dedicated `Drag` handle. During QA, clicking a drag-enabled card did not reliably open contact detail; moving drag activation to a handle and making the owner name an explicit details button fixed the usable click target.
- Database Call Queue now requires a callback date before logging "Call Back" and creates a dated universal contact task for that callback.
- Contact detail "Call Back" prompts carry the selected callback date into the task modal.
- Shared task helpers were added for "next open task" selection, due-date tone/label logic, and legacy-action-to-task defaults.

## 4. Files Created
- `src/components/tasks/taskUtils.js` - shared task display/default helpers.
- `SPRINT_3_NEXT_ACTION_CONSOLIDATION_HANDOFF.md` - this handoff.

## 5. Files Modified
- `src/App.jsx` - removed the old Pipeline top-level `ActionModal` state/path for new next actions.
- `src/components/ClientCard.jsx` - universal task is now primary Next Action; legacy fields are fallback only; RelatedTasks hides the already-featured primary task.
- `src/components/PipelineBoard.jsx` - universal task line and clickable task chip added to kanban cards; Set Action opens `TaskModal`.
- `src/components/Database.jsx` - contact card task display/creation, contact-card drag-handle fix, Call Queue callback task creation, callback-date handoff into `TaskModal`.
- `src/components/tasks/TaskModal.jsx` - optional `heading` and `saveLabel` props for broker-friendly "Set Next Action" copy.
- `src/components/tasks/RelatedTasks.jsx` - optional `excludeTaskIds` prop to avoid duplicating the primary Next Action in the secondary task list.
- `src/components/tasks/NextActionIndicator.jsx` - clickable task-count chip support and shared next-task due-date logic.
- `src/components/tasks/index.js` - exports the shared task helpers.

## 6. What Was Verified Live
Local app (`http://127.0.0.1:5173`) was run against the real Supabase project.

Verified in browser:
- Dashboard rendered real data, task groups loaded with no migration warning.
- General task was created from the Dashboard quick-add, persisted after refresh, then completed.
- Client task appeared on Dashboard and on the related client card.
- Database Master Database list rendered real contacts.
- Contact detail modal opened after the contact-card click/drag fix.
- Pipeline rendered and showed a temporary universal task inline on Robert Tillander's card, including the compact task awareness chip.
- Analyst rendered.
- Calendar rendered with Outlook-synced upcoming meetings.

Verified directly against Supabase with the app's publishable key:
- Created one general task, one client-related task, and one contact-related task.
- Selected them back from `tasks`.
- Completed one task.
- Deleted all direct QA rows.
- Cleaned up browser-created `Sprint 3 QA%` rows after testing.

## 7. How Legacy Next Action Was Handled
Legacy fields were not bulk-migrated and were not removed.

New behavior:
- Client and Pipeline new "Next Action" flows create universal tasks.
- Database contact-card new "Set Action" creates a universal contact task.
- Call Queue "Call Back" creates a dated universal contact task.

Fallback behavior:
- If an entity has no open universal task but still has legacy `nextActionType` data, the card still displays that legacy action.
- Clicking that legacy fallback opens `TaskModal` prefilled from the legacy action so the next save creates a universal task.
- `ActionModal.jsx` and `ActionLog.jsx` still exist. Activity logging remains separate and unchanged.

## 8. Task UX Improvements
- The highest-priority next action is now the earliest open universal task, not a separate single-slot field.
- Client cards avoid showing the same task twice by excluding the primary task from the secondary RelatedTasks list.
- Pipeline cards stay compact: one small chip plus one short task line.
- Database cards have a reliable explicit owner-name click target for detail and a small drag handle for moving contacts.
- Callbacks from the Call Queue cannot be logged without a callback date, preventing undated follow-ups.

## 9. Existing Features Confirmed Working
- Dashboard renders KPI, progress, task, meeting, recent activity, and relationship sections.
- Clients render with task-aware Next Action cards.
- Database Master Database renders contacts and opens contact detail.
- Pipeline drag board renders and shows task awareness.
- Analyst renders unchanged.
- Calendar renders unchanged with Outlook event data.
- Supabase task persistence works for general, client, and contact tasks.
- Activity logging components were left intact.

## 10. Bugs Fixed
- Database contact cards did not reliably open contact detail while the whole card was also the drag activator. A dedicated `Drag` handle plus explicit owner-name details button fixes the practical click target without removing drag-and-drop.

## 11. Known Issues / Risks
- `npm run lint` still fails on the repo's pre-existing lint baseline. This sprint ends at 57 problems (48 errors, 9 warnings), one fewer than the documented Sprint 2 baseline of 58.
- Browser automation was intermittently slow/stale inside the contact modal, so the contact task persistence path was additionally verified directly against Supabase.
- Legacy next-action fields still exist as fallback data. They are no longer the preferred write path for client/pipeline/contact-card next actions, but old rows can still display until replaced by a universal task.
- `TaskModal` still creates tasks rather than editing an existing task. Clicking an existing task context opens a create-task modal, not an edit-task modal.
- The app still has the pre-existing large bundle-size warning from Vite.

## 12. What Not To Touch in Future Sprints
- Do not touch `api/analyst.js`, `api/_financialModel.js`, `src/data/financialModel.js`, `src/lib/excelModel.js`, or `public/model-template.xlsm` for task work.
- Do not remove legacy `nextAction*` columns until a deliberate data migration/retirement sprint is planned.
- Do not merge activity logging (`ActionLog`) into tasks casually; a completed action is not the same thing as an open next action.
- Do not change the `tasks` table schema without updating `useTasks.js` and the SQL migration documentation together.

## 13. Recommended Sprint 4 Focus
1. Add lightweight edit/reopen support to `TaskModal` / `TaskRow` so clicking an existing task edits that task instead of opening a new-task form.
2. Decide whether to backfill legacy `nextAction*` fields into universal tasks with a safe one-time script.
3. Build Call Mode on top of the now-working dated callback task flow.
4. Consider a focused lint-baseline cleanup sprint once feature pressure slows down.

## 14. Build / Lint Results
- `npm run build` passes. Latest output: `dist/assets/index-OZvn4zb2.js` 1,159.66 kB (340.83 kB gzip), CSS 62.04 kB (10.35 kB gzip). Vite still warns that the main chunk is over 500 kB.
- `npm run lint` reports 57 problems (48 errors, 9 warnings). These are the existing project baseline categories: API `process` globals, React Compiler hook warnings, unused variables in untouched components/hooks, and existing empty blocks. No new lint category was introduced by Sprint 3.

## 15. Commit Hash
`b50197f` - `Sprint 3: Consolidate next actions with universal tasks`.

## 16. Deployment Notes
- No Supabase schema changes.
- No environment variable changes.
- No new npm dependencies.
- Push to `claude/storage-investment-crm-vV018` deploys directly to production on Vercel.
- Production smoke test should cover Dashboard, Database contact modal, task creation/completion, Clients, Pipeline, Analyst, and Calendar after Vercel finishes deploying.

## 17. Context for ChatGPT Review
Review this as a workflow consolidation, not a new task-management product. The key question is whether Brandon now sees one practical "Next Action" system across Dashboard, Clients, Database, and Pipeline while call logging and old activity history remain intact. The most important code paths are `ClientCard` primary task display, `PipelineBoard` compact task display, and Database's callback-to-task flow.
