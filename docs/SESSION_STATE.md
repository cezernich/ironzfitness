# Iron Z current session state

Updated 9 November 2026. Read this file, `AGENTS.md`, and the latest remote PRs before continuing. This is the current handoff; start with the Latest implementation checkpoint below; earlier checkpoints and PR_RELEASE_REVIEW_2026-11-09.md are historical. Earlier checkpoints are retained as history. Append completed session summaries to `SESSION_LOG.md`.


## Latest implementation checkpoint — 9 November 2026, staging correction

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

## Objective and release constraint

Finish isolated staging with synthetic users, test candidate fixes there, coordinate with Claude, and release nothing to real users until validation and independent review are complete. Chase authorized staging-only account creation and testing. Production data and provider secrets must not be copied into staging.

## Environments

- Production: `https://ironz.fit`, Supabase `dagdpdcwqdlibxbitdgr`. No production migration or application release has been performed by Codex.
- Staging: Supabase `yhchfxjzxhinreklnxbi` in the existing Ironz organization, us-east-2, approved at a $0/month project quote.
- Private preview: `https://ironz-staging.chase-zernich.chatgpt.site`, project `appgprj_6af1feeafc008191abb0f79038aaa874`. Latest hosted deployment `appgdep_6af22c0082f08191addc2da6d4dd4720` succeeded, owner-private, application `4c1b548`. The newer PR25 correction `6a098ff` is not in this hosted version. The outer ChatGPT sign-in returned an error during QA; do not count hosted authenticated access as passing.
- Staging has a schema-only copy of production public definitions: 48 tables, 29 original functions, 147 original policies. No athlete rows were copied. Reference philosophy modules come from the repository.
- Four synthetic Auth accounts exist: athlete-a, athlete-b, coach, administrator. Generated passwords live only in the owner-only local credentials file specified by `IRONZ_STAGING_CREDENTIALS`. Never commit credentials or tokens.

## Branch and review coordination

- `claude/agent-collab-setup`, PR 12: shared instructions/test runner; three behavior suites remain quarantined.
- `codex/review-handoff`, PR 13: original audit supplement and release workflow.
- `claude/secure-profiles`, draft PR 14: profile privilege guard, broad-read removal, narrow RPCs. Original candidate is `a683117`.
- `codex/repair-client-build`, PR 15: repaired client packaging, locally and remotely passing build check.
- `claude/remove-strava-secret`, PR 16: source cleanup/secret scan; source removal is not provider rotation.
- `codex/coach-profile-privacy`, PR 18: focused correction to the privacy hole in PR 14. Removes client-to-coach whole-row reads, uses narrow coach cards, adds negative SQL coverage.
- `codex/staging-environment`: integration candidate assembled from the setup branch, build repair, PR 14 candidate, and PR 18 fix. Do not merge it as a shortcut around independent review of its component changes.

## Verified findings and validation in progress

Live production catalog checks confirmed broad profile reads and editable privilege columns without a privilege-guard trigger. The managed migration ledger does not capture the many manual schema changes. Production remains unchanged.

The original security candidate passed 24 API checks and failed the coach-private-profile check. After PR 18's correction and an Auth-provider configuration correction, the final staging API suite passes 32 checks, including public-signup denial and disposable self-deletion. Both GitHub checks on PR 18 pass. The staging integration's client-build, db-security and test jobs pass, with three existing behavior suites explicitly quarantined. The required staging-release job intentionally fails because release blockers remain.

Browser QA used the identical deployed artifact locally against real staging after the outer hosted identity error. Sign-in, meal/hydration entry, reload persistence, narrow coach card and account-switch isolation passed. The 5K plan wizard reported success but saved zero sessions: release-blocking issue 20. See `docs/staging/browser-qa-2026-11-09.md` and `STAGING_RUNBOOK.md`.

Staging packaging substitutes only the isolated backend/public key, disables production Sentry and live Stripe links, adds a visible staging banner/noindex and restricts network connections to staging. Original production client configuration is unchanged. Provider credentials and background notification jobs must remain absent until separately configured for testing.

## Release blockers

- Complete the remaining browser/native/integration scenarios; sampled core flows and the failed race-plan scenario are recorded.
- Complete review/integration of staging-tested PR25, resolve issue26 scheduling discrepancy, and verify hosted ChatGPT sign-in access.
- Get Claude's independent review of Codex changes and address review findings.
- Resolve the three quarantined training behavior suites against the canonical spec; do not silently relabel them as passing.
- Verify Strava secret rotation with the provider; deleting the committed value alone is insufficient.
- Fix and regression-test destructive stale-device synchronization and misleading workout-intensity adjustments before relying on them with real athletes.
- Keep AI, wearable authorization, email, payments, and device push explicitly disabled/unverified until isolated credentials and provider test arrangements exist. Do not claim a disabled path is an end-to-end integration pass.

## Session closeout protocol

After each meaningful milestone, about every 30 minutes during long work, and before ending a session: update this state; append a dated entry to `SESSION_LOG.md`; record code revisions, migrations per environment, tests/pass/fail/disabled status, review links, and the next concrete action. Preserve unresolved issues. Read the files again next session and refresh remote state before assuming they are current. Store no credentials, real athlete records, or private health data here.

## Issue20 implementation checkpoint — 9 November 2026

PR25: https://github.com/cezernich/ironzfitness/pull/25 . Code/tests `1bb93f0`; detailed evidence-only revision `d136001`. Focused branch `codex/fix-empty-training-plan`, checkout `/private/tmp/ironz-empty-plan`. Reviewed latest Claude PRs21–24 and existing audit fixes before implementation. Reused supported aliases without broad unrelated training changes.

Independent QA reproduced the original failure, added account-transition and older-write regressions, and posted a COMMENT review with no blocking findings: https://github.com/cezernich/ironzfitness/pull/25#pullrequestreview-5832207687 . Claude review requested on PR25; pending. PR12 supplies the test runner; untouched main's placeholder npm-test is not passing.

Staging integration branch `codex/qa-empty-plan-staging`, checkout `/private/tmp/ironz-empty-plan-staging`, final application `4c1b548`. Integration tests:20files,0 enforced failures,3 existing quarantines;171syntax checks,0 errors. Focused regression passes; original source fails it. Existing master-spec suite22passed,0failed. Backend rejection and account-transition cases use controlled fake API.

Actual staging browser5K path saved84dated entries at `fce4cf8`, server canonicalfiveK confirmed, calendar populated and survived reload. Final `4c1b548` unsupported Ultra A-race replacement stayed on preview with persistent accessible error/no success, retry enabled; server fingerprints of trainingPlan/workoutSchedule/events/raceEvents/buildPlanTemplate unchanged. Prior84entries retained. Browser used exact built artifact locally against real staging. Hosted outer ChatGPT sign-in remains unverified.

Private preview deployment succeeded: source `a0c76241e2b46d6095bac16f60861f2b75b3f5cc`, deployment `appgdep_6af22c0082f08191addc2da6d4dd4720`, version `appgprj_6af1feeafc008191abb0f79038aaa874~appgver_e18681ad0ee081919f7ac2c4cbc651a2`. Existing owner-only audience retained. No database migrations, production writes, merges or releases. External providers remain disabled/unverified. Release check intentionally fails.

New release blocker issue26: https://github.com/cezernich/ironzfitness/issues/26 . Saved race plan adds workouts on excluded days and strength absent from running preview. Nonempty generation does not certify the prescription. See ISSUE_20_QA.md for exact evidence and limits.

Automatic review rejected pushing these updates to shared `codex/staging-environment` because it could contaminate another workstream. These handoff files are therefore committed on the focused issue20 branch instead. The shared checkout remains unchanged; next session must select this branch/read this checkpoint rather than treating its old handoff as current.

## Full PR/release review checkpoint, 9 November 2026

All 14 PRs open at review start reviewed at recorded heads; see PR_RELEASE_REVIEW_2026-11-09.md for per-PR results and links. Production still main `2590645`, deployed 26 May 2026. Broad profile read/unguarded privilege surface remains live; no production data or configuration changed.

Independent QA found P0 migration ordering:18's 14-digit filename sorts before14's 8-digit filename, allowing base migration to recreate coach whole-row access. Passing manually ordered SQL CI does not cover it. Both PRs now have blocking COMMENT findings. Do not deploy this stack until discovery order/applied history are reconciled and tested.

PR25 new code `6a098ff` corrects two review regressions: late post-ack cache failure and missing supported non-race disciplines. Regression passes all 11 materialized sports, late-quota recovery and prior cases; independent resolution review posted. This supersedes the earlier no-blocker finding at `1bb93f0`. New head still needs staging/browser+Claude review. Hosted staging remains `4c1b548` and must not be described as containing `6a098ff`.

Combined local review rehearsal `db003f2` at `/private/tmp/ironz-pr-review`:22 test files,0 enforced failures,3 existing quarantines,173 syntax checks,0 errors,heuristic secret scan 0 hits; client 169 files/staging build pass. Readiness gate remains failing. No bundle was pushed as a shortcut around component review; isolated branch contains only rehearsal merges. Latest Claude PR14 fixture cleanup `11cf48b` read/included; no security-policy correction in that change.

Claude opened issue27 during review: blocked date intervals and return-to-training constraints are not represented by the current plan path. Retain it alongside26 as a real-athlete plan blocker; a minimum rest interval is not clearance.

User supplied private athlete context for the next app-use step. It was read privately and never copied into public repo, production account or synthetic fixtures. No personal training plan was created. General acceptance requirements are in the review report; private health details remain outside it.

## Next concrete action

Resolve PR14/18 migration-order P0 and verify actual replay order. Refresh stale PR19 infrastructure/readiness without duplicating component PRs; review/install the final stack through protected checks. Stage/browser-test PR25 at `6a098ff`, resolve issue26 availability mismatch and retained training/sync/intensity gates, then assess real-athlete plan creation. Keep physician restrictions as hard constraints and distinguish minimum time off from clearance. Do not bypass main protection or call disabled integrations passing.

Independent QA documentation/privacy review on PR28: https://github.com/cezernich/ironzfitness/pull/28#pullrequestreview-5832464189 . No blocking documentation/privacy findings; historical/current staging pointer clarified afterward.
