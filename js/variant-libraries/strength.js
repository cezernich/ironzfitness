// js/variant-libraries/strength.js
// Pure data — VARIANT_LIBRARY_STRENGTH.
// IMPORTANT: compound lifts are NOT in the rotation library on purpose.
// Compounds are governed by the compound_lift_policy and follow a 4-6 week
// progressive overload cycle. The variant rotation only applies to accessories.

(function () {
  "use strict";

  const VARIANT_LIBRARY_STRENGTH = {
    id: "VARIANT_LIBRARY_STRENGTH",
    compound_lift_policy: {
      rule: "Compound lifts (squat, bench, deadlift, OHP, barbell row) do NOT rotate. They stay the same for 4-6 weeks with progressive overload (+2.5-5 lb/week OR +1 rep/week until the rep range ceiling is hit, then load increase).",
      rationale: "Skill component in these lifts means consistency is required for measurable strength gains. Rotation actively hurts progress on compounds.",
      rotation_cadence_weeks: [4, 6],
      end_of_cycle_behavior: "At end of 4-6 week cycle, swap the compound variant (e.g., back squat -> front squat, bench -> incline bench) to prevent plateau at the movement-pattern level.",
    },
    accessory_rotation_cadence_weeks: [2, 3],
    // Compound progression chains — used by strength-workout-generator at end of cycle.
    compound_chains: {
      squat:    ["back_squat", "front_squat", "high_bar_back_squat", "box_squat"],
      bench:    ["flat_bench", "incline_bench", "close_grip_bench", "paused_bench"],
      deadlift: ["conventional_deadlift", "sumo_deadlift", "deficit_deadlift", "trap_bar_deadlift"],
      ohp:      ["standing_ohp", "seated_ohp", "push_press", "z_press"],
      row:      ["barbell_row", "pendlay_row", "yates_row", "t_bar_row"],
    },
    variants: {
      accessory_quad: [
        { id: "acc_walking_lunge", name: "Walking lunges", sets_reps: "3 x 12 per leg", primary_muscle: "quads", equipment: "dumbbells" },
        { id: "acc_bulgarian_split_squat", name: "Bulgarian split squats", sets_reps: "3 x 8-10 per leg", primary_muscle: "quads", equipment: "dumbbells + bench" },
        { id: "acc_step_up", name: "Weighted step-ups", sets_reps: "3 x 10 per leg", primary_muscle: "quads", equipment: "dumbbells + box" },
        { id: "acc_goblet_squat", name: "Goblet squats", sets_reps: "3 x 12-15", primary_muscle: "quads", equipment: "dumbbell or kettlebell" },
        { id: "acc_leg_extension", name: "Leg extensions", sets_reps: "3 x 12-15", primary_muscle: "quads", equipment: "machine" },
      ],
      accessory_hamstring_glute: [
        { id: "acc_rdl", name: "Romanian deadlifts", sets_reps: "3 x 10", primary_muscle: "hamstrings + glutes", equipment: "barbell or dumbbells" },
        { id: "acc_hip_thrust", name: "Hip thrusts", sets_reps: "3 x 10-12", primary_muscle: "glutes", equipment: "barbell + bench" },
        { id: "acc_glute_bridge", name: "Single-leg glute bridge", sets_reps: "3 x 12 per leg", primary_muscle: "glutes", equipment: "bodyweight or dumbbell" },
        { id: "acc_nordic_curl", name: "Nordic hamstring curl", sets_reps: "3 x 6-8", primary_muscle: "hamstrings", equipment: "partner or band" },
        { id: "acc_kb_swing", name: "Kettlebell swings", sets_reps: "3 x 15-20", primary_muscle: "posterior chain + power", equipment: "kettlebell" },
      ],
      accessory_push: [
        { id: "acc_db_bench", name: "DB bench press", sets_reps: "3 x 10", primary_muscle: "chest", equipment: "dumbbells + bench" },
        { id: "acc_incline_db_press", name: "Incline DB press", sets_reps: "3 x 10", primary_muscle: "upper chest", equipment: "dumbbells + incline bench" },
        { id: "acc_pushup_variations", name: "Push-up variations", sets_reps: "3 x AMRAP", primary_muscle: "chest + core", equipment: "bodyweight" },
        { id: "acc_lateral_raise", name: "Lateral raises", sets_reps: "3 x 12-15", primary_muscle: "delts", equipment: "dumbbells" },
        { id: "acc_tricep_dip", name: "Tricep dips", sets_reps: "3 x 10-12", primary_muscle: "triceps", equipment: "bench or parallel bars" },
      ],
      accessory_pull: [
        { id: "acc_chinup", name: "Chin-ups", sets_reps: "3 x AMRAP", primary_muscle: "lats + biceps", equipment: "pull-up bar" },
        { id: "acc_db_row", name: "Single-arm DB row", sets_reps: "3 x 10 per side", primary_muscle: "lats + mid-back", equipment: "dumbbell + bench" },
        { id: "acc_face_pull", name: "Face pulls", sets_reps: "3 x 15", primary_muscle: "rear delts + upper back", equipment: "cable or band" },
        { id: "acc_hammer_curl", name: "Hammer curls", sets_reps: "3 x 12", primary_muscle: "biceps + brachialis", equipment: "dumbbells" },
      ],
      accessory_core: [
        { id: "acc_plank", name: "Plank holds", sets_reps: "3 x 45-60s", primary_muscle: "anterior core", equipment: "bodyweight" },
        { id: "acc_dead_bug", name: "Dead bugs", sets_reps: "3 x 10 per side", primary_muscle: "anti-extension core", equipment: "bodyweight" },
        { id: "acc_pallof_press", name: "Pallof press", sets_reps: "3 x 12 per side", primary_muscle: "anti-rotation core", equipment: "cable or band" },
        { id: "acc_farmer_carry", name: "Farmer carries", sets_reps: "3 x 40m", primary_muscle: "grip + core stability", equipment: "dumbbells or kettlebells" },
        { id: "acc_hanging_knee_raise", name: "Hanging knee raises", sets_reps: "3 x 10-15", primary_muscle: "lower abs + hip flexors", equipment: "pull-up bar" },
      ],
    },
  };

  if (typeof window !== "undefined") window.VARIANT_LIBRARY_STRENGTH = VARIANT_LIBRARY_STRENGTH;
  if (typeof module !== "undefined" && module.exports) module.exports = VARIANT_LIBRARY_STRENGTH;
})();
