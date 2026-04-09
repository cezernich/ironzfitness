// js/variant-libraries/hybrid.js
// Pure data — VARIANT_LIBRARY_HYBRID.

(function () {
  "use strict";

  const VARIANT_LIBRARY_HYBRID = {
    id: "VARIANT_LIBRARY_HYBRID",
    rotation_cadence_by_type: {
      hybrid_metcon: 1,
      hybrid_amrap: 1,
      hybrid_emom: 1,
      hybrid_chipper: 1,
    },
    variants: {
      hybrid_metcon: [
        { id: "hybrid_20min_grind", name: "20-min grinder", description: "20 min AMRAP of a 4-5 exercise circuit." },
        { id: "hybrid_fran_style", name: "Fran-style", description: "21-15-9 thrusters + pull-ups. Classic short metcon." },
        { id: "hybrid_5_rounds", name: "5 rounds for time", description: "5 rounds of a 3-4 exercise circuit for time." },
        { id: "hybrid_cindy", name: "Cindy-style", description: "20 min AMRAP of 5 pull-ups, 10 push-ups, 15 air squats." },
        { id: "hybrid_helen", name: "Helen-style", description: "3 rounds: 400m run + 21 KB swings + 12 pull-ups." },
      ],
      hybrid_amrap: [
        { id: "hybrid_amrap_10min", name: "10-min AMRAP", description: "As many rounds as possible in 10 min." },
        { id: "hybrid_amrap_15min", name: "15-min AMRAP", description: "As many rounds as possible in 15 min." },
        { id: "hybrid_amrap_20min", name: "20-min AMRAP", description: "As many rounds as possible in 20 min." },
      ],
      hybrid_emom: [
        { id: "hybrid_emom_10", name: "10-min EMOM", description: "Every minute on the minute, 10 rounds." },
        { id: "hybrid_emom_20", name: "20-min EMOM", description: "Every minute on the minute, 20 rounds, alternating movements." },
      ],
      hybrid_chipper: [
        { id: "hybrid_chipper_long", name: "Long chipper", description: "Single round, 6-8 exercises, high reps (e.g., 100 of each), chip through for time." },
      ],
    },
  };

  if (typeof window !== "undefined") window.VARIANT_LIBRARY_HYBRID = VARIANT_LIBRARY_HYBRID;
  if (typeof module !== "undefined" && module.exports) module.exports = VARIANT_LIBRARY_HYBRID;
})();
