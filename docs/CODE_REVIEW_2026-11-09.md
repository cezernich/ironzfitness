# IronZ Code Review (2026-11-09)

Reviewed: `cezernich/ironzfitness` at commit `2590645` (last push May 26, 2026). About 114k lines of JS, 147 script tags, Supabase backend with 20 edge functions, Capacitor iOS shell.

## 1. How the app actually works today

| Layer | What it is | Notes |
|---|---|---|
| Frontend | Vanilla JS, no bundler, 147 `<script>` tags loaded in order into one global namespace | `index.html` 296 KB, `style.css` 591 KB, `calendar.js` 11.4k lines, `planner.js` 6.5k lines |
| Hosting | GitHub Pages (`CNAME` = ironz.fit, `.nojekyll`) from a **public** repo | Every push to main is a production deploy |
| iOS app | Capacitor shell with `server.url = https://ironz.fit` | The App Store app is a remote website wrapper. No offline mode; a bad push breaks iOS instantly |
| State | `localStorage` is the working source of truth (871 direct reads/writes), synced as JSON blobs into Supabase `user_data` via `db.js` | This is the root cause of most of the fix commits (wiped sessions, lost profile fields, birthday not surviving reload) |
| Backend | Supabase Postgres + RLS + 20 edge functions (AI proxy, Strava OAuth/sync/upload, Stripe webhook, push, coaching) | Strava and AI keys are correctly server-side |
| Tests | 16 test files + golden tests, run by `npm test` (`scripts/run-tests.js`) and CI | Paths fixed in `claude/agent-collab-setup`; 3 files quarantined for logic drift |

## 2. Findings, ranked

### P0: fix before anyone else uses the app

> Status: #1 and #2 fixed by `supabase/migrations/20261109_secure_profiles.sql` (PR `claude/secure-profiles`), which also closes a third leak: anyone holding a live share link could read the sender's full profile. Covered by `tests/sql/profiles-security.sh` in CI. Must still be applied to the live database.

1. **Any signed-in user can make themselves admin, premium, or a coach.** The `profiles` UPDATE policy is `USING (auth.uid() = id)` with no column restriction and no trigger guarding `role`, `subscription_status`, or `is_coach`. From the browser console: `supabaseClient.from('profiles').update({role:'admin'}).eq('id', myId)`. That unlocks the admin dashboard, every admin RLS policy, and bypasses the paywall. Fix: a `BEFORE UPDATE` trigger that rejects changes to those columns unless the caller is service_role or admin, or move them to a separate table users cannot write.
2. **Every signed-in user can read every other user's profile row.** `inbox-migration.sql` adds `FOR SELECT TO authenticated USING (true)` on `profiles`. Since `20260430e`, that row includes `birthday` and `body_comp_goal`, plus email, name, role, and subscription status. Fix: drop that policy and replace it with a `SECURITY DEFINER` RPC that looks up one user by exact email and returns only id + display name (the migration's own comment suggests this).
3. **A real person's training plan was in a public repo.** Removed from the working tree in PR `claude/agent-collab-setup`. It is still in git history; making the repo private (or rewriting history) is the remaining step.

Caveat: P0 #1 and #2 are read from the SQL in the repo. Confirm against the live database in the Supabase dashboard (Authentication > Policies on `profiles`) before and after fixing.

### P1: structural problems that block building on top

4. **Three plan engines, and the cleanest one is not wired in.**
   - `planner.js` `generateTrainingPlan()`: the live race-plan path (survey, Build Plan). 6.5k-line monolith.
   - `philosophy-planner.js` + `rules-engine.js`: older "Philosophy Engine" (phases 2 to 6), only reachable through a secondary "Philosophy Engine Plan" button.
   - `athlete-classifier.js` > `arc-builder.js` > `session-assembler.js` > `plan-generator.js`: the Rule Engine built to `RULE_ENGINE_SPEC.md` and `PLAN_SCHEMA.json`. Pure functions, spec-tested (22 + 29 passing tests), and the header says "NOT yet wired into planner.js." Nothing calls `PlanGenerator.generate`.
   Decision needed: make the Rule Engine the single engine and retire the other two. It is the only one built to be testable and extended with new inputs.
5. **The engine personalizes on less than you think.** The live path uses per-sport level, thresholds (VDOT, FTP w/kg using weight, CSS), days per week, preferred and long days, the weekly template, and A/B race calendar. It does **not** use age, injury or health status, sleep, HRV, resting HR, fatigue, or daily schedule. `athlete-classifier.js` already derives `riskBias`, `ageGroup`, and recovery state, which is another reason to consolidate there.
6. **"Adaptive coach" is two rules on self-reported check-ins.** `adaptive-coach.js` cuts intensity if 2 of the last 3 weekly check-ins say "too hard," raises it if 2 of 3 say "too easy," and suggests cutting volume on low completion. No training load model, no wearable data. Strava activities are imported into the log but never feed back into the plan.
7. **localStorage as the source of truth.** Cross-device bugs, silent overwrites, and auth-lock workarounds (several 4-second timeout races in `db.js`, `config.js`, `strava-integration.js`) all trace here. Any adaptive feature that reads wearable data server-side will fight this model.
8. **Duplicate generations of the same module:** `onboarding-legacy` / `onboarding-v2`, `nutrition` / `nutrition-v2`, and four validators (`validator.js`, `plan-validator.js`, `plan-constraint-validator.js`, `workout-validator.js`).

### P2: hygiene

9. `npm run build` references five folders that no longer exist (`icons/`, `philosophy/`, `Logo/`, `Future Features/`, `Training Philosophy/`). `package.json` repository URL points to `cezernich/ironz`.
10. **Fixed in `claude/agent-collab-setup`:** test paths after the reorg, the stale coach RLS test (it read an old migration and parsed code comments as keys), and the old `ironz.app` domain in the link test. Still open: `diversification-tests` (4), `run-session-types-tests` (12), and `threshold-week-tests` (2) fail on real drift between expected and generated workouts. They are quarantined in `scripts/run-tests.js` until someone decides whether the code or the expectations are right.
11. 34 of 362 tracked files are specs, prompts, mockups, bug notes, and spreadsheets mixed into the deploy root. They ship to ironz.fit because the repo root is the site.
12. Apple review risk: an app that is only a remote-URL WebView can be rejected under guideline 4.2 (minimum functionality), and updates bypass review. Bundling the web assets locally (`webDir: www`) fixes both.

### What is in good shape
- No syntax errors across all files.
- AI calls go through an edge-function proxy; no model keys in the client.
- Strava OAuth, token refresh, and client secret are server-side. That is the right template for any new wearable connector.
- The training philosophy docs, rule engine spec, plan schema, and golden tests are a real asset. Most apps don't have this layer written down.

## 2a. Open security items: production status

Verified against the live Supabase project (`ironz`, read-only queries) on 2026-11-09. Nothing below has been applied to production. Update this table when an item ships.

| # | Item | Fix in repo | Production | Owner action |
|---|---|---|---|---|
| S1 | Users can change their own `role`, `subscription_status`, `is_coach`, `email` | PR #14 (draft) | **Open.** No guard trigger; `authenticated` has UPDATE on every `profiles` column | Apply `20261109_secure_profiles.sql`, then merge #14 right after |
| S2 | `"Authenticated users can look up others by email"` policy, `USING (true)`: any user reads all 19 profiles incl. birthday and body data | PR #14 (draft) | **Open** | Same as S1 |
| S3 | `"Anyone can read shared workout sender profiles"`: anyone with a live share link (incl. logged out) reads the sender's full row | PR #14 (draft) | **Open** | Same as S1 |
| S4 | Strava client secret committed in `strava-migration.sql` | PR #16 removes it from source | **Open.** Value still in git history and presumably still valid | Rotate at strava.com/settings/api, then `supabase secrets set STRAVA_CLIENT_SECRET=...` |
| S5 | Real athlete's training plan in public repo | Removed in PR #12 | **Open** in git history | Make repo private or rewrite history |
| S6 | Edge-function authorization (`send-push`, `notify-share`, `ask-ironz` quota) | Not started | Not verified live | Codex finding (PR #13); unassigned |

Observed live: 19 profiles, 1 admin. No sign of self-promotion. `ironz-staging` project exists but is empty (no tables, no users), so it cannot yet be used to rehearse migrations.

## 3. Garmin and "holistic health" input

- **Garmin's developer program is paused for new applicants** (as of Sept 2026). Existing integrations keep working; new approvals are on hold. Don't build the roadmap on direct Garmin access.
- **Recommended path:** Apple HealthKit via a Capacitor plugin. Garmin Connect already writes sleep, resting HR, HRV, and workouts to Apple Health, so one integration covers Garmin, Apple Watch, Whoop, Oura, and others on iOS. Requires bundling the app (finding 12) since HealthKit runs on-device.
- **Fallbacks:** an aggregator (Terra, Open Wearables) if Android matters, or Intervals.icu (which already ingests Garmin) for a power-user tier.
- **Start with three signals:** HRV vs. personal baseline, sleep duration, resting HR trend. Add training load (acute vs. chronic from completed sessions) from data the app already has.

## 4. Adaptive coaching: target design

Inputs > rules > output > guardrails, kept explainable.

| Input | Rule (example) | Output |
|---|---|---|
| HRV below 7-day baseline by a set margin + short sleep | Downgrade today's hard session one level | "Swapped intervals for Z2. HRV is low and you slept 5.5h." |
| Calendar marks a full day / user says "slammed" | Cut duration to the minimum effective dose, keep the key session | 30 min version of the same workout |
| 3+ days of rising resting HR or illness flag | Pause intensity, prompt to rest | Rest-day suggestion, no streak penalty |
| Acute load far above chronic | Hold next week's volume increase | Weekly plan holds instead of progressing |
| Missed key session | Move it if recovery allows, else drop it | No "catch-up" doubling |

Guardrails: never increase load from wearable data alone, always show why a change was made, let the user override, and route injury or medical flags to "see a professional" rather than adjusting.

## 5. Rebuild plan

**Phase 0 (week 1): stop the bleeding**
- Lock down `profiles` (P0 #1, #2), remove Paige's data, decide public vs. private repo.
- Add a test runner, fix the stale test paths, run tests in GitHub Actions on every PR.
- Turn on branch protection so nothing reaches main (= production) without a PR.

**Phase 1 (weeks 2 to 4): one engine**
- Wire the Rule Engine (`PlanGenerator.generate`) behind a flag, run it side by side with `planner.js` on golden profiles, then switch over.
- Retire `philosophy-planner` / `rules-engine` and the duplicate validators.
- Add the classifier inputs that matter: age group, injury/health status, available time per day.

**Phase 2 (weeks 4 to 8): real data**
- Move training state (plan, completed sessions, readiness) from localStorage blobs to Supabase tables, with localStorage as cache only.
- Bundle the iOS app and add HealthKit read for sleep, HRV, resting HR, workouts.

**Phase 3: adaptive coach v2**
- Daily readiness check from section 4, with visible "why" text.
- Weekly re-plan using load + check-ins, replacing the 2-of-3 rule.

## 6. Working with Claude and Codex together

See `AGENTS.md` section 6. Summary: one branch per task (`claude/` or `codex/`), PRs only, CI must pass, and the agent that didn't write a PR reviews it.

## 7. Open questions for Chase

1. ~~Real users besides Chase?~~ Answered: essentially none. Data migration can be simple.
2. ~~Coaching features core?~~ Answered: paused while the athlete experience is rebuilt.
3. iOS only, or Android too? Decides HealthKit vs. an aggregator.
4. Keep vanilla JS, or move to a framework (e.g., React + Vite) during the rebuild? Recommendation: do not rewrite now. Consolidate the engine and data layer first; the UI rewrite can come after.
5. What does your Claude Ironman agent read today (Strava, Intervals.icu, anything else)? That defines the v1 signal set to replicate.
