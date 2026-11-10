# Iron Z current session state

Updated 9 November 2026, late session (UTC migration timestamps are 10 November). This supersedes older checkpoints; history is in SESSION_LOG.md. Read AGENTS.md, PRODUCT_DIRECTION.md, this file and current remote PRs before continuing. Credentials and real athlete records remain outside this public repository.

## Scope and decisions

The owner authorized implementing the brain review in full, with ordinary engineering decisions autonomous and material philosophy questions asked. The full engine is NOT complete. No production merge/release, new active engine, actual athlete plan or private plan comparison was performed. Production adoption remains held.

Owner decision: endurance-quality and strength sessions have separate budgets, with shared fatigue/recovery and spacing checks. Light support is separate. Health/restrictions take priority; uncertainty is explicit. The private reference method is a comparator, never an unquestioned gold standard.

Pending owner question: the hard 30% long-run cap makes a longest run mathematically impossible with 1–3 weekly runs. Source master says mileage; implementation uses minutes and omits brick run legs. Asked whether to replace this blanket cap with sport-specific recent-completed-training-based limits and review flags, or retain it and explain infeasibility. **No answer yet; do not silently change that policy.** Do not choose a new universal safe percentage or invent tolerated load.

## Current repository and review branches

Latest fetched main is `50ed969`; PR30/32 were merged by other actors. This work made no main commits. Other ongoing work: Claude availability36 `a3c47f3`, goals38 `7cf7da7`, triathlon picker40 `7b067e3`, roadmap35 `05b7c0c`, Claude29 calendar groundwork `382b169` and adaptive spec17 `fa0367d`. Do not duplicate or push their branches.

- PR34 brain review/acceptance: `e3dcdb5`, `codex/brain-review-acceptance`, `/private/tmp/ironz-brain-review`. Thirty scenarios remain planned, NOT a passing acceptance record. Private coaching-method review stays owner-only. No actual private plan comparison.
- PR39 input contract: `c2dbddb`, `codex/normalize-athlete-inputs`, `/private/tmp/ironz-athlete-input-pr`. Preserves actual goals/race/strength intent and dated measurements; missing/conflicting/stale recovery stays unknown; acknowledged weekly saves preserve existing wellness timestamps. Latest input logic `5c871e6` reviewed at https://github.com/cezernich/ironzfitness/pull/39#pullrequestreview-5836504639 . c2 only merges current main and preserves the test module guard.
- Draft PR41 target prescriptions: `8d1a84d`, `codex/final-engine-prescriptions`, `/private/tmp/ironz-final-prescriptions`, stacked on39. Actual cycling, per-sport ceilings, strength/equipment, deterministic selection, unknown nutrition, final timed bodies, brick arithmetic, true rest/spacing/caps, explicit calendar dates/partial weeks and overlapping B-race protection after weakness emphasis. Follow-up bounds deload rebuilding against the last full non-deload PLANNED week (not measured tolerance), prevents ceilings inflating work and unconditionally refuses adoption. Both full timezone suites: 24 files, zero failures/quarantines,175 syntax checks, heuristic secrets zero. Latest bounded review https://github.com/cezernich/ironzfitness/pull/41#pullrequestreview-5836835078 . No qualified policy or full acceptance approval.
- Draft PR42 versioned shadow workspace: `72167d0`, `codex/versioned-training-state`, `/private/tmp/ironz-training-state`, based main `50ed969`. Owner-read tables/private owner-bound command helper/public invoker, atomic revision check, immutable events, idempotent retries, account-token binding and no cache writes. Original reviewed at `b781d91`; latest behavior `f558a40` reviewed at https://github.com/cezernich/ironzfitness/pull/42#pullrequestreview-5836731929 . 721 only adds exact PT409 SQL regression. Primary local 26 database checks pass; independent 25 before that extra assertion. Full npm: 23 files, zero failures/quarantines,174 syntax, heuristic secrets zero. This does NOT fix old user_data sync or approve any plan. Candidate status is forcibly unvalidated_shadow; client-asserted provenance is not trusted generation proof.
- Draft PR43 completed evidence: `f029596`, `codex/completed-training-evidence`, `/private/tmp/ironz-training-evidence`, stacked on41. Actual workout-log capture, explicit completion/identity, link dedup/conflicts, declared units, every event-time alias checked, records-only coverage and toleratedBaselineStatus:not_established. Both full timezone suites: 25 files, zero failures/quarantines,177 syntax, heuristic secrets zero. Latest independent review https://github.com/cezernich/ironzfitness/pull/43#pullrequestreview-5836848023 . Real source completion adapters, complete coverage and retrospective receipt knowledge are NOT established. No mass stamping old records completed. This adapter is not a starting-dose policy.

The coordination branch `codex/unified-engine-contract` at `/private/tmp/ironz-engine-contract` retains this checkpoint; it is not a shortcut release/integration PR. Older internal worktrees `ironz-rule-engine`/`ironz-verified-staging` are not the latest implementation source. Keep one agent per branch. Claude cross-agent reviews have been requested on41/42;43 request follows publication. Independent software QA is distinct from Claude/domain/release approval.

## Exact staging evidence

Only isolated Supabase `yhchfxjzxhinreklnxbi` was changed; existing approved $0/month Ironz organization project. Synthetic athlete-a/b/coach/admin only. No production/provider secrets or real athlete data copied.

PR42 schema applied successfully via managed migrations:

- source `20261110040029_versioned_training_workspace.sql`, staging ledger `20261110041036`, name versioned_training_workspace;
- additive source `20261110041921_fix_workspace_conflict_status.sql`, staging ledger `20261110041953`, name fix_workspace_conflict_status.

Real API caught PostgREST14 retrying a custom40001 application conflict; the additive fix returns PT409/HTTP409 promptly. Applied history was not edited. New local regression checks exact SQLSTATE. No active workspace requests remained afterward. Never deploy/replay only the first migration.

Actual candidate from engine `47a998b` stored/reloaded in staging;32 real Auth/Data API checks passed independently at workspace `f558a40`. Primary repeated 32 at workspace `72167d0` with freshly generated engine `8d1a84d` candidate. Includes account-token redirect rejection, stale/concurrent write rejection, retries, empty-candidate failure preserving old candidate, owner/coach/admin/anonymous privacy, private helper not exposed and unchanged server fingerprints of legacy trainingPlan/workoutSchedule/events for both athletes. Synthetic workspace event history intentionally retained. No active plan adopted. Reproduction: tests/staging/build-shadow-fixture.js and training-workspace.py on42, environment credentials remain owner-only. PR43 was NOT staged; don't call it covered by these 32 checks.

Post-migration security advisors introduced no new findings; broader pre-existing function/search-path/auth warnings remain open. This is not certification of all database security.

Hosted private app remains the earlier legacy candidate app `9316eb1`, hosted source `22a194523459b9dbe095c590eaf912966cb6f430`, deployment `appgdep_6af24f6e54d48191b73d85e3011ca091`. Its previous browser wizard/reload/failed-replacement evidence is retained in codex/verify-training-fixes:docs/staging/repair-verification-2026-11-09.md. Hosted outer owner reauthentication remained unverified. No new engine/history UI deployment or complete staged browser flow is certified. Provider AI/Strava/push/email/payment staging adapters remain disabled.

## Remaining work and holds

1. Resolve the pending long-run policy question, document its scope/evidence and test1/2/3/4-run weeks plus brick run legs. Preserve purpose; don't silently turn a designated long run into a shorter easy run. Finish/PR intent still does not differentiate actual target dose.
2. Establish a reviewed recent-completed/tolerated starting-load process, missing/zero/partial/interrupted history behavior and per-discipline growth. Current templates are not athlete tolerance; ceiling/cap arithmetic cannot supply it.
3. Build purpose-preserving sport-by-day allocation and explicit race execution prescriptions. Current incompatible templates fail visibly; no ordinary easy session should impersonate a race.
4. Finish effective restrictions and reported return status across every entry point. Held PR33 `d27a191` is NOT in current staging/engine branches; source restoration/historical display-only restrictions and actual staging remain unresolved. Do not copy its planned-history baseline or generic ramp into the new engine as measured tolerance/clearance. Elapsed time is not clearance.
5. Complete server-frozen observations/snapshot identity and trusted generation, then proposal-first daily/weekly coaching, uncertainty/risk explanations, remembered decisions, independent notification permissions/timezones and revision-safe adoption. Existing paused coach modules/draft spec are not implemented capabilities.
6. Resolve legacy stale-device sync, provider/security/native/offline gates; run full 30-case capability acceptance, staged browser/cohort and independent private comparison before any release or real athlete plan. Both comparator plans may have defects. No numerical clinical/return policy has been validated by these software checks.

All owned local preview/database services are stopped. Disposable Postgres remains installed only for tests; no persistent service enabled. No unfinished background script is required to retain this state. Continue from the exact branches above; refresh remote state first. Update this file and append SESSION_LOG.md at each substantial milestone and closeout.
