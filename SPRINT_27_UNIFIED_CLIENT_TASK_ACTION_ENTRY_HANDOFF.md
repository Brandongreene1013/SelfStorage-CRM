# Sprint 27 — Unified Client Task / Action Entry

## Objective

Make future Tasks and historical Actions feel like one intentional relationship-management workflow on client cards while keeping their data and semantics separate.

## User-facing result

- Client cards now show one compact **Relationship Activity** area with adjacent `+ Task` and `+ Action` buttons.
- Pipeline client cards expose the same two direct choices.
- `Task` opens a focused Add Task form; `Action` opens a focused Log Action form. The user does not choose the mode twice.
- Existing next-task summaries, related-task editing/completion, Last Action display, recent action history, and action deletion remain available.
- Redundant `+ Set Next Action`, `+ Log`, and expanded-details `+ Task` entry buttons were removed from client cards.

## Current behavior discovered

Before this sprint, client cards exposed overlapping `Set Next Action`, `Log`, and `Task` entry points. All opened either a combined optional two-section modal or a separate task modal, so future obligations and completed activity did not have a clear first choice.

Tasks already used the universal `tasks` table through the single `useTasks()` instance in `App.jsx`. Actions already used the `clients.action_log` JSONB array through `useCRM()`.

## Files created and modified

Created:

- `SPRINT_27_UNIFIED_CLIENT_TASK_ACTION_ENTRY_HANDOFF.md`

Modified:

- `src/components/ActionCenterModal.jsx`
- `src/components/ActionLog.jsx`
- `src/components/ClientCard.jsx`
- `src/components/Database.jsx`
- `src/components/PipelineBoard.jsx`
- `src/components/RecentActivity.jsx`
- `src/components/tasks/RelatedTasks.jsx`
- `src/data/constants.js`
- `src/hooks/useCRM.js`

## Exact Task workflow

1. Click `+ Task` on a Clients or Pipeline client card.
2. A focused **Add Task** modal opens with client/facility context.
3. Enter the task text, task type, due date, priority, and optional notes; existing quick picks remain available.
4. Save calls `taskApi.createTask()` with `relatedType: "client"`, the correct client ID/name, and the originating `client` or `pipeline` source.
5. The modal closes only after a successful database response. On failure it stays open, preserves form state, and displays an error.
6. The task immediately updates the card and remains part of Dashboard/task queue logic.

Expanded details continue to show the related task rows for completion and editing, but no longer show a second Add Task button.

## Exact Action workflow

1. Click `+ Action` on a Clients or Pipeline client card.
2. A focused **Log Action** modal opens with client/facility context.
3. Select a Call Mode action type, choose/backdate the action date, select priority, and enter optional context.
4. Save appends `{ type, date, priority, note, at }` to `clients.action_log`.
5. `useCRM.logClientAction()` now waits for Supabase success before updating local state. On failure it returns an error so the modal remains open with entered data.
6. Last Action and recent activity update after success. No universal task is created.

## Shared modal/component design

`ActionCenterModal` now supports focused `task` and `action` modes using the same modal shell, responsive spacing, footer, Save/Cancel placement, error state, and priority vocabulary. Its prior combined mode remains available for non-client surfaces to avoid broadening this sprint into Dashboard or Database workflow redesign.

## Action type reuse

The six existing Call Mode outcomes were promoted unchanged to the shared `CALL_ACTION_TYPES` constant and are consumed by both Call Mode and the focused client Action form. Call Mode labels, values, icons, colors, shortcuts, and outcome behavior are unchanged.

The older `ACTION_TYPES` list remains in place for legacy future Next Action fields and combined non-client entry surfaces.

## Task persistence path

`ClientCard` / `PipelineBoard` → focused `ActionCenterModal` task mode → lifted `taskApi.createTask()` → `useTasks()` → Supabase `tasks` table → local task state.

## Action persistence path

`ClientCard` / `PipelineBoard` → focused `ActionCenterModal` action mode → `logClientAction(clientId, entry)` → `useCRM()` → Supabase `clients.action_log` JSONB → local client state.

## Priority behavior

- Task priority continues to use `low`, `normal`, `high`, and `urgent` and retains all existing task queue/due-date behavior.
- Action priority uses the same vocabulary but remains historical metadata inside JSONB.
- Normal action priority is quiet. High/Urgent appears as a subtle Last Action/recent-history indicator.
- Action priority never creates task urgency, overdue state, or task queue entries.

## Data model and migration status

No SQL migration is required. The universal task schema is unchanged. `clients.action_log` is JSONB and safely supports the additional `priority` property on individual entries. Existing action entries without priority remain compatible and display normally.

## QA records created

- Client: `QA_TASK_ACTION_20260715`
- Facility: `QA Unified Workflow Facility`
- Task: `QA_TASK_ACTION_FOLLOW_UP` (Urgent, due 2026-07-16)
- Action: `QA_TASK_ACTION_BACKDATED_CONVERSATION` (Conversation, Urgent, dated 2026-07-10)

## QA cleanup performed

- The QA action was deleted through the client-card action-delete control and confirmed removed.
- The remaining QA task and QA client were deleted through Supabase using exact QA identifiers.
- A final query confirmed zero `QA_TASK_ACTION_20260715` clients and zero `QA_TASK_ACTION_%` tasks remain.

No real client, contact, owner, property, or task records were modified for testing.

## Desktop verification

- Verified Clients card controls and focused forms locally against live persistence.
- Verified the same Task/Action controls render on the QA client inside Pipeline.
- At 1280px and 1440px, controls stayed compact and the document had no horizontal overflow.

## Mobile verification

- At 390px, the Add Task dialog fit between 16px page gutters, had no document overflow, and kept Save visible. Task/Action buttons remained side-by-side and usable.
- At 430px, the Log Action dialog fit between 16px gutters with no document overflow and kept Save visible.
- Form grids collapse to one column where necessary; quick-pick/type choices remain two columns on small screens.

## Refresh and persistence verification

- Created an Urgent client task; it appeared immediately and remained after a full reload.
- Created an Urgent backdated client action; it appeared immediately and remained with its selected date after a full reload.
- The action did not create another task; the QA client retained only the explicitly created QA task.
- Action deletion was exercised successfully.
- RelatedTasks edit wiring was preserved and the previously excluded headline task is now included in expanded details, keeping task editing reachable without a duplicate Add Task control.

## Save-failure behavior

The focused modal awaits the existing persistence APIs. Both task and action errors leave the form mounted, preserve state, and render a clear inline error. The error branch was verified by code-path inspection; no production outage or destructive schema failure was induced solely to force an error.

## Build result

- Pre-sprint: `npm run build` passed with the existing bundle-size advisory.
- Post-sprint: `npm run build` passed with the same advisory.

## Lint result and baseline comparison

- Pre-sprint: `npm run lint` passed with zero findings.
- Post-sprint: `npm run lint` passed with zero findings.
- Net regression: none.

## Known issues

- The application still has legacy single-slot Next Action fields for compatibility with existing pipeline/contact behavior. This sprint removes redundant client-card entry buttons but does not migrate or delete those fields.
- A forced visual save-failure test was not performed against production; failure behavior is implemented and statically verified.

## Deliberately deferred work

- Dashboard Action Center redesign
- Database/contact-card entry redesign
- Call Mode workflow changes
- Legacy Next Action data migration/removal
- Broader activity taxonomy beyond the existing Call Mode outcomes

## Protected areas not touched

- `api/analyst.js`
- `api/_financialModel.js`
- `src/data/financialModel.js`
- `src/lib/excelModel.js`
- `public/model-template.xlsm`
- TractIQ OAuth/authentication
- `app_secrets` and service-role logic
- Production secrets

## Recommended next sprint

Decide whether the remaining legacy single-slot `nextActionType`, `nextActionDate`, and `nextActionNote` fields should be migrated into universal tasks, then retire their fallback display only after Pipeline and contact workflows have dedicated regression coverage.

## Commit status

Committed in the production-branch commit containing this handoff. Use
`git log -1 --oneline -- SPRINT_27_UNIFIED_CLIENT_TASK_ACTION_ENTRY_HANDOFF.md`
to resolve the exact SHA in a fresh Claude Code session.

## Deployment status

Approved by Brandon for push to `origin/claude/storage-investment-crm-vV018`.
That branch is the Vercel production source; confirm the remote SHA and Vercel
deployment state before beginning the next sprint.
