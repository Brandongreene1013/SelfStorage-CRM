# Storage Hunters CRM Backup And Recovery

This app's irreplaceable data lives in Supabase. Vercel can redeploy the app from GitHub, but CRM records need their own protection.

## What Is Set Up Now

1. Encrypted scheduled CRM table exports
   - `.github/workflows/supabase-backup.yml` runs every day at 08:17 UTC and can also be run manually.
   - It exports the app's CRM tables to JSON, encrypts the export, and uploads it as a GitHub Actions artifact (kept 90 days).
   - Every Monday (and every manual run) it ALSO commits the encrypted backup to the `crm-backups` branch, which never expires — permanent weekly history.
   - The export fails loudly (and the workflow fails) if any table errors or if `contacts`/`lists`/`clients` come back empty — a backup that silently exported nothing is treated as a failure.
   - If the workflow fails for any reason, it automatically opens a GitHub issue titled "🚨 CRM backup FAILED" so the failure is impossible to miss.
   - This works with the access available in this repo today and does not require the Supabase database password.

2. Manual in-app JSON export
   - The app header has a `Backup` button.
   - This downloads a JSON safety export of CRM tables whenever Brandon wants a quick snapshot.

3. Local JSON backup command
   - `npm run backup:json` writes a local JSON backup to `backups/`.
   - `backups/` is ignored by git, but the project folder lives inside OneDrive, so local backups also sync to OneDrive cloud storage — a second location independent of GitHub.

4. Restore script
   - `npm run restore:json -- <backup.json>` shows a dry-run comparison of backup rows vs. live rows (writes nothing).
   - Add `--execute` to actually restore: it UPSERTS every row from the backup (overwrites existing rows with the backup version, re-creates deleted rows). It never deletes rows created after the backup.
   - Add `--tables contacts,lists` to restore only specific tables.
   - Restore order is foreign-key safe (lists before contacts, mailer lists before members, etc.).
   - Verified working 2026-07-13: full dry run matched all 12 tables; `--execute` tested against the live database.

## What Still Requires Supabase Dashboard/Billing Access

Supabase Point-in-Time Recovery is the strongest protection. Turn it on for project `rpoiphoqwgvbiyygfjrm` when the account/plan allows it. PITR is the best answer for "roll the database back to right before a bad import or bad deploy."

The codebase cannot enable PITR by itself without Supabase account billing/dashboard access.

## Backup Encryption Passphrase

The GitHub workflow uses this secret:

- `BACKUP_ENCRYPTION_PASSPHRASE`

The passphrase must also be stored somewhere Brandon controls, outside GitHub, because GitHub secrets cannot be viewed after they are saved.

## Manual Local JSON Backup

```powershell
npm run backup:json
```

The files are written to `backups/`.

## Optional Full Postgres Backup

If you later have the Supabase Postgres connection string, this command creates a full `pg_dump` custom-format backup:

```powershell
$env:SUPABASE_DB_URL="postgresql://..."
npm run backup:db
```

This is closer to a full disaster-recovery backup than JSON table export because it preserves more database-level detail. Store these files securely and never commit them.

## Restore Drill For Encrypted JSON Artifacts

1. Download the latest encrypted artifact from the `Supabase backup` GitHub Action.
2. Decrypt it:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in storage-hunters-crm-json-YYYYMMDDTHHMMSSZ.tar.gz.enc \
  -out backup.tar.gz \
  -pass pass:"YOUR_BACKUP_ENCRYPTION_PASSPHRASE"
```

3. Extract it:

```bash
tar -xzf backup.tar.gz
```

4. Inspect the JSON file inside. It contains:
   - `clients`
   - `contacts`
   - `lists`
   - `tasks`
   - `meetings`
   - `calendar_event`
   - `daily_progress`
   - `ownership_groups`
   - `properties`
   - `mailer_lists`
   - `mailer_list_members`
   - `duplicate_dismissals`

## Before Risky Feature Work

Use this sequence before imports, migrations, delete features, or anything that touches many records:

1. Click `Backup` in the app and keep the downloaded JSON.
2. Run the GitHub `Supabase backup` workflow manually.
3. Wait for the encrypted artifact to finish uploading.
4. Make the code/schema change.
5. Verify with real reads/writes against Supabase.
6. If anything looks wrong, stop and restore from PITR if enabled, or rebuild affected records from the JSON export.

## Known Gaps

1. **File attachments are NOT in the database.** Documents attached in the app are stored in the browser's IndexedDB (`useFileStorage.js`) — they exist only in that one browser on that one machine. Clearing browser data, reinstalling, or switching PCs loses them, and no backup here covers them. Migrating attachments to Supabase Storage is the fix if attached documents matter.
2. **Supabase free tier has no provider-side backups.** The JSON exports protect the data, but Supabase Pro (~$25/mo) adds daily physical backups and optional Point-in-Time Recovery — the strongest protection for "roll back to right before a bad import." Worth it for a business-critical database.
3. **GitHub disables cron schedules after 60 days without repo activity.** Regular development keeps it alive; if the repo ever goes quiet for two months, re-enable the schedule from the Actions tab.

## Notes

- `app_secrets` is intentionally excluded from JSON exports because it is service-role protected.
- Vercel environment variables are not database records. Keep a separate password-manager record for `ANTHROPIC_KEY`, `SUPABASE_SERVICE_KEY`, TractIQ credentials, and backup passphrases.
- Never commit `.dump`, `.sql` database dumps, `.tar.gz`, decrypted backup files, or backup passphrases.

