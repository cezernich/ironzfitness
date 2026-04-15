# Training Plan Storage

The short version: **active training plans live in the `generated_plans`
Supabase table.** Every other piece of plan-shaped state in the app is
either a cache of that, a per-day session list, or dead code.

This document is the canonical answer to "where do training plans live"
because the schema files and the code don't agree on the surface and
the drift has bitten us. If that changes, update this file.

---

## The tables

### `generated_plans` (real)

Defined in `supabase/migrations/supabase-migration-002-fix.sql`. This is
the **source of truth for an active training plan**.

| Column                 | Type        | Notes                                         |
|------------------------|-------------|-----------------------------------------------|
| `id`                   | uuid PK     | auto                                          |
| `user_id`              | uuid FK     | `auth.users.id`                               |
| `plan_data`            | jsonb       | Full plan blob — metadata + daily sessions    |
| `philosophy_module_ids`| text[]      | Which philosophy modules shaped this plan     |
| `module_versions`      | jsonb       | Version pinning for reproducibility           |
| `generation_source`    | text        | e.g. `survey`, `race_generator`, `manual`     |
| `plan_version`         | text        | Default `1.0`                                 |
| `assumptions`          | text[]      | Plan-builder assumptions surfaced to the user |
| `validation_flags`     | text[]      | Warnings raised at generation time            |
| `is_active`            | boolean     | At most one per user should be `true`         |
| `is_outdated`          | boolean     | Set when a philosophy module bumps version    |
| `created_at`           | timestamptz |                                               |

RLS: users can `SELECT / INSERT / UPDATE` rows where `auth.uid() = user_id`.

**Written by**: `js/philosophy-planner.js → storeGeneratedPlan(plan, source)`.

**Read by**: `js/philosophy-planner.js → getActivePlan(userId)` (with a
localStorage fallback).

### `training_sessions` (real, unrelated to plan metadata)

Defined in `supabase/supabase-schema.sql`. This stores **per-day scheduled
workouts**, not plan metadata. It's written from `localStorage.workoutSchedule`
via `DB.syncSchedule()` → `_debouncedSync('training_sessions', ...)`.

Note: `plan_id` is now nullable and its FK references `generated_plans`,
**not** `training_plans` (see the migration
`supabase/migrations/20260415_training_plan_storage_cleanup.sql`). Before
that migration the FK was broken — it pointed at a table that had no
rows, and `_shapeTrainingSession` always wrote `plan_id: null`, which
implies NOT NULL was dropped manually in production without a migration
file. Every new installation now runs the cleanup migration instead.

Stamping `plan_id` on sessions at write time is future work — nothing
does it yet.

### `training_plans` (tombstone)

Defined in `supabase/supabase-schema.sql` with columns `name`, `type`,
`goal`, `fitness_level`, `start_date`, `end_date`, `weeks`,
`days_per_week`, `split_type`, `is_active`, `source`, `raw_plan`,
`created_at`. **Never written to by the app.** The `DB.trainingPlans`
accessor and `_shapeTrainingPlan` function that previously sat in
`js/db.js` were removed in the 2026-04-15 cleanup commit because they
were dead code. The table itself is left in place as a tombstone —
it has no rows and dropping it requires a schema migration across
every deployed Supabase project. Safe to drop manually in a future
cleanup.

**Do not write to `training_plans`.** Use `generated_plans`.

---

## localStorage keys

The app maintains several localStorage keys that talk about "plans",
and they mean different things:

| Key                 | Shape                                    | Backed by                                 |
|---------------------|------------------------------------------|-------------------------------------------|
| `activePlan`        | Plan metadata (jsonb blob)               | `generated_plans` row + mirror in user_data |
| `activePlanSource`  | String ("survey", "race_generator", etc) | Mirror only                               |
| `activePlanAt`      | ISO timestamp of the last plan save      | Mirror only                               |
| `activePlanId`      | UUID of the `generated_plans` row        | Mirror only                               |
| `trainingPlan`      | **Daily sessions array** — the calendar's source for plan-driven work | Synced to `user_data` via `DB.syncKey('trainingPlan')` |
| `workoutSchedule`   | Daily sessions array — one-off and generated scheduled workouts | Synced to `training_sessions` table via `_debouncedSync` |

`trainingPlan` and `activePlan` are both plan-related but orthogonal:
`activePlan` is the metadata + intent ("a 12-week 70.3 build, generated
from survey on Apr 14"), and `trainingPlan` is the flattened list of
daily sessions the calendar reads.

---

## The ownership story

1. User triggers plan generation (survey, race setup, custom-plan modal).
2. The philosophy engine produces a `plan` object with `plan_data`,
   `plan_metadata.philosophy_modules_used`, `assumptions`, etc.
3. `storeGeneratedPlan(plan, source)` writes:
   - `localStorage.activePlan` = the blob (for fast reads)
   - `localStorage.activePlanSource` / `activePlanAt` / `activePlanId`
   - A row in `generated_plans` with `is_active=true`, after setting
     any prior `is_active=true` rows for the same user to `false`
4. Separately, the planner flattens the plan into a daily-sessions
   array and writes to `localStorage.trainingPlan` and/or
   `localStorage.workoutSchedule`. Those sync through `user_data` and
   `training_sessions` respectively.

Reading is the mirror: `getActivePlan(userId)` consults `generated_plans`
first, falls back to `localStorage.activePlan`.

---

## Known gaps / future work

- **`training_sessions.plan_id` is never stamped.** After the cleanup
  migration the FK points at `generated_plans(id)` and is nullable, so
  writing a real `plan_id` is a straight-line fix — just read
  `localStorage.activePlanId` in `_shapeTrainingSession` and stamp it.
  Deferred because nothing queries sessions by plan_id yet.
- **`trainingPlan` vs `workoutSchedule` is two ways to say the same
  thing.** Long-term consolidation: pick one, route everything through
  it, kill the other. Not urgent because both currently work.
- **`training_plans` table is still in the schema.** Drop it in a future
  migration once you're confident no production environment has rows
  (you can verify with `SELECT count(*) FROM training_plans;`).

---

## Why this drift existed

An earlier iteration of the app planned to use `training_plans` +
`training_sessions` in a classic normalized schema. When the philosophy
engine shipped, it introduced `generated_plans` as a richer format
(plan_data blob + module versioning + validation flags). The old
scaffolding was never removed, leaving `training_plans` as a zombie
table and `training_sessions.plan_id` pointing into a void.

This was discovered on 2026-04-15 while preparing a new onboarding
workflow that needed to know where plans actually land. The cleanup
commit is the fix.
