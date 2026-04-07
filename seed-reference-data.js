// seed-reference-data.js — One-time seeder for philosophy_modules and exercise_library
// Run from the browser console (or call seedReferenceData()) after logging in as admin.
// Maps the existing JS constants to the structured Supabase schema.
// ─────────────────────────────────────────────────────────────────────────────

async function seedReferenceData() {
  const client = window.supabaseClient;
  if (!client) { console.error('Seed: No Supabase client'); return; }

  const { data: { session } } = await client.auth.getSession();
  if (!session) { console.error('Seed: Not logged in'); return; }

  console.log('Seed: Starting reference data seed...');
  let errors = 0;

  // ── Philosophy Modules ──────────────────────────────────────────────────
  // Each module maps to a row with structured columns.

  const modules = [];

  // Race configs → one module per race type
  if (typeof RACE_CONFIGS !== 'undefined') {
    for (const [key, cfg] of Object.entries(RACE_CONFIGS)) {
      modules.push({
        id: `RACE_${key.toUpperCase()}`,
        category: 'race_config',
        title: cfg.label,
        version: '1.0',
        applies_when: { race_type: key },
        plan_rules: [`totalWeeks: ${cfg.totalWeeks}`, ...cfg.phases.map(p => `${p.name}: ${p.weeks} weeks`)],
        hard_constraints: [],
        rationale: `Periodization structure for ${cfg.label}`,
      });
    }
  }

  // Training block info → one module per plan type
  if (typeof TRAINING_BLOCK_INFO !== 'undefined') {
    for (const [planType, info] of Object.entries(TRAINING_BLOCK_INFO)) {
      modules.push({
        id: `BLOCK_INFO_${planType.toUpperCase()}`,
        category: 'training_blocks',
        title: info.title,
        version: '1.0',
        applies_when: { plan_type: planType },
        principles: info.blocks.map(b => `${b.name} (${b.weeks}): ${b.focus}`),
        coaching_tone: info.blocks.map(b => `${b.name}: Feel — ${b.feel}`).join('; '),
        rationale: info.blocks.map(b => `${b.name}: ${b.why}`).join('; '),
      });
    }
  }

  // Run duration tables → one module per race distance
  if (typeof RUN_DURATION_TABLES !== 'undefined') {
    for (const [raceType, levels] of Object.entries(RUN_DURATION_TABLES)) {
      modules.push({
        id: `RUN_DURATION_${raceType.toUpperCase()}`,
        category: 'run_duration',
        title: `Run durations — ${raceType}`,
        version: '1.0',
        applies_when: { race_type: raceType, sport: 'running' },
        plan_rules: Object.entries(levels).flatMap(([level, loads]) =>
          Object.entries(loads).map(([load, range]) => `${level}.${load}: ${range[0]}-${range[1]} min`)
        ),
        rationale: 'Progressive duration ranges from base through peak weeks',
      });
    }
  }

  // Sport day recommendations
  modules.push({
    id: 'SPORT_DAY_RECS',
    category: 'training_frequency',
    title: 'Sport-specific training day recommendations',
    version: '1.0',
    applies_when: { any_sport: true },
    plan_rules: [
      'triathlon: beginner=4, intermediate=5, advanced=6',
      'cycling: beginner=3, intermediate=4, advanced=5',
      'swimming: beginner=3, intermediate=4, advanced=5',
      'hyrox: beginner=4, intermediate=5, advanced=6',
    ],
    rationale: 'Balances training stimulus with recovery based on sport demands and athlete readiness',
  });

  // Run days base recommendation
  modules.push({
    id: 'RUN_DAYS_BASE',
    category: 'training_frequency',
    title: 'Running days base recommendation',
    version: '1.0',
    applies_when: { sport: 'running' },
    plan_rules: ['beginner=3, intermediate=4, advanced=5'],
    training_adjustments: [
      'compete goal: +1 day (max 6)',
      'finish goal: -1 day (min 3)',
      'returning from injury: -1 day (min 3)',
    ],
    rationale: 'Base running frequency modified by goal and injury status',
  });

  // Survey DOW map
  modules.push({
    id: 'SURVEY_DOW_MAP',
    category: 'scheduling',
    title: 'Default training day-of-week selections',
    version: '1.0',
    applies_when: { context: 'survey_day_picker' },
    plan_rules: [
      '3 days: Mon, Wed, Fri',
      '4 days: Mon, Tue, Thu, Fri',
      '5 days: Mon–Fri',
      '6 days: Mon–Sat',
      '7 days: Sun–Sat',
    ],
    rationale: 'Spreads training days evenly with built-in rest gaps',
  });

  // Insert all philosophy modules
  for (const mod of modules) {
    const row = {
      id: mod.id,
      category: mod.category,
      title: mod.title,
      version: mod.version || '1.0',
      applies_when: mod.applies_when || {},
      principles: mod.principles || [],
      plan_rules: mod.plan_rules || [],
      hard_constraints: mod.hard_constraints || [],
      nutrition_rules: mod.nutrition_rules || [],
      training_adjustments: mod.training_adjustments || [],
      coaching_tone: mod.coaching_tone || null,
      evidence_sources: mod.evidence_sources || [],
      rationale: mod.rationale || null,
      priority: mod.priority || 'medium',
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { error } = await client
      .from('philosophy_modules')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      console.error(`Seed: philosophy_modules.${mod.id} error:`, error.message);
      errors++;
    } else {
      console.log(`Seed: philosophy_modules.${mod.id} OK`);
    }
  }

  // ── Exercise Library ────────────────────────────────────────────────────
  // Flatten the nested EXERCISE_LIBRARY into individual exercise rows.

  const exercises = [];

  function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  if (typeof EXERCISE_LIBRARY !== 'undefined') {
    for (const [workoutType, typeData] of Object.entries(EXERCISE_LIBRARY)) {
      if (workoutType === 'weightlifting') {
        // Nested: push/pull/legs → level → exercises[]
        for (const [focus, levels] of Object.entries(typeData)) {
          for (const [level, exList] of Object.entries(levels)) {
            for (const ex of exList) {
              const id = slugify(`${ex.name}_${level}`);
              if (!exercises.find(e => e.id === id)) {
                exercises.push({
                  id,
                  name: ex.name,
                  movement_pattern: focus,
                  muscle_groups: [focus],
                  equipment_required: _guessEquipment(ex.weight || ''),
                  difficulty: level,
                  tier: level === 'beginner' ? 3 : (level === 'intermediate' ? 2 : 1),
                  sport_relevance: ['weightlifting', 'general'],
                  default_rep_range: `${ex.sets}x${ex.reps}`,
                  is_active: true,
                });
              }
            }
          }
        }
      } else if (workoutType === 'hiit') {
        // level → day objects with exercises[]
        for (const [level, days] of Object.entries(typeData)) {
          for (const day of days) {
            if (day.exercises) {
              for (const ex of day.exercises) {
                const id = slugify(`${ex.name}_hiit_${level}`);
                if (!exercises.find(e => e.id === id)) {
                  exercises.push({
                    id,
                    name: ex.name,
                    movement_pattern: 'hiit',
                    muscle_groups: ['full_body'],
                    equipment_required: _guessEquipment(ex.weight || ''),
                    difficulty: level,
                    tier: 2,
                    sport_relevance: ['hiit', 'general'],
                    default_rep_range: String(ex.reps || ''),
                    is_active: true,
                  });
                }
              }
            }
          }
        }
      }
      // Running/cycling/triathlon/yoga/general are session templates, not individual exercises
      // They stay in philosophy_modules as plan_rules rather than exercise_library rows
    }
  }

  // Also seed from EXERCISE_MUSCLES if available (enriches muscle_groups)
  if (typeof EXERCISE_MUSCLES !== 'undefined') {
    for (const ex of exercises) {
      const muscles = EXERCISE_MUSCLES[ex.name];
      if (muscles) ex.muscle_groups = muscles;
    }
  }

  // Also seed from EXERCISE_SUBSTITUTIONS if available
  if (typeof EXERCISE_SUBSTITUTIONS !== 'undefined') {
    for (const ex of exercises) {
      const subs = EXERCISE_SUBSTITUTIONS[ex.name];
      if (subs) ex.substitutions = subs;
    }
  }

  // Batch insert exercises in chunks of 50
  for (let i = 0; i < exercises.length; i += 50) {
    const chunk = exercises.slice(i, i + 50).map(ex => ({
      id: ex.id,
      name: ex.name,
      movement_pattern: ex.movement_pattern,
      muscle_groups: ex.muscle_groups,
      equipment_required: ex.equipment_required || [],
      difficulty: ex.difficulty,
      tier: ex.tier,
      sport_relevance: ex.sport_relevance || [],
      contraindications: ex.contraindications || [],
      substitutions: ex.substitutions || [],
      default_rep_range: ex.default_rep_range || null,
      default_rest_seconds: ex.default_rest_seconds || null,
      instructions: ex.instructions || null,
      is_active: true,
    }));

    const { error } = await client
      .from('exercise_library')
      .upsert(chunk, { onConflict: 'id' });

    if (error) {
      console.error(`Seed: exercise_library batch ${i} error:`, error.message);
      errors++;
    } else {
      console.log(`Seed: exercise_library batch ${i}-${i + chunk.length} OK (${chunk.length} rows)`);
    }
  }

  console.log(`Seed: ${exercises.length} total exercises processed`);

  if (errors === 0) {
    console.log('Seed: All reference data seeded successfully!');
  } else {
    console.warn(`Seed: Completed with ${errors} errors`);
  }
}

// Helper: guess equipment from weight string
function _guessEquipment(weightStr) {
  const w = weightStr.toLowerCase();
  if (w.includes('barbell') || w.includes('bar +')) return ['barbell'];
  if (w.includes('dumbbell') || w.includes('2×') || w.includes('2x')) return ['dumbbells'];
  if (w.includes('cable')) return ['cable_machine'];
  if (w.includes('kettlebell') || w.includes('kb')) return ['kettlebell'];
  if (w.includes('band')) return ['resistance_band'];
  if (w.includes('machine')) return ['machine'];
  if (w.includes('bodyweight') || w === '') return [];
  return [];
}
