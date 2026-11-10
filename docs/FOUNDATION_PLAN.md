# IronZ foundation delivery plan

Status: proposed delivery order for owner review, 2026-11-10. This is the execution queue, not a new training-method specification or approval to deploy. Main was checked at `90e03bf`. Each implementation is a separate focused PR; the owner merges.

## Decisions and boundaries

- Keep the reviewed training method in the repo. The master plan spec remains authoritative, with the pipeline spec and output schema. A future typed rules artifact must be reviewed with those documents and the Rule Engine code, not become an independently edited second method.
- Freeze `philosophy_modules` for method development now. Preserve its current runtime behavior and fallback files while consumers still depend on them. No synchronization, reconciliation, new consumers or injury/recovery activation. An urgent security correction needs its own reviewed PR.
- The freeze is a repository operating rule, not a claim that database writes have been disabled. Any database write lockdown or eventual retirement is a separate tested change.
- Supabase will hold immutable published method releases. It is not another authoring surface, dynamic-code interpreter or plan engine.
- Planner work acts on explicit athlete and clinician inputs. Automatic readiness, calendar-aware off-day offers and seventh-day readiness switching remain draft-only. Do not implement from the unapproved coaching spec.
- Do not create the table, deploy a publishing job, switch engines or delete runtime data in this documentation PR.

## One queue with exit gates

| Order | Focused work | Required exit evidence |
|---|---|---|
| 0 | Close security S1–S6 below | Reviewed fixes, deployed-version evidence and synthetic isolation/authorization tests; rotation/history items have owner-confirmed closure. Repository merges alone do not close backend work. |
| 1 | Approve the method contract | One reviewed spec/rules package, stable rule IDs, applicability and precedence, explicit unknown inputs, safe-load and dated-restriction behavior, output contract, and numerical-policy review. This is the first method PR, not a reference to existing GitHub PR #1. |
| 2 | Add the method release registry and publisher | Separate schema/security PR, then publishing PR. Immutable versions, validated artifacts, release provenance, restricted writes, compatible activation and tested rollback. No production publication until the security gate is satisfied. |
| 3 | Adopt the Rule Engine as the only generator | Shadow/cohort comparisons, full-plan acceptance below, checked revision-safe persistence, staging/reload/device checks and live verification of the exact release. Route every build/edit/regenerate path through the same engine. Remove old entry points after the switch is proven. |
| 4 | Migrate Ask IronZ and remaining module consumers | Build versioned knowledge from the approved method and retrieve only the signed-in athlete's effective plan. Pass authorization/quota and grounded-answer tests. Retire `philosophy_modules` only in a later dedicated cleanup PR after all readers/writers/fallbacks are gone. |
| 5 | Finish athlete settings and server-owned state | Explicit unknowns and field provenance, owner-scoped structured storage, migration/backfill, conflict handling and cache-only local storage. A minimal revision-safe plan-save boundary is already a prerequisite for step 3; the full settings migration follows here. |
| 6 | Apple Health input, then adaptive coaching | Reliable ingestion, permissions, time/unit/duplicate handling and baseline coverage first. Reopen coaching separately after its spec and clinical/domain policy review. |

No parallel replacement engine or new foundation track. Existing narrowly scoped security and unsafe-prescription fixes can be reviewed as remediation; they do not authorize activation of unfinished architecture. Record any change to this queue here and in AGENTS.md if agent instructions change.

## Security baseline: read-only recheck on 2026-11-10

The November 9 review's statement that all six items are still open is historical, not the current baseline. This recheck inspected catalogs and deployed source without reading athlete rows, writing production data, sending notifications or invoking paid AI calls.

| Item | Evidence now | Closure still required |
|---|---|---|
| S1 privileged profile fields | PR #14 is merged; the enabled `profiles_guard_privileged` trigger is present in production. | Verify deployed definition against the reviewed migration and exercise normal-user/admin/trusted/bootstrap paths with synthetic security tests. Catalog presence alone is not a behavioral sign-off. |
| S2 cross-user profiles | The original unrestricted authenticated SELECT policy is absent. An assigned-coach full-profile policy remains. | Review that residual access against the current minimal-profile contract and paused-coaching scope; prove unrelated users cannot read personal fields. Do not label all profile access closed merely because `USING (true)` is gone. |
| S3 share-link profile exposure | The original shared-sender profile SELECT policy is absent. | Verify share/anonymous and minimal profile-card paths with synthetic users and deployed endpoints. |
| S4 committed credential | PR #16 is merged and removes the source value. | Owner-confirmed revocation/rotation and deployed replacement remain unverified. Never retrieve or republish the historic value as evidence. |
| S5 private records in history | Repository visibility is still public. | Decide and execute a reviewed privacy/history remediation. Making a repo private does not erase prior copies; history rewriting requires coordination and is not authorized by this plan. |
| S6 edge authorization/quota | Deployed `send-push` v17 and `notify-share` v17 accept recipient IDs without application-level caller/recipient authorization. Deployed `ask-ironz` v24 verifies its user but uses a read-then-write usage counter. | Add verified caller/relationship or trusted-scheduler authorization and atomic quota enforcement. Test spoofed recipients, invalid/shared-link ownership and concurrent quota requests in isolation, deploy, then verify. A gateway JWT flag alone is not authorization. |

`method_rules` does not exist in production as of this check; `philosophy_modules` still exists. No schema or runtime-table changes were made. These observations supersede stale rollout claims, not the original review's findings or historical record.

## Method release contract to specify before schema work

Proposed `method_rules` is an immutable release registry containing global method data, not athlete records. Its exact schema and read surface need their own reviewed PR.

- A release identifies the method version, artifact schema version, source commit, canonical content digest, immutable artifact payload/location, compatible engine version and publication provenance. The publication schema validates applicability, rule IDs and precedence. No downloaded JavaScript/SQL execution.
- Only approved method-package changes publish a new release after required checks. An unrelated merge must not silently change the method version. Repeated publication of the same digest is idempotent.
- Keep publishing separate from activation. Do not make a half-published bundle active. A failed publication leaves the prior compatible release active and surfaces failure; it does not mix old and new rules.
- Every new plan pins the exact method version/digest and engine version/source commit used. The same snapshot, seed and release must reproduce the prescription. Existing plans lacking provenance remain explicitly legacy/unversioned, not falsely backfilled with the newest version.
- Plan generation and Ask IronZ must read a consistent release identity. Reopening an old plan uses its pinned method for explanation; a newer active method does not silently rewrite it.
- One-step rollback is an acceptance requirement, not a current capability. An activation-pointer rollback is safe only when the artifact and installed engine/data contracts are compatible. A code change may also need a frontend/function revert. Rehearse the exact rollback before release.
- Enable RLS in the migration. Initially keep publication credentials server-side and direct client writes denied. Review the read policy for global method data explicitly; never copy a permissive policy onto athlete tables or expose a service key. Athlete settings, plans and history remain owner-scoped.
- No hand editing of published database versions. Corrections require a reviewed new release; revoked/unsafe releases need an explicit hold/revalidation process, preserving completed history and audit provenance.

## Coach review as acceptance evidence

The private coach review supplies problem reports and proposed policy. It is not executable configuration or independent clinical clearance. Keep real athlete records and exports out of this public repository. Use synthetic cohorts and compare the full saved/rendered/exported plan, not only the generator's labels.

Resolve conflicts in the method-contract review before turning coach examples into global rules:

- The coach describes race-week bricks positively, while the current master spec blocks bricks within 14 days of a race. The attachment cannot silently override that hard constraint.
- A coach example lists three quality sessions plus a CSS set while also calling for a three-session ceiling. Define whether each actual work block counts; do not exempt threshold swimming through a label.
- The attachment's return-to-training assumptions differ from the athlete's previously confirmed instructions. Confirmed athlete/clinician inputs control the plan; the review is not a new clearance.
- Personal peak-volume, race-time and future-fitness examples are not universal starting doses or promises. Generalize only reviewed policy and keep the personal records private.

Before adopting the Rule Engine, demonstrate:

1. One canonical positive duration and timed-step/rep arithmetic across saved workouts, calendar, hydration, completion and exports; invalid output cannot replace a valid plan.
2. Benchmark replacement, pending test, explicit clear, freshness and units are consistent. Race-distance targets use the pinned current benchmark; no generic zone falsely claims to be Ironman race pace. Running zones have no unintended gaps.
3. Quality budgets inspect actual work and demotions change it. Doubles/week boundaries cannot hide stress. Recovery cadence is separate from maximal testing.
4. Distance-specific long rides/runs/bricks/swims progress within completed-history load limits and athlete availability. Do not inflate work to a generic hour ceiling or declare a race goal feasible without supporting evidence.
5. Dated off periods remove the stated sports/exercises everywhere; reduced returns change the actual prescription. Person-entered restrictions and recorded return conditions override the template. Dates passing never establish clinical clearance.
6. Taper volume falls, race week is bounded and execution instructions include reviewed pacing/fueling limits. Saved rep counts and Sunday/week numbering agree across views.
7. Strength respects equipment, confirmed current lifts, role/phase and shared recovery; fueling respects practiced intake and its actual serving schedule. Unknown sweat/sodium/heat inputs remain unknown, with no invented personalized targets.
8. Edited plans, failed/offline saves, account switches and two-device conflicts preserve ownership and the last valid revision. The generated candidate and the plan actually reloaded from storage must match.

Acceptance of numerical coaching policy is separate from a software test pass. Automatic wearable readiness is outside this release gate and must not be smuggled into the planner.

## Existing work and the next PR

- PRs #48–#59 are focused repairs or shadow-engine building blocks from this investigation, not a combined foundation release. Their branch tests/integration checks do not prove they are deployed or that the whole plan meets this acceptance gate.
- The current main remains the live legacy planner; target-engine adoption is not enabled. Keep necessary live bug fixes thin and shared Rule Engine-owned modules authoritative. Do not start another generator.
- PR #34 contains broad brain/acceptance planning; reconcile its overlapping delivery scope with this queue rather than merge competing roadmaps unreviewed. PR #17 and its scope follow-up #58 remain coaching drafts.
- The immediate implementation work is the outstanding security closure, in separate PRs. The method spec/rules package follows. There is no dependency on receiving a personal athlete patch to establish this foundation order; any missing periodization/R14 patch is input to the later method review, not a reason to build another parallel path.
- The personal plan rebuild/save and coach export remain downstream of verified method/engine behavior. Keep previously confirmed off/return constraints; do not treat this architecture proposal as permission to change medical guidance.
