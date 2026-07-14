# Storage Hero CRM — Project Context

Custom CRM + deal-analysis tool for **Brandon Greene**, a self-storage investment sales broker at **Ripco Real Estate Corp**. Used daily as his operating system: sourcing facility owners → cold calling → building relationships → exclusive listings → brokering the sale.

## Stack & Deployment
- **React 19 + Vite + Tailwind 4**, backend on **Supabase**, deployed on **Vercel** (Hobby plan).
- **Production branch:** `claude/storage-investment-crm-vV018` (Vercel auto-deploys on push to this branch).
- **Live URL:** https://self-storage-crm.vercel.app
- **Repo:** https://github.com/Brandongreene1013/SelfStorage-CRM
- Serverless functions live in `/api` (Node, ESM, called via `fetch`). They can't reliably import from `../src`, so shared code used by an API function is copied into `/api` (e.g. `api/_financialModel.js`).

## Conventions
- Commit + push only when work is done; production branch deploys automatically.
- End commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Supabase tables use permissive RLS for app data (clients, contacts, lists, meetings, prospects, etc.). The exception: `app_secrets` has RLS that denies the anon/public key — only the service-role key (server-side) can read it. It holds the rotating TractIQ OAuth refresh token.
- Tailwind dark theme: slate-900/950 backgrounds, amber/yellow accents.

## Main views (nav tabs)
Dashboard · Pipeline (kanban) · Clients · Database (cold-calling engine w/ Master Database list) · **Analyst** (AI underwriting) · Calendar (Outlook sync).

## The Analyst (AI underwriting) — key feature
- `api/analyst.js`: Claude **Opus 4.8** (`claude-opus-4-8`) via raw `fetch`. `export const maxDuration = 60`.
- Deterministic underwriting engine: `src/data/financialModel.js` (canonical) mirrored to `api/_financialModel.js`. Encodes the team's model: EGI → NOI → 3-scenario valuation → cap rate / DSCR / cash-on-cash / amortization / 5-year. The `underwrite` tool does all math; Claude never computes by hand.
- **Expense estimation:** when expenses aren't itemized, back-solves total = `expenseRatioTarget` × EGI and itemizes across 12 standard lines via `EXPENSE_PROPORTIONS`.
- **Excel export:** `public/model-template.xlsm` is the team's real signature workbook (has VBA, logo, drawings). `src/lib/excelModel.js` fills it via **`fflate`** surgical zip/XML editing — NOT SheetJS round-trip (SheetJS silently strips `xl/drawings/` + `xl/media/`, which is why early exports "looked nothing like" the real model). Sheet map: `sheet1.xml`=Rent Roll, `sheet2.xml`=Financial Model, `sheet3.xml`=5-Year Model (formulas only), `sheet4.xml`=Amortization (left untouched — financing is set by hand in Excel so VBA-driven debt options stay editable). Cells written: Rent Roll C7/D7/F7/H7 (units/SF/rent); Financial Model F11/G11 other income, B13 vacancy, F18:F29 & G18:G29 expenses (12 standard lines), E35/F35/G35 scenario prices. `scripts/build-model-template.mjs` rebuilds the template from the source .xlsm if it ever needs regenerating (bakes in 5-Year `=E*1.02` formulas + `fullCalcOnLoad`).
- **Analyst document intelligence:** the system prompt in `api/analyst.js` has detailed rules for reading real-world T-12 P&Ls (QuickBooks COGS/Gross-Profit/Expenses layout, "Total for…" subtotal traps, mortgage-interest exclusion, no vacancy double-count on actual-collected income, $0-payroll/reserves normalization) and messy rent rolls ($0 comp units, balance-as-rent outliers, partial rolls, roll-vs-T-12 reconciliation). Tuned against real Hylie Storage documents.
- **Live TractIQ market data:** via Anthropic Messages API **MCP connector** (beta `mcp-client-2025-11-20`) pointed at `https://app.tractiq.com/mcp`. 14 tools (facility search, pricing trends, occupancy, market summary, CMBS, demographics, geocode). Only used when the user asks for market data.

## Required Vercel env vars (Production)
- `ANTHROPIC_KEY` — Anthropic API key (pay-as-you-go; account must have credits).
- `SUPABASE_SERVICE_KEY` — Supabase service-role JWT (reads/writes the locked-down `app_secrets` table).
- `TRACTIQ_CLIENT_ID`, `TRACTIQ_REFRESH_TOKEN` — fallback seed; Supabase `app_secrets` is the source of truth and self-heals on token rotation.

## TractIQ re-auth (if the token ever fully breaks)
Run `node scripts/tractiq-auth.mjs` (one-time browser OAuth), then seed `tractiq_client_id` + `tractiq_refresh_token` into Supabase `app_secrets`.

## Local dev
- `npm install` then `npm run dev` (frontend only; `/api` functions don't run under Vite). For full local API, use `vercel dev` with the env vars above. Most iteration: edit → push → Vercel builds.

## Current handoff map
- `NEXT_SESSION_HANDOFF.md` is the short current-state handoff for the next chat.
- `SPRINT_HANDOFF_INDEX.md` is the sprint documentation map through the latest documented production work.
- Individual `SPRINT_*_HANDOFF.md` files explain what changed, what was verified, what remains risky, and what should not be touched casually.
