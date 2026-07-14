# Storage Hunters CRM

Custom CRM and deal-analysis operating system for Brandon Greene, a self-storage investment sales broker at Ripco Real Estate Corp.

The app supports owner sourcing, list imports, cold calling, Call Mode, follow-up tasks, pipeline management, ownership/property relationship tracking, mailer lists, calendar sync, daily production tracking, backup/recovery, and AI underwriting.

## Production
- Live app: https://self-storage-crm.vercel.app/
- GitHub repo: https://github.com/Brandongreene1013/SelfStorage-CRM
- Production branch: `claude/storage-investment-crm-vV018`
- Deployment: Vercel, auto-deploys from production branch / `main`

There is no staging environment. Do not push until build/lint and relevant live checks are done.

## Stack
- React 19
- Vite
- Tailwind 4
- Supabase
- Vercel serverless functions in `/api`
- Anthropic Messages API for the Analyst

## Production Environment
Required Vercel environment variables:
- `ANTHROPIC_KEY`
- `SUPABASE_SERVICE_KEY`
- `TRACTIQ_CLIENT_ID`
- `TRACTIQ_REFRESH_TOKEN`

Daily activity email delivery uses either direct Resend email or a webhook:
- Preferred: `RESEND_API_KEY` and `ACTIVITY_EMAIL_FROM`
- Optional recipient override: `ACTIVITY_REVIEW_EMAIL`
- Legacy fallback: `ACTIVITY_EMAIL_WEBHOOK_URL`

Setup helper:
```powershell
npm run configure:daily-email
vercel --prod
```

After deployment, send a safe live test email:
```powershell
Invoke-WebRequest -UseBasicParsing "https://self-storage-crm.vercel.app/api/daily-activity?mode=email-test"
```

## Start Here
For any coding session, read these first:
1. `AGENTS.md`
2. `CODEX_ONBOARDING.md`
3. `CLAUDE.md`
4. `NEXT_SESSION_HANDOFF.md`
5. `SPRINT_HANDOFF_INDEX.md`

The sprint handoff index is the current map of project history. Older summaries that stop at Sprint 7 or Sprint 2 are stale.

## Local Development
```powershell
npm install
npm run dev
```

Vite runs the frontend only. For full local API behavior, use Vercel dev with the required production env vars.

## Verification
```powershell
npm run build
npm run lint
```

Current known build status as of 2026-07-14:
- Build passes.
- Lint passes.
- Vite still warns that the main bundle is larger than 500 kB.

## Protected Areas
Do not touch these without an explicit task:
- `api/analyst.js`
- `api/_financialModel.js`
- `src/data/financialModel.js`
- `src/lib/excelModel.js`
- `public/model-template.xlsm`
- TractIQ OAuth / refresh-token flow
- `app_secrets`
- backup encryption secrets

## Data Safety
CRM data lives in Supabase and is business-critical.

Backup tools:
```powershell
npm run backup:json
npm run restore:json -- <backup.json>
npm run restore:json -- <backup.json> --execute
```

See `docs/BACKUP_AND_RECOVERY.md` and `docs/DATA_SAFETY_CHECKLIST.md`.

## Current Documentation Map
- `NEXT_SESSION_HANDOFF.md` — current short handoff for the next chat.
- `SPRINT_HANDOFF_INDEX.md` — complete sprint history map.
- `SPRINT_1...SPRINT_25...` — individual sprint handoffs.
- `sql/` — migrations Brandon must run manually in Supabase when schema changes are needed.

## Branding Note
The product is mid-rename from `Storage Hero` to `Storage Hunters CRM`. Some live UI and code strings still say `Storage Hero`; handle that as a deliberate rename sprint, not incidental cleanup.
