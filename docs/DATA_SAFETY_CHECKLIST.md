# Data Safety Checklist For New Features

Use this before shipping features that create, update, delete, import, dedupe, merge, or migrate CRM data.

## Required Before Work Starts

- Confirm the latest encrypted GitHub backup workflow has succeeded.
- For high-risk work, run the workflow manually before editing.
- Click the app `Backup` button for a quick JSON snapshot.
- Write schema changes as an idempotent `.sql` file in `sql/`.
- Identify the restore path before running any destructive operation.

## Feature Rules

- Prefer soft-delete or archive fields for core records before permanent delete.
- Permanent delete buttons need clear confirmation copy and should be scoped to one record unless explicitly designed for bulk deletion.
- Bulk imports should record source/list/import metadata whenever possible.
- Migrations should use `ADD COLUMN IF NOT EXISTS`, constraint existence checks, and backfills that are safe to run more than once.
- Do not remove old columns in the same sprint that introduces replacement columns.
- Do not overwrite non-empty user-entered fields during imports unless the UI explicitly says it will.

## Verification

- Run `npm run build`.
- Run `npm run lint` and confirm no new issues beyond the current baseline.
- For database changes, verify against live Supabase using the app's real anon key.
- Test create, update, delete/undo, and reload behavior.
- For imports, test a small sample first, then the real list.

## After Shipping

- Confirm Vercel deployed the intended commit.
- Spot-check live CRM records after deployment.
- Keep the pre-change JSON export until the change has been used successfully for a few days.

