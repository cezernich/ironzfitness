# IronZ Product Roadmap — Gap Analysis & Build Plan

> Generated from: Market Intelligence Report (20pp) × Current IronZ v1.0.0 codebase audit
> Date: April 3, 2026
> Purpose: Feed to Claude Code agents for parallel implementation

---

## Executive Summary

IronZ v1.0.0 has strong foundational coverage across fitness planning, nutrition tracking, hydration, and community workouts. However, the market research identifies **12 critical gaps** between what IronZ ships today and what the evidence says is required to win in this category. The gaps cluster into three themes:

1. **Onboarding & first-session value** — IronZ has no guided onboarding. Research shows the battle is won or lost in the first 7–30 days, and trials start overwhelmingly on Day 0.
2. **Adherence & behavior change** — IronZ tracks behavior but doesn't guide it. No fallback plans, no adaptive updates, no weekly check-ins, no smart notifications.
3. **Trust & transparency** — No recommendation explainability, no privacy center, no safety guardrails for vulnerable users. Research flags these as both differentiators and emerging legal requirements.

---

## Current State: What IronZ Already Does Well

These features are **aligned with research** and should be preserved/enhanced, not rebuilt:

| Feature | Research Alignment | Status |
|---|---|---|
| Multi-modal fitness planning (strength, cardio, HIIT, yoga, etc.) | Core MVP capability | ✅ Solid |
| AI workout generation ("Ask IronZ") | AI as optional accelerator, not gate | ✅ Well-positioned |
| Nutrition dashboard (calories + macro rings) | Simple macro target + daily view | ✅ Good foundation |
| Photo AI meal logging | Optional AI assist for busy users | ✅ Present |
| Manual + Quick Add meal logging | Low-friction tracking | ✅ Present |
| Hydration tracker with bottle visual | Gamified hydration UX | ✅ Good base |
| AI meal suggestions + grocery list | Meal planning valued by users | ✅ Present |
| Community workouts (browse/share) | Light community, segment-gated | ✅ Appropriate scope |
| Saved workout templates (20 max) | Reusable content | ✅ Good |
| Gamification (levels, badges, progress score) | Visible progress + feedback | ✅ Good foundation |
| Food preferences (likes/dislikes) | Personalization input | ✅ Present |
| Training preferences (exercises to avoid) | Personalization input | ✅ Present |
| Modular design (nutrition/hydration toggleable) | "Choose your module" UX | ✅ Strong alignment |
| Calendar-based daily plan view | Daily plan is a core UX pattern | ✅ Present |
| Multiple themes/appearance options | Low-priority but nice | ✅ Present |
| Supabase auth (email/password) | Basic auth | ✅ Working |

---

## Gap Analysis: 12 Critical Gaps Ranked by Impact

### GAP 1: No Goal-First Onboarding Flow
**Research evidence:** "Aha moment" must happen within the first session. MVP thesis says deliver a personalized 7-day plan with fitness + nutrition + hydration in session one. Trial starts happen on Day 0; users who don't start immediately rarely start at all.

**Current state:** IronZ drops users into the Home tab after signup. Building a plan requires navigating to Training > Build a Plan, choosing parameters, and generating. There's a survey button in the header ("Build Plan") but no guided first-run experience.

**Impact:** HIGH — this is the #1 driver of Day 0 activation and Day 7 retention.

---

### GAP 2: No Adherence / Resilience System
**Research evidence:** The #1 whitespace opportunity. Most apps compete on content volume; few compete on what happens when users miss days. BCT evidence shows prompts/cues, feedback, and rewards correlate with engagement. The research explicitly recommends building an adherence system that "reduces guilt, adapts targets after misses, and makes returning frictionless."

**Current state:** IronZ has no fallback plans, no adaptive rescheduling, no "welcome back" flows, no missed-day handling. If a user misses Monday's Push Day, nothing happens.

**Impact:** HIGH — primary differentiator and retention driver.

---

### GAP 3: No "Why This Recommendation" Transparency
**Research evidence:** Users distrust generic personalization and "black box" AI. Making recommendation logic transparent is a defensible trust differentiator. Research explicitly flags this as high trust value.

**Current state:** AI generates workouts and meal suggestions but shows no reasoning. The generated workout just appears — no explanation of why these exercises, this volume, or this progression.

**Impact:** MEDIUM-HIGH — trust differentiator, especially for Weight Recomp Planners and Macro Optimizers.

---

### GAP 4: No Notification / Reminder System
**Research evidence:** User-controlled notification cadence is a must-have. Notification fatigue is a top churn trigger (especially for Busy Professionals). The research calls for smart reminders that fit routine, not spam.

**Current state:** Zero notification infrastructure. No reminders for workouts, meals, hydration, or check-ins.

**Impact:** HIGH — directly drives daily re-engagement and habit formation.

---

### GAP 5: No Barcode Scanning for Food Logging
**Research evidence:** Low-friction tracking (quick-add + barcode scan) is a must-have. Major competitors (MyFitnessPal, Lifesum, Cronometer) all offer barcode scanning. Users praise fast logging workflows as a top delight driver.

**Current state:** IronZ has photo AI + manual entry + quick-add from recents, but no barcode scanner.

**Impact:** MEDIUM-HIGH — table stakes for nutrition-focused segments.

---

### GAP 6: No Weekly Check-In / Progress Dashboard
**Research evidence:** Progress dashboard with weekly check-in is a must-have. Self-monitoring and visible feedback are among the most consistently engagement-associated BCTs. Research recommends streaks, adherence %, and simple trend charts.

**Current state:** IronZ has a Stats tab with level/progress score and workout history, but no structured weekly check-in, no adherence percentage, no weekly summary, and no trend visualization over time.

**Impact:** HIGH — directly drives Day 8–30 retention.

---

### GAP 7: Hydration Not Context-Aware
**Research evidence:** The key hydration differentiator is moving beyond static water goals. Research recommends adjusting hydration nudges based on activity, routine, and beverage type — connecting hydration to workouts and outcomes. This is flagged as medium complexity but high differentiation.

**Current state:** IronZ has a basic bottle counter with customizable bottle size and daily target. Target can auto-calculate from body weight. But it doesn't adjust for workout days, doesn't tie to training context, and doesn't vary by activity type.

**Impact:** MEDIUM — differentiator that creates daily re-entry habit.

---

### GAP 8: No Privacy / Trust Center
**Research evidence:** Increasingly required by law (FTC HBNR, CPRA, WA My Health My Data Act, GDPR). Research recommends a "Trust Center" UX covering permissions, data use, export/delete, and recommendation rationale. This should be differentiation, not compliance afterthought.

**Current state:** IronZ has "Data Management" in Settings with clear/delete buttons, but no privacy policy display, no data export, no explanation of what data is collected and why, no permission rationale, and no consent flows.

**Impact:** MEDIUM-HIGH — legal requirement and trust differentiator.

---

### GAP 9: No Pricing / Subscription Infrastructure
**Research evidence:** Annual-first subscriptions with transparent pricing and clear cancellation are the category standard. Subscription friction and "charges confusion" are the #1 most negatively rated topic in app reviews. Research recommends a generous free tier with behavior-based upgrade moments.

**Current state:** IronZ has no paywall, no pricing page, no subscription tiers, and no free vs. premium distinction.

**Impact:** HIGH for business viability — but should be built after value is proven.

---

### GAP 10: No Unified "Today" View (Fitness + Nutrition + Hydration)
**Research evidence:** The daily plan view should show workout + eating guidance + hydration in one place. Research MVP scope includes "Today page with workout + eating guidance + hydration." This reduces cognitive load and fits the beginner/busy segments.

**Current state:** Home tab shows calendar + day detail (workout) + hydration separately. Nutrition is a separate tab entirely. There's no single "here's your day" view that combines all three.

**Impact:** MEDIUM-HIGH — core to the "unified but not overwhelming" positioning.

---

### GAP 11: Wearable / Health Integrations Are All Placeholders
**Research evidence:** Ecosystem integrations are becoming an expectation. Users want to reduce manual entry via passive data from wearables. However, the research notes this adds scope, compliance complexity, and privacy sensitivity.

**Current state:** Strava = "Coming Soon," Garmin = "Not Available," Apple Health = "iOS Only," Google Fit = "Android Only," Wahoo = "Coming Soon," WHOOP = "Coming Soon." Outlook Calendar sync section exists but unclear if functional.

**Impact:** MEDIUM — important for Phase 2 but not MVP-blocking.

---

### GAP 12: No Safety Guardrails for Vulnerable Users
**Research evidence:** Weight-loss and macro tools can contribute to obsessive tracking. Research recommends minimum calorie guardrails, no extreme deficit encouragement, and "seek professional help" flows for disordered-eating warning signs. This is both ethical and reputational risk mitigation.

**Current state:** No minimum calorie floors in nutrition targets, no warning when caloric deficit is extreme, no educational prompts about healthy ranges, no "talk to a professional" trigger.

**Impact:** MEDIUM — risk mitigation and brand safety.

---

## Phased Roadmap

### PHASE 1: "First Session Magic" (Weeks 1–4)
> Goal: Prove Day 0 activation, Day 7 retention, and logging adherence.

#### 1.1 Goal-First Onboarding Flow
**Agent task:** Build a multi-step onboarding wizard that launches on first login (or when no plan exists).

**Inputs collected:**
- Primary goal (get fit / eat better / lose weight / hydrate better)
- Fitness level (beginner / intermediate / advanced)
- Time availability (days per week + session length)
- Dietary preference (no restriction / vegetarian / vegan / keto / other)
- Current hydration habit (rarely / sometimes / usually)
- Body stats (optional: age, weight, height, gender)

**Output:** A personalized 7-day starter plan covering:
- Daily workout (matched to goal + level + available days)
- Simple nutrition target (calories + protein minimum)
- Hydration goal (auto-calculated or default)

**UX requirements:**
- Maximum 5 screens, progress dots, skip option on each
- Final screen shows a preview of "Your Week" before confirming
- Must feel fast — under 90 seconds to complete
- Stores responses in profile and uses them for all downstream generation
- "Build Plan" header button should trigger this if no plan exists

**Files to modify:** `index.html` (new onboarding overlay), new `onboarding.js`, integration with existing plan generation logic.

**Success metric:** % of new users who complete onboarding and view their Day 1 plan.

---

#### 1.2 Unified "Today" Dashboard
**Agent task:** Redesign the Home tab's day detail section to show a unified daily view.

**Requirements:**
- Single card that shows: today's workout summary, nutrition target + progress (calories/protein eaten vs. target), hydration progress (X/Y bottles)
- Quick-action buttons: "Start Workout," "Log Meal," "Log Water"
- If workout is completed, show checkmark + summary
- Nutrition and hydration sections only show if those modules are enabled
- Contextual micro-copy (e.g., "Rest day — focus on recovery and hydration")

**Files to modify:** `index.html` (refactor `#day-detail-content` and `#hydration-card` into unified component), likely new `today-dashboard.js`.

**Success metric:** Daily active users who interact with at least 2 of 3 pillars (workout/nutrition/hydration) on the same day.

---

#### 1.3 Simple Weekly Check-In
**Agent task:** Build a weekly check-in flow that fires every Sunday (or configurable day).

**Requirements:**
- Shows: workouts completed vs. planned, nutrition logging streak, hydration adherence %, weight change (if tracked)
- Simple "How did this week feel?" selector (too easy / just right / too hard)
- Optional: adjust next week's intensity based on feedback
- Stores check-in history for trend display in Stats tab
- Non-shaming tone — celebrate consistency, not perfection

**Files to modify:** New `weekly-checkin.js`, integration with Stats tab, new modal/overlay in `index.html`.

**Success metric:** Day 7+ retention; % of users who complete at least 2 weekly check-ins in first month.

---

#### 1.4 Safety Guardrails (Nutrition)
**Agent task:** Add minimum safety floors to nutrition recommendations and logging.

**Requirements:**
- Minimum calorie floor: 1,200 cal/day (women) / 1,500 cal/day (men) — display warning if target is set below
- If user logs < 800 cal for 3+ days, show a gentle educational prompt with link to NEDA resources
- No language like "lose X pounds in Y days" or "burn off that meal"
- Macro targets should never suggest < 0.6g protein/lb bodyweight
- Add disclaimer text to AI meal suggestions: "These are general wellness suggestions, not medical advice"

**Files to modify:** Nutrition generation logic (wherever calorie targets are computed), meal suggestion display, add safety check module.

**Success metric:** Zero instances of extreme deficit recommendations in QA testing.

#### 1.5 AI Claims Governance Process
**Agent task:** Establish guardrails and review process for all AI-generated content.

**Requirements:**
- Define a blocklist of prohibited phrases in AI outputs (e.g., "guaranteed results," "lose X pounds in Y days," "cure," "treat," "diagnose")
- Implement a post-generation filter that scans AI workout descriptions, meal suggestions, and coaching copy against the blocklist before display
- All AI-generated wellness content must include a standard disclaimer footer
- Document a quarterly review process: sample 50 random AI outputs and check for claims drift
- No outcome guarantees or medical-adjacent language — ever

**Files to modify:** AI generation utilities (workout, meal, coaching), new `claims-filter.js` utility module.

**Success metric:** Zero prohibited phrases in production AI outputs; quarterly audit pass.

---

### PHASE 2: "Habit Formation" (Weeks 5–10)
> Goal: Drive Day 8–30 retention through adherence mechanics and smart nudges.

#### 2.1 Adherence & Resilience Engine
**Agent task:** Build the core adherence system — the app's primary differentiator.

**Requirements:**
- **Missed day detection:** If a scheduled workout is not logged by end of day, mark as missed (not failed)
- **Fallback plans:** When user opens the app after a missed day, offer "Pick up where you left off" or "Start fresh this week" — never guilt
- **Adaptive rescheduling:** If user misses Mon+Tue, compress the remaining week (e.g., shift to Wed/Thu/Sat) with user confirmation
- **Streak logic:** Track "consistency streak" (X of last 7 days active) rather than "perfect streak" to be forgiving
- **Return flow:** If user hasn't opened app in 3+ days, show a warm "Welcome back" with a simple re-entry plan (1 easy workout + 1 meal + hydration)
- **Tone:** Supportive, never punitive. "Life happens. Here's an easy way back in."

**Files to modify:** New `adherence.js`, integration with calendar/plan system, modifications to Home tab greeting logic.

**Success metric:** Day 14 and Day 30 retention rates; % of users who return after a 3+ day gap.

---

#### 2.2 Notification / Reminder System
**Agent task:** Build a user-controlled notification system.

**Requirements:**
- **Types:** Workout reminder, meal logging nudge, hydration reminder, weekly check-in prompt
- **User control:** Each type can be toggled on/off independently, with custom time-of-day
- **Smart defaults:** Workout reminder = 30 min before scheduled time; hydration = spread across waking hours; meal = typical meal times (adjustable)
- **Cadence control:** "Minimal" / "Moderate" / "All" preset + custom
- **Implementation:** Use browser Notification API for web; design for future native push
- **Anti-spam:** Never more than 5 notifications/day; if user dismisses 3 in a row, auto-reduce cadence and ask if they want to adjust

**Files to modify:** New `notifications.js`, Settings > Preferences expansion, service worker registration for web push.

**Success metric:** Notification opt-in rate; correlation between notification engagement and retention.

---

#### 2.3 "Why This Recommendation" Transparency Layer
**Agent task:** Add explainability to all AI-generated content.

**Requirements:**
- **Workout generation:** Below each generated workout, show a collapsible "Why this workout?" section explaining: muscle group rotation, progressive overload logic, alignment with user goal, recovery consideration
- **Meal suggestions:** Show: "Based on your protein target of Xg, preference for [foods], and today's [workout type]"
- **Hydration target:** If adjusted for workout day, show: "Your target is higher today because you have a [workout type] scheduled"
- **Tone:** Brief, confident, educational — not defensive

**Files to modify:** Workout generation output rendering, meal suggestion display, hydration target logic.

**Success metric:** User engagement with transparency elements (click/expand rate).

---

#### 2.4 Context-Aware Hydration
**Agent task:** Upgrade hydration from static counter to context-aware system.

**Requirements:**
- **Workout-day adjustment:** +16–24oz on training days, auto-calculated
- **Display context:** "Your target is 112oz today (96 base + 16 for your strength session)"
- **Beverage types:** Let users log water, coffee, tea, sports drink (with different hydration coefficients)
- **Smart timing:** Suggest front-loading water before workouts, rehydrating after
- **Connection to outcomes:** In weekly check-in, show hydration adherence alongside workout performance

**Files to modify:** Hydration tracker logic, `index.html` hydration card, new beverage type selector.

**Success metric:** Hydration logging frequency; % of days hydration goal is met.

---

### PHASE 3: "Trust & Monetization" (Weeks 11–16)
> Goal: Build trust infrastructure and subscription readiness.

#### 3.1 Privacy & Trust Center
**Agent task:** Build a dedicated Trust Center accessible from Settings.

**Requirements:**
- **Data inventory:** Clear list of what data IronZ collects, why, and where it's stored
- **Permissions dashboard:** Show which data points are being used for recommendations
- **Data export:** One-click export of all user data (JSON or CSV)
- **Data deletion:** Granular deletion (already partially exists in Data Management — enhance it)
- **Recommendation rationale:** Link to the "why this" explanations from 2.3
- **Legal compliance:** CPRA-ready consent flows, FTC HBNR awareness, GDPR-compatible data handling
- **Third-party disclosure:** If/when integrations exist, show exactly what data is shared and with whom

- **Security incident response:** Document a breach notification workflow (required by FTC HBNR). Include: how users are notified, within what timeframe, what data was affected. Even if no breach has occurred, the process must exist before launch.
- **Data minimization policy:** Only collect data that directly improves the user experience. Document what's collected, why, and retention periods. Delete data that's no longer needed.
- **Consent flow timing:** Health-related data consent must be requested at the point of collection, not in a pre-onboarding wall. Example: ask for body stats consent when the user reaches that onboarding step, not upfront. For Apple Health / wearable data, request permission only when the user initiates the connection.

**Files to modify:** New `trust-center.js`, new Settings section, data export utility, breach response documentation, consent flow integration with onboarding (1.1).

**Success metric:** Permission acceptance rate; support ticket volume related to privacy; compliance audit pass rate.

---

#### 3.2 Barcode Scanning for Food Logging
**Agent task:** Add barcode scanning as a food logging method alongside photo AI and manual entry.

**Requirements:**
- **Camera-based barcode reader:** Use a JS barcode library (e.g., QuaggaJS or ZXing)
- **Food database lookup:** Connect to Open Food Facts API (free, open-source) for nutritional data
- **Flow:** Scan → show detected food + macros → user confirms/adjusts → log
- **Fallback:** If barcode not found, offer to switch to photo AI or manual entry
- **Recent scans:** Save last 20 scanned items for quick re-logging

**Files to modify:** New `barcode-scanner.js`, add barcode button to nutrition log options, modal for scan view.

**Success metric:** % of meals logged via barcode; time-to-log reduction.

---

#### 3.3 Subscription & Pricing Infrastructure
**Agent task:** Build the free/premium tier system.

**Requirements:**
- **Free tier (generous):** Onboarding + 1 active plan + basic nutrition logging + hydration tracking + community browse
- **Premium tier:** Unlimited plans, AI workout generation, AI meal suggestions, barcode scanning, photo AI logging, grocery lists, advanced stats, weekly check-in insights, priority support
- **Pricing page:** Clear, transparent — no hidden fees, easy cancellation
- **Trial:** 7-day free trial of premium on signup (aligns with Day 0 trial start behavior)
- **Annual-first presentation:** Show annual price first (with monthly option) — aligns with category benchmarks
- **Price range:** ~$7.99/month or ~$59.99/year (positioned below MyFitnessPal, above pure hydration apps)
- **Paywall timing:** After onboarding completion and first value delivery — never before
- **Cancellation:** One-tap cancel, clear confirmation, retention offer optional

**Files to modify:** New `subscription.js`, paywall modal, Settings account section, feature gating logic throughout app.

**Success metric:** Trial-to-paid conversion; Day 35 download-to-paid; annual plan mix.

---

### PHASE 4: "Scale & Differentiate" (Weeks 17–24)
> Goal: Deepen personalization, add integrations, expand content.

#### 4.1 Adaptive Coaching Engine
**Agent task:** Build AI that adapts plans based on user behavior and feedback.

**Requirements:**
- If user consistently rates workouts "too hard," auto-reduce volume/intensity next week
- If user completes all sessions, suggest progressive overload
- If user's nutrition logging drops off, simplify recommendations (fewer meals to log, simpler targets)
- Weekly plan adjustments should be transparent ("We noticed you skipped legs last week — here's an adjusted plan")

**Files to modify:** New `adaptive-coach.js`, integration with weekly check-in data, plan generation logic.

---

#### 4.2 Strava Integration (First Wearable)
**Agent task:** Build Strava OAuth integration for automatic workout import.

**Requirements:**
- OAuth2 flow with Strava API
- Import runs, rides, swims automatically
- Map Strava activities to IronZ workout types
- Show imported workouts on calendar with Strava badge
- Don't double-count if user also logs manually
- Clear permission explanation before connecting

**Files to modify:** New `strava-integration.js`, Connected Apps section enhancement, calendar rendering.

---

#### 4.3 Meal Planning Depth
**Agent task:** Enhance meal planning with household portions and schedule-based planning.

**Requirements:**
- Generate a full week of meals (not just today's ideas)
- Adjust portions for household size
- Grocery list tied to actual meal plan (not just targets)
- "Swap meal" functionality for individual meals
- Save favorite meal plans for re-use

**Files to modify:** Enhance `meal-suggestions` and `grocery-list` sections, new `meal-planner.js`.

---

#### 4.4 Cohorts & Micro-Challenges
**Agent task:** Add optional social challenges tied to hydration and workouts.

**Requirements:**
- Segment-gated (opt-in, not default — avoid overwhelming beginners)
- Time-boxed challenges (7-day hydration challenge, 30-day consistency challenge)
- Leaderboard with anonymized options
- Tie to existing gamification (badges, progress score)
- Community tab integration

**Files to modify:** Community tab expansion, new `challenges.js`, gamification system enhancement.

---

## Agent Assignment Matrix

Each phase should be assigned to parallel Claude Code agents. Here's how to split the work:

| Agent | Scope | Dependencies |
|---|---|---|
| Agent 1: Onboarding | 1.1 Goal-First Onboarding | None — can start immediately |
| Agent 2: Today Dashboard | 1.2 Unified Today View | None — can start immediately |
| Agent 3: Check-In + Stats | 1.3 Weekly Check-In + 2.3 Transparency | Needs existing stats structure |
| Agent 4: Safety | 1.4 Safety Guardrails | Needs nutrition logic understanding |
| Agent 5: Adherence | 2.1 Adherence Engine + 2.2 Notifications | Needs onboarding + calendar done first |
| Agent 6: Hydration+ | 2.4 Context-Aware Hydration | Can start after Today Dashboard |
| Agent 7: Trust & Privacy | 3.1 Trust Center | Can start anytime |
| Agent 8: Barcode | 3.2 Barcode Scanning | Can start anytime |
| Agent 9: Monetization | 3.3 Subscription System | Needs onboarding + core features stable |
| Agent 10: Integrations | 4.2 Strava + future integrations | Phase 4 — after MVP proof |

**Recommended parallel tracks for Phase 1:**
- Agents 1, 2, 3, 4 can all run simultaneously
- Agent 5 should start as soon as Agent 1 completes onboarding

---

## KPIs to Track (from Research)

### Activation & Retention
- Onboarding completion rate (target: >70%)
- Day 1 first workout completion
- Day 7 retention (target: >40%)
- Day 30 retention (target: >20%)
- First nutrition log within 48 hours
- First hydration log within 24 hours
- Weekly active users

### Engagement & Adherence
- Workouts completed vs. planned (weekly)
- Nutrition logging streak length
- Hydration goal achievement rate
- Weekly check-in completion rate
- Return rate after 3+ day gap

### Monetization (when applicable)
- Trial start rate on Day 0
- Trial-to-paid conversion (target: >30% based on category benchmarks)
- Day 35 download-to-paid conversion
- Annual plan mix (target: >60%)
- Churn rate
- Refund/chargeback rate

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| AI-first UX backlash (Lifesum pattern) | Position AI as optional accelerator; manual-first, AI-assist posture |
| Feature bloat from "all-in-one" scope | Modular toggle architecture already in place — keep it and extend |
| Subscription pricing backlash | Generous free tier; paywall only after demonstrated value; transparent cancellation |
| Regulatory compliance gaps | Trust Center in Phase 3; design data handling for CPRA/HBNR from the start |
| Wearable integration scope creep | Start with Strava only; defer HealthKit/Google Fit to native app phase |
| Unhealthy behavior reinforcement | Safety guardrails in Phase 1; non-shaming tone throughout; professional referral flows |

---

## Contingency Scenarios (from Research Sensitivity Analysis)

The roadmap above assumes moderate subscription willingness, rules-based personalization evolving toward adaptive, and limited initial integration scope. If assumptions shift:

**If subscription willingness is LOW:** Lean harder into the generous free tier. Minimize paywall friction — consider moving barcode scanning and photo AI to free tier and monetizing only advanced coaching + meal planning depth. Keep annual pricing but add a low-cost monthly option. Prioritize ultra-fast manual logging over AI features.

**If integration scope stays LIMITED (no native app soon):** Don't promise "smart insights from your wearable." Double down on manual logging speed (barcode, quick-add, templates) and make the web experience excellent. Strava web OAuth is still viable; defer HealthKit/Google Fit entirely until native.

**If personalization stays RULES-BASED (not adaptive AI):** Lean into transparency as the differentiator. Show users the exact rules driving their plan ("3 days/week + intermediate = PPL split"). Users tolerate simpler recommendations when they understand the logic. Avoid "black box" framing.

---

## Open Questions for the Team

1. **Native app timeline:** The research assumes mobile-first. IronZ is currently web-only. When does React Native / Flutter / native development start? This affects push notifications, HealthKit, and barcode camera access.

2. **Food database strategy:** Barcode scanning needs a food database. Open Food Facts is free but incomplete. Do we license a commercial database (Nutritionix, FatSecret) or build our own over time?

3. **AI model costs:** AI workout generation, meal suggestions, and photo logging all have inference costs. What's the per-user AI budget, and how does this affect free tier scope?

4. **Beachhead segment decision:** The research identifies "Beginners + Busy Professionals" as the recommended beachhead. Does the team agree, or do we want to optimize for Weight Recomp Planners (higher WTP but more competitive)?

5. **Outlook Calendar sync status:** The Connected Apps section has an Outlook Calendar section with a `#cal-sync-section` div. Is this functional, partially built, or just UI? This affects integration roadmap priority.

---

*This roadmap is designed to be fed directly to Claude Code agents. Each section under the phased roadmap contains enough context for an agent to begin implementation without additional briefing.*
