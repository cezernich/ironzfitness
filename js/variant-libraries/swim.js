// js/variant-libraries/swim.js
// Pure data — VARIANT_LIBRARY_SWIM.

(function () {
  "use strict";

  const VARIANT_LIBRARY_SWIM = {
    id: "VARIANT_LIBRARY_SWIM",
    rotation_cadence_by_type: {
      swim_css_intervals: 2,
      swim_speed: 2,
      swim_endurance: null,
      swim_technique: null,
    },
    variants: {
      swim_css_intervals: [
        { id: "swim_css_8x100", name: "8 x 100 at CSS", description: "8x100m at CSS pace w/ 15s rest.", main_set: { reps: 8, distance_m: 100, pace_source: "css", rest_sec: 15 } },
        { id: "swim_css_6x200", name: "6 x 200 at CSS", description: "6x200m at CSS w/ 20s rest.", main_set: { reps: 6, distance_m: 200, pace_source: "css", rest_sec: 20 } },
        { id: "swim_css_descending_10x100", name: "10 x 100 descending", description: "10x100m, first 5 at CSS+5s, last 5 at CSS. 15s rest.", main_set: { type: "descending", sets: [{ reps: 5, distance_m: 100, pace_source: "css_plus_5", rest_sec: 15 }, { reps: 5, distance_m: 100, pace_source: "css", rest_sec: 15 }] } },
        { id: "swim_css_ladder", name: "CSS ladder", description: "50/100/150/200/150/100/50 all at CSS pace, 15s rest.", main_set: { type: "ladder", rungs_m: [50, 100, 150, 200, 150, 100, 50], pace_source: "css", rest_sec: 15 } },
        { id: "swim_css_broken_400", name: "Broken 400s", description: "4 x 400m at CSS pace, broken 4x100 with 10s rest inside each 400.", main_set: { reps: 4, distance_m: 400, type: "broken", break_at_m: 100, break_rest_sec: 10, pace_source: "css" } },
      ],
      swim_speed: [
        { id: "swim_speed_10x50", name: "10 x 50 sprint", description: "10x50m fast w/ 30s rest.", main_set: { reps: 10, distance_m: 50, pace_source: "css_minus_5", rest_sec: 30 } },
        { id: "swim_speed_16x25", name: "16 x 25 all-out", description: "16x25m sprints w/ 20s rest.", main_set: { reps: 16, distance_m: 25, effort: "maximal", rest_sec: 20 } },
        { id: "swim_speed_8x75", name: "8 x 75 descending", description: "8x75m, descending pace across the set. 20s rest.", main_set: { reps: 8, distance_m: 75, type: "descending", rest_sec: 20 } },
      ],
      swim_endurance: [
        { id: "swim_endurance_continuous", name: "Continuous distance", description: "Continuous aerobic swim at CSS+12 pace.", main_set: { type: "continuous", pace_source: "css_plus_12" } },
        { id: "swim_endurance_pull", name: "Endurance with pull buoy", description: "Half with pull buoy, half without, at CSS+10 pace.", main_set: { type: "continuous_with_tool", pace_source: "css_plus_10" } },
      ],
      swim_technique: [
        { id: "swim_drill_catch", name: "Catch drill set", description: "Fingertip drag + catch-up drill + swim. 6 x 100.", main_set: { reps: 6, distance_m: 100, drills: ["fingertip_drag", "catch_up", "full_stroke"] } },
        { id: "swim_drill_rotation", name: "Body rotation drill set", description: "6 Kick / Side Kick / 6 Kick / Swim. 8 x 75.", main_set: { reps: 8, distance_m: 75, drills: ["6_kick_switch", "side_kick", "swim"] } },
        { id: "swim_drill_breathing", name: "Breathing pattern drill", description: "Bilateral breathing 3/5/7 stroke patterns. 6 x 100.", main_set: { reps: 6, distance_m: 100, drills: ["3_stroke_breath", "5_stroke_breath", "7_stroke_breath"] } },
      ],
    },
  };

  if (typeof window !== "undefined") window.VARIANT_LIBRARY_SWIM = VARIANT_LIBRARY_SWIM;
  if (typeof module !== "undefined" && module.exports) module.exports = VARIANT_LIBRARY_SWIM;
})();
