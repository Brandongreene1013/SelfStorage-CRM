# Sprint 11: Duplicate Review Center

## 1. Sprint Name
Sprint 11: Duplicate Review Center + Existing Contact Merge.

## 2. Sprint Objective
Give Brandon a way to find duplicate owner records already inside the Database (not just at import time), see why they match, keep the worked record, merge useful info (extra phones, email, address) into it, and delete the weaker imported copy only after explicit confirmation. Driven by the real Dr. Teekam case: same owner + same property address, different phone numbers, one worked conversation record vs one fresh mass-list import.

## 3. Summary of What Changed
- New pure-logic module `src/lib/duplicateReview.js`: normalization, pair detection, group clustering, confidence/reason labels, recommended-keep scoring, and a fill-blanks-only merge plan builder. No React/Supabase imports, so it is testable straight from Node.
- New `src/components/DuplicateReview.jsx`: the review panel — duplicate groups sorted High-confidence first, side-by-side record cards, keeper radio selection, merge button, and a delete confirmation modal with explicit data-loss warnings.
- `src/hooks/useDatabase.js`: added `mergeDuplicateContact(masterId, weakerId)` (uses the merge plan + existing column-fallback update path) and mapped `contacts.created_at` → `createdAt` for tie-break scoring.
- `src/components/Database.jsx`: new "🧹 Duplicate Review" entry in the sidebar Views section with a live amber group-count badge; renders the panel cross-list (independent of the selected list, like Call Mode).
- `scripts/qa-seed.mjs`: new `seed-duplicates` command creating the fake Dr. Teekam pattern pair.
- `.claude/launch.json`: the committed file pointed at a different project (`prospector-dev` at `C:\Users\bgreene\StorageProspector`, port 5174) — fixed to `storage-hero-dev`, this repo, port 5173, matching what NEXT_SESSION_HANDOFF.md describes.

## 4. Files Created
- `src/lib/duplicateReview.js`
- `src/components/DuplicateReview.jsx`
- `SPRINT_11_DUPLICATE_REVIEW_CENTER_HANDOFF.md`

## 5. Files Modified
- `src/hooks/useDatabase.js`
- `src/components/Database.jsx`
- `scripts/qa-seed.mjs`
- `.claude/launch.json`

## 6. Migration Verification
Verified live against Supabase with the app's publishable key before building:
- `contacts.source`, `contacts.import_filename`, `contacts.imported_at` — **exist**.
- `lists.import_filename`, `import_row_count`, `ready_to_call_count`, `duplicate_skipped_count`, `merged_duplicate_count`, `additional_phone_count` — **exist**.

Brandon's run of `sql/contact_import_source_tracking_migration.sql` worked. No fallback paths were needed, but all Sprint 10 fallbacks remain in place, and `mergeDuplicateContact` reuses `updateContactWithFallback`, so a rollback of the migration would degrade gracefully rather than break.

## 7. Duplicate Detection Logic
`findDuplicateGroups(contacts, { getOpenTaskCount })` in `src/lib/duplicateReview.js`:
- **Normalization:** lowercase, punctuation stripped, whitespace collapsed. Addresses map long tokens to short (street→st, road→rd, lane→ln, drive→dr, avenue→ave, boulevard→blvd, highway→hwy, north→n, south→s, east→e, west→w, plus pkwy/pl/ct/cir/ste/apt/etc.), so "2126 N Josey Ln" == "2126 North Josey Lane". Phones compare on last-10 digits. Owner names are lightly normalized: entity noise tokens (LLC, Inc, Trust, Holdings, Dr, Jr, …) are stripped.
- **Name similarity:** exact normalized match = "same"; shorter name's tokens ⊂ longer name's tokens (with at least one token ≥3 chars) = "similar" — so "Dr. Teekam" matches "Teekam Holdings LLC".
- **Candidate generation:** contacts are bucketed by phone key, email, normalized address, owner+market, facility+market, and address+owner-token, then only in-bucket pairs are compared (no n² scan; buckets over 40 members are skipped as bad data). Confirmed pairs are union-find-clustered into groups.
- **Signals:** primary/alternate phone overlap in either direction, email, address+owner (same or similar), address+facility, owner+market, facility+market. Detection never relies on phone alone matching name — but a phone match by itself IS flagged (that's the point of phones).

## 8. Confidence / Reason Logic
- **High:** Same phone · Alternate phone match · Same email · Same address + owner · Same address + facility.
- **Medium:** Same address + similar owner · Same owner + market · Same facility + market (name must be ≥4 chars so a generic word can't cluster a whole market).
- **Low:** reserved in the styling but not currently emitted — v1 only surfaces High/Medium so the list stays actionable. Every group card shows the confidence chip plus one chip per matched reason.
- Mailing-address matching was **not** built: `mailingAddress` is parsed at import time but never persisted to a contacts column, so there is nothing to compare. Documented limitation.

## 9. Duplicate Review Center UX
Sidebar → Views → "🧹 Duplicate Review" (amber badge = live group count). The panel is cross-list and works with no list selected, like Call Mode. Each group card shows: confidence chip, reason chips, one record card per member (owner, facility, primary + alternate phones, email, address, status badge, source badge, containing list, call count, open-task count, notes indicator, added date), a "★ RECOMMENDED" tag, keeper radio, per-duplicate Merge and Delete buttons, and a session-only "Not a duplicate" dismiss. Groups of 3+ work: the keeper is pinned first and each other member gets its own merge/delete pair.

## 10. Recommended Keep Logic
`keepScore` (higher wins): call history ×30/call (cap 10) · open tasks ×25 (cap 5) · worked status (conversation/appointment/callback) +60 · other non-fresh status +15 · notes +20 · lead temp +10 · activity log +10 · no source/import metadata (manually entered) +12 · field completeness +3 each · alternate phones +2 each. Ties keep the older `createdAt`. Client/pipeline relationship could not be used — contacts have no FK to clients (promotion copies the record) — documented limitation. A record with call history or open tasks is "protected": it is never the recommended delete target by construction (its score dominates), and deleting it anyway triggers an extra red warning.

## 11. Merge Behavior
`buildMergePlan(master, weaker)` → applied by `mergeDuplicateContact`:
- Weaker primary + alternate phones not already on master → appended to `alternate_phones` (weaker's labels preserved; primary arrives as "Unknown").
- If master's primary phone is blank, weaker's primary fills it; master's populated primary is **never** overwritten.
- ownerName / facilityName / email / address / state fill **blanks only**.
- Weaker's notes (if not already contained) plus a `Merged duplicate record (source: …)` context line are appended to master's notes.
- Tasks are not moved or deleted; call history is not moved (weaker's history dies with it — the delete modal says so).

## 12. Delete / Archive Weaker Duplicate Flow
Merging automatically opens "Delete weaker duplicate?" (also reachable directly per duplicate). The modal warns: cannot be undone · call history on the deleted record is lost · related tasks remain and may need cleanup (with live open-task count) · extra red banner if the target has call history or open tasks. "Keep It" cancels; nothing is ever deleted without this confirmation. No archive status was added — there's no suitable existing status and inventing one would pollute Call Mode queues; "Not a duplicate" (session-only dismiss) covers the keep-both case. Documented limitation: dismissals don't persist across reloads.

## 13. Dr. Teekam Pattern QA
`node scripts/qa-seed.mjs seed-duplicates` creates two "QA Test Dr Duplicate" contacts: same fake owner, same fake address in two formats ("2126 QA Josey Lane, Carrollton, TX 75006" vs "2126 QA Josey Ln Carrollton TX 75006"), different phones, one conversation record with call history vs one fresh TractIQ-sourced import. Fake name/address on purpose so detection can never cross-match the real Dr. Teekam records (which were never touched). Live run verified end-to-end in the browser: group flagged High with "Same address + owner" + "Same address + facility" → recommended keep = conversation record → merge added (555) 020-0002 as alternate, filled blank email, did not overwrite the primary phone (confirmed by direct Supabase read) → delete confirmed → group count dropped 28 → 27 and the QA group disappeared. `qa-seed.mjs cleanup` then removed all QA rows (existing safety rules already cover the new contacts).

## 14. Existing Features Confirmed Working
Browser smoke after the full merge/delete cycle: Dashboard, Pipeline, Clients, Analyst, Calendar, Database all render; Call Mode queue picker opens; Import modal opens with source/mapping UI (Sprint 9/10 flow untouched — no import code was modified); Import History panel renders; source badges intact. Build passes.

## 15. Bugs Fixed
- `.claude/launch.json` in the repo pointed at a different machine's project (`C:\Users\bgreene\StorageProspector`) — the preview tool could never have launched this app from it. Fixed to `storage-hero-dev` on port 5173.

## 16. Known Issues / Risks
- Brandon's **real database currently shows 27 duplicate groups (all High confidence)** waiting for review once this deploys. Review them in the UI; do not bulk-delete.
- The old "Remove Duplicates" button on Master Database still exists and still auto-deletes by score with a single confirm. It predates this sprint; consider pointing it at the Review Center in a future sprint.
- "Not a duplicate" dismissals are session-only (reload brings the group back). Persisting them needs a small table/column — deferred.
- No contact↔client linkage exists, so pipeline relationship can't boost keep-scoring.
- Mailing-address matching not possible (column never persisted).
- Duplicate group count is O(buckets) per contacts change — fine at 470 contacts; if the DB grows to tens of thousands, consider debouncing the sidebar badge.
- `preview_screenshot` timed out in this environment (page itself healthy — eval/DOM checks all passed); verification was DOM-based.

## 17. What Not To Touch in Future Sprints
`api/analyst.js`, `api/_financialModel.js`, `src/data/financialModel.js`, `src/lib/excelModel.js`, `public/model-template.xlsm`, TractIQ OAuth/secrets, Supabase service-role logic, `app_secrets`. Also: don't "clean up" the lint baseline as a side effect.

## 18. Recommended Sprint 12 Focus
1. Walk Brandon through the 27 real duplicate groups in production (his data, his calls).
2. Persist "Not a duplicate" dismissals so reviewed pairs stay dismissed.
3. Retire or redirect the legacy Master DB "Remove Duplicates" auto-deleter into the Review Center.
4. Surface a "duplicates found" nudge after import completes (count already computed).

## 19. Local Testing Completed
- Node unit test of the detection engine: Teekam pattern (High, correct reasons, correct keep), alternate↔primary phone cross-match, facility+market Medium match, unrelated contact excluded, merge plan fill-blanks-only.
- Live browser run against real Supabase-backed dev server: full seed → detect → merge → verify in DB → delete → group-disappears cycle (section 13), plus all-views smoke (section 14).
- `node scripts/qa-seed.mjs status` clean before and after.

## 20. Production Testing Completed or Pending
Pending after deploy. Suggested: run `node scripts/qa-seed.mjs seed-duplicates`, repeat the merge/delete cycle once on the live URL, then `cleanup`. Do not merge/delete any of the 27 real groups until Brandon has eyeballed the recommendations.

## 21. Build / Lint Results
- `npm run build`: passed (existing large-chunk warning only).
- `npm run lint`: 55 problems (46 errors, 9 warnings) — identical to the known baseline; no new categories, no findings in the new files.

## 22. Commit Hash
See `git log -1 --oneline` after commit (reported in session closeout).

## 23. Deployment Notes
No new env vars, no new migrations (Sprint 10's migration is the prerequisite and is already applied). Push to `claude/storage-investment-crm-vV018` auto-deploys via Vercel.

## 24. Context for ChatGPT Review
Read `src/lib/duplicateReview.js` first — all detection/scoring/merge logic is there and pure. Then `src/components/DuplicateReview.jsx` (UI + confirm flow), then the small diffs in `useDatabase.js` (`mergeDuplicateContact`, `createdAt`) and `Database.jsx` (sidebar entry + subView wiring). Import-time duplicate handling (Sprint 9/10) was intentionally not modified. The deliberate limitations are: High/Medium only (no Low tier emitted), session-only dismissals, no mailing-address signal, no client-linkage signal.
