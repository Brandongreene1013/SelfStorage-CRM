# Sprint 25: Dashboard Intelligence, Owner Radar, and Production Command Center

## 1. Objective
Upgrade the CRM's command center with daily/weekly production intelligence, owner/property radar, commission visibility, and a cleaner Dashboard layout that reflects Brandon's actual operating rhythm.

## 2. Commit Range
- `d496972` — Return to the exact card when exiting Call Mode
- `c3c48cb` — Save LinkedIn profile links on contacts
- `f8edba7` — Add same-owner property radar
- `77d0b6c` — Add weekly manual production scorecard
- `0dc2be2` — Add daily activity intelligence
- `fe6dddb` — Add commission counter and quiet ownership controls
- `04e4f5d` — Redesign dashboard command center

Backup hardening and file-attachment removal also landed on 2026-07-13, but they are documented in Sprint 24 because they are data-safety work.

## 3. Files Modified / Created
Modified highlights:
- `AGENTS.md`
- `.github/workflows/daily-activity-intelligence.yml`
- `api/_dailyActivity.js`
- `api/daily-activity.js`
- `api/email-log-ingest.js`
- `api/lookup.js`
- `eslint.config.js`
- `src/App.jsx`
- `src/components/Dashboard.jsx`
- `src/components/Database.jsx`
- `src/components/Calendar.jsx`
- `src/components/ClientModal.jsx`
- `src/components/OwnershipLinksPanel.jsx`
- `src/hooks/useCRM.js`
- `src/hooks/useDatabase.js`
- `src/hooks/useDailyProgress.js`
- `src/hooks/useMeetings.js`
- `src/hooks/useOutlookCalendar.js`
- `src/lib/ownerRadar.js`
- `src/lib/dealValue.js`
- `src/lib/researchLinks.js`

Created:
- `sql/contact_linkedin_url_migration.sql`
- `sql/contact_owned_properties_migration.sql`
- `sql/daily_progress_scorecard_migration.sql`
- `sql/daily_activity_intelligence_migration.sql`
- `SPRINT_25_DASHBOARD_INTELLIGENCE_AND_OWNER_RADAR_HANDOFF.md`

## 4. Behavior Changed
- Dashboard was redesigned into the current production command center.
- Daily Activity panel tracks manual production inputs and autosaved daily state.
- Weekly Production scorecard summarizes calls, voicemails, conversations, DB adds, BOVs, identified owners, owners worked, and actions.
- Daily activity intelligence API/workflow was added.
- Pipeline Value / projected gross commission counters were added.
- Owner/property radar detects same-owner property patterns.
- Contacts can store LinkedIn profile URLs.
- Ownership controls were made quieter in high-traffic UI surfaces.
- Call Mode returns to the exact card when exiting.

## 5. SQL / Schema Notes
Created migrations:
- `sql/contact_linkedin_url_migration.sql`
- `sql/contact_owned_properties_migration.sql`
- `sql/daily_progress_scorecard_migration.sql`
- `sql/daily_activity_intelligence_migration.sql`

Fresh environments need these run before the related fields/tables persist. Verify each with guarded Supabase reads/writes after running.

## 6. Production Status Checked 2026-07-14
Read-only production smoke check passed at:
- `https://self-storage-crm.vercel.app/`

Tabs mounted without captured console errors:
- Dashboard
- Pipeline
- Clients
- Database
- Mailers
- Analyst
- Calendar

Observed live counts/surfaces:
- Pipeline: `12 / 12` clients.
- Database: `931` all contacts; `140` Master Database contacts.
- Mailers: existing `Athens GA Mailer List` and `Texas List`.
- Calendar: July 2026 rendered with upcoming meetings.
- Dashboard top counters showed zero for current-day callbacks/activity at the time of check, while other data surfaces loaded normally.

Local verification:
- `npm run build` passed.
- `npm run lint` passed cleanly in the current checkout.
- Existing Vite large chunk warning remains.

## 7. Why It Matters
The Dashboard is now much closer to a daily brokerage cockpit: what to work, what activity happened, what production looks like this week, and what potential commission is sitting in the pipeline. The owner radar and LinkedIn field also move Database toward relationship intelligence rather than simple call-list storage.

## 8. Known Issues / Carry Forward
- The live UI still says `Storage Hero` in visible branding and page title. The Storage Hunters CRM rename remains incomplete.
- Dashboard current-day counters showing zero may be legitimate for the day, but should be checked against Brandon's expectations if he logged work.
- Daily activity intelligence introduces serverless/API/workflow surface area; keep backup/export table lists in sync if new persisted tables are added.
- Same-owner radar depends on data quality in owner/entity/property fields.

## 9. Protected Areas Not Touched
- Analyst underwriting prompt and deterministic financial model
- Excel export template/fill logic
- TractIQ OAuth / refresh-token storage
- Service-role-only `app_secrets`

## 10. Recommended Sprint 26 Focus
- Finish the Storage Hero -> Storage Hunters CRM rename intentionally.
- Confirm Dashboard daily counters against real logged activity.
- Add search/filter polish for Owners / Properties and owner radar surfaces.
- Add `lead_source_notes` if relationship-source detail is becoming important.
- Consider code-splitting the app bundle once feature pressure slows down.
