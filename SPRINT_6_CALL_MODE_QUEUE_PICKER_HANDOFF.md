# Sprint 6: Call Mode V2 — Queue Picker + Follow-Up Calling

## 1. Sprint Name

Sprint 6: Call Mode V2 — Queue Picker + Follow-Up Calling.

## 2. Sprint Objective

Make Call Mode answer, every time it opens: what queue am I working, why is each person on it, how many are left, and what happens after I log this call? Do this by adding a queue picker in front of Call Mode and teaching Call Mode to build its queue from universal tasks (not just contact status), without building a second Call Mode or rewriting Database.

## 3. Summary of What Changed

- Call Mode no longer opens directly into a contact list. It now opens a **queue picker** first, showing five queues as cards with live counts and a one-line reason: Active List, Today's Callbacks, Overdue Callbacks, Follow-Up Needed, All Contacts.
- **Today's Callbacks** and **Overdue Callbacks** are new — built directly from the universal tasks table (`taskType: 'call'`, `relatedType: 'contact'`, `status: 'open'`), not from contact status. Overdue = due date before today; Today = due date equals today. Contacts are deduplicated (earliest-due task wins if more than one exists) and sorted earliest-due-first.
- **Follow-Up Needed** reuses the same "conversation/appointment logged with no open task" logic the Dashboard's Needs Follow-Up section already uses, applied to contacts only (Call Mode doesn't call clients).
- Call Mode's header now reads like `"Today's Callbacks — 3 of 18"` with a one-line reason (`"Owners with an open call task due today."`) underneath, plus a **Change Queue** button next to Exit so Brandon can back out to the picker mid-session without losing his place in other queues.
- Each contact pulled from a task-based queue now shows **"Why they're up: <reason>"** directly under their name (e.g. "Callback task overdue — was due 2026-06-28"), so there's never a moment of "why am I calling this person."
- **Outcome → task completion**: when a contact came from a task-based queue and Brandon logs an outcome, a checkbox appears — "Complete existing callback task (<task title>)" — pre-checked for Conversation, Appt Set, Not Interested, and Call Back, unchecked for No Answer and Left VM. Checking it (default-on for those four outcomes) marks that exact originating task complete via the existing `taskApi.completeTask`. This merges cleanly with the existing "offer a follow-up task" prompt (Sprint 4) into one post-outcome panel — no double-prompting.
- **Task editing** (deferred since Sprint 3): task rows in `RelatedTasks` (used in Call Mode's sidebar, `ClientCard`, and contact detail) and the Dashboard's Tasks panel are now clickable — clicking a task's title/body (not the checkbox or delete button) opens `TaskModal` pre-filled in edit mode, saving through `taskApi.updateTask` instead of creating a new task. Title, description, priority, due date, and task type are all editable. `useTasks.updateTask` was extended to persist `taskType` (it previously silently dropped that field).
- Dashboard's **Start Calling** button now opens the queue picker instead of jumping straight into an "All Contacts" session — Brandon picks the queue every time, same as from Database.
- Database's per-list toolbar button ("Start Call Mode" / "Resume Call Mode") still jumps directly into that list's queue with one click — this one entry point was deliberately kept as a direct shortcut rather than routed through the picker (see section 6 for why).

## 4. Files Created

- `SPRINT_6_CALL_MODE_QUEUE_PICKER_HANDOFF.md` — this handoff.

## 5. Files Modified

- `src/components/Database.jsx` — added `buildCallbackTaskQueue` / `buildFollowUpQueue` (task-based queue builders), `CallModeQueuePicker` component, `callQueueSource` state + `QUEUE_DEFS`, moved Call Mode rendering out from under the "a list must be selected" gate (so Dashboard-launched queues work with no list selected), rewired the sidebar nav item and per-list toolbar button, and reworked `CallQueue`'s header/empty-state/outcome-handling for queue labels, reasons, and task completion.
- `src/App.jsx` — `handleStartCallMode` now requests `{ subView: 'callQueue' }` only (no `listId`), so Dashboard opens the picker instead of All Contacts directly.
- `src/hooks/useTasks.js` — `updateTask` now maps `fields.taskType` to `task_type` in the Supabase write (previously ignored, which would have silently discarded task-type edits).
- `src/components/tasks/TaskRow.jsx` — accepts an optional `onEdit` prop; the row's content area becomes clickable (cursor pointer) when provided.
- `src/components/tasks/RelatedTasks.jsx` — wires `onEdit` into an "edit task" `TaskModal` instance backed by `taskApi.updateTask`.
- `src/components/Dashboard.jsx` — `DashboardTasks` gets the same edit-task wiring as `RelatedTasks`.

No Analyst, underwriting, Excel, TractIQ, or Supabase secrets files were touched.

## 6. Call Mode Queue Picker Workflow

1. Brandon clicks **Start Calling** on the Dashboard, or the **Call Mode** item in Database's sidebar.
2. The queue picker opens: five cards, each showing a live count and a one-line reason. A helper line at the top states plainly what Call Mode does ("Call Mode lets you work one owner at a time. Log the result, set the next action, then move to the next owner.").
3. Brandon clicks a card. Call Mode opens on contact 1 of that queue, header reading `"<Queue Name> — 1 of N"` with the reason line underneath.
4. He can click **Change Queue** at any time to go back to the picker without losing progress in other queues (each queue keeps its own position implicitly — picking a queue always starts it fresh at position 1, which is the simplest predictable behavior; see Known Issues for the one exception).
5. **Exit** always returns to the picker state cleared, so the next time Call Mode opens it starts at the picker, not wherever he left off.

One deliberate exception: the per-list **"Start Call Mode" / "Resume Call Mode"** button inside a selected Database list still jumps directly into that list's queue, skipping the picker, and correctly labels itself "Resume" only when he's mid-way through that specific queue. Brandon already made an explicit choice by selecting that list and clicking a button named for it — routing that through an extra picker step would have added a click without reducing ambiguity. The picker exists for the two genuinely ambiguous entry points: Dashboard's "Start Calling" (no list context) and Database's sidebar "Call Mode" nav item (also no list context).

## 7. Queue Types Added

| Queue | Source | Reason shown |
|---|---|---|
| Active List | `filtered` contacts (existing Sprint 4 logic) with status in fresh/callback/no_answer/voicemail | "Fresh, callback, no-answer, and voicemail contacts in the list currently selected on the left." |
| Today's Callbacks | Open `call` tasks on contacts, due date = today | "Owners with an open call task due today." |
| Overdue Callbacks | Open `call` tasks on contacts, due date < today | "Owners with an open call task past its due date." |
| Follow-Up Needed | Contacts with status Conversation/Appointment and zero open tasks | "Conversations or appointments logged with no follow-up task." |
| All Contacts | Same status filter as Active List, applied across every list | "Fresh, callback, no-answer, and voicemail contacts across every list." |

The **Active List** card is disabled (with "Select a list on the left first.") when no list is selected in the sidebar — this is the only queue that depends on sidebar state, and it fails safely rather than showing an empty/confusing queue.

**Resume Last Session (item F in the brief)** was not built. It would require persisting which queue + position Brandon was in across a full page reload or view switch, which touches state lifetime decisions (localStorage? per-session only?) that felt like a separate small feature rather than a one-line addition. Documented here as explicitly skipped, per the brief's own "if not simple, document as future work" escape hatch.

## 8. Task-Based Queue Logic

`buildCallbackTaskQueue(contacts, taskApi, { overdue })` in `Database.jsx`:
- Filters `taskApi.tasks` to `status: 'open'`, `relatedType: 'contact'`, `taskType: 'call'`, with a `dueDate` either equal to today (`overdue: false`) or strictly before today (`overdue: true`).
- Deduplicates by `relatedId` — if a contact somehow has two open call tasks in the same window, only the earliest-due one is kept (matches the "deduplicate contacts" requirement).
- Attaches `queueReason`, `queueTaskId`, `queueTaskTitle`, `queueDueDate` to a shallow copy of the contact object, then sorts ascending by due date (oldest/most-overdue first).

`buildFollowUpQueue(contacts, taskApi)`:
- Contacts with `status` of `conversation` or `appointment` where `taskApi.getRelatedTasks('contact', id)` returns zero open tasks.
- Attaches `queueReason` only (no task to complete afterward, since there isn't one).

Both are computed with `useMemo` over the full `contacts` array (not the sidebar-scoped `filtered` array) — "who owes a callback today" is a cross-list question, so these queues intentionally ignore whichever list happens to be selected in the sidebar.

## 9. Outcome / Task Completion Logic

`CallQueue`'s `handleOutcome` now branches on whether the outcome should pause for a post-outcome panel:
- Pauses if the outcome is Left VM / Conversation / Appt Set (existing Sprint 4 follow-up-task offer), **or** if the current contact has a `queueTaskId` (came from a task-based queue).
- The panel shows the follow-up-task offer (only for the three statuses above, unchanged from Sprint 4) and, separately, the "Complete existing callback task" checkbox (only when `queueTaskId` exists), pre-checked for Conversation / Appt Set / Not Interested / Call Back and unchecked for No Answer / Left VM — matching the brief exactly.
- Clicking through (**Add Task + Next** / **Skip Task** / **Continue**) calls `finalizePostOutcome`, which completes the originating task via `taskApi.completeTask(current.queueTaskId)` if the checkbox is checked, optionally creates the follow-up task, then advances to the next contact.
- Call Back still requires a callback date before it can be logged (unchanged) and still creates a new dated task through the existing Database flow (unchanged) — this sprint didn't touch that path, only added the option to also close out the task that brought the contact into the queue in the first place.
- Verified live: completing "Not Interested" on a contact pulled from Today's Callbacks, with the checkbox checked, completed the originating task and the contact dropped out of that queue immediately (queue count 1 → 0).

## 10. Dashboard Integration

`onStartCallMode` (passed from `App.jsx`) now sends `{ subView: 'callQueue' }` with no `listId`. Database's entry-request effect clears `callQueueSource` whenever this fires, so the picker always shows rather than a stale or ambiguous queue. Attack List and Needs Follow-Up "Call" quick actions (Sprint 5) are untouched — they still deep-link straight into a specific contact's detail modal via `openContactId`, bypassing Call Mode and the picker entirely, exactly as before.

## 11. Database Integration

- Call Mode's rendering was moved out from under the `activeListId !== null` gate that used to wrap the whole right-hand content area. Previously, entering Call Mode required a list to already be selected (since the "Start Call Mode" button only existed inside a selected list's toolbar); now that Dashboard can request Call Mode with no list selected, the picker (and any non-Active-List queue) had to be reachable independent of `activeListId`. The "No list selected" empty state is now only shown when `subView !== 'callQueue'`.
- The sidebar "Call Mode" nav item's badge now shows `todayCallbackQueue.length + overdueCallbackQueue.length` (owed callbacks) instead of the old active-list-scoped count — a more useful "how many do I owe" signal that doesn't require a list to be selected to be meaningful.
- Import, list creation/rename/delete, search, status filter, and contact detail modal behavior are all unchanged.

## 12. Task Editing or Rescheduling Support

Full lightweight editing was practical and built (not just a reschedule shim):
- `TaskRow` accepts `onEdit`; its content area (not the complete checkbox or delete button) becomes clickable when provided.
- `RelatedTasks` (used by `ClientCard`, contact detail, and Call Mode's sidebar Tasks panel) and the Dashboard's `DashboardTasks` both wire `onEdit` to open `TaskModal` pre-filled with the task's current title/type/priority/due date/description, saving via `taskApi.updateTask(task.id, fields)` with `heading="Edit Task"` / `saveLabel="Save Changes"`.
- `useTasks.updateTask` was fixed to actually persist `taskType` — it silently ignored that field before, which would have meant "editing" the type never took effect even with the UI wired up. This was caught during manual testing (see section 19).
- Task creation paths (Dashboard quick-add, full Add Task modal, `ClientCard`/`PropertyCard` "Set Next Action", Call Mode's Call Back flow) are all unchanged and still create new tasks.

## 13. UX Improvements

- Zero ambiguity about which queue is active — the header names it and states the reason every time.
- Per-contact "Why they're up" line removes the need to guess why someone is being called right now.
- The completion checkbox means a callback task doesn't linger open after it's actually been handled, without forcing Brandon to leave Call Mode and manually complete it elsewhere.
- Editing a task (e.g., pushing a due date back a day) no longer requires deleting and recreating it.
- "Change Queue" lets Brandon pivot mid-session (e.g., finish the 3 overdue callbacks he can see, then jump to today's) without exiting Call Mode entirely.

## 14. Existing Features Confirmed Working

Verified live against the local dev server with real Supabase data (465 Database contacts, 68 Master Database, 456 in the All Contacts call queue):

- Dashboard → Start Calling → queue picker opens with live counts (Follow-Up Needed: 9, All Contacts: 456 at test time).
- Selected Follow-Up Needed → Call Mode opened on a real contact ("Larry Crees") with header `"Follow-Up Needed — 1 of 9"` and the reason line.
- Logged a Conversation outcome → call history recorded, follow-up-task-only prompt appeared (no checkbox, correctly, since this contact had no queue task) → Skip Task advanced to contact 2 of 9.
- Change Queue returned to the picker without losing the other queues' live counts.
- Created a real call task due today on that contact (via the new task editing feature, correcting an initially-wrong due date), confirming: the sidebar "Call Mode" badge went from blank to "1", Today's Callbacks queue count went 0 → 1, and the contact appeared in it with header `"Today's Callbacks — 1 of 1"`.
- Logged "Not Interested" on that task-based-queue contact → completion checkbox appeared pre-checked with the correct task title → clicked Continue → task completed → queue count dropped to 0 and showed the "queue is empty" state with "Choose a different queue" / "Back to contacts" options.
- Overdue Callbacks correctly showed its own empty state when no overdue tasks existed.
- Database Master Database / All Contacts / list selection, import flow, and Markets view unaffected.
- Pipeline, Clients, Analyst, and Calendar were spot-checked and still render.
- No console errors observed during any of the above.

## 15. Bugs Fixed

- **Task edit silently dropping type changes**: `useTasks.updateTask` never mapped `taskType` → `task_type` for updates (only `createTask` did). Caught while testing the new edit-task flow; fixed by adding the missing field mapping. Task creation elsewhere was unaffected since it already went through `createTask`.
- **Call Mode unreachable without a list selected**: fixed as described in section 11 — this was a genuine gap this sprint introduced (Dashboard needed to open Call Mode with no list active) and fixed before it shipped, not a pre-existing bug.

## 16. Known Issues / Risks

- Selecting a queue from the picker always starts at position 1, even if Brandon was previously partway through that same queue in this session. Only the per-list toolbar "Resume Call Mode" button preserves position (tracked separately by checking `callQueueSource === 'activeList'`). This is a minor rough edge, not a data-loss risk — no progress is actually lost, since call outcomes are saved as soon as they're logged; it only affects where the queue "scrolls back to" if he leaves and returns via the picker.
- "Resume Last Session" (queue F in the brief) was not built — see section 7.
- Lint baseline: 55 problems (46 errors, 9 warnings), identical to the Sprint 5 baseline. The one new effect this sprint added (`entryRequest` consumption in `Database.jsx`) reuses a pattern (`react-hooks/set-state-in-effect`) that already exists elsewhere in the same file from Sprint 5 — same category, no new category introduced.
- During manual QA I logged real call outcomes (Conversation, then Not Interested) and created/completed a real test task against an actual production contact ("Larry Crees") in order to verify the task-based-queue and completion-checkbox flows end-to-end. I restored the contact's `status` back to `conversation` and its `call_history` back to its single pre-test entry, and deleted the test task, directly via the Supabase REST API using the app's own publishable client key immediately after testing. Final state was verified by re-reading the row. Sprint 4's recommendation to use a dedicated QA contact/list for this kind of testing is still outstanding — I did not have one available, so I used a real record and cleaned up manually instead. This should be considered the top candidate for the QA seed/cleanup script recommended in Sprints 4 and 5.
- Editing a task's `relatedType`/`relatedId` is not exposed in the edit modal (the context stays fixed to whatever the task was already tied to) — this is intentional, not a gap; re-parenting a task to a different contact/client wasn't requested and would be a different feature.

## 17. What Not To Touch in Future Sprints

Do not touch these unless the sprint explicitly requires it:

- `api/analyst.js`
- `api/_financialModel.js`
- `src/data/financialModel.js`
- `src/lib/excelModel.js`
- `public/model-template.xlsm`
- TractIQ OAuth/auth/secrets flow
- Supabase service role key logic

## 18. Recommended Sprint 7 Focus

1. A QA seed/cleanup script (temporary contact + temporary tasks, safely deletable) — now flagged in three straight sprints' handoffs. This should stop being deferred.
2. Persist queue position across a picker round-trip within the same session (small, contained fix — store `{ source, index }` pairs per queue key instead of a single shared `callQueueIndex`).
3. Consider surfacing the "Today's Callbacks" / "Overdue Callbacks" counts somewhere on the Dashboard itself (they currently only appear inside Database's picker and sidebar badge), so Brandon sees the number before he even opens Database.
4. Revisit whether Appt Set outcomes should offer to create a Calendar meeting directly (the brief allowed this "if existing flow supports it cleanly" — it doesn't yet without deeper Calendar integration, which was out of scope this sprint).

## 19. Local Testing Completed

Commands:

- `npm run build` passed.
- `npm run lint` — 55 problems (46 errors, 9 warnings), identical to the Sprint 5 baseline. No new lint category introduced.

Browser local smoke (real Supabase data, see section 14 for full detail):

1. Dashboard → Start Calling → queue picker opened with live per-queue counts.
2. All five queue cards rendered with correct labels/reasons; Active List correctly disabled with no list selected.
3. Follow-Up Needed queue opened, outcome logged, follow-up-task-only prompt (no checkbox) behaved correctly, advanced to next contact.
4. Task editing exercised directly (fixed a wrong due date on a real task), which also exposed and fixed the `taskType`-not-persisting bug in `useTasks.updateTask`.
5. Today's Callbacks queue populated correctly once the task's due date was corrected to today; sidebar badge updated to "1".
6. Logged an outcome from a task-based queue with the completion checkbox pre-checked; confirmed the originating task was completed and the queue emptied.
7. Confirmed the empty-queue state (with "Choose a different queue" / "Back to contacts") renders correctly for a queue with zero matches (Overdue Callbacks).
8. Confirmed Database's normal contact list, search, and Master Database view still work; Pipeline/Clients/Analyst/Calendar spot-checked as still rendering.
9. Cleaned up all test-created data (task deleted, contact status/call history restored) directly against Supabase immediately after testing.

## 20. Production Testing Completed or Pending

Pending. Push to `claude/storage-investment-crm-vV018` to deploy, then smoke test on `https://self-storage-crm.vercel.app/`:

- Dashboard Start Calling opens the queue picker.
- All Contacts queue opens and works.
- Today's Callbacks / Overdue Callbacks queues (create a real dated call task first if none exist, since these will show empty on a clean day).
- Database's per-list "Start Call Mode" button still jumps directly into that list.
- Task editing from a task row (Dashboard Tasks panel or a Call Mode contact's Tasks sidebar) opens and saves correctly.
- Database, Clients, Pipeline, Analyst, Calendar all still render.

## 21. Build / Lint Results

- Build: passed. `dist/assets/index-*.js` ~1,182.5 kB (346.4 kB gzip), CSS ~66.2 kB (10.8 kB gzip). Same pre-existing Vite large-chunk warning as prior sprints.
- Lint: 55 problems (46 errors, 9 warnings) — identical to the Sprint 5 baseline. No new lint category introduced.

## 22. Commit Hash

Implementation commit: see the commit created immediately after this handoff was written (`git log` on `claude/storage-investment-crm-vV018`).

## 23. Deployment Notes

- No Supabase schema changes.
- No environment variable changes.
- No new npm dependencies.
- Push to `claude/storage-investment-crm-vV018` deploys directly to production on Vercel. Mirror to `main` after production branch is updated, per repo convention.

## 24. Context for ChatGPT Review

This sprint's core question: does Call Mode now make it obvious what Brandon is calling and why, without ever building a second Call Mode? The queue picker and the five queue definitions in `Database.jsx` (`buildCallbackTaskQueue`, `buildFollowUpQueue`, `QUEUE_DEFS`) are the load-bearing code — they all feed the same existing `CallQueue` component through a `queue` array of contacts, so there was never a fork. The other significant piece is the outcome → task-completion checkbox (`postOutcome` state in `CallQueue`), which had to merge with Sprint 4's existing follow-up-task-offer prompt without creating two separate confirmation dialogs stacked on each other. Task editing (`onEdit` on `TaskRow`, wired through `RelatedTasks` and `DashboardTasks`) was a smaller, self-contained addition that also caught and fixed a real bug (`taskType` not persisting on update) that would otherwise have made "editing" silently incomplete. One thing worth double-checking independently: whether starting every queue fresh at position 1 (rather than remembering position per queue) will actually annoy Brandon in daily use, or whether it's a non-issue since he's meant to work a queue to completion before switching.
