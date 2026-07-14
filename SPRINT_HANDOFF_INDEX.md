# Storage Hunters CRM Sprint Handoff Index

This file is the map for future Codex/Claude sessions. Read `AGENTS.md`, `CODEX_ONBOARDING.md`, and `CLAUDE.md` first, then use this index to find the relevant sprint handoff.

## Current Production Status
- Production branch: `claude/storage-investment-crm-vV018`
- Live URL: https://self-storage-crm.vercel.app/
- Latest documented production commit before Sprint 26 work: `04e4f5d` — Redesign dashboard command center
- Current local verification on 2026-07-14:
  - `npm run build` passes.
  - `npm run lint` passes.
  - Production read-only smoke check across Dashboard, Pipeline, Clients, Database, Mailers, Analyst, Calendar passed without captured console errors.

## Handoff Files In Order
- `SPRINT_1_UI_SYSTEM_HANDOFF.md` — Professional UI primitives and modal/card/empty-state consistency.
- `SPRINT_2_TASK_ENGINE_HANDOFF.md` — Universal task engine backed by Supabase `tasks`.
- `SPRINT_3_NEXT_ACTION_CONSOLIDATION_HANDOFF.md` — Consolidated next actions into universal tasks.
- `SPRINT_4_CALL_MODE_HANDOFF.md` — Original broker Call Mode workspace.
- `SPRINT_5_DASHBOARD_COMMAND_CENTER_HANDOFF.md` — First Dashboard command center.
- `SPRINT_6_CALL_MODE_QUEUE_PICKER_HANDOFF.md` — Guided Call Mode queue picker.
- `SPRINT_7_SAFE_QA_CALL_MODE_POLISH_HANDOFF.md` — Safe QA seed/cleanup tooling and Call Mode polish.
- `SPRINT_8_DATABASE_SCALE_CALL_SPEED_HANDOFF.md` — Database scale and call-speed improvements.
- `SPRINT_8_5_ALTERNATE_PHONES_LIVE_QA_HANDOFF.md` — Alternate phone live QA.
- `SPRINT_9_SMART_IMPORT_HANDOFF.md` — Smart import / owner database intelligence.
- `SPRINT_10_IMPORT_HISTORY_SOURCE_MERGE_HANDOFF.md` — Import history/source merge.
- `SPRINT_11_DUPLICATE_REVIEW_CENTER_HANDOFF.md` — Duplicate Review center.
- `SPRINT_12_DUPLICATE_POLISH_OWNER_RESEARCH_HANDOFF.md` — Duplicate polish and owner research hub.
- `SPRINT_13_DEDUPE_CLOSEOUT_CALL_MODE_HANDOFF.md` — Dedupe closeout and persistent Call Mode sessions.
- `SPRINT_14_CALLBACK_COMMAND_CENTER_HANDOFF.md` — Callback command center.
- `SPRINT_15_LIVE_QA_DASHBOARD_FIX_HANDOFF.md` — Live QA dashboard fixes.
- `SPRINT_16_DATABASE_EXPANSION_FOUNDATION_HANDOFF.md` — Relationship type / owner entity foundation.
- `SPRINT_17_OWNERSHIP_PROPERTY_FOUNDATION_HANDOFF.md` — Ownership group / property schema foundation.
- `SPRINT_18_RELATIONSHIP_SOURCE_PROPERTY_UI_HANDOFF.md` — Lead source and first property UI layer.
- `SPRINT_19_OWNERSHIP_PROPERTY_WORKFLOW_HANDOFF.md` — Owners / Properties Database view and future callbacks.
- `SPRINT_20_CALL_MODE_INLINE_EDITING_PWA_HANDOFF.md` — Inline Call Mode editing and PWA foundation.
- `SPRINT_21_OWNERSHIP_PANEL_MULTI_PROPERTY_HANDOFF.md` — Multi-property ownership panel workflow.
- `SPRINT_22_DISTANCE_SORT_AND_CALL_MODE_FIXES_HANDOFF.md` — Distance sorting and Call Mode closeout fixes.
- `SPRINT_23_MAILERS_ACTIONS_UI_POLISH_HANDOFF.md` — Mailer Lists, unified action modal, UI/PWA polish.
- `SPRINT_24_BACKUP_CALL_MODE_DATA_OPS_HANDOFF.md` — Backups, restore tooling, scoped deletes, deal value, multiple mailing addresses.
- `SPRINT_25_DASHBOARD_INTELLIGENCE_AND_OWNER_RADAR_HANDOFF.md` — Daily/weekly production intelligence, owner radar, commission counter, current command center.
- `SPRINT_26_CALL_MODE_HEADER_RESEARCH_POLISH_HANDOFF.md` — Brief Call Mode polish: address/copy/Whitepages at top, duplicate ownership lower, multiple mailing addresses exposed in Call Mode/contact creation.

## Current Major Systems
- Dashboard command center: `src/components/Dashboard.jsx`, `src/hooks/useDailyProgress.js`, `api/daily-activity.js`, `api/_dailyActivity.js`.
- Database / Call Mode: `src/components/Database.jsx`, `src/hooks/useDatabase.js`.
- Universal tasks: `src/hooks/useTasks.js`, `src/components/tasks/`.
- Owners / Properties: `src/hooks/useOwnership.js`, `src/components/OwnershipLinksPanel.jsx`, ownership/property SQL files.
- Mailers: `src/components/MailerLists.jsx`, `src/components/MailerListPicker.jsx`, `src/hooks/useMailerLists.js`.
- Backups: `.github/workflows/supabase-backup.yml`, `scripts/export-supabase-json-backup.mjs`, `scripts/restore-supabase-json-backup.mjs`, `docs/BACKUP_AND_RECOVERY.md`.
- Analyst: `api/analyst.js`, `src/components/Analyst.jsx`, `src/data/financialModel.js`, `api/_financialModel.js`, `src/lib/excelModel.js`.

## Current Recurring Warnings
- There is no staging environment. Pushing production branch deploys live.
- Use guarded QA data for any workflow that mutates Supabase.
- Do not touch Analyst prompt/math/export or TractIQ auth unless the sprint explicitly targets them.
- Keep `/api` copies of shared logic in sync by hand when applicable.
- Any schema change needs a SQL file in `sql/` and live verification after Brandon runs it.
- The live app still says `Storage Hero`; the Storage Hunters CRM rename is intentionally still incomplete.
- The bundle still emits Vite's large chunk warning; code-splitting has not been done.
- Daily Activity email delivery requires Vercel email config: preferred `RESEND_API_KEY` + `ACTIVITY_EMAIL_FROM`, optional `ACTIVITY_REVIEW_EMAIL`, or legacy `ACTIVITY_EMAIL_WEBHOOK_URL`. Run `npm run configure:daily-email`, redeploy with `vercel --prod`, then test `/api/daily-activity?mode=email-test`.

## Recommended Next Work
1. Finish the Storage Hero -> Storage Hunters CRM rename as a deliberate branding sprint.
2. Verify Dashboard current-day counters against Brandon's actual logged activity.
3. Polish Owners / Properties search/filtering and owner radar UX.
4. Add `lead_source_notes` if source quality/context matters in daily workflow.
5. Consider bundle code-splitting after feature velocity slows.
