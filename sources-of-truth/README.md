# Sources of Truth

GitHub is the authoritative home for IronZ's training method. This folder holds it, along with the editable source data the app is built from. Last reviewed 2026-11-09.

If a document here disagrees with code, treat it as a bug in one of them and raise it in a PR. Don't silently pick one.

## 1. Authority map

IronZ's method has two domains. Keep them separate.

| Domain | Question it answers | Authoritative document | Status |
|---|---|---|---|
| **Plan generation** | What plan does an athlete get? (classification, phases, session distribution, workouts, zones, strength, nutrition and hydration targets, safety, tone) | `Engine Doc/PLAN_GENERATOR_MASTER_SPEC.md` (v2.5) | **Authoritative** |
| Plan generation pipeline | In what order does the generator run? | `RULE_ENGINE_SPEC.md` | **Authoritative** |
| Plan output contract | What shape is a generated plan? | `PLAN_SCHEMA.json` | **Authoritative** |
| **Adaptive coaching** | How does the plan change day to day and week to week once the athlete is training? (readiness, grading, auto vs proposed changes, briefs, reviews, measured hydration) | `docs/COACH_AGENT_SPEC.md` | **Draft** (PR #17, open policy questions). Not authoritative until merged; will move into this folder after approval. |

Rules:
- Training logic changes in code update the matching authoritative doc in the same PR (AGENTS.md section 4).
- **Personal coaching records stay private.** The owner's personal coaching agent keeps athlete-specific notes (health, numbers, schedule) outside this repo. Only **generalized method changes** come here, through a reviewed PR. Never auto-promote a personal adjustment into a rule for all athletes.

## 2. Status of everything else in this folder

| Path | Status | Read by (code, scripts, tests) | Notes |
|---|---|---|---|
| `TRAINING_PHILOSOPHY.md` (v1.8) | **Retired** | Cited in code comments only (`athlete-classifier.js`, `arc-builder.js`, `session-assembler.js`, `hydration-calculator.js`, `nutrition-calculator.js`) | Merged into the master spec v2.0. Section references in those comments point to this file; when touching those files, re-point them to the master spec. |
| `philosophy/modules_static.json` (47 modules) | **Runtime data** | `js/philosophy-engine.js` (fetched at runtime as last fallback), `scripts/test-golden.js`, `scripts/philosophy-sync.js` | **Do not move or rename**: the live app fetches it by path. |
| `philosophy/philosophy_modules.json` (60 modules) | **Runtime source data** | `scripts/philosophy-sync.js` (uploads to Supabase) | Not loaded by the app directly. See drift note below. |
| `philosophy/golden_test_cases.json` | **Test data** | `scripts/test-golden.js` | |
| `philosophy/IRONZ_KNOWLEDGE_BASE.md` | **Reference, in use** | Mirrored in `supabase/functions/ask-ironz/knowledge_base.ts`; cited by `js/gear-checklist.js` | Edits must be mirrored to the edge function copy. |
| `philosophy/PHILOSOPHY_UPDATE_2026-04-09_*.md` (run session types, threshold weeks, workout diversification) | **Reference, in use** | Cited by planner, generator, scheduler, and variant-selector code and one test | Change logs whose rules should already be in the master spec. Keep until confirmed merged. |
| Other `philosophy/*.md`, `*.txt`, and `edge_case_escalation.json`, `plan_output_schema.json`, `user_classifier_rules.json`, `validator_rules.json` | **Reference, not read by code** | none found (2026-11-09 search of `js/`, `scripts/`, `tests/`, `supabase/functions/`) | Background research and early drafts. Candidates for an archive folder in a later PR, after a fresh reference check. |
| `exercises/IronZ_Exercise_Library_Expanded.xlsx`, `exercises/exercise-supplement.json` | **Authoritative source data** | `scripts/generate-exercise-db.py` → `exercise-data.js` | |

## 3. Runtime: where the live app actually gets philosophy modules

`js/philosophy-engine.js` loads modules in this order:
1. Supabase table `philosophy_modules` (**live: 45 active modules, last updated 2026-04-07**)
2. Browser cache of the last Supabase load
3. `philosophy/modules_static.json` (47 modules)

**Drift (2026-11-09):** the database (45), the static fallback (47), and `philosophy_modules.json` (60) don't match. Production uses the database set.

Consumers of the `philosophy_modules` table (not only the legacy engine): `js/philosophy-engine.js`, `js/philosophy-planner.js`, `js/rules-engine.js`, `js/app.js`, `js/db.js`, `js/admin.js`, `js/seed-reference-data.js`, `js/coach-sheet-import.js`, `scripts/philosophy-sync.js`, and the **`ask-ironz` edge function**.

Changing which modules the database holds can change generated plans and Ask IronZ answers. Any sync, reconciliation, or retirement of this table is its **own PR**, with before/after golden tests, and is not part of documentation cleanup.

## 4. Pipelines

### Exercises → app
1. Edit `IronZ_Exercise_Library_Expanded.xlsx` or `exercise-supplement.json`.
2. Run `python3 scripts/generate-exercise-db.py`.
3. Commit the regenerated `exercise-data.js` (repo root) with your source edits. `window.EXERCISE_DB` is the runtime source of truth.

### Philosophy modules → Supabase
`node scripts/philosophy-sync.js` regenerates `modules_static.json` and uploads to the `philosophy_modules` table. **Don't run it against production** until the drift above is reconciled in a dedicated PR; it would change live plans.

### Golden tests
`scripts/test-golden.js` runs the legacy philosophy planner against `philosophy/golden_test_cases.json`. Runs in `npm test`.

## 5. Moving or renaming anything here

Before moving a file:
1. Search `js/`, `scripts/`, `tests/`, `supabase/functions/`, and `index.html` for its name (not just its path).
2. Update or remove every reference in the same PR.
3. `npm test` includes `tests/sources-of-truth-references.test.js`, which fails if code references a `sources-of-truth/...` path that doesn't exist.
