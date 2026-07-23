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

The Storage Hero -> Storage Hunters rename shipped 2026-07-23 (UI header, page title, PWA manifest, AI prompts, code comments). The `storageHero.*` localStorage keys were deliberately kept — renaming them would wipe saved call-queue positions, call sessions, location anchors, and duplicate dismissals.

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
  `tractiq_report` task type. **Already run against live Supabase — verified
  2026-07-23** (column probe + guarded `tractiq_report` task insert/delete).
  If it ever needs re-running it is idempotent; the app degrades gracefully
  and shows a Dashboard banner when the column is missing.
- Tests: `tests/activityAnalytics.test.mjs` + `tests/calendarEvents.test.mjs`
  are wired into `npm test`.
- CI: `.github/workflows/ci.yml` runs lint + test + build on every push. It
  does not gate the Vercel deploy — treat a red X as an urgent signal.
- `STORAGE_HUNTERS_CRM_CHATGPT_CONTEXT.md` is the self-contained product
  briefing for outside-tool discussions; keep it current on major changes.

## Shipped 2026-07-23 (three-sprint session)
1. Code-splitting: Analyst/Calendar/MailerLists are React.lazy; xlsx loads
   on demand. Main chunk 1,500 kB -> 811 kB (gzip 216 kB).
2. Production Analytics: weeklyActivityTrend / buildConversionFunnel /
   buildWeeklyDigest in the shared engine; Dashboard "Production Trends"
   section (8-week chart + funnel); Friday 5 PM ET weekly digest email via
   the daily-activity API (modes weekly-digest / weekly-digest-due /
   weekly-digest-preview) and the existing GitHub cron.
3. Owners / Properties: search box (matches groups, linked properties, and
   contacts) + relationship filter in the Database ownership tab.
4. `lead_source_notes`: Source Notes field on contact detail, update-only
   with graceful fallback. Migration run and verified live 2026-07-23
   (guarded write/revert round-trip).

## Schema status — fully current as of 2026-07-23
Every migration under sql/ is applied to live Supabase, verified by a full
column sweep against every table the code references (contacts 40 cols incl.
owner_identified_at + lead_source_notes; clients incl. deal-value, age, and
contact_id; properties, ownership_groups, calendar_event, tasks, meetings,
mailer_lists/members, daily_* tables, duplicate_dismissals, lists). The
clients.contact_id FK was round-trip tested with a guarded link/unlink.
No pending migrations.

## Owner radar UX polish (shipped 2026-07-23)
- The live related-owner surface is the Call Mode "Possible Related Record"
  panel (`buildRelatedOwnerCandidates` in `src/lib/ownerRadar.js`, rendered in
  `CallQueue` in `Database.jsx`). Its action links the current facility as a
  property under a Master owner — it does NOT merge or delete.
- Candidates now carry structured `signals` + `confidence` (High = exact
  email/phone match, Medium = name-only) + a stable `pairKey`. Panel shows a
  confidence badge, per-signal chips, an explicit "nothing is merged or
  deleted" outcome line, and a "Not the same owner" dismiss button.
- Dismissals reuse the shared `duplicate_dismissals` store (Supabase, with
  localStorage fallback) via the same pair-key format as the Duplicate Review
  center, so a dismissal in either place is honored in both. `pairKey` MUST be
  passed through from the candidate object — it lives on the result, not the
  contact (a destructuring miss there silently breaks the Supabase write).
- Removed the dead, commented-out legacy `OwnedPropertiesEditor` +
  `SameOwnerRadar` block (referenced undefined `findSameOwnerMatches`/
  `keepScore`; never rendered). `findSameOwnerMatches` does not exist anywhere.
- The real merge/keep-signal surface is the **Duplicate Review center**
  (`DuplicateReview.jsx` / `duplicateReview.js`), which already shows keep
  signals and a merge plan. It was not changed this sprint.
- Tests: confidence/signals/pairKey/dismissal-filtering/ranking in
  `tests/ownerRadar.test.mjs`.

## Matching resilience to junk contact info (shipped 2026-07-23)
- `buildSharedContactInfoIndex(contacts)` in `src/lib/ownerRadar.js` finds
  emails/phones shared across `SHARED_CONTACT_MIN_OWNERS` (3) distinct owners
  (by ownership group or normalized name, not raw rows). `isSharedEmail` /
  `isSharedPhone` helpers. It is imported by `duplicateReview.js`, so that file
  now imports from ownerRadar with an explicit `.js` extension (Node ESM needs
  it for the test).
- `buildRelatedOwnerCandidates`: a shared email/phone signal is non-exact (can't
  drive High), a candidate whose ONLY evidence is shared is dropped, and results
  carry a `sharedSignal` flag. Genuine one-to-one matches still read High.
- `findDuplicateGroups`: accepts/computes `sharedContactInfo`; `candidatePairs`
  skips email/phone buckets for shared values and `pairReasons` ignores shared
  email/phone, so junk info can't drive a duplicate cluster.
- `Database.jsx` memoizes the index once and threads it into both matchers; the
  Call Mode panel styles shared chips amber ("· shared") with a verify note.
- Tests: `tests/ownerRadar.test.mjs` (shared demote/drop) and the new
  `tests/duplicateReview.test.mjs`, both wired into `npm test`.
- Verified live: the Cleburne record that showed 4 "Strong match" owners on one
  shared email now shows 1 genuine Strong match (Carmon Eason, real phone+name)
  with the shared email flagged.

## Error boundaries (shipped 2026-07-23)
- `src/components/ErrorBoundary.jsx` catches render/lifecycle errors and shows a
  dark-theme recovery panel (Try again + Reload app). `main.jsx` wraps `<App>`
  (catastrophic net); `App.jsx` wraps the main view area with a boundary
  `key={view}` so a crash in one tab keeps the nav alive and recovers on tab
  switch. Verified with a temporary throw probe (removed).
- The previously-suspected "duplicate React key" warning was NOT reproducible in
  current code across every view with real data — it was stale console-buffer
  noise from an old session. No fix needed; removed from the backlog.

## Silent write-failure audit (in progress)
- FIXED 2026-07-23: Call Mode `saveNotes()` reported failed saves as "Saved" and
  advanced past them, losing call notes. Now returns its result, shows a red
  "Save failed" state, and blocks next/prev + outcome navigation on failure.
- `updateContact` returns `{ ok: true }` | `{ error: message }`; the pattern to
  audit elsewhere is call sites that `await` a mutation and ignore that result.
- FIXED 2026-07-23: `ContactDetailModal` note save was fire-and-forget on blur
  and "Save & Close". Now awaits the result, shows the same red error state, and
  Save & Close only closes on success (research-note append surfaces errors too).
- FIXED 2026-07-23: Meeting save. `Calendar.handleSave` ignored the result and
  always closed the modal (silent loss); now closes only on success and
  `MeetingModal` shows an error banner. This exposed a real latent bug —
  `meetingToDb` sent `''` (the "None" client option) to the uuid `client_id`
  column via `?? null`, so EVERY client-less meeting failed silently. Fixed to
  `|| null`. Both verified live.
- AUDITED clean: `TaskModal` already awaits, checks `result.error`, and only
  closes on success.
- STILL TO AUDIT: `useCRM` client add/update/deal-value and any other mutation
  call sites for the same ignore-the-result pattern. Consider exporting
  `meetingToDb` to unit-test the client_id normalization.

## Robustness backlog (hardening toward a foolproof CRM)
1. Finish the silent write-failure audit (see above).
2. Owner-identification velocity view once enough milestone data accrues.
3. Split the Calendar chunk further (msal-browser is ~230 kB).
4. "Flagged bad email" cleanup view so Brandon can fix placeholder/scraped
   emails at the source (builds on the shared-contact-info index).

## Opening Prompt Suggestion
For a future coding session, say:

`Read AGENTS.md, CODEX_ONBOARDING.md, CLAUDE.md, NEXT_SESSION_HANDOFF.md, and SPRINT_HANDOFF_INDEX.md, then work from the relevant sprint handoff for this task.`
