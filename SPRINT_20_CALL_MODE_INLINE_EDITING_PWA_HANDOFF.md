# Sprint 20: Call Mode Inline Editing + PWA Foundation

## 1. Objective
Make Call Mode more usable during real calling sessions by letting Brandon fix contact details without leaving the calling workspace, then close the biggest mobile/PWA shell issues that were getting in the way of daily use.

This sprint was a workflow-polish sprint. It did not change Analyst underwriting, TractIQ, Supabase secrets, or financial model logic.

## 2. Commit Range
- `af7fecf` — Sprint 20: Inline contact editing in Call Mode
- `5b8a6f7` — Sprint 20b: Direct click-to-edit owner name and facility in Call Mode header
- `7d75ea1` — Sprint 20c: Move to Master Database from Call Mode
- `cbbfff8` — Sprint 20d: Fix modal scroll trap + make the CRM an installable PWA

## 3. Files Modified / Created
Modified:
- `src/components/Database.jsx`
- `src/components/ui/ModalLayout.jsx`
- `index.html`
- `vite.config.js`
- `.claude/launch.json`

Created:
- `public/manifest.webmanifest`
- `public/icon-192.png`
- `public/icon-512.png`
- `scripts/build-pwa-icons.mjs`
- `SPRINT_20_CALL_MODE_INLINE_EDITING_PWA_HANDOFF.md`

## 4. Behavior Changed
- Call Mode gained inline edit controls for contact details.
- Owner name and facility name in the Call Mode header became directly editable.
- Call Mode gained a one-click path to move a worked contact into Master Database.
- Modal scroll locking was hardened so the page does not get trapped after modal close.
- The CRM became installable as a PWA with a manifest and app icons.
- Vite config / local preview setup was adjusted to support the app shell.

## 5. Why It Matters
Call Mode is one of the highest-frequency workflows in the CRM. During cold calling, Brandon often discovers the owner name, facility name, address, email, or list status is wrong while he is on the card. Before this sprint, fixing those details meant breaking flow. After this sprint, the calling workspace can absorb quick corrections in place.

The PWA work matters because Brandon uses the CRM like an operating system. Installing it as an app and avoiding mobile scroll traps makes it feel less like a fragile browser tab.

## 6. Known Issues / Carry Forward
- Call Mode inline editing is intentionally scoped to practical calling fields, not a full replacement for Contact Detail.
- PWA installability does not mean offline mode exists. The app still relies on Supabase and live network access.
- `.claude/launch.json` is local tooling; do not let temporary port changes drift into unrelated commits.

## 7. Protected Areas Not Touched
- `api/analyst.js`
- `api/_financialModel.js`
- `src/data/financialModel.js`
- `src/lib/excelModel.js`
- `public/model-template.xlsm`
- TractIQ OAuth / `app_secrets`

## 8. Recommended Follow-Up
- Continue polishing Call Mode so common corrections can happen without leaving the queue.
- Verify PWA behavior in a normal browser/device, not only embedded automation.
- Keep modal scroll-lock behavior under watch whenever new modals are added.
