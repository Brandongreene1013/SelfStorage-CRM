# Storage Hero CRM — Handoff for Next Chat

You are working in this repo:
https://github.com/Brandongreene1013/SelfStorage-CRM

Live production app:
https://self-storage-crm.vercel.app/

Current production/default branch:
claude/storage-investment-crm-vV018

Latest commit on that branch: see `git log` — Sprint 7 ("Sprint 7: Add safe QA and call mode polish") is the most recent sprint.

Project context:
Storage Hero is a custom self-storage investment sales CRM / operating system for Brandon Greene at RIPCO. Used daily for sourcing owners, cold calling, logging outcomes, creating follow-ups, promoting owners into pipeline, scheduling meetings, and winning exclusive listings. Not a generic CRM — read `CLAUDE.md` at the repo root before doing anything, it has stack/deployment/convention details that override defaults.

--------------------------------------------------
SPRINT HISTORY (read the handoff docs at repo root, most recent first)
--------------------------------------------------

- `SPRINT_7_SAFE_QA_CALL_MODE_POLISH_HANDOFF.md` — Safe QA tooling + Call Mode polish. `scripts/qa-seed.mjs` (seed/status/cleanup) creates and safely deletes QA-prefixed test data so Call Mode/tasks/queues can be tested without touching real owners (see `QA_CALL_MODE_TESTING.md`). Call Mode now remembers queue position per queue for the session; the Dashboard command header shows Today's/Overdue callback counts (same shared logic as the picker, via `buildCallbackTaskQueue` in `tasks/taskUtils.js`); picker/queue copy clarified; Dashboard button renamed "Start Call Session".
- `SPRINT_6_CALL_MODE_QUEUE_PICKER_HANDOFF.md` — Call Mode now opens a queue picker first (Active List / Today's Callbacks / Overdue Callbacks / Follow-Up Needed / All Contacts), each with live counts and a stated reason. Today's/Overdue Callbacks are built from the universal tasks table (taskType `call`, relatedType `contact`), deduped, sorted by due date. Logging an outcome on a task-sourced contact now offers a "Complete existing callback task" checkbox (pre-checked for Conversation/Appt Set/Not Interested/Call Back). Task editing shipped — clicking any task row (Dashboard Tasks panel, RelatedTasks in ClientCard/contact detail/Call Mode sidebar) opens it in edit mode via `taskApi.updateTask`, fixing a real bug where `taskType` edits were silently dropped.
- `SPRINT_5_DASHBOARD_COMMAND_CENTER_HANDOFF.md` — Dashboard rebuilt into a "Today Command Center": header with today's counts, Today's Attack List (task-driven, ranked overdue→due-today), Pipeline Attention, Needs Follow-Up, one-click "Start Calling".
- `SPRINT_4_CALL_MODE_HANDOFF.md` — original Call Mode / broker calling workspace inside Database.
- `SPRINT_3_NEXT_ACTION_CONSOLIDATION_HANDOFF.md` — universal tasks became the single source of truth for "next action" across Dashboard/Clients/Database/Pipeline.

Post-Sprint-6 fix (commit 297b3cb, not yet in a numbered sprint doc): Needs Follow-Up was nagging about contacts already parked in the Master Database list (e.g. a real contact "Larry Crees" who's lukewarm, not actively worked). Fixed by excluding Master-Database-list contacts from that section's logic, and added a one-click "Move to Master DB" button on each Needs Follow-Up contact row so any similar false positive from an active list can be dismissed without leaving the Dashboard.

--------------------------------------------------
KNOWN ISSUES / RECURRING FLAGS — READ BEFORE STARTING NEW WORK
--------------------------------------------------

1. **QA seed/cleanup tooling now exists (Sprint 7)** — use `node scripts/qa-seed.mjs seed|status|cleanup` and follow `QA_CALL_MODE_TESTING.md` for any testing that logs outcomes or creates tasks. Never test against real contacts anymore. Note the script writes to the one shared Supabase project (there is no separate QA environment), so QA records are visible in the live app until cleanup runs.
2. **Queue position now persists per queue within a session (Sprint 7).** A full page reload deliberately resets it. Cross-reload resume (localStorage) remains unbuilt by choice.
3. **Appt Set outcomes don't create a Calendar meeting** — flagged as a "nice to have if clean" in Sprint 6, not built since it needs real Calendar integration.
4. Lint baseline sits at 55 problems (46 errors, 9 warnings) — pre-existing categories (API `process` globals, React Compiler hook findings in a few untouched files, unused vars, one empty block in `useOutlookCalendar.js`). Every sprint has confirmed no *new* category was introduced; don't try to "fix the baseline" as a side effect of an unrelated sprint — track lint count explicitly if asked to clean it up.
5. Local dev: the user (Brandon) often already has his own `npm run dev` running on port 5173. If Claude Code's preview tool can't bind port 5173, temporarily edit `.claude/launch.json`'s `storage-hero-dev` entry to use `--port 5180 --strictPort`, test, then **restore it to port 5173 exactly as it was** before finishing — don't leave that file's port changed in the final diff/commit.
6. Do not touch without explicit sprint instruction: `api/analyst.js`, `api/_financialModel.js`, `src/data/financialModel.js`, `src/lib/excelModel.js`, `public/model-template.xlsm`, TractIQ OAuth/secrets flow, Supabase service-role key logic.

--------------------------------------------------
CONVENTIONS THAT HAVE BEEN FOLLOWED (see CLAUDE.md for full detail)
--------------------------------------------------

- Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` — this is the project's CLAUDE.md standing instruction and has been used even when a sprint brief asked for a different co-author line (e.g. Codex), since CLAUDE.md explicitly says its instructions override.
- Each sprint gets its own `SPRINT_N_<NAME>_HANDOFF.md` at the repo root, written to be specific (not "improved X") — what changed, why it matters for Brandon's actual brokerage workflow, what wasn't built and why, recommended next sprint.
- Build + lint are run and reported every sprint; lint failures are expected (baseline), the bar is "no new category."
- Verification is done live against the real Supabase-backed local dev server (there's no separate QA environment yet — see known issue #1), using the Preview tool's `preview_eval`/`preview_snapshot` to drive the app and confirm real data behaves correctly, followed by manual cleanup of anything mutated.
- Push only when work is done and verified; production branch (`claude/storage-investment-crm-vV018`) auto-deploys via Vercel on push.

--------------------------------------------------
SUGGESTED WAY TO OPEN THE NEXT CHAT
--------------------------------------------------

Paste this file's content (or just reference it: "read NEXT_SESSION_HANDOFF.md at the repo root") plus whatever new sprint objective or bug report Brandon has. If it's a fresh feature sprint, the recommended next focus (from Sprint 7's handoff) is, in priority order:

1. Make the Dashboard callback pills clickable deep links straight into their Call Mode queue.
2. Revisit Appt Set → Calendar meeting creation if a clean integration path exists (deferred since Sprint 6).
3. Clean up the pre-existing Active-List index clamp in `Database.jsx`'s `handleCallOutcome` (see Sprint 7 handoff §13).

If it's a bug report or UX complaint instead (like the Needs Follow-Up fix above), treat it the way that one was handled: find the actual root cause in the relevant `build*` function or component, fix it directly, verify live against real data, clean up any test mutations immediately, then commit with a plain-language message (no sprint number needed for a small fix).
