# Sprint 2 — Universal Task / Next-Action Engine — Handoff

## 1. Sprint Name
Sprint 2: Universal Task and Next-Action Engine

## 2. Sprint Objective
Before this sprint, "what does Brandon need to do next" was scattered across four
disconnected systems: a Dashboard to-do widget (Supabase `tasks` table, just
`{text, done}`), a single-slot "Next Action" field on clients/contacts
(`nextActionType/Date/Note`), an append-only activity log (`actionLog`), and
implicit follow-up context buried in Pipeline cards. None of them talked to each
other. The objective was to build ONE task model that any part of the app can
create tasks against and see tasks from — starting with the highest-value,
lowest-risk integration points (Dashboard, Client, Database contact, Pipeline) —
without touching or removing the existing single-slot Next Action system, which
is still deeply wired into drag-and-drop, call logging, and the activity log
across `ClientCard`, `PipelineBoard`, and `Database`. Explicitly out of scope
(per the sprint brief): Dashboard 2.0, full Call Mode, Property Intelligence
Hub, import redesign, Analyst underwriting logic, TractIQ/auth, Excel export.

## 3. Summary of What Changed
- Added a universal `tasks` table (upgrading the pre-existing simple to-do
  table in place — see Section 7) with title, description, status, priority,
  due date, and a `related_type`/`related_id`/`related_name` link to whatever
  the task is about (client, contact, meeting, property, or general).
- Added `useTasks()` — a single hook, instantiated once in `App.jsx` and
  passed down as a `taskApi` prop, that all task UI reads/writes through.
- Replaced the Dashboard's simple to-do widget with a real Overdue / Due Today
  / Upcoming / Completed-today view, plus quick-add and full-task-modal entry
  points.
- Added a compact "Tasks" section (open task list + "+ Task" button) to
  `ClientCard` and to Database's `ContactDetailModal`.
- Wired the Database call-outcome flow so logging "Call Back" strongly prompts
  for a task with a due date, and logging "Conversation" or "Appt Set" offers
  a dismissible "add a follow-up?" suggestion.
- Added a small, non-intrusive task-count chip to Pipeline cards.
- **Deliberately did NOT touch** `ActionModal.jsx`, `ActionLog.jsx`, the
  `nextActionType/Date/Note` fields, or the existing "Next Action" UI on
  `ClientCard`/`PipelineBoard`/Database's `PropertyCard` — see Section 11 for
  why, and Section 13 for the recommended follow-up.

## 4. Files Created
- `sql/tasks_table_migration.sql` — the SQL Brandon needs to run once (see
  Section 7).
- `src/hooks/useTasks.js` — the task engine: load, create, update, complete,
  reopen, dismiss, delete, `getRelatedTasks(type, id)`, and memoized
  Overdue/Today/Upcoming/NoDueDate/CompletedToday groupings.
- `src/components/tasks/TaskModal.jsx` — create-task modal (quick-pick presets,
  type, priority, due date, notes), reused everywhere a task is created.
- `src/components/tasks/TaskRow.jsx` — one task row (checkbox-complete, type
  icon, priority mark, due-date badge, delete).
- `src/components/tasks/RelatedTasks.jsx` — compact "open tasks for this
  entity + Add Task button" block, used in `ClientCard` and
  `ContactDetailModal`.
- `src/components/tasks/NextActionIndicator.jsx` — the tiny Pipeline-card chip.
- `src/components/tasks/index.js` — barrel export.

## 5. Files Modified
- `src/data/constants.js` — added `TASK_TYPES` (9 types matching the sprint
  brief), `TASK_PRIORITIES` (low/normal/high/urgent), `TASK_QUICK_PICKS` (9
  one-click presets: call back tomorrow, send TractIQ report, ask for T-12,
  ask for rent roll, schedule valuation call, follow up after BOV, send
  exclusivity agreement, check in next quarter, revisit in 6 months — "Mark
  not interested" was intentionally excluded, see Section 11).
- `src/App.jsx` — instantiates `useTasks()` once, passes `taskApi` down to
  `Dashboard`, `PipelineBoard`, the Clients-view `ClientCard`s, and `Database`.
- `src/components/Dashboard.jsx` — removed the old `TodoWidget` (direct
  `supabase.from('tasks')` calls); added `DashboardTasks`, which uses
  `taskApi` instead.
- `src/components/ClientCard.jsx` — added a `RelatedTasks` block below the
  existing activity-log row; accepts and forwards `taskApi`.
- `src/components/PipelineBoard.jsx` — threaded `taskApi` through
  `PipelineBoard` → `StageColumn` → `DraggableChip`; added
  `NextActionIndicator` next to the existing type/temperature badges.
- `src/components/Database.jsx` — `ContactDetailModal` now accepts `taskApi`,
  shows `RelatedTasks`, and prompts for a follow-up task after certain call
  outcomes (see Section 9); `Database`'s own signature and its `ClientCard`/
  `ContactDetailModal` call sites now pass `taskApi` through.

**Not modified:** `ActionModal.jsx`, `ActionLog.jsx`, `Database.jsx`'s
`PropertyCard` (no `RelatedTasks` added there — see Section 11),
`api/analyst.js`, `api/_financialModel.js`, `src/lib/excelModel.js`,
`public/model-template.xlsm`, anything TractIQ/auth-related, `Calendar.jsx`.

## 6. Task Data Model
```
{
  id, title, description,
  status: 'open' | 'completed' | 'dismissed',
  priority: 'low' | 'normal' | 'high' | 'urgent',
  dueDate, completedAt, createdAt, updatedAt,
  relatedType: 'client' | 'contact' | 'meeting' | 'property' | 'general',
  relatedId, relatedName,
  source: 'dashboard' | 'client' | 'database' | 'pipeline' | 'calendar',
  taskType: 'call' | 'email' | 'meeting' | 'send_report' | 'request_financials'
          | 'bov' | 'follow_up' | 'contract' | 'general',
}
```
App-side (camelCase) shape above; DB-side (snake_case) matches 1:1 except
`dueDate`→`due_date`, `completedAt`→`completed_at`, etc. — see
`dbToTask()`/insert mapping in `useTasks.js`.

## 7. Supabase / SQL Changes Required
**Brandon needs to run `sql/tasks_table_migration.sql` once**, in the Supabase
SQL Editor, before the new task features will actually persist. Key facts:
- A `tasks` table **already exists in production** (used by the old simple
  Dashboard to-do widget) with just `(id, text, done, created_at)`. Verified
  live against the real Supabase project: it's currently empty (0 rows), so
  there's no real data at risk, but the migration still backfills defensively
  in case that changes before it's run.
- The migration **upgrades that same table in place** — it does not create a
  second table — via idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
  statements, so it's safe to run more than once.
- It backfills any existing simple to-dos (`text`/`done`) into the new
  `title`/`status` shape so nothing already on the Dashboard would vanish.
- It adds check constraints on the enum-like columns and two indexes
  (`status, due_date` for the Dashboard groupings; `related_type, related_id`
  for the per-entity lookups).
- **RLS and a leftover NOT NULL constraint (both confirmed necessary live,
  not just theoretical fallbacks).** Two surprises turned up when this
  migration was actually run against production on 2026-07-01: (1) the table
  had RLS enabled with no permissive policy, silently blocking every anon-key
  insert/update — not something this migration originally caused, but it was
  in that state, and the fix is now a mandatory (not optional) step in the
  SQL file; (2) the original `text` column had a leftover `NOT NULL`
  constraint from the old simple-to-do schema, which broke every new-shape
  insert since new tasks never populate `text`. **The checked-in
  `sql/tasks_table_migration.sql` now includes both fixes as required steps**
  — it is no longer the version that was first run; if you have an older copy
  of this file cached anywhere, re-pull it.
- **This has been run against production and verified end-to-end** (create →
  complete → delete → bad-value-rejected → select, all via the app's real
  anon key) as of 2026-07-01. The task engine's database side is confirmed
  working, not just theoretically migrated.

**Until that SQL is run, the app does not break** — see Section 12. (It has
now been run; this note is preserved for anyone reading this before applying
it fresh to a different environment.)

## 8. New Hooks / Services / Components
- **`useTasks()`** (`src/hooks/useTasks.js`) — see Section 4/6. Instantiated
  once in `App.jsx`, not per-component (avoids duplicate fetches/subscriptions
  across Dashboard/Clients/Pipeline/Database all needing task data
  simultaneously).
- **`TaskModal`, `TaskRow`, `RelatedTasks`, `NextActionIndicator`** — see
  Section 4. All consume a `taskApi` prop rather than calling the hook
  themselves, so there's a single source of truth flowing down from `App.jsx`
  (same lifted-state pattern the project already uses for `useCRM`/
  `useDatabase`/`useMeetings`).

## 9. UX Improvements
- **Dashboard tasks are now real next-actions, not a flat checklist.**
  Overdue/Due Today/Upcoming grouping (color-coded red/amber/slate) plus a
  collapsed "completed today" tally, so Brandon's morning Dashboard visit
  actually tells him what's late vs. what's coming up, not just an
  undifferentiated list.
- **Call-outcome-aware task prompting.** Logging "Call Back" on a Database
  contact now opens the Add Task modal automatically with the due date field
  visually emphasized (amber border + asterisk) — matching the brief's "For
  Call Back, strongly prompt for due date." Logging "Conversation" or "Appt
  Set" shows a lighter, dismissible suggestion bar instead of forcing a modal,
  matching "allow follow-up task creation" (weaker than "strongly prompt").
- **Quick-pick presets** in the Add Task modal turn the 9 example follow-ups
  from the sprint brief (call back tomorrow, send TractIQ report, ask for
  T-12, etc.) into one click, pre-filling title/type/a sensible due-date
  offset (e.g. "Check in next quarter" → +90 days).
- **Pipeline stays uncluttered.** The new task-count chip (📋 2) sits inline
  with the existing Buyer/Seller/temperature badges — it's a single small
  pill, not a second banner competing with the card's existing "Next Action"
  button/banner.

## 10. Existing Features Confirmed Working
Verified via `npm run build` (clean) and reading the diffs against every
touched file; **not** verified via a live click-through in a running browser
this sprint — see Section 14 for why, and Section 12 for the honest risk
assessment:
- Dashboard, Pipeline, Clients, Database, Analyst, and Calendar all still
  import and render their existing components unchanged in structure — the
  only removed code is the old `TodoWidget` function (which had zero external
  consumers; grepped to confirm).
- `ActionModal`/`ActionLog`/Next-Action single-slot flow — untouched byte-for-
  byte in `ActionModal.jsx`/`ActionLog.jsx`; `ClientCard`/`PipelineBoard`/
  `Database`'s existing Next-Action buttons and drag-and-drop logic are
  unmodified other than the new `RelatedTasks`/`NextActionIndicator` additions
  appended alongside them.
- Confirmed live against the actual Supabase project (via a Node script using
  the same publishable key the app uses) that: the `tasks` table is reachable,
  `select('*')` succeeds against its current (pre-migration) shape, and an
  insert using the new schema fails with a specific, catchable error
  (`PGRST204` / "Could not find the 'priority' column") — which is exactly
  the failure mode `useTasks.js`'s `isMissingColumnError()` is built to catch.

## 11. Bugs Fixed
None. This was new-feature work, not a bug-fix pass.

## 12. Known Issues / Risks
- **UPDATE (2026-07-01, after the rest of this document was written): the SQL
  migration HAS now been run against production**, including the RLS and
  NOT NULL fixes described in Section 7, and verified end-to-end via a Node
  script hitting the real anon key: create → complete → delete → bad-value-
  rejected → select, all passed. The task engine's database side is
  confirmed working, not just theoretically migrated.
- **No live browser click-through has been completed yet**, even though the
  database side is now verified. I verified the code paths by reading every
  diff, running a clean production build, running lint at the exact
  pre-Sprint-2 baseline, and confirming the database round-trip via a Node
  script — but nobody has clicked through the actual running app yet
  (Dashboard quick-add → complete, Client "+ Task" → appears → complete,
  Database "Call Back" → task prompt, Pipeline chip rendering). **This is the
  one remaining item before considering the sprint fully closed** — see the
  manual test script in the original sprint brief; all 13 steps are still the
  right checklist.
- **Bundle size grew slightly** (1,158.88 kB vs. Sprint 1's 1,144.30 kB, both
  pre-existing-warning territory over the 500 kB threshold) — expected from 6
  new files; not a regression pattern, same pre-existing "needs code-splitting
  eventually" note from the Sprint 1 handoff.
- **Two task-creation systems now coexist** (legacy single-slot Next Action +
  new universal tasks) — this is an intentional, documented interim state,
  not an oversight. See Section 13.

## 13. What Not To Touch in Future Sprints
Carried forward from Sprint 1 (still true): `src/data/financialModel.js` /
`api/_financialModel.js`, `api/analyst.js`'s system prompt, `src/lib/
excelModel.js` / `public/model-template.xlsm`, TractIQ OAuth / `app_secrets` /
`SUPABASE_SERVICE_KEY`, Supabase schema outside what this sprint's migration
covers.

New from this sprint:
- Don't remove `ActionModal.jsx`/`ActionLog.jsx` or the `nextActionType/Date/
  Note` fields yet — they're still the only way Pipeline's drag-and-drop chip
  and Database's call-outcome flow show "what's the very next thing," and a
  lot of code depends on them. Consolidating them into the universal task
  system is real, valuable work (see Section 14) but is a dedicated sprint of
  its own, not a side effect of a future feature sprint.
- Don't rename or restructure the `tasks` table columns without updating both
  `sql/tasks_table_migration.sql` (for anyone re-running it fresh) and
  `useTasks.js`'s `dbToTask()`/insert mapping in the same change.

## 14. Recommended Sprint 3 Focus
In priority order:
1. **Run the SQL migration in production and do the full manual click-through**
   (the 13-step script from the sprint brief) — this sprint's code is
   unverified in a live browser; that should happen before building on top of
   it further.
2. **Consolidate the legacy Next-Action system into the universal task
   engine.** This was Sprint 1's own recommendation and this sprint
   deliberately built the foundation without ripping out the old system yet
   — Sprint 3 is the natural place to migrate `ClientCard`/`PipelineBoard`/
   Database's single-slot "Next Action" button to create/show a universal
   task instead, then retire `ActionModal.jsx`. This needs Brandon's input:
   does the old single-slot indicator get removed entirely once tasks cover
   it, or is there a reason to keep both (e.g. "Next Action" as a
   headline/summary field vs. the full task list as detail)?
3. **Call Mode** — still the single most repeated daily workflow (cold
   calling); the new task-prompt-on-outcome logic in `ContactDetailModal` is
   natural groundwork for it.
4. Consider whether Pipeline's `NextActionIndicator` chip should be
   clickable (open the related tasks) rather than purely informational — kept
   it non-interactive this sprint to stay minimal, per "don't clutter the
   kanban board."

## 15. Local Testing Completed
- Read every diff against every modified file before and after each edit.
- `npm run build` — clean (see Section 16).
- `npx eslint .` — compared against the exact pre-Sprint-2 commit via
  `git stash -u` A/B testing; iterated on `useTasks.js`'s mount-effect pattern
  three times until it matched the codebase's existing (pre-existing-error)
  idiom exactly, landing at zero net new lint issues.
- Verified live against the actual Supabase project (not a mock) via a
  throwaway Node script using the app's real publishable key: confirmed the
  `tasks` table's current pre-migration shape, confirmed a new-schema insert
  fails with a specific error, confirmed the fixed `isMissingColumnError()`
  correctly classifies that error, and cleaned up the test row afterward.
- **Did not** complete a live browser click-through this sprint — see
  Section 12's first bullet for why and what's still needed.

## 16. Build / Lint Results
- `npm run build` — **passes clean.** `dist/assets/index-*.js` 1,158.88 kB
  (340.34 kB gzip), `dist/assets/index-*.css` 62.04 kB (10.35 kB gzip). Same
  pre-existing >500kB chunk-size warning as Sprint 1, not a new regression.
- `npx eslint .` — **58 problems (49 errors, 9 warnings) — one FEWER than the
  verified pre-Sprint-2 baseline of 59** (confirmed via a careful before/after
  A/B: tracked-file changes stashed, new files moved aside, baseline measured
  at a clean 59, matching the Sprint 1 handoff's own number exactly). A full
  line-by-line diff of the two lint runs shows every other line is just a
  line-number shift from added code — the one real change is that removing
  the old `TodoWidget` also removed a since-unused `useCallback` import in
  `Dashboard.jsx`, incidentally clearing a pre-existing lint error. Zero new
  lint issues were introduced by any file this sprint touched or added.

## 17. Commit Hash
The commit containing this file — message "Sprint 2: Universal task and
next-action engine" — on `claude/storage-investment-crm-vV018` (also
mirrored to `main`). Run `git log --oneline -1 -- SPRINT_2_TASK_ENGINE_HANDOFF.md`
for the exact hash. Repo: https://github.com/Brandongreene1013/SelfStorage-CRM

## 18. Deployment Notes
- Per project convention, this is pushed directly to the production branch;
  Vercel auto-deploys on push, no staging environment.
- **This sprint's code is safe to deploy even before the SQL migration runs**
  — every write path fails gracefully and surfaces a clear on-screen message
  rather than crashing (Section 6/12). The Dashboard and Client/Contact task
  sections will show a red "run the migration" notice until
  `sql/tasks_table_migration.sql` is run, then start working immediately with
  no further deploy needed (it's a Supabase-side change, not a code change).
- No new npm dependencies were added — everything is built on the existing
  React + Tailwind + Supabase-js stack.
- No environment variables changed.

---

## Context for ChatGPT Review

This sprint built new functionality (a universal task engine) rather than
refactoring existing UI, so the review lens is different from Sprint 1's:

1. **The most important open item is Section 12's first bullet: this code has
   not been exercised in a live browser yet.** Everything here is verified by
   static analysis (diffs, build, lint) and one direct-to-Supabase script test
   of the graceful-degradation path — but nobody has actually clicked "Add
   Task" and watched it appear on the Dashboard. Treat this sprint as
   code-complete-but-not-yet-manually-verified, and prioritize running the SQL
   migration + the 13-step manual test script from the original sprint brief
   before trusting this in front of Brandon for real deal work.
2. **Product decision needed: how long should the legacy Next-Action system
   and the new universal tasks coexist?** This sprint deliberately built the
   new engine as an ADDITIVE layer next to the old single-slot
   `nextActionType/Date/Note` system rather than replacing it, because a full
   replacement touches drag-and-drop and call-logging code paths that needed
   more careful, dedicated regression testing than this sprint's scope
   allowed. Brandon should weigh in on whether Sprint 3 fully consolidates
   these (recommended) or whether there's a reason to keep the lightweight
   single-slot field as a distinct "headline next step" separate from the
   fuller task list.
3. **"Mark not interested" was deliberately left out of the task quick-picks**
   (Section 5) — it's a contact status change, not a follow-up task, and is
   already handled by the existing "Not Interested" call outcome button. Flag
   this only if Brandon disagrees with that framing.
4. **Nothing in this sprint touched the Analyst, financial model, Excel
   export, or TractIQ integration** — those remain exactly as they were.
