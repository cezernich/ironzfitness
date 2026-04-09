// js/variant-libraries/run.js
// Pure data — VARIANT_LIBRARY_RUN. No logic. No API calls.
// Mirrors the spec exactly. Edits to variant structures require updating
// the evidence_sources field per spec instructions.

(function () {
  "use strict";

  const VARIANT_LIBRARY_RUN = {
    id: "VARIANT_LIBRARY_RUN",
    rotation_cadence_by_type: {
      track_workout: 2,
      tempo_threshold: 2,
      speed_work: 2,
      hills: 2,
      long_run: 3,
      endurance: null,
      easy_recovery: null,
      fun_social: null,
    },
    variants: {
      track_workout: [
        {
          id: "track_yasso_800s",
          name: "Yasso 800s",
          description: "Classic 5K/marathon-goal workout. 8-10 x 800m at 5K pace with 400m jog recovery.",
          main_set: { rep_distance_m: 800, rep_count: { beginner: 6, intermediate: 8, advanced: 10 }, pace_source: "vdot.5k_pace", rest_type: "jog_distance", rest_m: 400 },
          develops: "VO2max + lactate tolerance + race pace confidence",
          best_for: "5K/10K/marathon training (Bart Yasso's original)",
        },
        {
          id: "track_1k_i_pace",
          name: "1K repeats at I-pace",
          description: "Classic VO2max workout. 5-7 x 1000m at I-pace w/ 2 min jog.",
          main_set: { rep_distance_m: 1000, rep_count: { beginner: 5, intermediate: 6, advanced: 7 }, pace_source: "vdot.i_pace", rest_type: "jog_time", rest_sec: 120 },
          develops: "VO2max (sweet spot repeat distance)",
          best_for: "5K/10K focus",
        },
        {
          id: "track_1200_i_pace",
          name: "1200m repeats at I-pace",
          description: "Longer VO2max repeats. 4-6 x 1200m at I-pace w/ 3 min jog.",
          main_set: { rep_distance_m: 1200, rep_count: { beginner: 4, intermediate: 5, advanced: 6 }, pace_source: "vdot.i_pace", rest_type: "jog_time", rest_sec: 180 },
          develops: "VO2max + lactate buffering",
          best_for: "5K-HM range, peak phase",
        },
        {
          id: "track_ladder_400_1200",
          name: "Pyramid ladder",
          description: "Pyramid: 400/800/1200/800/400 at I-pace with equal-time jog recovery.",
          main_set: { type: "ladder", rungs_m: [400, 800, 1200, 800, 400], pace_source: "vdot.i_pace", rest_type: "equal_time_jog" },
          develops: "VO2max + pacing discipline + mental variety",
          best_for: "Breaks up monotony; excellent mid-block workout",
        },
        {
          id: "track_mile_repeats",
          name: "Mile repeats",
          description: "Advanced VO2max. 3-5 x 1 mile at I-pace/5K pace w/ 3-4 min jog.",
          main_set: { rep_distance_m: 1609, rep_count: { beginner: 3, intermediate: 4, advanced: 5 }, pace_source: "vdot.i_pace", rest_type: "jog_time", rest_sec: 210 },
          develops: "Sustained VO2max + mental toughness",
          best_for: "Advanced runners, HM/marathon peak phase",
          experience_minimum: "intermediate",
        },
        {
          id: "track_200_400_alternation",
          name: "200/400 alternation",
          description: "12-16 x alternating 200m @ R-pace / 400m @ I-pace with 200m jog between.",
          main_set: { type: "alternation", pattern: [{ distance_m: 200, pace_source: "vdot.r_pace" }, { distance_m: 400, pace_source: "vdot.i_pace" }], cycles: { beginner: 6, intermediate: 8, advanced: 10 }, rest_type: "jog_distance", rest_m: 200 },
          develops: "Speed + VO2max simultaneously; recruits fast-twitch and slow-twitch",
          best_for: "5K specialists, peak phase",
        },
      ],
      tempo_threshold: [
        {
          id: "tempo_cruise_8min",
          name: "8-minute cruise intervals",
          description: "Daniels' classic cruise intervals. 3-5 x 8 min at T-pace w/ 90s jog.",
          main_set: { rep_duration_sec: 480, rep_count: { beginner: 3, intermediate: 4, advanced: 5 }, pace_source: "vdot.t_pace", rest_type: "jog_time", rest_sec: 90 },
          develops: "Lactate threshold, sustainable pace ceiling",
        },
        {
          id: "tempo_straight_20",
          name: "20-min straight tempo",
          description: "Classic 20-minute continuous tempo at T-pace. Simple, honest, hard.",
          main_set: { type: "continuous", duration_sec: 1200, pace_source: "vdot.t_pace" },
          develops: "Lactate threshold + mental execution",
          experience_minimum: "intermediate",
        },
        {
          id: "tempo_over_under",
          name: "Over-under intervals",
          description: "4-6 x 6 min alternating 3 min at T-pace / 3 min at M-pace. No rest between blocks; 2 min easy between full reps.",
          main_set: { type: "alternation_block", blocks: [{ duration_sec: 180, pace_source: "vdot.t_pace" }, { duration_sec: 180, pace_source: "vdot.m_pace" }], reps: { beginner: 3, intermediate: 4, advanced: 6 }, rest_type: "jog_time", rest_sec: 120 },
          develops: "Lactate shuttling, pace adaptability",
          experience_minimum: "intermediate",
        },
        {
          id: "tempo_2x15_with_float",
          name: "2 x 15 min tempo with float",
          description: "2 x 15 min at T-pace with 3 min float recovery in between.",
          main_set: { rep_duration_sec: 900, rep_count: 2, pace_source: "vdot.t_pace", rest_type: "jog_time", rest_sec: 180 },
          develops: "Extended threshold time under tension",
          experience_minimum: "intermediate",
        },
        {
          id: "tempo_progression_run",
          name: "Progression tempo",
          description: "30 min progressing from M-pace to T-pace. Negative-split execution.",
          main_set: { type: "progression", duration_sec: 1800, start_pace: "vdot.m_pace", end_pace: "vdot.t_pace" },
          develops: "Pacing discipline, fatigue resistance",
        },
      ],
      speed_work: [
        {
          id: "speed_200_r_pace",
          name: "200m R-pace repeats",
          description: "8-12 x 200m at R-pace with 200m walk recovery.",
          main_set: { rep_distance_m: 200, rep_count: { beginner: 6, intermediate: 8, advanced: 12 }, pace_source: "vdot.r_pace", rest_type: "walk_distance", rest_m: 200 },
        },
        {
          id: "speed_400_r_pace",
          name: "400m R-pace repeats",
          description: "6-8 x 400m at R-pace with 400m walk recovery.",
          main_set: { rep_distance_m: 400, rep_count: { beginner: 4, intermediate: 6, advanced: 8 }, pace_source: "vdot.r_pace", rest_type: "walk_distance", rest_m: 400 },
        },
        {
          id: "speed_strides",
          name: "100m strides",
          description: "8 x 100m strides near-sprint with full walk-back recovery. Pure neuromuscular.",
          main_set: { rep_distance_m: 100, rep_count: 8, rest_type: "full_recovery", pace_target: "near-sprint, controlled form" },
        },
        {
          id: "speed_hill_sprints",
          name: "Short hill sprints",
          description: "10 x 10-second all-out hill sprints with full recovery walk-down. Minimal impact, max neuromuscular.",
          main_set: { rep_duration_sec: 10, rep_count: 10, rest_type: "walk_down_recovery", effort: "maximal", terrain: "hill_4_8_pct" },
        },
        {
          id: "speed_flying_30s",
          name: "Flying 30s",
          description: "6 x 30m flying sprints (rolling start, no standing start). Full recovery.",
          main_set: { rep_distance_m: 30, rep_count: 6, rest_type: "full_recovery", pace_target: "maximum velocity, rolling start" },
          experience_minimum: "intermediate",
        },
      ],
      hills: [
        {
          id: "hills_short_60s",
          name: "60-second hill repeats",
          description: "8-12 x 60 sec hard up / easy down on a 4-8% grade.",
          main_set: { rep_duration_sec: 60, rep_count: { beginner: 6, intermediate: 8, advanced: 12 }, rest_type: "easy_jog_down", effort: "hard_z4_equivalent" },
        },
        {
          id: "hills_long_90s",
          name: "90-second hill repeats",
          description: "6-10 x 90 sec hard up / easy down.",
          main_set: { rep_duration_sec: 90, rep_count: { beginner: 4, intermediate: 6, advanced: 10 }, rest_type: "easy_jog_down", effort: "hard_z4_equivalent" },
        },
        {
          id: "hills_long_2_3min",
          name: "2-3 min hill grinders",
          description: "4-6 x 2-3 min hill repeats at threshold effort uphill.",
          main_set: { rep_duration_sec: 150, rep_count: { beginner: 3, intermediate: 4, advanced: 6 }, rest_type: "easy_jog_down", effort: "threshold_z3_equivalent" },
          experience_minimum: "intermediate",
        },
        {
          id: "hills_fartlek_rolling",
          name: "Rolling hill fartlek",
          description: "45-60 min run on a rolling course, push hard on every uphill, recover on flats and downhills.",
          main_set: { type: "unstructured_fartlek", duration_sec: { beginner: 2400, intermediate: 3000, advanced: 3600 }, effort_rule: "hard uphills, easy recoveries" },
        },
      ],
      long_run: [
        {
          id: "long_easy",
          name: "Easy long run",
          description: "Single-pace long run at E-pace. Base-building, no bells or whistles.",
          main_set: { type: "continuous", duration_min_range: [60, 150], pace_source: "vdot.e_pace" },
        },
        {
          id: "long_mp_finish",
          name: "MP-finish long run",
          description: "Long run with last 15-25% at marathon pace.",
          main_set: { type: "two_phase", phase_1: { pct_duration: 0.80, pace_source: "vdot.e_pace" }, phase_2: { pct_duration: 0.20, pace_source: "vdot.m_pace" } },
          experience_minimum: "intermediate",
        },
        {
          id: "long_fast_finish",
          name: "Fast-finish long run",
          description: "Long run with last 10-15% at T-pace or faster.",
          main_set: { type: "two_phase", phase_1: { pct_duration: 0.87, pace_source: "vdot.e_pace" }, phase_2: { pct_duration: 0.13, pace_source: "vdot.t_pace" } },
          experience_minimum: "intermediate",
        },
        {
          id: "long_progression",
          name: "Progression long run",
          description: "Long run progressing continuously from E-pace to M-pace over the full duration.",
          main_set: { type: "progression", start_pace: "vdot.e_pace", end_pace: "vdot.m_pace" },
          experience_minimum: "intermediate",
        },
        {
          id: "long_easy_with_strides",
          name: "Easy long + finishing strides",
          description: "Easy long run + 6 x 20s strides at the end. Keeps legs snappy without extra load.",
          main_set: { type: "base_plus_finisher", base: { pace_source: "vdot.e_pace" }, finisher: { description: "6 x 20s strides with full recovery" } },
        },
      ],
      endurance: [
        { id: "endurance_steady", name: "Steady endurance", description: "Continuous Z1-low Z2.", main_set: { type: "continuous", pace_source: "vdot.e_pace" } },
        { id: "endurance_progression", name: "Progression endurance", description: "Start Z1, finish low Z2.", main_set: { type: "progression", start_pace: "vdot.e_pace_slow", end_pace: "vdot.e_pace_fast" } },
        { id: "endurance_with_strides", name: "Endurance + strides", description: "Steady with 4-6 x 20s strides after 20 min.", main_set: { type: "base_plus_strides" } },
      ],
      easy_recovery: [
        { id: "easy_flat", name: "Easy flat", description: "Single Z1 pace, flat route preferred.", main_set: { type: "continuous", pace_source: "vdot.e_pace_slow" } },
        { id: "easy_trail", name: "Easy trail", description: "Z1 on soft surface if available.", main_set: { type: "continuous", pace_source: "vdot.e_pace_slow", terrain_preference: "trail" } },
      ],
      fun_social: [
        { id: "fun_free", name: "Run by feel", description: "No targets, user chooses." },
      ],
    },
  };

  if (typeof window !== "undefined") window.VARIANT_LIBRARY_RUN = VARIANT_LIBRARY_RUN;
  if (typeof module !== "undefined" && module.exports) module.exports = VARIANT_LIBRARY_RUN;
})();
