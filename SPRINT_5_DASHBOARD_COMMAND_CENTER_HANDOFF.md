# Sprint 5: Broker Dashboard Command Center

## 1. Sprint Name

Sprint 5: Broker Dashboard 2.0 / Daily Command Center.

## 2. Sprint Objective

Redesign the Dashboard so it answers one question the moment Brandon opens the app: "What should I attack today to source, follow up, set meetings, and win listings?" Built entirely on Sprint 2–4 primitives (universal tasks, Database contacts, Call Mode, clients/pipeline, meetings) — no new data model, no second task system, no second Call Mode.

## 3. Summary of What Changed

- Dashboard now opens with a "Today" command header: date, calls/conversations/appts logged today, BOVs due, tasks due today, overdue tasks, meetings today, and one primary "Start Calling" button.
- Added **Today's Attack List** — a ranked, actionable list of every open task tied to a contact or client that is overdue or due today, plus a safety-net check for Database contacts marked "Call Back" with a due date but no matching task (covers pre-Sprint-4 data). Each row shows name, facility, reason, a `tel:` quick-dial link where available, and a one-click action that opens the exact contact (Database's real contact detail workspace, with call notes/outcomes/history) or the exact client (edit modal).
- Added **Pipeline Attention** — active-stage (2–9) clients with an overdue task, a task due today, no next action at all, or an upcoming meeting, ranked in that order, one click to jump straight into editing that client.
- Added **Needs Follow-Up (V1)** — contacts logged as Conversation/Appointment with no open task, and active-stage clients with no next action and no legacy next-action field. Deliberately simple pattern-matching, not exhaustive.
- Added a direct Dashboard → Call Mode launch path ("Start Calling" in the header, "Open Call Mode →" in the Attack List) that opens the **existing** Database Call Mode over All Contacts — no second Call Mode was built.
- Renamed "Today's Progress" to "Daily Production" and added two new counters: Tasks Completed today and Callback Tasks Created today (both derived from the existing tasks table, no schema change).
- Removed the "Active Relationships" widget (a passive list with no action attached) in favor of the new actionable Pipeline Attention section.
- Deleted `LegacyCallQueue`, the unused compact call-queue component flagged as dead code in the Sprint 4 handoff, from `Database.jsx`.

## 4. Files Created

- `SPRINT_5_DASHBOARD_COMMAND_CENTER_HANDOFF.md` — this handoff.

## 5. Files Modified

- `src/components/Dashboard.jsx` — full command-center rebuild (header, Attack List, Pipeline Attention, Needs Follow-Up, renamed/extended Daily Production, removed Active Relationships).
- `src/components/Database.jsx` — accepts an `entryRequest` / `onEntryConsumed` prop pair so the Dashboard can deep-link into Call Mode or a specific contact; deleted the unused `LegacyCallQueue` component (~130 lines).
- `src/App.jsx` — added `dbEntryRequest` state and two handlers (`handleStartCallMode`, `handleOpenContact`) that drive the deep link into Database; wired `onStartCallMode` / `onOpenContact` / `onEditClient` into Dashboard.

No Analyst, underwriting, Excel, TractIQ, or Supabase secrets files were touched.

## 6. Dashboard Command Center Workflow

1. Brandon opens Dashboard.
2. The header immediately shows today's date, today's call/conversation/appointment counts, BOVs/tasks due, overdue count, and meetings today.
3. He clicks **Start Calling** to jump straight into Call Mode over All Contacts, or clicks a specific name in the Attack List to jump straight into that one contact/client instead.
4. Pipeline Attention and Needs Follow-Up sit beside the Attack List so he can also push a stalling deal or patch a follow-up gap without leaving the Dashboard.
5. Daily Production, Productivity Analytics, and the pipeline funnel remain below for the rest of the day's admin/reporting needs.

## 7. Attack List Logic

Source: the universal tasks table via `taskApi.groups.overdue` and `taskApi.groups.dueToday`, filtered to `relatedType` of `contact` or `client` (general tasks stay in the existing Tasks panel, since they aren't "someone to contact").

- Each task row resolves its related contact (from Database's `contacts`) or client (from `clients`) to get name/facility/phone.
- A safety-net pass adds Database contacts with `status === 'callback'` and a due/overdue `callbackDate` that don't already have a covering task — this catches any contact whose callback predates Sprint 4's automatic task creation, or any manual edge case.
- Rows are sorted overdue-first, then by due date.
- Quick actions: `tel:` link for an immediate dial: a contact row's "Call" button opens that exact contact via the same `ContactDetailModal` used inside Database (full call notes, outcome buttons, call history); a client row's "Push" button opens the existing `ClientModal` edit flow.

## 8. Call Mode Integration

- The Dashboard does not contain a second Call Mode. "Start Calling" (header) and "Open Call Mode →" (Attack List) both call `onStartCallMode`, which sets a one-shot `dbEntryRequest = { listId: 'all', subView: 'callQueue' }` in `App.jsx` and switches the view to Database. Database's existing Call Mode component picks up `activeListId = 'all'` and `subView = 'callQueue'` and opens exactly as if Brandon had clicked "Start Call Mode" there himself.
- Per-contact Attack List / Needs Follow-Up rows use a second one-shot request, `dbEntryRequest = { openContactId }`, which Database resolves against its live `contacts` array and opens directly in `ContactDetailModal` — this is a faster path than the multi-contact queue when only one specific overdue contact matters.
- **Not built this sprint:** a queue mode filtered specifically to "only overdue call tasks" or "only today's call tasks" as a multi-contact Call Mode session. This was in-scope as an option but flagged in the brief as skippable if complex — building it would mean teaching Call Mode's queue (`callQueue` in `Database.jsx`, currently built from contact `status`) to instead walk a task-derived list, which touches Call Mode's core iteration logic and was judged higher-risk than the time available justified. The Attack List's per-contact "Call" action covers the same practical need (call the specific people who are overdue/due today) without that risk. See Sprint 6 recommendation below if a true filtered multi-contact queue is still wanted.

## 9. Task Integration

- Attack List, Pipeline Attention, and Needs Follow-Up all read through the same `taskApi` used everywhere else (`getRelatedTasks`, `groups`) — no parallel task query logic.
- The existing Tasks panel (quick add, complete, delete, full modal) is unchanged and still the place to manage general (non-contact/client) tasks and to complete any task.
- Task editing (clicking an existing task to change its due date/type rather than only completing or deleting it) is still not supported anywhere in the app, `TaskModal` only creates. This was flagged as optional in the brief ("if simple, allow editing; if not, document") — it isn't simple (it means auditing every `TaskModal` call site for create-vs-edit semantics) and is deferred to Sprint 6, same as Sprint 3 and Sprint 4 both flagged it.

## 10. Pipeline Attention Logic

For every client in an active stage (2–9): compute the earliest open task via the existing `getNextOpenTask` helper. Flag as "Overdue task" if that task's due date is past, "Task due today" if due today, "No next action" if there's no open task and no legacy `nextActionType` either. Separately, flag any client with a meeting on or after today. Rows are ranked overdue → due today → no next action → meeting-only, capped at 8 for density. Clicking a row opens the existing client edit modal (`handleEdit`/`ClientModal`) — no new client detail view was built.

## 11. Meetings / Calendar Integration

The existing "Upcoming Meetings" widget is unchanged in logic, just retitled "Meetings" for consistency with the rest of the command center's naming. Pipeline Attention also surfaces a client's next meeting inline when relevant so a meeting doesn't need a separate lookup. Calendar itself was not touched.

## 12. UX Improvements

- One-click "Start Calling" from the very top of the Dashboard — previously calling required Database → select a list → Start Call Mode (3 clicks minimum).
- One-click "Call" on any Attack List row jumps straight into that specific contact's real call workspace instead of forcing a manual search inside Database.
- Command header surfaces overdue/due-today/meetings-today counts without opening Tasks or Calendar.
- Daily Production now also shows tasks completed today and callback tasks created today, both free (already in the tasks table), giving a fuller close-of-day picture than call/conversation/appointment/BOV counters alone.
- Removed a passive, non-actionable widget (Active Relationships) to make room for sections that drive a click.

## 13. Existing Features Confirmed Working

Verified live against the local dev server (real Supabase data — 465 Database contacts, 68 Master Database contacts, 10 clients):

- Dashboard renders the command header, Attack List, Pipeline Attention, Needs Follow-Up, KPI strip, pipeline continuum, Daily Production, Productivity Analytics, funnel, Tasks panel, Meetings, Needs Review, and Recent Activity.
- "Start Calling" opens Database with All Contacts selected and Call Mode active (456 in queue) — confirmed via live click.
- Attack List "Call" quick action opened the exact flagged contact (a real Conversation-status contact, "Larry Crees") directly in the full contact detail workspace with call notes, outcome buttons, callback date, research links, and call history intact.
- Pipeline Board still renders with drag-and-drop stages, task chips, and Set Action / Log buttons.
- Database Master Database / All Contacts / list views, import, and Markets view are unaffected.
- Clients, Analyst, and Calendar views were not modified and were spot-checked to still render.
- No new console errors observed during any of the above.

## 14. Bugs Fixed

None — this sprint was additive plus the planned Sprint 4 cleanup item (dead code removal). No regressions found during manual QA.

## 15. Known Issues / Risks

- The repo lint baseline still fails on pre-existing categories (API `process` globals, React Compiler hook findings, unused variables). This sprint's new `entryRequest` consumption effect in `Database.jsx` triggers one more instance of the same `react-hooks/set-state-in-effect` finding that already exists elsewhere in that same file (`EditableField`'s `useEffect(() => { setDraft(value ?? ''); }, [value])`, pre-existing) — same category, not a new one.
- Needs Follow-Up and Pipeline Attention can both surface the same client for different reasons (e.g., an active-stage client with no next action shows in both). This is intentional overlap, not a bug — each section answers a different question — but it does mean the same name can appear twice on the Dashboard.
- Filtered multi-contact Call Mode queues ("call only overdue," "call only today's") were not built — see section 8 and Sprint 6 recommendation.
- Task editing (vs. create-only) was not built — see section 9.
- Attack List and Needs Follow-Up are capped (no pagination) for information density; a very large backlog only shows the top slice. Given Database already provides full filtering, this was judged an acceptable tradeoff over building pagination for a summary widget.

## 16. What Not To Touch in Future Sprints

Do not touch these unless the sprint explicitly requires it:

- `api/analyst.js`
- `api/_financialModel.js`
- `src/data/financialModel.js`
- `src/lib/excelModel.js`
- `public/model-template.xlsm`
- TractIQ OAuth/auth/secrets flow
- Supabase service role key logic

## 17. Recommended Sprint 6 Focus

1. Task edit support (`TaskModal` → real edit mode, not just create) — the single most requested-but-deferred item across three sprints now.
2. If still wanted, a true filtered multi-contact Call Mode queue ("call only overdue," "call only today's") — requires teaching Call Mode's queue builder in `Database.jsx` to walk task-derived contact IDs instead of contact `status`, and deciding how outcome-logging should interact with the originating task (auto-complete it on outcome?).
3. Dedupe pass so a client appearing in both Pipeline Attention and Needs Follow-Up for overlapping reasons only surfaces once, if the duplication proves annoying in daily use rather than useful.
4. A QA seed/delete script for temporary contacts and callback tasks, still outstanding from Sprint 4.

## 18. Local Testing Completed

Commands:

- `npm run build` passed.
- `npm run lint` — 55 problems (46 errors, 9 warnings), down from the Sprint 4 baseline of 57 (48 errors, 9 warnings). No new lint category introduced.

Browser local smoke (real Supabase data) at the local dev server:

1. Dashboard opened — command header, Attack List, Pipeline Attention, Needs Follow-Up all rendered with live data.
2. Attack List correctly showed the "caught up" empty state (no tasks were overdue/due today at test time) and still surfaced Pipeline Attention / Needs Follow-Up rows from real client/contact data.
3. Clicked **Start Calling** → landed in Database, All Contacts selected, Call Mode open, 456-contact queue live.
4. Clicked a Needs Follow-Up contact row ("Larry Crees") → landed directly in that contact's detail workspace with real call notes, outcome buttons, and address intact.
5. Confirmed Pipeline Board, Database list views, and nav between all six tabs still work.

## 19. Production Testing Completed or Pending

Pending. Push to `claude/storage-investment-crm-vV018` to deploy, then smoke test on `https://self-storage-crm.vercel.app/`:

- Dashboard command header renders with live counts.
- Attack List, Pipeline Attention, Needs Follow-Up render (or show their empty states).
- "Start Calling" opens Database Call Mode.
- An Attack List / Needs Follow-Up contact row opens that exact contact.
- Pipeline Attention "Push" opens the client edit modal.
- Database, Clients, Pipeline, Analyst, and Calendar all still render.

## 20. Build / Lint Results

- Build: passed. `dist/assets/index-*.js` ~1,176.7 kB (344.8 kB gzip), CSS ~65.6 kB (10.8 kB gzip). Same pre-existing Vite large-chunk warning as prior sprints.
- Lint: 55 problems (46 errors, 9 warnings) — 2 fewer than the Sprint 4 baseline of 57 (48 errors, 9 warnings). The reduction comes from deleting the unused `LegacyCallQueue` component and an unused `onAddToPipeline` prop that Dashboard never called. No new lint category was introduced.

## 21. Commit Hash

Implementation commit: see the commit created immediately after this handoff was written (`git log` on `claude/storage-investment-crm-vV018`).

## 22. Deployment Notes

- No Supabase schema changes.
- No environment variable changes.
- No new npm dependencies.
- Push to `claude/storage-investment-crm-vV018` deploys directly to production on Vercel. Mirror to `main` after production branch is updated, per repo convention.

## 23. Context for ChatGPT Review

This sprint is a Dashboard consolidation, not a new feature surface. The core question to review: does the Dashboard now tell Brandon exactly who to call and what deal needs a push, using only data and components that already existed (universal tasks, Database contacts, Call Mode, clients, meetings)? The most important code paths are `buildAttackList` / `buildPipelineAttention` / `buildNeedsFollowUp` in `Dashboard.jsx` (pure functions over existing task/contact/client data, no new schema), and the `entryRequest` deep-link handshake between `App.jsx` and `Database.jsx` (a one-shot object that Database consumes once and the parent clears, letting the Dashboard open Call Mode or a specific contact without a second Call Mode implementation). Two things were deliberately left undone and documented rather than rushed: filtered multi-contact Call Mode queues, and task editing — both called out as skippable-if-complex in the brief, and both already flagged as recurring "next sprint" items across Sprints 3, 4, and now 5.
