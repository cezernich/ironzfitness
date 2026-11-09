# Pull-request and production release review

Reviewed 9 November 2026. Scope: all 14 open PRs, their dependency graph, current production deployment/catalog metadata, and the readiness of a combined candidate. No production changes or PR merges were performed. Personal athlete context was read privately and is not included here.

## Result

Production is current with main, not with the pending fixes. GitHub Pages reports successful deployment of `25906457b84210769aa2d2606fd7e5ed0ab5d9b7` on 26 May 2026, serving main/root at https://ironz.fit/ . The remote main revision is unchanged.

The deployment is not ready to advance. Required main checks are `test` and `staging-release`, strict/up-to-date, enforced for admins, with PR/conversation requirements and no force push. Most focused PRs lack the staging-release workflow; PR19 has it and correctly fails. No protection or failing gate was bypassed.

## Per-PR disposition

Every open PR now has a COMMENT review. These are findings, not approvals. Latest heads at review:

| PR | Head | Result / next action |
|---|---|---|
| [1](https://github.com/cezernich/ironzfitness/pull/1) | 938c298| Hold conflicting old root-file patch. Current js/calendar overflow sharing and share CSS supersede much of original fix; verify current UI then close/extract any still-needed history-layout change. |
| [12](https://github.com/cezernich/ironzfitness/pull/12) | 343a598| Foundation diff reviewed without new blocker. Test-runner/path fixes useful; three quarantines remain. Missing staging-release check prevents protected merge. Removing files does not purge old Git history. |
| [13](https://github.com/cezernich/ironzfitness/pull/13) | a74e1cd| Hold operational adoption until historical status points to current handoff. No new application behavior. |
| [14](https://github.com/cezernich/ironzfitness/pull/14) | 11cf48b| Blocked. Original client-to-coach whole-row profile policy remains; coordinate with18 and correct deployment order. Latest fixture-only cleanup was read and included in rehearsal. |
| [15](https://github.com/cezernich/ironzfitness/pull/15) | 02c47f6| Build/regression pass; packaging diff has no blocking finding. Standalone npm-test remains main placeholder until12. No release approval. |
| [16](https://github.com/cezernich/ironzfitness/pull/16) | e7a4cd1| Source-secret cleanup reviewed without blocker. Heuristic scan is limited; provider-side secret rotation remains unverified. |
| [17](https://github.com/cezernich/ironzfitness/pull/17) | fa0367d| Keep draft. Resolve opt-out/Rest automation and proposal-first precedence, daily-frequency conflict, missing-data versus Green, and discreet notification defaults before implementation. Numerical thresholds not clinically validated by this review. |
| [18](https://github.com/cezernich/ironzfitness/pull/18) | 1ae7f50| Blocked P0 by actual migration discovery order, despite passing manually ordered SQL test. Independent review below. |
| [19](https://github.com/cezernich/ironzfitness/pull/19) | aaee8cf| Hold stale integration. Duplicates components12/14/15/18, excludes25/16/newer docs, and readiness JSON omits26. Extract/rebase infrastructure; never merge as a shortcut around component reviews. |
| [21](https://github.com/cezernich/ironzfitness/pull/21) | 610ade6| Authority-map/reference test reviewed; no blocking implementation finding. Coaching remains draft; no DB sync authorized. |
| [22](https://github.com/cezernich/ironzfitness/pull/22) | b6f94b8|13 content-preserving archive moves reviewed; runtime source/fallback/golden files retained. Combined reference test passes. |
| [23](https://github.com/cezernich/ironzfitness/pull/23) | 8f76154| Revised read-only report reviewed. Withdrawn injury/recovery activation recommendation correctly remains withdrawn. |
| [24](https://github.com/cezernich/ironzfitness/pull/24) | 914d26a| Method-only snapshot and real-engine guard reviewed. All3file sets pass guard. Live full snapshot fingerprints were author's check, not independently re-exported by this review. |
| [25](https://github.com/cezernich/ironzfitness/pull/25) | 6a098ff| Two newly reproduced regressions corrected and independently retested. Needs fresh staging at new head and Claude/final-stack review before release; old hosted4c1b548 does not contain new corrections. |

## Blocking findings and corrections

**P0: security migration replay can reopen whole-row coach profile access.** CLI2.84.2 discovers migrations in filename order. `20261109174117_restrict_coach_profile_reads.sql` sorts before `20261109_secure_profiles.sql`. The latter then creates the policy removed by the former. The SQL test hardcodes base first then correction, so its passing result does not certify actual discovery order. A new normal same-day14digit timestamp still sorts before the8digit base filename. Reconcile filenames/applied history or use a genuinely later corrective sequence and test actual discovery order. Do not silently edit staging's applied history or apply these to production as-is. [Independent P0 review](https://github.com/cezernich/ironzfitness/pull/18#pullrequestreview-5832358870), [official CLI source](https://github.com/supabase/cli/blob/v2.84.2/pkg/migration/list.go).

**P1 corrected in25: cache failure after server acknowledgement.** Preflight alone could pass before a network wait; later quota failure left mixed local values with an accepted server plan. New recovery boundary restores the prior cache snapshot where possible, truthfully reports server save/reload required, and blocks stale same-key writes/retry until reload. Controlled late-quota regression passes. This does not certify all legacy/multi-device sync paths.

**P1 corrected in25: supported non-race sports rejected.** Strict session validation omitted HIIT,yoga,walking,rowing,circuit. Expanded recognized disciplines and regression-tested all 11 materialized sport-card outputs through the actual builder. Existing race/empty/frozen/account/write-order cases still pass. [Resolution review at6a098ff](https://github.com/cezernich/ironzfitness/pull/25#pullrequestreview-5832403064).

**Existing issue26 remains:** generated prescriptions add sessions on excluded days and disagree with preview. Nonempty generation is not an athlete-ready plan. Newly opened [issue27](https://github.com/cezernich/ironzfitness/issues/27) separately records missing blocked-date and return-to-training support. An excluded weekday is not the same as an explicitly blocked date interval. This is a blocker for the first real-athlete acceptance journey; ending a minimum rest interval must not silently clear clinician restrictions. Other retained blockers include three quarantined training suites, destructive stale-device sync, label-only intensity adjustments, unverified secret rotation and disabled/unverified external/native paths.

## Production database, read-only

Catalog metadata confirms the original authenticated profiles SELECT policy with qual=true is live, the share-sender whole-row policy remains, and the privilege-guard trigger is absent. Candidate profile RPCs/guard have not reached production. No athlete records were queried or copied.

Security advisor reports 8 mutable-search-path findings, 22anon-callable SECURITY DEFINER findings, 22signed-in-callable SECURITY DEFINER findings and disabled leaked-password protection. These are warnings requiring function-level review, not 22 proven exploits. A sampled backfill function is callable anonymously and changes profile display data without a caller guard; the outcome-report function is also anonymously executable and lacks an explicit caller predicate. Review/restrict administrative RPCs separately; do not claim the profile patch alone is a full database-security audit. [Supabase advisor remediation](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

## Tests and rehearsal provenance

Local isolated branch `codex/pr-release-review`, checkout `/private/tmp/ironz-pr-review`, final combined application `db003f2f1dc8cb375001e33d13778319634a6b15`.

Included12,14(latest fixture cleanup),15,16,18,19,21,22,23,24,25(new6a098ff). Excluded1(conflicting),13(historical docs),17(unapproved draft). This is a local rehearsal, not a release-bundle PR. It must not bypass focused review/merge dependencies.

- Combined `npm test`:22 files,0 enforced failures,3 existing quarantines,173 JS syntax checks,0 syntax errors; heuristic secret scan 0 hits.
- Client build:169 files; staging build succeeds with isolated backend configuration.
- Reference-path test:24 references,0 missing. Module guard: all 3 file sets pass.
- PR25focused regression and existing master-spec suite pass (master-spec 22 assertions).
- Independent QA exact-head runs:18passes17 files/3 quarantines/165 syntax;19passes19files/3quarantines/170 syntax and its release check intentionally fails;15build/regression pass. Existing GitHub DB-security check passes on latest14 and reviewed18 but misses discovery order. No local Postgres server test was claimed.
- PR25new6a098ff is not yet browser-tested/deployed in staging. Last hosted staging remains application4c1b548, sourcea0c76241e2b46d6095bac16f60861f2b75b3f5cc, deploymentappgdep_6af22c0082f08191addc2da6d4dd4720. Hosted outer identity remains unverified.
- No production migration, main merge, release, provider rotation, athlete-account import or training-plan creation this session.

## Path to a real-athlete plan

First resolve migration ordering and its regression, review privilege/admin RPC exposure, refresh staging infrastructure/readiness state, and validate the final combined candidate without bypassing checks. Resolve26plus remaining training/sync/intensity blockers before relying on generated prescriptions. Preserve explicit clinician restrictions, athlete-specific availability, correct threshold units/provenance, a measured return baseline, varied coherent progression, and proposal-first adaptation. Minimum rest duration must not be interpreted as medical clearance. Athlete records and decisions remain private and are not test fixtures or general rules for all users.
