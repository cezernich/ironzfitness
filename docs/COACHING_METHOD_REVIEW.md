# Coaching method and product experience review

Reviewed 9 November 2026. Sources: the owner's private Ironman Madison handover, Claude's adaptive coach draft v0.3 on `claude/coach-agent-spec` (PR 17), the current master plan spec, inspected runtime paths, and the existing staging browser walkthrough. No coaching project, automation, calendar, watch workout, or application code was changed. Personal health history, measurements, schedules, account identifiers and connector credentials from the handover are deliberately excluded.

The handover describes another agent's operating instructions. Those instructions are reference material, not authorization to act as that coach or update its systems. The referenced master coaching instructions, current-week document and season log were not supplied. This review establishes product direction; it does not verify the live agent's executions or clinically validate its numerical thresholds.

## What makes the personal coach useful

The central asset is the repeated decision loop: retrieve context, check data quality, compare actual performance with the exact prescription, assess trends against the athlete's baseline, make a bounded decision, explain it, and retain the result. A chat box or a daily motivational message does not reproduce that loop.

| Method to retain | Product requirement |
| --- | --- |
| Full athlete context before a recommendation | Versioned goals, constraints, thresholds, plan and observations, with source and freshness |
| Grade what was prescribed | Link activities to the prescription revision in effect when the session happened; support partial and multiple activity files |
| Trends rather than isolated readings | Personal baselines, sufficient coverage and comparable-session context; distinguish observations from causal explanations |
| One clear current workout | One active prescription revision; proposals remain separate until accepted or an authorized automation applies them |
| Specific coaching and teaching | Explain the change with the relevant evidence, uncertainty and one practical action; avoid generic praise and repeated tips |
| Recovery, nutrition and hydration in context | Include relevant support for the session, without importing one athlete's personal targets as universal defaults |
| Durable memory | Append-only observations and decision history, corrected by new versions rather than overwritten logs |
| Calendar and watch consistency | Stable external IDs, retries and reconciliation; display pending/failed sync honestly |
| Weekly approval | Save a draft separately; acceptance publishes the intended version, while silence leaves the existing committed week intact |

## Review findings for draft v0.3

1. **Opt-out must be literal.** The draft says disabling auto-adjust makes everything a proposal except Rest-level changes, which still apply. Separate feedback delivery, plan automation and notifications. Coaching off means no coaching mutations; automation off means no automatic mutations. The app can still display an important constraint without silently changing the user's plan. The owner's latest request explicitly requires on/off controls.
2. **Resolve notification frequency.** Section 5 limits briefs to training/recovery-related days; sections 8 and 13 say every day by default. Define one default and the exact options. Separate daily/weekly toggles, day/time, IANA time zone, quiet hours, channels, travel behavior and permission revocation. Define missed-delivery and late-data behavior without sending duplicate or stale workout messages.
3. **Make approval and safety precedence explicit.** A proposal that expires and leaves the original workout active must not conflict with an already recorded restriction. Define which rule wins, what the athlete sees, how overrides work, and what a non-response means for each decision class. Clear recommendations should preserve user agency.
4. **Make each decision traceable.** Store observation IDs, data coverage, applicable rule versions, prescription before/after, reason, uncertainty, approval/override and delivery status. Deterministic rules also need domain validation; determinism alone does not establish sound training advice.
5. **Treat uncertainty honestly.** Missing data is unknown. An unlogged session is not proof it was skipped. Sensor disagreements, late sync, duplicate activities, stale zones and manual corrections need explicit handling. Replace "never issue a critique that needs retracting" with supported conclusions, calibrated confidence and a visible correction history.
6. **Avoid causal overclaiming.** A change in a metric can have several explanations. Trend comparisons should account for sport, conditions, effort and measurement method; the coach should not confidently attribute a cause that the observations do not establish.
7. **Multi-system updates need a recoverable workflow.** App, calendar and watch cannot be assumed to commit atomically. Save the intended revision once, queue idempotent updates, reconcile partial failures and show each destination's status. Never claim On Watch merely because a request was sent.
8. **Generalize the method, not the owner's identity.** Personal thresholds, medical restrictions, tone, pool units, available equipment and goals are athlete-specific. Connector access and metric availability need verification for the actual integration. Do not reuse the personal connector or its credentials for multiple users.
9. **Distinguish policy from validated evidence.** The draft itself identifies some adjustment limits as judgment calls. Keep those labeled as proposed product policies, with explicit populations, exclusions and review requirements. Numerical readiness, fueling and hydration rules need a separate primary-source/domain-expert review before shipping; this review does not endorse them as universal safe limits.
10. **Keep health details out of notification previews by default.** Offer a discreet message such as "Your training review is ready." Detailed metrics and sensitive explanations belong inside the authenticated app unless the athlete deliberately enables richer previews.

## Visual and interaction assessment

The sampled Stone theme has recognizable branding, a restrained red/ink palette and reasonably consistent typography. It does not look like an undifferentiated generated landing page. The dated calendar and bottom navigation provide useful orientation.

Parts of the experience nevertheless feel template-driven:

- A new synthetic account received a Welcome Back/inactivity prompt. Feedback must reflect actual known history.
- Rest-day and protein checkmarks appeared alongside empty activity/nutrition data. Completion indicators need explicit semantics and must distinguish no target, no data and actual achievement.
- Repeated cards, three prominent rings and six top-level navigation destinations give many features similar visual priority. The athlete's next decision is less prominent than the dashboard machinery.
- The generic greeting, sparkle affordance and broad Ask IronZ prompt signal AI more strongly than evidence of informed coaching.
- The plan wizard reported saved despite persisting zero sessions. This is a concrete trust failure, tracked in issue 20, and remains more urgent than cosmetic refinement.
- Inactive modal content appeared in the accessibility tree. Focus and visibility must be reviewed, not just screenshots.

Recommended primary hierarchy: today's actual workout; a short reason or validated change; one next action; a compact recovery/data-status summary. Put detailed trends and weekly review behind progressive disclosure. Retain the existing visual identity while reducing generic language and competing cards. Do not invent readiness scores to fill an empty screen.

This is a subjective assessment of sampled screens and observed behavior, not a completed usability study. The staging banner is test infrastructure and is excluded from the design judgment. Validate any redesign with representative athletes and actual tasks before adopting it.

## Proposed first slice and review gates

After existing security, persistence and empty-plan blockers are resolved, start with read-only prescription-versus-activity feedback, a short daily review and a weekly trend summary. Establish correctness and correction handling before automatic changes or watch/calendar publishing. Design notification controls and automation consent from the beginning.

Acceptance scenarios should include a new athlete with no history; no wearable; a late or conflicting sync; a session split across activity files; manually reported completion; a restrictive athlete constraint; coaching/automation disabled; quiet hours and daylight-saving changes; a stale proposal; and partial calendar/watch failure. Use synthetic cases in staging and preserve the existing release hold.

For deeper comparison with the working project, review the master coaching instructions, a redacted current-week document, a redacted season-log extract, and representative daily/weekly outputs. Do not modify the working project or transfer its private athlete data to this public repository.
