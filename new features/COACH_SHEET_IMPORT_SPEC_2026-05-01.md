# IronZ — Coach Sheet Import Spec (2026-05-01)

Athletes whose coaches distribute training plans as Excel/PDF/Google Sheets currently have to copy-paste workouts one at a time into the existing "Import a Plan" textarea. That's a wall. This spec adds a file drop that takes the source file, parses it into structured workouts + a strength library + (optionally) athlete profile data, and lands all of it in IronZ in the canonical workout shape — same data model as native workouts, fully editable, fully integrated with stats/history/streaks.

The work has been validated by a proof-of-concept run against Paige Tuchner's 2026 plan (a multi-sheet workbook with 12 month tabs, a Resources sheet, and a Strength sheet). The PoC successfully extracted 147 running workouts with 92% reconciling to prescribed mileage, 5 strength templates with 55 exercises, and the full athlete profile (3 races, 2 PRs, A/B goal paces). Architecture is sound; this spec is the build plan.

---

## Decisions locked in

| # | Decision |
|---|----------|
| **1** | v1 scope = running calendar + strength workout library. Fueling deferred to v2. |
| **2** | Strength workouts import as **saved templates in user's library**, not auto-scheduled. Athlete assigns manually. |
| **3** | Date range picker. Default = 4 weeks from today. Max = 12 months. Cap exists because LLM parsing has cost. |
| **4** | One-direction import only. No syncing back to source sheet. |
| **5** | LLM-based parsing (Anthropic API in a Supabase edge function). Build for format variation, not template-specific. |
| **6** | Free tier: **5 uploads / user / month**. Paid + coach tiers come later. |
| **7** | UI: drop zone INSIDE the existing "Import a Plan" tab. Textarea stays for paste-only users. Both paths coexist. |
| **8** | Conflict handling: when imported workout collides with existing, **show both** on the day. Calendar already supports multi-session days. |
| **9** | Strength workouts named **verbatim** from source ("Strength Workout 1", "Strength Workout 2"). User can rename later. |
| **10** | Review screen = list with "Import all" button. Per-row "View source text" affordance. Edit button per row opens existing workout editor. |
| **11** | **End-state requirement**: imported workouts must look/edit/behave identically to native IronZ workouts. Same data shape, same editor, same calendar treatment, same stats/history flow. No special-casing downstream. |
| **12** | Header rules (WU/CD distances) apply **universally to all running workouts**, per coach intent. Not a hard-workouts-only filter. |
| **13** | Athlete profile import (races, PRs, goal paces) = **opt-in beta toggle** in review screen. Default off for v1. Toggle to "Update zones from these PRs" surfaces explicit consent. |
| **14** | Post-race-completion: when athlete logs a race result that beats existing PR, fire same "Update zones?" prompt. Same code path as post-import. |

---

## Out of scope for v1

- Fueling sheet parsing (deferred to v2)
- Logging-back direction (writing IronZ data back to source sheet) — no v2 plans
- Coach-side import (coach pastes sheet for client) — v2 once coach portal matures
- PDF and image upload — v1 is Excel/CSV/Google Sheets only. PDF/image come in v1.5 once Excel pipeline is proven.
- Real-time re-parse (file changes propagate to IronZ) — never. Import is a one-time event.

---

## Data model — IronZ-shaped workout output

Every imported running workout produces this exact shape, matching what a native IronZ workout would look like. Coder will map the field names to the canonical schema in `js/calendar.js` / `js/db.js`; the structure stays the same.

```json
{
  "date": "2026-05-05",
  "day_of_week": "Tue",
  "sport": "running",
  "day_type": "hard_workout",
  "total_distance_mi": 8.0,
  "structure": [
    {
      "phase": "warmup",
      "distance_mi": 1.5,
      "intensity": "easy"
    },
    {
      "phase": "main",
      "distance_mi": 5.0,
      "intervals": [
        { "on_min": 3, "off_min": 2, "type": "fartlek", "total_distance_mi": 5 }
      ],
      "target_pace_per_mi": "8:15-7:15"
    },
    {
      "phase": "cooldown",
      "distance_mi": 1.5,
      "intensity": "easy"
    }
  ],
  "raw_description": "5 miles of 3 min ON and 2 min EASY\n\nON Pace: 8:15-7:15\n\nEASE BACK INTO THINGS",
  "source_file": "2026 Paige Tuchner Training Plan.xlsx",
  "source_sheet": "May",
  "source_cell": "D8",
  "import_id": "imp_abc123"
}
```

Field notes:
- `day_type` ∈ `easy_run | hard_workout | long_run | rest | unknown` — drives icon + color in calendar
- `structure` array: 1–3 phases (rest days have empty structure or omit it). Each phase has `phase`, `distance_mi`, optionally `intensity`, `intervals`, `target_pace_per_mi`, `note`
- `raw_description` always preserved verbatim — feeds the "View source text" affordance in review and survives editing
- `source_file` / `source_sheet` / `source_cell` allow forensic backtracking when a user reports "this workout looks wrong" — coder/support can find the original cell instantly
- `import_id` ties all workouts in a single import session together. Useful for "undo entire import" if user botches it.

### Strength template shape

```json
{
  "library_name": "Strength Workout 1",
  "exercises": [
    {
      "name": "Overhead Weighted Sit-Ups; Seated Twist (Superset)",
      "sets": 3,
      "reps": "8 - 12",
      "weight": "15 - 20 lbs",
      "video_link": null,
      "source_row": 5
    }
  ],
  "import_id": "imp_abc123"
}
```

Reps/weight stored as **strings** because the source uses ranges ("8 - 12", "15 - 20 lbs", "Bodyweight") that don't cleanly fit numeric fields. Athlete editor can offer "convert to fixed value" later.

### Athlete profile shape (opt-in import)

```json
{
  "races": [
    {
      "name": "Boston Marathon",
      "date": "2026-04-20",
      "priority": "MAIN",
      "distance": "Marathon",
      "a_goal": "3:20:00",
      "a_goal_pace_per_mi": "7:38",
      "course_type": "Semi-Hilly"
    }
  ],
  "prs": [
    {
      "distance": "Marathon",
      "time": "3:26",
      "race": "Toronto Marathon",
      "pace_per_mi": "7:51",
      "date": "2025-05-04"
    }
  ]
}
```

---

## Phase A — File drop UI + sheet picker + date range

The input side. No parsing yet; this phase ships an upload affordance that posts the file to the edge function and shows a placeholder review screen with the raw file metadata.

### A1 — Drop zone in existing "Import a Plan" modal

**Location.** The "Create Your Own Plan" modal already has a "Create on IronZ | Import a Plan" tab toggle. Inside the "Import a Plan" tab, add a drop zone **above** the existing textarea, with an "or paste plan text" divider between them. Both paths remain available.

**Drop zone affordances:**
- Visible state: dashed border, neutral background, centered content
- Icon (file or upload arrow), text "Drag a file here, or click to browse"
- Subtext: "Supported: Excel (.xlsx), CSV. Max 10 MB."
- On hover/drag-over: highlighted border + "Drop to upload" text
- On click: open file picker, restricted to `.xlsx, .csv` (no `.xls` legacy format in v1)

**File handling:**
- Validate extension client-side, reject with friendly toast: "We support .xlsx and .csv right now. PDF support coming soon."
- Validate size client-side: < 10 MB. Reject with toast.
- On valid file: show file name + size below the drop zone with an "x" to remove. Also auto-disable the textarea (paste path) while a file is staged, with copy: "Remove the file to paste text instead."

**Acceptance criteria.**
- Drop zone renders inside existing modal, above textarea
- File size + extension validated client-side before upload
- Both drop and click-to-browse work
- Selected file is visible with size + remove affordance
- Textarea is grayed/disabled while file is staged (and vice versa: typing in textarea hides the file drop area? No — keep both visible but only one is active at a time)
- File path: drop file → file uploads to Supabase storage at `coach-sheet-imports/{user_id}/{import_id}/{filename}` → upload returns a `storage_path` that's used for parsing in Phase B

### A2 — Sheet picker (multi-sheet workbooks only)

**Why.** Paige's file has 16 sheets. Most coach sheets are single-tab, but multi-tab files like this one need the user to indicate which tab(s) to parse.

**Trigger.** After file upload completes, edge function returns sheet names + a guess at which sheet is the "calendar" (heuristic: contains date cells in a grid pattern). If only one sheet, skip picker. If multiple, show:

**Picker UI:**
- Modal step "Pick the sheets to import"
- Two sections:
  - **Calendar sheets** (auto-detected): checkboxes pre-checked. Show sheet name + week/date range detected ("May" → "5/4–5/31, 4 weeks"). User can uncheck.
  - **Other sheets**: list with descriptions ("Resources", "Strength", "Fueling"). Pre-check Strength (we extract it). Resources is shown as "Athlete profile (races, PRs)" with a beta tag. Fueling shown grayed-out as "Coming soon."
- Continue button advances to date-range step.

**Acceptance criteria.**
- Single-sheet file → picker is skipped
- Multi-sheet file → picker renders with auto-detected calendar tabs pre-checked
- Resources sheet labeled as "Athlete profile (beta)" with explanation
- Fueling sheet shown disabled with "Coming soon"
- User can uncheck any sheet and proceed
- Continue button is disabled if no sheets are selected

### A3 — Date range picker

**Trigger.** After sheet picker (or immediately after upload if single-sheet).

**UI:**
- Two date pickers: "Import workouts from" and "to"
- Defaults: from = today, to = today + 4 weeks (28 days)
- Max range: 12 months. If user sets a wider range, show inline warning: "Plans longer than 12 months can't be imported in one go. Re-import to extend later."
- Show preview count: "We found N workouts in this range across the selected sheets" (requires a quick pre-parse pass — count week-blocks within range, not full LLM parse).
- "Continue to review" button.

**Acceptance criteria.**
- Defaults are today → today + 4 weeks
- Date pickers are constrained to dates that exist in the source file (if file only covers Jan–Dec 2026, can't pick a date outside that)
- Workout count preview updates as user adjusts range
- Range > 12 months blocked with friendly message
- Continue button is disabled if range is invalid

### A4 — Upload quota

**Where it lives.** New Supabase table `coach_sheet_import_quotas`:

```sql
create table coach_sheet_import_quotas (
  user_id uuid not null references auth.users(id) on delete cascade,
  month_yyyymm text not null,  -- "2026-05"
  import_count int not null default 0,
  primary key (user_id, month_yyyymm)
);
```

**Enforcement:** edge function checks current month's count before processing. If `import_count >= 5`, reject with `IRO05_QUOTA_EXCEEDED` and friendly message:
> "You've used all 5 imports for May. Quota resets June 1. Need more? [Contact us]"

After successful import (Phase C completes), increment the counter atomically.

**Counter semantics:** counts **completed** imports. A failed parse or user-cancelled review doesn't count. Only when workouts actually land in the calendar does the counter increment.

**Acceptance criteria.**
- 6th import attempt in same month is rejected before the file is even processed
- Failed/cancelled imports don't decrement quota
- Counter resets monthly (when `month_yyyymm` flips)
- Admin tool exists (or is plumbed via SQL) to bump a user's quota for support cases

---

## Phase B — Parser + LLM normalizer edge function

The brain. A new Supabase edge function `coach-sheet-import-parse` that takes a `storage_path` + selected sheets + date range and returns the structured workout JSON.

### B1 — Edge function skeleton

**Endpoint.** `POST /functions/v1/coach-sheet-import-parse`

**Request:**
```json
{
  "storage_path": "coach-sheet-imports/{user_id}/{import_id}/file.xlsx",
  "selected_sheets": ["May", "June", "Strength", "Resources"],
  "date_range": { "from": "2026-05-04", "to": "2026-06-01" },
  "import_id": "imp_abc123"
}
```

**Response (success):**
```json
{
  "status": "ok",
  "import_id": "imp_abc123",
  "running_workouts": [...],
  "strength_templates": [...],
  "athlete_profile": {...} | null,
  "warnings": ["3 workouts had unclear interval structure — review carefully"],
  "stats": { "workouts_parsed": 28, "templates_parsed": 5, "llm_tokens_used": 12450, "estimated_cost_usd": 0.18 }
}
```

**Response (error):** standard IronZ error envelope with code, e.g. `IRO05_QUOTA_EXCEEDED`, `IRO06_PARSE_FAILED`, `IRO07_FILE_TOO_LARGE`.

**JWT verification:** ON. This endpoint is user-authenticated; no anonymous access.

### B2 — Two-stage parser architecture

**Stage 1: structural extractor (Python or Deno).**
Reads the file from storage, walks the workbook, identifies week-block patterns by scanning for date columns, extracts raw cells (date, mileage, description) per day. Also reads header rows for WU/CD rules and the Resources sheet for profile data. Output: a "raw blocks" intermediate JSON.

The PoC code in this spec's sibling files (`paige_import_v2.json` for shape reference) demonstrates this stage works at 92% accuracy on real data. Lift that logic into the edge function.

**Stage 2: LLM normalizer (Anthropic API).**
Takes the raw blocks + header rules and returns the canonical IronZ workout shape. The LLM does:
- Description → structured intervals (regex misses 60% of cases; LLM handles them)
- Pace target extraction with context awareness
- "9-13 Miles" range interpretation
- Disambiguation when prescribed mileage and description distances conflict (trust prescribed)
- Day type classification edge cases ("cross-training", "yoga", race entries)
- WU/CD application (apply universally per Decision #12)

**LLM prompt structure:**
```
You are converting raw training-plan cells into IronZ workout JSON.
Each cell has: date, prescribed_mileage_mi, raw_description, header_rules.
Apply the header rules: warmup_distance_mi and cooldown_distance_mi are part of EVERY running workout's structure.
For each workout, output the canonical IronZ workout shape (see schema below).
Trust the prescribed_mileage_mi over distances mentioned in the description.
If the description mentions a distance that exceeds (prescribed - WU - CD), prefer prescribed - WU - CD as the main distance and treat the description's number as instructional context.
Preserve raw_description verbatim for the "View source text" affordance.
{schema}
{batch_of_workouts_input}
```

Batch workouts in groups of ~20 per LLM call to stay within context + cost limits. For Paige's file (147 workouts over 12 months), that's ~8 LLM calls per full-year import.

### B3 — Cost guardrails

**Per-import budget cap.** Hard-cap each import at $2.00 of LLM spend. If the parse trajectory exceeds it, abort and return:
> `IRO08_PARSE_BUDGET_EXCEEDED` with message "This import is unusually large. Try a shorter date range."

**Token tracking.** Edge function returns `llm_tokens_used` + `estimated_cost_usd` in the response stats. Log to a new table:

```sql
create table coach_sheet_import_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  import_id text not null,
  storage_path text,
  selected_sheets text[],
  date_range_from date,
  date_range_to date,
  workouts_parsed int,
  templates_parsed int,
  llm_tokens_used int,
  estimated_cost_usd numeric(10, 4),
  status text not null,  -- 'success' | 'failed' | 'cancelled'
  error_code text,
  created_at timestamptz default now()
);
```

This log enables: cost monitoring per user (catch abuse), success rate analytics, debugging support tickets ("show me what we tried to parse for user X").

### B4 — Error handling

**Malformed Excel.** File can't be opened by openpyxl/SheetJS → return `IRO06_PARSE_FAILED` with message "We couldn't read this file. Make sure it's a valid Excel file and try again."

**No date columns detected.** Structural parser finds zero week-blocks → return `IRO06_PARSE_FAILED` with message "We couldn't find a calendar layout in this file. Check that there's a sheet with dates laid out as a weekly grid (Mon–Sun across columns)."

**LLM returns malformed JSON.** Retry once with stricter prompt. If still malformed, return that batch's workouts with `parse_warning: "Auto-parse failed for these workouts. Review carefully."` and pass-through the raw description for manual review.

**Partial success.** If one sheet parses fine but another fails, return the successful one + a warning. Don't fail the whole import.

**Acceptance criteria for Phase B:**
- Edge function deployed at `/functions/v1/coach-sheet-import-parse`
- Verify JWT enabled
- Anthropic API key stored in Supabase secrets, never in client code
- Quota check happens before LLM is called
- Cost guardrail prevents runaway spend
- Logs written to `coach_sheet_import_logs` for every attempt (including failures)
- Test with Paige's file: returns 28 workouts for May, 5 strength templates, athlete profile with 3 races + 2 PRs

### B5 — Test fixtures

Coder should add three test fixtures to `__tests__/coach-sheet-import/`:

1. **`paige_2026.xlsx`** (full file from PoC) — golden test, 92%+ math reconciliation expected
2. **`single_tab_simple.xlsx`** — one sheet, 4 weeks, no Resources/Strength tabs — tests minimal happy path
3. **`malformed_no_dates.xlsx`** — sheet with text but no date columns — tests structural-parser fallback

Tests assert:
- Math reconciliation: `sum(structure[*].distance_mi) == total_distance_mi` for ≥90% of workouts
- All workouts have `raw_description` preserved verbatim
- WU/CD applied universally to running workouts
- Strength templates extract correctly with date-autoconvert protection
- Empty/malformed files return proper error codes, not crash

---

## Phase C — Review screen + import flow + zones prompt

The commit + onboarding moment. After Phase B returns parsed JSON, this is what the user sees and how data lands in IronZ.

### C1 — Review screen layout

**Top bar:**
- Title: "Review your imported plan"
- Subtitle: "From: 2026 Paige Tuchner Training Plan.xlsx · 28 workouts · 5 strength templates · profile data found"
- Right side: "Cancel" + "Import all" buttons

**Tabs/sections (visible if data exists for each):**

**Section 1: Running calendar (28 workouts)**
- Compact list, one row per workout
- Each row: date + day-of-week chip, day-type badge (color-coded: blue=easy, red=hard, purple=long, gray=rest), total mileage, structure summary ("WU 1.5 + 5mi fartlek + CD 1.5"), pace if any
- Right side per row: "View source" link (expands to show `raw_description` inline) + "Edit" button (opens existing workout editor) + checkbox to include/exclude
- Conflict indicator: if a workout already exists on this date, show small "+1 existing on this day" badge — both will be shown on the calendar (per Decision #8)

**Section 2: Strength workouts (5 templates)**
- Card grid, one card per template
- Card: name ("Strength Workout 1"), exercise count ("11 exercises"), preview of first 3 exercises
- Per card: "View all exercises" expand + checkbox to include/exclude
- Note above grid: "These will be saved to your workout library. You can assign them to days later."

**Section 3: Athlete profile (beta)**
- Three subsections: Races (3), PRs (2), Goal paces
- Each item with checkbox, default unchecked (opt-in per Decision #13)
- Below the subsections: special checkbox **"Update my training zones from these PRs"** with explanation: "Your zones drive AI plan generation and pace targets. Updating them based on your latest PRs keeps everything accurate. We'll show you the new zones before saving."
- This whole section is collapsible with a "(beta)" tag

**Bottom action bar:**
- "Import all" button (primary)
- Selected counts visible: "Importing: 28 workouts · 5 strength templates · 0 profile items"

### C2 — Import flow (atomic)

**On "Import all" click:**

1. Confirm modal: "Import 28 workouts and 5 strength templates? You can edit any of them after import." [Cancel] [Import]
2. On confirm: open a transaction (or batch all writes; if Supabase RPC, use a single SECURITY DEFINER function for atomicity)
3. **Writes in order:**
   - Insert running workouts into `workouts` table (or wherever native workouts live). Use the canonical schema. Preserve `import_id` as a column for undo support.
   - Insert strength templates into the user's saved workouts library (verbatim names per Decision #9).
   - If profile section had any items checked: write races to `races`, PRs to `prs`, update goal paces in profile.
   - If "Update zones" was checked: trigger zones recalculation as a separate post-import step (see C3).
   - Increment `coach_sheet_import_quotas.import_count` for current month.
   - Update `coach_sheet_import_logs` row to `status: 'success'`.
4. Close review modal, navigate to today's calendar with a success toast: "28 workouts imported · [View calendar] [Undo import]"

**Undo import.** Within 1 hour of import, an "Undo" button reverses everything by deleting all rows with that `import_id`. After 1 hour, button disappears (calendar likely has been viewed and edited; full undo becomes risky). Implement as a single SECURITY DEFINER function.

**Conflict handling.** If imported workout collides with existing on same date, both are inserted (per Decision #8). The calendar already supports multi-session days. No special UI here — calendar's native rendering handles it.

### C3 — Zones recalculation prompt

**Trigger 1 (post-import):** if user checked "Update zones from these PRs" in C1, after successful import navigate to a one-step "Update zones" modal:

- Show current zones vs proposed zones side by side (Easy: 9:30/mi → 8:45/mi, etc.)
- Computation source: VDOT formula or whatever IronZ uses for zone derivation from PR times
- "Save new zones" button (primary), "Keep current" (secondary)
- Saving updates user profile zones table; doesn't touch existing workouts (their pace targets stay as imported)

**Trigger 2 (post-race-completion):** new code path, completely separate from the import flow. When a user logs a race result and the time beats an existing PR for that distance:

- Banner appears on the race-completion confirmation screen: "🎉 New PR! Your previous Marathon PR was 3:26 — this race was 3:18. Update your training zones?"
- Same one-step modal as Trigger 1
- Same backing function (call it `updateZonesFromPRs(prs[])` so both triggers use the same code)

This "Trigger 2" is a small standalone feature that ships with Phase C even though it's logically separate. Worth grouping because it shares the zones-update code path and prevents stale zones from quietly degrading the AI plan generator's output.

### C4 — Acceptance criteria for Phase C

**Review screen:**
- All three sections render conditionally based on parsed data
- Per-row checkboxes work; "Importing X" count updates live
- Conflict indicator appears on dates with existing workouts
- "View source" expands inline with `raw_description`
- "Edit" opens existing workout editor; edits are saved to the in-review workout, not the source

**Import:**
- Atomic: all writes succeed or all fail
- `import_id` is set on every workout, template, and profile row
- Quota counter increments only on success
- Imported workouts appear on the calendar identically to native workouts (same icons, same colors, same edit affordances) — this is the **end-state requirement** (Decision #11)
- Imported workouts contribute to streak, stats, history exactly like native workouts

**Undo:**
- Visible for 1 hour post-import
- Single click removes all rows with that `import_id`
- Safe-confirm: "Undo will remove 28 workouts and 5 templates. Continue? [Cancel] [Undo]"

**Zones prompt (post-import):**
- Only fires if user opted in (checkbox)
- Side-by-side comparison of current vs proposed zones
- Saving updates profile but doesn't touch imported workouts

**Zones prompt (post-race-completion):**
- Fires only when a logged race time beats an existing PR
- Shares code with post-import path
- Banner appears on race-completion confirmation screen

---

## Known edges + risks

These are documented up front so the coder doesn't get surprised during build:

1. **Excel auto-converts text-like-dates to dates.** Coach types "12-16" as a rep range; Excel saves it as Dec 16. Parser must reverse this in `reps`/`weight` cells. PoC has this handled (`fix_excel_date_autoconvert` function). Add as a unit test.

2. **Header rules vary per month tab.** PoC parses each tab's header independently. If a month is missing the WU/CD header, fall back to `null` and let the LLM apply its best judgment using the prescribed mileage as ground truth.

3. **Description vs prescribed mileage conflicts.** Description says "5 miles of intervals" but prescribed total is 4mi. Trust prescribed total; description is instructional context. PoC's regex parser got this wrong 8% of the time; LLM normalizer handles it correctly with explicit prompt instruction.

4. **Multi-sheet workbooks are common.** Don't assume one tab per file. Sheet picker (A2) is essential.

5. **LLM cost variance.** A pathological file could rack up $5+ in LLM tokens. Budget cap (B3) prevents this. Monitor `coach_sheet_import_logs.estimated_cost_usd` weekly during launch.

6. **API key security.** Anthropic API key MUST live in Supabase secrets, never in client code. Edge function reads from `Deno.env.get('ANTHROPIC_API_KEY')`.

7. **File storage cleanup.** Imported files sit in `coach-sheet-imports/` storage. Add a cron job to delete files older than 30 days (storage costs add up).

8. **PII in source files.** Some coaches include athletes' personal info in the Resources sheet. Never log raw cell contents to error monitoring services. Sanitize logs.

9. **Quota gaming.** A user could upload 5 small files instead of one big one. Acceptable abuse vector for v1; if it becomes a problem, switch to a workout-count-based quota instead of file-count.

10. **Source-cell drift on edit.** If user edits an imported workout, `source_cell` becomes a stale reference. Keep the field for forensic value but make sure UI never implies "this still matches the source."

---

## Future scope (v2+)

Post-launch features worth tracking:

- **PDF + image upload.** Vision LLM passes for screenshot-of-paper-plan and PDF-from-coach. ~3 weeks of work; requires different parser pipeline.
- **Fueling sheet parsing.** Generate suggested daily macros from a coach's fueling sheet.
- **Coach-side import.** Coach pastes/uploads sheet on behalf of athlete. Lives in coach portal.
- **Re-import to extend.** "I already imported May; now extend through June" without re-uploading. Requires storing the original file longer than 30 days.
- **Plan templates.** "Save this imported plan as a template I can reuse" → builds toward an IronZ marketplace of community plans.
- **Auto-link strength to calendar.** "Your calendar calls for Strength Work on Tue + Thu — assign one of your imported strength templates to those days, rotating?" ← was a nice insight from spec discussion but defer to v2.
- **Logging-back to source sheet.** Probably never. But asked here for completeness.
- **Workout comparison view.** Side-by-side "what coach prescribed vs. what athlete did" using `raw_description` as anchor.

---

## Ship plan — 3 phases, sequenced

| Phase | Scope | Estimated dev time | Ship-blocker dependencies |
|---|---|---|---|
| **A** | File drop UI in modal + sheet picker + date range + quota table | 3–4 days | None |
| **B** | Edge function (structural parser + LLM normalizer + cost guardrails + logging) | 5–7 days | Anthropic API key in Supabase secrets |
| **C** | Review screen + atomic import flow + undo + zones prompts | 4–5 days | Phase B returning real data |

Total: ~2 weeks. Phases ship in order; A and B can be partially parallelized (front-end builds the UI against a mock parser response while back-end builds the real parser).

**Internal dogfood checklist (post-Phase C, pre-public):**
1. Chase imports Paige's file end-to-end. All 28 May workouts land. Strength library populated. Profile beta unchecked.
2. Chase opens Tuesday 5/5 hard workout. Edits the WU from 1.5 to 1 mile. Saves. Total updates correctly.
3. Chase deletes Wednesday's imported easy run. Calendar reflects the delete.
4. Chase clicks "Undo import" within 1 hour. All workouts + templates disappear.
5. Chase re-imports the file with profile beta checked + "Update zones" checked. Zones recalc fires; new zones save.
6. Chase logs a race result that beats the imported Marathon PR (3:26 → 3:18). Banner fires; zones recalc offers itself.
7. Chase tries to upload a 6th file in the same calendar month. Quota error fires.
8. Chase uploads a file with no date columns. Friendly error fires; nothing crashes.

If all 8 pass, ship to a small beta cohort (Paige + 2–3 other power users) for one week before broader rollout.

---

That's the spec. Coder can ship Phase A this week; Phase B next; Phase C the week after. Each phase is independently reviewable. Questions in chat before starting any phase.
