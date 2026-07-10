# Storage Hunters CRM Backup And Recovery

This app's irreplaceable data lives in Supabase Postgres. Vercel can redeploy the app from GitHub, but the CRM records need their own protection.

## Protection Layers

1. Supabase Point-in-Time Recovery
   - Turn on PITR in the Supabase dashboard for project `rpoiphoqwgvbiyygfjrm`.
   - Supabase requires a paid plan/compute add-on for PITR. This is the best protection against a bad deploy, bad import, or accidental mass update because it can restore to a specific point in time.

2. Encrypted scheduled database dumps
   - `.github/workflows/supabase-backup.yml` runs every day at 08:17 UTC and can also be run manually.
   - It creates a full `pg_dump` custom-format backup plus a schema-only SQL file.
   - The dump is encrypted before upload. Plain database dumps are never committed to the repo.

3. Manual in-app JSON export
   - The app header has a `Backup` button.
   - This downloads a JSON safety export of CRM tables for quick pre-change snapshots.
   - This is a convenience export, not the primary disaster-recovery restore path.

## Required GitHub Secrets

Set these in GitHub repo settings under `Settings > Secrets and variables > Actions`.

- `SUPABASE_DB_URL`
  - Use the Supabase Postgres connection string for project `rpoiphoqwgvbiyygfjrm`.
  - Prefer the session pooler connection string unless a direct connection is required.
  - It should include the database password.

- `BACKUP_ENCRYPTION_PASSPHRASE`
  - Use a long random passphrase.
  - Store a copy somewhere Brandon can access outside GitHub, such as a password manager.
  - Without this passphrase, encrypted backup artifacts cannot be restored.

## Manual Local Backup

Install PostgreSQL client tools so `pg_dump` is available, then run:

```powershell
$env:SUPABASE_DB_URL="postgresql://..."
npm run backup:db
```

The files are written to `backups/`, which is ignored by git.

## Restore Drill

Run this at least once after setting up backups, and then monthly or before major data-model changes.

1. Download the latest encrypted artifact from the `Supabase backup` GitHub Action.
2. Decrypt it:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in backup-YYYYMMDDTHHMMSSZ.tar.gz.enc \
  -out backup.tar.gz \
  -pass pass:"YOUR_BACKUP_ENCRYPTION_PASSPHRASE"
```

3. Extract it:

```bash
tar -xzf backup.tar.gz
```

4. Restore into a fresh Supabase project or local Postgres database, not production:

```bash
pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname "postgresql://..." \
  backup-YYYYMMDDTHHMMSSZ/storage-hunters-crm-YYYYMMDDTHHMMSSZ.dump
```

5. Verify key counts:
   - `clients`
   - `contacts`
   - `lists`
   - `tasks`
   - `meetings`
   - `ownership_groups`
   - `properties`
   - `mailer_lists`
   - `mailer_list_members`

## Before Risky Feature Work

Use this sequence before imports, migrations, delete features, or anything that touches many records:

1. Click `Backup` in the app and keep the downloaded JSON.
2. Run the GitHub `Supabase backup` workflow manually.
3. Wait for the encrypted artifact to finish uploading.
4. Make the code/schema change.
5. Verify with real reads/writes against Supabase.
6. If anything looks wrong, stop and restore from PITR or the encrypted dump before continuing.

## Notes

- `app_secrets` is intentionally excluded from the in-app JSON export because it is service-role protected.
- Vercel environment variables are not database records. Keep a separate password-manager record for `ANTHROPIC_KEY`, `SUPABASE_SERVICE_KEY`, TractIQ credentials, and backup passphrases.
- Never commit `.dump`, `.sql` database dumps, `.tar.gz`, or decrypted backup files.

