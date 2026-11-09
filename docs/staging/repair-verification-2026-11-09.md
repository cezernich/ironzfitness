# Targeted repairs: staging verification, 9 November 2026

Application candidate: `9316eb1`, branch `codex/verify-training-fixes`, main base `681e68c`. Components: PR30 `9bb444b`, PR31 `907b4ee`, PR32 `7e7e0ac`. Integration conflict in session distribution resolved by preserving both local calendar serialization and availability checks. No production merge/deploy was performed by Codex.

## Passing checks

- Full tests in America/Chicago and Pacific/Kiritimati: 22 files, zero failures, zero quarantines. Source-only syntax check: 173 files, zero errors; secret heuristic: zero hits. A later Chicago run after staging packaging also checked duplicate built copies (317 files); zero errors. No tests were quarantined to obtain these results.
- Fresh lexical profile-migration replay and chronological upgrade: 20 SQL authorization assertions pass in each disposable local Postgres run. Omitting the final corrective DROP fails the privacy regression (independent mutation check in PR30 review).
- Staging correction applied: `20261109224651_enforce_final_profile_privacy`, corresponding to repo sequence `20261110221358_enforce_final_profile_privacy.sql`. Managed application-time alias is recorded, not repaired. Catalog confirms no client-to-coach whole-row policy. Existing production alias remains untouched; do not blindly replay the old base migration there.
- After correction, all 32 real staging Auth/Data API assertions pass, including privilege-edit denial, private-profile/workout isolation, narrow coach card, signup denial, disposable self-deletion and disabled adapter responses.
- Actual browser wizard against isolated staging saved a synthetic 5K plan with 50 running sessions. Backend inspection confirms every training date is Tue/Wed/Thu/Sat, none before selected 17 November synthetic start, and no added strength. Reloaded calendar shows four sessions in first scheduled week.
- Actual unsupported Ultra replacement stays in preview with persistent error and retry enabled. No success screen/message. Server fingerprints of trainingPlan, workoutSchedule, events, raceEvents and buildPlanTemplate are identical before/after. Prior plan retained.

## Deployment and limits

Identical browser-tested build was deployed owner-private at https://ironz-staging.chase-zernich.chatgpt.site . Application `9316eb1`; hosted source `22a194523459b9dbe095c590eaf912966cb6f430`; saved version `appgprj_6af1feeafc008191abb0f79038aaa874~appgver_96ee1487e54881918bab2856f306a85a`; deployment `appgdep_6af24f6e54d48191b73d85e3011ca091` succeeded.

Hosted outer authentication reaches the owner's OpenAI password screen. Owner reauthentication is required; no password was requested/entered and access controls were not weakened. App browser verification therefore used identical built files over localhost with the real staging backend, not an authenticated hosted-site walkthrough.

Each focused PR has an independent QA COMMENT review. Claude review was explicitly requested with this exact evidence on PR30/31/32; pending. The staging integration is retained for reproducibility, not a shortcut for merging component changes. PR29/issue27 return-to-training prescriptions, historical intensity restrictions, stale-device synchronization, source/provider secret-rotation verification, external-provider/native/offline scenarios remain separate unresolved release/real-plan gates. Disabled integration adapters are not end-to-end integration passes. No real athlete records or training plan were imported.
