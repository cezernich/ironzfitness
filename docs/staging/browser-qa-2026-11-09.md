# Staging browser validation 9 November 2026

Candidate: `e5e2f6e041cab4e716928b4919fe22a19761d869`. Sites source commit: `2bfbe75e83dd51a15fe3d8dd3262e69a5baa459c`. Deployment: `appgdep_6af2079f413c81919513fca26cc97389`, succeeded and owner-private. All account/data checks used the isolated staging project and synthetic accounts.

The hosted outer ChatGPT sign-in returned an error. App walkthroughs therefore used the identical deployed `www-staging` files served locally, connected to real Supabase staging. This proves those app flows against staging; it does not clear hosted identity access or certify every feature.

A final check in the existing personal browser reached account selection, then the browser automation connection timed out before access could be verified. Hosted authenticated access remains blocked/unverified; no access controls were weakened to work around it.

| Scenario | Result | Evidence |
| --- | --- | --- |
| Private site deployment | PASS | Native deployment succeeded; owner-private access retained |
| Hosted outer ChatGPT sign-in | BLOCKED | Selecting the existing owner account returned an OpenAI sign-in error |
| Synthetic athlete password login | PASS | App dashboard showed Synthetic Athlete-A; initial provider configuration error corrected and retested |
| Public self-service registration | PASS denial | Real Auth API rejects signup while provisioned password login works |
| Manual meal logging | PASS | Synthetic QA Meal, 210 calories/10g protein/20g carbs/10g fat displayed after save |
| Hydration logging | PASS | One 12oz entry updated the display and ring |
| Reload persistence | PASS | Meal and 12oz hydration entry remained after browser reload |
| Narrow coach display card | PASS | Profile displayed Synthetic Coach using the RPC after full-row access was removed |
| Sign-out and account switch | PASS | Athlete-B dashboard showed its own identity, zero nutrition/hydration, and none of Athlete-A's meal data |
| Running race plan wizard | FAIL | 5K/Finish/Structured Lead-In/four-day setup previewed and reported saved, but trainingPlan persisted as [] and calendar stayed all rest |
| Mobile layout | PASS sampled layout | At 390×844, document content width was 390; navigation and day carousel rendered; this is a layout sample, not native-device certification |
| AI, wearable, payment, email and push integrations | DISABLED | No live provider credentials or charges; explicit 503 adapters and staged link/network restrictions |
| Native device, offline conflicts, file import, load/restore | NOT COMPLETED | Dedicated validation remains required |

The failed race scenario is tracked in [issue 20](https://github.com/cezernich/ironzfitness/issues/20). Onboarding supplies type `5k`; the inspected generator indexes configurations keyed by `fiveK` and returns an empty array for unknown keys. UI success must be conditional on actual validated generation/persistence, and any previous plan must survive a failed replacement. Check existing `fix/audit-p0` work before duplicating a fix.

Other observed warning: a null `strengthRole` write violates `user_data.data_value` NOT NULL. This should be handled explicitly at the persistence boundary rather than silently warning. Inactive modal controls also remain in the accessibility tree and need focus/visibility review.

API validation is recorded separately in `api-results-2026-11-09.json`: 32 passed, zero failed after the privacy/Auth corrections. Existing unit-test quarantine and the browser failure remain release blockers. No production migration, application release, real athlete record, or live provider action occurred.
