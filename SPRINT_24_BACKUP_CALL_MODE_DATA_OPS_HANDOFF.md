# Sprint 24: Data Safety, Call Mode Operations, and Deal Value

## 1. Objective
Protect the CRM's production data, reduce risk around destructive database operations, and keep improving Call Mode / deal tracking workflows.

## 2. Commit Range
- `fa60b16` — Unify attack list buttons
- `916452b` — Add client deal value projections
- `929eb30` — Support multiple mailing addresses
- `b9c11e4` — Auto-save worked calls to Master Database
- `9a862a3` — Restore copyable addresses in call mode
- `1fe375e` — Make call mode email editable
- `e572f78` — Put call mode address actions inline
- `b767e08` — Add CRM backup and recovery safeguards
- `5d633ef` — Enable encrypted JSON backup automation
- `6adf562` — Delete database lists with scoped contact purge
- `ec2e2c3` — Harden CRM backups: loud failures, 90-day + permanent retention, restore script
- `ca2c0c9` — Remove the browser-only file attachment feature
- `8617bb8` — Update recovery doc: attachment gap closed by feature removal

Note: `d496972` is documented with Sprint 25 because it landed on 2026-07-13 and belongs to the final Call Mode continuity polish.

## 3. Files Modified / Created
Modified highlights:
- `.github/workflows/supabase-backup.yml`
- `.gitignore`
- `docs/BACKUP_AND_RECOVERY.md`
- `docs/DATA_SAFETY_CHECKLIST.md`
- `package.json`
- `src/App.jsx`
- `src/components/Database.jsx`
- `src/components/ClientCard.jsx`
- `src/components/ClientModal.jsx`
- `src/hooks/useCRM.js`
- `src/hooks/useDatabase.js`
- `src/hooks/useMailerLists.js`

Created:
- `scripts/backup-database.mjs`
- `scripts/export-supabase-json-backup.mjs`
- `scripts/restore-supabase-json-backup.mjs`
- `src/lib/crmBackupExport.js`
- `src/lib/dealValue.js`
- `src/lib/mailingAddresses.js`
- `src/components/MailingAddressList.jsx`
- `sql/client_deal_value_migration.sql`
- `sql/multiple_mailing_addresses_migration.sql`
- `SPRINT_24_BACKUP_CALL_MODE_DATA_OPS_HANDOFF.md`

Removed:
- `src/hooks/useFileStorage.js`
- Browser-only file attachment UI/logic from client surfaces

## 4. Behavior Changed
- Added manual in-app JSON backup download.
- Added local JSON backup and restore scripts.
- Added encrypted GitHub Actions backup automation.
- Hardened backup workflow so empty critical tables or export errors fail loudly.
- Added permanent weekly backup commits to `crm-backups` branch.
- Added restore script with dry-run and `--execute` modes.
- Removed browser-only file attachments because they lived outside Supabase backup coverage.
- Added client deal value / commission projection support.
- Added multiple mailing address support.
- Auto-saved worked Call Mode contacts into Master Database.
- Made Call Mode email editable.
- Restored and improved copyable Call Mode addresses.
- Put Call Mode address actions inline.
- Made database list deletion purge only the selected list's scoped contacts.

## 5. Data / Safety Notes
Backup coverage now includes the core Supabase CRM tables exported to JSON. `app_secrets` remains intentionally excluded.

Important commands:
```powershell
npm run backup:json
npm run restore:json -- <backup.json>
npm run restore:json -- <backup.json> --execute
```

Destructive or broad data changes should now start with:
1. In-app Backup button.
2. Manual GitHub backup workflow run.
3. Confirm artifact/backup exists.
4. Make the change.
5. Verify with real Supabase reads/writes.

## 6. SQL / Schema Notes
Created migrations:
- `sql/client_deal_value_migration.sql`
- `sql/multiple_mailing_addresses_migration.sql`

Fresh environments need these migrations for deal value projections and multiple mailing addresses.

## 7. Why It Matters
This project now contains real business-critical CRM data. The backup and restore work is a major operational milestone: the app can be rebuilt from GitHub, but the customer/contact/task/database records need independent protection.

Removing browser-only attachments was the right tradeoff. A feature that stores unbacked business files in IndexedDB is worse than no feature because it creates false confidence.

## 8. Known Issues / Carry Forward
- Supabase provider-level Point-in-Time Recovery still requires Supabase billing/dashboard access.
- GitHub scheduled workflows can be disabled after long repo inactivity.
- Restore script does not delete rows created after the backup; it upserts backup rows.
- Deal value projections depend on entered sale value / fee data; missing fees remain a data-quality issue.

## 9. Protected Areas Not Touched
- Analyst underwriting math / prompt
- TractIQ OAuth token refresh flow
- Service-role-only `app_secrets` table

## 10. Recommended Follow-Up
- Keep backup docs current whenever tables are added.
- Run periodic restore drills.
- Consider Supabase Pro/PITR for real point-in-time rollback.
- Add clearer in-app cues around which contacts were auto-saved to Master Database from Call Mode.
