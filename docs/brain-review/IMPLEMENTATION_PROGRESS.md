# IronZ engine implementation progress

Implementation authorized by the owner after the design review. Application changes remain on review branches and isolated staging; no production release or merge is authorized by a passing test alone. The personal coaching project remains unchanged.

## Athlete input and recovery contract

The first change supplies one pure athlete-input normalizer and a DB capture boundary. It preserves goal, race intent/lead-in, strength role and goal, raw measurement evidence, units, active-versus-historical races, available days and session duration. Measurement selection respects source dates and the evaluation as-of time; explicitly marked unsaved drafts take priority without accepting future-dated measurements. Missing body values stay null. Snapshot local dates use an explicit timezone; the pure default is UTC rather than host-local time.

The real wizard mapping no longer inserts a synthetic intermediate override. Both check-in readers share a dated canonical report, and both the ordinary weekly form and report-writing utility acknowledge DB persistence before confirmation. The difficulty-only form keeps recovery unknown. Numeric/word subjective categories follow the documented conservative ordinal policy; absent, incomplete, conflicting, future or stale reports remain unknown.

Evidence is in `tests/athlete-input.test.js` and the real wizard/DB regression harness. It includes actual wizard save/capture and actual weekly-submit success/rejection, plus aliases, units, freshness, historical races, rest markers, strength intent and retained raw evidence. This implements parts of A01–A06/A26, not every assertion in those capability gates. The 30-case catalog remains planned until a full execution record exists.

## Work still in progress

The target engine is NOT activated. Independent QA reproduced cycling plans with no bike work, inconsistent post-adjustment brick/interval payloads, ineffective long-run proportion correction and invalid plans reported as valid. These are the next focused repairs, followed by final postconditions, state revisions, shadow comparison and staging. The target's old nutrition/hydration body defaults, strength-role programming, all availability paths and evidence/rationale consistency require full-cohort verification. Contract tests alone do not close those gates.

No wearable/provider/native integration, daily adaptive automation, private plan generation/comparison, database schema change or production rollout is represented as complete. The existing release hold remains in force. Claude cross-agent review and the documented qualified review requirements remain separate from independent software QA.
