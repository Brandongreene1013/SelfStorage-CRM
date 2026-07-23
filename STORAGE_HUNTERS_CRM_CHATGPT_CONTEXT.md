# Storage Hunters CRM - Product Context for ChatGPT

Generated: July 23, 2026

This document is a self-contained briefing for understanding the current
Storage Hunters CRM product. It describes the production application as it
exists today, not just its original concept or an aspirational roadmap.

## How To Use This Document

Treat this document as the product and engineering baseline for discussions
about:

- product strategy and workflow design
- feature planning and prioritization
- UI/UX critique
- architecture and data-model decisions
- implementation planning
- QA, reliability, and data-safety reviews

When proposing changes, optimize for Brandon's actual brokerage workflow.
Avoid turning this into a generic CRM. Ask for clarification when a proposal
would change a core operating behavior, financial calculation, production
data model, or destructive workflow.

## Executive Summary

Storage Hunters CRM is a custom, production CRM and deal-analysis operating
system for Brandon Greene, a self-storage investment sales broker at RIPCO
Real Estate Corp.

Brandon uses it to run the full brokerage process:

1. Source self-storage owners and facilities.
2. Import, clean, deduplicate, and research owner records.
3. Build targeted calling queues.
4. Cold call owners in a purpose-built Call Mode.
5. Record outcomes, notes, callbacks, and follow-up tasks.
6. Develop relationships and move qualified opportunities into the pipeline.
7. Track appointments, exclusives, offers, contracts, and closings.
8. Build direct-mail lists from owner mailing addresses.
9. Analyze self-storage deals with an AI-assisted deterministic underwriting
   engine.
10. Export underwriting into the team's real macro-enabled Excel model.
11. Track daily activity, weekly production, pipeline value, and projected
   commissions.
12. Protect the production database with manual and automated backups.

This is a single-user, workflow-specific operating system, not a generic
multi-tenant SaaS product. Speed, continuity, trust, and low-friction data
entry matter more than configurability for hypothetical users.

## Product Identity

- Current product name: Storage Hunters CRM
- Legacy name still visible in parts of the UI: Storage Hero
- Primary user: Brandon Greene
- Company: RIPCO Real Estate Corp
- Asset class: self-storage investment sales
- Live application: https://self-storage-crm.vercel.app/
- GitHub repository: https://github.com/Brandongreene1013/SelfStorage-CRM
- Production branch: `claude/storage-investment-crm-vV018`
- Current production code commit: `1797019`

The rename from Storage Hero to Storage Hunters CRM is intentionally
incomplete. It should eventually be handled as a deliberate branding pass,
not through isolated string changes during unrelated work.

## The Core Brokerage Loop

The product is organized around a real commercial real estate brokerage loop:

```text
Source owners
  -> import and clean records
  -> research ownership
  -> call owners
  -> record outcomes
  -> schedule follow-up
  -> qualify relationship/opportunity
  -> move into active pipeline
  -> win exclusive listing
  -> market property
  -> field offers
  -> contract
  -> close
  -> maintain post-close relationship
```

The application should reduce the effort and memory required to move through
this loop every day. It is especially important that Brandon can stop and
resume work without losing his exact place, task context, or call queue.

## Main Navigation

The production app has seven primary views:

1. Dashboard
2. Pipeline
3. Clients
4. Database
5. Mailers
6. Analyst
7. Calendar

### Dashboard

The Dashboard is the daily command center. It is intended to answer:

- What should I work on now?
- Which callbacks and tasks are due?
- What activity happened today?
- How is this week tracking?
- What is moving through the pipeline?
- What potential commission is represented by active opportunities?
- Are there owner or property relationships worth investigating?

Current capabilities include:

- overdue, due-today, and upcoming task groupings
- callback and calling entry points into Database Call Mode
- daily activity inputs with autosaved daily state
- weekly production scorecard
- pipeline stage summary
- pipeline value and projected gross commission
- upcoming meetings
- active relationship visibility
- owner/property radar signals
- shortcuts that deep-link into the relevant work surface

The daily and weekly scorecards cover activities such as calls, voicemails,
conversations, database additions, BOVs, owners identified, owners worked,
and actions.

### Pipeline

The Pipeline is a 10-stage drag-and-drop kanban for active clients and
opportunities:

1. Research
2. Cold Call
3. 1st Appointment
4. 2nd Appointment
5. Exclusive Listing
6. Market / Sell
7. Field Offers
8. Contract
9. Close
10. Post-Close

Pipeline records can represent buyers or sellers and include relationship
information, lead temperature, activity history, next actions, tasks,
property details, deal value, fee assumptions, and projected commission.

Moving a card between stages is a meaningful brokerage action. Changes to
drag-and-drop or next-action behavior need regression testing because they
affect a daily operating workflow.

### Clients

Clients is the detailed relationship view for active brokerage records.
Client records can store:

- buyer or seller type
- relationship type
- lead source
- contact information
- facility/property information
- primary and additional mailing addresses
- activity history
- tasks and next actions
- meetings
- ownership-group links
- deal value and commission assumptions

Clients and raw Database contacts are related but distinct concepts. Database
is the prospecting and owner-data workspace; Clients contains relationships
that have graduated into the active brokerage workflow.

### Database

Database is the owner-sourcing, data-cleaning, and cold-calling engine. It is
one of the most complex and heavily used parts of the product.

It includes:

- imported call lists
- a persistent Master Database
- deterministic loading order
- search, filters, status filters, and geographic distance sorting
- smart CSV/Excel import mapping
- source tracking and import history
- duplicate detection and a Duplicate Review center
- owner research links
- relationship types and lead sources
- alternate phone numbers
- primary and additional mailing addresses
- ownership groups and multi-property records
- estate/inheritance relationship support
- same-owner property radar
- contact-to-client movement
- scoped list deletion
- Call Mode

Typical contact statuses are:

- Fresh
- No Answer
- Left VM
- Conversation
- Appt Set
- Not Interested
- Call Back

The database intentionally supports messy real-world owner data. Imports may
contain duplicate people, alternate phone numbers, incomplete addresses,
business entities, inherited properties, source-list overlap, and conflicting
records. Product decisions should prefer preserving useful provenance and
making ambiguity reviewable over silently discarding data.

### Call Mode

Call Mode is the focused workspace for working through an owner queue quickly.
It is central to Brandon's daily process.

Current behavior includes:

- guided queue selection
- call queues built from lists, statuses, and due callback tasks
- persistence of the active session
- resuming at the exact contact/card after navigating away
- editable owner, facility, phone, email, and contact details
- alternate phone support
- property address promoted near the top of the call card
- one-click address copying
- Whitepages lookup using owner name and address location
- research links
- ownership and same-owner property context
- call notes and historical outcomes
- additional mailing-address editing
- auto-saving worked contacts into the Master Database
- optional movement into the active client pipeline
- post-call task creation
- callback queue continuity

Call outcomes are:

- No Answer
- Left VM
- Conversation
- Appt Set
- Not Interested
- Call Back

Outcome handling updates contact status, call history, last-called date, notes,
action history, and callback data as one logical operation. The most recent
reliability work prevents duplicate outcome clicks, preserves callback-task
metadata when refreshed contact data is merged into a queue, and makes
contact mutations persistence-first.

After an outcome:

- Conversation, Appt Set, and Left VM can offer a follow-up task.
- Call Back strongly supports a dated callback task.
- The current callback task may be completed when the outcome closes that
  queue item.
- Contacts can be moved to Master Database or advanced into client workflow.
- The next queue item should not advance until required writes finish.

Call Mode should remain fast and dense. Changes should be evaluated in the
context of a live phone call, where extra modals, scrolling, or ambiguous
save states have a high cost.

### Mailers

Mailers brings direct-mail prospecting into the same system as cold calling.

Current capabilities include:

- first-class mailer lists
- adding any contact/client mailing address to a list
- support for multiple mailing addresses
- member-level sent tracking
- list rename and deletion
- Excel export using Name, Street, City, State, and Zip columns

This allows Brandon to build direct-mail campaigns from the same owner
records used for calling and relationship tracking rather than maintaining a
separate spreadsheet.

### Analyst

The Analyst is an AI-assisted self-storage underwriting workspace. It is a
high-value, high-risk area and should not be casually modified.

The Analyst can:

- accept real-world rent rolls and T-12/P&L documents
- extract operating and financial inputs
- normalize messy accounting layouts
- reconcile rent-roll and T-12 information
- estimate expenses when details are incomplete
- call a deterministic underwriting tool for all financial math
- produce three valuation scenarios
- calculate NOI, cap rate, DSCR, cash-on-cash return, amortization, and a
  five-year projection
- retrieve live TractIQ market data when explicitly requested
- export results into the team's real macro-enabled Excel workbook

The AI model does not perform underwriting arithmetic by hand. It extracts
inputs and calls the deterministic financial engine.

The Analyst prompt contains specialized rules learned from real broker
documents, including:

- QuickBooks COGS/Gross Profit/Expenses layouts
- subtotal traps such as repeated "Total for..." lines
- mortgage-interest exclusion
- avoiding double-counted vacancy on actual collected income
- payroll and reserve normalization
- $0 comp units
- rent-versus-balance outliers
- partial rent rolls
- rent-roll versus T-12 reconciliation

The Excel export preserves the team's macro-enabled workbook, VBA, logo,
drawings, and media. It uses surgical ZIP/XML editing through `fflate`.
Round-tripping the workbook through SheetJS would strip important workbook
assets and must not be introduced.

The Amortization sheet is intentionally left editable because financing is
set manually in Excel.

### Calendar

Calendar provides meeting visibility and Outlook synchronization through
Microsoft Graph. It supports local CRM meetings alongside connected calendar
events and feeds upcoming activity back into the Dashboard.

## Tasks And Next Actions

The universal task engine is shared across Dashboard, Clients, Database,
Pipeline, and relevant call workflows.

A task can include:

- title and description
- open, completed, or dismissed status
- low, normal, high, or urgent priority
- due date and completion date
- related entity type and ID
- source surface
- task type

Task types are:

- Call
- Email
- Meeting
- Send Report
- Request Financials
- BOV
- Follow Up
- Contract
- General

Common one-click task presets include:

- Call back tomorrow
- Send TractIQ report
- Ask for T-12
- Ask for rent roll
- Schedule valuation call
- Follow up after BOV
- Send exclusivity agreement
- Check in next quarter
- Revisit in 6 months

The older split action/next-action UI was consolidated into a unified action
center. Historical actions and future tasks are related but should remain
semantically clear: one records what happened; the other schedules what must
happen next.

## Ownership And Property Intelligence

The data model goes beyond one contact equals one property.

It supports:

- ownership groups/entities
- multiple contacts linked to an ownership group
- multiple properties linked to an ownership group
- contacts and clients linked into the same ownership context
- facility name and address
- same-owner property detection
- property radar based on normalized ownership/address data
- estate and inherited-property relationship tracking
- owner research shortcuts

This is strategically important because the brokerage opportunity often
exists at the owner or portfolio level, not only at the individual facility
record.

Data quality matters heavily here. Owner-radar recommendations are signals for
review, not guaranteed truth.

## Relationship Vocabulary

Supported relationship types include:

- Storage Owner / Seller
- Buyer
- Institution
- Developer
- Broker
- Vendor
- Lender
- Attorney / Consultant
- Other

Lead sources include:

- Cold Call
- Facebook Marketplace
- Facebook Group
- LinkedIn
- In Real Life
- RIPCO CRM
- Referral
- CoStar
- Reonomy
- TractIQ
- Crexi / LoopNet
- Existing Client
- Broker Referral
- Owner Referral
- Other

Lead temperature is Hot, Warm, or Cold.

Supported property categories currently include Self-Storage, Boat/RV
Storage, and Land.

## Technical Architecture

### Frontend

- React 19
- Vite 8
- Tailwind CSS 4
- JavaScript/JSX, not TypeScript
- dnd-kit for kanban and drag/drop interactions
- dark slate UI with amber/yellow accents
- responsive web app with PWA foundations

### Backend And Persistence

- Supabase Postgres
- Supabase JavaScript client used directly from the frontend for CRM data
- permissive RLS for app data in this single-user architecture
- Vercel Node ESM serverless functions under `/api`
- Microsoft Graph/MSAL for Outlook calendar integration
- Anthropic Messages API for the Analyst
- TractIQ OAuth and MCP tools for on-demand market intelligence

The `app_secrets` table is intentionally different from other application
tables: public/anonymous access is denied and only the server-side Supabase
service role may read it. It stores the rotating TractIQ refresh token.

### Core Persisted Entities

Important Supabase tables include:

- clients
- contacts
- lists
- tasks
- meetings
- calendar_event
- daily_progress
- ownership_groups
- properties
- mailer_lists
- mailer_list_members
- duplicate_dismissals
- app_secrets

The schema has evolved through checked-in SQL migrations. A fresh environment
must run the relevant files under `sql/`.

### Serverless Functions

Important APIs include:

- `api/analyst.js` - AI document analysis and underwriting orchestration
- `api/intelligence.js` - intelligence-related server operations
- `api/daily-activity.js` - daily activity intelligence and delivery
- `api/email-log-ingest.js` - activity ingestion
- `api/calendar-ingest.js` - calendar ingestion
- `api/lookup.js` - server-side lookups

Vercel functions cannot reliably import shared code from `src`. Some logic is
therefore mirrored manually under `/api`, including the financial model.
Mirrored copies must remain synchronized.

### Key Frontend Ownership Boundaries

- `src/App.jsx` - application shell, view routing, lifted shared hooks
- `src/components/Dashboard.jsx` - command center
- `src/components/PipelineBoard.jsx` - pipeline kanban
- `src/components/ClientCard.jsx` and `ClientModal.jsx` - client surfaces
- `src/components/Database.jsx` - Database, contact details, Call Mode
- `src/components/MailerLists.jsx` - direct-mail list management
- `src/components/Analyst.jsx` - underwriting UI
- `src/components/Calendar.jsx` - calendar UI
- `src/hooks/useCRM.js` - client persistence and mapping
- `src/hooks/useDatabase.js` - lists, contacts, imports, contact persistence
- `src/hooks/useTasks.js` - universal task persistence
- `src/hooks/useOwnership.js` - ownership groups and properties
- `src/hooks/useMailerLists.js` - mailer lists and members
- `src/hooks/useDailyProgress.js` - daily production state
- `src/data/financialModel.js` - canonical deterministic underwriting math
- `api/_financialModel.js` - API mirror of the underwriting math
- `src/lib/excelModel.js` - macro-enabled workbook export

## UI And Product Design Principles

The interface is an operational tool, not a marketing site.

Good product changes should favor:

- fast scanning
- dense but organized information
- minimal context switching
- clear persistence and error feedback
- few clicks for repeated workflows
- predictable resume behavior
- keyboard/mobile/PWA usability where practical
- visibility of the next best action
- preservation of source and relationship context
- quiet styling that does not compete with the work

Avoid:

- decorative dashboard cards that do not support decisions
- generic CRM abstractions that obscure brokerage language
- extra confirmation steps in high-frequency non-destructive workflows
- hidden auto-saves without failure feedback
- optimistic UI that can make failed writes appear successful
- duplicate task/action systems
- destructive bulk operations without backup and scope controls

The shared UI system includes reusable buttons, cards, badges, modal shells,
empty states, search toolbars, loading skeletons, and metric components.

## Data Safety And Recovery

The CRM contains real, business-critical production data.

Current safeguards include:

- manual in-app JSON backup download
- local JSON backup command
- dry-run and execute restore tooling
- encrypted scheduled GitHub Actions backups
- 90-day workflow artifact retention
- permanent weekly encrypted history on the `crm-backups` branch
- loud backup failures for export errors or unexpectedly empty critical
  tables
- scoped deletion for Database lists
- guarded QA seed and cleanup tooling

Restore operations upsert backup rows. They do not delete rows created after
the backup.

Supabase Point-in-Time Recovery is not currently available on the free plan.
Moving to a plan with provider-level backups/PITR remains the strongest future
data-safety improvement.

Any feature that performs imports, migrations, broad updates, or deletes
should begin with a confirmed backup.

## Deployment And Operational Constraints

- Hosting: Vercel Hobby
- Database: Supabase
- No staging environment
- Production URL: https://self-storage-crm.vercel.app/
- Production branch: `claude/storage-investment-crm-vV018`
- A production push can go live immediately
- Build, lint, tests, and targeted live QA are expected before deployment

Schema changes cannot be executed directly from a normal coding session.
They require:

1. A checked-in SQL file under `sql/`.
2. Brandon running it in the Supabase SQL Editor.
3. Verification against the live database using guarded records and the
   application's normal public client.
4. Cleanup of all QA records.

The project has previously encountered unexpected RLS and legacy constraint
state even after migration SQL reported success. Live behavioral verification
is mandatory.

## Current Production Quality Snapshot

The July 23, 2026 production release:

- passes ESLint
- passes the text-normalization, owner-radar, and reliability test suites
- passes the Vite production build
- has been deployed and verified with HTTP 200 responses
- has a clean production branch working tree

The latest reliability pass specifically addressed:

- duplicate Call Mode outcome submissions
- atomic contact status/call/action/notes/callback updates
- callback queue metadata preservation during contact refresh
- persistence-first deletion of call history
- task action error handling and pending-state locking
- Dashboard quick-add pending/error behavior
- React key stability in Dashboard task groupings

## Known Limitations And Product Debt

1. The Storage Hero to Storage Hunters CRM rename is incomplete.
2. The main frontend bundle is about 1.5 MB before gzip and still triggers
   Vite's large-chunk warning.
3. The `xlsx` package has a known high-severity audit advisory with no
   automatic npm fix. It must not be used to write the macro-enabled Analyst
   workbook.
4. Supabase Free does not provide provider-level PITR.
5. Owner/property intelligence depends on imperfect imported data.
6. Daily Dashboard counters should periodically be checked against Brandon's
   real logged activity expectations.
7. Owners/Properties search and filter UX can be improved.
8. More detailed lead-source context may eventually require
   `lead_source_notes`.
9. The application is still JavaScript-heavy and the Database/Call Mode
   component is large, increasing regression risk.
10. Vercel's Git integration did not trigger automatically for the latest
    release; the verified code was deployed directly through the Vercel CLI.

These are not all equally urgent. Reliability of calling, follow-up, data
integrity, and underwriting should take priority over technical cleanup that
does not improve the daily workflow.

## Protected Areas

Do not casually modify the following:

- the Analyst system prompt in `api/analyst.js`
- deterministic underwriting math in `src/data/financialModel.js`
- the mirrored API math in `api/_financialModel.js`
- Excel fill logic in `src/lib/excelModel.js`
- `public/model-template.xlsm`
- TractIQ OAuth and refresh-token rotation
- `app_secrets`
- backup encryption secrets

Changes to these areas require explicit scope, dedicated tests, and careful
production validation.

## Product Decision Heuristics

When evaluating a new feature, ask:

1. Which step of Brandon's real brokerage workflow does this improve?
2. How often will he use it?
3. Does it reduce clicks, memory load, or context switching?
4. Will it preserve his exact place if interrupted?
5. Does it create a new source of truth or duplicate an existing one?
6. What production data can it alter or delete?
7. Can a failed save be mistaken for success?
8. Does it work with messy real-world owner and facility data?
9. Does it preserve import/source provenance?
10. Does it need to be visible during a live call?
11. How will it be backed up and restored?
12. What is the smallest regression test that proves the core behavior?

## Suggested Near-Term Priorities

The current reasonable candidate priorities are:

1. Deliberately finish the Storage Hunters CRM branding rename.
2. Verify and tune Dashboard activity counters using Brandon's real workflow.
3. Improve Owners/Properties search, filtering, and radar review.
4. Continue Call Mode speed and reliability improvements based on live use.
5. Add richer source notes only if Brandon needs more context than the
   existing lead-source field.
6. Split the largest frontend bundles when feature pressure allows.
7. Investigate why the Vercel Git deployment hook did not trigger.
8. Consider Supabase Pro/PITR as the value of stored business data grows.

These are options, not a committed roadmap. Brandon's current pain point
should determine priority.

## Instructions For ChatGPT

When responding with product or engineering advice:

- Speak as a senior product-minded full-stack engineer.
- Ground recommendations in the self-storage brokerage workflow above.
- Distinguish current behavior from proposed behavior.
- Identify data migrations, destructive operations, and deployment risk.
- Preserve the Analyst and Excel model unless explicitly asked to change them.
- Prefer improving existing workflows over adding disconnected modules.
- Treat Call Mode, tasks, backups, and persistence as business-critical.
- Include a practical QA plan for changes that alter saved data or daily
  workflows.
- Do not assume a staging environment exists.
- Do not expose or request secrets in client-side code.
- Do not describe legacy "Storage Hero" strings as an accidental bug; the
  rename is known and intentionally deferred.
- Ask Brandon for the business decision when multiple technically sound
  workflows would have different day-to-day consequences.

## Useful Opening Prompt

Upload this file to ChatGPT and use:

> Read the attached product context as the source of truth for the current
> Storage Hunters CRM. First summarize your understanding of the product,
> Brandon's daily workflow, the highest-risk systems, and the most important
> current limitations. Then help me with: [insert your request].

