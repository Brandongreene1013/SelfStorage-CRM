# Salesforce Screenshot Import — Architecture and Implementation Plan

Status: approved implementation plan  
Prompt version: `salesforce-screenshot-extraction-v1`  
Schema version: `salesforce-import-draft-v1`

## Repository findings

- The Analyst is a React chat surface in `src/components/Analyst.jsx`. It currently accepts PDFs, spreadsheets, CSV, and text, but not clipboard images.
- The protected underwriting/CRM Analyst service is `api/analyst.js`. Screenshot extraction will not modify that prompt or route.
- Canonical owner/facility data is split across:
  - `contacts`: the Master Database and Call Mode record.
  - `properties`: the canonical facility/property record.
  - `ownership_groups`: the canonical owner/company grouping.
  - `clients`: pipeline records, not the destination for a screenshot import.
  - `lists`: includes the pinned `Master Database` destination.
- `contacts.ownership_group_id` and `properties.ownership_group_id` provide the existing owner/property foundation.
- Existing duplicate logic lives in `src/lib/duplicateReview.js` and import-time matching in `src/hooks/useDatabase.js`. The server implementation will use the same normalized address, phone, email, owner-name, and facility-name signals.
- There is no application login or Supabase Auth session. Current CRM tables intentionally allow anonymous access. Screenshot staging therefore cannot truthfully use `auth.uid()` until product-wide authentication exists.
- No Supabase Storage bucket currently exists.
- Browser code uses the publishable Supabase key. Server routes use `SUPABASE_SERVICE_KEY`.
- Database migrations must be checked into `sql/` and manually run in the Supabase SQL Editor.

## Architecture

```text
Clipboard / file / drop image
  -> API-created import session + unguessable capability token
  -> short-lived signed upload URL
  -> private Supabase Storage bucket
  -> staged image metadata + hash
  -> isolated Anthropic vision extraction route
  -> strict server validation + normalization
  -> live duplicate scoring against contacts/properties/ownership_groups
  -> editable review card
  -> explicit duplicate decisions and approval
  -> one idempotent Postgres RPC transaction
  -> properties + ownership_groups + contacts + property_relationships
```

The AI never writes canonical CRM data. Only the approval RPC can do that.

## Session security

Because the app has no user identity, v1 uses an import-scoped capability token:

- The server generates a 256-bit random token when a session is created.
- Only a SHA-256 hash is stored in the database.
- The browser stores the raw token locally for refresh recovery.
- Every session, image, analysis, edit, reject, and commit request must present the token.
- Staging tables deny all anonymous access; only the server service role and the commit RPC access them.
- Storage is private. Upload and preview access use short-lived signed URLs.

This protects screenshots from the public Supabase key, but it is not a replacement for user authentication. When Supabase Auth is introduced, `user_id` and `auth.uid()` RLS should replace capability-only ownership.

## Canonical model extensions

The migration will:

- Extend `properties` with Salesforce/facility attributes: record type, class, ZIP, county, website, property group, year built, phone, units, rentable square feet, acreage, occupancy, expansion potential, transaction-history fields, source record ID, and source metadata.
- Extend `ownership_groups` with company type, website, phone, mailing address, source record ID, source, and source metadata.
- Extend `contacts` with first/middle/last name, job title, contact role, company name, source record ID, and source metadata.
- Add `property_relationships` so one property can retain multiple owner contacts, owner companies, and a management company without replacing the existing primary `ownership_group_id`.
- Add private staging tables:
  - `salesforce_screenshot_imports`
  - `salesforce_screenshot_import_images`
  - `salesforce_screenshot_import_events`
- Add the private `salesforce-imports` Storage bucket.
- Add an idempotent transactional RPC for final approval.

## Extraction design

- Dedicated route: `api/salesforce-import.js`
- Dedicated versioned prompt: `api/_salesforceExtractionPrompt.js`
- Dedicated schema/normalization/duplicate module: `api/_salesforceImport.js`
- Vision requests use Anthropic image blocks loaded server-side from private storage.
- Maximum 6 screenshots, 4 MB per image, 16 MB total, PNG/JPEG/WEBP only.
- The model returns a forced tool payload matching the draft schema.
- Server validation rejects unknown status/role values, malformed state/ZIP/email/phone/date/currency/percentage values, oversized strings, and invalid relationships.
- Blank values remain `null`; no blank numeric value becomes zero.
- Each extracted value retains confidence, evidence text, screenshot ID, raw value, normalized value, and status.
- Repeated entities are normalized and deduplicated. Conflicting populated values become review warnings.

## UI plan

- Add an `Import Salesforce Record` mode inside Analyst without changing chat or underwriting.
- Detect image clipboard content anywhere in Analyst and switch directly into import mode; ordinary text paste remains untouched.
- Support clipboard, drag/drop, and file selection.
- Show thumbnail, sequence, dimensions, upload/analysis status, remove, enlarge, and reorder controls.
- Persist session ID/token locally and reload staged metadata after refresh.
- Provide:
  - Create Facility Card
  - Add Another Screenshot
  - Clear Screenshots
- Render a compact editable prospect card containing only facility name/address and the visibly labeled owner name, company, phone, and email.
- Show confidence/evidence labels and screenshot source.
- Run duplicates before approval and require an explicit decision for every possible/strong/exact match.
- Approval stays disabled until validation and duplicate decisions are complete.
- Success state offers Open Facility and Import Another Salesforce Record.

## Duplicate behavior

- Facility: normalized address; facility + ZIP; facility + city/state; source record ID; website domain; phone; owner relationship.
- Contact: email; phone; normalized owner name; and owner name + company.
- Company names are retained on the owner contact rather than creating a separate company-review workflow.
- Scores map to `none`, `possible`, `strong`, or `exact`.
- No automatic merge. Supported decisions are create new, use existing, update blank fields, and cancel.

## Expected files

- `sql/salesforce_screenshot_import_migration.sql`
- `docs/SALESFORCE_SCREENSHOT_IMPORT_PLAN.md`
- `docs/SALESFORCE_SCREENSHOT_IMPORT_API.md`
- `api/salesforce-import.js`
- `api/_salesforceImport.js`
- `api/_salesforceExtractionPrompt.js`
- `src/components/Analyst.jsx`
- `src/components/analyst/SalesforceScreenshotImport.jsx`
- `src/lib/salesforceImportClient.js`
- `tests/salesforceImport.test.mjs`

Protected files that will not be modified:

- `api/analyst.js`
- `src/data/financialModel.js`
- `api/_financialModel.js`
- `src/lib/excelModel.js`
- `public/model-template.xlsm`
- TractIQ authentication and backup services

## Staged implementation

1. Migration, staging model, validation, feature flag, and server tests.
2. Clipboard/drop/file session UI and refresh recovery.
3. Isolated vision extraction with structured output.
4. Editable review card and evidence/confidence display.
5. Duplicate scoring and required resolution choices.
6. Transactional/idempotent final commit and repeat-import flow.
7. Full regression, security, visual, and production verification.

Each stage must pass lint, tests, and production build before proceeding.

## Risks and unresolved constraints

1. **No product authentication:** capability tokens protect individual staged imports, but anyone able to use the public app can create a new import session. True per-user ownership requires a separate authentication project.
2. **Manual migration:** the feature cannot be enabled in production until the checked-in SQL migration is run and verified against the live database.
3. **Provider/data handling:** Salesforce screenshots are sent server-side to Anthropic for extraction. This must match Ripco/Salesforce data-handling policy.
4. **Vercel limits:** image limits and direct-to-private-storage signed uploads are required to avoid serverless request-size limits.
5. **Atomicity:** canonical writes are only production-safe through the migration’s Postgres RPC; browser-side sequential inserts are prohibited.
6. **Existing data model:** multiple companies/owners require the new relationship table. Existing UI continues using the primary ownership group while the import card preserves all relationships.
7. **Exact end-to-end verification:** sanitized screenshots can test the UI and extraction. Production completion also requires the migration, Storage bucket, feature flag, and one approved test import.

## Rollout

- Default server feature flag: off.
- Run and verify the migration.
- Confirm private bucket and deny-anon staging policies.
- Set `SALESFORCE_SCREENSHOT_IMPORT_ENABLED=true` in Vercel Production.
- Deploy and execute the exact acceptance workflow with sanitized screenshots.
- If verification fails, turn the feature flag off; canonical CRM and Analyst underwriting remain unaffected.
