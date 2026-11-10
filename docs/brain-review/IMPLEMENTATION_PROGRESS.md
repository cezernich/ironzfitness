# IronZ engine implementation progress

Implementation authorized by the owner after the design review. Application changes remain on review branches and isolated staging; no production release or merge is authorized by a passing test alone. The personal coaching project remains unchanged.

## Athlete input and recovery contract

The first change supplies one pure athlete-input normalizer and a DB capture boundary. It preserves goal, race intent/lead-in, strength role and goal, raw measurement evidence, units, active-versus-historical races, available days and session duration. Measurement selection respects source dates and the evaluation as-of time; explicitly marked unsaved drafts take priority without accepting future-dated measurements. Missing body values stay null. Snapshot local dates use an explicit timezone; the pure default is UTC rather than host-local time.

The real wizard mapping no longer inserts a synthetic intermediate override. Both check-in readers share a dated canonical report, and both the ordinary weekly form and report-writing utility acknowledge DB persistence before confirmation. Difficulty feedback does not manufacture a wellness report or refresh an older observation; existing dated facts are preserved, otherwise recovery is unknown. Numeric/word subjective categories follow the documented conservative ordinal policy; absent, incomplete, conflicting, future or stale reports remain unknown.

Evidence is in `tests/athlete-input.test.js` and the real wizard/DB regression harness. It includes actual wizard save/capture and actual weekly-submit success/rejection, plus aliases, units, freshness, historical races, rest markers, strength intent and retained raw evidence. This implements parts of A01–A06/A26, not every assertion in those capability gates. The 30-case catalog remains planned until a full execution record exists.

## Target prescription repair milestone

The Rule Engine now has actual cycling templates, discipline-specific dose/zone ceilings, explicit strength intent and equipment, deterministic exercise selection from an as-of snapshot, and unknown-body nutrition/hydration results. Final timed endurance steps are rebuilt after corrections; brick legs and step totals match the resulting duration. Old imported/generated/library bodies cannot survive underneath easier metadata. Post-deload rebuilding compares with the last full non-deload planned week; it does not skip the cap or call that planned reference tolerated fitness. Generic hour ceilings can reduce work but cannot inflate it. Final validation rejects incomplete contracts, invalid/non-Monday calendar anchors, empty/gapped phases, mismatched weeks, excluded sports/days, invalid targets and unresolved safety postconditions. One available day stays one. The first partial week has explicit dates and is not a full progression baseline.

The owner selected separate strength/endurance budgets with shared recovery checks. Heavy strength participates in actual hard-day spacing across weeks; light support does not consume endurance-quality slots. Every overlapping B-race window is evaluated; recovery holds loaded work and race dates have no added training. Missing or incompatible exercises and sport-by-day layouts return explicit infeasibility rather than false success. Fat-loss strength guidance cannot insert an unselected sport or empty workout.

Evidence: `tests/rule-engine-final-prescriptions.test.js` executes real modules and exercise data for running, cycling, unequal-capacity triathlon and hybrid candidates, including independent QA repros. These are implementation checks, not execution of the full acceptance catalog or qualified coaching review. Numerical workout defaults are documented for review in master section6d.

## Work still in progress

The target engine is NOT activated. `PlanGenerator.storePlan` refuses adoption unconditionally while evaluation gates remain open; a DB method appearing is not authorization. No database migration, staging deployment, daily/weekly adaptive automation or real athlete plan is represented as complete by this milestone.

A further policy audit found the blanket long-run cap incompatible with a longest run in a two/three-run week, a mileage-versus-duration/brick scope mismatch, and unimplemented finish-versus-PR dose differentiation. The owner has been asked about the blanket cap; it remains unchanged pending that answer. These are unresolved policy/purpose gates, not solved by internal arithmetic tests.

Remaining activation gates include: recent tolerated baseline and feasibility; a purpose-preserving sport-by-day template allocator; explicit event execution prescriptions; effective restrictions and return status across all entry points; source-observation/history quality; versioned server commits and stale-device handling; proposed coaching with permissions, explanations and remembered decisions; full cohort/staging/native/provider evaluation; and the private independent plan comparison. Unsupported configurations fail visibly. The 30-case acceptance catalog remains planned until a complete execution record exists. Claude cross-agent review and qualified policy review remain separate requirements from software QA. Production stays held.
