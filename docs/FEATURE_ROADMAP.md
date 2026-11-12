# IronZ prioritized mobile feature roadmap

Recorded 9 November 2026 following the Intervals.icu product review. Revisit after the current security, plan generation, synchronization and prescription-adjustment fixes. The product goal is to help an athlete answer: **What should I do today, why, and what changed?**

This is a proposed backlog, not a release commitment or a change to training rules. Follow the existing release gates in [SESSION_STATE.md](SESSION_STATE.md) and the canonical [training master spec](../sources-of-truth/Engine%20Doc/PLAN_GENERATOR_MASTER_SPEC.md). Reconcile implementation with the product direction and acceptance criteria proposed in [PR 34](https://github.com/cezernich/ironzfitness/pull/34) after review. Some features extend existing IronZ capabilities rather than requiring a new module.

## Delivery priorities

| Order | Package | Features | Prerequisites |
| --- | --- | --- | --- |
| 0 | Current fixes and foundations | Resolve existing release blockers; establish one plan engine and reliable versioned training state | Keep production and staging status distinct; passing CI alone does not clear quarantined tests or disabled integrations |
| 1 | Understand the workout and week | Planned versus completed review, weather inside workouts, weekly summary and quick workout feedback | Reliable activity matching, timestamps and validated weather source; display context before adding automatic adjustments |
| 2 | Propose useful adaptations | Recovery context, separate strength fatigue, session fueling and hydration | Validated ingestion, personal baselines, canonical rules and athlete approval |
| 3 | Execute and measure progress | Watch delivery, season roadmap, benchmarks and threshold history | Provider feasibility and end-to-end testing; reliable plan versions and prescription history |
| 4 | Supporting conveniences | Repeat-route comparisons and gear reminders | Core training experience proven reliable |

High priority describes product value; dependencies determine implementation order. Watch delivery has high value but follows reliable plan state and integration validation.

## High priority features

### Weather inside scheduled workouts

**Mobile experience:** Put a compact weather card inside the workout, based on its location, local start time and expected duration. Show temperature, humidity, feels-like temperature, wind and gusts, precipitation and relevant alerts. Allow a manually selected location so continuous location access is unnecessary. Include forecast freshness; unavailable or distant forecasts must not appear certain.

**Workout behavior:** Offer an earlier start, indoor equivalent, shorter session or postponement when supported by validated rules. Preserve the session's purpose where conditions allow. Describe this as weather-adjusted workout targets and safety guidance: temporary changes to pace, power, duration or venue should remain distinct from the athlete's underlying zone definitions and threshold history. Show the original prescription, proposed change and reason, then let the athlete approve it.

At an extreme such as 130°F, recommend an indoor or postponed alternative rather than imply a different zone makes outdoor exercise safe. Temperature alone is insufficient for a personal adjustment formula. Heat guidance must consider humidity, exposure, acclimatization and the athlete's circumstances; numerical rules require evidence review and a matching master-spec update. CDC recommends cooler training times and limiting activity in heat: [Heat and athletes](https://www.cdc.gov/extreme-heat/risk-factors/extreme-heat-and-athletes.html).

**Example card:** “Hot and humid at your scheduled start. Consider an earlier start or the indoor alternative.” Actions: **View conditions · Change time · View indoor workout**. This is illustrative copy, not an implemented safety rule.

**Intervals inspiration:** Calendar forecasts are visible today. Workout-time recommendations and athlete-approved adjustments are proposed IronZ extensions. See the [calendar guide](https://forum.intervals.icu/t/activities-page-a-guide-to-getting-started/17698).

### Planned versus completed workout review

**Mobile experience:** Keep the prescription and matched activity in one workout card. Summarize intended versus actual duration, effort and interval execution, with a tap for details. Explain whether the session's purpose was achieved rather than treating extra work as a higher completion score.

**Requirements:** Support manual correction of matches, duplicate imports, split activities, brick sessions, substituted workouts and delayed uploads. Missing activity data means unknown, not automatically skipped. Preserve the original prescription and any approved revision for a meaningful comparison.

**Intervals inspiration:** Linked planned and actual workouts, compliance information and activity analysis. IronZ's extension is a concise explanation of execution and the implications for the next session.

### Recovery context beside today's workout

**Mobile experience:** Show a short recommendation and “Why?” detail using sleep, resting heart rate, HRV trends and the athlete's own check-in. Display source, freshness and personal-baseline context. Allow the athlete to report illness, injury or a mismatch with how they feel.

**Requirements:** Validate ingestion and sufficient history before interpreting trends. Missing data stays unknown. Never increase training load from wearable data alone or override injury, illness or clinician restrictions. Proposed changes begin with athlete approval; this follows the existing pause on coaching implementation until foundations are ready.

**Intervals inspiration:** Wellness appears beside calendar entries, with fitness and fatigue trends available separately. IronZ should make the connection to today's decision understandable without requiring chart interpretation.

### Weekly load and intensity balance

**Mobile experience:** One weekly card shows planned versus completed time, sport balance, easy versus hard work and changes from recent weeks. Highlight key sessions and upcoming recovery. Expand into trends only when requested.

**Requirements:** Label estimates and their input method. Avoid presenting modeled fitness, fatigue or form as a diagnosis or precise personal injury probability. Explain zone definitions across sports before combining totals. Use the canonical plan's intended distribution rather than importing a universal intensity ratio.

**Intervals inspiration:** Fitness, fatigue and form charts; weekly calendar totals; time in power, heart-rate and pace zones.

### Separate endurance and strength fatigue

**Mobile experience:** Include strength and Hyrox in the week's recovery context. Explain potential collisions between demanding leg sessions and hard running, with a proposed alternative schedule. Respect the athlete's chosen role for strength: supporting endurance, equal-priority hybrid training or standalone strength development.

**Requirements:** Heart rate alone must not define lifting difficulty. Start with appropriate session effort and strength workload inputs; validate sport-specific rules before using them to change training. Do not copy another app's fitness/fatigue contribution percentages as physiological truth.

**Intervals inspiration:** Activity types can contribute differently to modeled fitness and fatigue. IronZ needs a treatment suited to hybrid athletes.

### Structured workout delivery to watches

**Mobile experience:** Provide “Send to device” for warm-up, repetitions, recoveries and targets. Show pending, delivered and failed states with a useful retry action. Match the returned activity to the same scheduled session.

**Requirements:** Verify each provider's access, supported sports and target formats before promising compatibility. Test edits, cancellations, duplicate prevention, timezone changes and stale device copies. Sending an updated prescription must not leave the athlete executing an obsolete version. Export controls and integration settings in Intervals are inspiration, not proof that IronZ has equivalent provider access.

## Medium priority features

### Quick post-workout feedback

**Mobile experience:** Ask “How hard?” and “How did you feel?” with optional soreness, discomfort, fueling and free-text notes. Keep the basic interaction brief and skippable.

**Requirements:** Compare perceived effort with the intended session before proposing progression. Handle repeated difficulty and explicit injury/illness reports according to canonical rules. Respect feedback and notification preferences independently of permission to change the plan.

**Intervals inspiration:** Activity RPE and feel fields. This can ship early alongside planned-versus-completed review, even though automated interpretation comes later.

### Visible season roadmap

**Mobile experience:** A simple timeline shows current training phase, next recovery week, race priorities and taper. Default to the next few weeks, with a season overview on demand. Explain how a proposed schedule change affects the goal.

**Requirements:** Display the authoritative plan rather than creating another planning engine. Preserve constraints and recovery when moving sessions. Use the canonical specification for phase and taper behavior.

**Intervals inspiration:** The subscription-gated [annual training planner](https://forum.intervals.icu/t/annual-training-plan-builder/122085) describes phase timelines, race priorities and weekly targets. IronZ's presentation should suit a phone rather than reproduce its desktop controls.

### Repeatable benchmarks and threshold history

**Mobile experience:** Show progress on comparable sessions and the source and date of current pace/power targets. Present a possible threshold improvement as a reviewable suggestion with supporting evidence.

**Requirements:** Separate measured tests from estimates and indoor from outdoor context where appropriate. Keep historical prescriptions attached to the thresholds used at the time. Avoid silently raising future targets after a single strong activity.

**Intervals inspiration:** Best Efforts, power/pace views, activity comparison, estimated versus configured FTP and repeatable submaximal test descriptions.

### Fueling and hydration attached to the session

**Mobile experience:** Put preparation, during-workout guidance and recovery notes inside the scheduled workout. Offer optional reminders and quick logging of actual intake, tolerance and what worked.

**Requirements:** Extend existing nutrition/hydration capabilities with duration, intensity and conditions. Numerical personalization requires validated rules and matching spec changes; do not apply a blanket heat multiplier or assume more fluid is always better. Keep nutrition and hydration optional.

**Intervals inspiration:** Carbohydrate intake/use fields and workout descriptions. Weather-aware personalization and the integrated mobile flow are IronZ proposals.

## Later supporting features

### Repeat-route comparisons

**Mobile experience:** A “Your usual route” card compares similar activities and effort over time, with relevant differences in weather and terrain. Avoid declaring improvement solely from faster elapsed time.

**Requirements:** Reliable route matching, correction controls and location privacy. Keep home/start/end details private by default and validate any sharing behavior.

**Intervals inspiration:** Subscription-gated [route matching](https://forum.intervals.icu/t/activity-route-matching/89041) associates activities with familiar routes and supports historical comparison.

### Gear usage and maintenance reminders

**Mobile experience:** Attach shoes or a bike to a workout, accumulate usage automatically and show configurable reminders. Let athletes record service or retire gear without losing history.

**Requirements:** Treat mileage reminders as configurable maintenance prompts, not universal injury-prevention thresholds. Reconcile edited or duplicate activities so usage does not double count.

**Intervals inspiration:** Gear lists, components and gear reminder notification options.

## Mobile design and implementation boundaries

- Lead with today's workout, its purpose and any proposed change. Put detailed charts and advanced controls behind a tap.
- Keep social feeds, leaderboards, extensive dashboard customization and coach-management expansion below the core athlete experience.
- Use discreet, optional notifications with quiet hours. A missing response is not approval to change training.
- Store training state through the established data layer; do not add direct localStorage training state. Reliable state and offline behavior need explicit design and validation.
- New training logic belongs in the Rule Engine and must update the master spec in the same PR. Implement small concerns separately, with meaningful tests and independent review.
- Keep real athlete records, precise locations, credentials and private activity screenshots out of this public repository.

## When work resumes

Confirm the current blockers in SESSION_STATE.md first. Then inventory existing implementations against this backlog, choose one small package and write its acceptance criteria before coding. The first proposed package is planned-versus-completed review, a display-only workout weather card and a concise weekly summary; validated adaptation follows later.

The Intervals review covered main product surfaces and sampled workout details. Annual planning and route tracking were assessed through official descriptions because the account's UI gated access. Product observations here are distinct from proposed IronZ behavior; no competitor defaults are adopted as training rules.
