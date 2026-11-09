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
| `archive/` (13 files) | **Archived** | none (checked 2026-11-09) | Moved from `philosophy/` on 2026-11-09. See `archive/README.md`. |
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

## 6. Crosswalk: retired `TRAINING_PHILOSOPHY.md` → master spec

About 30 code comments in 14 files still cite `TRAINING_PHILOSOPHY §x.y`. Rather than churn those files, resolve a citation here. "Partial" means the master spec covers the topic but not one-to-one; check both before relying on it.

| Retired § | Topic | Master spec § | Match |
|---|---|---|---|
| 1 | Core principles | 0 | Full |
| 2.1 | Sport-specific level | 2a, 2b, 2c, 2d | Full |
| 2.2 | Dynamic level progression | 2g | Full |
| 2.3 | Risk–performance bias | 2h | Full |
| 2.4 | Age modifications | 2a-0, 2m | Partial |
| 2.5 (2.5.1, 2.5.2, 2.5.4, 2.5.5) | Goal system and modifiers | 1, 3b-ii, 4c | Partial |
| 2.5.3 | Strength role (hybrid) | 5 (5a to 5d) | Full |
| 2.6 | Training frequency | 2i | Full |
| 2.7 | Equipment access | 2j | Full |
| 2.8 | Threshold refresh | 2k | Full |
| 3 | Training zones | Appendix B | Full |
| 4.1 | Periodization principles | 3a | Full |
| 4.2 | Phase compression | 3a-iv | Full |
| 4.3 | Global intensity rules (Z4+ caps) | 0 (principle 2), 3a-ii, 4b phase intensity tables | Partial |
| 4.4 | Triathlon periodization | 3a, 4a | Full |
| 4.5 | Running periodization | 3a, 4b | Full |
| 4.6 | Hyrox periodization | 13a | Full |
| 4.7 | Multi-race periodization | 3a-v | Full |
| 4.8 | Training hours by level and distance | 3c | Full |
| 4.9 | Rolling mesocycles (non-race) | 3b | Full |
| 5 | Session types | 8d | Partial |
| 6.1 | Triathlon session distribution | 4a | Full |
| 6.1.1 | Weekly placement rules | 4d | Full |
| 6.2 | Running session distribution | 4b | Full |
| 6.3 | Hyrox session distribution | 13c | Full |
| 6.4 | Bricks | 4a-ii | Full |
| 6.5 | Goal-based distribution (non-race) | 3b-ii | Full |
| 7.1 | Movement patterns | 10a | Full |
| 7.2 | Exercise tiers | 10b | Full |
| 7.3 | Sub-target diversity | 10c | Full |
| 7.4 | Equipment matching | 10f | Full |
| 7.5 | Slot templates | 10d | Full |
| 7.6 (7.6.1 to 7.6.5) | Goal-specific exercise selection | 10e | Full |
| 8.1 | Split design by frequency | 2i | Full |
| 8.2 | Strength volume | 10g | Full |
| 8.3 | Exercise complexity by level | 10b | Partial |
| 8.4 | Strength periodization in endurance plans | 5b | Full |
| 8.5 | How strength improves race performance | 5c | Partial |
| 8.6 | Same-day strength + cardio | 10h | Full |
| 8.7 | Weight input logic | none | **Not carried over** |
| 9.0 | Weakness bias | Appendix E | Full |
| 9.1 to 9.6 | Sport-specific philosophy | 4a, 4b, 5c, 13 | Partial |
| 10.1 to 10.5 | Nutrition | 11a to 11d | Full |
| 11 | Hydration | 11e | Full |
| 12.1 to 12.4 | Recovery and adaptation | 12a to 12d | Full |
| 13 | Safety boundaries | 14 | Full |
| 14 | Coaching tone | 15 | Full |
