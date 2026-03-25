# Storage Hero CRM — Product Brief for AI Consultant

## Your Role
You are acting as **both a senior UX/web designer AND a commercial real estate broker** specializing in self-storage investment sales. Give suggestions from both perspectives — what makes sense operationally in the real world of storage brokerage, AND what makes the product cleaner, faster, and more professional to use daily.

---

## What This App Is

**Storage Hero** is a custom-built CRM web app for a self-storage investment sales broker at **Ripco Real Estate Corp**. It is NOT a generic CRM. It is purpose-built for one specific workflow:

> Sourcing self-storage facility owners → cold calling → building relationships → getting exclusive listings → brokering the sale of the facility to institutional or private buyers.

The broker uses this app every single day as their operating system. It runs locally in the browser (React + Vite, dark theme, amber/yellow accents).

---

## The Real Brokerage Pipeline (Critical Context)

This is the exact pipeline the broker works through. Do NOT abstract or generalize these stages:

| Stage | What It Means |
|-------|--------------|
| 1. Research | Finding storage facilities and owners to target |
| 2. Cold Call | First outreach — calling owners from imported lists |
| 3. 1st Appointment | Owner agreed to meet — intro conversation |
| 4. 2nd Appointment | Follow-up meeting — deeper discussion, valuation talk |
| 5. Exclusive Listing | Owner signed — we have the listing |
| 6. Market / Sell | Actively marketing the deal to buyers |
| 7. Field Offers | Receiving and negotiating offers |
| 8. Contract | Under contract |
| 9. Close | Transaction closing |
| 10. Post-Close | Follow-up, referrals, relationship maintenance |

---

## Current Features (What's Already Built)

### Dashboard
- KPI strip: Total Clients, Buyers, Sellers, Active Deals, In Contract, Closed
- Pipeline Continuum: horizontal bar chart showing deal counts across all 10 stages
- Today's Progress: live counters for Calls Logged, Facilities Reached, Conversations, 1st Appts Set, BOVs Set (with +/− buttons)
- Productivity Analytics: Week / Month / Year rollup of progress counters
- Upcoming Meetings widget
- Active Relationships panel (clients in Cold Call → Exclusive Listing)
- To-Do task list (add, check off, delete, persists in localStorage)
- Pipeline Funnel chart (all clients)

### Pipeline Board
- Kanban-style drag-and-drop board
- All 10 brokerage stages
- Client cards with facility name, type (Buyer/Seller), units, sq ft
- Move clients between stages

### Clients Page
- Full client profiles: name, type (Buyer/Seller), facility name, address, phone, email, units, sq ft, property type, storage class, notes
- Add / edit / delete clients
- Search and filter

### Database (Cold Calling Engine)
- Import Excel/CSV call lists (auto-detects owner name, phone, email, address, facility name)
- Owner name is the primary identifier (not facility ID)
- Call Queue: work through contacts one by one, log outcomes (No Answer, Left VM, Conversation, Appt Set, Not Interested, Call Back)
- Call history per contact
- Contact detail modal with editable fields
- Google Business Finder: pre-built search links (Google Search, Maps, Business Listing, LinkedIn) for finding missing info
- List management: import lists, create blank lists, rename, delete
- Inline contact editing
- Status filters, search
- Markets view by state

### Calendar
- Monthly calendar view
- Schedule meetings linked to clients
- Outlook + Teams integration (Microsoft Graph API — live sync with Ripco Outlook account)
- Outlook events shown in blue, CRM meetings in amber
- Teams meeting "Join" button
- Download .ics files
- Open in Outlook button

### Branding
- Name: **Storage Hero**
- Superman-inspired shield logo (red/yellow/amber)
- Dark premium UI (slate-900/950 background)
- Amber/yellow as primary accent color

---

## The User's Daily Workflow

1. Open Dashboard → check pipeline snapshot + to-do list + today's meetings
2. Go to Database → open Call Queue for the active list → work through calls, log outcomes
3. When an owner shows interest → promote them to a Client in the Pipeline
4. Move clients through pipeline stages as relationships progress
5. Schedule meetings via Calendar (synced to Outlook)
6. Track daily call activity with the progress counters

---

## What's NOT Built Yet (Known Gaps)

- No email sending/logging from within the app
- No BOV (Broker Opinion of Value) generator or template
- No document storage per client (no file uploads)
- No deal financial tracking (price, commission, cap rate, NOI)
- No buyer matching (matching listed facilities to buyer criteria)
- No notification/reminder system for follow-ups
- No mobile app or mobile-optimized view
- No reporting / exportable reports
- No team/multi-user support
- No Salesforce integration (broker also uses Salesforce at Ripco)

---

## Your Task

Acting as both a **senior UX designer** and a **commercial real estate / self-storage broker**, give your best suggestions for:

1. **New features to add** — what would make this more powerful for a storage broker's daily workflow? Think about what data matters most, what actions happen repeatedly, what information is hard to track manually.

2. **UI/UX improvements** — what would make this feel more like a professional-grade CRM (think Monday.com, HubSpot, CoStar)? What's cluttered, what's missing, what hierarchy is wrong?

3. **Brokerage-specific tools** — what specialized features do storage brokers actually need that generic CRMs don't have? (BOV templates, cap rate calculators, market comps, buyer criteria matching, etc.)

4. **Prioritization** — rank your top 5 suggestions by impact vs. effort.

Be specific and practical. This is a working tool used every day — suggestions should be actionable, not theoretical.
