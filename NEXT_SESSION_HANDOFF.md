# Storage Hunters CRM — Handoff for Next Chat

You are working in this repo:
`C:\Users\brand\OneDrive\Desktop\Storage Hunters CRM`

GitHub repo:
https://github.com/Brandongreene1013/SelfStorage-CRM

Live production app:
https://self-storage-crm.vercel.app/

Production/default branch:
`claude/storage-investment-crm-vV018`

Latest production commit as of the last synced production check:
see `git log` — the analytics integrity sprint (shared activity analytics engine, `owner_identified_at` migration, CI workflow) shipped 2026-07-23

## Read First
Before code changes, read:
1. `AGENTS.md`
2. `CODEX_ONBOARDING.md`
3. `CLAUDE.md`
4. `SPRINT_HANDOFF_INDEX.md`
5. The most relevant sprint handoff for the requested work.

The repo moved far beyond the old Sprint 7 handoff. Do not rely on stale summaries that say Sprint 7 is latest.

## Current Project Shape
Storage Hunters CRM is Brandon Greene's custom self-storage brokerage operating system. It covers owner sourcing, imports, cold calling, Call Mode, follow-up tasks, pipeline management, mailer lists, ownership/property relationship tracking, calendar sync, backups, and AI underwriting.

The live UI still says `Storage Hero` in several places. That rename gap is known and should be handled deliberately, not fixed piecemeal during unrelated work.

## Current Verification Snapshot — 2026-07-14
Local:
- `git status --short --branch` clean on `claude/storage-investment-crm-vV018`.
- Branch synced with `origin/claude/storage-investment-crm-vV018` and `origin/main`.
- `npm run build` passes.
- `npm run lint` passes.
- Vite still warns that the main chunk is larger than 500 kB.

Production read-only smoke check:
- Live URL loads.
- Dashboard, Pipeline, Clients, Database, Mailers, Analyst, and Calendar all mount.
- No captured console errors during the tab smoke check.
- Observed live shell:
  - Pipeline: `12 / 12` clients.
  - Database: `931` all contacts and `140` Master Database contacts.
  - Mailers: existing mailer lists render.
  - Calendar: July 2026 upcoming events render.
  - Dashboard top counters showed zero at check time; confirm with Brandon if that conflicts with expected logged activity.

## Latest Sprint Docs
The handoff collection is now current through Sprint 26:
- `SPRINT_HANDOFF_INDEX.md`
- `SPRINT_20_CALL_MODE_INLINE_EDITING_PWA_HANDOFF.md`
- `SPRINT_21_OWNERSHIP_PANEL_MULTI_PROPERTY_HANDOFF.md`
- `SPRINT_22_DISTANCE_SORT_AND_CALL_MODE_FIXES_HANDOFF.md`
- `SPRINT_23_MAILERS_ACTIONS_UI_POLISH_HANDOFF.md`
- `SPRINT_24_BACKUP_CALL_MODE_DATA_OPS_HANDOFF.md`
- `SPRINT_25_DASHBOARD_INTELLIGENCE_AND_OWNER_RADAR_HANDOFF.md`
- `SPRINT_26_CALL_MODE_HEADER_RESEARCH_POLISH_HANDOFF.md` is the current brief in-progress handoff for Call Mode header polish and multiple mailing address exposure.

Older sprint docs from Sprint 1-19 remain at repo root.

## Current Major Systems
- Dashboard command center:
  - `src/components/Dashboard.jsx`
  - `src/hooks/useDailyProgress.js`
  - `api/daily-activity.js`
  - `api/_dailyActivity.js`
- Database / Call Mode:
  - `src/components/Database.jsx`
  - `src/hooks/useDatabase.js`
- Universal task engine:
  - `src/hooks/useTasks.js`
  - `src/components/tasks/`
- Ownership / property workflow:
  - `src/hooks/useOwnership.js`
  - `src/components/OwnershipLinksPanel.jsx`
  - `src/lib/ownerRadar.js`
- Mailer Lists:
  - `src/components/MailerLists.jsx`
  - `src/components/MailerListPicker.jsx`
  - `src/hooks/useMailerLists.js`
- Backups / recovery:
  - `.github/workflows/supabase-backup.yml`
  - `scripts/export-supabase-json-backup.mjs`
  - `scripts/restore-supabase-json-backup.mjs`
  - `docs/BACKUP_AND_RECOVERY.md`
- Analyst:
  - `api/analyst.js`
  - `src/components/Analyst.jsx`
  - `src/data/financialModel.js`
  - `api/_financialModel.js`
  - `src/lib/excelModel.js`

## Hard Rules / Risk Areas
- There is no staging environment. Pushes to production/main deploy live.
- Use guarded QA records for any workflow that mutates Supabase. Clean them up before finishing.
- Do not touch these unless explicitly asked:
  - `api/analyst.js`
  - `api/_financialModel.js`
  - `src/data/financialModel.js`
  - `src/lib/excelModel.js`
  - `public/model-template.xlsm`
  - TractIQ OAuth / refresh-token logic
  - `app_secrets`
  - backup encryption secrets
- Vercel serverless functions in `/api` cannot reliably import from `../src`; keep copied API/shared logic in sync manually.
- Schema changes require a `.sql` file under `sql/` and live verification after Brandon runs it in Supabase.

## Data Safety
Backups are now a first-class part of the project:
- Manual in-app Backup button.
- `npm run backup:json`
- `npm run restore:json -- <backup.json>` dry run.
- `npm run restore:json -- <backup.json> --execute` to restore/upsert.
- GitHub Actions encrypted backup workflow with 90-day artifacts and permanent weekly `crm-backups` branch history.

Before risky imports, delete flows, migrations, or mass updates:
1. Run/download a backup.
2. Confirm backup artifact exists.
3. Make the change.
4. Verify against live Supabase with guarded records.

## Analytics Integrity Foundation (shipped 2026-07-23)
- `api/_activityAnalytics.js` is the single source of truth for activity event
  classification and metric aggregation. The frontend consumes it via the
  one-line re-export `src/lib/activityAnalytics.js` (do NOT fork the logic).
  Same pattern for calendar normalization: `src/lib/calendarEvents.js`.
- `sql/analytics_integrity_migration.sql` adds `contacts.owner_identified_at`
  (immutable first-identification milestone, no historical backfill) and the
  `tractiq_report` task type. **Brandon must run it in the Supabase SQL Editor
  after a backup.** Until then the app runs in graceful-fallback mode and the
  Dashboard shows a migration-needed banner; milestone data is NOT recorded.
- Tests: `tests/activityAnalytics.test.mjs` + `tests/calendarEvents.test.mjs`
  are wired into `npm test`.
- CI: `.github/workflows/ci.yml` runs lint + test + build on every push. It
  does not gate the Vercel deploy — treat a red X as an urgent signal.
- `STORAGE_HUNTERS_CRM_CHATGPT_CONTEXT.md` is the self-contained product
  briefing for outside-tool discussions; keep it current on major changes.

## Recommended Next Work
1. Production Analytics sprint: weekly/monthly activity trends, conversion
   funnel (calls → conversations → meetings → pipeline), owner-identification
   velocity, weekly digest edition of the daily activity email.
2. Code-split the large bundle (lazy-load Analyst + Calendar; main chunk is
   ~1.5 MB).
3. Finish the Storage Hero -> Storage Hunters CRM rename intentionally.
4. Polish Owners / Properties search/filtering and owner radar UX.
5. Add `lead_source_notes` if source context is needed.

## Opening Prompt Suggestion
For a future coding session, say:

`Read AGENTS.md, CODEX_ONBOARDING.md, CLAUDE.md, NEXT_SESSION_HANDOFF.md, and SPRINT_HANDOFF_INDEX.md, then work from the relevant sprint handoff for this task.`
