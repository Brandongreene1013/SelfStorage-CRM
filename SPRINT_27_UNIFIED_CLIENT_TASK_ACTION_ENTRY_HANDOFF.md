# Sprint 27 — Unified Database Person Task / Action Entry

## Corrected product meaning

In this CRM, “client” in the sprint request meant a person/contact inside the Database, including the person currently being worked in Call Mode. It did not mean only a promoted record in the Clients or Pipeline sections.

The initial implementation misunderstood that term and placed direct `+ Task` / `+ Action` controls on Clients and Pipeline cards. The correction restores those two sections to their pre-sprint card UI and moves the unified workflow to Database contacts and Call Mode.

## Final scope

- Database person cards
- Full Database person-details modal
- Call Mode active person
- Call Mode outcomes integrated with the person’s action history
- Call Back integrated with automatic universal task creation

Explicitly excluded:

- New direct `+ Task` / `+ Action` buttons on Clients cards
- New direct `+ Task` / `+ Action` buttons on Pipeline cards
- Database schema migrations
- Automatic promotion to Clients/Pipeline

## Database card workflow

Every Database contact card has adjacent `+ Task` and `+ Action` buttons.

- `+ Task` opens the focused Add Task form.
- `+ Action` opens the focused Log Action form.
- Existing next-task summaries remain visible and open the Task workflow.
- Last Action remains visible and deletable.

Tasks are related to the Database person with:

- `relatedType: "contact"`
- the contact ID and display name
- `source: "database"`

Actions are appended to `contacts.action_log`.

## Full person-details workflow

The person-details modal exposes `+ Task` and `+ Action` immediately below the person/facility identity, before the long research and editable-details content.

- The focused forms use the same design and persistence paths as the Database card.
- Existing task rows remain available for editing and completion.
- The duplicate Add Task control inside the related-task list is suppressed.
- Logging any call outcome also appends that outcome to the unified action log.
- Selecting Call Back requires a callback date and automatically creates the dated `Call back` task.
- Conversation and Appointment can still offer an optional additional follow-up task.

## Call Mode workflow

The right-side navigation is now:

`Tasks | Actions | Research | History`

### Tasks

- Shows open universal tasks related to the active Database contact.
- `+ Task` opens the focused Add Task form.
- Existing task edit and completion behavior remains available.

### Actions

- Shows up to eight recent entries from `contacts.action_log`.
- Displays action icon/type, notes, date, and delete control.
- `+ Action` opens the focused Log Action form.

### Research

Retains the existing Call Mode research tools.

### History

Retains call history. The separate Activity box was removed because unified actions now have their own tab.

## Call Mode outcome integration

Each canonical outcome automatically writes the same event to the active contact’s unified action history:

- No Answer
- Left VM
- Conversation
- Appt Set
- Not Interested
- Call Back

The existing call-history/status update still occurs for compatibility with Call Mode queues and reporting. The action entry uses the same activity date and notes.

Call Back additionally:

1. Requires a callback date.
2. Saves the contact callback status/date.
3. Logs the Call Back action.
4. Automatically creates a universal `Call back` task due on that date.

## Persistence and failure behavior

### Tasks

Focused Task form → lifted `taskApi.createTask()` → universal `tasks` table → local task state.

### Actions

Focused Action form or Call Mode outcome → `logContactAction(contactId, entry)` → `contacts.action_log` JSONB → local contact state.

`logContactAction` and `deleteContactAction` now wait for Supabase success before changing local state and return errors to the caller. The focused form stays open when a save fails.

No SQL migration was required.

## Files changed by the correction

- `src/components/Database.jsx`
- `src/hooks/useDatabase.js`
- `src/components/ClientCard.jsx` — restored pre-sprint card UI
- `src/components/PipelineBoard.jsx` — restored pre-sprint card UI
- `SPRINT_27_UNIFIED_CLIENT_TASK_ACTION_ENTRY_HANDOFF.md`

The focused modal and shared action constants introduced in the earlier commit remain in:

- `src/components/ActionCenterModal.jsx`
- `src/data/constants.js`

## Verification

- `npm run build` passes.
- `npm run lint` passes.
- `git diff --check` passes.
- Local Database Master view shows `+ Task` and `+ Action` on Database person cards.
- Local person-details modal shows both controls at the top.
- Focused Log Action modal opens from person details with canonical outcomes, date, priority, notes, and Save Action.
- Local Call Mode shows `Tasks`, `Actions`, `Research`, and `History` tabs.
- Call Mode Tasks tab shows `+ Task`.
- Call Mode Actions tab shows `+ Action` and the empty/history state.
- Clients section has zero new `+ Task` / `+ Action` card buttons.
- Pipeline section has zero new `+ Task` / `+ Action` card buttons.
- No CRM records were created, updated, or deleted during this correction’s browser verification.

Automatic outcome persistence was verified through code-path inspection rather than clicking a real owner’s outcome during UI QA, to avoid modifying production CRM data.

## Current repository state

Base pushed commit: `b4c61c3ac2666c9239a510cd47f8347042784f1c`

The corrected scope is currently an uncommitted follow-up diff and must be committed and pushed only after approval.
