// coach-client-detail.js — Coach Portal client detail view (Phase 2B)
//
// Read-only view of one client's training stack. Four tabs:
//   • Calendar — this week's planned + completed workouts.
//   • Benchmarks — strength PRs + threshold paces from training_zones.
//   • Feedback — recent workoutRatings / effort feedback.
//   • Nutrition & Fueling — current settings OR "Disabled by client" per
//     section, gated by the user's own feature toggles.
//
// All data comes through the user_data + dedicated tables RLS landed in
// Phase 1 + 2A. If a query returns 0 rows where data is expected,
// it's RLS doing its job — render the disabled-by-client message rather
// than an empty section that looks broken.
//
// Phase 3 layers in [edit] buttons + the assignment flow on top.

(function () {
  "use strict";

  let _client = null;
  let _activeTab = "calendar";
  let _data = {
    schedule: [],          // workoutSchedule (planned)
    completed: [],         // workouts (logged)
    ratings: [],           // workoutRatings entries
    zones: null,           // trainingZones
    prs: null,             // personalRecords
    races: [],             // raceEvents
    flags: {               // current state of user toggles
      nutritionEnabled: true,
      hydrationEnabled: true,
      fuelingEnabled: true,
    },
    settings: {            // values for each feature, only present when enabled
      nutritionAdjustments: null,
      hydrationSettings: null,
      hydrationDailyTargetOz: null,
      fuelingPrefs: null,
    },
  };

  function _esc(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }

  // ── Entry point — called from coach-portal.js openClientDetail ────────
  async function loadCoachClientDetail(clientId) {
    const sb = window.supabaseClient;
    if (!sb || !clientId) return;

    const root = document.getElementById("coach-client-detail");
    if (root) root.innerHTML = `<div class="coach-loading">Loading…</div>`;

    try {
      // Profile (we already have it cached by coach-portal but re-fetch
      // for freshness in case the coach navigated directly).
      const profileRes = await sb.from("profiles")
        .select("id, full_name, email, gender, weight_lbs, age")
        .eq("id", clientId)
        .maybeSingle();
      _client = profileRes?.data || { id: clientId };

      // Pull every coach-readable data_key for this client in one go.
      // RLS filters silently — we just take what comes back.
      const dataRes = await sb.from("user_data")
        .select("data_key, data_value")
        .eq("user_id", clientId)
        .in("data_key", [
          "workoutSchedule", "trainingPlan",
          "workoutRatings", "personalRecords", "trainingZones",
          "raceEvents", "events",
          "nutritionEnabled", "hydrationEnabled", "fuelingEnabled",
          "nutritionAdjustments",
          "hydrationSettings", "hydrationDailyTargetOz",
          "fuelingPrefs",
        ]);
      const byKey = {};
      for (const r of (dataRes.data || [])) byKey[r.data_key] = r.data_value;

      // Logged workouts come from the dedicated table.
      const completedRes = await sb.from("workouts")
        .select("id, user_id, name, type, date, duration_minutes, completed, notes, created_at")
        .eq("user_id", clientId)
        .order("date", { ascending: false })
        .limit(60);

      _data.schedule  = _coerceArray(byKey.workoutSchedule);
      _data.ratings   = _coerceArray(byKey.workoutRatings);
      _data.zones     = byKey.trainingZones || null;
      _data.prs       = byKey.personalRecords || null;
      _data.races     = _coerceArray(byKey.raceEvents).concat(_coerceArray(byKey.events));
      _data.completed = completedRes.data || [];
      _data.flags = {
        nutritionEnabled: _readFlag(byKey.nutritionEnabled),
        hydrationEnabled: _readFlag(byKey.hydrationEnabled),
        fuelingEnabled:   _readFlag(byKey.fuelingEnabled),
      };
      _data.settings = {
        nutritionAdjustments:   byKey.nutritionAdjustments   || null,
        hydrationSettings:      byKey.hydrationSettings      || null,
        hydrationDailyTargetOz: byKey.hydrationDailyTargetOz || null,
        fuelingPrefs:           byKey.fuelingPrefs           || null,
      };

      _activeTab = "calendar";
      _render();
    } catch (e) {
      console.warn("[CoachClientDetail] load failed:", e);
      if (root) root.innerHTML = `<div class="coach-error">Couldn't load client data: ${_esc(e.message || "unknown")}</div>`;
    }
  }

  // Mirror is_feature_enabled() helper from the Phase 2A migration —
  // need the same logic client-side for UI display since the RLS just
  // hides rows; the FLAG row itself is always readable so we can decide
  // here whether to show a "Disabled by client" message.
  function _readFlag(v) {
    if (v == null) return true;
    if (typeof v === "boolean") return v;
    if (typeof v === "number")  return v !== 0;
    if (typeof v === "string")  return !["0", "false", ""].includes(v);
    if (typeof v === "object")  {
      if ("enabled" in v) return !!v.enabled;
      return true;
    }
    return true;
  }

  function _coerceArray(v) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object" && Array.isArray(v.entries)) return v.entries;
    return [];
  }

  // ── Render ────────────────────────────────────────────────────────────
  function _render() {
    const root = document.getElementById("coach-client-detail");
    if (!root) return;
    root.innerHTML = `
      <div class="coach-portal-header">
        <button class="btn-secondary btn-sm" onclick="backToCoachDashboard()" aria-label="Back to dashboard" title="Back">‹ Back</button>
        <h2 style="margin:0">${_esc(_client.full_name || _client.email || "Client")}</h2>
        <span></span>
      </div>

      <div class="card coach-client-meta">
        ${_renderClientMeta()}
      </div>

      <div class="coach-client-tabs">
        ${_tabBtn("calendar", "Calendar")}
        ${_tabBtn("benchmarks", "Benchmarks")}
        ${_tabBtn("feedback", "Feedback")}
        ${_tabBtn("nutrition", "Nutrition & Fueling")}
      </div>

      <div class="coach-client-tab-content">
        ${_renderActiveTab()}
      </div>
    `;
  }

  function _tabBtn(id, label) {
    const active = _activeTab === id ? " active" : "";
    return `<button class="coach-client-tab${active}" data-tab="${id}" onclick="setCoachClientTab('${id}')">${_esc(label)}</button>`;
  }

  function setCoachClientTab(id) {
    _activeTab = id;
    const wrap = document.querySelector(".coach-client-tab-content");
    if (wrap) wrap.innerHTML = _renderActiveTab();
    document.querySelectorAll(".coach-client-tab").forEach(b => {
      b.classList.toggle("active", b.dataset.tab === id);
    });
  }

  function _renderActiveTab() {
    switch (_activeTab) {
      case "benchmarks": return _renderBenchmarks();
      case "feedback":   return _renderFeedback();
      case "nutrition":  return _renderNutritionFueling();
      case "calendar":
      default:           return _renderCalendar();
    }
  }

  function _renderClientMeta() {
    const bits = [];
    if (_client.age)        bits.push(`Age ${_esc(_client.age)}`);
    if (_client.gender)     bits.push(_esc(_client.gender));
    if (_client.weight_lbs) bits.push(`${_esc(_client.weight_lbs)} lbs`);
    const upcoming = _findNextRace();
    if (upcoming) bits.push(`${_esc(upcoming.name || upcoming.type || "Race")} in ${_daysUntil(upcoming.date)} days`);
    return bits.length
      ? `<div style="font-size:0.85rem;color:var(--color-text-muted)">${bits.join(" · ")}</div>`
      : `<div style="font-size:0.85rem;color:var(--color-text-muted)">No profile details on file.</div>`;
  }

  function _findNextRace() {
    const today = new Date().toISOString().slice(0, 10);
    return _data.races
      .filter(r => r && r.date && r.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
  }

  function _daysUntil(date) {
    const d = new Date(date + "T00:00:00").getTime();
    const t = new Date().setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((d - t) / (1000 * 60 * 60 * 24)));
  }

  // ── Tab: Calendar (this week, planned vs completed) ───────────────────
  function _renderCalendar() {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
    const todayStr = today.toISOString().slice(0, 10);

    const rows = days.map(date => {
      const planned = (_data.schedule || []).filter(w => w?.date === date);
      const done = (_data.completed || []).filter(w => w?.date === date);
      const dayLabel = new Date(date + "T00:00:00")
        .toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      const isToday = date === todayStr;

      const items = [];
      for (const p of planned) {
        const matchedDone = done.find(d => (d.name && p.sessionName && d.name.toLowerCase() === p.sessionName.toLowerCase())
                                      || (d.type === p.type));
        items.push(`<div class="coach-cal-item${matchedDone ? " coach-cal-item--done" : ""}">
          <span class="coach-cal-name">${_esc(p.sessionName || _typeLabel(p.type) || "Workout")}</span>
          <span class="coach-cal-meta">${_esc(p.duration ? p.duration + " min" : "")}</span>
          ${matchedDone ? `<span class="coach-cal-status">✓ done</span>` : `<span class="coach-cal-status coach-cal-status--planned">planned</span>`}
        </div>`);
      }
      // Completed-only rows (logged but not on the schedule).
      for (const d of done) {
        const onSched = planned.some(p => (p.sessionName && d.name && d.name.toLowerCase() === p.sessionName.toLowerCase())
                                       || (p.type === d.type));
        if (onSched) continue;
        items.push(`<div class="coach-cal-item coach-cal-item--done">
          <span class="coach-cal-name">${_esc(d.name || _typeLabel(d.type) || "Workout")}</span>
          <span class="coach-cal-meta">${_esc(d.duration_minutes ? d.duration_minutes + " min" : "")}</span>
          <span class="coach-cal-status">✓ logged</span>
        </div>`);
      }
      if (!items.length) {
        items.push(`<div class="coach-cal-item coach-cal-item--rest">Rest</div>`);
      }

      return `<div class="coach-cal-day${isToday ? " coach-cal-day--today" : ""}">
        <div class="coach-cal-day-header">${_esc(dayLabel)}${isToday ? " · Today" : ""}</div>
        ${items.join("")}
      </div>`;
    }).join("");

    return `<div class="card">${rows}</div>`;
  }

  function _typeLabel(t) {
    const map = { running: "Run", cycling: "Ride", swimming: "Swim",
      weightlifting: "Strength", strength: "Strength", hiit: "HIIT",
      hyrox: "Hyrox", brick: "Brick", triathlon: "Brick", general: "Workout",
      yoga: "Yoga", bodyweight: "Bodyweight" };
    return map[t] || t;
  }

  // ── Tab: Benchmarks ──────────────────────────────────────────────────
  function _renderBenchmarks() {
    const z = _data.zones || {};
    const strength = z.strength || {};
    const running  = z.running  || {};
    const swimming = z.swimming || {};
    const hr       = z.heartRate || {};

    const liftRow = (label, key) => {
      const v = strength[key];
      if (!v || !v.weight) return "";
      const t = v.type ? ` (${_esc(v.type)})` : "";
      return `<div class="coach-bench-row"><span>${_esc(label)}</span><strong>${_esc(v.weight)} lbs${t}</strong></div>`;
    };

    let lifts = [
      liftRow("Bench Press", "bench"),
      liftRow("Back Squat",  "squat"),
      liftRow("Deadlift",    "deadlift"),
      liftRow("Overhead Press", "ohp"),
      liftRow("Barbell Row", "row"),
    ].filter(Boolean).join("") || `<div class="coach-bench-empty">No lifts logged.</div>`;

    let runRows = "";
    if (running.easy)   runRows += `<div class="coach-bench-row"><span>Easy pace</span><strong>${_esc(running.easy)}</strong></div>`;
    if (running.tempo)  runRows += `<div class="coach-bench-row"><span>Tempo / threshold</span><strong>${_esc(running.tempo)}</strong></div>`;
    if (running.vo2max) runRows += `<div class="coach-bench-row"><span>VO₂ max</span><strong>${_esc(running.vo2max)}</strong></div>`;

    let swimRows = "";
    if (swimming.css)   swimRows += `<div class="coach-bench-row"><span>CSS pace</span><strong>${_esc(swimming.css)}</strong></div>`;

    let hrRows = "";
    if (hr.max)     hrRows += `<div class="coach-bench-row"><span>Max HR</span><strong>${_esc(hr.max)} bpm</strong></div>`;
    if (hr.resting) hrRows += `<div class="coach-bench-row"><span>Resting HR</span><strong>${_esc(hr.resting)} bpm</strong></div>`;

    return `
      <div class="card">
        <div class="coach-bench-section-title">Strength 1RM / Working Refs</div>
        ${lifts}
      </div>
      ${runRows  ? `<div class="card"><div class="coach-bench-section-title">Running Zones</div>${runRows}</div>` : ""}
      ${swimRows ? `<div class="card"><div class="coach-bench-section-title">Swimming</div>${swimRows}</div>` : ""}
      ${hrRows   ? `<div class="card"><div class="coach-bench-section-title">Heart Rate</div>${hrRows}</div>` : ""}
    `;
  }

  // ── Tab: Feedback (recent ratings + notes) ────────────────────────────
  function _renderFeedback() {
    // workoutRatings is keyed by sessionId on the user's storage; coerce
    // to a flat list sorted newest-first.
    const list = [];
    if (Array.isArray(_data.ratings)) {
      for (const r of _data.ratings) list.push(r);
    } else if (_data.ratings && typeof _data.ratings === "object") {
      for (const k of Object.keys(_data.ratings)) {
        const r = _data.ratings[k];
        if (r) list.push({ ...r, sessionId: k });
      }
    }
    list.sort((a, b) => String(b.date || b.createdAt || "").localeCompare(String(a.date || a.createdAt || "")));

    if (!list.length) {
      return `<div class="card coach-feedback-empty">No feedback logged in the last 14 days.</div>`;
    }

    const FEEL_EMOJI = { easy: "🙂", "just right": "👍", just_right: "👍",
      hard: "😬", "crushed me": "🥵", crushed_me: "🥵" };

    const items = list.slice(0, 14).map(r => {
      const dateStr = (r.date || r.createdAt || "").slice(0, 10);
      const feel = (r.feel || r.rating || "").toString().toLowerCase();
      const emoji = FEEL_EMOJI[feel] || "•";
      return `<div class="coach-feedback-row">
        <span class="coach-feedback-emoji">${emoji}</span>
        <span class="coach-feedback-meta">${_esc(dateStr)} · ${_esc(r.workoutName || r.sessionId || "")}</span>
        ${r.notes ? `<div class="coach-feedback-notes">"${_esc(r.notes)}"</div>` : ""}
      </div>`;
    }).join("");

    return `<div class="card">${items}</div>`;
  }

  // ── Tab: Nutrition & Fueling ──────────────────────────────────────────
  // Three sections, each gated by the corresponding flag. When a flag is
  // off, render a "Disabled by client" message and HIDE values entirely
  // (don't even surface placeholders — would imply coach can see them).
  function _renderNutritionFueling() {
    return [
      _renderNutritionSection(),
      _renderHydrationSection(),
      _renderFuelingSection(),
    ].join("");
  }

  function _renderNutritionSection() {
    const enabled = _data.flags.nutritionEnabled;
    if (!enabled) return _disabledCard("Nutrition", "nutrition");

    const adj = _data.settings.nutritionAdjustments || {};
    const rows = [];
    if (adj.calories != null) rows.push(_settingRow("Daily calorie target", `${adj.calories} kcal`));
    if (adj.protein  != null) rows.push(_settingRow("Protein adjustment", `${adj.protein}x`));
    if (adj.carbs    != null) rows.push(_settingRow("Carbs adjustment",   `${adj.carbs}x`));
    if (adj.fat      != null) rows.push(_settingRow("Fat adjustment",     `${adj.fat}x`));

    return `<div class="card coach-feature-card">
      <div class="coach-feature-header">
        <span class="coach-feature-name">Nutrition</span>
        <span class="coach-feature-status coach-feature-status--on">Enabled by client ✓</span>
      </div>
      ${rows.length ? rows.join("") : `<div class="coach-feature-empty">Defaults — client hasn't customised any factors yet.</div>`}
    </div>`;
  }

  function _renderHydrationSection() {
    const enabled = _data.flags.hydrationEnabled;
    if (!enabled) return _disabledCard("Hydration", "hydration");

    const settings = _data.settings.hydrationSettings || {};
    const target = _data.settings.hydrationDailyTargetOz;
    const rows = [];
    if (target != null) rows.push(_settingRow("Daily target", `${target} oz`));
    if (settings.sweatRateOzPerHour != null) rows.push(_settingRow("Sweat rate", `${settings.sweatRateOzPerHour} oz/hr`));
    if (settings.sodiumPref) rows.push(_settingRow("Sodium pref", String(settings.sodiumPref)));

    return `<div class="card coach-feature-card">
      <div class="coach-feature-header">
        <span class="coach-feature-name">Hydration</span>
        <span class="coach-feature-status coach-feature-status--on">Enabled by client ✓</span>
      </div>
      ${rows.length ? rows.join("") : `<div class="coach-feature-empty">Defaults — client hasn't customised any factors yet.</div>`}
    </div>`;
  }

  function _renderFuelingSection() {
    const enabled = _data.flags.fuelingEnabled;
    if (!enabled) return _disabledCard("Fueling", "fueling");

    const prefs = _data.settings.fuelingPrefs || {};
    const rows = [];
    if (prefs.carbsPerHour != null) rows.push(_settingRow("Carbs per hour", `${prefs.carbsPerHour} g/hr`));
    if (prefs.gelSize)              rows.push(_settingRow("Gel size", String(prefs.gelSize)));
    if (Array.isArray(prefs.sources) && prefs.sources.length)
      rows.push(_settingRow("Preferred sources", prefs.sources.join(", ")));

    return `<div class="card coach-feature-card">
      <div class="coach-feature-header">
        <span class="coach-feature-name">Fueling</span>
        <span class="coach-feature-status coach-feature-status--on">Enabled by client ✓</span>
      </div>
      ${rows.length ? rows.join("") : `<div class="coach-feature-empty">Defaults — client hasn't customised any factors yet.</div>`}
    </div>`;
  }

  function _settingRow(label, value) {
    return `<div class="coach-feature-row">
      <span class="coach-feature-row-label">${_esc(label)}</span>
      <span class="coach-feature-row-value">${_esc(value)}</span>
    </div>`;
  }

  function _disabledCard(title, key) {
    return `<div class="card coach-feature-card coach-feature-card--off">
      <div class="coach-feature-header">
        <span class="coach-feature-name">${_esc(title)}</span>
        <span class="coach-feature-status coach-feature-status--off">Disabled by client ✗</span>
      </div>
      <div class="coach-feature-disabled-msg">Client has ${_esc(title.toLowerCase())} turned off. They control whether to enable it.</div>
    </div>`;
  }

  // ── Public surface ─────────────────────────────────────────────────────
  window.loadCoachClientDetail = loadCoachClientDetail;
  window.setCoachClientTab     = setCoachClientTab;
})();
