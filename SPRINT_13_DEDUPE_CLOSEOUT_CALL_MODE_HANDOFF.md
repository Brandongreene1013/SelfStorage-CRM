# Sprint 13: Dedupe Closeout + Call Mode Continuity

## 1. Sprint Objective
Finish the duplicate-review system so it is safe, reversible, and production-ready (dismissed-groups view, restore/un-dismiss, dead legacy code removed, clearer storage notice), and fix the daily Call Mode annoyance where queue position is lost across picker round-trips, navigation, or page reloads.

## 2. Summary of Changes
- **Dismissed groups view:** the Duplicate Review Center's filter row gained a "Dismissed (N)" pill. It lists every dismissed group that still exists in the current scan as a compact row — member names, confidence, match reasons, and "Hidden because you marked it 'Not a duplicate' on YYYY-MM-DD" (date/note from the dismissal record). Dismissed groups are excluded from the active counts and the sidebar badge (unchanged from Sprint 12).
- **Restore / un-dismiss:** each dismissed row has an "↩ Restore to Review" button wired to the existing `restoreDuplicateGroup(pairKey)` hook. Restoring removes the dismissal from both stores (Supabase + localStorage) and the group reappears in active review. No contacts are touched by dismiss or restore.
- **Dismissal records now carry metadata:** `useDatabase` state changed from a bare Set of pair keys to full records `{ pairKey, note, createdAt }` (exposed as `duplicateDismissals`, with `dismissedDuplicateKeys` still derived as a Set for cheap filtering). The Supabase load now selects `note` and `created_at` too.
- **Clearer local-only notice:** when dismissals are on the localStorage fallback, the Review Center shows a blue callout: "Dismissals are saved on THIS DEVICE ONLY. Run sql/duplicate_dismissals_migration.sql once in the Supabase SQL Editor…".
- **Dead legacy code removed:** `removeDuplicates`, `dupKeys`, and `dupScore` deleted from `useDatabase.js`. Grep confirmed no references outside the function itself (the UI button was retired in Sprint 12). The Duplicate Review Center is now the only duplicate workflow in the codebase.
- **Call Mode continuity:** per-queue positions (`callQueuePositions`) now hydrate from and persist to localStorage (`storageHero.callQueuePositions`), and every index change also saves an active-session descriptor (`storageHero.callSession`: queueKey, listId, label, index, total, current contactId, savedAt). The queue picker shows an amber "Resume call session: 37 of 212 contacts — <queue>" banner with **▶ Resume** and **Start Over** buttons. Resume validates against the LIVE queue first: it prefers relocating the saved contact by id (so the position survives queue reordering/shrinkage), falls back to a clamped index, and the banner is suppressed entirely when the saved list no longer exists, the queue is empty, or the effective position is 0. If the queue size changed, the banner notes "queue was N contacts when saved". Start Over clears the saved session.
- **Research Hub copy chips:** new `CopyChips` component in `ResearchLinks.jsx` — one-click copy for Owner / Facility / Phone / Address (only fields that exist), with an inline "✓ Copied" flash on the clicked chip. Added to the Contact Detail Owner Research panel and, in compact form, under the Call Mode research strip. No mailing/entity chip: contacts have no mailing-address column (Sprint 11/12 documented limitation) and the entity name IS the owner name.

## 3. Files Created
- `SPRINT_13_DEDUPE_CLOSEOUT_CALL_MODE_HANDOFF.md`

## 4. Files Modified
- `src/hooks/useDatabase.js` — dismissal records with metadata; legacy `removeDuplicates`/`dupKeys`/`dupScore` deleted; `duplicateDismissals` exported.
- `src/components/DuplicateReview.jsx` — Dismissed filter pill, dismissed-rows view with Restore, clearer local-only notice, counts adjusted.
- `src/components/Database.jsx` — localStorage-backed call positions + session descriptor, resume banner wiring in the picker, resume/clear handlers, new dismissal props passed through.
- `src/components/ResearchLinks.jsx` — `CopyChips` component, added to panel and strip.

## 5. Migration Status
**`sql/duplicate_dismissals_migration.sql` has still NOT been run in Supabase** (verified live this session: PGRST205, table not found). The migration file was re-inspected: it is idempotent (`create table if not exists`, `drop policy if exists` before `create policy`) and non-destructive. The app correctly detects the missing table and runs on the localStorage fallback, now with a prominent in-app notice. **Brandon: run that one file in the Supabase SQL Editor whenever convenient** — dismissals then become permanent and cross-device. Nothing breaks in the meantime, and no production migration was auto-run this sprint.

## 6. Manual Testing Completed
All live against the real Supabase-backed dev server, QA-fixture records only:
- Migration status check (table missing → localStorage mode confirmed, blue notice shown).
- Dismiss QA group → "Dismissed (1)" pill → dismissed row shows names, confidence, reasons, dismissal date, explanation line.
- Reload → dismissal persisted (localStorage path).
- Restore to Review → group returned to active list, Dismissed (0), localStorage emptied.
- Merge → "Merged — 1 phone added as alternate" → confirmed delete → group resolved, counter incremented (Sprint 11/12 flow regression-tested).
- Call Mode: entered All Contacts queue, advanced to 4 of 451, **full page reload**, picker offered "Resume call session: 4 of 451 contacts — All Contacts" with saved timestamp; Resume landed on the exact same contact (matched by contact id); Dashboard→Database round-trip kept the banner; Start Over cleared the banner and localStorage. No outcomes were logged on real contacts — navigation only.
- Copy chips render in Contact Detail (Owner/Facility/Phone/Address) and Call Mode (compact). Clipboard write verified mechanically; the headless preview tab returns `NotAllowedError: Document is not focused`, which is a test-environment limitation (secure context confirmed, click-gesture + focused tab in a real browser satisfies the API).
- Import modal opens; Dashboard, Pipeline, Clients, Analyst, Calendar, Database all render.
- `node scripts/qa-seed.mjs cleanup` → verified clean (0/0/0).

## 7. Build / Lint Results
- `npm run build`: passed (existing large-chunk warning only).
- `npm run lint`: 55 problems (46 errors, 9 warnings) — exactly the known baseline, no new categories.

## 8. Known Issues
- Migration still pending (see §5) — the only action item for Brandon.
- localStorage dismissals are NOT auto-migrated into Supabase after the migration runs; re-dismissing is one click per group.
- Copy chips could not be end-to-end verified in the headless preview (focus requirement); code path is standard `navigator.clipboard.writeText` on click.
- Saved call session stores one session (the most recent); switching between two queues alternately overwrites the descriptor — per-queue positions still persist independently, so nothing is lost beyond which banner is offered.
- Real database still has ~24 duplicate groups pending Brandon's one-by-one review. Do not bulk-delete.

## 9. What Not To Touch
`api/analyst.js`, `api/_financialModel.js`, `src/data/financialModel.js`, `src/lib/excelModel.js`, `public/model-template.xlsm`, TractIQ OAuth/secrets, Supabase service-role logic, `app_secrets`. Don't fix the lint baseline as a side effect. The Duplicate Review Center is now the sole duplicate workflow — don't reintroduce bulk auto-delete.

## 10. Recommended Sprint 14 Focus
1. Brandon runs `sql/duplicate_dismissals_migration.sql`, then works the ~24 real duplicate groups with dismiss/restore/merge — the system is now fully reversible and production-ready for that.
2. Surface Today's/Overdue callback counts on the Dashboard deep-linking into the exact Call Mode queues (long-standing suggestion).
3. Appt Set → Calendar meeting creation, if a clean integration path exists (deferred since Sprint 6).
4. Consider auto-migrating localStorage dismissals into Supabase on first successful table read.
