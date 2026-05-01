// add-session-mode.js — Plan-Aligned vs Freestyle for the Add Session flow.
// Implements Section 6c of PLAN_GENERATOR_MASTER_SPEC.md (specified in-prompt
// on 2026-04-20; not yet merged into the spec document).
//
// Two modes:
//   Plan-Aligned — default when an active plan exists. Reads plan context
//     (phase, strengthRole, goal, sport profile, this week's sessions,
//     tomorrow's schedule) and filters workout_library by phase/level/sport.
//     Applies Section 5 strength-role caps, limits today's intensity if
//     tomorrow has a key session, and soft-warns when weekly volume is
//     already at spec target.
//   Freestyle — no plan context. User picks sport, muscle groups, duration,
//     intensity. Full exercise DB, no phase filter. One guardrail: a
//     non-blocking warning when a key session is within 24 hours.
//
// Exposes: AddSessionMode.{init, current, setMode, hasActivePlan,
//                         getPlanContext, maybeWarnOnTypeSelect}

(function (global) {
  "use strict";

  // ── State ────────────────────────────────────────────────────────────────
  let _currentMode = "freestyle"; // "plan_aligned" | "freestyle"
  let _currentDate = null;
  let _cachedContext = null;

  // Key sessions = hard efforts whose recovery window we should respect
  // when stacking another workout against them. These names / session
  // types flag the surrounding day-window.
  const _KEY_SESSION_PATTERNS = [
    /\btempo\b/i, /\bvo2\b/i, /\bthreshold\b/i,
    /\blong\s*(run|ride|bike)\b/i, /\brace\s*pace\b/i,
    /\bintervals?\b/i, /\bhard\b/i, /\bspeed\b/i, /\bhill\s*repeats?\b/i,
  ];
  const _KEY_SESSION_TYPES = new Set([
    "tempo", "tempo_threshold", "threshold", "vo2max", "vo2", "speed_work",
    "long_run", "long_ride", "hard", "intervals", "hills",
  ]);

  // ── Plan detection ───────────────────────────────────────────────────────
  // An "active plan" = at least one trainingPlan entry dated today or later,
  // OR at least one future upcoming race event. Users who cleared their
  // plan but still have a race on the calendar also count — the plan can
  // be regenerated from events on demand.
  function hasActivePlan() {
    const todayStr = _getTodayStr();
    try {
      const plan = JSON.parse(localStorage.getItem("trainingPlan") || "[]");
      if (Array.isArray(plan) && plan.some(e => e && e.date && e.date >= todayStr)) return true;
    } catch {}
    try {
      const events = JSON.parse(localStorage.getItem("events") || "[]");
      if (Array.isArray(events) && events.some(e => e && e.date && e.date >= todayStr)) return true;
    } catch {}
    return false;
  }

  // ── Plan context derivation ──────────────────────────────────────────────
  // Returns the bundle a Plan-Aligned generator needs to filter library
  // rows and decide on soft warnings. All lookups are localStorage-only —
  // never blocks on a network call.
  function getPlanContext(dateStr) {
    const date = dateStr || _getTodayStr();
    if (_cachedContext && _cachedContext.date === date) return _cachedContext;

    const plan = _safeJSON("trainingPlan", []);
    const events = _safeJSON("events", []);
    const sched = _safeJSON("workoutSchedule", []);
    const logged = _safeJSON("workouts", []);

    // Phase: nearest trainingPlan entry (on or before the target date).
    // Falls back to "Base" if we can't find one — generic enough to filter
    // library rows without excluding everything.
    const phase = _phaseForDate(plan, date) || "Base";

    // Sport profile: triathlon | running | cycling. Taken from the nearest
    // upcoming race's type, or inferred from plan disciplines.
    const race = _nearestUpcomingRace(events, date);
    const sportProfile = _deriveSportProfile(race, plan);

    // strengthRole: user's declared role (injury_prevention | race_performance
    // | hypertrophy | minimal). Stored by onboarding-v2.
    let strengthRole = "minimal";
    try {
      const raw = localStorage.getItem("strengthRole");
      if (raw) {
        // Some call sites store the raw role string ("injury_prevention"),
        // others JSON-stringify it ('"injury_prevention"') or wrap it in
        // { role: ... }. Handle all three.
        let parsed;
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        if (typeof parsed === "string") strengthRole = parsed;
        else if (parsed && parsed.role)  strengthRole = parsed.role;
      }
    } catch {}

    // trainingGoals: array of ["race","speed_performance","build_endurance","lose_weight"].
    // Used for the Section 5c combo rules.
    let goals = [];
    try {
      const raw = localStorage.getItem("trainingGoals");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) goals = parsed;
      }
    } catch {}

    // Level: derived via TrainingZones if available.
    let level = "intermediate";
    try {
      if (global.TrainingZones && global.TrainingZones.loadFromStorage) {
        const th = global.TrainingZones.loadFromStorage();
        const perSport = {
          run:  global.TrainingZones.classifyRunning?.(th),
          bike: global.TrainingZones.classifyCycling?.(th),
          swim: global.TrainingZones.classifySwim?.(th),
        };
        const derived = global.TrainingZones.overallLevel?.(perSport);
        if (derived) level = derived;
      }
    } catch {}

    // Weekly + tomorrow windows.
    const weekSessions = _sessionsInWeek(date, plan, sched, logged);
    const tomorrowSessions = _sessionsForDate(_addDays(date, 1), plan, sched);

    const ctx = {
      date,
      phase,
      sportProfile,
      strengthRole,
      goals,
      level,
      race,
      weekSessions,
      tomorrowSessions,
      tomorrowHasKeySession: tomorrowSessions.some(_isKeySession),
    };
    _cachedContext = ctx;
    return ctx;
  }

  // ── Weekly-volume check ──────────────────────────────────────────────────
  // Compares the week's already-scheduled session count against the spec
  // target for (sportProfile, phase, level). Returns { atTarget, count, target }.
  function weeklyVolumeCheck(context) {
    const count = (context.weekSessions || []).length;
    let target = 0;
    try {
      const PSD = global.PlanSessionDistribution;
      if (PSD && typeof PSD.getDistribution === "function") {
        const dist = PSD.getDistribution(
          _normalizeSportProfile(context.sportProfile),
          context.phase,
          context.level
        );
        if (dist) {
          target = Object.values(dist).reduce((s, n) => s + (Number(n) || 0), 0);
        }
      }
    } catch {}
    if (!target) target = 6; // generic fallback
    return { atTarget: count >= target, count, target };
  }

  // ── Warning entry point ──────────────────────────────────────────────────
  // Called from qeSelectType before it routes into the per-type form.
  // Returns a Promise<boolean> — true = proceed, false = user cancelled.
  // Non-blocking warnings resolve true after the user dismisses; only
  // explicit Cancel returns false.
  async function maybeWarnOnTypeSelect(type) {
    // Honor user's opt-out — if they've dismissed these once with
    // "Don't show again", skip the modal entirely.
    try {
      if (localStorage.getItem("addSessionWarningsDisabled") === "1") return true;
    } catch {}
    const mode = _currentMode;
    const ctx = mode === "plan_aligned" ? getPlanContext(_currentDate) : null;
    const warnings = [];

    if (mode === "plan_aligned" && ctx) {
      // 1. Weekly-over-target soft warning. Only fire when ADDING the
      // new session would push the user ABOVE target — being at target
      // just means the user is executing their plan, which isn't
      // something to warn about.
      const vc = weeklyVolumeCheck(ctx);
      if (vc.count + 1 > vc.target) {
        warnings.push(
          "This week has " + vc.count + " session" + (vc.count === 1 ? "" : "s") +
          " planned against a target of " + vc.target + " for your phase. " +
          "Adding another puts you over — fine occasionally, just be aware of recovery."
        );
      }
      // 2. Tomorrow-key-session note (non-blocking, intensity hint).
      if (ctx.tomorrowHasKeySession) {
        warnings.push(
          "Tomorrow has a key session on the plan. Consider keeping today easy / recovery so you show up fresh."
        );
      }
      // 3. Strength role cap (Section 5 + race-focused 3-compound ceiling).
      if (type === "strength") {
        const roleNote = _strengthRoleAtCap(ctx);
        if (roleNote) warnings.push(roleNote);
      }
      // 4. No-rest-day warning. Auto-generated plans reserve one rest
      // day per week for running-only athletes (6-day cap). If the user
      // is about to add a session that erases the last remaining rest
      // day, surface that explicitly.
      if (_wouldEraseLastRestDay(ctx)) {
        warnings.push(
          "Adding this session leaves you with no rest day this week. One full rest day is a big part of how your body adapts — consider swapping another session to an easier day instead."
        );
      }
    } else {
      // Freestyle: two guardrails — a 24h key-session warning, plus
      // the same no-rest-day check (applies whether or not you have an
      // active plan).
      const within24 = _keySessionWithin24h(_currentDate);
      if (within24) {
        warnings.push(
          "Heads up: " + within24.when + " has " + within24.label + ". " +
          "Stacking a hard session against it can hurt recovery."
        );
      }
      const freeCtx = { date: _currentDate };
      if (_wouldEraseLastRestDay(freeCtx)) {
        warnings.push(
          "Adding this session leaves you with no rest day this week. One full rest day is a big part of how your body adapts — consider swapping another session to an easier day instead."
        );
      }
    }

    if (warnings.length === 0) return true;
    return _showWarningModal(warnings);
  }

  // Returns a string warning if the user is at the Section-5 cap for their
  // strength role in the current phase, otherwise null. Counts THIS week's
  // existing strength sessions (scheduled + logged) against the role cap.
  function _strengthRoleAtCap(ctx) {
    const role = ctx.strengthRole;
    const phase = String(ctx.phase || "").toLowerCase();
    const strengthCount = (ctx.weekSessions || []).filter(s => {
      const t = String(s.type || s.discipline || "").toLowerCase();
      return t === "strength" || t === "weightlifting" || t === "bodyweight";
    }).length;

    // Section 5 caps per role + phase. Kept in sync with the spec.
    // "general" is the new neutral hybrid role (replaced "hypertrophy"
    // in the Build Plan picker — see onboarding-v2.js _HYBRID_STRENGTH_ROLES).
    // Programming is identical to the legacy hypertrophy caps; only
    // the body-comp side effect was removed. Both keys live on for
    // back-compat with existing users who still have role=hypertrophy.
    const caps = {
      race_performance: { base: 2, build: 1, peak: 1, taper: 0 },
      hypertrophy:      { base: 3, build: 2, peak: 2, taper: 0 },
      general:          { base: 3, build: 2, peak: 2, taper: 0 },
      injury_prevention:{ base: 2, build: 2, peak: 2, taper: 0 },
      minimal:          { base: 1, build: 1, peak: 1, taper: 0 },
    };
    const roleCaps = caps[role] || caps.minimal;
    const cap = roleCaps[phase] != null ? roleCaps[phase] : 2;

    // Additional race-focused heavy-compound absolute cap of 3/week.
    const racefocusCap = role === "race_performance" ? Math.min(cap, 3) : cap;

    if (strengthCount >= racefocusCap) {
      return "Strength volume for your " + _prettyRole(role) + " role in " + _prettyPhase(phase) +
             " is " + racefocusCap + "/week. You're already at " + strengthCount + ". Adding another can eat into your key-session recovery.";
    }
    return null;
  }

  // ── Mode toggle + init ───────────────────────────────────────────────────
  function init(dateStr) {
    _currentDate = dateStr || _getTodayStr();
    _cachedContext = null;
    const isPlanUser = hasActivePlan();
    _currentMode = isPlanUser ? "plan_aligned" : "freestyle";
    _renderToggle();
  }

  function current() { return _currentMode; }

  function setMode(mode) {
    if (mode !== "plan_aligned" && mode !== "freestyle") return;
    _currentMode = mode;
    _renderToggle();
    _renderModeBanner();
  }

  function _renderToggle() {
    const host = document.getElementById("qe-mode-toggle");
    if (!host) return;
    if (!hasActivePlan()) {
      host.innerHTML = "";
      host.style.display = "none";
      _renderModeBanner();
      return;
    }
    host.style.display = "";
    host.innerHTML =
      '<div class="qe-mode-toggle-inner" role="tablist">' +
        '<button type="button" role="tab" class="qe-mode-pill' +
          (_currentMode === "plan_aligned" ? " is-active" : "") +
          '" onclick="AddSessionMode.setMode(\'plan_aligned\')">Align with my plan</button>' +
        '<button type="button" role="tab" class="qe-mode-pill' +
          (_currentMode === "freestyle" ? " is-active" : "") +
          '" onclick="AddSessionMode.setMode(\'freestyle\')">Freestyle</button>' +
      '</div>';
    _renderModeBanner();
  }

  // Below the toggle, a one-liner describing what mode does. Helps new
  // users understand why the picker behaves differently in each mode.
  function _renderModeBanner() {
    const host = document.getElementById("qe-mode-banner");
    if (!host) return;
    if (!hasActivePlan()) {
      host.textContent = "";
      host.style.display = "none";
      return;
    }
    host.style.display = "";
    if (_currentMode === "plan_aligned") {
      const ctx = getPlanContext(_currentDate);
      host.textContent =
        "Plan-Aligned · " + _prettyPhase(ctx.phase) + " phase · " +
        _prettyRole(ctx.strengthRole) + " strength";
    } else {
      host.textContent = "Freestyle · no phase or role filtering";
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  function _getTodayStr() {
    if (typeof global.getTodayString === "function") return global.getTodayString();
    return new Date().toISOString().slice(0, 10);
  }

  function _safeJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || "null") || fallback; }
    catch { return fallback; }
  }

  function _addDays(dateStr, n) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function _weekBounds(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    const dow = d.getDay(); // 0=Sun
    const toMon = dow === 0 ? -6 : 1 - dow;
    const start = new Date(d); start.setDate(d.getDate() + toMon);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }

  function _sessionsInWeek(dateStr, plan, sched, logged) {
    const { start, end } = _weekBounds(dateStr);
    const inRange = (d) => d && d >= start && d <= end;
    const isRest = (e) => {
      const t = String(e.type || e.discipline || e.load || "").toLowerCase();
      return t === "rest";
    };
    // Dedup by (date, discipline) — the race plan writes a session into
    // BOTH trainingPlan and workoutSchedule, so a naive sum double-counts
    // the user's actual load and the "You're at target" warning fires on
    // Monday morning even though nothing has been done yet.
    const seen = new Set();
    const hits = [];
    const consider = (e) => {
      if (!e || !inRange(e.date) || isRest(e)) return;
      const disc = String(e.discipline || e.type || "").toLowerCase() || "?";
      const key = e.date + "::" + disc;
      if (seen.has(key)) return;
      seen.add(key);
      hits.push(e);
    };
    (plan || []).forEach(consider);
    (sched || []).forEach(consider);
    (logged || []).forEach(consider);
    return hits;
  }

  function _sessionsForDate(dateStr, plan, sched) {
    const hits = [];
    (plan || []).forEach(e => { if (e && e.date === dateStr) hits.push(e); });
    (sched || []).forEach(e => { if (e && e.date === dateStr) hits.push(e); });
    return hits;
  }

  // Would placing a new session on `dateStr` leave the athlete with no
  // rest day for the entire week? Used by maybeWarnOnTypeSelect to flag
  // the no-rest-day situation — one full rest day per week is the
  // non-negotiable floor for running-only athletes per §4d-i.
  function _wouldEraseLastRestDay(context) {
    const dateStr = (context && context.date) || _getTodayStr();
    const { start, end } = _weekBounds(dateStr);
    const plan = _safeJSON("trainingPlan", []);
    const sched = _safeJSON("workoutSchedule", []);
    const logged = _safeJSON("workouts", []);
    const hasSessionOn = (d) => {
      return (plan  || []).some(e => e && e.date === d && !/rest/i.test(String(e.type || "")))
          || (sched || []).some(e => e && e.date === d && !/rest/i.test(String(e.type || "")))
          || (logged|| []).some(e => e && e.date === d);
    };
    // Enumerate the 7 days of the week containing dateStr.
    const days = [];
    for (let d = new Date(start + "T00:00:00"); d <= new Date(end + "T00:00:00"); d.setDate(d.getDate() + 1)) {
      days.push(d.toISOString().slice(0, 10));
    }
    // "Rest days" before the hypothetical add = days in the week with no
    // session AND not equal to dateStr (since dateStr is the slot we're
    // about to fill). If that count is ≤ 1, adding erases the last rest.
    let rest = 0;
    for (const d of days) {
      if (d === dateStr) continue;
      if (!hasSessionOn(d)) rest++;
    }
    // dateStr itself — if it already has a session, we're stacking into
    // a training day, not erasing rest. Only warn when dateStr was the
    // rest day we're about to erase.
    if (hasSessionOn(dateStr)) return false;
    return rest === 0;
  }

  function _isKeySession(s) {
    if (!s) return false;
    const t = String(s.type || s.session_type || s.discipline || "").toLowerCase();
    if (_KEY_SESSION_TYPES.has(t)) return true;
    const name = String(s.sessionName || s.name || s.label || "").toLowerCase();
    return _KEY_SESSION_PATTERNS.some(rx => rx.test(name));
  }

  function _keySessionWithin24h(dateStr) {
    const date = dateStr || _getTodayStr();
    const plan = _safeJSON("trainingPlan", []);
    const sched = _safeJSON("workoutSchedule", []);
    const check = (offset, when) => {
      const d = _addDays(date, offset);
      const sessions = _sessionsForDate(d, plan, sched);
      const key = sessions.find(_isKeySession);
      if (!key) return null;
      return { when, label: key.sessionName || key.name || key.type || "a key session" };
    };
    return check(-1, "yesterday") || check(1, "tomorrow");
  }

  function _phaseForDate(plan, dateStr) {
    if (!Array.isArray(plan) || plan.length === 0) return null;
    // Prefer an exact-date entry; otherwise the newest entry on or before
    // the target date so phase labels carry through rest days.
    const exact = plan.find(e => e && e.date === dateStr && e.phase);
    if (exact) return exact.phase;
    const earlier = plan
      .filter(e => e && e.date && e.date <= dateStr && e.phase)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (earlier) return earlier.phase;
    // Plan starts after today — use the first phase.
    const first = plan.filter(e => e && e.phase).sort((a, b) => a.date.localeCompare(b.date))[0];
    return first ? first.phase : null;
  }

  function _nearestUpcomingRace(events, dateStr) {
    if (!Array.isArray(events)) return null;
    const upcoming = events
      .filter(e => e && e.date && e.date >= dateStr)
      .sort((a, b) => a.date.localeCompare(b.date));
    return upcoming[0] || null;
  }

  function _deriveSportProfile(race, plan) {
    if (race && race.type) {
      const t = String(race.type).toLowerCase();
      if (/tri|iron|sprint|olympic|70\.3/.test(t)) return "triathlon";
      if (/run|marathon|5k|10k|half/.test(t)) return "running";
      if (/bike|cycl|gran\s*fondo|century/.test(t)) return "cycling";
    }
    // Infer from the plan's disciplines.
    const disc = new Set((plan || []).map(e => e && e.discipline).filter(Boolean));
    if (disc.has("swim") && disc.has("bike") && disc.has("run")) return "triathlon";
    if (disc.has("bike") && !disc.has("run")) return "cycling";
    if (disc.has("run")) return "running";
    return "general";
  }

  function _normalizeSportProfile(sp) {
    const s = String(sp || "").toLowerCase();
    if (s === "triathlon") return "triathlon";
    if (s === "running")   return "running";
    if (s === "cycling")   return "cycling";
    return "running"; // closest general fallback that exists in the matrix
  }

  function _prettyPhase(p) {
    const s = String(p || "Base").toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function _prettyRole(r) {
    const map = {
      injury_prevention: "injury-prevention",
      race_performance:  "race-performance",
      hypertrophy:       "hypertrophy",
      general:           "general-strength",
      minimal:           "minimal",
    };
    return map[r] || (r || "minimal");
  }

  // ── Warning modal ────────────────────────────────────────────────────────
  // Non-blocking by default: the warnings are advisory, so the primary
  // button is "Add anyway." A secondary "Cancel" lets the user back out if
  // they decide the warning matters.
  function _showWarningModal(warnings) {
    return new Promise(resolve => {
      let overlay = document.getElementById("add-session-warn-overlay");
      if (overlay) overlay.remove();
      overlay = document.createElement("div");
      overlay.id = "add-session-warn-overlay";
      overlay.className = "quick-entry-overlay is-open";
      overlay.style.cssText = "display:flex;z-index:10200";

      const listHtml = warnings.map(w => "<li>" + _esc(w) + "</li>").join("");

      overlay.innerHTML =
        '<div class="quick-entry-modal" style="max-width:420px;padding:24px">' +
          '<h3 style="margin:0 0 12px">Before you add this</h3>' +
          '<ul style="margin:0 0 18px;padding-left:20px;line-height:1.5;color:var(--color-text);font-size:0.95rem">' +
            listHtml +
          '</ul>' +
          '<label style="display:flex;align-items:center;gap:8px;margin:0 0 14px;font-size:0.85rem;color:var(--color-text-muted);cursor:pointer">' +
            '<input type="checkbox" id="asw-silence" style="width:16px;height:16px;accent-color:var(--color-accent)">' +
            '<span>Don\u2019t show these again</span>' +
          '</label>' +
          '<button class="btn-primary" id="asw-go" style="width:100%;margin-bottom:8px">Add anyway</button>' +
          '<button class="btn-secondary" id="asw-cancel" style="width:100%;opacity:0.7">Cancel</button>' +
        '</div>';

      document.body.appendChild(overlay);
      const persistSilenceIfChecked = () => {
        try {
          if (document.getElementById("asw-silence")?.checked) {
            localStorage.setItem("addSessionWarningsDisabled", "1");
            if (global.DB && global.DB.syncKey) global.DB.syncKey("addSessionWarningsDisabled");
          }
        } catch {}
      };
      document.getElementById("asw-go").onclick = () => {
        persistSilenceIfChecked();
        overlay.remove();
        resolve(true);
      };
      document.getElementById("asw-cancel").onclick = () => {
        persistSilenceIfChecked();
        overlay.remove();
        resolve(false);
      };
    });
  }

  function _esc(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  // ── Export ───────────────────────────────────────────────────────────────
  global.AddSessionMode = {
    init,
    current,
    setMode,
    hasActivePlan,
    getPlanContext,
    weeklyVolumeCheck,
    maybeWarnOnTypeSelect,
  };
})(typeof window !== "undefined" ? window : globalThis);
