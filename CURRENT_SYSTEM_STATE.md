# Storage Hunters CRM — Current System State

Last verified: July 30, 2026  
Production baseline: `33bf531` on `claude/storage-investment-crm-vV018`  
Stabilization branch: `codex/stabilization-executive-quality`

This file is the concise source of truth for the current application shape. Older
sprint handoffs remain useful history, but they may describe retired navigation,
pending migrations that have since shipped, or pre-Core-Clients behavior.

## Product surfaces

The production navigation is:

1. Dashboard
2. Pipeline
3. Core Clients
4. Database
5. Mailers
6. Analyst
7. Calendar

The former top-level Clients page is retired. Pipeline is the opportunity
workspace; Core Clients is the high-value relationship workspace.

## Entity boundaries

| Concept | Storage | Intended authority |
| --- | --- | --- |
| Person / owner | `contacts` | Canonical identity, phone, email, addresses, notes, call history |
| Pipeline opportunity | `clients` | Property-specific brokerage opportunity, stage, pricing, commission |
| Core Client profile | `core_clients` | Relationship classification, motivation, cadence, Brokerage Continuum |
| Property ownership | `ownership_groups`, `properties` | Portfolio and property identity |
| Follow-up | `tasks` | Canonical new next-action system |
| Activity | `contacts.action_log`, `clients.action_log` | Historical embedded event stream |
| Targeted calling lists | `lists`, `contact_list_memberships` | Master Database home plus many-to-many call-list membership |
| Mail campaigns | `mailer_lists`, `mailer_list_members` | Mailing audience and sent state |

`clients` is a legacy table name. In current product language each row is a
pipeline opportunity, not a second person record. Existing copied person fields
remain for compatibility, but linked `contacts` should win wherever canonical
identity is needed.

## Workflow truth

- New follow-ups are written to `tasks`. Legacy `next_action_*` columns are
  compatibility fallback only and should not receive new writes.
- Brokerage Continuum stage changes use
  `change_brokerage_continuum_stage`, which updates the profile and appends
  immutable `brokerage_continuum_history` in one transaction.
- Pipeline stage changes still update the opportunity and
  `pipeline_stage_history` in separate requests. A future migration should move
  this to an RPC matching the Brokerage Continuum pattern.
- Core Client activity is the canonical contact activity shown in a relationship
  context. `last_meaningful_contact_at` is a derived convenience field and must
  be refreshed after a successful activity write.

## Live read-only verification

The public application client successfully read the following required tables:

`clients`, `contacts`, `lists`, `contact_list_memberships`, `tasks`, `meetings`,
`calendar_event`, `daily_progress`, `daily_activity_reviews`,
`daily_email_events`, `ownership_groups`, `properties`, `mailer_lists`,
`mailer_list_members`, `core_clients`, `brokerage_continuum_history`, and
`pipeline_stage_history`.

Observed optional or dark-launched gaps:

- `salesforce_screenshot_imports` exists but denies the public client, as
  intended for the server-side import boundary.
- `salesforce_screenshot_import_rows` is not in the public schema cache.
- `market_sources`, `market_stories`, and `market_briefs` are not installed, so
  Market Intelligence currently relies on its API/cache path rather than
  persisted news tables.

No data was written during verification.

## Protected areas

Unrelated stabilization work must not alter:

- `api/analyst.js`
- `src/data/financialModel.js`
- `api/_financialModel.js`
- `src/lib/excelModel.js`
- TractIQ OAuth/token storage
- `app_secrets` access controls
- backup/restore semantics

## Current verification baseline

At `33bf531`:

- `npm run lint` passes.
- `npm test` passes all 24 suites.
- `npm run build` passes.
- The primary bundle is approximately 960 KB minified / 256 KB gzip before
  stabilization lazy-loading.

## Known remaining architecture debt

1. Pipeline stage mutation and its audit insert are not yet transactional.
2. Activity history remains embedded JSON rather than an append-only activity
   table.
3. Legacy next-action columns remain in the schema for fallback compatibility.
4. Contact and opportunity identity columns remain physically duplicated.
5. Some hooks maintain independent client-side caches; cross-entity workflows
   must explicitly refresh affected stores.
6. Optional Market Intelligence persistence and the full Salesforce screenshot
   import schema are not installed in production.

