# Sprint 30 — Core Clients, Brokerage Continuum & Connected Pipeline

This sprint connected the three layers of the CRM into one relationship system:
**Master Database (canonical people) → Core Clients (relationship profiles) →
Pipeline (per-property opportunities)**, and introduced the **Brokerage
Continuum**: an 11-stage, person-level relationship stage with an immutable
audit trail and a guarded stage-change RPC.

Covers commits `3773559` → `33bf531` (11 commits, ~3,500 lines) that shipped
after Sprint 29 and were previously undocumented.

## The business model this encodes

Brandon's brokerage lifecycle is one long relationship with a facility owner
that runs from first research all the way to post-close and referrals. That
relationship is **person-level**, not deal-level: one owner can have several
properties and several opportunities at different stages, but there is only ever
one canonical person.

### Layers
1. **Master Database contact** — the canonical person. Never duplicated.
2. **Core Client** (`core_clients`) — exactly one active/archived relationship
   profile per contact (`core_clients_contact_unique`). It *classifies* a
   contact; it never copies the person. Holds selling motivation/strength,
   timeline, price expectations, sale barriers, follow-up cadence, next action,
   assigned user, and the canonical **Brokerage Continuum stage**.
3. **Pipeline opportunity** (`clients`) — a specific transaction, now optionally
   linked to a `property_id`, so the same person can hold multiple opportunities.

### The Brokerage Continuum (11 stages)
Canonical order (see `src/lib/brokerageContinuum.js` — the single source of truth
for labels, order, objectives, stale thresholds, and groups):

1. `research` → 2. `cold_call` → 3. `first_appointment` →
4. `second_appointment` → 5. `exclusive_listing` → 6. `market_sell` →
7. `field_offers` → 8. `contract` → 9. `due_diligence` → 10. `close` →
11. `post_close`

Grouped for UI as: Prospecting · Relationship Development · Active Listing ·
Under Contract · Completed Relationship.

## Schema (both migrations assumed RUN in live Supabase)

Run order matters — `core_clients_pipeline_migration.sql` first, then
`brokerage_continuum_migration.sql`. Both are additive and idempotent (safe to
rerun); nothing is deleted.

### `sql/core_clients_pipeline_migration.sql`
- New table `core_clients` (one row per contact, `unique(contact_id)`), with
  check constraints on `motivation_strength`, `selling_timeline`, `status`,
  `follow_up_frequency_days`.
- Adds to `clients`: `property_id` (FK → properties, on delete set null),
  `opportunity_name`, `assigned_user`, `owner_pricing_expectation`,
  `important_notes`, `stage_entered_at` (backfilled), `archived_at`.
- New table `pipeline_stage_history` (append-only audit of every Pipeline stage
  move; seeds one initial record per existing client).
- Permissive RLS (`for all using(true)`) to match the rest of the app.

### `sql/brokerage_continuum_migration.sql`
- Adds continuum columns to `core_clients`: `brokerage_continuum_stage`
  (default `research`), `..._stage_entered_at`, `..._updated_at`,
  `..._updated_by`, `..._note`, `..._legacy`.
- Migrates any provisional free-text `brokerage_continuum` column into the new
  enumerated stage, then drops it.
- New immutable table `brokerage_continuum_history` (per-transition audit) with
  check constraints on stages and `source`.
- SQL fn `brokerage_continuum_stage_order(text)` — numeric order, mirrors the JS.
- **The important part — three triggers + one RPC enforce integrity:**
  - `seed_brokerage_continuum_history_trigger`: every new Core Client gets an
    initial history row automatically.
  - `guard_brokerage_continuum_stage_update`: a **direct UPDATE** to any
    continuum column throws unless done through the RPC. This is why the app
    MUST NOT write `brokerage_continuum_stage` directly.
  - `prevent_brokerage_continuum_history_mutation`: history is UPDATE/DELETE
    proof.
  - `change_brokerage_continuum_stage(...)` RPC (SECURITY DEFINER): the **only**
    supported way to change stage. It validates the target stage, rejects
    no-op and future-dated changes, enforces **reason required** on backward
    moves / big forward skips (>2) / dropping out of an active listing /
    `bulk_update`+`data_correction` sources, enforces **note required** for
    certain reasons, updates the row, and writes the history record — all in one
    transaction. Returns `{ core_client, history }`.
- Only `SELECT` + `EXECUTE` are granted to anon/authenticated; INSERT/UPDATE/
  DELETE on history are revoked.

**Rule for future work:** never `update` continuum stage fields on
`core_clients` directly — always call the `change_brokerage_continuum_stage`
RPC. The DB will reject a direct write anyway.

## New / changed frontend

New files:
- `src/lib/brokerageContinuum.js` — stages, groups, transition reasons,
  `continuumTransitionRequirements`, stall/attention math
  (`isContinuumStalled`, `continuumStallThreshold`), pipeline→continuum stage
  suggestion. **Mirror the RPC's rules here for UX; the DB is the enforcer.**
- `src/lib/coreClients.js` — `dbToCoreClient` / `coreClientToDb` /
  `dbToBrokerageContinuumHistory` mappers.
- `src/lib/relationshipWorkspace.js` — `coreClientAttention` and
  `pipelineAttention` (neglect / overdue / cadence / stall detection),
  `lastMeaningfulContactAt`, meaningful-activity classification.
- `src/hooks/useCoreClients.js` — Core Clients data hook.
- `src/components/CoreClients.jsx`, `CoreClientModal.jsx`,
  `CoreClientRelationshipRecord.jsx`, `EngagementPanel.jsx`.
- `src/components/PipelineWorkspace.jsx`, `PipelineBoard.jsx` (reworked),
  `PipelineOpportunityModal.jsx`.
- `src/components/brokerage/BrokerageContinuum.jsx` — the continuum board with
  drag-to-move between stages (drag triggers the RPC, surfacing the
  reason/note requirements when needed).

Changed: `src/App.jsx` (nav — redundant standalone Clients nav removed,
commit `25d6924`), `src/hooks/useCRM.js`, `src/data/constants.js`,
`src/components/Database.jsx` (Core Clients virtual list, list-only contact
handling), `Dashboard.jsx`, `ClientCard.jsx`, `ClientModal.jsx`,
`ActionCenterModal.jsx`, task utils, and the market-intelligence providers
(`41daf06` refreshed market news alongside this work).

Tests added and wired into `npm test`:
`tests/brokerageContinuum.test.mjs`, `tests/coreClients.test.mjs`,
`tests/relationshipWorkspace.test.mjs`, plus `taskUtils` and
`intelligenceDatabase` updates.

## State at handoff (2026-07-30)
- Branch: `claude/storage-investment-crm-vV018` (production; auto-deploys).
- Working tree: `sql/core_clients_pipeline_migration.sql` had a trailing-newline
  edit and `outputs/` (HubSpot export scratch) is untracked — neither is
  feature code.
- Both migrations assumed run in live Supabase by Brandon.
- Follows all standard hard rules (no staging; guarded QA records; do not touch
  Analyst math/prompt/export, TractIQ auth, `app_secrets`, backup secrets).

## Suggested next work
1. Verify the connected Database → Core Clients → Pipeline flow end-to-end with
   a guarded record in production, including a drag that requires a reason/note.
2. Confirm `pipeline_stage_history` and `brokerage_continuum_history` are being
   written on real moves (spot-check in Supabase).
3. Any continuum reporting/velocity view should read the immutable history
   tables, not derive from current stage alone.
