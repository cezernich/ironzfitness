# Iron Z shared engineering handoff

Updated 9 November 2026 by Codex. Review baseline: `25906457b84210769aa2d2606fd7e5ed0ab5d9b7` on `main`.

## Shared working agreement

Claude's collaboration setup is proposed in [PR 12](https://github.com/cezernich/ironzfitness/pull/12). Its `AGENTS.md` and importing `CLAUDE.md` should be the shared instructions once merged. This handoff supplements the code review in that PR; it does not replace the training master spec or authorize another agent's branch to be changed.

Chase authorized implementation of the review fixes, repository workflow improvements, and dedicated test users. Keep changes on task branches, submit PRs, and leave merging to Chase. Review the latest remote branches before starting so pending work is not duplicated. No code fixes, migrations, or secret rotations listed below should be assumed deployed merely because a branch exists.

## Confirmed GitHub configuration

GitHub's API was inspected on 9 November 2026:

- This repository is public.
- GitHub Pages publishes the root of `main` directly to `https://ironz.fit`; HTTPS is enforced.
- Capacitor loads that same website remotely. A web release also affects the iOS wrapper.
- The initial check found no main-branch protection and no repository rulesets.
- The only environment was `github-pages`; no separate staging environment was configured.
- Open PR 12 adds shared instructions and test CI. PR 1 is an older strength-session sharing fix. Other remote fix branches also exist; inspect them before porting overlapping changes.

See [RELEASE_WORKFLOW.md](RELEASE_WORKFLOW.md) for the proposed release and environment setup. Check GitHub for the current protection state; this initial inventory is not a substitute for a live setting check.

## Additional findings from Codex

These are source-level findings against the baseline, not a statement that production grants or function settings were verified. Do not run exploit checks or destructive synchronization tests on production athlete records.

| Priority | Finding and evidence | Required outcome |
| --- | --- | --- |
| Immediate | `supabase/migrations/strava-migration.sql` includes a concrete Strava client-secret value in setup comments. Do not reproduce the value in issues, logs, PRs, or this file. | Rotate at the provider, update the deployed secret, remove the value from current source, and review history exposure. Removing text alone does not revoke a credential. |
| Immediate | `profiles` owner INSERT/UPDATE policies protect rows but not privilege columns; `auth.js` even promotes owner emails from the browser. `inbox-migration.sql` adds an authenticated `USING (true)` profile SELECT policy. | Protect privilege fields on INSERT and UPDATE and remove broad profile reads. Verify live policies and grants, including coach flags, with real database authorization tests. Claude's review already covers these; coordinate rather than duplicate its fix. |
| High | `js/db.js` `_debouncedSync` infers deletion from absence in a local array. An isolated execution of the actual function with local `[A]`, remote `[A,B]` issued DELETE for B. The empty-array path deletes all user rows in that table. | Use explicit mutations/deletion records and revisions; verify two-device/offline behavior. Never purge remote rows just because a stale device did not download them. |
| High | `send-push` checks only bearer-header shape before using service-role access and caller-selected `user_id`. `notify-share` trusts caller-selected recipient and sender metadata. Reminder handlers also need their deployed access settings audited. | Verify internal service identity; for user-triggered actions, authorize against the actual share and recipient. Gateway JWT validity alone is insufficient authorization. |
| High | `adaptive-coach.js` `adjustPlanIntensity` changes `load` and `adjusted`, not interval efforts or prescriptions. Actual-function reproduction changed hard to moderate while duration remained 60 minutes and effort remained Z4. | Change structured prescriptions within a bounded window, preserve coach control, validate constraints, explain exact changes, and retain undoable revisions. |
| High | `feedback-loop.js` writes snake-case recovery fields; `AthleteClassifier.deriveRecoveryState` reads a different camel-case shape. Direct calls with scores 1/1/5 returned `good` for the writer shape and `low` for the expected shape. The newer classifier is not the main live plan path. | Normalize one check-in contract and distinguish unknown or stale recovery from good recovery; test every entry point. Do not claim this reproduction proves every live plan ignores fatigue. |
| High | `onboarding-v2.js` `_toggleApp` only toggles a class/text. It can mark Garmin Connected without authorization or ingestion. | Derive Connected from verified provider state, or clearly mark the provider unavailable. |
| High | `ask-ironz` reads a usage counter then upserts count + 1 separately, ignores quota-write errors, and accepts client-selected models and raw payloads. | Atomically reserve quota, fail safely, allowlist models/operations, and bound input size and spend. |
| High | `storeGeneratedPlan` deactivates old plans before a separate insert. The committed active-plan index is nonunique. | Transactional replacement, at most one active plan per user, stable session linkage, and visible save failures. |
| High | `npm run build` exits 23, omits current runtime folders, and copies backend source and scratch files to output. | Build only client runtime assets, validate references, and make Capacitor sync reproducible. A separate Codex build-fix PR will address this. |
| Medium | Reminder handler interprets local clock time as UTC. Calendar configuration has an empty client ID, busy imports reduce whole dates, and repeated exports POST new events. | IANA time zones, actual availability windows, configured OAuth, and idempotent event updates. |
| Medium | The service-worker precache still references moved root JS paths and swallows installation failures. | Verify cached URLs and explicitly test offline/recovery behavior. Do not remove or change the production service worker as part of an unrelated build repair. |

## Verification record

At the baseline, all 144 inventoried runtime JavaScript files parsed; local script/stylesheet references in `index.html` existed. Of 16 test scripts, **9 passed and 7 failed**. Five failed on moved imports, one on stale coach RLS/source expectations, and one on the old sharing domain. `npm test` was still a placeholder, and `scripts/test-golden.js` failed on moved files. This corrects an earlier interim 8/8 tally.

PR 12 repairs the test runner and paths, and quarantines three remaining behavior suites. Those quarantines are visible debt, not proof that all training logic is correct. Its source-text RLS tests are not substitutes for Postgres authorization tests. The baseline build and golden-runner failures above should not be confused with results after that PR merges.

The live signed-out screen was inspected. No authenticated account was created or used, no production data changed, and no clinical validation or production load test was performed. Sentry is already configured; update privacy disclosures to reflect actual processors and flows rather than claiming there is no monitoring.

## Decisions to retain and questions to verify

- Preserve the philosophy, exercise library, structured workouts, rationale, and rule-engine investment. Consolidate before considering a framework rewrite.
- The agent collaboration instructions identify the newer Rule Engine as the target and pause coaching feature development except security fixes. Respect that scope.
- Garmin availability, business access, and data types must be verified against current official documentation and the actual application account. Do not assume a connector is approved or promise that an Apple Health intermediary supplies every Garmin metric.
- Use a separate Supabase staging project and synthetic athlete accounts. A branch alone does not isolate data. Do not use a real athlete's account for destructive/offline-sync tests.
- Remaining read-only production audit: actual schema/grants/migrations, function authorization settings, secrets rotation status, backups and restore evidence, provider limits, and a staging athlete/coach walkthrough.
