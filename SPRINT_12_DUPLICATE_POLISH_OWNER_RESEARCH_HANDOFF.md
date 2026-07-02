# Sprint 12: Duplicate Polish + Owner Research Hub

## 1. Sprint Name
Sprint 12: Duplicate Polish + Owner Research Hub.

## 2. Sprint Objective
Make the Sprint 11 Duplicate Review Center safe and fast enough for Brandon's real 24-group backlog (persistent dismissals, retire the auto-deleting legacy button, post-import nudge, filters/counts, protection explanations), and add an Owner Research Hub so researching an owner/property is one click instead of re-typing the same data into Google, Whitepages, Maps, LinkedIn, the county appraiser, or a Secretary of State search.

## 3. Summary of What Changed
**Part A — duplicate polish:** "Not a duplicate" dismissals now persist (Supabase table with localStorage fallback); the Master Database "Remove Duplicates" auto-deleter is retired and replaced with a "Review Duplicates (N)" button routing to the Review Center; import success shows a "X possible duplicates found → Open Duplicate Review" nudge; the Review Center header gained a warning banner, High/Medium confidence filters, remaining/resolved/dismissed counts, and a Next Group scroll button; every record card now shows plain-language keep/protection signals.
**Part B — research hub:** a pure link-builder (`src/lib/researchLinks.js`) powers a full Owner Research panel in Contact Detail (with research-note capture) and a compact six-button strip in Call Mode, both replacing the old hardcoded link blocks.

## 4. Files Created
- `sql/duplicate_dismissals_migration.sql`
- `src/lib/researchLinks.js`
- `src/components/ResearchLinks.jsx`
- `SPRINT_12_DUPLICATE_POLISH_OWNER_RESEARCH_HANDOFF.md`

## 5. Files Modified
- `src/lib/duplicateReview.js` (added `keepSignals`)
- `src/components/DuplicateReview.jsx`
- `src/hooks/useDatabase.js`
- `src/components/Database.jsx`
- `src/components/ImportListModal.jsx`

## 6. Persistent Duplicate Dismissals
- New table `duplicate_dismissals` (`id`, `pair_key` unique, `contact_ids` jsonb, `note`, `created_at`) — **migration `sql/duplicate_dismissals_migration.sql` is NOT yet run in Supabase; Brandon should run it once.** It's idempotent and adds permissive RLS matching the other app tables.
- `pair_key` is the duplicate group key (member contact ids sorted + joined with `|`), so it's order-independent, and if any member is deleted the group can never regenerate under that key — stale rows are harmless.
- Until the migration runs, the app detects the missing table (42P01/PGRST205) and transparently falls back to **localStorage** (`storageHero.duplicateDismissals`). Dismissals still survive reload on that device; the Review Center shows a one-line notice that they're device-local until the migration is run. Verified live: dismiss → reload → still dismissed (localStorage path, since the table doesn't exist yet).
- `useDatabase` exposes `dismissedDuplicateKeys` (Set), `dismissalStorage` ('supabase' | 'local'), `dismissDuplicateGroup(pairKey, contactIds, note)` (upsert; falls back to localStorage on any write failure), and `restoreDuplicateGroup(pairKey)` (removes from both stores — no UI for it yet).
- The sidebar badge and Master DB button count now exclude dismissed groups.

## 7. Old Remove Duplicates Replacement
The Master Database toolbar button is now "🧹 Review Duplicates (N)" and simply routes to the Duplicate Review subview. The old score-and-bulk-delete path is unreachable from the UI; the `removeDuplicates` function remains in `useDatabase.js` (unused, kept to avoid churn) — a future sprint can delete it. Brandon can no longer bulk-delete duplicates with one confirm.

## 8. Post-Import Duplicate Nudge
`ImportListModal` takes a new `onOpenDuplicateReview` prop (wired from both the new-list and Master DB bulk-upload modals in `Database.jsx`). After a successful import, if any duplicates were flagged/skipped/appended, an amber bar shows "X possible duplicates found in this import" with an **Open Duplicate Review** button that closes the modal and opens the Review Center. Verified live: imported a 1-row CSV duplicating a QA contact → nudge showed "1 possible duplicate found" → button routed into the Review Center where the new group was detected. No second duplicate system was created — it's a pointer to the existing center.

## 9. Duplicate Review UX Polish
Header now has: warning banner ("Review before deleting. Worked records with calls/tasks/notes are protected…"), All/High/Medium filter pills with live counts, "X remaining · Y resolved this session · Z dismissed", and a **Next Group ↓** button that smooth-scrolls through group cards (cycling). Group cards are wrapped in `[data-dup-group]` divs for the scroll targeting. Verified live: filters showed High (24)/Medium (0) on real data, resolved counter incremented after a delete, Next Group scrolled.

## 10. Protection / Recommendation Explanation
`keepSignals(contact, { openTaskCount })` in `duplicateReview.js` returns ordered plain-language chips rendered on every record card: 🛡 "Has call history (N)" and "N open tasks" (protective, emerald), "Conversation status"/"Appointment set"/"Callback promised", "Has notes", "Manual/worked record" (no source/import metadata), or "Imported: TractIQ/Reonomy/…". A record with no signals shows "No work logged — safe to merge away."

## 11. Research Link Helper Logic
`buildResearchLinks(contact)` in `src/lib/researchLinks.js` (pure, Node-tested): city/state parsed from `city`/`market`/`state`; entity detection via keyword regex (LLC, Inc, Corp, Holdings, Properties, Investments, Capital, Group, Trust, …). Links generated only when the underlying data exists: Google Owner (`"name" self storage city state`), Google Facility, Google Address, Maps (`maps/search/?api=1&query=<property address>`; facility-query fallback when no address), Whitepages, LinkedIn (people search for persons, company search for entities), County Appraiser, Secretary of State, plus direct links to Reonomy/CoStar/TractIQ search pages (paid platforms aren't Google-indexable, so the platform's own search is more useful than a Google-targeted query — Brandon is logged in and the data to paste is on the card). `buildResearchStrip(contact)` returns the tight Call Mode six: Maps, Whitepages, Google, LinkedIn, County, SOS.

## 12. Contact Detail Owner Research Panel
`OwnerResearchPanel` (in `src/components/ResearchLinks.jsx`) replaces the old hardcoded "Find Business Info" block in the Contact Detail modal. All links open in new tabs (`target="_blank" rel="noopener noreferrer"`). Entity-style owners get a purple "Entity owner — check Secretary of State for the real principal" callout and a ★-emphasized SOS button. Verified live on a real contact: 9 links rendered (facility-less contact correctly omitted Google Facility and SOS omitted without state data).

## 13. Call Mode Research Strip
`ResearchStrip` replaces the old 4-link Research box in the Call Mode sidebar — a 3×2 grid of compact buttons (Maps · Whitepages · Google · LinkedIn · County · SOS), each conditional on data. The old `RESEARCH_LINK_CLASSES`/`contactSearchQuery` dead code in `Database.jsx` was removed. Verified live in an All Contacts call session.

## 14. Whitepages / County / SOS Behavior
- **Whitepages:** personal names get the direct pattern `whitepages.com/name/First-Last/City-ST` (location segment only when city+state known). Entity owners or name-less contacts fall back to a targeted Google query `site:whitepages.com "name" "city" state phone`; phone-only contacts get `site:whitepages.com <phone>`.
- **County appraiser:** V1 Google query `"property appraiser" <property address>` (facility+market fallback). No county-specific integrations.
- **Secretary of State:** Google query `<full state name> secretary of state business search "<owner>"` — state abbreviations expand ("TX" → "Texas") so the state SOS site ranks first. Emphasized for entity-style owners.

## 15. Research Notes Handling
No new table. The panel has an inline input + "+ Add Research Note" button that appends `[Research YYYY-MM-DD] <text>` to the contact's existing notes, routed **through the Contact Detail modal's own notes state** so an unsaved draft in the notes textarea is never clobbered, then persisted immediately. Verified live: note landed in Supabase `contacts.notes` with the prefix. Call Mode intentionally has no separate research-note input — its main notes textarea already serves that purpose.

## 16. Existing Features Confirmed Working
Live browser run after all changes: Dashboard, Pipeline, Clients, Analyst, Calendar, Database all render; Call Mode queue picker + live call session render (strip verified in-session); Smart Import loads a CSV via the modal, flags/matches duplicates (Sprint 9/10 behavior intact), imports, and shows the Sprint 10 summary; Duplicate Review merge → verify → delete cycle re-verified end-to-end on the QA pair; build passes.

## 17. Bugs Fixed
None found in existing code this sprint (the launch.json fix landed in Sprint 11).

## 18. Known Issues / Risks
- **`sql/duplicate_dismissals_migration.sql` has not been run** — dismissals are device-local (localStorage) until Brandon runs it. The Review Center shows a notice; after the migration, existing localStorage dismissals are NOT auto-migrated (re-dismissing is one click; a group dismissed locally will reappear on other devices until re-dismissed there).
- `restoreDuplicateGroup` exists in the hook but has no UI — an "undo dismiss / show dismissed" view is a natural Sprint 13 item.
- `removeDuplicates` is dead code in `useDatabase.js` (kept deliberately); delete it in a future cleanup.
- Reonomy/CoStar/TractIQ links open the platform search page without prefilled queries (their apps don't accept public query URLs); Brandon pastes from the card.
- Direct Whitepages name-URL pattern could change upstream; the Google-fallback path is unaffected.
- During browser QA the preview tab once went blank after heavy interaction (likely a `tel:` anchor navigation) — an environment/testing artifact, not reproducible as an app bug; no console errors at any point.
- Real database still has ~24 duplicate groups awaiting Brandon's review.

## 19. What Not To Touch in Future Sprints
`api/analyst.js`, `api/_financialModel.js`, `src/data/financialModel.js`, `src/lib/excelModel.js`, `public/model-template.xlsm`, TractIQ OAuth/secrets, Supabase service-role logic, `app_secrets`. Don't "fix" the lint baseline as a side effect.

## 20. Recommended Sprint 13 Focus
1. Have Brandon run `sql/duplicate_dismissals_migration.sql`, then work the ~24 real duplicate groups with the new workflow.
2. "Show dismissed groups" view with un-dismiss (the hook function already exists).
3. Delete the dead `removeDuplicates` function.
4. Persist Call Mode queue position across picker round-trips (long-standing known issue #2).

## 21. Local Testing Completed
- Node unit test of `researchLinks.js`: person links (all 11), entity links (SOS ★, LinkedIn company search, Whitepages Google-fallback), phone-only fallback, strip composition.
- Live browser (real Supabase dev server): header banner/filters/counts/Next Group; keep-signal chips on both QA records; dismiss → reload → persists (localStorage path) → un-dismiss via storage clear → group returns; merge (1 phone appended, verified) → confirm modal warnings → delete → resolved counter; Master DB "Review Duplicates (24)" routes with no auto-delete path; CSV injected into the import modal → duplicate flagged + matched → import → nudge → routed to Review Center with the new group; Owner Research panel (9 conditional links, all new-tab); research note persisted to Supabase with `[Research 2026-07-02]` prefix; Call Mode strip; all-views smoke.
- QA cleanup verified: 0 QA lists/contacts/tasks, nudge-test list removed, localStorage empty.

## 22. Production Testing Completed or Pending
Pending after deploy. Run `node scripts/qa-seed.mjs seed-duplicates`, repeat dismiss-reload and merge/delete once on the live URL, then `cleanup`. Don't touch the real duplicate groups until Brandon approves them one by one.

## 23. Build / Lint Results
- `npm run build`: passed (existing large-chunk warning only).
- `npm run lint`: 55 problems (46 errors, 9 warnings) — exactly the known baseline. One new finding appeared mid-sprint (`loadDismissals` accessed-before-declared) and was fixed by converting it to a `useCallback` declared before the effect.

## 24. Commit Hash
See `git log -1 --oneline` after commit (reported in session closeout).

## 25. Deployment Notes
No new env vars. One **optional-but-recommended** migration: `sql/duplicate_dismissals_migration.sql` (app works without it via localStorage fallback). Push to `claude/storage-investment-crm-vV018` auto-deploys via Vercel.

## 26. Context for ChatGPT Review
Start with `src/lib/researchLinks.js` (pure link builder + entity detection) and the `keepSignals` addition in `src/lib/duplicateReview.js`. Then `src/components/ResearchLinks.jsx` (panel + strip), the DuplicateReview.jsx header/filter/dismissal changes, the dismissal persistence block in `useDatabase.js` (Supabase-first, localStorage fallback, missing-table detection), and finally the small wiring diffs in `Database.jsx` (button replacement, props, old link blocks removed) and `ImportListModal.jsx` (nudge). Deliberate scope cuts: no un-dismiss UI, no prefilled Reonomy/CoStar/TractIQ queries (platform limitation), no county-specific appraiser integrations, research notes reuse `contacts.notes`.
