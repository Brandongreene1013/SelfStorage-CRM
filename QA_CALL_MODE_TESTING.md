# QA: Call Mode Testing (Safe — No Real Owner Data)

How to test Call Mode, callback queues, follow-ups, and task completion using
disposable QA records instead of real owners. Built in Sprint 7 after three
straight sprints of having to test against real contacts and hand-clean the
damage.

Everything here runs against the live Supabase database (there is no separate
QA environment), but every record is obviously fake (`QA Test …` names,
`[QA]` task titles) and the cleanup script can only delete QA-named records —
the safety rules are enforced in code, not just convention.

## 1. Seed QA data

From the repo root:

```
node scripts/qa-seed.mjs seed
```

This creates:

| Record | Purpose |
|---|---|
| List **"QA Test Call List"** | Holds all QA contacts; also exercises the Active List queue |
| **QA Test Owner 1 / 2** (fresh) | Plain callable contacts for outcome logging |
| **QA Test Callback Today** (callback) + task `[QA] Call back — due today` | Should appear in **Today's Callbacks** |
| **QA Test Overdue Callback** (callback) + task `[QA] Call back — overdue` (due 2 days ago) | Should appear in **Overdue Callbacks** |
| **QA Test Follow-Up Needed** (conversation, no open task) | Should appear in **Follow-Up Needed** |

Refresh the app after seeding (the app loads contacts/tasks once on load).

`node scripts/qa-seed.mjs status` shows what QA records currently exist.

## 2. Test Today's Callbacks

1. Dashboard → the **"callbacks due today"** pill under **Start Call Session** should have gone up by 1.
2. Click **Start Call Session** → queue picker opens → **Today's Callbacks** count includes the QA contact.
3. Open Today's Callbacks → **QA Test Callback Today** appears with
   "Why they're up: Callback task due today".

## 3. Test Overdue Callbacks

1. Dashboard → the **"overdue callbacks"** pill should have gone up by 1.
2. Queue picker → **Overdue Callbacks** → **QA Test Overdue Callback** appears with
   "Why they're up: Callback task overdue — was due <date>".
3. Overdue contacts sort earliest-due first.

## 4. Test Follow-Up Needed

1. Queue picker → **Follow-Up Needed** → **QA Test Follow-Up Needed** appears
   ("Conversation logged — no follow-up task").
2. Note: this queue only shows contacts with **zero open tasks** — if you added
   a task to this contact during testing, it correctly drops out.

## 5. Log outcomes safely

Log outcomes **only on `QA Test …` contacts** — never on real owners.

1. In any queue, with a QA contact up, type a note and click an outcome
   (e.g. **Conversation**).
2. For Conversation / Appt Set / Left VM, the post-outcome panel offers a
   follow-up task — adding one is safe; it attaches to the QA contact and is
   removed by cleanup.
3. **Call Back** requires a callback date and creates a real dated task on the
   QA contact (also removed by cleanup).

## 6. Verify task completion

1. Open **Today's Callbacks** (or Overdue) with the QA contact up.
2. Log **Not Interested** (or Conversation) → the panel shows
   **"Complete existing callback task ([QA] Call back — …)"** pre-checked.
3. Click **Continue** (or **Add Task + Next**) → the QA contact drops out of the
   queue, the picker count decreases, and the Dashboard callback pill drops
   after the next refresh of the view.
4. `node scripts/qa-seed.mjs status` should now show that task as `completed`.

## 7. Test queue position memory (Sprint 7)

1. Open **All Contacts**, click **Next Contact** a few times (say to 4 of N).
2. **Change Queue** → open **Today's Callbacks** → **Change Queue** again →
   reopen **All Contacts** → you should be back at 4 of N, not 1.
3. Position memory is session-level: a full page reload intentionally resets it.

## 8. Clean up QA data

```
node scripts/qa-seed.mjs cleanup
```

Deletes QA tasks (including any created during testing against QA contacts),
QA contacts, then the QA list — and verifies nothing QA-flavored remains.

Safety rules enforced by the script:
- Only contacts whose owner name starts with **"QA Test"** are ever deleted.
  A real contact accidentally moved into the QA list is skipped with a warning.
- Tasks are deleted only if tied to a QA contact id, or titled `[QA] …` **and**
  related to a `QA Test …` name.
- The QA list is deleted only once it holds zero non-QA contacts.

Refresh the app afterward and confirm the QA list and contacts are gone and
the Dashboard callback pills are back to their previous numbers.

## 9. Production smoke checklist (after deploy)

Use **only QA seeded records** — never log test outcomes on real owners.

1. `node scripts/qa-seed.mjs seed` (the script points at the same Supabase
   project production uses, so seeding locally also seeds production data).
2. On https://self-storage-crm.vercel.app/:
   - Dashboard renders; callback pills show the QA counts.
   - Start Call Session → picker opens with all five queues and live counts.
   - Today's Callbacks and Overdue Callbacks each contain their QA contact.
   - Log one outcome on a QA contact; complete the originating task via the
     checkbox; contact leaves the queue.
   - Switch queues and back — position is remembered.
   - Database, Clients, Pipeline, Analyst, Calendar all render.
3. `node scripts/qa-seed.mjs cleanup`, refresh, confirm QA records are gone.
