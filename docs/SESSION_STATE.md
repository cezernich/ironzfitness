# Iron Z current session state

Updated 9 November 2026. This file supersedes older checkpoints. Read AGENTS.md, PRODUCT_DIRECTION.md (where present), this file and remote PR changes before continuing. History is retained in SESSION_LOG.md. Credentials and real athlete information stay outside this public repository.

## Current implementation checkpoint — 9 November, late session

Owner decision: strength and endurance quality have separate session budgets, with shared fatigue and spacing checks. Recorded in the target master section6d and product direction on the repair worktree.

Refreshed main: `50ed969` (PR30/32 merged by other actors). PR36 Claude availability is `a3c47f3`; PR38 goal-preservation and PR40 triathlon picker are separate ongoing changes. Do not duplicate or push their branches.

- Input PR39: `c2dbddb`, `codex/normalize-athlete-inputs`, checkout `/private/tmp/ironz-athlete-input-pr`. Latest input logic `5c871e6` independently reviewed at https://github.com/cezernich/ironzfitness/pull/39#pullrequestreview-5836504639 ; c2 only merges current main and preserves the module-guarded watchdog. Old review counts with three quarantines predate the main merge.
- Draft target repair PR41: `47a998b`, `codex/final-engine-prescriptions`, checkout `/private/tmp/ironz-final-prescriptions`, stacked on PR39. Repairs final executable workout bodies, cycling, per-sport ceilings, deterministic exercise choices, unknown nutrition, true rest/load caps, shared strength/endurance recovery, explicit dates/partial first weeks, unavailable days/sports and overlapping B-race protections after weakness emphasis. Independent review https://github.com/cezernich/ironzfitness/pull/41#pullrequestreview-5836585924 . Both timezones pass 24 files, zero failures/quarantines, 175 syntax checks, zero heuristic secret hits. Software QA only; no qualified training-policy approval or full acceptance execution.
- Versioned workspace WIP: `/private/tmp/ironz-training-state`, `codex/versioned-training-state`, based main50ed969. New CLI-created migration `20261110040029_versioned_training_workspace.sql`, owner-only read tables/private command helper/public invoker, CAS and idempotent immutable events; DB wrapper does not write cache. Local Postgres 21 role/concurrency/rollback checks pass; client test and full baseline npm23 files pass. Latest account-switch hardening still requires final rerun/review. Not committed/published/applied remotely at this checkpoint. Workspace is shadow-only, does not replace approved plans and does NOT fix the old user_data sync path.

No new engine/workspace staging deployment or production mutation. Last verified hosted artifact remains app9316eb1 with the limitations below; its evidence cannot certify these new candidates. Real athlete comparison and actual training-plan creation remain NOT RUN. Target adoption is disabled. Remaining template allocation, race execution, recent tolerated baseline/feasibility, effective restrictions, adaptive decisions/permissions/memory and full acceptance/staging gates are listed in PR41 progress documentation.

Next: finish independent workspace QA, add security CI and verify a reviewed migration in isolated staging; establish frozen server-input/shadow persistence and repair the remaining target allocation/feasibility/restriction gates before any adoption. Claude cross-agent review remains required. Disposable local Postgres is currently running at socket `/private/tmp/ironz-pg-test`, port55439, no TCP; stop at closeout. Check active worktrees before continuing; earlier integration notes below are historical, not the current active source.

## Unified engine implementation in progress

The owner now explicitly authorized implementing the reviewed brain plan in full and routine engineering decisions; ask only when a material philosophy question needs owner input. This supersedes the prior documentation-only implementation scope, not the production release hold. Active checkout `/private/tmp/ironz-engine-contract`, branch `codex/unified-engine-contract`, based on verified integration e57727c plus brain spec e3dcdb5. No production merge/release or real plan generation.

First change: canonical athlete inputs/recovery, real wizard input preservation, dated source selection and actual weekly-form acknowledged persistence. Current source tests pass; independent QA is checking the latest repairs. See `docs/brain-review/IMPLEMENTATION_PROGRESS.md`. Full 30-case acceptance is not executed and the target engine remains inactive. Next: publish a focused input-contract PR, repair actual target prescriptions/validation/cohort failures, establish revision-safe state, shadow evaluate, add proposed daily/weekly decisions and then stage complete flows. Keep recording milestones without treating the first slice as full completion.

## Brain review and acceptance milestone

Review PR: https://github.com/cezernich/ironzfitness/pull/34 . Specification revision `0e05d08`; independent design review: https://github.com/cezernich/ironzfitness/pull/34#pullrequestreview-5835978027 . No blocking documentation finding; review is not runtime/clinical/release approval. Claude review requested in PR34 and coordinated on PR17. Closeout-only revisions do not change the reviewed brain method.

Current task: the owner requested the brain review, method gap analysis and acceptance/consolidation plan. The existing private coaching plan is one comparator, not a gold standard. Active branch `codex/brain-review-acceptance`, checkout `/private/tmp/ironz-brain-review`, base main `681e68c`.

Deliverables: `docs/brain-review/BRAIN_REVIEW_AND_ACCEPTANCE_SPEC.md`, `PLAN_COMPARISON_PROTOCOL.md`, `ACCEPTANCE_CASES.json` (30 planned, NOT executed implementation cases), and clarified `docs/PRODUCT_DIRECTION.md`. Private method/coverage findings are saved owner-only outside the repository; no personal records or actual plan comparison are in this public PR. The Madison project is untouched.

Independent QA checked source claims and the design. Confirmed target activation blockers include goal/experience/strength-role/input losses, unknown-to-good recovery, incompatible input enums and target/master progression mismatch. Documents require shadow generation, actual structured-prescription validation, proposal-first permissions, revision-safe state and independent comparison of both plans. Neither plan is treated as ground truth. No numerical clinical policy is validated or activated.

Document validation: 30 unique sequential scenario IDs, all planned/null evidence; relative links resolve; diff whitespace check passes. Required baseline npm check: 21 files, zero enforced failures, THREE existing quarantines, 170 syntax checks and zero heuristic secret hits. This documentation branch does not include PR32's runtime repairs; its baseline results must not be called a new zero-quarantine runtime pass. Prior separately verified integrated candidate below remains distinct.

Latest Claude29 is `382b169`, now described as calendar groundwork with prescription work in33. No source code, database, staging deployment, production release, provider authorization or real plan generation changed in this task. First implementation after policy review: normalize/preserve athlete inputs and check-ins, then contract/state work and target-engine shadow comparison. Independent full plan-versus-plan evaluation remains NOT RUN. Cross-agent Claude PR review and existing production holds remain required.

## Prior implementation outcome

The user's requested migration-order, availability scheduling and test repairs are implemented in separate PRs and verified as a combined staging candidate. No production release/merge was performed by Codex. Claude independent review is requested and still pending; do not mark production approved or create the real athlete plan yet.

- PR30: https://github.com/cezernich/ironzfitness/pull/30 , `9bb444b`, `codex/fix-profile-migration-order`. New final corrective migration; historical files unchanged. Fresh actual lexical replay and chronological upgrade each pass 20 SQL checks. Independent review: https://github.com/cezernich/ironzfitness/pull/30#pullrequestreview-5833669261 .
- PR31: https://github.com/cezernich/ironzfitness/pull/31 , `907b4ee`, `codex/fix-plan-availability`. Explicit days, sports, start date and legacy day cap hold across generator/arc entry points. Independent review: https://github.com/cezernich/ironzfitness/pull/31#pullrequestreview-5833798761 .
- PR32: https://github.com/cezernich/ironzfitness/pull/32 , `7e7e0ac`, `codex/repair-training-regressions`. Three quarantines repaired and removed; production week-zero, calendar-date and actual threshold-test date bugs corrected. Full suites pass in Chicago and Pacific/Kiritimati: 21 files, ZERO failures/quarantines, 170 syntax checks. Latest review resolves prior timezone finding: https://github.com/cezernich/ironzfitness/pull/32#pullrequestreview-5833977750 . All three PRs have passing test/client-build/db-security CI.

## Exact staging evidence

Combined app `9316eb1`, main base `681e68c6adf74e34dbaa10720c77068c41a88a54`, branch `codex/verify-training-fixes`, checkout `/private/tmp/ironz-verified-staging`. Branch now `e57727c` adds evidence and an explicit held release-readiness workflow only; deployed app files remain the tested `9316eb1` build. Do not merge this integration as a shortcut around component review.

Both timezone full suites pass: 22 files, ZERO failures/quarantines. Source-only syntax 173 files; after packaging, the runner also scans 144 generated copies (317 total), zero errors. Secret heuristic zero hits. Independent QA verified component ancestry, conflict resolution, both suites, fresh SQL/upgrade, builds and read-only staging catalog. Browser/API results below were performed by the primary agent; the QA agent did not independently repeat the browser.

- Isolated Supabase: `yhchfxjzxhinreklnxbi`, existing Ironz org, approved $0/month project. Synthetic accounts only (athlete-a, athlete-b, coach, admin); no production athlete rows/provider secrets copied.
- Applied staging-only migration `20261109224651_enforce_final_profile_privacy`; repository sequence `20261110221358_enforce_final_profile_privacy.sql`. Managed tool uses application-time ledger alias. Earlier expired confirmation applied nothing. Catalog confirms client-to-coach whole-row policy absent. All 32 real staging Auth/Data API assertions pass after correction.
- Actual browser wizard against real staging saves 50 running sessions: Tue/Wed/Thu/Sat only, none before synthetic chosen Nov17 start, no injected strength. Reloaded calendar retains four sessions in first scheduled week. Unsupported Ultra replacement stays in preview with persistent error/retry and no success. Server fingerprints of all five plan/input keys are unchanged; previous plan retained.
- Private staging https://ironz-staging.chase-zernich.chatgpt.site deployed successfully. Hosted source `22a194523459b9dbe095c590eaf912966cb6f430`; version `appgprj_6af1feeafc008191abb0f79038aaa874~appgver_96ee1487e54881918bab2856f306a85a`; deployment `appgdep_6af24f6e54d48191b73d85e3011ca091`.
- Hosted outer ChatGPT authentication requires owner password reauthentication. No password requested/entered and no access weakening. Browser app QA used the identical built artifact locally with the real staging backend. Hosted authenticated app access is NOT certified.
- `npm run release:check` now exists on integration and intentionally fails for the remaining gates. This is a deliberate release hold, not a passing release check. Main protection currently requires only `test`; the older assumption that staging-release is required is stale. Owner must not interpret that single green check as release clearance.

Full evidence: `codex/verify-training-fixes:docs/staging/repair-verification-2026-11-09.md`. Claude requests and evidence posted on PR30/31/32 comments 6753763198 / 6753763472 / 6753763780 respectively.

## Separate held recovery work

Claude PR29 at `1330f46` supplies blocked-period UI groundwork. Review found display-only prescriptions and automatic return assumptions. Codex did not edit/push Claude's branch.

Draft PR33: https://github.com/cezernich/ironzfitness/pull/33 , `d27a191`, `codex/fix-blocked-plan-prescriptions`, checkout `/private/tmp/ironz-blocked-prescriptions`. Shared prescription policy, explicit pending/easy/full athlete-reported return status, wizard input and atomic DB save/source reconciliation. Both timezone suites pass 24 files, zero failures/quarantines, 175 syntax checks. Tests cover source edits/deletions, repeated edits, save failure, actual easy payloads, no fabricated strength and truthful paused copy. Earlier QA findings received corrections, but final review/complete staging is NOT done. This draft is NOT in the hosted or verified staging candidate.

Before PR33 ready: verify/fix source restoration across direct race save/edit/self-heal; migrate/reconcile historical display-only restrictions; stage calendar/wizard save/reload/status-edit/backend-failure/no-baseline/race-overlap scenarios; review procedure-specific limits. Planned volume is not measured fitness or medical clearance. Do not use elapsed time or a minimum rest week as clearance. No private athlete plan has been imported/generated.

## Production and remaining gates

Production: https://ironz.fit , Supabase `dagdpdcwqdlibxbitdgr`. Other actors merged prior setup/security/build/empty-plan PRs. Latest fetched main `681e68c`. Read-only catalog now confirms profile privilege guard present and broad/client-to-coach reads absent; production managed security alias `20261109205427` name `20261109_secure_profiles`. Codex made no production mutations. Do not blindly replay historical base migrations or repair production ledger history.

Still held: Claude cross-agent review; issue27/recovery prescription draft; destructive stale-device synchronization and historical label-only intensity restrictions; provider secret-rotation verification; hosted owner authentication and native/offline/provider scenarios. AI/wearable/email/push/payment staging adapters remain disabled and explicitly unverified. Wider RPC/search-path/password advisor warnings remain outside the narrow profile repair; no claim of complete database security.

## Next actions and continuity

1. Claude reviews exact PR30/31/32 heads and the combined evidence, and resolves findings before Chase merges. Refresh main/PR state first; other actors may update it.
2. Complete independent review and remaining implementation/real staging QA of draft PR33, keeping it separate from the already verified three-fix candidate.
3. Resolve the retained sync/intensity/provider/native gates, verify owner-private hosted access, then record a new exact integrated release candidate and explicit readiness decision. Do not release on an old snapshot.
4. Only after those gates, use the real athlete account and private handover to build/review the athlete-specific plan. Keep private health data out of public fixtures/docs.

After each milestone (~30 minutes on long work) and before ending, refresh this state, append dated results/next steps to SESSION_LOG.md, record exact heads/migrations/limits, and stop owned local services. Synthetic staging data is retained for reproducible QA. Temporary local preview/Postgres services are stopped at closeout; no persistent database service was installed/enabled.
