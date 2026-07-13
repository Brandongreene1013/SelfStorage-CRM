# Storage Hunters CRM — Project Context (for Codex)

Custom CRM + deal-analysis tool for **Brandon Greene**, a self-storage investment sales broker at **Ripco Real Estate Corp**. Used daily as his operating system: sourcing facility owners → cold calling → building relationships → exclusive listings → brokering the sale. Product is mid-rename from "Storage Hero" to "Storage Hunters CRM" — some UI/prompt strings still say "Storage Hero," that's known and pending, not a bug to fix incidentally.

**Before doing anything else, also read** `CODEX_ONBOARDING.md`, `SPRINT_1_UI_SYSTEM_HANDOFF.md`, and `SPRINT_2_TASK_ENGINE_HANDOFF.md` in this same folder — they cover the two most recent sprints in detail and explain design decisions this file only summarizes.

## Stack & Deployment
- **React 19 + Vite + Tailwind 4**, backend on **Supabase**, deployed on **Vercel** (Hobby plan).
- **Production branch:** `claude/storage-investment-crm-vV018` (real branch name — verify with `git branch -a` before assuming anything else; Vercel auto-deploys on push to this branch, kept in sync with `main`).
- **Live URL:** https://self-storage-crm.vercel.app
- **Repo:** https://github.com/Brandongreene1013/SelfStorage-CRM
- **There is no staging environment.** Every push to the production branch (or `main`) goes live immediately. Only push when work is done and verified (`npm run build` clean, `npm run lint` not worse than the current baseline).
- Serverless functions live in `/api` (Node, ESM, called via `fetch`). They can't reliably import from `../src`, so shared code used by an API function is copied into `/api` (e.g. `api/_financialModel.js` mirrors `src/data/financialModel.js` — keep both in sync by hand if you touch the underwriting math).

## Conventions
- Commit + push only when work is done and verified.
- End commit messages with `Co-Authored-By: <your actual model name> <noreply@anthropic.com>` — match whatever the real git log already uses; check `git log` rather than assuming.
- Supabase tables use permissive RLS for app data (clients, contacts, lists, meetings, tasks, etc. — the anon/publishable key has full access). The exception: `app_secrets` has RLS that denies the anon/public key — only the service-role key (server-side) can read it. It holds the rotating TractIQ OAuth refresh token.
- Tailwind dark theme: slate-900/950 backgrounds, amber/yellow accents.
- **You do not have direct SQL/DDL execution access from a coding session.** Any schema change needs a `.sql` file checked into `sql/` with instructions for Brandon to run it himself in the Supabase SQL Editor, and should be verified against the live database (via a throwaway script using the anon key from `src/lib/supabase.js`) rather than trusted on "Success" alone — this project has already hit two surprise issues (an RLS policy with no permissive rule, a leftover NOT NULL constraint) that weren't obvious from the migration SQL itself. See `sql/tasks_table_migration.sql`'s comments for the exact history.

## Main views (nav tabs)
Dashboard · Pipeline (10-stage kanban) · Clients · Database (cold-calling engine w/ Master Database list) · **Analyst** (AI underwriting) · Calendar (Outlook sync).

## The Analyst (AI underwriting) — key feature, be careful here
- `api/analyst.js`: Claude **Opus** via raw `fetch` to the Anthropic Messages API (the real model constant is `claude-opus-4-8` — check the file directly rather than trusting any cheat-sheet's paraphrase of it). `export const maxDuration = 60`.
- Deterministic underwriting engine: `src/data/financialModel.js` (canonical) mirrored to `api/_financialModel.js`. Encodes the team's model: EGI → NOI → 3-scenario valuation → cap rate / DSCR / cash-on-cash / amortization / 5-year. The `underwrite` tool does all math; the model never computes by hand.
- **Expense estimation:** when expenses aren't itemized, back-solves total = `expenseRatioTarget` × EGI and itemizes across 12 standard lines via `EXPENSE_PROPORTIONS`.
- **Excel export:** `public/model-template.xlsm` is the team's real signature workbook (has VBA, logo, drawings). `src/lib/excelModel.js` fills it via **`fflate`** surgical zip/XML editing — NOT a SheetJS round-trip (SheetJS silently strips `xl/drawings/` + `xl/media/`, which is why early exports "looked nothing like" the real model — learned the hard way once, don't reintroduce it). Sheet map: `sheet1.xml`=Rent Roll, `sheet2.xml`=Financial Model, `sheet3.xml`=5-Year Model (formulas only), `sheet4.xml`=Amortization (left untouched — financing is set by hand in Excel so VBA-driven debt options stay editable). `scripts/build-model-template.mjs` rebuilds the template from the source .xlsm if it's ever lost.
- **Analyst document intelligence:** the system prompt in `api/analyst.js` has detailed, hard-won rules for reading real-world T-12 P&Ls (QuickBooks COGS/Gross-Profit/Expenses layout, "Total for…" subtotal traps, mortgage-interest exclusion, no vacancy double-count on actual-collected income, $0-payroll/reserves normalization) and messy rent rolls ($0 comp units, balance-as-rent outliers, partial rolls, roll-vs-T-12 reconciliation). Tuned against real broker documents — don't touch this prompt for unrelated feature work.
- **Live TractIQ market data:** via Anthropic Messages API MCP connector, 14 tools (facility search, pricing trends, occupancy, market summary, CMBS, demographics, geocode). Only used when the user asks for market data.

## Universal Task Engine (Sprint 2, just shipped)
`src/hooks/useTasks.js` + `src/components/tasks/` power task/next-action tracking on Dashboard, Clients, Database, and Pipeline, backed by a Supabase `tasks` table. **It deliberately coexists with an older single-slot "Next Action" system** (`nextActionType/Date/Note` fields, `ActionModal.jsx`/`ActionLog.jsx`) that still drives Pipeline drag-and-drop and Database's call-outcome flow — the two were not merged yet (see `SPRINT_2_TASK_ENGINE_HANDOFF.md` Section 13/14 for why and what's recommended next). Don't assume one replaced the other.

## Required Vercel env vars (Production)
- `ANTHROPIC_KEY` — Anthropic API key (pay-as-you-go; account must have credits).
- `SUPABASE_SERVICE_KEY` — Supabase service-role JWT (reads/writes the locked-down `app_secrets` table).
- `TRACTIQ_CLIENT_ID`, `TRACTIQ_REFRESH_TOKEN` — fallback seed; Supabase `app_secrets` is the source of truth and self-heals on token rotation.

## TractIQ re-auth (if the token ever fully breaks)
Run `node scripts/tractiq-auth.mjs` (one-time browser OAuth), then seed `tractiq_client_id` + `tractiq_refresh_token` into Supabase `app_secrets`.

## Local dev
- `npm install` then `npm run dev` (frontend only; `/api` functions don't run under Vite). For full local API, use `vercel dev` with the env vars above. Most iteration: edit → push → Vercel builds.
