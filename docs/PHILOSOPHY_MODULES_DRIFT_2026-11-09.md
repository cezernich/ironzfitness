# Philosophy modules drift report (2026-11-09)

Read-only analysis. **Nothing in production was changed.** Revised later on 2026-11-09: see Correction below. Purpose: decide how to reconcile the `philosophy_modules` table before any sync or retirement (see `sources-of-truth/README.md` section 3).

## Who reads these modules

`js/philosophy-engine.js` (load order: Supabase table → browser cache → `modules_static.json`), the legacy philosophy planner and rules engine, `app.js`, `db.js`, `admin.js`, `seed-reference-data.js`, `coach-sheet-import.js`, and the **`ask-ironz` edge function**. The main race-plan path (`planner.js` `generateTrainingPlan`) does not use them.

## The three sets

| Set | Modules | Versions | Where |
|---|---|---|---|
| **Live DB** (`philosophy_modules`) | 45 active | all 1.0 | Production. Last updated 2026-04-07 |
| `modules_static.json` | 47 | 1.0 to 1.1 | Runtime fallback, golden tests |
| `philosophy_modules.json` | 60 | 1.0 to 1.3 | Repo source for `scripts/philosophy-sync.js` |

## Membership

| Modules | Live DB | Static | JSON |
|---|---|---|---|
| 44 shared modules | ✓ | ✓ | ✓ |
| `SPORT_PILATES` | ✓ | | |
| `RUNNING_FEEDBACK_CALIBRATION`, `RUNNING_OFFSEASON`, `RUNNING_ZONE_CALCULATIONS` | | ✓ | ✓ |
| `INJURY_GENERAL`, `INJURY_KNEE`, `INJURY_SHOULDER` | | | ✓ |
| `RECOVERY_GOOD`, `RECOVERY_MODERATE`, `RECOVERY_LOW` | | | ✓ |
| `TRAINING_THRESHOLD_WEEK`, `TESTING_PROTOCOLS`, `VOLUME_TIME_SCALING` | | | ✓ |
| `SESSION_TYPE_LIBRARY`, `RUNNING_WORKOUT_GENERATOR`, `SPORT_ENDURANCE_CYCLING`, `SPORT_ENDURANCE_SWIMMING` | | | ✓ |

## Content of the 44 shared modules

Compared field by field (`applies_when`, `principles`, `plan_rules`, `hard_constraints`, `nutrition_rules`, `training_adjustments`, `coaching_tone`) using md5 fingerprints computed in each place. Text-array columns in the DB were compared against the files converted to the same Postgres representation.

| Comparison | Identical | Differ | Differing modules (fields) |
|---|---|---|---|
| Live DB vs `modules_static.json` | 41 | 3 | `EVENT_MARATHON` (plan_rules), `SPORT_ENDURANCE_RUNNING` (plan_rules), `NUTRITION_YOGA_MOBILITY_WALKING` (applies_when) |
| Live DB vs `philosophy_modules.json` | 36 | 8 | the 3 above, plus `LEVEL_BEGINNER`, `LEVEL_INTERMEDIATE`, `LEVEL_ADVANCED`, `SPORT_STRENGTH_CORE`, `SPORT_TRIATHLON` (all plan_rules) |

`rationale` and `evidence_sources` were not compared.

## Correction (same day): the injury and recovery modules are not "missing"

The first version of this report recommended adding the 6 injury and recovery modules to production. **That recommendation was wrong and has been withdrawn.** Running the real engine (not reading it) showed:

1. **All 6 are deliberately inactive placeholders** in `philosophy_modules.json` (`is_active: false`, rationale "Placeholder module... To be expanded"). Their absence from the live table matches intent.
2. **The legacy matcher returns every active module for every user.** `matchesFilter()` skips any `applies_when` key the query doesn't mention, so a module only "fails" a query that names the same key with a different value. With the live set, a healthy 30-year-old gets all 45 modules (every age group, both genders, every race distance).
3. **Activating the 6 would apply them to everyone.** Probe result for a healthy, fully recovered user:

| Module set | Modules selected | Injury/recovery modules |
|---|---|---|
| Live (45) | 45 | none |
| Live + 6 activated | 51 | `INJURY_KNEE`, `INJURY_SHOULDER`, `INJURY_GENERAL`, `RECOVERY_GOOD`, `RECOVERY_MODERATE`, `RECOVERY_LOW` |

That would put "no plyometrics", "no heavy overhead work", and "trigger unscheduled deload, reduce volume 40-50%" into every legacy plan and every Ask IronZ prompt (Ask IronZ always includes `high`-priority modules, and the injury modules are `high`).

Also: the engine queries injuries as `{injury_type: 'minor_current' | 'chronic' | 'major_past'}`, while the modules declare `{injury: 'knee' | 'shoulder' | 'general'}`. The keys never line up, so even a fixed matcher wouldn't select them by body part.

## What this means

- **Injury and recovery handling is a code problem, not a data problem.** The fix belongs in the Rule Engine and the adaptive coach (`docs/COACH_AGENT_SPEC.md`: readiness levels, pain rules), not in this table.
- **New finding (P1): the legacy philosophy engine does not personalize by module.** Every user gets every active module. This affects the "Philosophy Engine Plan" path and Ask IronZ context. Track for the engine consolidation; do not patch the legacy matcher in isolation (AGENTS.md: don't extend legacy engines).
- `SPORT_PILATES` existed only in production; it is now captured in the snapshot below.

## What was done

- **Backup:** `sources-of-truth/philosophy/db_snapshot_2026-11-09.json`, an exact copy of the live table (45 rows). Verified field by field against production fingerprints on all 13 data columns. Not read by the app.
- **Guard test:** `tests/philosophy-modules-safety.test.js` runs the real engine against the snapshot, the runtime fallback, and the repo JSON, and fails if a healthy user receives any injury or recovery module. Verified to fail when `INJURY_KNEE` is activated. Limit: it checks files, not the live table; anyone editing production directly must re-snapshot.
- **No database changes** in staging or production.

## Recommendation (revised)

1. Leave the live table as is. Don't activate the injury or recovery modules while the legacy matcher is in use.
2. Implement injury and recovery handling in the Rule Engine / adaptive coach, with tests, per the coach spec.
3. Retire the table when its consumers (legacy planner, Ask IronZ) move off it. Re-point Ask IronZ to the master spec or Rule Engine output first.
4. The 3 small static-vs-live differences (marathon and endurance-running plan rules, yoga-nutrition `applies_when`) can be decided during that retirement; the snapshot now holds the live versions.

## Reproduce

Live fingerprints (Supabase SQL editor, read-only):

```sql
select id,
  left(md5(coalesce(applies_when::text,'')),8)         aw,
  left(md5(coalesce(principles::text,'')),8)           pr,
  left(md5(coalesce(plan_rules::text,'')),8)           plr,
  left(md5(coalesce(hard_constraints::text,'')),8)     hc,
  left(md5(coalesce(nutrition_rules::text,'')),8)      nr,
  left(md5(coalesce(training_adjustments::text,'')),8) ta,
  left(md5(coalesce(coaching_tone,'')),8)              ct
from public.philosophy_modules order by id;
```

For the files, load each JSON into any Postgres and compute the same values, converting array fields with `array(select jsonb_array_elements_text(doc->'<field>'))::text` so they match the DB's `text[]` format.
