# Storage Hunters CRM — Onboarding for Codex

You're joining as a new engineer on this project. This document is everything
you need to get oriented before touching code. Read it fully before making
any changes.

## What this is

**Storage Hunters CRM** (recently renamed from "Storage Hero" — the rename is
in progress, code still says "Storage Hero" in places, see "Known loose ends"
below) is a custom CRM + AI deal-analysis tool built for **Brandon Greene**, a
self-storage investment sales broker at **Ripco Real Estate Corp**. He uses it
every single day as his actual operating system: sourcing facility owners →
cold calling → building relationships → exclusive listings → brokering the
sale to buyers. This is not a generic CRM — every feature maps to a specific
step in that real workflow. Don't abstract or genericize the pipeline stages,
naming, or workflow assumptions.

## Where everything lives

- **Local working directory:** `C:\Users\brand\OneDrive\Desktop\Storage Hunters CRM`
  — this is the ONLY correct project root. It was moved here from
  `C:\Users\brand\selfstorage-crm` on 2026-07-01; that old path is stale
  (nearly empty, just leftover build artifacts) — never work there.
- **Do NOT confuse with:** `C:\Users\brand\storage-hunters` — a completely
  unrelated Next.js project that happens to share a similar name. Different
  app, no connection. Don't reference it, don't ask Brandon to disambiguate.
- **GitHub repo:** https://github.com/Brandongreene1013/SelfStorage-CRM
  (old URL `brandongreene1013/selfstorage-crm` redirects here)
- **Production branch:** `claude/storage-investment-crm-vV018` — Vercel
  auto-deploys on push to this branch. It's kept in sync with `main` (both
  get pushed together; treat them as one production line, not two).
- **Live app:** https://self-storage-crm.vercel.app
- **Deploy platform:** Vercel, Hobby plan, auto-deploy on push. **There is no
  staging environment** — every push to the production branch goes live
  immediately. Only push when work is genuinely done and verified.

## Stack

React 19 + Vite + Tailwind 4 (dark theme: slate-900/950 backgrounds,
amber/yellow accents), Supabase backend (Postgres + auth), serverless
functions in `/api` (Node ESM, called via `fetch` from the frontend — Vercel
functions can't reliably import from `../src`, so shared logic used by an API
function gets hand-copied into `/api`, e.g. `src/data/financialModel.js` →
`api/_financialModel.js`; if you touch the underwriting math, update both
files identically).

## Supabase details

- **Account/Org:** Brandongreene1013's Org (Free plan)
- **Project name:** Brandongreene1013's Project
- **Project ref:** `rpoiphoqwgvbiyygfjrm`
- **Branch:** `main` (Production)
- **Dashboard:** https://supabase.com/dashboard/project/rpoiphoqwgvbiyygfjrm
- **SQL Editor:** https://supabase.com/dashboard/project/rpoiphoqwgvbiyygfjrm/sql/new
- Client URL/anon key are in `src/lib/supabase.js` (publishable key, safe to
  read/write app data client-side).
- Tables use permissive RLS (anon key has full access) for app data (clients,
  contacts, lists, meetings, tasks, etc.). Exception: `app_secrets` denies the
  anon key — only the server-side `SUPABASE_SERVICE_KEY` can read it. It holds
  the rotating TractIQ OAuth refresh token.
- **You do not have direct SQL/DDL execution access from a coding session.**
  Any schema change needs a `.sql` file checked into the repo (see `sql/` dir)
  with instructions for Brandon to run it himself in the SQL Editor above. Do
  not assume a migration ran just because you wrote the file — verify against
  the live database using the anon key (see "How to verify DB changes" below)
  before trusting it.

## Required Vercel env vars (Production)
- `ANTHROPIC_KEY` — Anthropic API key for the AI Analyst (pay-as-you-go)
- `SUPABASE_SERVICE_KEY` — service-role JWT (reads/writes `app_secrets`)
- `TRACTIQ_CLIENT_ID`, `TRACTIQ_REFRESH_TOKEN` — fallback seed for TractIQ
  market-data OAuth; Supabase `app_secrets` is the real source of truth and
  self-heals on token rotation

## Main app views (nav tabs)
Dashboard · Pipeline (10-stage kanban) · Clients · Database (cold-calling
engine, imports call lists, Master Database list) · **Analyst** (AI
underwriting) · Calendar (Outlook/Teams sync via Microsoft Graph).

## The Analyst — most complex feature, be careful here
`api/analyst.js` — Claude Opus via raw `fetch` to the Anthropic Messages API
(not the SDK), `maxDuration = 60`. Deterministic underwriting math lives in
`src/data/financialModel.js` / `api/_financialModel.js` (EGI → NOI → 3-scenario
valuation → cap rate/DSCR/cash-on-cash/5-year projection) — **Claude never
computes underwriting math by hand**, it only extracts inputs from uploaded
documents and calls the `underwrite` tool.

The system prompt in `api/analyst.js` has extensive, hard-won rules for
reading real-world messy documents (QuickBooks COGS/Gross-Profit/Expenses
layout, "Total for…" subtotal traps, mortgage-interest exclusion, no
vacancy-double-counting on actual-collected income, $0-payroll/reserves
normalization, rent-roll balance-vs-rent-value traps, roll-vs-T-12
reconciliation) — tuned against real broker documents. **Don't touch this
prompt for unrelated feature work.**

Excel export: `public/model-template.xlsm` is the team's REAL signature
workbook (has VBA macros, logo, drawings). `src/lib/excelModel.js` fills it
via **`fflate`** surgical zip/XML editing — **never** round-trip it through
SheetJS/the `xlsx` npm package for writing; that silently strips
`xl/drawings/`/`xl/media/` (the logo) and was already learned the hard way
once. `scripts/build-model-template.mjs` can regenerate the template from
source if it's ever lost. The Amortization sheet (debt/financing) is
deliberately never touched by the fill — Brandon sets financing by hand in
Excel and the VBA-driven debt options need to stay editable.

## Universal Task Engine (just shipped, Sprint 2)
A `tasks` table (Supabase) + `src/hooks/useTasks.js` + `src/components/tasks/`
power task/next-action tracking across Dashboard, Clients, Database, and
Pipeline. **Important nuance:** this coexists with an OLDER, still-fully-
functional single-slot "Next Action" system (`nextActionType/Date/Note` fields
on clients/contacts, `ActionModal.jsx`/`ActionLog.jsx`) that drives Pipeline's
drag-and-drop chips and Database's call-outcome flow. The two systems were
deliberately NOT merged this sprint — full consolidation is recommended future
work (see `SPRINT_2_TASK_ENGINE_HANDOFF.md` Section 13/14) but wasn't done
yet because it touches drag-and-drop and call-logging code paths that need
careful regression testing. Don't assume one replaced the other.

## Known loose ends / things to know before you touch related code
1. **Product rename in progress:** "Storage Hero" → "Storage Hunters CRM".
   Branding strings in `api/analyst.js`'s system prompt, `CLAUDE.md`,
   `App.jsx` (logo/header text), etc. have **not** been updated yet — this is
   explicitly deferred work, not an oversight.
2. **`StorageHero-CRM-Brief.md`** at repo root is a stale product-consulting
   doc written before the Analyst feature existed (still lists "no deal
   financial tracking" as a gap, which is false now). Don't treat it as
   current context.
3. **A `tasks` table Supabase gotcha (just resolved, 2026-07-01):** after the
   Sprint 2 migration (`sql/tasks_table_migration.sql`) ran, task creation was
   blocked twice in a row by things the migration itself didn't cause — (a) an
   RLS policy that got enabled on the table without a permissive rule attached
   (fixed by adding an `allow anon full access` policy), then (b) the
   original `text` column had a leftover `NOT NULL` constraint from the old
   simple to-do schema, which broke every insert since new task creation never
   sets `text`. Both are fixed and verified live now — just be aware that
   Supabase schema changes on this project have a history of surprise
   constraints/RLS state that isn't obvious from reading the migration SQL
   alone. **Always verify schema changes against the live database** (see
   below), don't just trust "Success" from the SQL Editor.
4. **A stray nested duplicate git clone** used to exist inside the old
   `selfstorage-crm` folder (an accidental clone-within-a-clone) — it was left
   behind (not moved) when the project relocated to this Desktop folder. Not
   relevant anymore since you're working from the new location, just noting
   it existed in case old references to it surface anywhere.
5. **`.claude/launch.json`** has a `storage-hero-dev` entry for local preview
   (port 5173) — it needs an explicit `"cwd"` pointing at this project folder,
   otherwise a preview tool session may default to the wrong working directory
   and launch an unrelated project. It's already fixed with the correct cwd,
   just know this file is local-only / not committed to git (intentionally —
   it's dev tooling, not shared config).

## How to verify Supabase/DB changes actually worked
Don't trust a green "Success" message alone — Postgres/Supabase schema
changes here have had surprise side effects twice already (see loose end #3).
The reliable way to verify: write a throwaway Node one-liner using
`@supabase/supabase-js` with the app's real anon/publishable key (from
`src/lib/supabase.js`) to actually insert/update/delete/select against the
live table, confirm it behaves as expected, then clean up any test rows you
created. Example pattern:
```js
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('<url from src/lib/supabase.js>', '<anon key>');
// insert/select/update/delete, log results, then delete your test row
```

## Conventions
- Commit + push only when work is genuinely done and verified (build passes,
  and for anything DB-related, verified live per above) — pushing to
  `main`/the production branch deploys immediately.
- Commit messages end with `Co-Authored-By: <your model name> <noreply@anthropic.com>`
  (match whatever convention the rest of the log uses — check `git log`).
- Before committing, run `npm run build` (must pass clean) and `npm run lint`
  — as of 2026-07-14 lint passes cleanly in the current checkout. Re-check it
  fresh rather than trusting old sprint docs that mention a failing baseline,
  and don't introduce new lint errors.
- No AI "model training" happens anywhere in this project — "teaching the
  Analyst" always means editing `api/analyst.js`'s system prompt/code, never
  fine-tuning a model.
- Ask before destructive git operations, before deleting files you didn't
  just create, and before scope-creeping past what a task actually asked for.

## Recent history / where things stand right now (as of 2026-07-01)
Two sprints have shipped and are live in production:
- **Sprint 1** — extracted a `src/components/ui/` primitive library
  (Button, SectionCard, StatusBadge, ModalLayout, EmptyState, etc.) and
  applied it across the app for visual consistency; fixed a mobile nav
  overflow bug. Full writeup: `SPRINT_1_UI_SYSTEM_HANDOFF.md`.
- **Sprint 2** — built the universal task engine described above. Full
  writeup, including exactly what was and wasn't touched and why:
  `SPRINT_2_TASK_ENGINE_HANDOFF.md`.

Read both handoff docs in full before starting new work — they document
specific design decisions and explicitly-deferred items you shouldn't
re-litigate or accidentally redo.

## What to do first
1. Read `CLAUDE.md` (repo root) — the canonical, actively-maintained project
   context file.
2. Read `NEXT_SESSION_HANDOFF.md` and `SPRINT_HANDOFF_INDEX.md` for the current
   production status and the full sprint documentation map.
3. For task-specific work, read the most relevant sprint handoff(s), especially
   the newest files if the work touches Dashboard, Database, Call Mode,
   Mailers, ownership/property workflows, backups, or daily activity.
4. Run `git log --oneline -30` — don't assume this document is exhaustive;
   the repo moves fast and sometimes gets touched by parallel sessions.
5. Ask Brandon what he wants to prioritize next rather than assuming a
   roadmap — both prior sprint handoffs include "recommended next steps"
   sections, but those are engineering suggestions, not committed plans.

## Current documentation note (2026-07-14)
This onboarding file still preserves early Sprint 1/2 context because those
design decisions matter, but the current project is documented through Sprint
25. Use `SPRINT_HANDOFF_INDEX.md` and `NEXT_SESSION_HANDOFF.md` as the current
map before relying on older "recent history" sections.
