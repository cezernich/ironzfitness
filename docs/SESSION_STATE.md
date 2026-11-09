# Iron Z current session state

Updated 9 November 2026. Read this file, `AGENTS.md`, and the latest remote PRs before continuing. This is the current handoff; append completed session summaries to `SESSION_LOG.md`.

## Objective and release constraint

Finish isolated staging with synthetic users, test candidate fixes there, coordinate with Claude, and release nothing to real users until validation and independent review are complete. Chase authorized staging-only account creation and testing. Production data and provider secrets must not be copied into staging.

## Environments

- Production: `https://ironz.fit`, Supabase `dagdpdcwqdlibxbitdgr`. No production migration or application release has been performed by Codex.
- Staging: Supabase `yhchfxjzxhinreklnxbi` in the existing Ironz organization, us-east-2, approved at a $0/month project quote.
- Private preview registration: `appgprj_6af1feeafc008191abb0f79038aaa874`, expected origin `https://ironz-staging.chase-zernich.chatgpt.site`. Registration is not publication; verify deployment status before reporting it live.
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

The first real staging API run against the original security candidate passed 24 checks and failed the assigned-athlete-to-coach private-profile check. This reproduced the review finding through real Auth/PostgREST. The focused correction is now applied only to staging and is being retested. The initial reference seed formatting error was corrected by normalizing optional keys for PostgREST bulk insertion.

Staging packaging substitutes only the isolated backend/public key, disables production Sentry and live Stripe links, adds a visible staging banner/noindex and restricts network connections to staging. Original production client configuration is unchanged. Provider credentials and background notification jobs must remain absent until separately configured for testing.

## Release blockers

- Complete staging browser QA and record the exact candidate/deployment and results.
- Get Claude's independent review of Codex changes and address review findings.
- Resolve the three quarantined training behavior suites against the canonical spec; do not silently relabel them as passing.
- Verify Strava secret rotation with the provider; deleting the committed value alone is insufficient.
- Fix and regression-test destructive stale-device synchronization and misleading workout-intensity adjustments before relying on them with real athletes.
- Keep AI, wearable authorization, email, payments, and device push explicitly disabled/unverified until isolated credentials and provider test arrangements exist. Do not claim a disabled path is an end-to-end integration pass.

## Session closeout protocol

After each meaningful milestone, about every 30 minutes during long work, and before ending a session: update this state; append a dated entry to `SESSION_LOG.md`; record code revisions, migrations per environment, tests/pass/fail/disabled status, review links, and the next concrete action. Preserve unresolved issues. Read the files again next session and refresh remote state before assuming they are current. Store no credentials, real athlete records, or private health data here.
