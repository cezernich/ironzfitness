# IronZ Philosophy Engine — Build Roadmap & Executable Plan

> **Purpose:** Feed this document to Claude Code CLI to build the philosophy-first plan generation engine.
> **Date:** April 7, 2026
> **Prerequisite:** The IronZ Philosophy Engine Spec v1.0 (.docx) — the complete training/nutrition/hydration philosophy
> **Architecture:** Philosophy-first, Claude-last. Standard plans are generated deterministically from philosophy modules. Claude API is only called for freeform "Ask IronZ" requests, and even then the philosophy modules are injected as constraining context.
> **Codebase:** Vanilla JS SPA — `index.html` + 26 JS modules + `style.css`, backed by Supabase, deployed on GitHub Pages.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Versioning & Update Strategy](#2-versioning--update-strategy)
3. [Phase 1: Foundation — Supabase Schema & Module Seeding](#3-phase-1-foundation)
4. [Phase 2: Philosophy Engine — Classification & Retrieval](#4-phase-2-philosophy-engine)
5. [Phase 3: Rules Engine — Deterministic Plan Assembly](#5-phase-3-rules-engine)
6. [Phase 4: Validator & Safety Layer](#6-phase-4-validator)
7. [Phase 5: AI Fallback — Constrained Claude Calls](#7-phase-5-ai-fallback)
8. [Phase 6: Gap Detection & Feedback Loop](#8-phase-6-gap-detection)
9. [Phase 7: Philosophy Sync Pipeline](#9-phase-7-sync-pipeline)
10. [Phase 8: Integration & Testing](#10-phase-8-integration)
11. [Known Gaps in Philosophy Doc](#11-known-gaps)
12. [File Manifest](#12-file-manifest)

---

## 1. Architecture Overview

### The 4-Layer System (from Philosophy Spec Section 1.2)

```
Layer 1: Immutable App Rules     — Safety boundaries, tone, disclaimers. Always present.
Layer 2: Philosophy Modules      — Modular instruction objects. Retrieved per user classification.
Layer 3: User Profile & Data     — Athlete profile, constraints, feedback, adherence history.
Layer 4: Structured Output Schema — Required JSON format for plan output.
```

### Data Flow: Standard Plan Generation (NO AI Call)

```
User Profile
    │
    ▼
┌──────────────────────┐
│  philosophy-engine.js │  ← Classifies user across 11 dimensions
│  (Classification)     │  ← Queries Supabase for matching modules
└──────────┬───────────┘
           │ 5-10 matched modules
           ▼
┌──────────────────────┐
│  rules-engine.js      │  ← Assembles plan deterministically
│  (Plan Assembly)      │  ← Uses module plan_rules + hard_constraints
│                       │  ← Applies variation engine (exercise rotation, rep undulation)
│                       │  ← Applies nutrition protocol matching
└──────────┬───────────┘
           │ Structured JSON plan
           ▼
┌──────────────────────┐
│  validator.js         │  ← Checks hard rules (calorie floors, max volume, phrases)
│  (Validation)         │  ← Rejects if fails, returns plan if passes
└──────────┬───────────┘
           │ Validated plan
           ▼
┌──────────────────────┐
│  Supabase             │  ← Stores plan with module IDs + versions
│  generated_plans      │  ← Logs assumptions used
└──────────┬───────────┘
           │
           ▼
       App renders plan with "Why this plan?" rationale
```

### Data Flow: "Ask IronZ" Freeform (AI Call, Philosophy-Constrained)

```
User types freeform request (e.g., "hotel gym workout with dumbbells only")
    │
    ▼
┌──────────────────────┐
│  philosophy-engine.js │  ← Still classifies user + retrieves modules
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  planner.js           │  ← Assembles prompt: Layer 1 + Layer 2 + Layer 3 + Layer 4
│  (AI Call)            │  ← Sends to Claude API (via Supabase Edge Function)
│                       │  ← Claude is CONSTRAINED by philosophy modules in prompt
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  validator.js         │  ← Same validation as standard flow
└──────────┬───────────┘
           │
           ▼
       Plan tagged with source: "ai_assisted"
       Response logged for gap analysis
```

### Data Flow: Gap Detection

```
Classification finds NO matching module for a dimension
    │
    ▼
┌──────────────────────┐
│  philosophy_gaps      │  ← Logs: {dimension, value, user_count, first_seen}
│  (Supabase table)     │  ← Example: {dimension: "sport_profile", value: "rowing", count: 47}
└──────────┬───────────┘
           │
           ▼
  Option A: Use closest available module + conservative defaults + disclaimer
  Option B: Fall back to Claude with partial modules (tagged as gap_fallback)
           │
           ▼
  Chase reviews gaps → builds new modules → seeds to Supabase → gap closes
```

---

## 2. Versioning & Update Strategy

### Philosophy Document (.docx) — Human Master

- **Location:** `Desktop/Claude/fitness-app/Training Philosophy/Updated Source of Truth/`
- **File:** Keep ONE file, not multiple versions. Do NOT create a new file each time.
- **Changelog:** Maintain a changelog section at the TOP of the document:

```
CHANGELOG
---------
2026-04-07 v1.0  Initial philosophy engine spec
2026-04-15 v1.1  Updated beginner protein range based on 2026 ISSN meta-analysis
2026-04-22 v1.2  Added rowing full module, updated HIIT fasted training evidence
```

- **Why one file:** The .docx is your working document. The real version control happens in Supabase at the module level.

### Module Versioning (Supabase — App Truth)

Every module in the `philosophy_modules` table has:
- `version` (semver string: "1.0", "1.1", "2.0")
- `updated_at` (timestamp)
- `change_log` (text: what changed and why)

**Version bump rules:**
- **Patch (1.0 → 1.0.1):** Typo fix, phrasing clarification, no behavior change
- **Minor (1.0 → 1.1):** Updated recommendation range, new evidence added, existing plans still valid
- **Major (1.0 → 2.0):** Fundamental philosophy change, existing plans should be flagged for regeneration

### Generated Plan Traceability

Every plan in `generated_plans` stores:
- `philosophy_module_ids`: ["LEVEL_BEGINNER", "SPORT_STRENGTH_CORE", "GOAL_BULK", ...]
- `module_versions`: {"LEVEL_BEGINNER": "1.0", "SPORT_STRENGTH_CORE": "1.2", ...}
- `generation_source`: "rules_engine" | "ai_assisted" | "gap_fallback"

This means you can always answer: "What science was this plan based on?" and "Has the science been updated since this plan was generated?"

### Update Workflow (When You Edit the Philosophy Doc)

```
1. You edit the .docx (add new science, update a recommendation)
2. Run the sync pipeline (Phase 7 below):
   $ claude "Run philosophy sync from Updated Source of Truth"
3. Sync pipeline:
   a. Reads the .docx, parses it into sections
   b. Compares against current Supabase modules
   c. Identifies changed modules
   d. Prompts you to confirm changes and version bumps
   e. Updates Supabase modules with new versions
   f. Flags active plans built on old versions (optional regeneration)
4. New plans automatically use latest module versions
5. Static JSON fallback file is regenerated for offline use
```

---

## 3. Phase 1: Foundation — Supabase Schema & Module Seeding

**Goal:** Create the database structure and seed all philosophy modules.

### Agent: `foundation-agent`

**Files to create:**
- `supabase/migrations/001_philosophy_engine.sql`
- `philosophy/philosophy_modules.json` (all 90-130 modules)
- `philosophy/core_philosophy.md` (from Spec Section 2)
- `philosophy/plan_output_schema.json` (from Spec Section 8)
- `philosophy/validator_rules.json` (from Spec Section 9.1)
- `philosophy/user_classifier_rules.json` (from Spec Section 3)
- `philosophy/edge_case_escalation.json` (from Spec Section 2.4)
- `philosophy/golden_test_cases.json` (from Spec Section 9.3)

### Task 1.1: Create Supabase Migration

Create `supabase/migrations/001_philosophy_engine.sql` with these tables:

```sql
-- Philosophy Modules (the brain of the app)
CREATE TABLE philosophy_modules (
  id TEXT PRIMARY KEY,                    -- e.g., 'LEVEL_BEGINNER'
  category TEXT NOT NULL,                 -- e.g., 'athlete_level', 'sport_profile', 'goal'
  title TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  applies_when JSONB NOT NULL,            -- conditions for retrieval
  principles TEXT[] DEFAULT '{}',
  plan_rules TEXT[] DEFAULT '{}',
  hard_constraints TEXT[] DEFAULT '{}',
  nutrition_rules TEXT[] DEFAULT '{}',
  training_adjustments TEXT[] DEFAULT '{}',
  coaching_tone TEXT,
  evidence_sources TEXT[] DEFAULT '{}',
  rationale TEXT,
  priority TEXT DEFAULT 'medium',         -- high / medium / low
  is_active BOOLEAN DEFAULT TRUE,
  change_log TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for module retrieval by classification
CREATE INDEX idx_philosophy_modules_category ON philosophy_modules(category);
CREATE INDEX idx_philosophy_modules_applies_when ON philosophy_modules USING GIN(applies_when);

-- Generated Plans (every plan the app creates)
CREATE TABLE generated_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  plan_data JSONB NOT NULL,               -- full structured JSON plan (Section 8 schema)
  philosophy_module_ids TEXT[] NOT NULL,   -- which modules were used
  module_versions JSONB NOT NULL,          -- version of each module at generation time
  generation_source TEXT NOT NULL,         -- 'rules_engine' | 'ai_assisted' | 'gap_fallback'
  plan_version TEXT DEFAULT '1.0',
  assumptions TEXT[] DEFAULT '{}',
  validation_flags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  is_outdated BOOLEAN DEFAULT FALSE,      -- flagged when source modules are updated
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_generated_plans_user ON generated_plans(user_id);
CREATE INDEX idx_generated_plans_active ON generated_plans(user_id, is_active);

-- User Outcomes (feedback loop data)
CREATE TABLE user_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  plan_id UUID REFERENCES generated_plans(id),
  week_number INT,
  sessions_planned INT,
  sessions_completed INT,
  difficulty_rating TEXT,                 -- too_easy / just_right / too_hard
  energy_level TEXT,                      -- low / moderate / high
  sleep_quality TEXT,                     -- poor / fair / good
  soreness_level TEXT,                    -- none / mild / moderate / severe
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_outcomes_user ON user_outcomes(user_id);
CREATE INDEX idx_user_outcomes_plan ON user_outcomes(plan_id);

-- Philosophy Gaps (tracks where the doc is missing coverage)
CREATE TABLE philosophy_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension TEXT NOT NULL,                -- e.g., 'sport_profile', 'event_specific'
  value TEXT NOT NULL,                    -- e.g., 'rowing', 'pickleball'
  user_count INT DEFAULT 1,              -- how many users hit this gap
  sample_user_profiles JSONB DEFAULT '[]', -- anonymized examples for analysis
  resolution_status TEXT DEFAULT 'open',  -- open / in_progress / resolved
  resolution_notes TEXT,                  -- what was done to close the gap
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_philosophy_gaps_unique ON philosophy_gaps(dimension, value);

-- Exercise Library (needed by rules engine for deterministic plan assembly)
CREATE TABLE exercise_library (
  id TEXT PRIMARY KEY,                    -- e.g., 'barbell_back_squat'
  name TEXT NOT NULL,                     -- 'Barbell Back Squat'
  movement_pattern TEXT NOT NULL,         -- squat / hinge / push / pull / carry / core / isolation
  muscle_groups TEXT[] NOT NULL,          -- ['quads', 'glutes', 'core']
  equipment_required TEXT[] DEFAULT '{}', -- ['barbell', 'squat_rack']
  difficulty TEXT NOT NULL,               -- beginner / intermediate / advanced
  tier INT NOT NULL,                      -- 1 = primary compound, 2 = secondary compound, 3 = accessory
  sport_relevance TEXT[] DEFAULT '{}',    -- ['strength', 'general_fitness', 'hybrid']
  contraindications TEXT[] DEFAULT '{}',  -- ['shoulder_injury', 'lower_back_injury']
  substitutions TEXT[] DEFAULT '{}',      -- ['goblet_squat', 'leg_press', 'front_squat']
  default_rep_range TEXT,                 -- '6-12'
  default_rest_seconds INT,              -- 120
  instructions TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_exercise_library_pattern ON exercise_library(movement_pattern);
CREATE INDEX idx_exercise_library_equipment ON exercise_library USING GIN(equipment_required);
CREATE INDEX idx_exercise_library_tier ON exercise_library(tier);

-- Module Version History (audit trail)
CREATE TABLE module_version_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id TEXT NOT NULL REFERENCES philosophy_modules(id),
  old_version TEXT NOT NULL,
  new_version TEXT NOT NULL,
  change_description TEXT NOT NULL,
  changed_by TEXT DEFAULT 'manual',       -- 'manual' | 'sync_pipeline'
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Task 1.2: Seed Philosophy Modules

Create `philosophy/philosophy_modules.json` containing ALL modules from the Philosophy Spec. Each module must follow this exact schema:

```json
{
  "id": "LEVEL_BEGINNER",
  "category": "athlete_level",
  "title": "Beginner training philosophy",
  "version": "1.0",
  "applies_when": {
    "level": "beginner",
    "sport_profile": "any",
    "goal": "any"
  },
  "principles": [
    "Keep weekly structure predictable and repeatable",
    "..."
  ],
  "plan_rules": [
    "Limit complexity: 3-5 exercises per session for strength",
    "Default to full-body or upper/lower splits",
    "..."
  ],
  "hard_constraints": [
    "Max 4 training days/week unless user explicitly requests more",
    "No VO2max work in first 4 weeks for endurance",
    "RPE 6-7 for strength (3-4 reps in reserve)",
    "..."
  ],
  "nutrition_rules": [
    "Start with fundamentals: consistent protein intake, adequate hydration, regular meals",
    "Provide calorie target and protein target; macros optional",
    "..."
  ],
  "training_adjustments": [],
  "coaching_tone": "Encouraging, clear, non-judgmental, educational without being overwhelming",
  "evidence_sources": [
    "Helms et al. Muscle & Strength Pyramids",
    "ACSM guidelines for novice exercisers",
    "Schoenfeld 2016 meta-analysis on training frequency"
  ],
  "rationale": "Beginners benefit most from sustainable structure. Slightly underdosed plans that get completed beat optimal plans that get abandoned.",
  "priority": "high",
  "is_active": true
}
```

**Source the complete module content from these sections of the Philosophy Spec:**

| Module Category | Spec Section | Module Count |
|---|---|---|
| athlete_level | Section 4.3 | 3 (LEVEL_BEGINNER, LEVEL_INTERMEDIATE, LEVEL_ADVANCED) |
| age_group | Section 4.4 | 5 (AGE_18_29, AGE_30_39, AGE_40_49, AGE_50_59, AGE_60_PLUS) |
| gender | Section 4.5 | 3 (GENDER_MALE, GENDER_FEMALE, GENDER_DEFAULT) |
| sport_strength | Section 5.1 | 1 (SPORT_STRENGTH_CORE) |
| goal | Sections 5.1 (inline) | 4 (GOAL_BULK, GOAL_CUT, GOAL_LOSE_WEIGHT, GOAL_MAINTAIN) |
| sport_endurance | Section 5.2 | 1 (SPORT_ENDURANCE_RUNNING) |
| event_running | Section 5.2 | 5 (EVENT_5K, EVENT_10K, EVENT_HALF_MARATHON, EVENT_MARATHON, EVENT_ULTRA) |
| sport_cycling | Section 5.3 | 1 (SPORT_CYCLING) |
| sport_swimming | Section 5.4 | 1 (SPORT_SWIMMING) |
| sport_triathlon | Section 5.5 | 1 (SPORT_TRIATHLON) |
| sport_hiit | Section 5.6 | 1 (SPORT_HIIT) |
| sport_bodyweight | Section 5.7 | 1 (SPORT_BODYWEIGHT) |
| sport_yoga_mobility | Section 5.8 | 1 (SPORT_YOGA_MOBILITY) |
| sport_other | Section 5.9 | 4 (SPORT_ROWING, SPORT_PILATES, SPORT_WALKING, SPORT_SPECIFIC) |
| nutrition_strength | Section 6.2 | 1 (NUTRITION_STRENGTH_BY_GOAL) |
| nutrition_endurance | Section 6.3 | 1 (NUTRITION_ENDURANCE_BY_DISTANCE) |
| nutrition_cycling_tri | Section 6.4 | 1 (NUTRITION_CYCLING_TRIATHLON) |
| nutrition_hiit_bw | Section 6.5 | 1 (NUTRITION_HIIT_BODYWEIGHT) |
| nutrition_yoga_low | Section 6.6 | 1 (NUTRITION_YOGA_MOBILITY_WALKING) |
| variation | Section 7 | 5 (VARIATION_EXERCISE_ROTATION, VARIATION_REP_UNDULATION, VARIATION_RUNNING, VARIATION_HIIT, VARIATION_MESOCYCLE) |
| safety | Section 2.4 | 1 (SAFETY_BOUNDARIES) |
| hydration | Section 6.1 (hydration bullet) | 1 (HYDRATION_UNIVERSAL) |

**Total: ~44 base modules.** Build all of these from the spec content. The spec mentions 90-130 modules — additional modules will come from more granular breakdowns (e.g., separate modules for each nutrition goal within each sport, recovery state modules, injury caution modules). Create placeholders for planned-but-not-yet-detailed modules.

### Task 1.3: Seed Exercise Library

Create `philosophy/exercise_library.json` with a comprehensive exercise database. This is NOT in the philosophy spec and must be built. The rules engine needs this to assemble workouts deterministically.

**Required exercise coverage:**

For each movement pattern, include exercises at all three tiers and all equipment levels:

| Movement Pattern | Tier 1 (Primary) | Tier 2 (Secondary) | Tier 3 (Accessory) |
|---|---|---|---|
| Squat | Barbell Back Squat, Front Squat | Goblet Squat, Leg Press, Bulgarian Split Squat | Leg Extension, Wall Sit, Sissy Squat |
| Hinge | Conventional Deadlift, Sumo Deadlift | Romanian Deadlift, Trap Bar Deadlift, KB Swing | Good Morning, Cable Pull-Through, Back Extension |
| Horizontal Push | Barbell Bench Press | Dumbbell Bench Press, Incline Press, Push-Up | Cable Fly, Pec Deck, Dumbbell Fly |
| Vertical Push | Overhead Press | Dumbbell Shoulder Press, Arnold Press, Landmine Press | Lateral Raise, Front Raise, Face Pull |
| Horizontal Pull | Barbell Row | Cable Row, Dumbbell Row, Chest-Supported Row | Band Pull-Apart, Rear Delt Fly |
| Vertical Pull | Pull-Up, Chin-Up | Lat Pulldown, Assisted Pull-Up | Cable Pullover, Straight-Arm Pulldown |
| Core | Plank, Dead Bug | Ab Wheel Rollout, Pallof Press, Hanging Leg Raise | Cable Crunch, Side Plank, Bird Dog |
| Carry | Farmer Walk | Suitcase Carry, Overhead Carry | Plate Carry, Waiter Walk |
| Isolation - Arms | — | Barbell Curl, Skull Crusher | Dumbbell Curl, Hammer Curl, Tricep Pushdown, Overhead Extension |
| Isolation - Legs | — | — | Calf Raise, Leg Curl, Hip Thrust, Glute Bridge |

**Each exercise entry must include:**
- `id`, `name`, `movement_pattern`, `muscle_groups[]`, `equipment_required[]`
- `difficulty` (beginner/intermediate/advanced)
- `tier` (1/2/3)
- `sport_relevance[]`
- `contraindications[]` (e.g., shoulder_injury for overhead press)
- `substitutions[]` (exercise IDs that can replace this one)
- `default_rep_range`, `default_rest_seconds`

**Minimum: 120 exercises** covering all patterns, equipment levels (none/dumbbells/kettlebell/full_gym/home_gym), and difficulty levels.

### Task 1.4: Create Static JSON Fallback

Create `philosophy/modules_static.json` — a bundled copy of all active modules for offline/instant access. This file is loaded by the app on startup and used when Supabase is unavailable or for instant plan generation without network latency.

```javascript
// In app startup:
let philosophyModules = null;

async function loadPhilosophyModules() {
  try {
    // Try Supabase first (latest versions)
    const { data } = await supabase.from('philosophy_modules').select('*').eq('is_active', true);
    philosophyModules = data;
    // Update static cache
    localStorage.setItem('philosophy_modules_cache', JSON.stringify(data));
    localStorage.setItem('philosophy_modules_cache_at', new Date().toISOString());
  } catch (e) {
    // Fall back to static file or localStorage cache
    const cached = localStorage.getItem('philosophy_modules_cache');
    if (cached) {
      philosophyModules = JSON.parse(cached);
    } else {
      const response = await fetch('philosophy/modules_static.json');
      philosophyModules = await response.json();
    }
  }
}
```

---

## 4. Phase 2: Philosophy Engine — Classification & Retrieval

**Goal:** Build the user classification system and module retrieval logic.

### Agent: `philosophy-engine-agent`

**Files to create:**
- `js/philosophy-engine.js`

### Task 2.1: User Classification

Implement the 11-dimension classification system from Philosophy Spec Section 3.1.

```javascript
// philosophy-engine.js

/**
 * Classify a user across all 11 dimensions.
 * Input: user profile object from localStorage/Supabase
 * Output: classification object used for module retrieval
 */
function classifyUser(profile) {
  return {
    level: profile.fitnessLevel || 'beginner',  // beginner / intermediate / advanced

    ageGroup: classifyAgeGroup(profile.age),  // 18-29 / 30-39 / 40-49 / 50-59 / 60+

    gender: profile.gender || 'default',  // male / female / non_binary / prefer_not_to_say → default

    sportProfile: deriveSportProfile(profile),  // general_fitness / strength / endurance / hybrid / sport_performance

    primaryGoal: mapGoal(profile.goal),  // performance / muscle_gain / fat_loss / general_health / return_to_training

    trainingFrequency: classifyFrequency(profile.availableDaysPerWeek),  // 2-3 / 4-5 / 6-7

    sessionDuration: classifyDuration(profile.sessionLength),  // 15-30 / 30-45 / 45-60 / 60+

    equipmentAccess: classifyEquipment(profile.equipment),  // none / dumbbells / kettlebell / full_gym / home_gym

    injuryHistory: classifyInjury(profile.injuries || []),  // none / minor_current / major_past / chronic

    recoveryState: deriveRecoveryState(profile),  // good / moderate / low (from check-in data)

    nutritionProfile: deriveNutritionProfile(profile)  // habit_building / macro_tracking / performance_fueling / weight_management
  };
}
```

**Helper functions to implement:**

- `classifyAgeGroup(age)`: Map numeric age to age group string
- `deriveSportProfile(profile)`: Derive from workout-type selections and profile.goal
- `mapGoal(goal)`: Map profile.goal field to philosophy module goal values
- `classifyFrequency(days)`: Group available days into 2-3 / 4-5 / 6-7
- `classifyDuration(minutes)`: Group session length
- `classifyEquipment(equipment)`: Map equipment list to access level
- `classifyInjury(injuries)`: Classify injury severity
- `deriveRecoveryState(profile)`: Use latest check-in data (sleep, soreness, energy)
- `deriveNutritionProfile(profile)`: Derive from goal + level combination

### Task 2.2: Module Retrieval

```javascript
/**
 * Retrieve matching philosophy modules for a user classification.
 * Returns 5-10 modules that apply to this user's profile.
 */
async function retrieveModules(classification) {
  const modules = [];
  const gaps = [];

  // Define retrieval queries per dimension
  const queries = [
    { dimension: 'level', filter: { level: classification.level } },
    { dimension: 'age_group', filter: { age_group: classification.ageGroup } },
    { dimension: 'gender', filter: { gender: classification.gender === 'non_binary' || classification.gender === 'prefer_not_to_say' ? 'default' : classification.gender } },
    { dimension: 'sport_profile', filter: { sport_profile: classification.sportProfile } },
    { dimension: 'goal', filter: { goal: classification.primaryGoal } },
    // Event-specific if applicable
    // Recovery state
    { dimension: 'recovery', filter: { recovery_state: classification.recoveryState } },
    // Injury caution if applicable
    // Nutrition profile
    { dimension: 'nutrition', filter: { nutrition_profile: classification.nutritionProfile } },
    // Variation rules (always included)
    { dimension: 'variation', filter: { category: 'variation' } },
    // Safety (always included)
    { dimension: 'safety', filter: { category: 'safety' } },
  ];

  for (const query of queries) {
    const matched = await queryModules(query.filter);
    if (matched.length > 0) {
      modules.push(...matched);
    } else {
      // GAP DETECTED — log it
      gaps.push({
        dimension: query.dimension,
        value: JSON.stringify(query.filter),
        timestamp: new Date().toISOString()
      });
    }
  }

  // Log gaps to Supabase
  if (gaps.length > 0) {
    await logPhilosophyGaps(gaps);
  }

  return { modules, gaps };
}

/**
 * Query modules from Supabase (or static cache).
 * Uses the applies_when JSONB field for matching.
 */
async function queryModules(filter) {
  // If modules are cached locally, filter in-memory
  if (philosophyModules) {
    return philosophyModules.filter(m =>
      m.is_active && matchesFilter(m.applies_when, filter)
    );
  }

  // Otherwise query Supabase
  // Build query based on filter
  const { data } = await supabase
    .from('philosophy_modules')
    .select('*')
    .eq('is_active', true)
    .contains('applies_when', filter);

  return data || [];
}

/**
 * Check if a module's applies_when conditions match a filter.
 * "any" in the module means it matches all values for that dimension.
 */
function matchesFilter(appliesWhen, filter) {
  for (const [key, value] of Object.entries(filter)) {
    const moduleValue = appliesWhen[key];
    if (!moduleValue) continue; // dimension not specified in module = matches all
    if (moduleValue === 'any') continue; // explicit wildcard
    if (Array.isArray(moduleValue)) {
      if (!moduleValue.includes(value)) return false;
    } else {
      if (moduleValue !== value) return false;
    }
  }
  return true;
}
```

---

## 5. Phase 3: Rules Engine — Deterministic Plan Assembly

**Goal:** Build the engine that assembles training + nutrition + hydration plans WITHOUT calling Claude. This is the core of the "philosophy-first" architecture.

### Agent: `rules-engine-agent`

**Files to create:**
- `js/rules-engine.js`
- `js/exercise-selector.js`
- `js/nutrition-calculator.js`

### Task 3.1: Plan Assembly Logic

The rules engine takes matched modules and user profile, then deterministically builds a plan.

```javascript
// rules-engine.js

/**
 * Generate a complete plan from philosophy modules + user profile.
 * NO AI call. Pure rules-based assembly.
 *
 * Returns a plan object matching the Section 8 output schema.
 */
function generatePlanFromModules(classification, modules, profile) {
  // 1. Determine plan structure
  const structure = determinePlanStructure(classification, modules);

  // 2. Build weekly template
  const weeklyTemplate = buildWeeklyTemplate(structure, classification, modules);

  // 3. Select exercises for each session (using exercise library)
  const populatedWeek = populateExercises(weeklyTemplate, classification, modules, profile);

  // 4. Apply variation engine (exercise rotation, rep undulation)
  const variedPlan = applyVariation(populatedWeek, structure, modules);

  // 5. Calculate nutrition targets
  const nutrition = calculateNutrition(classification, modules, profile);

  // 6. Calculate hydration targets
  const hydration = calculateHydration(classification, modules, profile);

  // 7. Build adaptation rules
  const adaptationRules = buildAdaptationRules(classification, modules);

  // 8. Build rationale (the "Why this plan?" explanation)
  const rationale = buildRationale(classification, modules, structure);

  // 9. Assemble into output schema
  return {
    plan_metadata: {
      generated_at: new Date().toISOString(),
      philosophy_modules_used: modules.map(m => m.id),
      module_versions: Object.fromEntries(modules.map(m => [m.id, m.version])),
      plan_version: '1.0',
      generation_source: 'rules_engine'
    },
    athlete_summary: {
      level: classification.level,
      sport_profile: classification.sportProfile,
      primary_goal: classification.primaryGoal,
      constraints: {
        days_per_week: profile.availableDaysPerWeek,
        session_duration: profile.sessionLength + 'min',
        equipment: profile.equipment || 'full_gym',
        injuries: profile.injuries || []
      },
      recovery_state: classification.recoveryState
    },
    plan_structure: structure,
    weekly_template: populatedWeek,
    progression_logic: variedPlan.progressionLogic,
    nutrition_strategy: nutrition,
    hydration_strategy: hydration,
    adaptation_rules: adaptationRules,
    watchouts: buildWatchouts(classification, modules, profile),
    rationale: rationale,
    assumptions: buildAssumptions(classification, profile)
  };
}
```

### Task 3.2: Plan Structure Determination

Use the split design table from Spec Section 5.1 to determine workout structure:

```javascript
/**
 * Determine the overall plan structure based on available days,
 * sport profile, level, and philosophy module rules.
 */
function determinePlanStructure(classification, modules) {
  const days = parseInt(classification.trainingFrequency);

  // For strength-focused plans, use the split design table
  if (['strength', 'general_fitness'].includes(classification.sportProfile)) {
    const splitTable = {
      // days_per_week: { recommended_split, rationale }
      2: { split: 'full_body', rationale: 'Maximizes frequency per muscle with limited sessions' },
      3: { split: classification.level === 'beginner' ? 'full_body' : 'upper_lower', rationale: 'Balanced frequency and recovery' },
      4: { split: classification.level === 'advanced' ? 'ppl' : 'upper_lower', rationale: 'Allows more volume per session while maintaining frequency' },
      5: { split: classification.level === 'advanced' ? 'ppl' : 'upper_lower', rationale: 'Advanced split with adequate recovery' },
      6: { split: 'ppl', rationale: 'Advanced only; requires good recovery capacity' }
    };
    // ... build from splitTable
  }

  // For endurance plans, build around key sessions
  if (['endurance'].includes(classification.sportProfile)) {
    // Key sessions from event module + easy run days + rest days
    // ...
  }

  // For hybrid/triathlon
  if (['hybrid'].includes(classification.sportProfile)) {
    // Balanced swim/bike/run per volume distribution rules
    // ...
  }

  return {
    duration_weeks: determineDuration(classification),
    mesocycle_length: classification.level === 'beginner' ? 4 : (classification.level === 'advanced' ? 3 : 4),
    days_per_week: days,
    split_type: splitType,
    split_rationale: rationale,
    deload_frequency: determineDeloadFrequency(classification, modules)
  };
}
```

### Task 3.3: Exercise Selection

```javascript
// exercise-selector.js

/**
 * Select exercises for a workout session based on:
 * - Movement patterns required by the session type
 * - User's equipment access
 * - User's difficulty level
 * - Injury contraindications
 * - Tier rotation rules (from variation module)
 * - Previous workout history (avoid repeating tier 3 accessories)
 */
function selectExercises(sessionType, classification, profile, exerciseLibrary, previousExercises) {
  const movementPatterns = getRequiredPatterns(sessionType);
  const available = exerciseLibrary.filter(ex =>
    ex.is_active &&
    hasRequiredEquipment(ex, profile.equipment) &&
    isAppropriateLevel(ex, classification.level) &&
    !hasContraindication(ex, profile.injuries)
  );

  const selected = [];
  for (const pattern of movementPatterns) {
    const candidates = available.filter(ex => ex.movement_pattern === pattern);
    // Select by tier: one Tier 1 or 2 compound, then Tier 3 accessories
    const compound = selectByTier(candidates, [1, 2], previousExercises);
    const accessory = selectByTier(candidates, [3], previousExercises);
    selected.push(compound, accessory);
  }

  return selected.filter(Boolean);
}
```

### Task 3.4: Nutrition Calculator

```javascript
// nutrition-calculator.js

/**
 * Calculate nutrition targets from philosophy modules + user profile.
 * Uses the tables from Spec Sections 6.2-6.6.
 */
function calculateNutrition(classification, modules, profile) {
  // 1. Calculate TDEE
  const tdee = calculateTDEE(profile); // Mifflin-St Jeor + activity multiplier

  // 2. Get goal-specific adjustments from nutrition module
  const nutritionModule = modules.find(m => m.category.startsWith('nutrition'));

  // 3. Apply calorie adjustment based on goal
  const calorieAdjustment = getCalorieAdjustment(classification.primaryGoal);
  // bulk: +10-20%, cut: -15-25%, maintain: 0, lose_weight: -20-30%

  // 4. Calculate macros
  const protein = getProteinTarget(classification, profile); // g/kg from module
  const carbs = getCarbTarget(classification, profile);
  const fat = getFatTarget(classification, profile);

  // 5. Apply safety floors
  const calories = Math.max(
    tdee * (1 + calorieAdjustment),
    profile.gender === 'female' ? 1200 : 1500  // hard floor from Spec Section 2.4
  );

  return {
    daily_targets: {
      calories: Math.round(calories),
      protein_g: Math.round(protein * profile.weight),
      carbs_g: Math.round(carbs * profile.weight),
      fat_g: Math.round(fat * profile.weight)
    },
    training_day_adjustments: getTrainingDayAdjustments(classification),
    race_fueling_plan: getRaceFuelingPlan(classification, modules),
    meal_timing: getMealTimingGuidance(classification, modules),
    supplements: getSupplementGuidance(modules)
  };
}
```

---

## 6. Phase 4: Validator & Safety Layer

**Goal:** Build the post-generation validator that enforces hard rules.

### Agent: `validator-agent`

**Files to create:**
- `js/validator.js`

### Task 4.1: Hard Rule Validation

Implement ALL rules from Spec Section 9.1:

```javascript
// validator.js

const HARD_RULES = [
  {
    id: 'calorie_floor',
    check: (plan, profile) => {
      const cals = plan.nutrition_strategy.daily_targets.calories;
      const floor = profile.gender === 'female' ? 1200 : 1500;
      return cals >= floor;
    },
    fix: (plan, profile) => {
      const floor = profile.gender === 'female' ? 1200 : 1500;
      plan.nutrition_strategy.daily_targets.calories = Math.max(
        plan.nutrition_strategy.daily_targets.calories, floor
      );
      return { fixed: true, flag: `Calorie target raised to floor: ${floor}` };
    }
  },
  {
    id: 'protein_floor',
    check: (plan, profile) => {
      const proteinPerLb = plan.nutrition_strategy.daily_targets.protein_g / (profile.weight * 2.205);
      return proteinPerLb >= 0.6;
    },
    fix: (plan, profile) => {
      const minProtein = Math.round(profile.weight * 2.205 * 0.6);
      plan.nutrition_strategy.daily_targets.protein_g = Math.max(
        plan.nutrition_strategy.daily_targets.protein_g, minProtein
      );
      return { fixed: true, flag: `Protein raised to floor: ${minProtein}g` };
    }
  },
  {
    id: 'max_weekly_volume_increase',
    check: (plan, profile) => {
      // Check endurance: <= 15% increase
      // Check strength: <= 4 sets/muscle/week increase
      // Compared against previous plan if exists
      return true; // implement with previous plan comparison
    },
    fix: (plan) => {
      // Cap increases
      return { fixed: true, flag: 'Volume increase capped to safe limit' };
    }
  },
  {
    id: 'prohibited_phrases',
    check: (plan) => {
      const prohibited = ['guaranteed results', 'lose \\d+ (lbs|pounds) in \\d+ days', 'cure', 'treat', 'diagnose', 'burn off that meal'];
      const planText = JSON.stringify(plan).toLowerCase();
      return !prohibited.some(phrase => new RegExp(phrase, 'i').test(planText));
    },
    fix: (plan) => {
      // Strip prohibited phrases (mainly relevant for AI-generated text)
      return { fixed: true, flag: 'Prohibited phrase detected and removed' };
    }
  },
  {
    id: 'beginner_complexity',
    check: (plan, profile) => {
      if (profile.fitnessLevel !== 'beginner') return true;
      // Max 5 exercises per session, max 4 training days
      const maxExercises = Math.max(...Object.values(plan.weekly_template)
        .filter(d => d.exercises)
        .map(d => d.exercises.length));
      const trainingDays = Object.values(plan.weekly_template)
        .filter(d => d.session_type !== 'rest').length;
      return maxExercises <= 5 && trainingDays <= 4;
    },
    fix: (plan) => {
      // Simplify plan
      return { fixed: true, flag: 'Beginner plan simplified to appropriate complexity' };
    }
  },
  {
    id: 'rest_day_inclusion',
    check: (plan) => {
      const restDays = Object.values(plan.weekly_template)
        .filter(d => d.session_type === 'rest').length;
      return restDays >= 1;
    },
    fix: (plan) => {
      // Add a rest day
      return { fixed: true, flag: 'Rest day added to meet minimum requirement' };
    }
  },
  {
    id: 'deload_inclusion',
    check: (plan) => {
      if (plan.plan_structure.duration_weeks < 4) return true;
      // Check that deload week exists
      return plan.plan_structure.mesocycle_length <= 5; // implies deload within cycle
    },
    fix: (plan) => {
      return { fixed: true, flag: 'Deload week added' };
    }
  },
  {
    id: 'disclaimer_present',
    check: (plan) => {
      return plan.rationale && plan.rationale.includes('general wellness');
    },
    fix: (plan) => {
      plan.disclaimer = 'This plan provides general wellness guidance and is not a substitute for professional medical advice. Consult a healthcare provider before starting any new exercise or nutrition program.';
      return { fixed: true, flag: 'Wellness disclaimer appended' };
    }
  }
];

/**
 * Validate a generated plan against all hard rules.
 * Returns the plan (possibly fixed) and a list of flags.
 */
function validatePlan(plan, profile) {
  const flags = [];
  let validatedPlan = JSON.parse(JSON.stringify(plan)); // deep clone

  for (const rule of HARD_RULES) {
    if (!rule.check(validatedPlan, profile)) {
      const result = rule.fix(validatedPlan, profile);
      flags.push({ rule: rule.id, ...result });
    }
  }

  return {
    plan: validatedPlan,
    flags: flags,
    passed: flags.length === 0,
    passedAfterFixes: flags.every(f => f.fixed)
  };
}
```

---

## 7. Phase 5: AI Fallback — Constrained Claude Calls

**Goal:** For freeform "Ask IronZ" requests, call Claude but constrain it with philosophy modules.

### Agent: `ai-fallback-agent`

**Files to modify:**
- `js/planner.js` (update existing)

### Task 5.1: Updated Planner with Philosophy Context

```javascript
// planner.js (updated)

/**
 * Main plan generation entry point.
 * Decides: rules engine OR AI-assisted.
 */
async function generatePlan(request) {
  const profile = getProfile();
  const classification = classifyUser(profile);
  const { modules, gaps } = await retrieveModules(classification);

  // DECISION: Can the rules engine handle this?
  if (request.type === 'standard' && gaps.length === 0) {
    // STANDARD FLOW — no AI call
    console.log('[IronZ] Generating plan from philosophy modules (no AI call)');
    const plan = generatePlanFromModules(classification, modules, profile);
    const validated = validatePlan(plan, profile);
    await storePlan(validated.plan, 'rules_engine');
    return validated;
  }

  if (request.type === 'freeform' || request.type === 'ask_ironz') {
    // FREEFORM FLOW — AI call with philosophy constraints
    console.log('[IronZ] Freeform request — calling Claude with philosophy context');
    return await generateWithAI(request, classification, modules, profile);
  }

  if (gaps.length > 0) {
    // GAP FLOW — log gap, use conservative fallback
    console.log('[IronZ] Gap detected — using fallback');
    console.log('[IronZ] Gaps:', gaps);
    // Try rules engine with available modules + conservative defaults
    const plan = generatePlanFromModules(classification, modules, profile);
    plan.plan_metadata.generation_source = 'gap_fallback';
    plan.plan_metadata.gaps_detected = gaps;
    const validated = validatePlan(plan, profile);
    await storePlan(validated.plan, 'gap_fallback');
    return validated;
  }
}

/**
 * Generate plan using AI (Claude) with philosophy modules as context.
 * Only used for freeform "Ask IronZ" requests.
 */
async function generateWithAI(request, classification, modules, profile) {
  // Assemble the 4-layer prompt
  const prompt = assembleAIPrompt(request, classification, modules, profile);

  // Call Claude via Supabase Edge Function
  const response = await supabase.functions.invoke('generate-plan', {
    body: { prompt, outputSchema: PLAN_OUTPUT_SCHEMA }
  });

  // Parse and validate
  const plan = JSON.parse(response.data.plan);
  plan.plan_metadata.generation_source = 'ai_assisted';
  plan.plan_metadata.freeform_request = request.text;

  const validated = validatePlan(plan, profile);
  await storePlan(validated.plan, 'ai_assisted');
  return validated;
}

/**
 * Assemble the 4-layer prompt for AI calls.
 * This is the key: Claude gets constrained by your philosophy.
 */
function assembleAIPrompt(request, classification, modules, profile) {
  // Layer 1: Immutable rules
  const layer1 = `
IMMUTABLE RULES (never violate these):
- You are generating a fitness/nutrition plan for the IronZ app.
- Never diagnose, prescribe, cure, treat, or provide medical nutrition therapy.
- Calorie floors: minimum 1200 cal/day (women), 1500 cal/day (men).
- Protein floor: never suggest < 0.6 g/lb bodyweight.
- Never use prohibited phrases: "guaranteed results", "lose X lbs in Y days", "burn off that meal", "cure", "treat", "diagnose".
- Max weekly volume increase: 15% for endurance, 4 sets/muscle for strength.
- Every plan must include at least 1 full rest day per week.
- Include a wellness disclaimer.
- Plans longer than 4 weeks must include deload weeks.
`;

  // Layer 2: Retrieved philosophy modules
  const layer2 = modules.map(m => `
MODULE: ${m.id} (v${m.version})
Category: ${m.category}
Principles: ${m.principles.join('; ')}
Plan Rules: ${m.plan_rules.join('; ')}
Hard Constraints: ${m.hard_constraints.join('; ')}
Nutrition Rules: ${(m.nutrition_rules || []).join('; ')}
Coaching Tone: ${m.coaching_tone || 'Professional and encouraging'}
`).join('\n---\n');

  // Layer 3: User profile
  const layer3 = `
USER PROFILE:
Level: ${classification.level}
Age Group: ${classification.ageGroup}
Sport: ${classification.sportProfile}
Goal: ${classification.primaryGoal}
Days/Week: ${profile.availableDaysPerWeek}
Session Length: ${profile.sessionLength} min
Equipment: ${profile.equipment || 'full_gym'}
Injuries: ${(profile.injuries || []).join(', ') || 'None'}
Recovery State: ${classification.recoveryState}
Weight: ${profile.weight} lbs
Height: ${profile.height} inches
Gender: ${profile.gender || 'not specified'}
`;

  // Layer 4: Output schema
  const layer4 = `
OUTPUT FORMAT: Return a valid JSON object matching the IronZ plan output schema.
Include: plan_metadata, athlete_summary, plan_structure, weekly_template, progression_logic, nutrition_strategy, hydration_strategy, adaptation_rules, watchouts, rationale, assumptions.
`;

  // User's freeform request
  const userRequest = `
USER REQUEST: ${request.text}

IMPORTANT: Your response MUST be consistent with the philosophy modules above. Do not contradict any principle, plan rule, or hard constraint. If the user's request conflicts with a hard constraint, explain why you adapted the request to stay within safety boundaries.
`;

  return layer1 + '\n' + layer2 + '\n' + layer3 + '\n' + layer4 + '\n' + userRequest;
}
```

---

## 8. Phase 6: Gap Detection & Feedback Loop

**Goal:** Track where the philosophy doc doesn't have coverage, and build the user feedback loop.

### Agent: `feedback-agent`

**Files to create/modify:**
- `js/gap-tracker.js`
- `js/feedback-loop.js`

### Task 6.1: Gap Tracking

```javascript
// gap-tracker.js

/**
 * Log a philosophy gap to Supabase.
 * Called when module retrieval finds no match for a dimension.
 */
async function logPhilosophyGaps(gaps) {
  for (const gap of gaps) {
    // Upsert: increment count if exists, create if new
    const { data: existing } = await supabase
      .from('philosophy_gaps')
      .select('id, user_count')
      .eq('dimension', gap.dimension)
      .eq('value', gap.value)
      .single();

    if (existing) {
      await supabase.from('philosophy_gaps').update({
        user_count: existing.user_count + 1,
        last_seen: new Date().toISOString()
      }).eq('id', existing.id);
    } else {
      await supabase.from('philosophy_gaps').insert({
        dimension: gap.dimension,
        value: gap.value,
        user_count: 1
      });
    }
  }
}

/**
 * Get a summary of open gaps for the admin dashboard.
 */
async function getGapSummary() {
  const { data } = await supabase
    .from('philosophy_gaps')
    .select('*')
    .eq('resolution_status', 'open')
    .order('user_count', { ascending: false });

  return data;
}
```

### Task 6.2: User Outcomes & Feedback

```javascript
// feedback-loop.js

/**
 * Record a weekly check-in from the user.
 * This data feeds back into the philosophy refinement loop.
 */
async function recordWeeklyCheckIn(checkInData) {
  const profile = getProfile();
  const activePlan = await getActivePlan(profile.id);

  await supabase.from('user_outcomes').insert({
    user_id: profile.id,
    plan_id: activePlan?.id,
    week_number: checkInData.weekNumber,
    sessions_planned: checkInData.planned,
    sessions_completed: checkInData.completed,
    difficulty_rating: checkInData.difficulty,  // too_easy / just_right / too_hard
    energy_level: checkInData.energy,
    sleep_quality: checkInData.sleep,
    soreness_level: checkInData.soreness,
    notes: checkInData.notes
  });

  // Update recovery state based on check-in
  const newRecoveryState = deriveRecoveryFromCheckIn(checkInData);
  await updateProfileRecoveryState(profile.id, newRecoveryState);
}

/**
 * Aggregate analysis: compare user outcomes against module predictions.
 * Run periodically (every 4-8 weeks) to identify modules that need updating.
 */
async function analyzeModuleEffectiveness() {
  // Query: for each module, what's the average difficulty rating
  // for plans that used that module?
  const { data } = await supabase.rpc('module_effectiveness_report');

  // Flag modules where users consistently rate "too_hard" or "too_easy"
  const flagged = data.filter(m =>
    m.avg_difficulty_score > 0.7 || m.avg_difficulty_score < 0.3
  );

  return flagged;
}
```

---

## 9. Phase 7: Philosophy Sync Pipeline

**Goal:** Build the pipeline that syncs changes from the .docx philosophy document into Supabase modules.

### Agent: `sync-pipeline-agent`

**Files to create:**
- `scripts/philosophy-sync.js` (Node.js script, run from CLI)

### Task 7.1: Sync Pipeline

This is a Node.js script that reads the philosophy .docx, compares against Supabase, and updates changed modules.

```javascript
// scripts/philosophy-sync.js
// Run: node scripts/philosophy-sync.js --docx-path "/path/to/IronZ_Philosophy_Engine_Spec_v1.0.docx"

/**
 * Philosophy Sync Pipeline
 *
 * 1. Reads the .docx file using pandoc (converts to markdown)
 * 2. Parses sections into module objects
 * 3. Compares against current Supabase modules
 * 4. Identifies changes (new modules, updated content, removed modules)
 * 5. Prompts for confirmation and version bump type
 * 6. Updates Supabase
 * 7. Regenerates static JSON fallback
 * 8. Flags active plans built on old versions
 */

async function syncPhilosophy(docxPath) {
  // Step 1: Convert .docx to text
  const markdown = await convertDocxToMarkdown(docxPath);

  // Step 2: Parse into module objects
  const parsedModules = parseModulesFromMarkdown(markdown);

  // Step 3: Fetch current Supabase modules
  const currentModules = await fetchCurrentModules();

  // Step 4: Diff
  const diff = diffModules(parsedModules, currentModules);

  // Step 5: Report
  console.log(`\n=== PHILOSOPHY SYNC REPORT ===`);
  console.log(`New modules: ${diff.added.length}`);
  console.log(`Updated modules: ${diff.changed.length}`);
  console.log(`Unchanged modules: ${diff.unchanged.length}`);
  console.log(`Removed modules: ${diff.removed.length}`);

  if (diff.changed.length > 0) {
    console.log(`\nChanged modules:`);
    for (const change of diff.changed) {
      console.log(`  ${change.id}: ${change.summary}`);
    }
  }

  // Step 6: Confirm and update
  // In CLI mode, prompt for confirmation
  // Update Supabase with new versions
  // Log to module_version_history

  // Step 7: Regenerate static JSON
  await regenerateStaticJSON();

  // Step 8: Flag outdated plans
  await flagOutdatedPlans(diff.changed.map(c => c.id));
}
```

### Task 7.2: Outdated Plan Flagging

When modules are updated, plans built on old versions should be flagged (not broken):

```javascript
async function flagOutdatedPlans(changedModuleIds) {
  // Find all active plans that used any of the changed modules
  const { data: plans } = await supabase
    .from('generated_plans')
    .select('id, philosophy_module_ids')
    .eq('is_active', true)
    .eq('is_outdated', false);

  const outdated = plans.filter(p =>
    p.philosophy_module_ids.some(id => changedModuleIds.includes(id))
  );

  if (outdated.length > 0) {
    await supabase
      .from('generated_plans')
      .update({ is_outdated: true })
      .in('id', outdated.map(p => p.id));

    console.log(`Flagged ${outdated.length} active plans as outdated.`);
    console.log(`Users will see a "Your plan has been updated — regenerate?" prompt.`);
  }
}
```

---

## 10. Phase 8: Integration & Testing

**Goal:** Wire everything together and verify with golden test cases.

### Agent: `integration-agent`

### Task 8.1: Update App Entry Points

Modify `planner.js` (the existing file) to use the new philosophy engine:

```javascript
// Replace the current generatePlan() function with:
// 1. Load philosophy modules on app start (loadPhilosophyModules())
// 2. On "Generate Plan" button: call the new philosophy-first generatePlan()
// 3. On "Ask IronZ" freeform: route through AI-assisted path
// 4. On plan display: show rationale from modules, show "Why this plan?" section
```

### Task 8.2: Wire Into UI

Update these existing UI touch points:
- **"Generate & Schedule Plan" button** (line 262 of index.html): Call rules-engine path
- **"Ask IronZ" button** (lines 1441, 1840 of index.html): Call AI-assisted path
- **Plan display**: Add "Why this plan?" expandable section showing rationale
- **Outdated plan banner**: Show when `is_outdated === true` with "Regenerate?" button

### Task 8.3: Golden Test Cases

Run ALL 5 test cases from Spec Section 9.3 against the rules engine and verify:

1. **Beginner Runner, Weight Loss** — simple run/walk, Z1-Z2 only, 20-25% deficit, encouraging tone, NO complex periodization
2. **Intermediate Lifter, Muscle Gain** — Upper/Lower or PPL, 12-18 sets/week, double progression, 10-20% surplus, deload week 4
3. **Advanced Cyclist, Performance** — FTP zones, polarized 80/20, recovery adjustment for poor sleep, precise tone
4. **Beginner General Fitness, Hybrid** — Full-body 2x + 1x cardio/yoga, 3-4 exercises, habit-based nutrition
5. **Intermediate Triathlete, Half Ironman** — Swim/bike/run 10/55/35%, brick workouts, race nutrition plan

Each test case should verify:
- Plan complexity matches level
- Nutrition matches goal
- Exercise selection respects equipment and injury constraints
- Variation rules are applied
- Validator passes without fixes
- Two materially different profiles produce materially different plans

---

## 11. Known Gaps in Philosophy Document

These are topics the rules engine will need that are NOT yet fully specified in the philosophy doc. Until these are built, the system should use conservative defaults and log gaps.

| Gap | Impact | Recommendation |
|---|---|---|
| **Exercise library** | Critical — rules engine cannot assemble workouts without it | Build 120+ exercise database as Phase 1, Task 1.3 |
| **Hyrox-specific module** | Medium — referenced in roadmap but not in philosophy doc | Add full Hyrox module: 8-station format, functional fitness + running intervals, periodization for Hyrox races |
| **Rowing full module** | Low — Section 5.9 has brief mention | Expand to full module with HR zones, key workouts, volume guidelines |
| **Sauna / heat acclimation** | Low — referenced in roadmap | Add recovery module covering sauna protocols, heat acclimation, cold exposure |
| **Recovery state modules** | Medium — classification references them but no full modules | Build RECOVERY_GOOD, RECOVERY_MODERATE, RECOVERY_LOW modules |
| **Injury caution modules** | Medium — classification references them but no full modules | Build INJURY_SHIN, INJURY_KNEE, INJURY_SHOULDER, INJURY_BACK, INJURY_GENERAL modules |
| **Template plan structures** | High for rules engine efficiency | For each common user archetype, create golden template plans the engine can customize rather than building from scratch |
| **Hydration full module** | Medium — only universal rules in Section 6.1 | Build context-aware hydration: base, workout-day, endurance event, hot weather protocols |

---

## 12. File Manifest

### New Files to Create

```
ironz-project/
├── supabase/
│   └── migrations/
│       └── 001_philosophy_engine.sql        # Database schema
│
├── philosophy/
│   ├── core_philosophy.md                   # Manifesto (from Spec Section 2)
│   ├── philosophy_modules.json              # All 44+ modules (from Spec Sections 4-7)
│   ├── exercise_library.json                # 120+ exercises with metadata
│   ├── plan_output_schema.json              # Required JSON format (from Spec Section 8)
│   ├── validator_rules.json                 # Hard rules (from Spec Section 9.1)
│   ├── user_classifier_rules.json           # Classification rules (from Spec Section 3)
│   ├── edge_case_escalation.json            # Safety escalation (from Spec Section 2.4)
│   ├── golden_test_cases.json               # 5 test cases (from Spec Section 9.3)
│   └── modules_static.json                  # Bundled offline copy of all modules
│
├── js/
│   ├── philosophy-engine.js                 # Classification + module retrieval
│   ├── rules-engine.js                      # Deterministic plan assembly
│   ├── exercise-selector.js                 # Exercise selection logic
│   ├── nutrition-calculator.js              # Nutrition target calculation
│   ├── validator.js                         # Hard rule validation
│   ├── gap-tracker.js                       # Gap detection + logging
│   └── feedback-loop.js                     # User outcomes + module effectiveness
│
├── scripts/
│   └── philosophy-sync.js                   # Sync pipeline (.docx → Supabase)
│
└── supabase/
    └── functions/
        └── generate-plan/
            └── index.ts                     # Edge function for AI-assisted calls
```

### Existing Files to Modify

```
├── planner.js        # Rewire to use philosophy engine + rules engine
├── index.html        # Add "Why this plan?" UI, outdated plan banner
├── survey.js         # Wire onboarding into classification system
├── app.js            # Load philosophy modules on startup
```

---

## Build Order (Recommended Execution Sequence)

| Phase | Description | Estimated Complexity | Dependencies |
|---|---|---|---|
| **Phase 1** | Supabase schema + module seeding + exercise library | High | None |
| **Phase 2** | Philosophy engine (classification + retrieval) | Medium | Phase 1 |
| **Phase 3** | Rules engine (deterministic plan assembly) | Very High | Phase 1, 2 |
| **Phase 4** | Validator | Medium | Phase 3 |
| **Phase 5** | AI fallback (constrained Claude calls) | Medium | Phase 2, 4 |
| **Phase 6** | Gap detection + feedback loop | Medium | Phase 2 |
| **Phase 7** | Philosophy sync pipeline | Medium | Phase 1 |
| **Phase 8** | Integration + golden test cases | High | All phases |

**Recommended parallelism for Claude Code agents:**
- Phase 1 (foundation-agent) runs first
- Phases 2, 6, 7 can run in parallel after Phase 1
- Phase 3 depends on Phase 2
- Phase 4 depends on Phase 3
- Phase 5 depends on Phases 2 + 4
- Phase 8 runs last

---

## Appendix: Philosophy Document Location & Access

**Human-readable master (Chase edits this):**
```
~/Desktop/Claude/fitness-app/Training Philosophy/Updated Source of Truth/IronZ_Philosophy_Engine_Spec_v1.0.docx
```

**App-consumable data (the app reads from these):**
```
Supabase: philosophy_modules table (canonical, latest versions)
Local:    philosophy/modules_static.json (offline fallback, synced from Supabase)
```

**The sync flow:**
```
.docx (Chase edits) → sync pipeline → Supabase modules (versioned) → static JSON (bundled)
```

**The generation flow:**
```
User request → classification → module retrieval → rules engine (no AI) → validator → plan
                                                  ↘ (freeform only) → Claude API (constrained) → validator → plan
```

---

## Appendix B: Seamless User Experience During Migration

### Principle: No User Should Ever Notice the Transition

The philosophy engine replaces the plan generation *backend*, not the UI. Users interact with the same buttons, same flows, same screens. The engine behind the curtain changes from "call Claude every time" to "rules engine first, Claude as constrained fallback."

### Migration Rules

1. **Existing plans are NEVER touched.** A plan that was generated under the old system stays in localStorage and Supabase exactly as-is. It continues to render, track, and function identically.

2. **No forced regeneration.** The `is_outdated` flag is informational, not destructive. When a philosophy module is updated, plans built on the old version get a soft flag. The user sees a gentle, dismissible banner: "We've updated our training science. Want to refresh your plan?" If they ignore it, everything keeps working.

3. **First load after deploy.** On the first app load after the philosophy engine ships:
   - Silently load philosophy modules into cache (localStorage + Supabase fetch)
   - Check if user has an active plan → if yes, do nothing. Plan keeps working.
   - Only engage the new engine when the user explicitly requests a new plan

4. **Fallback safety.** If the philosophy engine or rules engine fails for any reason (no modules loaded, Supabase unreachable, unexpected classification), fall back to the old behavior (direct Claude API call). Log the failure for debugging. The user should never see an error.

5. **Performance improvement.** Rules engine plans generate instantly (no network latency to Claude API). Users will actually notice the app feels faster, which is a positive UX change.

6. **"Ask IronZ" is transparently upgraded.** Freeform requests still work identically from the user's perspective. The improvement (philosophy-constrained context) makes answers better without any visible change to the interaction.

### What Users Will Notice (Positive Changes Only)

- Plans generate faster (no API round-trip for standard plans)
- "Why this plan?" section explains the science behind their plan
- Plans feel more personalized (philosophy modules match their exact classification)
- Plans have more variety week-to-week (variation engine from Section 7)
- Weekly check-ins feed back into future plan quality

### What Users Will NOT Notice

- That the engine changed from AI-first to rules-first
- That their old plan was generated differently than their new one
- Any data loss or disruption
- Any change to existing UI flows

---

**END OF ROADMAP**
