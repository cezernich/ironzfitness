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
  // Phase 3E: audit map + currently-editing field. _audit[data_key] =
  // { by: uuid, at: iso-timestamp } when the user_data row was last
  // edited by a coach. _editingFeature is the inline-edit cursor
  // ("nutrition.calories", "hydration.target", "fueling.carbsPerHour"
  // etc.) so only one field is open at a time.
  let _audit = {};
  let _editingFeature = null;
  // Phase 3B: lookup table for the Calendar tab. Each rendered planned
  // item gets an index here; the inline onclick references it so the
  // Edit handler can resolve back to the schedule entry without
  // string-encoding the JSON into the markup.
  let _calIndex = [];
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
      // RLS filters silently — we just take what comes back. Also pull
      // the audit columns so Phase 3E can surface "edited by [coach]
      // on [date]" under each value.
      const dataRes = await sb.from("user_data")
        .select("data_key, data_value, last_edited_by, last_edited_at")
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
      _audit = {};
      for (const r of (dataRes.data || [])) {
        byKey[r.data_key] = r.data_value;
        if (r.last_edited_by) {
          _audit[r.data_key] = { by: r.last_edited_by, at: r.last_edited_at };
        }
      }

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

    // Phase 5C: surface this coach's role for this client (primary vs
    // sub-coach). _coachDashState holds the assignments fetched at
    // dashboard load — find the row matching the current client.
    let roleBadge = "";
    const myAssignments = (window._coachDashState && window._coachDashState.assignments) || [];
    const myAssignmentForClient = myAssignments.find(a => a.client_id === _client.id);
    if (myAssignmentForClient) {
      const r = myAssignmentForClient.role === "sub" ? "Sub-coach" : "Primary coach";
      roleBadge = `<span class="coach-client-role-badge coach-client-role-badge--${myAssignmentForClient.role === "sub" ? "sub" : "primary"}">${r}</span>`;
    }

    const metaLine = bits.length
      ? `<div style="font-size:0.85rem;color:var(--color-text-muted)">${bits.join(" · ")}</div>`
      : `<div style="font-size:0.85rem;color:var(--color-text-muted)">No profile details on file.</div>`;

    return `${roleBadge}${metaLine}`;
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

    // Phase 3A.2: "+ Assign Workout" CTA at the top of the calendar.
    // Opens the build-from-scratch flow with the client's id + name
    // pre-filled. The trigger from 3A.1 mirrors any insert into the
    // user's workoutSchedule, so loadCoachClientDetail will refresh
    // and the new entry shows up below.
    const _clientName = _client.full_name || _client.email || "Client";
    // Pass clientId via dataset rather than embedding the name in the
    // onclick string — saves us from quoting headaches when names
    // contain apostrophes or quotes.
    const assignBar = `
      <div class="coach-cal-toolbar">
        <button class="btn-primary btn-sm"
                data-client-id="${_esc(_client.id)}"
                data-client-name="${_esc(_clientName)}"
                onclick="openAssignWorkoutModal(this.dataset.clientId, this.dataset.clientName)">
          + Add a Workout
        </button>
      </div>`;

    // Index calendar entries so the Edit handler (Phase 3B) can look
    // them up by stable index rather than re-walking _data on click.
    // Cleared on every render so stale indices from a prior view don't
    // collide with fresh ones.
    _calIndex = [];

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
        const idx = _calIndex.length;
        _calIndex.push(p);
        // Phase 3B: every planned item is editable. The Edit button
        // opens the Assign Workout modal pre-filled with this entry's
        // content. Tapping the item itself also opens the editor —
        // makes the whole row a tap target.
        const isCompleted = !!matchedDone;
        items.push(`<div class="coach-cal-item${isCompleted ? " coach-cal-item--done" : ""}${p.source === "coach_assigned" ? " coach-cal-item--coach" : ""}"
                          onclick="coachEditCalItem(${idx})"
                          tabindex="0"
                          role="button"
                          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();coachEditCalItem(${idx})}">
          <span class="coach-cal-name">${_esc(p.sessionName || _typeLabel(p.type) || "Workout")}${p.source === "coach_assigned" ? ' <span class="coach-cal-badge">FROM YOU</span>' : ""}</span>
          <span class="coach-cal-meta">${_esc(p.duration ? p.duration + " min" : "")}</span>
          ${isCompleted ? `<span class="coach-cal-status">✓ done</span>` : `<span class="coach-cal-status coach-cal-status--planned">planned</span>`}
          <span class="coach-cal-edit" aria-hidden="true">✎</span>
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

      // Per-day nutrition overlay control. Only rendered when the client
      // has nutrition turned on — Phase 2A flag respects their privacy.
      const carbBumpRow = _data.flags.nutritionEnabled
        ? _renderCoachCarbOverlayRow(date)
        : "";

      return `<div class="coach-cal-day${isToday ? " coach-cal-day--today" : ""}">
        <div class="coach-cal-day-header">${_esc(dayLabel)}${isToday ? " · Today" : ""}</div>
        ${items.join("")}
        ${carbBumpRow}
      </div>`;
    }).join("");

    return `${assignBar}<div class="card">${rows}</div>`;
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
    const rows = [
      _editableRow("Daily calorie target", adj.calories, "kcal", "nutritionAdjustments", "calories", "number"),
      _editableRow("Protein adjustment",   adj.protein,  "x",    "nutritionAdjustments", "protein",  "number"),
      _editableRow("Carbs adjustment",     adj.carbs,    "x",    "nutritionAdjustments", "carbs",    "number"),
      _editableRow("Fat adjustment",       adj.fat,      "x",    "nutritionAdjustments", "fat",      "number"),
    ].join("");

    return `<div class="card coach-feature-card">
      <div class="coach-feature-header">
        <span class="coach-feature-name">Nutrition</span>
        <span class="coach-feature-status coach-feature-status--on">Enabled by client ✓</span>
      </div>
      ${rows}
      ${_renderAuditFooter("nutritionAdjustments")}
    </div>`;
  }

  function _renderHydrationSection() {
    const enabled = _data.flags.hydrationEnabled;
    if (!enabled) return _disabledCard("Hydration", "hydration");

    const settings = _data.settings.hydrationSettings || {};
    const target = _data.settings.hydrationDailyTargetOz;
    const rows = [
      _editableRow("Daily target",  target,                       "oz",     "hydrationDailyTargetOz", "_self",         "number"),
      _editableRow("Sweat rate",    settings.sweatRateOzPerHour,  "oz/hr",  "hydrationSettings",     "sweatRateOzPerHour", "number"),
      _editableRow("Sodium pref",   settings.sodiumPref,          "",       "hydrationSettings",     "sodiumPref",    "select", ["low", "medium", "high"]),
    ].join("");

    // Audit: hydration uses two distinct data_keys. Show whichever has
    // the most recent edit.
    const auditKey = _pickFresherAudit("hydrationSettings", "hydrationDailyTargetOz");

    return `<div class="card coach-feature-card">
      <div class="coach-feature-header">
        <span class="coach-feature-name">Hydration</span>
        <span class="coach-feature-status coach-feature-status--on">Enabled by client ✓</span>
      </div>
      ${rows}
      ${_renderAuditFooter(auditKey)}
    </div>`;
  }

  function _renderFuelingSection() {
    const enabled = _data.flags.fuelingEnabled;
    if (!enabled) return _disabledCard("Fueling", "fueling");

    const prefs = _data.settings.fuelingPrefs || {};
    const rows = [
      _editableRow("Carbs per hour", prefs.carbsPerHour, "g/hr", "fuelingPrefs", "carbsPerHour", "number"),
      _editableRow("Gel size",       prefs.gelSize,      "",     "fuelingPrefs", "gelSize",      "text"),
    ].join("");

    return `<div class="card coach-feature-card">
      <div class="coach-feature-header">
        <span class="coach-feature-name">Fueling</span>
        <span class="coach-feature-status coach-feature-status--on">Enabled by client ✓</span>
      </div>
      ${rows}
      ${_renderAuditFooter("fuelingPrefs")}
    </div>`;
  }

  // ── Editable row + edit/save inline ───────────────────────────────────
  // dataKey = the user_data row to upsert. fieldName = the sub-field key
  // inside that JSONB object, OR "_self" for scalar data_keys like
  // hydrationDailyTargetOz that store the value directly.
  function _editableRow(label, value, unit, dataKey, fieldName, kind, options) {
    const editingId = `${dataKey}.${fieldName}`;
    const isEditing = _editingFeature === editingId;
    const hasValue = value != null && value !== "";

    if (isEditing) {
      let inputHtml;
      if (kind === "select" && Array.isArray(options)) {
        inputHtml = `<select id="coach-edit-input" class="input" style="padding:4px 6px;font-size:0.85rem;width:auto">
          ${options.map(o => `<option value="${_esc(o)}"${String(value) === o ? " selected" : ""}>${_esc(o)}</option>`).join("")}
        </select>`;
      } else if (kind === "number") {
        inputHtml = `<input type="number" id="coach-edit-input" class="input" step="any"
          value="${_esc(value ?? "")}" style="padding:4px 6px;font-size:0.85rem;width:90px" />`;
      } else {
        inputHtml = `<input type="text" id="coach-edit-input" class="input"
          value="${_esc(value ?? "")}" style="padding:4px 6px;font-size:0.85rem;width:140px" />`;
      }
      return `<div class="coach-feature-row coach-feature-row--editing">
        <span class="coach-feature-row-label">${_esc(label)}</span>
        <span class="coach-feature-row-edit" data-key="${_esc(dataKey)}" data-field="${_esc(fieldName)}">
          ${inputHtml}
          <button class="btn-primary btn-sm" onclick="coachSaveFeatureEdit()" style="padding:4px 10px;font-size:0.8rem">Save</button>
          <button class="btn-secondary btn-sm" onclick="coachCancelFeatureEdit()" style="padding:4px 10px;font-size:0.8rem">Cancel</button>
        </span>
      </div>`;
    }

    const valueDisplay = hasValue
      ? `${_esc(value)}${unit ? " " + _esc(unit) : ""}`
      : `<span style="color:var(--color-text-muted);font-style:italic">—</span>`;

    return `<div class="coach-feature-row">
      <span class="coach-feature-row-label">${_esc(label)}</span>
      <span class="coach-feature-row-value">
        ${valueDisplay}
        <button class="coach-feature-edit-btn" aria-label="Edit ${_esc(label)}" title="Edit"
          onclick="coachStartFeatureEdit('${_esc(dataKey)}', '${_esc(fieldName)}')">✎ edit</button>
      </span>
    </div>`;
  }

  function _renderAuditFooter(dataKey) {
    if (!dataKey) return "";
    const a = _audit[dataKey];
    if (!a || !a.by) return "";
    const name = (window._coachNameCache && window._coachNameCache[a.by])
              || (a.by === _client?.id ? "the client" : null);
    if (!name) {
      // Lazy-fetch the name. Re-render once we have it. Don't block.
      _resolveAuditName(a.by);
      return `<div class="coach-feature-audit">last edited ${_relTime(a.at)}</div>`;
    }
    return `<div class="coach-feature-audit">last edited by ${_esc(name)} ${_relTime(a.at)}</div>`;
  }

  function _pickFresherAudit(...keys) {
    let bestKey = null, bestAt = "";
    for (const k of keys) {
      const a = _audit[k];
      if (a && a.at && a.at > bestAt) { bestAt = a.at; bestKey = k; }
    }
    return bestKey;
  }

  async function _resolveAuditName(uid) {
    if (!uid) return;
    if (!window._coachNameCache) window._coachNameCache = {};
    if (window._coachNameCache[uid]) return;
    const sb = window.supabaseClient;
    if (!sb) return;
    try {
      const { data } = await sb.from("profiles").select("full_name, email").eq("id", uid).maybeSingle();
      window._coachNameCache[uid] = data?.full_name || data?.email || "a coach";
      // Re-render the active tab so the name surfaces.
      if (_activeTab === "nutrition") {
        const wrap = document.querySelector(".coach-client-tab-content");
        if (wrap) wrap.innerHTML = _renderActiveTab();
      }
    } catch {}
  }

  function _relTime(iso) {
    if (!iso) return "";
    try {
      const ms = Date.now() - new Date(iso).getTime();
      const minutes = Math.floor(ms / 60000);
      if (minutes < 1)  return "just now";
      if (minutes < 60) return minutes === 1 ? "1m ago" : `${minutes}m ago`;
      const hours = Math.floor(ms / 3600000);
      if (hours < 24)   return hours === 1 ? "1h ago" : `${hours}h ago`;
      const days = Math.floor(ms / 86400000);
      if (days < 30)    return days === 1 ? "1 day ago" : `${days} days ago`;
      return new Date(iso).toLocaleDateString();
    } catch { return ""; }
  }

  // ── Edit handlers (window-scoped for inline onclicks) ─────────────────
  function coachStartFeatureEdit(dataKey, fieldName) {
    _editingFeature = `${dataKey}.${fieldName}`;
    const wrap = document.querySelector(".coach-client-tab-content");
    if (wrap) wrap.innerHTML = _renderActiveTab();
    // Focus the new input on next tick so it's mounted.
    setTimeout(() => {
      const inp = document.getElementById("coach-edit-input");
      if (inp) { inp.focus(); if (inp.select) inp.select(); }
    }, 0);
  }

  function coachCancelFeatureEdit() {
    _editingFeature = null;
    const wrap = document.querySelector(".coach-client-tab-content");
    if (wrap) wrap.innerHTML = _renderActiveTab();
  }

  async function coachSaveFeatureEdit() {
    const inp = document.getElementById("coach-edit-input");
    if (!inp) return;
    const editWrap = inp.closest("[data-key]");
    const dataKey = editWrap?.dataset?.key;
    const fieldName = editWrap?.dataset?.field;
    if (!dataKey || !fieldName) return;

    const sb = window.supabaseClient;
    if (!sb) return;
    const sess = (await sb.auth.getSession())?.data?.session;
    const coachId = sess?.user?.id;
    if (!coachId || !_client?.id) return;

    // Coerce the new value into the right shape. Numbers parse, strings
    // pass through trimmed. Empty input clears the field (writes an
    // explicit null into the JSONB sub-field, or deletes the row when
    // the data_key is _self scalar).
    let raw = inp.value;
    let val;
    if (inp.type === "number") {
      val = raw === "" ? null : parseFloat(raw);
      if (val !== null && (isNaN(val) || !isFinite(val))) {
        alert("Invalid number.");
        return;
      }
    } else {
      val = raw == null ? null : String(raw).trim();
      if (val === "") val = null;
    }

    // Build the new JSONB value. For _self (scalar data_keys like
    // hydrationDailyTargetOz), the row's data_value IS the value. For
    // sub-fields, merge into the existing object.
    let newDataValue;
    if (fieldName === "_self") {
      newDataValue = val;
    } else {
      const existing = _data.settings[dataKey] || {};
      newDataValue = { ...existing, [fieldName]: val };
    }

    // Upsert via supabase. The Phase 2A INSERT + UPDATE policies gate
    // this — if the client has the corresponding feature toggled off
    // the write fails closed.
    const { error } = await sb.from("user_data")
      .upsert({
        user_id: _client.id,
        data_key: dataKey,
        data_value: newDataValue,
        last_edited_by: coachId,
        last_edited_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,data_key" });

    if (error) {
      alert("Couldn't save: " + error.message);
      return;
    }

    // Update local state and re-render. No full reload — saves a round-
    // trip and feels snappier on slow connections.
    _data.settings[dataKey] = newDataValue;
    _audit[dataKey] = { by: coachId, at: new Date().toISOString() };
    _editingFeature = null;
    const wrap = document.querySelector(".coach-client-tab-content");
    if (wrap) wrap.innerHTML = _renderActiveTab();

    if (typeof trackEvent === "function") {
      try { trackEvent("coach_feature_edited", { dataKey, fieldName }); } catch {}
    }
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

  // ── Per-day coach carb overlay ────────────────────────────────────────
  // Sits in the calendar day cell next to a date's planned/done items.
  // Writes go into nutritionAdjustments[date]._coachOverlay (additive on
  // top of the athlete's base target) so the existing slider workflow
  // and the Phase 2A RLS policy on `nutritionAdjustments` both keep
  // working unchanged.
  let _editingOverlayDate = null;

  function _getOverlay(date) {
    const all = _data.settings.nutritionAdjustments || {};
    const day = all && typeof all === "object" ? all[date] : null;
    return (day && day._coachOverlay) || null;
  }

  function _renderCoachCarbOverlayRow(date) {
    const overlay = _getOverlay(date);
    const isEditing = _editingOverlayDate === date;

    if (isEditing) {
      const current = overlay && overlay.carbs_add_g != null ? overlay.carbs_add_g : "";
      return `<div class="coach-cal-nutrition coach-cal-nutrition--editing" data-date="${_esc(date)}">
        <span class="coach-cal-nutrition-label">Carbs adjustment</span>
        <input type="number" id="coach-overlay-input-${_esc(date)}" class="input"
               value="${_esc(current)}" placeholder="+ grams" step="5"
               style="padding:4px 6px;font-size:0.85rem;width:90px" />
        <span class="coach-cal-nutrition-unit">g</span>
        <button class="btn-primary btn-sm" onclick="coachSaveDayCarbOverlay('${_esc(date)}')" style="padding:4px 10px;font-size:0.8rem">Save</button>
        <button class="btn-secondary btn-sm" onclick="coachCancelDayCarbOverlay()" style="padding:4px 10px;font-size:0.8rem">Cancel</button>
        ${overlay && overlay.carbs_add_g != null
          ? `<button class="btn-ghost btn-sm" onclick="coachClearDayCarbOverlay('${_esc(date)}')" style="padding:4px 10px;font-size:0.8rem">Clear</button>`
          : ""}
      </div>`;
    }

    if (overlay && overlay.carbs_add_g) {
      const sign = overlay.carbs_add_g > 0 ? "+" : "";
      return `<div class="coach-cal-nutrition">
        <span class="coach-cal-nutrition-pill">🍞 ${sign}${_esc(overlay.carbs_add_g)} g carbs</span>
        <button class="coach-feature-edit-btn" onclick="coachStartDayCarbOverlay('${_esc(date)}')">✎ edit</button>
      </div>`;
    }

    return `<div class="coach-cal-nutrition">
      <button class="coach-feature-edit-btn" onclick="coachStartDayCarbOverlay('${_esc(date)}')">+ Adjust carbs</button>
    </div>`;
  }

  function coachStartDayCarbOverlay(date) {
    _editingOverlayDate = date;
    const wrap = document.querySelector(".coach-client-tab-content");
    if (wrap) wrap.innerHTML = _renderActiveTab();
    setTimeout(() => {
      const inp = document.getElementById(`coach-overlay-input-${date}`);
      if (inp) { inp.focus(); if (inp.select) inp.select(); }
    }, 0);
  }

  function coachCancelDayCarbOverlay() {
    _editingOverlayDate = null;
    const wrap = document.querySelector(".coach-client-tab-content");
    if (wrap) wrap.innerHTML = _renderActiveTab();
  }

  async function _writeOverlayForDate(date, nextOverlay) {
    const sb = window.supabaseClient;
    if (!sb || !_client?.id) return { error: "no_client" };
    const sess = (await sb.auth.getSession())?.data?.session;
    const coachId = sess?.user?.id;
    if (!coachId) return { error: "no_session" };

    const all = (_data.settings.nutritionAdjustments && typeof _data.settings.nutritionAdjustments === "object")
      ? { ..._data.settings.nutritionAdjustments }
      : {};
    const dayExisting = (all[date] && typeof all[date] === "object") ? { ...all[date] } : {};
    if (nextOverlay == null) {
      delete dayExisting._coachOverlay;
    } else {
      dayExisting._coachOverlay = {
        ...(dayExisting._coachOverlay || {}),
        ...nextOverlay,
        by: coachId,
        at: new Date().toISOString(),
      };
    }
    // If the day row is now empty (no slider macros, no overlay), drop it
    // entirely so we don't litter the JSON with `{}`.
    const dayHasContent = Object.keys(dayExisting).some(k =>
      k === "_coachOverlay" ? dayExisting._coachOverlay
      : dayExisting[k] != null);
    if (dayHasContent) all[date] = dayExisting;
    else delete all[date];

    const { error } = await sb.from("user_data").upsert({
      user_id: _client.id,
      data_key: "nutritionAdjustments",
      data_value: all,
      last_edited_by: coachId,
      last_edited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,data_key" });

    if (error) return { error: error.message };

    _data.settings.nutritionAdjustments = all;
    _audit["nutritionAdjustments"] = { by: coachId, at: new Date().toISOString() };
    return { ok: true };
  }

  async function coachSaveDayCarbOverlay(date) {
    const inp = document.getElementById(`coach-overlay-input-${date}`);
    if (!inp) return;
    const raw = inp.value;
    if (raw === "" || raw == null) {
      // Empty input → clear the overlay entirely.
      const res = await _writeOverlayForDate(date, null);
      if (res.error) { alert("Couldn't save: " + res.error); return; }
    } else {
      const grams = parseFloat(raw);
      if (!isFinite(grams)) { alert("Enter a number of grams (e.g. 50)."); return; }
      const res = await _writeOverlayForDate(date, { carbs_add_g: grams });
      if (res.error) { alert("Couldn't save: " + res.error); return; }
    }
    _editingOverlayDate = null;
    const wrap = document.querySelector(".coach-client-tab-content");
    if (wrap) wrap.innerHTML = _renderActiveTab();
    if (typeof trackEvent === "function") {
      try { trackEvent("coach_day_carb_overlay_saved", { date }); } catch {}
    }
  }

  async function coachClearDayCarbOverlay(date) {
    const res = await _writeOverlayForDate(date, null);
    if (res.error) { alert("Couldn't clear: " + res.error); return; }
    _editingOverlayDate = null;
    const wrap = document.querySelector(".coach-client-tab-content");
    if (wrap) wrap.innerHTML = _renderActiveTab();
  }

  // ── Phase 3B: edit-existing-workout handler ───────────────────────────
  // Tap any planned calendar item → opens the Assign Workout modal
  // pre-filled with the entry's content. Two paths:
  //   • Coach-assigned (source === 'coach_assigned'): true edit. The
  //     modal sets _editingAssignmentId from coachAssignmentId so the
  //     submit fires UPDATE on coach_assigned_workouts. Trigger swaps
  //     the mirrored entry in place — no conflict modal.
  //   • AI-generated (any other source): there's no existing
  //     coach_assigned_workouts row to UPDATE, so the modal opens as a
  //     NEW assignment pre-filled with the AI content. The submit's
  //     conflict check fires (date already has a workout); coach picks
  //     replace → the trigger strips the AI entry from workoutSchedule
  //     and inserts the coach version. Net effect: AI workout is
  //     replaced by coach's edited version.
  function coachEditCalItem(idx) {
    const entry = _calIndex[idx];
    if (!entry) return;
    if (typeof window.openAssignWorkoutModal !== "function") return;

    const _clientName = _client.full_name || _client.email || "Client";
    const prefill = {
      date:        entry.date,
      sessionName: entry.sessionName || "",
      type:        entry.type || "weightlifting",
      duration:    entry.duration || "",
      exercises:   Array.isArray(entry.exercises) ? entry.exercises : [],
      coachNote:   entry.coachNote || "",
    };
    if (entry.source === "coach_assigned" && entry.coachAssignmentId) {
      prefill.assignmentId = entry.coachAssignmentId;
    }
    window.openAssignWorkoutModal(_client.id, _clientName, prefill);
  }

  // ── Public surface ─────────────────────────────────────────────────────
  window.loadCoachClientDetail   = loadCoachClientDetail;
  window.setCoachClientTab       = setCoachClientTab;
  window.coachStartFeatureEdit   = coachStartFeatureEdit;
  window.coachCancelFeatureEdit  = coachCancelFeatureEdit;
  window.coachSaveFeatureEdit    = coachSaveFeatureEdit;
  window.coachEditCalItem        = coachEditCalItem;
  window.coachStartDayCarbOverlay  = coachStartDayCarbOverlay;
  window.coachCancelDayCarbOverlay = coachCancelDayCarbOverlay;
  window.coachSaveDayCarbOverlay   = coachSaveDayCarbOverlay;
  window.coachClearDayCarbOverlay  = coachClearDayCarbOverlay;
})();
