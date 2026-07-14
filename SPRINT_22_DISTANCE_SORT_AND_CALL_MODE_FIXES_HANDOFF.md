# Sprint 22: Distance Sorting + Call Mode Closeout Fixes

## 1. Objective
Make imported lists and Call Mode queues easier to work geographically, and close several practical Call Mode issues that were slowing down live calling.

## 2. Commit Range
- `1b86699` — Make Call Mode addresses easy to copy
- `3b1c5be` — Log callback dates in call history
- `1e5d7bf` — Allow deleting logged activities
- `51c6fc9` — Fix Next Contact button overflowing the Call Mode outcome card
- `5048aba` — Sprint 22: Sort lists and Call Mode by distance to a location

Related earlier fix:
- `f17eb28` — Fix facility address imports for ownerless lists, documented with Sprint 21 because it touched ownership/import foundations.

## 3. Files Modified / Created
Modified:
- `src/components/Database.jsx`
- `src/components/ActionLog.jsx`
- `src/components/ClientCard.jsx`
- `src/components/Dashboard.jsx`
- `src/components/PipelineBoard.jsx`
- `src/hooks/useCRM.js`
- `src/hooks/useDatabase.js`

Created:
- `src/lib/geo.js`
- `scripts/build-geo-data.mjs`
- `public/geo/places.json`
- `public/geo/zips.json`
- `SPRINT_22_DISTANCE_SORT_AND_CALL_MODE_FIXES_HANDOFF.md`

## 4. Behavior Changed
- Lists and Call Mode can be sorted by distance to a location.
- ZIP/place geo data is bundled under `public/geo/`.
- Call Mode addresses became easier to copy while calling.
- Callback due dates are recorded in call history.
- Logged activities can be deleted.
- The Next Contact button no longer overflows the Call Mode outcome card.

## 5. Why It Matters
Storage calling is heavily market-based. Sorting by distance lets Brandon work a list around a real geographic target instead of scanning owners randomly. The Call Mode fixes also reduce friction in the most repeated daily workflow: call, log, move on, and preserve the useful follow-up context.

## 6. Data / Safety Notes
- `public/geo/places.json` and `public/geo/zips.json` are generated assets. Rebuild them through `scripts/build-geo-data.mjs` if their source process changes.
- Deleting logged activities should stay explicit and scoped. Do not add bulk-delete behavior without a separate safety review.

## 7. Known Issues / Carry Forward
- Distance sorting depends on available location strings and bundled geo data; messy addresses can still fail to sort perfectly.
- This sprint did not add a full map view.
- Activity deletion was added, but no audit/undo layer was introduced.

## 8. Protected Areas Not Touched
- Analyst underwriting and Excel export
- TractIQ OAuth / service-role flows
- Backup encryption/passphrase logic

## 9. Recommended Follow-Up
- Consider visible distance labels in list/call rows if Brandon wants to understand the sort order at a glance.
- Keep address normalization improvements tied to real import examples.
- If activity deletion becomes common, consider an undo/restore pattern rather than hard deletion.
