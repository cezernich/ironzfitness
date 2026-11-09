# Iron Z staging runbook

Staging is isolated from real athletes. Do not switch the app or CLI default project from production implicitly. All staging administration scripts pin the staging project reference rather than accepting arbitrary project input.

## Locations

- Private hosted app: https://ironz-staging.chase-zernich.chatgpt.site
- Supabase staging: `yhchfxjzxhinreklnxbi`; production remains `dagdpdcwqdlibxbitdgr`.
- Candidate branch: `codex/staging-environment`; draft PR 19. Component privacy correction: PR 18.
- Static host project: `appgprj_6af1feeafc008191abb0f79038aaa874`.
- The deployed source marker is `staging-build.json`. The initial deployed application candidate is `e5e2f6e041cab4e716928b4919fe22a19761d869`; later documentation/Auth configuration changes do not alter that deployed browser bundle.

The private host's outer ChatGPT sign-in returned an error during QA. Deployment itself succeeded. Until that access path is verified, do not count hosted authenticated browser QA as passing. The identical deployed files were tested locally against the actual staging backend.

## Test identities and credentials

There are four synthetic accounts: athlete-a, athlete-b, coach, and administrator, using the reserved `ironz-staging.example` email domain. No email is sent. A fifth disposable account is created and removed within the account-deletion test. Test identities have no real health or training records.

Set `IRONZ_STAGING_CREDENTIALS` to the owner-only local credentials JSON file. Its current task-local location is supplied privately in the session closeout, never in the public repo. The file includes only synthetic account passwords, not administrative keys. Administrative keys are read through the authenticated CLI into process memory. Never print or commit either kind of credential.

## Commands

```sh
npm test
npm run build:staging
python3 scripts/staging/configure-auth.py
python3 scripts/staging/seed-users.py
python3 scripts/staging/check.py
npm run release:check
```

The Python commands require an authenticated Supabase CLI and the private credentials path configured above. `seed-users.py` is for synthetic fixture creation; do not use it with real emails. `check.py` mutates synthetic fixtures, creates a disposable synthetic user for deletion testing, and verifies access through the actual Auth and Data APIs. Reports default to `/tmp/ironz-staging-api-results.json`; copy fresh results into `docs/staging/` when recording a verified checkpoint.

`release:check` intentionally exits unsuccessfully while any recorded release blocker remains. The `staging-release` GitHub Actions job is now required on main along with the existing `test` check. This is an explicit release hold, not a flaky test to bypass. Chase retains the merge decision after the evidence and independent reviews are complete.

## Database and service setup

`supabase/staging/schema-baseline.sql` is a schema-only capture of production public definitions, with its SHA-256 and counts in `baseline-metadata.json`. It is NOT a production migration and must never be applied there. It includes the original policies for parity; the secure-profile candidate and coach-privacy correction must follow it before users exercise the environment. Staging's managed migration ledger records the baseline and both candidates. No production rows, Auth users, cron jobs, provider credentials, or storage objects were copied.

Staging Auth uses the private preview origin and disables global self-service signup while preserving email/password login for admin-created accounts. Browser testing caught and corrected the distinction between disabling the provider and disabling registration.

The real self-account deletion function is deployed to staging. AI, Strava, push, and coach-request email entry points use explicit staging-only 503 adapters, require a valid JWT, and never call a live provider. Billing links and production Sentry are disabled in the staged browser bundle; a content-security policy restricts API connections to staging. No production background notification jobs run here.

External integrations therefore remain DISABLED/UNVERIFIED, not passed. Native iOS/HealthKit, Garmin authorization, payment lifecycle, real notifications, uploads, password email delivery, offline/multi-device conflict handling, and production load/restore testing still need dedicated scenarios before their corresponding features can be released.

## Session handoff

Read `SESSION_STATE.md` and `SESSION_LOG.md` before work. Refresh remote branches and review threads. Update state after significant milestones and about every 30 minutes in long sessions. Before ending, record tested/deployed revisions, migrations by environment, pass/fail/disabled results, review links, and the next action. Never infer deployment from a source commit or a green unit-test job.
