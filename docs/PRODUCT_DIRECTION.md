# Iron Z product direction

Owner decisions recorded 9 November 2026. This is product direction for review, not a replacement for the training master spec or permission to release unvalidated behavior.

## Audience and success

Self-coached endurance and hybrid athletes, initially Ironman athletes, runners and cyclists. The owner's target event is the first complete acceptance journey; its private health records and personal coaching project stay separate and unchanged.

Success means a coherent, adaptable, athlete-specific plan that prepares athletes for their events and supports measurable improvement. Training principles must have traceable evidence, applicability and limitations. Deliberate workout variation should preserve progressive training and repeatable benchmarks rather than randomly changing every workout. Improvement is evaluated over time, not guaranteed.

## Priorities and athlete choice

Health is the highest priority. Recovery needs and training goals drive recommendations rather than simply filling available calendar space. Actual availability remains a feasibility constraint: the app must not schedule impossible sessions, assume unlimited time or compress missed work into unsafe catch-up training. When time cannot support the goal, explain the mismatch and propose changing the schedule or goal.

When recovery and performance priorities are uncertain, explain the evidence, uncertainty and relevant trade-off, then ask for the athlete's preference among supported options. Athlete preference does not override explicit clinician restrictions or hard safety constraints. The app must not manufacture a precise personal risk estimate from insufficient evidence.

Adjustments begin as proposals with athlete approval. Automatic changes may be introduced later through explicit opt-in after validation. Keep notification consent, coaching feedback and permission to mutate plans as separate controls. Turning off feedback must not be silently treated as enabling background plan changes.

## Data experience

The current personal workflow uses Strava, Intervals.icu and calendar data. Iron Z should own retrieval, normalization, history and coaching context so the athlete does not have to run a separate coaching agent or routinely paste available metrics. Device/provider authorization and revocable consent are still required; direct integration feasibility must be verified before choosing providers. Automatic retrieval does not mean bypassing account connections.

Calendar access is an optional user-connected integration. Athletes without it can provide availability directly. Wellness and activity ingestion must handle freshness, missing values, conflicting sources and duplicate activities. Missing data remains unknown, not proof of recovery or noncompliance.

## Strength and supporting features

Strength priority is an athlete preference. Endurance-supporting strength, equal-priority hybrid development and standalone strength goals are distinct configurations, with their scheduling and recovery trade-offs made visible. Do not assume strength always means either minimal maintenance or maximizing muscle gain.

Nutrition and hydration support the training context and remain optional. Daily and weekly feedback need independent on/off controls, user-selected local delivery times and channels, quiet hours and discreet notification previews.

## Delivery order

1. Resolve and test existing security, empty-plan, synchronization and prescription-adjustment blockers in staging.
2. Establish authoritative plan/coaching specifications, one execution contract and versioned athlete/session state.
3. Deliver prescription-versus-activity review and useful daily/weekly feedback with provenance and correction handling.
4. Add validated wellness ingestion and personal-baseline trends, then proposed adjustments and weekly approval.
5. Expand reliable watch/calendar publishing and explicitly opted-in automation after end-to-end validation.

The daily interface should answer what the athlete should do, why, and what changed. Detailed trends and advanced controls should not compete with that primary task. The existing production release hold remains in force.
