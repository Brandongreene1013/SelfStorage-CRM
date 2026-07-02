# Storage Hero CRM — Handoff for Next Chat

You are working in this repo:
https://github.com/Brandongreene1013/SelfStorage-CRM

Live production app:
https://self-storage-crm.vercel.app/

Current production/default branch:
claude/storage-investment-crm-vV018

Latest commit on that branch: 297b3cb "Fix Needs Follow-Up nagging lukewarm Master Database leads"

Project context:
Storage Hero is a custom self-storage investment sales CRM / operating system for Brandon Greene at RIPCO. Used daily for sourcing owners, cold calling, logging outcomes, creating follow-ups, promoting owners into pipeline, scheduling meetings, and winning exclusive listings. Not a generic CRM — read `CLAUDE.md` at the repo root before doing anything, it has stack/deployment/convention details that override defaults.

--------------------------------------------------
SPRINT HISTORY (read the handoff docs at repo root, most recent first)
--------------------------------------------------

- `SPRINT_6_CALL_MODE_QUEUE_PICKER_HANDOFF.md` — Call Mode now opens a queue picker first (Active List / Today's Callbacks / Overdue Callbacks / Follow-Up Needed / All Contacts), each with live counts and a stated reason. Today's/Overdue Callbacks are built from the universal tasks table (taskType `call`, relatedType `contact`), deduped, sorted by due date. Logging an outcome on a task-sourced contact now offers a "Complete existing callback task" checkbox (pre-checked for Conversation/Appt Set/Not Interested/Call Back). Task editing shipped — clicking any task row (Dashboard Tasks panel, RelatedTasks in ClientCard/contact detail/Call Mode sidebar) opens it in edit mode via `taskApi.updateTask`, fixing a real bug where `taskType` edits were silently dropped.
- `SPRINT_5_DASHBOARD_COMMAND_CENTER_HANDOFF.md` — Dashboard rebuilt into a "Today Command Center": header with today's counts, Today's Attack List (task-driven, ranked overdue→due-today), Pipeline Attention, Needs Follow-Up, one-click "Start Calling".
- `SPRINT_4_CALL_MODE_HANDOFF.md` — original Call Mode / broker calling workspace inside Database.
- `SPRINT_3_NEXT_ACTION_CONSOLIDATION_HANDOFF.md` — universal tasks became the single source of truth for "next action" across Dashboard/Clients/Database/Pipeline.

Post-Sprint-6 fix (commit 297b3cb, not yet in a numbered sprint doc): Needs Follow-Up was nagging about contacts already parked in the Master Database list (e.g. a real contact "Larry Crees" who's lukewarm, not actively worked). Fixed by excluding Master-Database-list contacts from that section's logic, and added a one-click "Move to Master DB" button on each Needs Follow-Up contact row so any similar false positive from an active list can be dismissed without leaving the Dashboard.

--------------------------------------------------
KNOWN ISSUES / RECURRING FLAGS — READ BEFORE STARTING NEW WORK
--------------------------------------------------

1. **QA seed/cleanup script is overdue — flagged in Sprints 4, 5, and 6.** There's still no safe way to test call outcomes / task creation without touching real production contacts. Every sprint that needed live verification had to mutate a real contact (most recently "Larry Crees") and manually clean it up afterward via direct Supabase REST calls. This should be the first thing built in the next feature sprint, or at minimum before any sprint that needs to exercise Call Mode outcomes.
2. **"Resume Last Session" queue was not built** (Sprint 6, explicitly documented as skipped). Selecting a queue from the picker always starts at position 1, even if Brandon was mid-way through it earlier in the session. Only the per-list Database toolbar button ("Resume Call Mode") preserves position.
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

Paste this file's content (or just reference it: "read NEXT_SESSION_HANDOFF.md at the repo root") plus whatever new sprint objective or bug report Brandon has. If it's a fresh feature sprint, the recommended next focus (from Sprint 6's handoff) is, in priority order:

1. QA seed/delete script (temporary contact + temporary tasks, safely removable) — stop deferring this.
2. Persist queue position across a picker round-trip within the same Call Mode session.
3. Surface Today's/Overdue Callback counts somewhere on the Dashboard itself, not just inside Database's picker.
4. Revisit Appt Set → Calendar meeting creation if a clean integration path exists.

If it's a bug report or UX complaint instead (like the Needs Follow-Up fix above), treat it the way that one was handled: find the actual root cause in the relevant `build*` function or component, fix it directly, verify live against real data, clean up any test mutations immediately, then commit with a plain-language message (no sprint number needed for a small fix).
