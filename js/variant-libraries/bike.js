// js/variant-libraries/bike.js
// Pure data — VARIANT_LIBRARY_BIKE.

(function () {
  "use strict";

  const VARIANT_LIBRARY_BIKE = {
    id: "VARIANT_LIBRARY_BIKE",
    rotation_cadence_by_type: {
      bike_intervals_ftp: 2,
      bike_intervals_vo2: 2,
      bike_intervals_sweet_spot: 2,
      bike_intervals_sprint: 2,
      bike_endurance: null,
    },
    variants: {
      bike_intervals_ftp: [
        { id: "bike_ftp_2x20", name: "2 x 20 min at FTP", description: "Classic FTP builder. 2x20min at 95-100% FTP w/ 5min easy between.", main_set: { reps: 2, duration_sec: 1200, power_target_pct_ftp: [0.95, 1.00], rest_sec: 300 } },
        { id: "bike_ftp_3x12", name: "3 x 12 min at FTP", description: "Shorter reps, higher intensity. 3x12min at 100-105% FTP w/ 4min easy.", main_set: { reps: 3, duration_sec: 720, power_target_pct_ftp: [1.00, 1.05], rest_sec: 240 } },
        { id: "bike_ftp_4x8", name: "4 x 8 min at FTP", description: "Sharper stimulus. 4x8min at 105-110% FTP w/ 4min easy.", main_set: { reps: 4, duration_sec: 480, power_target_pct_ftp: [1.05, 1.10], rest_sec: 240 } },
        { id: "bike_ftp_5x6", name: "5 x 6 min at FTP", description: "5x6min at 105-110% FTP w/ 3min easy.", main_set: { reps: 5, duration_sec: 360, power_target_pct_ftp: [1.05, 1.10], rest_sec: 180 } },
        { id: "bike_ftp_over_under", name: "FTP over-unders", description: "4x8min alternating 1min at 105% / 1min at 95% FTP.", main_set: { reps: 4, duration_sec: 480, type: "alternation_block", blocks: [{ duration_sec: 60, power_target_pct_ftp: 1.05 }, { duration_sec: 60, power_target_pct_ftp: 0.95 }], rest_sec: 240 } },
      ],
      bike_intervals_vo2: [
        { id: "bike_vo2_5x3", name: "5 x 3 min VO2max", description: "5x3min at 115-120% FTP w/ 3min easy.", main_set: { reps: 5, duration_sec: 180, power_target_pct_ftp: [1.15, 1.20], rest_sec: 180 } },
        { id: "bike_vo2_8x2", name: "8 x 2 min VO2max", description: "8x2min at 120-125% FTP w/ 2min easy.", main_set: { reps: 8, duration_sec: 120, power_target_pct_ftp: [1.20, 1.25], rest_sec: 120 } },
        { id: "bike_vo2_30_30", name: "30/30 VO2max shuttles", description: "Tabata-style: 10-20 x 30s at 130% FTP / 30s easy.", main_set: { reps: { beginner: 10, intermediate: 15, advanced: 20 }, duration_sec: 30, power_target_pct_ftp: 1.30, rest_sec: 30 } },
        { id: "bike_vo2_3x10", name: "3 x 10 min VO2max progression", description: "3x10min building from 100% to 115% FTP across each rep.", main_set: { reps: 3, duration_sec: 600, type: "progression", start_pct_ftp: 1.00, end_pct_ftp: 1.15, rest_sec: 300 } },
      ],
      bike_intervals_sweet_spot: [
        { id: "bike_ss_3x15", name: "3 x 15 min sweet spot", description: "3x15min at 88-94% FTP w/ 5min easy.", main_set: { reps: 3, duration_sec: 900, power_target_pct_ftp: [0.88, 0.94], rest_sec: 300 } },
        { id: "bike_ss_2x25", name: "2 x 25 min sweet spot", description: "Extended time under tension. 2x25min at 88-92% FTP w/ 5min easy.", main_set: { reps: 2, duration_sec: 1500, power_target_pct_ftp: [0.88, 0.92], rest_sec: 300 } },
        { id: "bike_ss_4x10", name: "4 x 10 min sweet spot", description: "4x10min at 90-95% FTP w/ 3min easy.", main_set: { reps: 4, duration_sec: 600, power_target_pct_ftp: [0.90, 0.95], rest_sec: 180 } },
      ],
      bike_intervals_sprint: [
        { id: "bike_sprint_10x10", name: "10 x 10s sprints", description: "10x10s all-out sprints w/ 2min full recovery.", main_set: { reps: 10, duration_sec: 10, effort: "maximal", rest_sec: 120 } },
        { id: "bike_sprint_6x30", name: "6 x 30s sprints", description: "6x30s at 200%+ FTP w/ 4min easy.", main_set: { reps: 6, duration_sec: 30, power_target_pct_ftp: 2.0, rest_sec: 240 } },
      ],
      bike_endurance: [
        { id: "bike_endurance_steady", name: "Steady endurance", description: "Z2 continuous.", main_set: { type: "continuous", power_target_pct_ftp: [0.65, 0.75] } },
        { id: "bike_endurance_with_surges", name: "Endurance with surges", description: "Z2 with 6x1min Z4 surges scattered across the ride.", main_set: { type: "base_plus_surges", base_pct_ftp: [0.65, 0.75], surges: { count: 6, duration_sec: 60, power_target_pct_ftp: 1.05 } } },
      ],
    },
  };

  if (typeof window !== "undefined") window.VARIANT_LIBRARY_BIKE = VARIANT_LIBRARY_BIKE;
  if (typeof module !== "undefined" && module.exports) module.exports = VARIANT_LIBRARY_BIKE;
})();
