# Sprint 28 — Salesforce Screenshot Import: Stabilization & Go-Live Handoff

## Follow-up — Company Name facility label (July 28, 2026)

Extraction prompt v4 recognizes Salesforce's `Company Name` field as
`facility.name` when it appears in the property header or facility-details
section. `Property Name` remains preferred when both are populated, and
`Property Owner (Company)` remains an owner-contact company so ownership data
cannot overwrite the facility name.

Date: 2026-07-28
Branch: `claude/storage-investment-crm-vV018`

## What this sprint was
A QA / stabilization pass over the Salesforce screenshot importer that landed in
the prior session (commits `d75678e` → `2b614ec`, ~2,600 lines). No new feature
work — the goal was to verify the feature is production-safe, fix the one real
robustness gap found, and write the go-live runbook. The feature remains
**dark-launched** (off in production) until Brandon completes the go-live
checklist below.

## What the feature does (one paragraph)
Inside the Analyst tab, Brandon copies/pastes (or drops/uploads) one or more
screenshots of a Salesforce property record. The screenshots are staged in a
private Supabase Storage bucket, sent server-side to Claude vision for structured
extraction (facility name/address + owner name/company/phone/email only — a
deliberately minimal "prospect card"), scored against the existing CRM for
duplicates, shown in an **editable review card**, and only written to the CRM
after Brandon explicitly approves. Approval runs through one atomic, idempotent
Postgres RPC — the AI never writes canonical data.

## File map
- `api/salesforce-import.js` — the serverless endpoint (all actions: create,
  upload-url, confirm-image, analyze, save-draft, commit, reject, cleanup).
  `export const maxDuration = 60`.
- `api/_salesforceImport.js` — pure schema/validation/normalization/dedupe module
  (Zod). Imported by the endpoint AND by the tests.
- `api/_salesforceExtractionPrompt.js` — the versioned vision prompt.
- `src/components/analyst/SalesforceScreenshotImport.jsx` — the React review UI.
- `src/lib/salesforceImportClient.js` — browser client (session persistence,
  clipboard handling, signed uploads).
- `src/components/Analyst.jsx` — wires the importer in as an Analyst mode, gated
  on `salesforceEnabled` (see gating below).
- `sql/salesforce_screenshot_import_migration.sql` — schema, staging tables,
  private bucket, and the `commit_salesforce_screenshot_import` RPC. Idempotent.
- `tests/salesforceImport.test.mjs` — wired into `npm test` (all 16 suites green).

## Verification snapshot (2026-07-28)
- `npm run lint` — passes.
- `npm run build` — passes (Vite still warns on the main chunk size; unrelated).
- `npm test` — all 16 suites pass, including `salesforceImport`.
- Branch clean and synced with origin.

## Gating — why it's safe to have this in production already
The importer is **dark-launched behind two independent gates**. It is invisible
and inert in production until BOTH are true:
1. Env flag `SALESFORCE_SCREENSHOT_IMPORT_ENABLED === 'true'` (server-side).
2. The staging tables actually exist (the `?action=config` probe returns
   `enabled: true` only if a `select` on `salesforce_screenshot_imports` succeeds).

`Analyst.jsx` only shows the "Import Salesforce" tab when the config endpoint
returns `enabled: true` (or the local-only `VITE_SALESFORCE_SCREENSHOT_IMPORT_PREVIEW`
flag is set for dev). So the already-merged code changes nothing for Brandon's
daily use until he flips the flag — which is exactly why it was safe to harden it
this sprint without a staging environment.

## Fix shipped this sprint
**Stuck `analyzing` state on serverless timeout** (`api/salesforce-import.js`):
- The Claude vision `fetch` had no timeout. If analysis exceeded Vercel's 60s
  `maxDuration`, the function was hard-killed and the session row was left stuck
  in `status='analyzing'` with no way to retry (the `analyze` guard only allowed
  `collecting_screenshots` or `failed`), wedged until the 24h expiry.
- Fix A: an `AbortController` aborts the fetch at 50s (inside the 60s budget), so
  a slow provider throws → the existing catch records `status='failed'` with the
  friendly "analysis timed out; your screenshots are safe; try again" message,
  which the user can retry from.
- Fix B: the `analyze` action now also accepts a **stale** `analyzing` session
  (`updated_at` older than 90s) as retryable — belt-and-suspenders for any other
  timeout source (e.g. a hung storage download) the abort wouldn't catch.

## QA findings — reviewed, NOT bugs (documented so nobody "fixes" them)
- **Default vision model `claude-sonnet-4-6`** (overridable via
  `SALESFORCE_VISION_MODEL`) is a current, valid, vision-capable Anthropic model.
  Verified against the model catalog. Not a typo, not deprecated.
- **`companies` / `relationships` are intentionally capped at `maxItems: 0`** and
  `propertyHistory`/extra facility fields are absent from the extraction schema.
  This is the deliberate "minimal prospect card" scope. The RPC and dedupe scorer
  still contain code paths for companies/website/facility-phone/source-record-id
  on contacts — those are **dormant by design** (guarded by optional chaining or
  empty arrays), kept so the schema can be widened later without a rewrite. They
  are not dead-in-a-bad-way; leave them unless deliberately expanding scope.
- **Security model is sound for a no-auth app:** 256-bit capability token per
  import (only a SHA-256 hash stored), staging tables deny anon/authenticated,
  private bucket with short-lived signed URLs, magic-byte + dimension + hash
  re-validation server-side on every uploaded image, and a strict `safeError()`
  allowlist so raw errors never leak to the browser.

## GO-LIVE CHECKLIST (Brandon runs this when ready to turn it on)
Do these in order. Nothing here touches existing CRM data.
1. **Back up first** — run the in-app Backup button (or `npm run backup:json`)
   and confirm the artifact exists. The migration only ADDs columns/tables, but
   back up anyway per the project's hard rule.
2. **Run the migration** — paste `sql/salesforce_screenshot_import_migration.sql`
   into the Supabase SQL Editor and run it. It is idempotent (safe to re-run).
   Then run the three verification queries at the bottom of that file to confirm
   the bucket, the RLS-locked staging tables, and the
   `commit_salesforce_screenshot_import` function all exist.
3. **Confirm env vars in Vercel (Production):** `SUPABASE_SERVICE_KEY`,
   `SUPABASE_URL`, `ANTHROPIC_KEY` must be present (all already exist for the
   Analyst). Optional: `SALESFORCE_VISION_MODEL` (defaults to `claude-sonnet-4-6`),
   `CRON_SECRET` (only needed for the `?action=cleanup` expiry sweep).
4. **Flip the flag:** set `SALESFORCE_SCREENSHOT_IMPORT_ENABLED=true` in Vercel
   Production and redeploy (push, or `vercel --prod`).
5. **Smoke test with a sanitized/test record:** open Analyst → "Import Salesforce"
   should now appear → paste a Salesforce screenshot → analyze → review the card →
   approve → confirm the facility + owner landed in the Master Database. Because
   this writes real CRM rows, use a throwaway/test facility and delete it after,
   OR accept it as a genuine first import.
6. **If anything misbehaves, flip the flag back to `false`.** The importer
   disappears; the CRM and Analyst underwriting are completely unaffected.

## Known limitations / next-session backlog (this feature)
- No automatic expiry cleanup runs unless the `?action=cleanup` GET is called
  with the `CRON_SECRET` bearer. If Brandon wants stale staged screenshots purged
  automatically, add a GitHub Actions cron hitting that endpoint (mirror the
  existing market-intelligence workflow). Until then, sessions self-expire at 24h
  via `expires_at` but their storage objects linger until a cleanup call.
- The importer is single-property per session by design; a `multiple_properties`
  warning forces an explicit confirm checkbox before approval.
- No end-to-end automated test of the RPC (it requires a live Supabase). The pure
  validation/dedupe logic IS unit-tested; the RPC is only exercised by the manual
  smoke test in step 5.

## Do-not-touch (unchanged this sprint)
Per the standing rules in `NEXT_SESSION_HANDOFF.md`: `api/analyst.js`,
`api/_financialModel.js`, `src/data/financialModel.js`, `src/lib/excelModel.js`,
`public/model-template.xlsm`, TractIQ auth, `app_secrets`, backup encryption.
None were touched.
