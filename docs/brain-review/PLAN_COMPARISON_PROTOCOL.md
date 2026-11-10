# IronZ independent plan comparison protocol

Draft, 9 November 2026. Compare plans as alternative strategies for the same athlete. The reference plan, including an existing personally useful coaching plan, is not the expected output or an automatic winner. A different IronZ plan can be reasonable; a near-identical one can still violate constraints.

The [brain acceptance specification](BRAIN_REVIEW_AND_ACCEPTANCE_SPEC.md) supplies capability gates. This protocol evaluates plan quality and material differences; it cannot certify clinical safety, establish an individual's clearance, or guarantee improved performance.

## Inputs and privacy

Use a frozen evaluation package with an as-of date and a named owner. Keep real athlete packages and reports in owner-private storage outside the public repository. Agents may access only the data authorized for this comparison. Public examples are synthetic, not slightly altered copies of real health records. Do not send the private package to a new model/provider or share it with coaches without appropriate authorization.

The package contains:

- One canonical athlete snapshot: goal priorities, sport-specific demonstrated history/capacity, availability/facilities, preferred strength role, equipment, units, thresholds and their provenance, reported restrictions and their effective dates/status, missing data, and data/automation permissions.
- The plan horizon and comparison dates, local timezone, last approved prescription versions, completed work known by the as-of date, and quality/freshness labels. Freeze retrieval; don't let an overnight sync change one plan's inputs midway through the comparison.
- Plan A and Plan B as structured prescriptions plus rationale. Preserve original source/author versions. Retain planned versus actual distinctions. A distant seasonal sketch and a detailed week are different resolution levels, not evidence that one plan forgot all later workouts.
- Engine/code, policy/evidence, schema, snapshot and input-adapter versions; comparison policy; fixed time and variation seed; declared unsupported cases.

Normalize units, zones and race enums before comparison. Do not manufacture a threshold, session duration, rest duration, precise race date, future calendar availability or clearance to fill a hole. A target range and a ceiling are different instructions; retain both semantics. Record assumptions made by each author. Where one plan had different or later information, mark the comparison confounded and rerun with equal information, or explain that exact parity is impossible.

Two evaluation tracks are required. A reproduction track uses the information available when the reference was authored; a current-decision track uses today's valid inputs for both strategies. Do not criticize an old plan for not knowing future facts or adopt its stale instructions into the current plan. If a reference author cannot regenerate, evaluate its old plan only within its valid historical context.

## Independent review procedure

1. **Check completeness.** List sufficient, missing, conflicting, stale and unsupported inputs. A missing prerequisite can make only one phase unassessable; do not pretend that every later session is valid because the season outline is plausible.
2. **Assess both plans separately.** Review A and B against the same constraints and evidence before judging similarity. Withhold author labels until the first judgments where feasible. Never fabricate independent review by relabeling the generating agent's self-check.
3. **Validate actual prescriptions.** Check steps, interval/rest arithmetic, targets, durations, lifting sets, units, intensity exposure, dates and phase boundaries. A displayed easy label does not erase hard work. A total-hours number cannot substitute for inspecting session content.
4. **Compare strategy and magnitude.** Produce the tables below, then explain which differences are reasonable alternatives, unexplained or problematic. Separate factual adapter failures from disagreements in coaching philosophy.
5. **Challenge both plans.** Identify at least one assumption, missing input or alternative strategy for each, when applicable. Do not invent a criticism to satisfy a count. A known-good benchmark still has limitations.
6. **Run counterfactuals.** In synthetic cases vary one factor at a time: sport capacity, goal, strength role, availability, incomplete wellness, a restriction or corrected data. Check preserved constraints and sensible direction, rather than requiring exact session identity. Test both increases and reductions in available capacity.
7. **Record the verdict.** Each finding states source/input, affected prescription/week, applicable rule/evidence, severity, proposed resolution and confidence. The generating agent responds; the independent reviewer verifies the revision. Preserve the original finding and response.
8. **Approve adoption separately.** Athlete consent to a plan is separate from evaluation, publication or automation. If a new restriction arrives while its save fails, retain history but visibly hold ineligible work; disclose incomplete cross-device propagation. A stale watch copy is not the approved instruction. Commit only against the evaluated current revision. Changes after review invalidate affected evidence. Never push the trial plan to production/calendar/watch merely to make comparison possible.

A separate agent provides software/logic review. For disputed training applicability, scope changes or clinical concerns, a qualified endurance professional or appropriate clinician supplies the relevant domain review. The report records what each reviewer actually checked; one does not impersonate the other's expertise.

## Required comparison tables

### Athlete context and strategy

| Dimension | Plan A | Plan B | Interpretation |
|---|---|---|---|
| Inputs and missingness | Facts/assumptions actually used | Same | Comparable or confounded |
| Primary and secondary goals | Priority and constraints | Same | Goal preserved or altered |
| Season arc | Phase start/end and purpose | Same | Strategy difference and race readiness rationale |
| Starting capacity | Recent tolerated work, gaps and provisional assumptions | Same | Grounded or invented starting load |
| Availability and facilities | Eligible dates, sports, durations and locations | Same | Feasible, conflicting or unverified |
| Strength role | Supporting endurance, hybrid or primary | Same | Athlete preference honored |
| Data and clinical limits | Unknowns, holds, evidence status | Same | Allowed, blocked or needs clarification |

### Weekly and session differences

For every overlapping week show total and per-sport minutes/distance, number of sessions and training days, key sessions and hard days, easy/hard exposure with its calculation method, longest sessions by sport, recovery/deload/taper status, planned progression and supporting strength. Show reference values, candidate values, absolute difference and relative difference. Do not add unlike distances or count a brick twice in total time; count its components toward their respective sport exposure.

At session level compare discipline, purpose, timing, complete steps and targets, duration totals, fueling/recovery support where enabled, and rationale. Unmatched sessions are explicit additions/removals; they are not zero-duration versions of matched sessions. Missing power/pace/intensity coverage remains unknown with a coverage percentage; avoid false precision in summary load scores.

Proposed initial **review alerts**, not medical limits or pass/fail tolerances:

- More than 20 percent difference in total weekly duration, 25 percent by sport, or 20 percent in the longest session for a sport.
- Any difference in key-session count, hard-day placement, secondary-event substitution, restriction status or athlete-selected strength role.
- Phase, recovery-week or taper boundaries shifted by at least seven days, or an omitted planned recovery/taper.
- A material target/zone, rest-step, unit or structure mismatch; any mismatch with a hard constraint is a failure regardless of magnitude.

Always show absolute values alongside relative alerts. If the reference value is zero or unknown, report an addition or unassessable difference; never divide by zero or present infinity as a training conclusion. Tiny denominators can create large percentages without a meaningful training difference. Alerts request reasoning and may be tuned after reviewer calibration; they never establish a universal safe amount of change. Differences under an alert still require review if their context is important.

## Severity and disposition

| Finding | Meaning | Disposition |
|---|---|---|
| Critical | Violates a hard restriction, privacy boundary or approval/commit integrity; invents clearance; loses the approved plan; corrupted units create a materially different prescription. | Block affected generation/adoption. Correct and revalidate all hard gates. |
| Major | Material unexplained departure from supported goals/capacity/recovery structure; missing purpose/evidence; silent preference loss; actual steps contradict the recommendation; a required input or capability is unsupported. | No adoption within affected scope until resolved, or explicitly reduce pilot scope without exposing the unsupported athlete/phase. |
| Review required | Large or uncertain difference with plausible alternatives, weak data or contested coaching policy; no demonstrated hard violation yet. | Obtain missing facts/domain judgment. Do not average it away in a score or silently promote it to approval. |
| Acceptable alternative | Different but feasible strategy, with explicit evidence/rationale and athlete goals preserved. | Document why it is acceptable; no need to imitate the other plan. |
| Presentation | Wording or organization problem with unchanged prescription/meaning. | Improve clarity; distinguish from a change in training. |

There is no aggregate similarity score that can override a blocker. A candidate passes its supported-scope pilot only when all relevant acceptance cases have evidence, every critical/major/review-required finding is resolved or the unsupported exposure is removed, independent review scope is sufficient, and the athlete approves adoption. Optional provider delivery can remain disabled for an app-only pilot, but cannot be labeled tested or supported.

## Required report and decision record

The report begins with: **recommend adopt / revise / insufficient information / hold**, supported scope, and the two or three material reasons. It then contains frozen inputs/versions, completeness/confounding assessment, separate judgments of both plans, phase/weekly/session difference tables, acceptable alternatives, findings with resolution evidence, reviewer identity/scope, outstanding clinical/provider constraints, and the next explicit decision.

Use two passes for the private reference case: one historical same-input comparison where sufficient records exist, and a current-data candidate evaluation. The handover alone does not prove what the original coach knew or what was actually executed. Ask only for missing records that change the comparison; don't request a complete personal account export by default.

This task defines the protocol. No candidate plan, retrospective reviewer verdict or observed athlete outcome is represented as having been generated by it yet.
