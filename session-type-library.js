// session-type-library.js
// Local source of truth for the 8 run session templates.
// Mirrors the SESSION_TYPE_LIBRARY Supabase module from
// PHILOSOPHY_UPDATE_2026-04-09_run_session_types.md.
//
// The runtime app reads from THIS file so the generator stays purely
// deterministic and offline-capable. The Supabase module exists for
// documentation and remote tweaking only.

(function () {
  "use strict";

  const SESSION_TYPES = [
    {
      id: "easy_recovery",
      label: "Easy / Recovery",
      daniels_intensity: "E",
      primary_zone: "z1",
      purpose: "Active recovery and aerobic maintenance",
      default_duration_min: [30, 45],
      experience_scaling: {
        beginner: [25, 35],
        intermediate: [30, 45],
        advanced: [35, 50],
      },
      structure: [
        { phase: "main", intensity: "z1", duration_pct: 1.0, pace_source: "vdot.e_pace" },
      ],
      is_hard: false,
      frequency_cap_per_week: null,
      why_text: "Recovery and aerobic maintenance. Going harder today doesn't make you faster — it makes tomorrow worse.",
    },
    {
      id: "endurance",
      label: "Endurance Run",
      daniels_intensity: "E + low M",
      primary_zone: "z1",
      purpose: "Aerobic base building, mitochondrial density",
      default_duration_min: [45, 75],
      max_duration_min: 150,
      experience_scaling: {
        beginner: [40, 55],
        intermediate: [50, 70],
        advanced: [60, 90],
      },
      structure: [
        { phase: "main", intensity: "z1", duration_pct: 0.85, pace_source: "vdot.e_pace" },
        {
          phase: "optional_finish",
          intensity: "z2",
          duration_pct: 0.15,
          pace_source: "vdot.m_pace",
          applies_when: { experience: ["intermediate", "advanced"] },
        },
      ],
      is_hard: false,
      frequency_cap_per_week: 4,
      why_text: "Building the aerobic engine that everything else runs on.",
    },
    {
      id: "long_run",
      label: "Long Run",
      daniels_intensity: "E with optional M finish",
      primary_zone: "z1",
      purpose: "Capillarization, fueling practice, mental durability",
      default_duration_min: [75, 150],
      experience_scaling: {
        beginner: [60, 90],
        intermediate: [90, 120],
        advanced: [120, 150],
      },
      structure: [
        { phase: "main", intensity: "z1", duration_pct: 0.80, pace_source: "vdot.e_pace" },
        {
          phase: "optional_mp_finish",
          intensity: "z2",
          duration_pct: 0.20,
          pace_source: "vdot.m_pace",
          applies_when: { experience: ["intermediate", "advanced"] },
        },
      ],
      fueling_reminder_threshold_min: 75,
      is_hard: true,
      frequency_cap_per_week: 1,
      why_text: "Capillaries, fueling practice, mental durability. The single most important workout of the week.",
    },
    {
      id: "tempo_threshold",
      label: "Tempo / Threshold",
      daniels_intensity: "T",
      primary_zone: "z3",
      purpose: "Lactate clearance, sustainable pace ceiling",
      default_duration_min: [35, 65],
      experience_scaling: {
        beginner:     { reps: 2, rep_duration_min: 8, rest_sec: 90, total_t_min: 16 },
        intermediate: { reps: 4, rep_duration_min: 8, rest_sec: 90, total_t_min: 32 },
        advanced:     { reps: 5, rep_duration_min: 8, rest_sec: 60, total_t_min: 40 },
      },
      structure: [
        { phase: "warmup", intensity: "z1", duration_min: 15, pace_source: "vdot.e_pace" },
        { phase: "main_cruise_intervals", intensity: "z3", structure: "reps_at_t_pace", pace_source: "vdot.t_pace" },
        { phase: "cooldown", intensity: "z1", duration_min: 10, pace_source: "vdot.e_pace" },
      ],
      is_hard: true,
      frequency_cap_per_week: 1,
      why_text: "Raising the pace you can sustain. The goal is comfortably hard, not race effort.",
    },
    {
      id: "track_workout",
      label: "Track Workout",
      daniels_intensity: "I",
      primary_zone: "z4",
      purpose: "VO2max development, race-specific speed",
      default_duration_min: [50, 75],
      rotation_templates: [
        {
          rotation_index: 0,
          name: "800m repeats",
          main_set: {
            rep_distance_m: 800,
            rep_count: { beginner: 6, intermediate: 8, advanced: 10 },
            rest_type: "jog",
            rest_distance_m: 400,
            pace_source: "vdot.i_pace",
          },
        },
        {
          rotation_index: 1,
          name: "1K repeats",
          main_set: {
            rep_distance_m: 1000,
            rep_count: { beginner: 5, intermediate: 6, advanced: 7 },
            rest_type: "jog",
            rest_duration_sec: 120,
            pace_source: "vdot.i_pace",
          },
        },
        {
          rotation_index: 2,
          name: "1200m repeats",
          main_set: {
            rep_distance_m: 1200,
            rep_count: { beginner: 4, intermediate: 5, advanced: 6 },
            rest_type: "jog",
            rest_duration_sec: 180,
            pace_source: "vdot.i_pace",
          },
        },
        {
          rotation_index: 3,
          name: "Ladder",
          main_set: {
            ladder_distances_m: [400, 800, 1200, 800, 400],
            rest_type: "equal_time_jog",
            pace_source: "vdot.i_pace",
          },
        },
      ],
      rotation_logic: "rotation_index = (weeks_since_plan_start) mod 4",
      structure: [
        { phase: "warmup", intensity: "z1", duration_min: 15, includes: "4x20s strides" },
        { phase: "main_set", intensity: "z4", structure: "from rotation_templates" },
        { phase: "cooldown", intensity: "z1", duration_min: 10 },
      ],
      is_hard: true,
      frequency_cap_per_week: 1,
      why_text: "VO2max work. This is the session that makes race pace feel manageable.",
    },
    {
      id: "speed_work",
      label: "Speed Work",
      daniels_intensity: "R",
      primary_zone: "z5",
      purpose: "Neuromuscular speed, running economy",
      default_duration_min: [35, 55],
      sub_templates: [
        {
          id: "r_pace_repeats",
          name: "200m R-pace repeats",
          default_for: ["intermediate", "advanced"],
          main_set: {
            rep_distance_m: 200,
            rep_count: { beginner: 6, intermediate: 8, advanced: 10 },
            rest_type: "walk",
            rest_distance_m: 200,
            pace_source: "vdot.r_pace",
          },
        },
        {
          id: "strides_only",
          name: "Strides",
          default_for: ["beginner"],
          main_set: {
            rep_distance_m: 100,
            rep_count: 8,
            rest_type: "full_recovery",
            pace_target: "near-sprint, controlled form",
          },
        },
      ],
      structure: [
        { phase: "warmup", intensity: "z1", duration_min: 15 },
        { phase: "main_set", intensity: "z5", structure: "from sub_templates" },
        { phase: "cooldown", intensity: "z1", duration_min: 10 },
      ],
      is_hard: true,
      frequency_cap_per_week: 1,
      why_text: "Neuromuscular speed. Short, sharp, full recovery. Not aerobic — pure mechanics.",
    },
    {
      id: "hills",
      label: "Hills",
      daniels_intensity: "Hard effort, Z4 equivalent",
      primary_zone: "z4",
      purpose: "Power, strength, injury resilience",
      default_duration_min: [40, 60],
      main_set: {
        rep_duration_sec: [60, 90],
        rep_count: { beginner: 6, intermediate: 8, advanced: 12 },
        effort: "hard up, easy jog down",
        ideal_grade_pct: [4, 8],
        pace_target: "effort-based, terrain-dependent",
      },
      structure: [
        { phase: "warmup", intensity: "z1", duration_min: 15, instruction: "easy jog to a hill" },
        { phase: "main_set", intensity: "z4_effort", structure: "from main_set" },
        { phase: "cooldown", intensity: "z1", duration_min: 10 },
      ],
      is_hard: true,
      frequency_cap_per_week: 1,
      substitutes_for: "track_workout (during hill phase)",
      why_text: "Power, strength, and injury resilience in one workout. Lower impact than flat track.",
    },
    {
      id: "fun_social",
      label: "Fun / Social",
      daniels_intensity: "Z1 default, user override",
      primary_zone: "z1",
      purpose: "Enjoyment, autonomy, mental break from structure",
      default_duration_min: [30, 60],
      structure: [
        { phase: "main", intensity: "z1_default", duration_pct: 1.0, pace_target: "by feel, no targets" },
      ],
      is_hard: false,
      frequency_cap_per_week: null,
      rpe_user_override: true,
      why_text: "You earned this. No targets. The point is showing up because you want to.",
      instruction_text: "Run by feel for {duration} minutes. No targets. Trail, treadmill, with a friend, with the dog. The point is showing up because you want to.",
    },
  ];

  const HARD_CONSTRAINTS = [
    "Maximum 3 hard sessions per 7-day window. Hard = Tempo, Track, Speed Work, Hills, Long Run.",
    "No back-to-back hard sessions. At least one Easy/Recovery or Endurance day must separate any two hard sessions.",
    "No hard session within 24 hours of a Long Run.",
    "Track Workout AND Speed Work in the same week is allowed only for advanced runners.",
    "Hills substitute for Track during a hill phase. Both in the same week is allowed only for advanced runners.",
    "Long Run frequency is capped at 1 per week, full stop.",
  ];

  function getSessionTypeById(id) {
    return SESSION_TYPES.find(t => t.id === id) || null;
  }

  function getHardSessionTypes() {
    return SESSION_TYPES.filter(t => t.is_hard === true);
  }

  function listSessionTypes() {
    return SESSION_TYPES.map(t => ({ id: t.id, label: t.label, is_hard: t.is_hard }));
  }

  const api = {
    SESSION_TYPES,
    HARD_CONSTRAINTS,
    getSessionTypeById,
    getHardSessionTypes,
    listSessionTypes,
  };

  if (typeof window !== "undefined") window.SessionTypeLibrary = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
