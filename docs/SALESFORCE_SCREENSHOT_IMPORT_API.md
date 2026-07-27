# Salesforce Screenshot Import — Operations and API

This document covers the clipboard-first Salesforce screenshot importer in Analyst. The feature is isolated from `api/analyst.js` and is disabled unless the database migration and production flag are both present.

## Runtime flow

1. `create` creates a 24-hour private staging session and returns a one-time capability token. Only its SHA-256 hash is stored.
2. `upload-url` returns a short-lived signed upload URL for the private `salesforce-imports` bucket.
3. The browser uploads directly to private Storage, then `confirm-image` verifies magic MIME bytes, size, dimensions, session path, SHA-256 hash, and duplicate images.
4. `analyze` downloads the session images server-side and sends them as one request to the isolated Anthropic vision prompt.
5. Zod validates and normalizes the forced tool response. Duplicate scoring reads the live canonical tables.
6. `save-draft` persists user edits only in private staging.
7. `commit` revalidates the edited draft, re-runs duplicates, verifies all explicit decisions, and calls one idempotent Postgres RPC.
8. The RPC locks the session and atomically creates/reuses/updates canonical records and relationships. Screenshots are deleted after success.
9. `reject` deletes staged screenshots without changing canonical CRM records.

Clipboard images pasted anywhere on the Analyst screen automatically switch into Import Salesforce and begin the staged upload. Normal text clipboard content is not intercepted, so Ctrl+C/Ctrl+V continues to work normally in Analyst text fields. Once import mode is open, its full-page paste listener accepts additional screenshots without requiring focus inside a small drop zone.

All POST requests use `/api/salesforce-import` with an `action` field. Session actions also require `importId` and `capabilityToken`.

| Action | Purpose |
|---|---|
| `create` | Start an empty import session |
| `load` | Restore a session after refresh |
| `upload-url` | Mint a signed private upload URL |
| `confirm-image` | Verify and register an uploaded screenshot |
| `remove-image` | Delete one staged screenshot |
| `reorder` | Save screenshot sequence |
| `analyze` | Extract one combined draft from all screenshots |
| `save-draft` | Validate and save review edits |
| `commit` | Perform the explicit, transactional CRM write |
| `reject` | Cancel and clean up |

`GET /api/salesforce-import?action=config` enables the UI only when the flag is on and the migration is detectable. `GET ...?action=cleanup` requires `Authorization: Bearer <CRON_SECRET>` and expires abandoned sessions.

## Canonical field mapping

| Salesforce/import field | CRM destination |
|---|---|
| Property Name | `properties.facility_name`, `contacts.facility_name` |
| Record Type | `properties.record_type` |
| Property Type / Class | `properties.property_type`, `properties.property_class` |
| Address / City / State / ZIP / County | `properties.address`, `city`, `state`, `zip_code`, `county` |
| Website / Property Group | `properties.website`, `property_group` |
| Year / phone / units / SF / acreage / occupancy | corresponding `properties` extension columns |
| Expansion / notes | `properties.expansion_potential`, `notes` |
| Owner company / management company | `ownership_groups` |
| Owner or other person | Master Database `contacts` row |
| Person/company/facility role | `property_relationships` |
| Sale date / price / price per SF / cap rate | corresponding `properties.last_*` columns |
| Salesforce IDs and method | `source_record_id`, `source`, `source_metadata` |

Blank visible fields remain null or empty according to the canonical column contract. Numeric blanks are never converted to zero.

## Duplicate decisions

No match is merged automatically. The user must choose:

- Create a separate record.
- Use the selected existing record.
- Use the selected existing record and fill only its blank fields.
- Skip a proposed contact/company.

Facility matching uses Salesforce ID, normalized address, name + ZIP, name + market, website, and phone. Contact matching uses Salesforce ID, email, phone, normalized name, and name + company. Company matching uses Salesforce ID, normalized name, address, website, and phone.

## Security review

- Screenshots are private and never sent to the AI provider from the browser.
- Browser code never receives a service-role key.
- Staging tables have RLS enabled and no anon/authenticated policies.
- Every staging operation checks the import capability token.
- Signed previews expire after five minutes.
- Uploads allow six images, 4 MB each, 16 MB total, and only PNG/JPEG/WEBP.
- Raw provider failures and model output are not returned in client errors.
- The final canonical write is a security-definer RPC executable only by `service_role`.
- Imported/rejected screenshots are deleted immediately; abandoned images expire after 24 hours via cleanup.

Known security limitation: the CRM currently has no login system. Capability tokens secure existing import sessions, but they are not user authentication. True per-user ownership requires Supabase Auth as a separate application-wide project.

## Production setup

1. In Supabase SQL Editor, run `sql/salesforce_screenshot_import_migration.sql`.
2. Run the verification queries at the bottom of the migration.
3. Confirm the `salesforce-imports` bucket is private.
4. Confirm anon access to all three staging tables is denied.
5. Ensure Vercel has `ANTHROPIC_KEY`, `SUPABASE_SERVICE_KEY`, and `CRON_SECRET`.
6. Set `SALESFORCE_SCREENSHOT_IMPORT_ENABLED=true`.
7. Configure a daily authenticated request to `/api/salesforce-import?action=cleanup`.
8. Deploy, then execute the production verification checklist below with sanitized screenshots.

## Exact production verification checklist

- Open Analyst and switch to Import Salesforce.
- Paste a sanitized property screenshot with Ctrl+V.
- Paste a sanitized ownership screenshot.
- Confirm previews, dimensions, ordering, removal, and refresh recovery.
- Create the Facility Card.
- Confirm UI/activity text is ignored and blank fields remain blank.
- Edit an owner name and relationship.
- Resolve every duplicate candidate.
- Cancel one test and verify no canonical record was written.
- Approve a new test import.
- Verify the property, Master Database contact, company, relationships, and Salesforce source metadata.
- Repeat approval and verify no duplicate is created.
- Open the facility from success.
- Start another clean import.
- Verify screenshots were removed from private Storage.

Do not mark the feature production-ready until this checklist passes against the deployed environment.

## Rollback

Turn `SALESFORCE_SCREENSHOT_IMPORT_ENABLED` off first; the Analyst tab disappears without affecting underwriting. The additive columns and tables can remain safely unused. If database removal is later required, export/inspect imported rows by `source = 'Salesforce Screenshot'`, preserve canonical records, then drop only the staging tables, RPC, private bucket, relationship table if unused elsewhere, and optional extension columns in a separately reviewed migration.
