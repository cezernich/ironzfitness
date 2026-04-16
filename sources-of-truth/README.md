# Sources of Truth

Everything in this folder is the **canonical editable copy** of IronZ's
backend data. Edit here, run the appropriate pipeline script, commit.

```
sources-of-truth/
├── exercises/
│   ├── IronZ_Exercise_Library_Expanded.xlsx   # 4 sheets × ~200 exercises
│   └── exercise-supplement.json               # extras not in the xlsx
└── philosophy/
    ├── philosophy_modules.json                # full module definitions
    ├── modules_static.json                    # bundled copy for runtime
    ├── plan_output_schema.json
    ├── user_classifier_rules.json
    ├── validator_rules.json
    ├── edge_case_escalation.json
    ├── golden_test_cases.json
    ├── core_philosophy.md                     # the Spec + reference docs
    ├── Strength_Training_Evidence_Based_Framework.md
    ├── PHILOSOPHY_UPDATE_*.md                 # dated change logs
    ├── foundational_*_prd.docx                # binary originals
    ├── IronZ_Philosophy_Engine_Spec_v1.0.docx
    ├── IRONZ_KNOWLEDGE_BASE.md
    ├── Research_Summary.md
    ├── Quick_Reference_Cheat_Sheet.md
    ├── INDEX.md
    └── README.md
```

## Exercises → app

1. Edit `IronZ_Exercise_Library_Expanded.xlsx` or `exercise-supplement.json`.
2. Run `python3 scripts/generate-exercise-db.py`.
3. Commit the regenerated `exercise-data.js` (at the repo root) alongside
   your source edits. `window.EXERCISE_DB` is the single source of truth
   at runtime — the admin portal, planner, builders, and typeahead all
   read from it.

`philosophy/exercise_library.json` used to exist here as a runtime
fallback; it was deleted when `EXERCISE_DB` became the single source.

## Philosophy → Supabase

1. Edit `philosophy_modules.json` (or the `.md` / `.docx` docs that
   inform it).
2. Run `node scripts/philosophy-sync.js <docx-path>` to regenerate
   `modules_static.json` and upload to the `philosophy_modules` Supabase
   table in one pass. The app loads modules from Supabase first, then
   falls back to the local static JSON.

## Golden tests

`scripts/test-golden.js` runs the planner against the cases in
`philosophy/golden_test_cases.json`, using `exercise-data.js` (shaped
back into the legacy snake_case schema on the fly) for exercise inputs.

## Consumers (for reference)

| Source file | Read by |
|---|---|
| `exercises/IronZ_Exercise_Library_Expanded.xlsx` | `scripts/generate-exercise-db.py` |
| `exercises/exercise-supplement.json` | `scripts/generate-exercise-db.py` |
| `philosophy/modules_static.json` | `js/philosophy-engine.js` (runtime fetch) |
| `philosophy/philosophy_modules.json` | `scripts/philosophy-sync.js` (→ Supabase upload) |
| `philosophy/golden_test_cases.json` | `scripts/test-golden.js` |
