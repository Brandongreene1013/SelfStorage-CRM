# Storage Hunters CRM Backup And Recovery

This app's irreplaceable data lives in Supabase. Vercel can redeploy the app from GitHub, but CRM records need their own protection.

## What Is Set Up Now

1. Encrypted scheduled CRM table exports
   - `.github/workflows/supabase-backup.yml` runs every day at 08:17 UTC and can also be run manually.
   - It exports the app's CRM tables to JSON.
   - It encrypts the export before uploading it as a GitHub Actions artifact.
   - This works with the access available in this repo today and does not require the Supabase database password.

2. Manual in-app JSON export
   - The app header has a `Backup` button.
   - This downloads a JSON safety export of CRM tables whenever Brandon wants a quick snapshot.

3. Local JSON backup command
   - `npm run backup:json` writes a local JSON backup to `backups/`.
   - `backups/` is ignored by git.

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

## Notes

- `app_secrets` is intentionally excluded from JSON exports because it is service-role protected.
- Vercel environment variables are not database records. Keep a separate password-manager record for `ANTHROPIC_KEY`, `SUPABASE_SERVICE_KEY`, TractIQ credentials, and backup passphrases.
- Never commit `.dump`, `.sql` database dumps, `.tar.gz`, decrypted backup files, or backup passphrases.

