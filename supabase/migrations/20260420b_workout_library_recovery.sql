-- 20260420b_workout_library_recovery.sql
--
-- Adds dedicated recovery-run / recovery-bike / recovery-swim workouts
-- to the library. The plan generator had been pulling recovery-slot
-- sessions from the "easy" pool, which included "Easy Run with Strides"
-- (Z2 main set + Z5 strides) — the opposite of what a recovery session
-- should be. Per PLAN_GENERATOR_MASTER_SPEC §4c / §12 recovery sessions
-- are strictly Z1, 15–30 min, no strides, no pickups.
--
-- Idempotent: ON CONFLICT (name, sport) DO NOTHING against the existing
-- idx_workout_library_unique_name_sport unique index. If you re-seed via
-- the script, these rows stay unique by (name, sport).

begin;

insert into workout_library
  (name, description, sport, session_type, energy_system, phases, levels,
   race_distances, race_goals, warmup, main_set, cooldown, volume_range,
   total_duration_range, status)
values
  (
    'Pure Recovery Jog',
    'Z1 only. The sole purpose is blood flow to flush the legs after a hard session. No strides, no pickups, no acceleration. If you feel the urge to speed up, slow down.',
    'run', 'recovery', 'aerobic',
    array['base','build','peak','taper'],
    array['beginner','intermediate','advanced'],
    null, null,
    '{"description":"2 min walk → very easy jog","duration_min":2}'::jsonb,
    '{"type":"continuous","description":"Very easy jog at Z1 only. Slower than your easy pace. Comfortable nasal breathing throughout.","effort":{"duration_min":[15,25],"zone":"Z1"}}'::jsonb,
    '{"description":"3 min walk + foam roll quads, calves, glutes","duration_min":3}'::jsonb,
    '{"duration_min":[15,25]}'::jsonb,
    array[20,30]::int[],
    'published'
  ),
  (
    'Shakeout Recovery Run',
    'Short, gentle shakeout the day after a hard session. Shorter than Pure Recovery — for days you''re still stiff or if the long run was especially demanding.',
    'run', 'recovery', 'aerobic',
    array['base','build','peak','taper'],
    array['beginner','intermediate','advanced'],
    null, null,
    '{"description":"5 min walk — let the body wake up before running","duration_min":5}'::jsonb,
    '{"type":"continuous","description":"Easy jog at Z1. 10–20 min total. Walk breaks fine if you need them.","effort":{"duration_min":[10,20],"zone":"Z1"}}'::jsonb,
    '{"description":"2 min walk + calf/hip stretches","duration_min":2}'::jsonb,
    '{"duration_min":[10,20]}'::jsonb,
    array[17,27]::int[],
    'published'
  ),
  (
    'Recovery Walk-Jog',
    'Alternates easy jog and walk. For beginner runners or days when even Z1 jogging feels too much. Movement without stress.',
    'run', 'recovery', 'aerobic',
    array['base','build','peak','taper'],
    array['beginner'],
    null, null,
    '{"description":"5 min walk","duration_min":5}'::jsonb,
    '{"type":"intervals","description":"Alternate 3 min easy jog + 1 min walk. Z1 throughout.","intervals":{"reps":[4,6],"duration":"3 min","rest":"1 min walk","zone":"Z1"}}'::jsonb,
    '{"description":"5 min walk + gentle stretches","duration_min":5}'::jsonb,
    '{"duration_min":[16,24]}'::jsonb,
    array[26,34]::int[],
    'published'
  ),
  (
    'Recovery Spin',
    'Z1 only. Active recovery on the bike — legs spinning freely, no resistance, no power targets. Blood flow without fatigue.',
    'bike', 'recovery', 'aerobic',
    array['base','build','peak','taper'],
    array['beginner','intermediate','advanced'],
    null, null,
    '{"description":"5 min very easy spin — settle in","duration_min":5}'::jsonb,
    '{"type":"continuous","description":"Easy spin at Z1. 20–35 min. If you feel yourself pushing, back off.","effort":{"duration_min":[20,35],"zone":"Z1"}}'::jsonb,
    '{"description":"5 min easy spin → off the bike, stretch quads and hip flexors","duration_min":5}'::jsonb,
    '{"duration_min":[20,35]}'::jsonb,
    array[30,45]::int[],
    'published'
  ),
  (
    'Recovery Flush Swim',
    'Gentle swim focused on easy stroke mechanics and blood flow. No pace targets, no hard strokes. Flush the legs after a land-based hard session.',
    'swim', 'recovery', 'aerobic',
    array['base','build','peak','taper'],
    array['beginner','intermediate','advanced'],
    null, null,
    '{"description":"200m easy freestyle + 100m kick on board","duration_min":6}'::jsonb,
    '{"type":"continuous","description":"Easy continuous swim at Z1. Smooth, relaxed stroke. Mix freestyle and backstroke if you like.","effort":{"duration_min":[15,25],"zone":"Z1"}}'::jsonb,
    '{"description":"100m easy backstroke + stretching poolside","duration_min":4}'::jsonb,
    '{"duration_min":[15,25]}'::jsonb,
    array[25,35]::int[],
    'published'
  )
on conflict (name, sport) do nothing;

commit;
