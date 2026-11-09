# IronZ Adaptive Coach: Spec v0.2 (draft for review)

Status: **draft, nothing built.** v0.2 adds Chase's decisions and the research behind the auto-adjust limits (section 14). Written 2026-11-09 by Claude for review by Codex and approval by Chase. No app code changes until this is approved.

Source: a working personal coaching agent the owner has run daily since Oct 2026 (Claude + Strava + Intervals.icu wellness synced from Garmin + calendar). This doc keeps that agent's **method only**. Personal data (health history, current numbers, schedule, locations, account IDs, connector URLs) is deliberately excluded because this repo is public. Do not add it.

How this relates to the master spec: `PLAN_GENERATOR_MASTER_SPEC.md` builds the plan. This doc defines how the plan **adapts day to day and week to week** once the athlete is training. When approved, the rules here move into the master spec (sections 12, 14, 15 and a new section for the coach loop) per the spec sync rule. Conflicts with the master spec are listed in section 10.

---

## 1. What the coach does

Every day it reads what the athlete did, how their body is responding, and what is on the plan; grades the last session against what was prescribed; and decides today's session. Every week it reviews the week, tracks trends, and drafts next week for approval. It explains why, so the athlete learns to read their own numbers.

The athlete experience the owner wants to replicate:
- A short morning brief: yesterday's verdict, body status, today's session with targets, fueling, the why.
- A weekly review with trends, a body check, and a draft of next week to approve.
- Trend tracking and coaching tips that get specific over time.
- Plan changes that land everywhere at once (app, calendar, watch).
- Notifications the user controls: daily and weekly on or off, and the time they arrive.

---

## 2. Coaching principles (from the agent's hard rules, generalized)

These apply to every message the coach generates.

| # | Principle | What it means in the product |
|---|---|---|
| P1 | **Decide, don't delegate** | The coach makes the training call. It never hands the athlete a menu ("cut to 40 if sore, or skip"). |
| P2 | **One prescription per session** | Exactly one version of a session exists at a time, in the app and on the watch. If conditions change, the coach replaces it; it doesn't attach conditional variants. |
| P3 | **Grade against the prescription** | A session is judged against what was actually prescribed (targets, caps, structure), never against a generic standard. |
| P4 | **Prescribe ceilings** | Athletes treat the top of a range as the target. Upper bounds are ceilings; anything above the range is graded too hard. |
| P5 | **Call it both ways** | Too hard (gray-zone easy days, unplanned efforts, ignored caps) and too soft (skipped or watered-down key sessions, flat trends, skipped strength). Praise only what the data earns. |
| P6 | **Verify before critiquing** | Check the data and the prescription before calling something wrong. Account for data quality (section 4). Never issue a critique that later needs retracting. |
| P7 | **Hold the line, but listen** | Don't reverse a call because the athlete pushes back; reverse it when they bring new information. |
| P8 | **Read data, don't ask for it** | Only ask the athlete for what sensors can't provide: strength loads and reps, fueling amounts, how they feel, pain. |
| P9 | **Teach the why** | Each message explains the purpose of a session and what "good" looks like. Rotate topics so it doesn't repeat. |
| P10 | **Recovery, nutrition, hydration are training** | Every daily brief and weekly plan includes a specific what/why/how for all three, tied to that day's session and the next key session. No generic tips. |
| P11 | **Lead with the verdict** | First line is the answer. Short, plain, no filler or pep talk. |

Tone note: the owner's agent is deliberately blunt. For other users, directness should be a setting (section 8), but P1 to P6 and P10 hold at every tone.

---

## 3. Inputs

| Input | Examples | Source (now) | Source (target) | Required? |
|---|---|---|---|---|
| Plan / prescription | session type, duration, targets, caps, purpose | IronZ plan | Rule Engine output | Yes |
| Completed activities | duration, HR, power, pace, cadence, laps, streams | Strava pull (exists) | + Intervals.icu, Apple Health | Yes |
| Wellness | HRV, resting HR, sleep duration, weight | none | Intervals.icu OAuth (Garmin, Whoop, Oura already flow into it), Apple Health | Optional; coach degrades gracefully |
| Load | fitness (CTL), fatigue (ATL), form (TSB) | none | computed in IronZ from activities, or read from Intervals.icu | Optional |
| Availability | busy days, travel, firm vs tentative events | none | user-set busy days first; calendar later | Optional |
| Athlete reports | strength loads/reps, fueling (g carbs/hr, fluid, sodium), RPE, soreness, pain, mood | check-in (weekly only) | daily one-tap check-in + free text | Optional |
| Thresholds and zones | FTP, CSS, run threshold pace, HR caps | profile (exists) | same, with test-based refresh | Yes |

Baselines: wellness rules compare against the athlete's own normal range, never population norms. Method (HRV-guided training research, section 14): the **7-day rolling average** of HRV (ln rMSSD) is compared with the athlete's **normal range** (mean ± 0.5 SD of the 7-day average over the last 30 to 60 days). Single-day values are notes, not triggers. Until 14 days of data exist, wellness rules stay off and the coach says so; until 30 days, it says the range is provisional.

The coach must work **without HRV** (e.g., Garmin users connected through Apple Health, where Garmin HRV likely doesn't sync): resting HR, sleep, load, and the daily check-in still drive readiness. HRV improves the call; it isn't required.

---

## 4. Data quality rules

The agent learned these the hard way. Each prevents a wrong critique (P6).

- **Wrist HR is unreliable at the edges.** During runs it can lock onto cadence; cross-check against pace before calling a run too hard. It reads low during lifting. Ignore it in the pool.
- **Missing HR isn't missing effort.** Activity files sometimes drop HR; check the original source before calling it missing.
- **Swim distance from the watch miscounts.** Prefer the athlete's logged splits.
- **Late sync.** Wellness can land after the morning brief time. If today's wellness is partial, re-pull before deciding; if still missing, decide from trend and say so.
- **Unlogged ≠ not done.** Some sessions (mobility, strength on some devices) don't upload. Don't call a session missed from absence of a file alone; ask once.
- **Chat-reported data counts.** Fueling or loads the athlete types anywhere count as logged.
- **Cadence units.** Some sources report single-foot run cadence; normalize to steps per minute.
- **Unknown recovery is not good recovery.** Missing wellness data is "unknown," never "good." (Current code treats missing check-in as `good`; see section 11.)

---

## 5. Daily loop

**When:** user-chosen time (default 6:45am local), only on days with a session or the day after one.

### 5a. Readiness

Inputs: last 7 to 14 days of HRV, resting HR, sleep, plus load and yesterday's grade. Output: **Green / Easy / Rest**, with one line of evidence.

| Signal | Note (single day) | Downgrade trigger (sustained) |
|---|---|---|
| Resting HR | 3+ bpm over baseline | 5+ bpm over baseline for 3 days |
| HRV | single low reading | 7-day average outside the normal range (below, or unusually high) |
| Sleep | under 6.5 hrs | under 6.5 hrs for 2+ nights |
| Form (TSB) | | below about -20 |
| Illness | | any symptoms below the neck |
| Pain | | sharp, localized, gait-changing, or worsening mid-session |

Rule: **one bad day is a note; 2 to 3 in a row is a downgrade.** Illness below the neck and pain rules act immediately.

Readiness levels:
- **Green:** no sustained triggers. Train as planned.
- **Easy:** one sustained trigger. Easy sessions get an auto cap (5b). Key sessions: the coach **proposes** converting to low intensity, the evidence-backed response in HRV-guided training.
- **Rest:** two or more sustained triggers, or illness below the neck, or the pain rule. **Applied automatically** (Chase's decision), as either:
  - **Full rest** if illness, pain, or sleep under 5 hrs; or
  - **Very light**: 20 to 30 min Zone 1, or mobility only, otherwise.
  Shown with the reason and undoable for that day.

Pain handling (from agent guardrails): stop that sport and swap to one that doesn't load the area; pain over 3/10 for 48 hrs means see a sports medicine doctor or PT. The coach never diagnoses.

Gated sessions: a key session can carry a gate (e.g., "sweet spot only if HRV and RHR are within baseline"). The gate is evaluated by the coach in the morning and resolves to **one** prescription (P2). The athlete never sees the gate as an option.

### 5b. Changing today's session: auto vs propose

The owner's rule: **small changes happen automatically; big changes are proposed for approval.** Increases in load are never automatic. Limits below are set from the research in section 14.

Principle: **protect the purpose of the session.** Auto changes only trim what isn't the point of the session. The main set of a key session is never auto-cut.

| Change | Auto | Propose |
|---|---|---|
| Drop strides, pickups, or accessory strength sets | Yes | |
| **Easy or recovery session:** shorten by up to 20% or 15 min, whichever is smaller | Yes | |
| **Key session (intervals, threshold, long):** trim only warmup/cooldown extras or easy filler, up to 10% or 10 min, whichever is smaller; main set untouched | Yes | |
| Lower an easy session's HR cap, or swap for an equal-or-lower-load easy session | Yes | |
| Readiness = Rest: convert to full rest or very light (5a) | Yes | |
| Readiness = Easy: convert a key session to low intensity | | Yes |
| Any cut to a key session's main set (fewer reps, lower target) | | Yes |
| Shorten beyond the auto limits | | Yes |
| Move a key session to another day | | Yes |
| Skip a key session | | Yes |
| Any increase: duration, intensity, extra session | | Yes |
| Change next week's volume | | Weekly review only |

Every auto change is shown in the brief ("Shortened to 45 min: RHR up 5 for 3 days") and is undoable for that day. A proposal is a single recommended change with the reason and one-tap Accept / Keep original (P1: one recommendation, not a menu). **If the athlete doesn't respond by session time, the original stands** (Chase's decision). Rest-level changes are already applied, so they don't wait.

Missed sessions: **a missed session is gone, not rescheduled by default.** Missed easy or recovery sessions are never made up. A missed key session can move 1 to 2 days only if it doesn't create back-to-back hard days or displace another key session; that move is a proposal. Never stack missed volume: no single day grows more than about 25% to absorb it.

Hard constraints still apply after any change: no back-to-back hard days, quality-session limits (section 9).

### 5c. Grading yesterday

| Session type | Good | Too hard | Too soft |
|---|---|---|---|
| Easy (run/ride) | HR under cap; cardiac drift under ~5% | drift 5-8%+; HR over cap for 5+ min; pace well under easy range ("turned into a workout") | |
| Intervals / threshold | reps inside the band; HR settles; recovery between reps is quick | any rep faster/harder than the ceiling (P4) | reps cut, skipped, or under the band |
| Long session | duration hit, steady effort, fueling logged | fade + HR drift late | cut short without a readiness reason |
| Strength | sets/reps/loads logged; HR falls toward baseline within 1-2 min between sets | | skipped or short |
| Swim | logged splits inside target paces | | yardage well under plan |

Trend logic: same output at lower HR = fitter. Higher HR at the same output = fatigue, heat, sleep, or illness.

### 5d. Daily brief format (readable in about 60 seconds)

1. **Yesterday:** verdict per session plus the 1 to 2 numbers that justify it.
2. **Body:** one line plus Green / Easy / Rest.
3. **Today:** the session, its time slot, whether it's on the watch, main-set targets, and what HR should look like.
4. **Fueling:** for any session over 75 min (carbs per hour, fluid, sodium).
5. **Recovery:** sleep target, protein, and hydration tied to tomorrow's session.
6. **Why:** one or two sentences.

Push notification: the first line of the brief only (e.g., "Easy day: RHR up 3 days. 45 min ride, HR under your easy cap"). The full brief opens in the app.

---

## 6. Weekly loop

**When:** user-chosen day and time (default Sunday 7:30pm local).

Two steps, so nothing changes without approval:

**Step 1: Review + draft.**
1. Week vs plan table, one verdict per key session.
2. Trends (section 7).
3. What the data says: the 2 to 3 things that matter.
4. Recovery and body: wellness vs baseline, weight trend.
5. Body check: **push / hold / back off**, with criteria.
6. Draft next week, day by day, with a one-line why per key session.
7. Coach's corner: one rotating explainer.
8. Goal pulse: is the goal still right given the data? Be honest in both directions.
9. One habit or focus for the week.
10. The question: "Anything coming up this week? Approve or tell me what to change."

**Step 2: Commit** (after Approve or edits): finalize the week, write it to the plan, push sessions to the watch and calendar, show a confirmation table (day, session, time, on watch yes/no).

If the athlete never responds: log the review and keep the draft visible, but don't change the watch or calendar.

---

## 7. Trend tracking

A weekly record per athlete, append-only (never overwrite history):

| Field | Example |
|---|---|
| Week, phase | Week 12, Build |
| Planned vs done hours, by sport | 8.0 / 6.5 |
| Key sessions hit / planned | 3 / 4 |
| Intensity distribution | % easy vs hard |
| Wellness averages vs baseline | HRV, RHR, sleep |
| Fitness markers | pace or power at fixed HR, test results |
| Fueling compliance | sessions logged at target carbs/hr |
| Weight trend | direction only in UI by default |
| Verdict | undercooked / on target / overreaching |

**Recurring pattern detection.** The agent's most useful coaching came from naming repeat behaviors. Detect and surface these (count instances, show once a pattern hits 2 to 3):
- Easy sessions turning into workouts.
- Quality sessions above the prescribed ceiling, followed by heavy legs.
- Late-session fade (cadence or pace drop, HR drift).
- Social or late nights dropping HRV and raising RHR for 1 to 3 days.
- Fueling under target or unlogged on long sessions.
- A sport chronically under target volume.
- Strength sessions short or missed.
- Volume undercooked while intensity is overcooked (too many hard days).

Each pattern gets one concrete fix, not a lecture.

---

## 8. User controls

Store in `notification_preferences` (exists) plus a new coach-settings record.

| Setting | Default | Notes |
|---|---|---|
| Adaptive coach | On for users with a plan | Off = static plan, no auto changes |
| Daily brief | On, every day | Time picker; option for training days only; local time zone (IANA, not a UTC offset) |
| Weekly review | On | Day + time picker |
| Auto-adjust small changes | On | Off = everything is a proposal, except Rest-level readiness, which still applies |
| Channels | Push | Email optional for weekly |
| Coach style | Direct | Direct / Supportive. Changes wording only, never the call |
| Wellness sources | none | Connect Intervals.icu and/or Apple Health; each revocable (see 14c) |
| Quiet hours | 9pm to 6am | No pushes inside |

Privacy: wellness data is used only to coach the athlete it belongs to, never shown to other users or coaches without explicit opt-in, never sent to analytics or error logs.

---

## 9. Guardrails (always override the push)

From the agent, and they mostly match the master spec:
- Run volume up no more than about 10% a week; long run no more than about 30% of weekly run volume.
- Total hours up no more than 10 to 15% a week, except after a recovery week.
- Every 4th week is a recovery week.
- Quality sessions: max 2 a week in base, 3 in build. No back-to-back hard days.
- Strength 2x a week through base, 1x a week race-specific.
- Readiness and pain rules in 5a.
- Never suggest a calorie deficit or weight-loss target inside the coach loop.
- Never raise load from wearable data alone.
- Don't schedule heat or sauna exposure before key sessions or the night before tests.
- Any user-reported medical restriction (e.g., a clinician's limits after an injury or procedure) overrides the plan until cleared. The coach asks for the restriction in plain terms and doesn't interpret it.

---

## 10. Conflicts with the current master spec (need a decision)

| Topic | Master spec today | Agent method | Recommendation |
|---|---|---|---|
| Recovery state (12a) | from weekly self-report only | daily, from wearables + reports | Add wearable-based daily readiness; keep self-report as fallback |
| Missing recovery data | treated as `good` | unknown ≠ good | Add `unknown` state |
| Run volume cap | 10% beginner/intermediate, 15% advanced | ~10% for run specifically | Cap run at 10% for all levels; keep 15% for total hours (advanced) |
| Deload size (12c) | volume down 40-60% | about one third less | Make it level-dependent: 30% advanced, 40% others |
| Adaptation rules (12b) | 2+ weeks of "too hard" feedback | data trend over days | Keep 12b as fallback when there's no wearable |
| Tone (15) | advanced: "trusts the athlete's self-regulation"; "celebrate consistency" | prescribe ceilings; praise only what data earns | Coach style setting; P4 and P5 apply to all |
| Quality-session cap | not explicit by phase | 2 base / 3 build | Add to section 6 constraints |

---

## 11. Gap analysis: IronZ today vs this spec

| Capability | IronZ today | Gap | Label |
|---|---|---|---|
| Activity data | Strava pull into the workout log (`strava-integration.js`) | Not compared to the prescription; no grading | must-have |
| Wellness data | none | Intervals.icu OAuth (wellness + calendar scopes); Apple Health later | must-have |
| Readiness | `adaptive-coach.js`: 2-of-3 weekly check-ins; `AthleteClassifier.deriveRecoveryState` defaults to `good`; `feedback-loop.js` writes a different field shape (Codex finding) | Rebuild per 5a; one check-in contract; add `unknown` | must-have |
| Changing a session | `adjustPlanIntensity` flips a `load` label, not the actual workout (Codex finding) | Change the real prescription; auto vs propose; undo; reason shown | must-have |
| Grading | none | Per 5c; needs prescription + activity matching | must-have |
| Daily brief | `check-workout-reminders` sends a "you have a workout" push at a user time (time zone issue noted by Codex) | Brief content, readiness, IANA time zones | must-have |
| Weekly review | `weekly-checkin.js`: Sunday self-report form | Review + draft + approve flow | valuable soon after launch |
| Trend log | `stats.js` summaries | Append-only weekly record + pattern detection | valuable soon after launch |
| Push to watch | none for Garmin (Strava upload exists) | Intervals.icu calendar write → Garmin; workout text rules (appendix A) | future differentiator |
| Calendar placement | `calendar-sync.js` (Codex: empty client ID, non-idempotent exports) | Fix, then availability-aware placement | future differentiator |
| Notification settings | `notification_preferences` + push infra exist | Add daily/weekly toggles, day picker, coach style | must-have |
| LLM wording | `ask-ironz` / `ai-proxy` exist (Codex: quota race, model allowlist) | Rules decide, LLM only writes the explanation; fix quota first | must-have (after fixes) |

**Design rule for Codex and Claude:** the decision (readiness, grade, change) is made by deterministic, tested rules in the Rule Engine. The LLM only turns the decision and its evidence into the brief's wording. This keeps calls consistent, testable, and explainable, and stops the LLM from inventing changes.

---

## 12. Proposed build order

Each step is its own PR with tests. Security and sync fixes already queued come first.

0. **Prerequisites:** profiles security (PR #14), sync data-loss fix (Codex), one plan engine (Rule Engine wired in).
1. **Prescription ↔ activity matching + grading** (5c) using Strava data already in the app. Visible value with no new integration.
2. **Wellness ingest via Intervals.icu OAuth** (edge function, tokens server-side like Strava) + baselines.
3. **Readiness + auto/propose engine** (5a, 5b) with undo and reasons. Unit tests on every threshold.
4. **Daily brief** (5d) through existing push infra + IANA time zones + settings (section 8).
5. **Weekly review two-step** (section 6) + append-only trend log (section 7).
6. **Pattern detection** (section 7).
7. **Watch push** via Intervals.icu calendar (appendix A); calendar placement later.

---

## 13. Decisions (Chase, 2026-11-09)

| # | Question | Decision |
|---|---|---|
| 1 | Unanswered proposal at session time | **Original plan stands** |
| 2 | Auto-shorten limit | **Set from research** (section 14a): easy 20% / 15 min; key sessions 10% / 10 min from non-main-set parts only |
| 3 | Can Rest apply automatically? | **Yes**: full rest or a very light session, by the rules in 5a |
| 4 | Intervals.icu as a wellness source | **OK**, with the account-friction trade-off in 14c |
| 5 | Daily brief frequency | **Every day by default**, user-customizable (on/off, time, training days only) |

Still open:
- Confirm on a real iPhone which Garmin metrics land in Apple Health (HRV in particular) before committing to Apple Health as the mainstream path.
- Whether a wellness aggregator (no extra user account, paid per user) is worth evaluating later.

---

## 14. Research behind the limits

### 14a. Auto-shorten limits

There is no published "safe percent" for cutting one session; the numbers are a judgment call anchored on:
- Coaching consensus: when time is short, shorten the session but keep its main purpose; a missed session is gone and shouldn't be crammed elsewhere ([Coach Ray, 2026](https://www.coachray.nz/2026/08/09/rays-rules-for-adjusting-your-training-plan-when-life-gets-in-the-way/); [CTS, Carmichael](https://trainright.com/missed-workouts-guide-to-adjusting-training/)).
- Missed recovery runs don't need replacing; when redistributing missed volume, no day should grow more than ~25% ([CTS, Koop](https://trainright.com/?p=25360)).
- Fitness is maintained through much larger volume cuts (33 to 66% per session) as long as intensity is kept ([road.cc summary of the maintenance literature](https://road.cc/content/feature/how-get-most-your-limited-training-time-281989); [CTS, Rutberg](https://trainright.com/minimum-amount-of-training-needed-cycling/)).
- Interval sessions can move 2 to 3 days at most and must not create back-to-back hard days ([running.COACH](https://blog.runningcoach.me/en/2025/08/08/missed-a-workout-how-to-deal-with-deviations-from-your-plan/)).

So: a 20% / 15 min trim of an easy session is far inside what maintains fitness and doesn't touch the session's purpose; key sessions are protected by only trimming non-main-set parts, and anything that changes the main set goes to the athlete.

### 14b. Readiness and intensity changes

- HRV-guided training trials (Kiviniemi 2007; Vesterinen 2016; Javaloyes 2019) used one rule: do the planned hard session when HRV is within the athlete's normal range; switch to low intensity or rest when it isn't. HRV-guided groups did less high-intensity work and improved as much or more ([HRV4Training summary](https://www.hrv4training.com/blog2/training-prescription-guided-by-heart-rate-variability); [TrainingPeaks](https://trainingpeaks.com/blog/new-study-widens-hrv-evidence-for-more-athletes)).
- Use the 7-day rolling average against a normal range (about ±0.5 SD), not single days; 4 to 5 readings a week are enough ([TrainingPeaks](https://trainingpeaks.com/blog/new-study-widens-hrv-evidence-for-more-athletes)).
- Newer protocols also treat an unusually **high** 7-day average as a caution sign, not a green light ([Altini](https://hrv4training.substack.com/p/week-29-a-brief-history-of-heart)).

### 14c. Wellness sources: trade-offs

| Criterion | Intervals.icu (OAuth) | Apple Health (HealthKit) |
|---|---|---|
| Extra account for the user | **Yes** (free Intervals.icu account, linked to Garmin/Whoop/Oura) | No |
| HRV from Garmin | Yes | Likely no (Garmin doesn't appear to sync HRV natively; verify) |
| Resting HR, sleep, workouts | Yes | Yes |
| Push structured workouts to the watch | **Yes** (calendar scope → Garmin) | No |
| Platforms | iOS, Android, web | iOS only |
| Build effort | Low: edge function + OAuth, same pattern as Strava | High: requires bundling the iOS app + a native plugin |

Recommendation: build Intervals.icu first (cheap, works with today's web architecture, the owner's own setup for dogfooding, and the only path to the watch). Position it as the "connect your Garmin" path for serious athletes. Add Apple Health once the app is bundled, as the no-extra-account path. Readiness must work without HRV so Apple Health users still get a real coach.

## Appendix A: Structured workout export rules (verified on a Garmin via Intervals.icu)

For when IronZ pushes workouts to a watch through Intervals.icu:
- Every ride, run and swim goes to the watch; strength and mobility don't (app/calendar only).
- One workout per session. Same name + day updates in place; if a session moves or is renamed, delete the old one first. Never push variants.
- No target on warmups, cooldowns, recoveries, strides, or efforts under 2 min (HR lags and the watch beeps).
- Easy blocks: wide HR range with a low floor (e.g., from well below the easy range up to the easy cap) so alerts only fire at the cap.
- Bike work in absolute watts; runs by HR.
- Tag step types explicitly (`intensity=warmup|cooldown|recovery|rest`) or every step becomes a work interval. Swim rests must be tagged `intensity=rest`, or the watch treats rest as a timed swim.
- Swims in the pool's unit (yards or meters, multiples of the pool length), with a rest step between sections.
- Runs with strides end with a 5-min easy cooldown; stride count and recovery must match everywhere they're shown.
- After upload, check the parsed step count; if 0, simplify and retry once, then fall back to copy-paste text.
- HR target alerts only fire when the workout is started from the watch's workout list. Recommend standing high-HR alerts as a backup.

Example (easy run with strides; values illustrative):
```
Warmup
- 5m intensity=warmup
Main Set
- 30m 110-140bpm
Strides 6x
- 20s
- 40s walk or jog intensity=recovery
Cooldown
- 5m intensity=cooldown
```
