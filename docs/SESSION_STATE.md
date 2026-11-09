# Iron Z current session state

Updated 9 November 2026. This file supersedes older checkpoints. Read AGENTS.md, PRODUCT_DIRECTION.md (where present), this file and remote PR changes before continuing. History is retained in SESSION_LOG.md. Credentials and real athlete information stay outside this public repository.

## Current outcome

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
