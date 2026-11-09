# AGENTS.md

Shared instructions for every coding agent on this repo (Codex, Claude, anything else). `CLAUDE.md` imports this file, so there is one source of truth. If you change how agents should work here, change it in this file.

Owner: Chase (cezernich). He reviews and merges every PR.

## 1. What IronZ is

Training, nutrition, and hydration app for endurance and hybrid athletes (triathlon, running, Hyrox, strength). The core promise: a plan that adapts to the athlete, not a generic template.

## 2. Architecture (read before touching anything)

- **Frontend:** vanilla JS, no bundler, no framework. `index.html` loads ~147 `<script>` tags in order into one global namespace. Load order matters; a new file must be added to `index.html` in the right place.
- **Hosting:** GitHub Pages serves the repo root at https://ironz.fit. **Every merge to `main` is a production deploy**, for the web app and the iOS app.
- **iOS:** Capacitor 8 shell (`fit.ironz.app`) that loads `https://ironz.fit` remotely (`capacitor.config.ts`).
- **Backend:** Supabase (auth, Postgres with RLS, edge functions in `supabase/functions/`). Schema changes go in `supabase/migrations/` as new, dated files. Never edit an old migration.
- **State:** most client state lives in `localStorage` and syncs to the Supabase `user_data` table through `js/db.js` (`DB.syncKey`). This is fragile and is being migrated (see section 5). Do not add new direct `localStorage` reads/writes for training state; go through `db.js`.

## 3. Commands

```sh
npm test        # all tests + syntax check of every client JS file. Must pass before a PR.
node tests/<file>.js   # run one test
```

No install step is needed to run tests (plain Node 20+).

Tests in `QUARANTINE` inside `scripts/run-tests.js` run but don't fail CI. Each has a reason. If you fix one, remove it from the list in the same PR. Never add a test to quarantine to make your PR green without saying so in the PR description.

## 4. Sources of truth for training logic

- `sources-of-truth/Engine Doc/PLAN_GENERATOR_MASTER_SPEC.md` is the single source of truth for training logic: classification, phases, session distribution, workouts, zones, exercise selection, nutrition, hydration, recovery, safety, coaching tone.
- **Spec sync rule:** if you change training logic in code, update the master spec in the same PR. The spec and the code must never disagree. If the spec does not cover a case, ask in the PR; don't guess.
- Also: `sources-of-truth/RULE_ENGINE_SPEC.md` (pipeline order), `sources-of-truth/PLAN_SCHEMA.json` (plan output contract).
- `sources-of-truth/TRAINING_PHILOSOPHY.md` is deprecated. Do not reference or update it.

## 5. Current state and direction (Nov 2026)

Read `docs/CODE_REVIEW_2026-11-09.md` for the full picture. The short version:

- **Three plan engines exist.** The target is the Rule Engine: `js/athlete-classifier.js` > `js/arc-builder.js` > `js/session-assembler.js` > `js/plan-generator.js` (`PlanGenerator.generate`). It is not wired into the app yet.
  - `js/planner.js` `generateTrainingPlan()` is the live path. Fix bugs there, but put new logic in the Rule Engine.
  - `js/philosophy-planner.js` + `js/rules-engine.js` are legacy. Do not extend them.
- **Coaching features are paused** (`js/coach-*.js`, `js/client-coach*.js`, `js/admin-coaches.js`, `supabase/functions/coach-*`). Don't build on them. Security fixes only.
- Priorities, in order: security fixes > one plan engine > data layer off localStorage > Apple Health input > adaptive coaching.

## 6. How agents work here

- **Never commit to `main`.** One branch per task: `claude/<short-topic>` or `codex/<short-topic>`. Open a PR into `main`.
- **One agent per branch.** Don't push to another agent's branch. To suggest a change on someone else's PR, leave a review comment.
- **Small PRs.** One concern per PR. A security fix, a refactor, and a feature are three PRs.
- **The PR description is the handoff.** Fill in the template: what changed, why, how you tested it, what you did not do, open questions. The reviewing agent has no other context.
- **Independent review:** every PR gets reviewed by the agent that did not write it (Codex reviews Claude's PRs, Claude reviews Codex's). The reviewer checks the diff against section 7 and the review doc, runs `npm test`, and leaves findings as PR review comments, not new commits.
- Don't reformat files you aren't otherwise changing. Diffs must be readable.
- Don't delete specs or docs without saying so in the PR.

## 7. Review guidelines

Flag these as **P0** (blocks merge):
- Any RLS policy that is broader than needed, uses `USING (true)` on user data, or lets a user write `role`, `subscription_status`, `is_coach`, or another user's rows.
- Secrets or `service_role` keys in client code, or a new third-party API key outside an edge function.
- User data (health, body metrics, birthday, location, workouts) readable by other users or logged to analytics/Sentry.
- Personal data of real people committed to the repo (spreadsheets, exports, names in fixtures).
- Anything that could break `main` in production: syntax errors, a script added out of load order, a removed global another file still calls.
- Training logic that could push an athlete into unsafe load: big week-over-week jumps, removing deload or taper, increasing intensity off wearable data alone, overriding injury or illness flags.

Flag these as **P1**:
- Training logic changed without the matching master spec update.
- New training state stored directly in `localStorage` instead of through `db.js`.
- New logic added to `planner.js` or the legacy philosophy planner that belongs in the Rule Engine.
- Missing or weakened tests for changed logic; tests moved to quarantine without a reason.
- User-facing copy that is shaming, overly clinical, or makes medical claims.

Don't nitpick formatting or style unless it hurts readability.

## 8. Security basics

- The Supabase anon key in `js/supabase-init.js` is public by design. Everything depends on RLS being correct.
- Service-role keys, Anthropic, Stripe, and Strava secrets live only in Supabase edge-function secrets.
- Every new table gets RLS enabled in the same migration, with policies scoped to `auth.uid()`.
- This repo is public. Assume anything committed is visible to everyone, forever.
