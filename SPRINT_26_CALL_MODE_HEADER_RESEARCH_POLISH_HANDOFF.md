# Sprint 26: Call Mode Header Research Polish

## 1. Objective
Make Call Mode faster to use on a live call by promoting the property address into the header area, putting address copy and Whitepages lookup next to it, moving duplicate/same-owner prompts lower, and making multiple mailing addresses easy to add from Call Mode / contact creation surfaces.

## 2. Scope
This was intentionally brief and limited to Call Mode layout/research polish.

Touched:
- `src/components/Database.jsx`
- `src/hooks/useCRM.js`
- `src/lib/researchLinks.js`
- `sql/pipeline_commission_support_migration.sql`

Not touched:
- Analyst underwriting
- Financial model / Excel export
- TractIQ OAuth
- Supabase schema
- Backup workflow

## 3. Behavior Changed
- Facility address now appears directly under owner/facility in the Call Mode header.
- A `Copy Address` button sits beside that address.
- A `Whitepages` button sits beside the address and builds its lookup from:
  - owner name
  - city/state parsed from the property address when available
- Same-owner / duplicate ownership radar moved lower, between Call Notes and the outcome buttons.
- Call Mode's collapsed Contact Details drawer now supports additional mailing addresses, not just the primary mailing address.
- Add Contact modal now supports additional mailing addresses at creation time.
- Existing Client edit and Contact Detail surfaces already supported additional mailing addresses and remain wired to the same `MailingAddressList` component.
- Commission-save audit found the live database has the commission columns but is missing adjacent client/contact support columns (`action_log`, `mailing_addresses`, and client ownership link). Added one consolidated repair SQL and tightened the frontend missing-column detector so unrelated missing columns are not mislabeled as the commission migration.

## 4. Why It Matters
On a call, Brandon needs the property address and quick owner lookup immediately, without opening the details drawer or switching to the full Research tab. Duplicate ownership is still useful, but it is secondary to knowing who he is calling and where the property is.

Mailing addresses are also discovered mid-call. The CRM already had the data model for multiple mailing addresses, so this sprint extends the live calling/contact-entry surfaces to use that same model instead of forcing Brandon to leave Call Mode.

## 5. Verification
To verify:
1. Open Database -> Call Mode.
2. Confirm owner/facility still edit inline.
3. Confirm property address appears under the facility.
4. Click `Copy Address` and confirm the address copies.
5. Click `Whitepages` and confirm it opens a Whitepages lookup using owner name plus address city/state.
6. Confirm same-owner/also-owns content appears lower, near the bottom of the call card.
7. Open Contact Details in Call Mode and confirm additional mailing addresses can be added/removed.
8. Open Add Contact and confirm additional mailing addresses can be entered before saving.
9. If commission saves still show a migration warning, run `sql/pipeline_commission_support_migration.sql` in Supabase, refresh, and re-test.

## 6. Follow-Up
- If Whitepages URL patterns change, update `buildWhitepagesLink()` in `src/lib/researchLinks.js`.
- If Brandon wants the broader research strip removed from the side panel, do that as a separate tiny cleanup after confirming this header shortcut is enough.
