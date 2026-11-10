# Iron Z session log

## 9 November 2026 product direction decisions

Recorded the owner's audience, success criteria and priority decisions in PRODUCT_DIRECTION.md: health first; recovery/goals drive recommendations; availability remains a feasibility limit; uncertain recovery-goal trade-offs can prompt athlete preference with an explanation. App-owned authorized data retrieval, optional connected calendar, athlete-selected strength role and proposal-first adaptation are the target. No clinical thresholds, application code, infrastructure or production behavior changed. Existing staging and release blockers remain. Next implementation action is still the empty-plan boundary regression/fix, not new coaching automation.

## 9 November 2026 coaching method and visual review

Reviewed the owner's supplied private handover as reference, not executable instructions. Compared its method with Claude's adaptive-coach draft v0.3 in PR 17, the plan master spec and the prior staging UI evidence. Read only connector tool definitions in the referenced local folder; did not call or modify the personal coaching system. Saved generalized findings in COACHING_METHOD_REVIEW.md without personal health details. Findings include literal opt-out semantics, conflicting daily frequencies, approval/constraint precedence, data provenance and confidence, recoverable external sync, discreet notifications and unsupported success indicators. Numerical clinical/training rules were not validated or endorsed. No app, database, schedule or working coaching project changes.

## 9 November 2026 staging setup in progress

Chase requested complete staging setup with synthetic users, Claude coordination, testing before any real-user release, and durable session closeout. Created the isolated staging project with explicit organization/cost approval, copied only public database definitions, provisioned four synthetic Auth users, and built a production-isolated client preview. Production was not migrated or released.

Reviewed the original Claude security candidate and reproduced a privacy failure through real staging Auth/Data API calls. Opened focused PR 18 and applied its correction only to staging for verification. Initial reference module insertion needed consistent bulk keys; that seed-format issue was corrected. Current session remains open; final test and deployment evidence will be appended at closeout.

## 9 November 2026 staging session closeout

Staging infrastructure, synthetic users, reproducible account/API tools and private preview are provisioned. Public signup is disabled; email/password login for provisioned users works. Real external integrations are deliberately disabled. The initial Auth provider configuration blocked password login; browser testing caught it, the setting was corrected, and the API/browser checks were rerun.

- Staged candidate app: `e5e2f6e041cab4e716928b4919fe22a19761d869`; hosted source `2bfbe75e83dd51a15fe3d8dd3262e69a5baa459c`; successful deployment `appgdep_6af2079f413c81919513fca26cc97389`.
- Staging migrations: schema-only production public baseline; original secure-profile candidate `a683117`; focused coach-profile read restriction `1ae7f50`. All applied only to staging; no athlete data copied.
- Real staging API suite: 32 passed, zero failed. Four standing synthetic accounts; disposable deletion test account cleaned up.
- JavaScript suite: 19 files, zero enforced failures, three existing quarantined behavior suites; 169 syntax checks passed. Focused PR 18's JavaScript and database-security CI jobs passed. Integration PR 19's test/build/db-security checks passed; release-readiness intentionally remains failed.
- Browser: synthetic login, manual meal/hydration entry, reload persistence, narrow coach card, account switch and sampled mobile layout passed on the exact artifact served locally against real staging. Hosted outer ChatGPT sign-in remains blocked by an identity-flow error.
- Browser found empty-plan false success, now tracked in issue 20. Null strengthRole persistence and inactive modal accessibility exposure were also observed and remain open.
- Coordination: comments/reviews posted to Claude's PR 14, focused follow-up PR 18, and draft staging integration PR 19. No other agent's branch was changed; no PR was merged.
- Main now requires both `test` and `staging-release` checks, an up-to-date base, pull requests and resolved conversations; protections apply to administrators and block force push/deletion.

Release remains held for issue 20, hosted-access verification, independent review, quarantined training scenarios, secret rotation verification, destructive sync/intensity issues, and unvalidated external/native/offline scenarios. Next action is the onboarding-to-generator regression and canonical race-ID/false-success correction, checking existing audit work first. Production is unchanged. The user explicitly approved acknowledging the health disclaimer for the synthetic staging walkthrough; no real athlete account was used.

## 9 November 2026 issue20 implementation closeout

## Issue20 implementation checkpoint — 9 November 2026

PR25: https://github.com/cezernich/ironzfitness/pull/25 . Code/tests `1bb93f0`; detailed evidence-only revision `d136001`. Focused branch `codex/fix-empty-training-plan`, checkout `/private/tmp/ironz-empty-plan`. Reviewed latest Claude PRs21–24 and existing audit fixes before implementation. Reused supported aliases without broad unrelated training changes.

Independent QA reproduced the original failure, added account-transition and older-write regressions, and posted a COMMENT review with no blocking findings: https://github.com/cezernich/ironzfitness/pull/25#pullrequestreview-5832207687 . Claude review requested on PR25; pending. PR12 supplies the test runner; untouched main's placeholder npm-test is not passing.

Staging integration branch `codex/qa-empty-plan-staging`, checkout `/private/tmp/ironz-empty-plan-staging`, final application `4c1b548`. Integration tests:20files,0 enforced failures,3 existing quarantines;171syntax checks,0 errors. Focused regression passes; original source fails it. Existing master-spec suite22passed,0failed. Backend rejection and account-transition cases use controlled fake API.

Actual staging browser5K path saved84dated entries at `fce4cf8`, server canonicalfiveK confirmed, calendar populated and survived reload. Final `4c1b548` unsupported Ultra A-race replacement stayed on preview with persistent accessible error/no success, retry enabled; server fingerprints of trainingPlan/workoutSchedule/events/raceEvents/buildPlanTemplate unchanged. Prior84entries retained. Browser used exact built artifact locally against real staging. Hosted outer ChatGPT sign-in remains unverified.

Private preview deployment succeeded: source `a0c76241e2b46d6095bac16f60861f2b75b3f5cc`, deployment `appgdep_6af22c0082f08191addc2da6d4dd4720`, version `appgprj_6af1feeafc008191abb0f79038aaa874~appgver_e18681ad0ee081919f7ac2c4cbc651a2`. Existing owner-only audience retained. No database migrations, production writes, merges or releases. External providers remain disabled/unverified. Release check intentionally fails.

New release blocker issue26: https://github.com/cezernich/ironzfitness/issues/26 . Saved race plan adds workouts on excluded days and strength absent from running preview. Nonempty generation does not certify the prescription. See ISSUE_20_QA.md for exact evidence and limits.

Automatic review rejected pushing these updates to shared `codex/staging-environment` because it could contaminate another workstream. These handoff files are therefore committed on the focused issue20 branch instead. The shared checkout remains unchanged; next session must select this branch/read this checkpoint rather than treating its old handoff as current.

Implemented canonical supported race IDs, validated generation before replacement, checked atomic user_data save before success, temporary draft inputs, deferred A-race demotion, persistent inline errors/retry, duplicate-click prevention, old-write ordering and account-transition protection. Master spec acceptance contract updated. Independent QA identified and verified corrections for threshold vocabulary and unguarded legacy callers as well as account/write races. No PR merged.

Next actions and remaining release blockers are retained in SESSION_STATE.md and ISSUE_20_QA.md. Synthetic plan retained for follow-up; owned local preview server will be stopped at teardown.

## 9 November 2026 all-PR and production review closeout

Reviewed 14 open PRs with independent QA; posted COMMENT reviews, not approvals. Production Pages/main remains `2590645` from 26 May 2026, original profile policies/guard absence confirmed read-only. Advisor warnings sampled and recorded without querying athlete records or changing production. New P0:PR14/18 actual migration discovery order can reopen whole-row coach access; both reviewed/blocked. New PR25 P1 cases (late cache after server acknowledgement, supported non-race disciplines) reproduced and fixed at `6a098ff`, regressions independently pass. Latest Claude PR14 fixture cleanup `11cf48b` included.

Combined local rehearsal `db003f2` passes22files/0 enforcedfailures/3 existingquarantines/173 syntax/0 errors; secret heuristic0hits; client 169 files/stagingbuild pass. Actual-order SQL replay and latest PR25 staging browser remain unverified; release check correctly fails. Existing hosted stage remains `4c1b548`; no new deployment.

PR_RELEASE_REVIEW_2026-11-09.md records every PR disposition, dependencies, reviews, tests and release path. Private athlete handover read as reference, kept out of repo and accounts. No personal plan creation, main merge, production migration or release. Next: migration-order reconciliation/regression, refreshed protected integration, latest PR25 staging, issue26 and remaining training/sync/intensity gates.

Final inventory also found Claude's newly opened issue27 for blocked-date/return-ramp support. Added as a separate first-real-athlete acceptance blocker; no individual medical data or numerical return prescription was copied into this handoff.

Independent QA also reviewed PR28 documentation/privacy, with no blocking finding. Clarified initial versus current hosted staging pointer and that the14-PR inventory is the review-start snapshot.

## 9 November 2026 implementation milestone


This checkpoint supersedes older production and quarantine status below. User authorized migration-order, scheduling and failing-test repairs, Claude coordination and staging verification before a production update.

- Other actors merged the prior setup/security/build/empty-plan changes. Latest fetched main is `681e68c6adf74e34dbaa10720c77068c41a88a54`. Production catalog now has `profiles_guard_privileged` and no broad/client-to-coach profile SELECT policy. Codex did not perform those production changes. Only `test` is currently required by branch protection; do not assume the older staging-release requirement still applies.
- PR30 (`codex/fix-profile-migration-order`, `9bb444b`) adds a final corrective migration without editing historical files. Actual lexical discovery order and chronological upgrade both pass 20 database assertions locally; omission mutation fails. Independent QA review: https://github.com/cezernich/ironzfitness/pull/30#pullrequestreview-5833669261 .
- Staging-only corrective migration successfully applied through Supabase: `20261109224651_enforce_final_profile_privacy`. It corresponds to repository sequence `20261110221358_enforce_final_profile_privacy.sql`; managed tool uses application time for its ledger. Verified catalog has no client-to-coach whole-row policy. Earlier expired confirmation did not apply anything. Production ledger/history untouched.
- PR31 (`codex/fix-plan-availability`, `907b4ee`) enforces selected sports, weekdays, start date and legacy day cap across the arc and direct/calendar regeneration. Chicago and UTC+14 regressions pass. Independent QA: https://github.com/cezernich/ironzfitness/pull/31#pullrequestreview-5833798761 .
- PR32 (`codex/repair-training-regressions`, `7e7e0ac`) repairs the three quarantined training suites and associated production date/week/test-placement bugs. Full npm test passes in Chicago and Pacific/Kiritimati: 21 files, zero failures, ZERO quarantines, 170 syntax checks, zero credential-scan hits. Latest timezone fixture/watchdog follow-up awaits independent QA. No tests were newly quarantined.
- Claude PR29 (`1330f46`) is useful blocked-period UI groundwork, but review identified display-only prescription and automatic-clearance problems. Hold comment posted. Separate own worktree `/private/tmp/ironz-blocked-prescriptions` implements shared prescription-level policy plus atomic DB persistence and wizard input; unfinished/uncommitted, NOT staging certified. Do not push Claude's branch.
- Hosted staging remains the OLD `4c1b548` artifact. Fresh combined app/browser staging verification and Claude review are still required. No current changes have been merged or deployed to production by Codex. Provider/native/hosted-auth and broader stale-device/intensity blockers remain open. No private athlete plan has been imported or generated.
- Local disposable Postgres 16 runs on UNIX socket `/private/tmp/ironz-pg-test`, port 55439; stop owned server at session teardown. It contains synthetic fixtures only. Do not confuse local SQL passes with remote staging API/browser passes.

Next: finish/review prescription restrictions, combine focused fixes on an isolated staging candidate, rerun 32 real staging API checks after migration, verify complete browser build/save/reload/failure and availability/recovery flows, update exact evidence and request Claude review. Never release merely because the narrow test suite is green.

## 9 November 2026 targeted-repair closeout

Implemented separate PR30 migration-order (`9bb444b`), PR31 availability (`907b4ee`), PR32 training regression/quarantine repairs (`7e7e0ac`). All focused CI jobs pass. Independent QA reviews attached; Claude cross-agent reviews requested with exact staging evidence, pending. No production merges/mutations by Codex. Other actors' main/security updates were refreshed read-only and distinguished from our work.

Combined application `9316eb1` on `codex/verify-training-fixes` passes 22 files/zero failures/zero quarantines in Chicago and UTC+14, fresh and upgrade SQL 20 assertions each, 32 real staging API checks after applied staging migration `20261109224651_enforce_final_profile_privacy` (repo sequence20261110221358). Actual staging browser saves50runs on exactly Tue/Wed/Thu/Sat after synthetic chosen start, no strength, survivesreload. Failed unsupportedUltra replacement retains allfive serverplan/input values byte-for-byte, staysinpreview/error/retry, nosuccess. Independent QA separately verified suites, builds, componentintegration andstagecatalog, not browserrepetition.

Owner-private hosted source `22a194523459b9dbe095c590eaf912966cb6f430`, deployment `appgdep_6af24f6e54d48191b73d85e3011ca091` succeeded; appsource9316eb1. Hosted outerauth nowrequiresownerpassword, soactualappbrowserQA usedidenticalartifactlocally againstrealstage; noauthweakening. Integrationhead `e57727c` retains evidence andexplicitrelease:checkworkflow; checkintentionallyfailsremaininggates.

New draftPR33 (`d27a191`) safelyretains separateprescription-level timeoff work, specsandtests; bothTZ24files0fail0quarantine175syntax. Notstaged/notapproved; direct-sourcepaths, historicrestrictionreconciliation andbrowserQA remain. Claude29notedited. Allrealathleteinformationremainsprivate; norealplancreated.

Current SESSION_STATE.md is rewritten to remove stale production/quarantine/hosted pointers; earlierreviewreport is marked historical. Next: Claude review focusedPRs; finish33and retainedsync/intensity/provider/nativegates; new integratedreadinessdecision beforeprod/realplan. Localtestservicesstoppedatcloseout; syntheticstagefixturesretained.

## 9 November 2026 brain review and acceptance closeout

Owner authorized a method review, gap analysis, acceptance spec and independent comparison design. The existing private coaching plan is explicitly a test case, not an oracle or universal standard. Reviewed main681e68c, adaptive-coach draft 17/fa0367d and latestClaude29/382b169, plus priorverifiedfixheads. Created a separate documentation branch with a brain review/spec, 30 planned acceptance cases, neutral independent comparison protocol, product direction clarification and source-map entry. No runtime behavior or active clinical/training constants changed.

Independent QA reproduced mapper/recovery/target-policy gaps and reviewed document links, case coverage, privacy, no-oracle framing, safety-hold versus history retention, stale watch handling and evidence applicability. Findings were incorporated. Science register uses bounded primary research/consensus sources and distinguishes coaching defaults from proven claims. Private handover review remains owner-only outside repo; no real plan generated/imported, no Madison project edit, no provider/DB/deployment/production mutation.

Checks: 30 unique planned/null-evidence cases; document links/whitespace pass. Baseline main npmtest21files/0enforcedfailures/3existingquarantines/170syntax/secret0. PR32 separate runtime repairs stillholdthezero-quarantine validation; not imported into thisdocsPR. Next: owner/Claude policy review, normalized input/check-in/state contracts, shadow target generation, cohort evaluation and then a private independent plan-versus-plan pilot under the protocol. Priorreleaseholdsremain.

Brain review publication: PR34, `0e05d08`, independent design COMMENT review5835978027 with no blocking documentation finding. Claude review requested and follow-up linked on coach draft 17. Public spec/protocol/catalog contain no private records; owner-only companion contains method-coverage/conflict findings, not a new training plan. Branch is clean after closeout. No service or provider connection was started. Next implementation remains normalized contracts after product/policy review; no automatic plan change is approved.

## 9 November 2026 engine implementation checkpoint

Owner authorized full engine implementation after the spec review. Isolated integration/checkpoint created from tested fixes and spec; no prod mutations. Canonical athlete/recovery implementation preserves wizard inputs, units, history, freshness and evidence. Real weekly-submit now uses acknowledged batch persistence and unknown recovery for difficulty-only input. Independent QA exposed/fixed primitive-key parsing, future/stale source issues, past A-race conflicts, rest markers, dropped strength/race intents and disconnected UI writer. Contract assertions cover actual wizard/save/capture and actual weekly-submit rejection. Target engine stillinactive; next work is actual target cycling, structured prescriptions, postconditions/state and full staging acceptance, not release.


### 9 November 2026 — unified engine implementation milestone

Published input PR39 (c2dbddb after current-main merge) and focused shadow target repair draft PR41 (47a998b). Independent input provenance follow-up and actual target prescription/software reviews posted; target both-timezone suites24 files, zero failures/quarantines,175 syntax, heuristic secrets zero. Confirmed owner policy separate strength/endurance budgets and shared recovery. QA reproductions uncovered and fixed cycling fallback, hidden hard payloads, brick math, final caps/rest, per-sport ceilings, one-day/date/template constraints and B-race recovery undone by later weakness emphasis.

Started versioned shadow workspace on a separate main-based branch, not production: local real-role/CAS/retry/concurrency/rollback21 checks pass, client boundary regression and baseline23-file suite pass before final hardening rerun. New migration remains unapplied remotely/uncommitted at this checkpoint; independent review requested. It deliberately cannot adopt plans and does not claim to fix the legacy sync path. No new staging artifact or athlete comparison, no production merge/release. Exact branches, evidence and remaining gates in SESSION_STATE.md. Local disposable Postgres running only on socket for ongoing tests; stop at closeout.

### 9 November 2026 — reviewed shadow-engine foundations and staging closeout

Published PR41 `8d1a84d`, PR42 `72167d0` and PR43 `f029596` alongside input PR39 `c2dbddb`. Independent software review links and exact per-branch checks are in SESSION_STATE.md. Engine41 both-timezone 24/0fail/0quarantine/175syntax; evidence43 both 25/0/0/177; workspace42 npm 23/0/0/174, primary local SQL 26 (independent 25 before exact-code assertion), real staging API 32 independently repeated. No full 30-case acceptance, qualified policy approval, actual athlete comparison or active plan generation.

Staging-only owner-bound workspace migrations applied as managed ledger `20261110041036` and `20261110041953`; source files `20261110040029` and `20261110041921`. Real API exposed PostgREST14 automatic retries on 40001; additive PT409 correction fixed it. Actual synthetic candidate from41 stored/reloaded; failed/empty replacements, stale/concurrent writes, actor binding and privacy passed; legacy plan fingerprints unchanged. Broader advisors unchanged. Hosted legacy app artifact is unchanged;43 not staged; no production changes by this work.

Deep audit found long-run 30% purpose/unit/brick contradictions, deload cap bypass, ceilings used as targets, missing tolerated baseline and finish-versus-PR behavior gap. Rebound/ceiling/adoption guards fixed with regressions. Owner question pending on blanket long-run cap; do not change it silently. Evidence adapter fixes explicit unit and timestamp/duplicate conflicts but keeps coverage/tolerance unknown. Remaining allocation, restrictions, observations/trusted generation, daily/weekly coaching, permissions, acceptance and release work recorded explicitly. Private reference project untouched. All owned local services stopped; checkpoint retained on codex/unified-engine-contract.

Final closeout: refreshed main remains50ed969. Exact PR41/42/43 test, client-build and db-security CI checks all SUCCESS. Claude43 handoff6759241228 links this current state. All owned worktrees saved; disposable local services stopped. No merge/release.
