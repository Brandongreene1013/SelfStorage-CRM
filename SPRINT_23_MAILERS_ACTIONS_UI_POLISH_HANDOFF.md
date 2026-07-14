# Sprint 23: Mailer Lists, Unified Actions, and UI Polish

## 1. Objective
Turn the CRM into a broader outbound operating system by adding direct-mail list management, improving UI consistency, and consolidating action logging / next-action creation into one clearer workflow.

## 2. Commit Range
- `bece83c` — Polish CRM UI
- `73e23b2` — Finish UI polish leftovers: drop emoji glyphs, add prospector dev config
- `3685820` — Add mailing address field across contacts and clients
- `34ac647` — Resume Call Mode at the exact contact you left off on
- `9572412` — Restore icon emojis dropped by the UI polish pass
- `60dcdb1` — Add Mailer Lists: build direct-mail lists from any mailing address
- `9717131` — Merge Log Action and Set Next Action into one popup
- `333acc4` — Make contact/client load order deterministic across app restarts
- `f9c81c7` — Fix layouts that clipped in the installed PWA at narrow widths

## 3. Files Modified / Created
Modified highlights:
- `src/App.jsx`
- `src/components/Dashboard.jsx`
- `src/components/Database.jsx`
- `src/components/ClientCard.jsx`
- `src/components/ClientModal.jsx`
- `src/components/ImportListModal.jsx`
- `src/components/ActionModal.jsx`
- `src/components/ActionLog.jsx`
- `src/components/PipelineBoard.jsx`
- `src/hooks/useCRM.js`
- `src/hooks/useDatabase.js`
- `src/data/constants.js`

Created:
- `src/components/ActionCenterModal.jsx`
- `src/components/MailerListPicker.jsx`
- `src/components/MailerLists.jsx`
- `src/hooks/useMailerLists.js`
- `sql/mailing_address_migration.sql`
- `sql/mailer_lists_migration.sql`
- `SPRINT_23_MAILERS_ACTIONS_UI_POLISH_HANDOFF.md`

## 4. Behavior Changed
- Added first-class Mailer Lists.
- Added a Mailers nav tab.
- Contacts/clients gained mailing address support.
- Any mailing address can be added to a mailer list through the picker flow.
- Log Action and Set Next Action were merged into `ActionCenterModal`.
- Call Mode resumes at the exact contact within the active session.
- Contact/client loading order became deterministic across restarts.
- PWA/narrow-width clipping issues were fixed.
- A broad UI polish pass adjusted typography, icon usage, layout density, and visual consistency.

## 5. SQL / Schema Notes
Created migrations:
- `sql/mailing_address_migration.sql`
- `sql/mailer_lists_migration.sql`

Fresh environments need these migrations run before mailing addresses and mailer lists persist. Verify with guarded rows through the app's anon key after running them.

## 6. Why It Matters
Direct mail is now part of the same operating system as calling and pipeline management. Brandon can build targeted mailer lists from the same owner/contact data he works in Database and Call Mode, instead of managing mailing recipients in a separate spreadsheet.

The unified action modal also matters because the older split between "log action" and "set next action" created duplicated behavior and extra clicks. This sprint simplified that workflow without removing task history.

## 7. Known Issues / Carry Forward
- Mailer Lists are functional but still basic; no print/export workflow is documented here.
- The emoji removal/restoration churn shows that visual polish can accidentally erase useful scannability. Future UI passes should check live screens, not just code diffs.
- The PWA layout fixes reduce clipping, but every new dense panel still needs mobile/PWA checks.

## 8. Protected Areas Not Touched
- Analyst system prompt and underwriting math
- Excel model export
- TractIQ OAuth / `app_secrets`
- Backup encryption secrets

## 9. Recommended Follow-Up
- Add export/print support for mailer lists if direct mail becomes a regular workflow.
- Keep action logging and task creation unified; do not resurrect parallel modals unless there is a strong product reason.
- Continue mobile/PWA checks after any dense Database or Call Mode UI work.
