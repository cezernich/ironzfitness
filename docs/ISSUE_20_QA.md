# Issue 20: empty-plan correction and staging evidence

9 November 2026. PR: https://github.com/cezernich/ironzfitness/pull/25. Production is unchanged; no merge or release is authorized.

## Reproduction and existing work

Read the shared agent instructions, product direction, session state/log, issue 20 and refreshed Claude changes before implementation. Latest Claude PRs 21–24 concern authority mapping, archives and philosophy drift/snapshot guards; they do not fix this path. Existing `fix/audit-p0` already maps 5k/10k/century IDs correctly but still clears prior plans and reports success after empty generation. Reused only supported aliases, without its unsupported-distance substitutions or broad training changes.

The new regression fails on the original source (`5k !== fiveK`). Independent QA also reproduced original empty generation clearing both same-race trainingPlan and workoutSchedule.

## Behavior and review

The focused code at `1bb93f065f97d996dc6503c8f5442c8852371f59` normalizes supported new/historical IDs, validates actual dated training output, builds using temporary draft inputs, and preserves committed plan/race state on generation failure. Confirmation waits for one checked user_data batch upsert before displaying success. It guards duplicate clicks, older background writes and account transitions. Existing A-race demotion shares the final commit. Failed builds remain on preview with an accessible, persistent error and retry.

QA reviewed separately and added regressions for logout, account switching and an in-flight older-plan write. Its final comment review reports no remaining blocking findings in the changed path: https://github.com/cezernich/ironzfitness/pull/25#pullrequestreview-5832207687 . Claude review was requested on the PR and remains pending.

## Validation and exact scope

- Focused regression: passed, including canonical5K/10K/century, generation errors/empty/malformed/race-only/unsupported output, missing generator, frozen race/non-race paths, rejected backend write, cache write failure, double-click, historical saved IDs, account transitions and older-write ordering. Backend failures in this suite use a controlled fake API.
- Existing master-spec suite:22passed,0failed.
- Staging integration:20test files,0enforced failures,3existing quarantined behavior suites,171JavaScript syntax checks,0syntax errors. Pending PR12 supplies the npm-test runner; untouched main's placeholder command is not a passing test run. No quarantines were added.
- Actual staging backend: `yhchfxjzxhinreklnxbi`. Browser happy path on integration `fce4cf8`: synthetic athlete-b running/5K/2027-02-15/Finish/Structured Lead-In/10:30pace/four selected days. Saved84dated entries; server confirmed canonicalfiveK; calendar populated and persisted after reload. Later changes only deferred priority mutation, protected legacy callers and improved error display; the final regression suite rechecks success.
- Final browser failure scenario on integration `4c1b548`: attempt unsupported Ultra as replacement A-race. Stayed on preview, displayed the error, kept retry enabled and displayed no saved message. Server fingerprints for trainingPlan,workoutSchedule,events,raceEvents,buildPlanTemplate matched before/after exactly; previous84entries retained.
- Browser testing served the built staging artifact locally against real isolated Supabase. Hosted outer ChatGPT authentication is still unverified; do not claim hosted authenticated walkthrough passed.
- Final private preview deployment succeeded: `appgdep_6af22c0082f08191addc2da6d4dd4720`, saved version `appgprj_6af1feeafc008191abb0f79038aaa874~appgver_e18681ad0ee081919f7ac2c4cbc651a2`, hosted source `a0c76241e2b46d6095bac16f60861f2b75b3f5cc`. Staging build marker points to `4c1b548`. Existing owner-only audience preserved. URL: https://ironz-staging.chase-zernich.chatgpt.site . The existing private preview was published through the installed Sites plugin workflow; no IronZ production publication.
- No database migrations, policy changes or production writes this session. External providers remain disabled/unverified. Release check intentionally fails.

## New blocker and next steps

Issue26: https://github.com/cezernich/ironzfitness/issues/26 . Distribution adds sessions on excluded weekdays and strength sessions absent from the running-only preview. A nonempty plan is not proof that its prescription is ready for athletes. Compare existing audit constraints and add preview-versus-persisted availability checks in a separate focused change.

Obtain Claude's independent review, integrate the pending test-runner/setup dependency safely, rerun on the final reviewed integration, resolve issue26 and the existing release gates. Do not merge PR25 or release to production. Wider multi-device conflicts, legacy non-wizard background persistence, native flows and external integrations are not certified by this fix.
