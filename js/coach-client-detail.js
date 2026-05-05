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
  // Sport sub-tab inside Benchmarks. Mirrors the client's own zones
  // surface (Running / Biking / Swimming / Strength).
  let _activeBenchmarkSport = "running";
  // Phase 3E: audit map + currently-editing field. _audit[data_key] =
  // { by: uuid, at: iso-timestamp } when the user_data row was last
  // edited by a coach. _editingFeature is the inline-edit cursor
  // ("nutrition.calories", "hydration.target", "fueling.carbsPerHour"
  // etc.) so only one field is open at a time.
  let _audit = {};
  let _editingFeature = null;
  // PR 3b: which Training Inputs card is in edit mode. One at a time so
  // the surrounding cards stay read-only and the coach has one place to
  // commit/cancel. Values: null | "sports-goals" | "strength" | "long-days".
  let _editingTI = null;
  // Save state for the active edit form: "idle" | "saving" | "error".
  let _tiSaveState = "idle";
  let _tiSaveError = "";
  // PR 3c: in-progress weekly-schedule chip edits live here (separate
  // from the read-mode template) so picker add/remove between renders
  // doesn't snap back to the saved value. Initialized when edit opens,
  // cleared on cancel or save.
  let _tiWeeklyDraft = null;
  // Phase 3B: lookup table for the Calendar tab. Each rendered planned
  // item gets an index here; the inline onclick references it so the
  // Edit handler can resolve back to the schedule entry without
  // string-encoding the JSON into the markup.
  let _calIndex = [];
  // Week offset from the current week (0 = this week, -1 = last, +1 = next).
  // Lets coaches plan ahead beyond the seven days that show by default.
  let _calWeekOffset = 0;
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
      // on [date]" under each value. trainingZonesHistory is included
      // so the Benchmarks tab can show zone-update history scoped to
      // the coaching relationship.
      const dataRes = await sb.from("user_data")
        .select("data_key, data_value, last_edited_by, last_edited_at")
        .eq("user_id", clientId)
        .in("data_key", [
          "workoutSchedule", "trainingPlan",
          "workoutRatings", "personalRecords",
          "trainingZones", "trainingZonesHistory",
          "raceEvents", "events",
          // Training Inputs tab — same source keys the athlete's
          // "Active Training Inputs" card reads on their home screen.
          // The coach view mirrors that surface read-only in PR 1;
          // edit (PR 3) and delete (PR 4) come later.
          "selectedSports", "trainingGoals", "strengthRole",
          "strengthSetup", "thresholds", "buildPlanTemplate", "longDays",
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

      // Logged workouts come from the dedicated table. `data` carries
      // the JSONB blob where `isCompletion` lives — we need it to match
      // the athlete's history dedup (workouts.js filterWorkoutHistory).
      const completedRes = await sb.from("workouts")
        .select("id, user_id, name, type, date, duration_minutes, completed, notes, created_at, data")
        .eq("user_id", clientId)
        .order("date", { ascending: false })
        .limit(60);

      // Pull this coach's assignments for this client so the calendar
      // can surface client_note / client_rating on completed coach
      // workouts. Indexed by id to match the coachAssignmentId on each
      // synthetic workoutSchedule entry.
      const assignRes = await sb.from("coach_assigned_workouts")
        .select("id, date, client_note, client_rating, client_responded_at")
        .eq("client_id", clientId);
      _data.assignments = {};
      for (const r of (assignRes?.data || [])) _data.assignments[r.id] = r;

      // When did this coach take this client on? Used by the Benchmarks
      // tab to scope the zones-update history to the relationship.
      const sess = (await sb.auth.getSession())?.data?.session;
      const coachUid = sess?.user?.id || null;
      let coachAssignedAt = null;
      if (coachUid) {
        const relRes = await sb.from("coaching_assignments")
          .select("assigned_at")
          .eq("coach_id", coachUid)
          .eq("client_id", clientId)
          .eq("active", true)
          .order("assigned_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        coachAssignedAt = relRes?.data?.assigned_at || null;
      }

      _data.schedule        = _coerceArray(byKey.workoutSchedule);
      _data.plan            = _coerceArray(byKey.trainingPlan);
      _data.ratings         = _coerceArray(byKey.workoutRatings);
      _data.zones           = byKey.trainingZones || null;
      _data.zoneHistory     = _coerceArray(byKey.trainingZonesHistory);
      _data.coachAssignedAt = coachAssignedAt;
      _data.prs       = byKey.personalRecords || null;
      _data.races     = _coerceArray(byKey.raceEvents).concat(_coerceArray(byKey.events));
      // Mirror athlete-side dedup: Mark-as-Complete on a scheduled
      // session writes a second `workouts` row tagged isCompletion=true
      // alongside any hand-logged workout for the same (date, type).
      // The athlete's history view hides the isCompletion duplicate;
      // the coach calendar was rendering both, so a single workout
      // showed up twice (different durations because the auto-record
      // pulls from the schedule and the hand log from the form).
      const _completedRaw = completedRes.data || [];
      const _isCompletionFlag = (w) => !!(w && w.data && w.data.isCompletion);
      const _handLoggedKeys = new Set(
        _completedRaw
          .filter(w => !_isCompletionFlag(w))
          .map(w => `${w.date}|${w.type}`)
      );
      _data.completed = _completedRaw.filter(w =>
        !_isCompletionFlag(w) || !_handLoggedKeys.has(`${w.date}|${w.type}`)
      );
      // Training Inputs — coach-readable mirror of the athlete's
      // home-screen "Active Training Inputs" card. Bundled into one
      // sub-object so the renderer can pull from a single namespace
      // and the (forthcoming) edit/delete surfaces have one place to
      // wire writes through.
      _data.trainingInputs = {
        selectedSports:    _coerceArray(byKey.selectedSports),
        trainingGoals:     _coerceArray(byKey.trainingGoals),
        strengthRole:      typeof byKey.strengthRole === "string" ? byKey.strengthRole : (byKey.strengthRole?.role || null),
        strengthSetup:     byKey.strengthSetup    || null,
        thresholds:        byKey.thresholds       || null,
        buildPlanTemplate: byKey.buildPlanTemplate || null,
        longDays:          byKey.longDays         || null,
      };
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
        ${_tabBtn("training-inputs", "Training Inputs")}
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
      case "benchmarks":      return _renderBenchmarks();
      case "training-inputs": return _renderTrainingInputs();
      case "feedback":        return _renderFeedback();
      case "nutrition":       return _renderNutritionFueling();
      case "calendar":
      default:                return _renderCalendar();
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

  // ── Tab: Calendar (week-by-week planned vs completed) ─────────────────
  function _renderCalendar() {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + (_calWeekOffset * 7));
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toISOString().slice(0, 10);
    });

    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const weekLabel = _calWeekOffset === 0
      ? `This week · ${fmt(monday)} – ${fmt(sunday)}`
      : `${fmt(monday)} – ${fmt(sunday)}`;

    const weekNav = `
      <div class="coach-cal-weeknav">
        <button class="btn-secondary btn-sm" onclick="setCoachCalWeekDelta(-1)" aria-label="Previous week">‹ Prev</button>
        <span class="coach-cal-weeknav-label">${_esc(weekLabel)}</span>
        ${_calWeekOffset !== 0 ? `<button class="btn-secondary btn-sm" onclick="setCoachCalWeekDelta(0)">Today</button>` : ""}
        <button class="btn-secondary btn-sm" onclick="setCoachCalWeekDelta(1)" aria-label="Next week">Next ›</button>
      </div>`;

    // Phase 3A.2: "+ Add a Workout" CTA at the top of the calendar.
    // Opens the build-from-scratch flow with the client's id + name
    // pre-filled. The trigger from 3A.1 mirrors any insert into the
    // user's workoutSchedule, so loadCoachClientDetail will refresh
    // and the new entry shows up below. "+ Add from Library" opens a
    // picker that prefills the same modal with a saved workout.
    const _clientName = _client.full_name || _client.email || "Client";
    // Pass clientId via dataset rather than embedding the name in the
    // onclick string — saves us from quoting headaches when names
    // contain apostrophes or quotes.
    const assignBar = `
      <div class="coach-cal-toolbar">
        <button class="btn-secondary btn-sm"
                data-client-id="${_esc(_client.id)}"
                data-client-name="${_esc(_clientName)}"
                onclick="openCoachLibraryPicker(this.dataset.clientId, this.dataset.clientName)">
          + Add from Library
        </button>
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
        // Pull the client's post-completion feedback for coach-assigned
        // workouts: note + rating, written via submit_assignment_feedback
        // RPC from the rating modal. Only renders when the client filled
        // in the second textarea (or chose a rating).
        const RATING_EMOJIS = ["", "🥱", "😌", "👌", "💪", "😵"];
        const RATING_LABELS = ["", "Too easy", "Easy", "Just right", "Hard", "Crushed me"];
        let clientReplyHtml = "";
        if (p.source === "coach_assigned" && p.coachAssignmentId && _data.assignments) {
          const a = _data.assignments[p.coachAssignmentId];
          if (a && (a.client_note || a.client_rating)) {
            const ratingPart = a.client_rating
              ? `<span class="coach-cal-reply-rating">${RATING_EMOJIS[a.client_rating] || ""} ${_esc(RATING_LABELS[a.client_rating] || "")}</span>`
              : "";
            const notePart = a.client_note
              ? `<span class="coach-cal-reply-note">"${_esc(a.client_note)}"</span>`
              : "";
            clientReplyHtml = `<div class="coach-cal-reply">
              <span class="coach-cal-reply-label">Client reply</span>
              ${ratingPart}${notePart}
            </div>`;
          }
        }
        items.push(`<div class="coach-cal-item${isCompleted ? " coach-cal-item--done" : ""}${p.source === "coach_assigned" ? " coach-cal-item--coach" : ""}"
                          onclick="coachEditCalItem(${idx})"
                          tabindex="0"
                          role="button"
                          onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();coachEditCalItem(${idx})}">
          <span class="coach-cal-name">${_esc(p.sessionName || _typeLabel(p.type) || "Workout")}${p.source === "coach_assigned" ? ' <span class="coach-cal-badge">FROM YOU</span>' : ""}</span>
          <span class="coach-cal-meta">${_esc(p.duration ? p.duration + " min" : "")}</span>
          ${isCompleted ? `<span class="coach-cal-status">✓ done</span>` : `<span class="coach-cal-status coach-cal-status--planned">planned</span>`}
          <span class="coach-cal-edit" aria-hidden="true">✎</span>
          ${clientReplyHtml}
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

    return `${assignBar}${weekNav}<div class="card">${rows}</div>`;
  }

  function setCoachCalWeekDelta(delta) {
    if (delta === 0) _calWeekOffset = 0;
    else             _calWeekOffset += delta;
    const wrap = document.querySelector(".coach-client-tab-content");
    if (wrap && _activeTab === "calendar") wrap.innerHTML = _renderCalendar();
  }

  function _typeLabel(t) {
    const map = { running: "Run", cycling: "Ride", swimming: "Swim",
      weightlifting: "Strength", strength: "Strength", hiit: "HIIT",
      hyrox: "Hyrox", brick: "Brick", triathlon: "Brick", general: "Workout",
      yoga: "Yoga", bodyweight: "Bodyweight" };
    return map[t] || t;
  }

  // ── Tab: Benchmarks ──────────────────────────────────────────────────
  // Mirrors the client's Training Zones & Strength Benchmarks surface:
  // sport tabs (Running / Biking / Swimming / Strength) on top, then
  // Z1-Zn rows for the active sport (or 1RMs for Strength), reference
  // line, and a history list scoped to the coaching relationship.
  //
  // Previously this checked for legacy keys (running.easy, running.tempo,
  // running.vo2max, swimming.css) that aren't part of the active schema —
  // a client with VDOT-derived Z1-Z6 zones rendered as "no zones" on the
  // coach side.

  const _ZONE_LABELS = {
    running: [
      { num: 1, name: "Recovery",   desc: "Warmup · Cooldown · Very easy miles" },
      { num: 2, name: "Easy",       desc: "Base miles · Aerobic development" },
      { num: 3, name: "Tempo",      desc: "Comfortably hard · RPE 6–7" },
      { num: 4, name: "Threshold",  desc: "Hard intervals · RPE 8" },
      { num: 5, name: "Speed",      desc: "Short reps · Race-specific" },
      { num: 6, name: "Max Sprint", desc: "All-out sprints · Neuromuscular" },
    ],
    biking: [
      { num: 1, name: "Recovery",   desc: "Active recovery · Easy spinning" },
      { num: 2, name: "Endurance",  desc: "Aerobic base · All-day effort" },
      { num: 3, name: "Tempo",      desc: "Sustained effort · RPE 6–7" },
      { num: 4, name: "Threshold",  desc: "Near FTP · RPE 8" },
      { num: 5, name: "VO₂ Max",    desc: "Hard intervals · RPE 9" },
    ],
    swimming: [
      { num: 1, name: "Recovery",   desc: "Easy technical · Warm-up · Cool-down" },
      { num: 2, name: "Endurance",  desc: "Comfortable aerobic effort" },
      { num: 3, name: "Tempo",      desc: "Sustained effort · RPE 6–7" },
      { num: 4, name: "Threshold",  desc: "Near CSS / T-Pace · RPE 8" },
      { num: 5, name: "Race",       desc: "Race speed · High intensity" },
    ],
  };

  const _LIFTS = [
    { key: "bench",    label: "Bench Press" },
    { key: "squat",    label: "Back Squat" },
    { key: "deadlift", label: "Deadlift" },
    { key: "ohp",      label: "Overhead Press" },
    { key: "row",      label: "Barbell Row" },
  ];

  function _benchmarkSportTabs() {
    const sports = [
      ["running",  "Running"],
      ["biking",   "Biking"],
      ["swimming", "Swimming"],
      ["strength", "Strength"],
    ];
    return `<div class="coach-bench-tabs">${sports.map(([k, label]) => {
      const active = _activeBenchmarkSport === k ? " is-active" : "";
      return `<button class="coach-bench-tab${active}" onclick="window.coachClientDetail.setBenchmarkSport('${k}')">${_esc(label)}</button>`;
    }).join("")}</div>`;
  }

  function _renderZoneSport(sport) {
    const zonesAll = _data.zones || {};
    const stored = zonesAll[sport];
    if (!stored) {
      const emptyMsg = sport === "running"  ? "Client hasn't entered a running reference yet."
                    : sport === "biking"   ? "Client hasn't entered an FTP yet."
                    : "Client hasn't entered a swim reference yet.";
      return `<div class="coach-bench-empty">${emptyMsg}</div>`;
    }
    let refLine = "";
    if (sport === "running" && stored.referenceTime) {
      refLine = `Based on ${_esc(stored.referenceDist || "")} in ${_esc(stored.referenceTime)}${stored.vdot ? " · VDOT " + _esc(stored.vdot) : ""}`;
    } else if (sport === "biking" && stored.ftp) {
      refLine = `FTP: ${_esc(stored.ftp)} W`;
    } else if (sport === "swimming" && stored.tPaceStr) {
      refLine = `T-Pace: ${_esc(stored.tPaceStr)} /100m${stored.referenceDist ? " (from " + _esc(stored.referenceDist) + ")" : ""}`;
    }
    const updatedAt = stored.lastUpdated || stored.calculatedAt || stored.updatedAt;
    if (updatedAt) {
      try {
        const d = new Date(updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        refLine += (refLine ? " · " : "") + `Updated ${d}`;
      } catch {}
    }

    const labels = _ZONE_LABELS[sport] || [];
    const rowsHtml = labels.map(z => {
      const zd = (stored.zones || {})[`z${z.num}`] || {};
      const val = zd.paceRange || zd.wattRange || "—";
      return `<div class="coach-zone-row">
        <span class="coach-zone-badge zone-${z.num}">Z${z.num}</span>
        <div class="coach-zone-info">
          <span class="coach-zone-name">${_esc(z.name)}</span>
          <span class="coach-zone-desc">${_esc(z.desc)}</span>
        </div>
        <span class="coach-zone-val">${_esc(val)}</span>
      </div>`;
    }).join("");

    return `
      ${refLine ? `<div class="coach-bench-ref-line">${refLine}</div>` : ""}
      <div class="coach-zone-table">${rowsHtml}</div>
    `;
  }

  function _renderStrengthBlock() {
    const stored = (_data.zones || {}).strength || {};
    const rows = _LIFTS.map(l => {
      const d = stored[l.key];
      if (!d || !d.weight) return "";
      const typeLabel = d.type === "1rm" ? "1-rep max"
                      : d.type === "5rm" ? "5-rep max"
                      : d.type === "10rm" ? "10-rep max"
                      : "";
      return `<div class="coach-bench-row">
        <span>${_esc(l.label)}</span>
        <strong>${_esc(d.weight)} lbs${typeLabel ? " · " + typeLabel : ""}</strong>
      </div>`;
    }).filter(Boolean).join("");
    if (!rows) return `<div class="coach-bench-empty">No lifts logged.</div>`;
    const updatedAt = stored.lastUpdated || stored.updatedAt;
    let dateLine = "";
    if (updatedAt) {
      try { dateLine = `<div class="coach-bench-ref-line">Updated ${new Date(updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>`; } catch {}
    }
    return dateLine + rows;
  }

  // History entries archived by saveTrainingZonesData each time the
  // client updates a zone. Filter to the active sport, drop entries
  // archived before the coach-relationship start (assigned_at), and
  // sort newest-archive first.
  //
  // archivedAt is the moment of change (May 2 in the bench 275 → 285
  // case). entry.date is the effective date of the previous values
  // (Apr 7 — when those values were originally recorded). Filtering
  // by entry.date misses updates where the previous values pre-date
  // the coaching relationship; archivedAt is the right axis.
  function _renderZoneHistory(sport) {
    const all = Array.isArray(_data.zoneHistory) ? _data.zoneHistory : [];
    const since = _data.coachAssignedAt ? new Date(_data.coachAssignedAt).getTime() : 0;
    const eventTime = (e) => {
      // Prefer archivedAt (when the change happened); fall back to
      // date for legacy entries from before the archivedAt field
      // shipped (so a coach with pre-existing history doesn't see
      // their feed silently empty out on the next deploy).
      const raw = e.archivedAt || e.date;
      const t = new Date(raw).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    const entries = all
      .filter(e => e && e.sport === sport)
      .filter(e => {
        if (!since) return true;
        return eventTime(e) >= since;
      })
      .sort((a, b) => eventTime(b) - eventTime(a));
    if (!entries.length) {
      return `<div class="coach-bench-history-empty">No updates since this client joined you.</div>`;
    }
    const rows = entries.slice(0, 20).map(e => {
      const dateStr = (() => {
        try {
          // Surface the moment of change in the row label — that's
          // what the coach cares about ("they bumped bench on May 2").
          // Falls back to entry.date for legacy entries.
          const raw = e.archivedAt || e.date;
          return new Date(raw).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        }
        catch { return String(e.archivedAt || e.date).slice(0, 10); }
      })();
      const d = e.data || {};
      let summary = "";
      if (sport === "running")  summary = d.referenceTime ? `${_esc(d.referenceDist || "")} in ${_esc(d.referenceTime)}${d.vdot ? " · VDOT " + _esc(d.vdot) : ""}` : "";
      else if (sport === "biking")   summary = d.ftp ? `FTP ${_esc(d.ftp)} W` : "";
      else if (sport === "swimming") summary = d.tPaceStr ? `T-Pace ${_esc(d.tPaceStr)}/100m` : "";
      else if (sport === "strength") {
        summary = _LIFTS.map(l => d[l.key]?.weight ? `${l.label.split(" ")[0]} ${_esc(d[l.key].weight)}` : "")
          .filter(Boolean).join(" · ");
      }
      return `<div class="coach-bench-history-row">
        <span class="coach-bench-history-date">${dateStr}</span>
        <span class="coach-bench-history-detail">${summary || "(no values)"}</span>
      </div>`;
    }).join("");
    return rows;
  }

  function _renderBenchmarks() {
    const sport = _activeBenchmarkSport;
    const body = sport === "strength" ? _renderStrengthBlock() : _renderZoneSport(sport);
    const sectionTitle = sport === "strength"
      ? "Strength 1RM / Working Refs"
      : `${sport.charAt(0).toUpperCase()}${sport.slice(1)} Zones`;

    const sinceLabel = _data.coachAssignedAt
      ? (() => {
          try { return ` since ${new Date(_data.coachAssignedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`; }
          catch { return ""; }
        })()
      : "";

    return `
      ${_benchmarkSportTabs()}
      <div class="card">
        <div class="coach-bench-section-title">${sectionTitle}</div>
        ${body}
      </div>
      <div class="card">
        <div class="coach-bench-section-title">Update History${sinceLabel}</div>
        ${_renderZoneHistory(sport)}
      </div>
    `;
  }

  function setBenchmarkSport(sport) {
    if (!["running","biking","swimming","strength"].includes(sport)) return;
    _activeBenchmarkSport = sport;
    const wrap = document.querySelector(".coach-client-tab-content");
    if (wrap && _activeTab === "benchmarks") wrap.innerHTML = _renderBenchmarks();
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

  // ── Tab: Training Inputs ─────────────────────────────────────────────
  // Read-only mirror of the athlete's "Active Training Inputs" home-card.
  // Lists upcoming races (with priority + countdown), the sport mix and
  // training goals, the weekly schedule template, and (for hybrids) the
  // strength role + setup.
  //
  // PR 3b adds inline edit forms for Sports & Goals, Strength, and
  // Long Days. Race + Weekly Schedule are read-only here — race edit
  // is a multi-step modal (PR 5 / future) and weekly-schedule edit
  // would re-introduce the chip drag/drop widget (deferred to PR 3c).
  // Only one card can be in edit mode at a time so the coach has a
  // clear save/cancel surface and we don't have to coordinate
  // partially-saved state across multiple in-flight forms.
  function _renderTrainingInputs() {
    const ti = _data.trainingInputs || {};
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = (_data.races || [])
      .filter(r => r && r.date && r.date >= today && !r.isPastRace)
      .sort((a, b) => a.date.localeCompare(b.date));

    const sections = [];

    // Race cards (read-only — race edit lives in its own multi-step
    // modal, deferred to PR 5).
    if (upcoming.length) {
      sections.push(`<div class="coach-ti-section-label">Upcoming races</div>`);
      sections.push(upcoming.map(r => _coachRaceCard(r)).join(""));
    } else {
      sections.push(`<div class="coach-ti-empty">No upcoming races. The athlete hasn't scheduled an A-priority race yet.</div>`);
    }

    // Coach-assigned programs — mirrors the athlete's "COACH PLAN"
    // tile (planner.js renderRaceEvents → _getCoachProgramInputs).
    // We read from the same underlying source (workoutSchedule rows
    // tagged source='coach_assigned' with a coachProgram blob) so the
    // tile lines up exactly with what the athlete sees.
    const coachPlans = _coachProgramInputsFromSchedule(_data.schedule || []);
    if (coachPlans.length) {
      sections.push(`<div class="coach-ti-section-label">Programs assigned</div>`);
      sections.push(coachPlans.map(cp => _coachProgramTile(cp)).join(""));
    }

    // Athlete-owned coach-sheet imports — plans the athlete brought in
    // themselves via COACH_SHEET_IMPORT_SPEC. The coach didn't assign
    // these but they're load-bearing for the athlete's training, so the
    // coach needs visibility into what the athlete is doing in parallel
    // with their own programming. Read-only here (no edit/delete) since
    // the athlete owns these.
    const sheetPlans = _coachSheetInputsFromSchedule(_data.schedule || []);
    if (sheetPlans.length) {
      sections.push(`<div class="coach-ti-section-label">Athlete's own plans</div>`);
      sections.push(sheetPlans.map(sp => _coachSheetTile(sp)).join(""));
    }

    // Sports + goals
    sections.push(_editingTI === "sports-goals"
      ? _renderTIEditSportsGoals(ti)
      : _renderTIReadSportsGoals(ti));

    // Strength setup — only when the athlete is hybrid (selectedSports
    // includes "strength" OR a strengthRole is set).
    const hasStrength = (ti.selectedSports || []).includes("strength") || !!ti.strengthRole;
    if (hasStrength || _editingTI === "strength") {
      sections.push(_editingTI === "strength"
        ? _renderTIEditStrength(ti)
        : _renderTIReadStrength(ti));
    }

    // Weekly schedule template (PR 3c: editable chip grid)
    sections.push(_editingTI === "weekly-schedule"
      ? _renderTIEditWeekly(ti)
      : _renderTIReadWeekly(ti));

    // Long days
    sections.push(_editingTI === "long-days"
      ? _renderTIEditLongDays(ti)
      : _renderTIReadLongDays(ti));

    const filtered = sections.filter(Boolean);
    return filtered.length ? filtered.join("") : `<div class="coach-ti-empty">This athlete hasn't built a plan yet.</div>`;
  }

  // ── Read-mode renderers (PR 1 logic, factored out so the edit-mode
  //    forms can replace them in place when _editingTI matches). ─────────
  function _renderTIReadSportsGoals(ti) {
    const sportsRow = (ti.selectedSports || []).map(s => `<span class="coach-ti-pill">${_esc(_prettySport(s))}</span>`).join("");
    const goalsRow  = (ti.trainingGoals  || []).map(g => `<span class="coach-ti-pill coach-ti-pill--accent">${_esc(_prettyGoal(g))}</span>`).join("");
    if (!sportsRow && !goalsRow && !_editingTI) return "";
    return `<div class="card coach-ti-card">
      <div class="coach-ti-card-header">
        <div class="coach-ti-card-title">Sports &amp; Goals</div>
        <button type="button" class="coach-ti-edit-btn" onclick="coachTIEdit('sports-goals')">Edit</button>
      </div>
      ${sportsRow ? `<div class="coach-ti-row"><div class="coach-ti-label">Sports</div><div class="coach-ti-pills">${sportsRow}</div></div>` : ""}
      ${goalsRow  ? `<div class="coach-ti-row"><div class="coach-ti-label">Goals</div><div class="coach-ti-pills">${goalsRow}</div></div>` : ""}
      ${(!sportsRow && !goalsRow) ? `<div class="coach-ti-row coach-ti-row--empty">Not set</div>` : ""}
    </div>`;
  }
  function _renderTIReadStrength(ti) {
    const setup = ti.strengthSetup || {};
    return `<div class="card coach-ti-card">
      <div class="coach-ti-card-header">
        <div class="coach-ti-card-title">Strength</div>
        <button type="button" class="coach-ti-edit-btn" onclick="coachTIEdit('strength')">Edit</button>
      </div>
      ${ti.strengthRole ? `<div class="coach-ti-row"><div class="coach-ti-label">Role</div><div class="coach-ti-value">${_esc(_prettyRole(ti.strengthRole))}</div></div>` : ""}
      ${setup.sessionsPerWeek ? `<div class="coach-ti-row"><div class="coach-ti-label">Sessions / week</div><div class="coach-ti-value">${_esc(String(setup.sessionsPerWeek))}</div></div>` : ""}
      ${setup.split ? `<div class="coach-ti-row"><div class="coach-ti-label">Split</div><div class="coach-ti-value">${_esc(_prettySplit(setup.split))}</div></div>` : ""}
      ${setup.sessionLength ? `<div class="coach-ti-row"><div class="coach-ti-label">Session length</div><div class="coach-ti-value">${_esc(String(setup.sessionLength))} min</div></div>` : ""}
    </div>`;
  }
  function _renderTIReadLongDays(ti) {
    if (!ti.longDays || (!ti.longDays.longRun && !ti.longDays.longRide)) return "";
    const dayLabels = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" };
    return `<div class="card coach-ti-card">
      <div class="coach-ti-card-header">
        <div class="coach-ti-card-title">Long Days</div>
        <button type="button" class="coach-ti-edit-btn" onclick="coachTIEdit('long-days')">Edit</button>
      </div>
      ${ti.longDays.longRun  ? `<div class="coach-ti-row"><div class="coach-ti-label">Long run</div><div class="coach-ti-value">${_esc(dayLabels[ti.longDays.longRun]  || ti.longDays.longRun)}</div></div>` : ""}
      ${ti.longDays.longRide ? `<div class="coach-ti-row"><div class="coach-ti-label">Long ride</div><div class="coach-ti-value">${_esc(dayLabels[ti.longDays.longRide] || ti.longDays.longRide)}</div></div>` : ""}
    </div>`;
  }

  // ── PR 3c: Weekly Schedule chip-grid editor ───────────────────────────
  // Read-mode mirrors PR 1's render (chip per slot, "Rest" placeholder
  // for empty days). Edit-mode replaces each day's chip row with chips
  // that have a remove (×) button + a small picker to add new slots.
  // Drag/drop is intentionally skipped — the V2 athlete picker has
  // it but it's hard to make accessible on mobile, and add+remove
  // covers the cases coaches actually care about. Variant sub-types
  // (run-long, run-interval, etc.) aren't selectable here either —
  // they get re-derived by the plan generator from the long-day picks
  // and run/bike count, so coaches stay in plain-type land.
  const _TI_DAY_KEYS   = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const _TI_DAY_LABELS = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
  const _TI_PICKER_OPTIONS = [
    { id: "run",      label: "Run" },
    { id: "bike",     label: "Bike" },
    { id: "swim",     label: "Swim" },
    { id: "strength", label: "Strength" },
    { id: "brick",    label: "Brick" },
    { id: "rest",     label: "Rest (clear day)" },
  ];
  function _renderTIReadWeekly(ti) {
    const tpl = ti.buildPlanTemplate;
    if (!tpl || typeof tpl !== "object") return "";
    const rows = _TI_DAY_KEYS.map(d => {
      const slots = Array.isArray(tpl[d]) ? tpl[d] : [];
      const chips = slots.length
        ? slots.map(s => `<span class="coach-ti-slot">${_esc(_prettySlot(s))}</span>`).join("")
        : `<span class="coach-ti-slot coach-ti-slot--rest">Rest</span>`;
      return `<div class="coach-ti-week-row">
        <div class="coach-ti-week-day">${_TI_DAY_LABELS[d]}</div>
        <div class="coach-ti-week-slots">${chips}</div>
      </div>`;
    }).join("");
    return `<div class="card coach-ti-card">
      <div class="coach-ti-card-header">
        <div class="coach-ti-card-title">Weekly Schedule</div>
        <button type="button" class="coach-ti-edit-btn" onclick="coachTIEdit('weekly-schedule')">Edit</button>
      </div>
      <div class="coach-ti-week">${rows}</div>
    </div>`;
  }
  function _renderTIEditWeekly(ti) {
    const draft = _tiWeeklyDraft || {};
    const pickerOpts = _TI_PICKER_OPTIONS
      .map(o => `<option value="${o.id}">${_esc(o.label)}</option>`)
      .join("");
    const rows = _TI_DAY_KEYS.map(d => {
      const slots = Array.isArray(draft[d]) ? draft[d] : [];
      const chips = slots.length === 0
        ? `<span class="coach-ti-slot coach-ti-slot--rest">Rest</span>`
        : slots.map((s, i) => `<span class="coach-ti-slot coach-ti-slot--editable">
            ${_esc(_prettySlot(s))}
            <button type="button" class="coach-ti-slot-x" aria-label="Remove"
              onclick="coachTIWeeklyRemove('${d}', ${i})">&times;</button>
          </span>`).join("");
      return `<div class="coach-ti-week-row coach-ti-week-row--editing">
        <div class="coach-ti-week-day">${_TI_DAY_LABELS[d]}</div>
        <div class="coach-ti-week-slots">${chips}</div>
        <select class="coach-ti-week-pick" onchange="coachTIWeeklyAdd('${d}', this.value); this.value='';">
          <option value="">+ Add</option>
          ${pickerOpts}
        </select>
      </div>`;
    }).join("");
    return `<div class="card coach-ti-card coach-ti-card--editing">
      <div class="coach-ti-card-header">
        <div class="coach-ti-card-title">Edit Weekly Schedule</div>
      </div>
      <p class="coach-ti-help">Tap × to remove a slot. Use + Add to drop in a new sport for any day. The plan generator handles the variant (long / interval / easy) automatically based on the long-day picks below.</p>
      <div class="coach-ti-week">${rows}</div>
      ${_renderTISaveBar("weekly-schedule")}
    </div>`;
  }
  // Picker handlers — both mutate the draft, then rerender. Keep the
  // mutual-exclusion rules consistent with onboarding-v2's
  // _addSlotToDay so the saved template lines up with what the
  // athlete would have produced building it themselves:
  //   - Adding "rest" wipes the day.
  //   - Adding "brick" strips bike/run-family chips.
  //   - Adding bike/run when "brick" is already there is a no-op.
  //   - Adding "rest" silently strips any other slots first (no-op
  //     if the day is already empty).
  function coachTIWeeklyAdd(dayKey, sport) {
    if (!_tiWeeklyDraft || !sport) return;
    if (!Array.isArray(_tiWeeklyDraft[dayKey])) _tiWeeklyDraft[dayKey] = [];
    const day = _tiWeeklyDraft[dayKey];
    if (sport === "rest") {
      _tiWeeklyDraft[dayKey] = [];
      _rerenderTrainingInputs();
      return;
    }
    const isBikeRunFamily = (s) =>
      s === "bike" || s === "run" ||
      (typeof s === "string" && (s.indexOf("bike-") === 0 || s.indexOf("run-") === 0));
    if (sport === "brick") {
      _tiWeeklyDraft[dayKey] = day.filter(s => !isBikeRunFamily(s));
    } else if (isBikeRunFamily(sport) && day.includes("brick")) {
      return; // brick covers bike + run for that day
    }
    if (!_tiWeeklyDraft[dayKey].includes(sport)) {
      _tiWeeklyDraft[dayKey].push(sport);
    }
    _rerenderTrainingInputs();
  }
  function coachTIWeeklyRemove(dayKey, idx) {
    if (!_tiWeeklyDraft || !Array.isArray(_tiWeeklyDraft[dayKey])) return;
    _tiWeeklyDraft[dayKey].splice(idx, 1);
    _rerenderTrainingInputs();
  }

  // ── PR 4: Delete race + AI plan with typed-confirm modal ─────────────
  // Two-step modal because deleting a client's race wipes the AI-
  // generated plan and we don't want it to feel like a thumb-slip.
  // Step 1 confirms intent ("Delete X's Y plan?"), step 2 requires
  // typing DELETE + shows the workout count that's about to disappear.
  // Coach-assigned workouts and completed history are preserved by
  // the RPC — the modal copy says so explicitly.
  let _tiDelete = null; // { step, raceId, race, removeCount, typed, saving, error }

  function coachTIRaceDeleteOpen(raceId) {
    if (!_client || !_client.id) return;
    const race = (_data.races || []).find(r => String(r.id) === String(raceId));
    if (!race) return;
    // Compute how many AI-generated workouts get stripped — count
    // entries with raceId match in trainingPlan + workoutSchedule
    // (excluding coach-assigned schedule entries the RPC will keep).
    const planMatch = (_data.plan || []).filter(e => e && String(e.raceId) === String(raceId)).length;
    const schedMatch = (_data.schedule || []).filter(e =>
      e && String(e.raceId) === String(raceId) && e.source !== "coach_assigned"
    ).length;
    _tiDelete = {
      step: 1,
      raceId: String(raceId),
      race,
      removeCount: planMatch + schedMatch,
      typed: "",
      saving: false,
      error: "",
    };
    _renderTIDeleteModal();
  }
  function coachTIRaceDeleteClose() {
    _tiDelete = null;
    _renderTIDeleteModal();
  }
  function coachTIRaceDeleteAdvance() {
    if (!_tiDelete || _tiDelete.step !== 1) return;
    _tiDelete.step = 2;
    _tiDelete.typed = "";
    _renderTIDeleteModal();
  }
  function coachTIRaceDeleteType(value) {
    if (!_tiDelete || _tiDelete.step !== 2) return;
    _tiDelete.typed = String(value || "");
    // Light render — only the button's enabled state changes; full
    // re-render keeps the text input's caret + value in sync without
    // having to manage focus restoration manually.
    const btn = document.getElementById("ti-delete-final-btn");
    if (btn) btn.disabled = _tiDelete.typed !== "DELETE" || !!_tiDelete.saving;
  }
  async function coachTIRaceDeleteConfirm() {
    if (!_tiDelete || _tiDelete.step !== 2 || _tiDelete.typed !== "DELETE") return;
    _tiDelete.saving = true;
    _tiDelete.error  = "";
    _renderTIDeleteModal();
    try {
      const sb = window.supabaseClient;
      if (!sb) throw new Error("Supabase client not initialized.");
      const { error } = await sb.rpc("coach_delete_client_race", {
        p_client_id: _client.id,
        p_race_id:   _tiDelete.raceId,
      });
      if (error) throw new Error(error.message);
      // Patch local state so the deleted race vanishes from the
      // Training Inputs tab without a full re-fetch round trip.
      const raceId = _tiDelete.raceId;
      _data.races    = (_data.races    || []).filter(r => String(r.id) !== raceId);
      _data.plan     = (_data.plan     || []).filter(e => String(e.raceId) !== raceId);
      _data.schedule = (_data.schedule || []).filter(e =>
        String(e.raceId) !== raceId || e.source === "coach_assigned"
      );
      _tiDelete = null;
      _renderTIDeleteModal();
      _rerenderTrainingInputs();
    } catch (e) {
      _tiDelete.saving = false;
      _tiDelete.error  = (e && e.message) || "Delete failed.";
      _renderTIDeleteModal();
    }
  }
  function _renderTIDeleteModal() {
    let host = document.getElementById("coach-ti-delete-overlay");
    if (!_tiDelete) {
      if (host) host.remove();
      return;
    }
    if (!host) {
      host = document.createElement("div");
      host.id = "coach-ti-delete-overlay";
      host.className = "coach-ti-delete-overlay";
      document.body.appendChild(host);
    }
    const r = _tiDelete.race;
    const clientName = (_client?.full_name || _client?.email || "this client").trim();
    const raceName = r?.name || r?.type || "this race";
    const errorHtml = _tiDelete.error ? `<div class="coach-ti-delete-err">${_esc(_tiDelete.error)}</div>` : "";
    if (_tiDelete.step === 1) {
      host.innerHTML = `
        <div class="coach-ti-delete-modal" role="dialog" aria-modal="true" aria-label="Confirm delete">
          <div class="coach-ti-delete-title">Delete ${_esc(clientName)}'s ${_esc(raceName)} training plan?</div>
          <div class="coach-ti-delete-body">
            This will remove the race from ${_esc(clientName)}'s plan and strip the AI-generated workouts tied to it.
            <strong>Coach-assigned workouts and completed history are preserved.</strong>
          </div>
          ${errorHtml}
          <div class="coach-ti-delete-actions">
            <button type="button" class="btn-secondary" onclick="coachTIRaceDeleteClose()">Cancel</button>
            <button type="button" class="btn-danger" onclick="coachTIRaceDeleteAdvance()">Delete</button>
          </div>
        </div>`;
      return;
    }
    // Step 2 — typed confirm.
    const finalDisabled = _tiDelete.typed !== "DELETE" || _tiDelete.saving;
    const count = _tiDelete.removeCount;
    const countLabel = count === 1 ? "1 generated workout" : `${count} generated workouts`;
    host.innerHTML = `
      <div class="coach-ti-delete-modal" role="dialog" aria-modal="true" aria-label="Type DELETE to confirm">
        <div class="coach-ti-delete-title">Final confirmation</div>
        <div class="coach-ti-delete-body">
          This will remove <strong>${_esc(raceName)}</strong>, its build plan, and <strong>${countLabel}</strong> from ${_esc(clientName)}'s calendar. Coach-assigned workouts and completed history are preserved. <strong>This can't be undone.</strong>
        </div>
        <label class="coach-ti-delete-typed-label">Type <code>DELETE</code> to confirm:</label>
        <input type="text" id="coach-ti-delete-typed-input" class="coach-ti-input"
               value="${_esc(_tiDelete.typed)}" autocomplete="off" autocapitalize="characters"
               oninput="coachTIRaceDeleteType(this.value)" />
        ${errorHtml}
        <div class="coach-ti-delete-actions">
          <button type="button" class="btn-secondary" ${_tiDelete.saving ? "disabled" : ""} onclick="coachTIRaceDeleteClose()">Cancel</button>
          <button type="button" class="btn-danger" id="ti-delete-final-btn" ${finalDisabled ? "disabled" : ""} onclick="coachTIRaceDeleteConfirm()">${_tiDelete.saving ? "Deleting…" : "Delete forever"}</button>
        </div>
      </div>`;
    // Focus the input so the coach can type immediately. Without this
    // the modal opens and they have to tap the field first.
    setTimeout(() => {
      const el = document.getElementById("coach-ti-delete-typed-input");
      if (el && !_tiDelete.saving) el.focus();
    }, 0);
  }

  // ── PR 5: Race-edit modal ───────────────────────────────────────────
  // Single-page form (not the V2 multi-step wizard) — coach is editing
  // an existing race, not stepping through creation, so a flat layout
  // covers the plan-affecting fields (type, date, priority, level,
  // daysPerWeek, goal, longDay) plus name + location in one screen.
  // Save replaces the race in raceEvents OR events (whichever array
  // it lives in) via coach_update_client_training_input. Field-level
  // audit logging falls out for free — the RPC writes one entry per
  // data_key with before/after snapshots.
  let _tiRaceEdit = null; // { raceId, draft, sourceKey, saving, error }

  const _RACE_TYPE_OPTIONS = [
    { id: "ironman",      label: "Ironman" },
    { id: "halfIronman",  label: "Half Ironman (70.3)" },
    { id: "olympic",      label: "Olympic Triathlon" },
    { id: "sprint",       label: "Sprint Triathlon" },
    { id: "marathon",     label: "Marathon" },
    { id: "halfMarathon", label: "Half Marathon" },
    { id: "tenK",         label: "10K" },
    { id: "fiveK",        label: "5K" },
    { id: "centuryRide",  label: "Century Ride" },
    { id: "granFondo",    label: "Gran Fondo" },
    { id: "hyrox",        label: "Hyrox" },
    { id: "hyroxDoubles", label: "Hyrox Doubles" },
  ];
  const _RACE_PRIORITY_OPTIONS = [
    { id: "A", label: "A — Goal race" },
    { id: "B", label: "B — Tune-up" },
    { id: "C", label: "C — Training day" },
  ];
  const _RACE_LEVEL_OPTIONS = [
    { id: "beginner",     label: "Beginner" },
    { id: "intermediate", label: "Intermediate" },
    { id: "advanced",     label: "Advanced" },
  ];
  const _RACE_GOAL_OPTIONS = [
    { id: "finish",   label: "Finish" },
    { id: "time",     label: "Time goal" },
    { id: "compete",  label: "Compete / podium" },
  ];

  function coachTIRaceEditOpen(raceId) {
    if (!_client || !_client.id) return;
    const ti = _data.trainingInputs || {};
    const allRaceEvents = Array.isArray(ti.raceEvents) ? ti.raceEvents : null;
    // Look in both arrays — race could legitimately be in either, and
    // we need to know which to write back to so we don't accidentally
    // write to the wrong one and orphan the original.
    const inRaceEvents = (allRaceEvents || []).find(r => String(r.id) === String(raceId));
    const inEvents     = (_data.races || []).find(r => String(r.id) === String(raceId));
    const race = inRaceEvents || inEvents;
    if (!race) return;
    // Determine which user_data key to write back. Prefer raceEvents
    // if the race is there (V2 onboarding's canonical home); fall back
    // to events for legacy races.
    const sourceKey = inRaceEvents ? "raceEvents" : "events";
    _tiRaceEdit = {
      raceId: String(raceId),
      sourceKey,
      draft: { ...race },
      saving: false,
      error: "",
    };
    _renderTIRaceEditModal();
  }
  function coachTIRaceEditClose() {
    _tiRaceEdit = null;
    _renderTIRaceEditModal();
  }
  function coachTIRaceEditField(field, value) {
    if (!_tiRaceEdit) return;
    _tiRaceEdit.draft[field] = value;
  }
  async function coachTIRaceEditSave() {
    if (!_tiRaceEdit) return;
    // Pull current values out of the form one-shot before the spinner
    // re-renders the modal (would lose unsaved input otherwise).
    const get = (id) => document.getElementById(id);
    const draft = _tiRaceEdit.draft;
    draft.name         = get("ti-race-name")?.value.trim()        ?? draft.name;
    draft.type         = get("ti-race-type")?.value               || draft.type;
    draft.date         = get("ti-race-date")?.value               || draft.date;
    draft.priority     = get("ti-race-priority")?.value           || draft.priority;
    draft.level        = get("ti-race-level")?.value              || draft.level;
    draft.goal         = get("ti-race-goal")?.value               || draft.goal;
    const dpw          = parseInt(get("ti-race-days")?.value, 10);
    if (!Number.isNaN(dpw) && dpw >= 1 && dpw <= 7) draft.daysPerWeek = dpw;
    draft.longDay      = get("ti-race-longday")?.value            ?? draft.longDay;
    draft.location     = get("ti-race-location")?.value.trim()    ?? draft.location;

    if (!draft.name)            { _tiRaceEdit.error = "Name is required."; _renderTIRaceEditModal(); return; }
    if (!draft.type)            { _tiRaceEdit.error = "Type is required."; _renderTIRaceEditModal(); return; }
    if (!draft.date)            { _tiRaceEdit.error = "Date is required."; _renderTIRaceEditModal(); return; }

    _tiRaceEdit.saving = true;
    _tiRaceEdit.error  = "";
    _renderTIRaceEditModal();

    try {
      // Build the updated array for whichever user_data key holds the
      // race. Replace just this race; leave other races in the array
      // untouched. Mirror the same write to both the RPC and local
      // _data so the tab refreshes without a re-fetch round-trip.
      const ti = _data.trainingInputs || {};
      const sourceArr = _tiRaceEdit.sourceKey === "raceEvents"
        ? (Array.isArray(ti.raceEvents) ? ti.raceEvents : [])
        : (_data.races || []).filter(r => {
            // Reconstruct just the events-side races for the write
            // back. Anything in raceEvents is excluded so we don't
            // duplicate the race in events.
            const inRE = Array.isArray(ti.raceEvents)
              ? ti.raceEvents.some(re => String(re.id) === String(r.id))
              : false;
            return !inRE;
          });
      const next = sourceArr.map(r =>
        String(r.id) === _tiRaceEdit.raceId ? { ...r, ...draft } : r
      );
      const sb = window.supabaseClient;
      if (!sb) throw new Error("Supabase client not initialized.");
      const { error } = await sb.rpc("coach_update_client_training_input", {
        p_client_id:  _client.id,
        p_data_key:   _tiRaceEdit.sourceKey,
        p_data_value: next,
      });
      if (error) throw new Error(error.message);

      // Patch local state.
      if (_tiRaceEdit.sourceKey === "raceEvents") {
        _data.trainingInputs.raceEvents = next;
      }
      _data.races = (_data.races || []).map(r =>
        String(r.id) === _tiRaceEdit.raceId ? { ...r, ...draft } : r
      );
      _tiRaceEdit = null;
      _renderTIRaceEditModal();
      _rerenderTrainingInputs();
    } catch (e) {
      _tiRaceEdit.saving = false;
      _tiRaceEdit.error  = (e && e.message) || "Save failed.";
      _renderTIRaceEditModal();
    }
  }
  function _renderTIRaceEditModal() {
    let host = document.getElementById("coach-ti-raceedit-overlay");
    if (!_tiRaceEdit) {
      if (host) host.remove();
      return;
    }
    if (!host) {
      host = document.createElement("div");
      host.id = "coach-ti-raceedit-overlay";
      host.className = "coach-ti-delete-overlay";
      document.body.appendChild(host);
    }
    const d = _tiRaceEdit.draft;
    const errorHtml = _tiRaceEdit.error ? `<div class="coach-ti-delete-err">${_esc(_tiRaceEdit.error)}</div>` : "";
    const opts = (arr, sel) => arr.map(o => `<option value="${o.id}" ${o.id === sel ? "selected" : ""}>${_esc(o.label)}</option>`).join("");
    const dayOpts = [
      { id: "",    label: "Not set" },
      { id: "mon", label: "Monday" },
      { id: "tue", label: "Tuesday" },
      { id: "wed", label: "Wednesday" },
      { id: "thu", label: "Thursday" },
      { id: "fri", label: "Friday" },
      { id: "sat", label: "Saturday" },
      { id: "sun", label: "Sunday" },
    ];
    host.innerHTML = `
      <div class="coach-ti-delete-modal coach-ti-raceedit-modal" role="dialog" aria-modal="true" aria-label="Edit race">
        <div class="coach-ti-delete-title">Edit race</div>
        <div class="coach-ti-raceedit-grid">
          <div class="form-row">
            <label for="ti-race-name">Name</label>
            <input type="text" id="ti-race-name" class="coach-ti-input" value="${_esc(d.name || "")}" />
          </div>
          <div class="form-row">
            <label for="ti-race-type">Type</label>
            <select id="ti-race-type" class="coach-ti-input">${opts(_RACE_TYPE_OPTIONS, d.type)}</select>
          </div>
          <div class="form-row">
            <label for="ti-race-date">Date</label>
            <input type="date" id="ti-race-date" class="coach-ti-input" value="${_esc(d.date || "")}" />
          </div>
          <div class="form-row">
            <label for="ti-race-priority">Priority</label>
            <select id="ti-race-priority" class="coach-ti-input">${opts(_RACE_PRIORITY_OPTIONS, d.priority || "A")}</select>
          </div>
          <div class="form-row">
            <label for="ti-race-level">Level</label>
            <select id="ti-race-level" class="coach-ti-input">${opts(_RACE_LEVEL_OPTIONS, d.level || "intermediate")}</select>
          </div>
          <div class="form-row">
            <label for="ti-race-goal">Goal</label>
            <select id="ti-race-goal" class="coach-ti-input">${opts(_RACE_GOAL_OPTIONS, d.goal || "finish")}</select>
          </div>
          <div class="form-row">
            <label for="ti-race-days">Days / week</label>
            <input type="number" id="ti-race-days" class="coach-ti-input" min="1" max="7" value="${_esc(String(d.daysPerWeek || ""))}" />
          </div>
          <div class="form-row">
            <label for="ti-race-longday">Long day</label>
            <select id="ti-race-longday" class="coach-ti-input">${dayOpts.map(o => `<option value="${o.id}" ${o.id === (d.longDay || "") ? "selected" : ""}>${_esc(o.label)}</option>`).join("")}</select>
          </div>
          <div class="form-row form-row--full">
            <label for="ti-race-location">Location</label>
            <input type="text" id="ti-race-location" class="coach-ti-input" value="${_esc(d.location || "")}" />
          </div>
        </div>
        ${errorHtml}
        <div class="coach-ti-delete-actions">
          <button type="button" class="btn-secondary" ${_tiRaceEdit.saving ? "disabled" : ""} onclick="coachTIRaceEditClose()">Cancel</button>
          <button type="button" class="btn-primary" ${_tiRaceEdit.saving ? "disabled" : ""} onclick="coachTIRaceEditSave()">${_tiRaceEdit.saving ? "Saving…" : "Save"}</button>
        </div>
      </div>`;
  }

  // ── Edit-mode renderers ─────────────────────────────────────────────
  // Each form prefills from current ti.* values, marks the active card,
  // and posts via coach_update_client_training_input. On success the
  // RPC stamps pendingPlanRegen on the client; their next app boot
  // re-runs the plan generator. Save / cancel refresh the tab so the
  // edited card slides back to read-mode with the new values.
  const _ALL_SPORTS = [
    { id: "run",      label: "Run" },
    { id: "bike",     label: "Bike" },
    { id: "swim",     label: "Swim" },
    { id: "strength", label: "Strength" },
    { id: "hyrox",    label: "Hyrox" },
    { id: "rowing",   label: "Rowing" },
    { id: "walking",  label: "Walking" },
  ];
  // Goal catalog mirrors onboarding-v2 ENDURANCE_GOALS / STRENGTH_ONLY_GOALS,
  // minus body-comp signals (bulk/cut/weight) — those live on
  // profile.bodyCompGoal now and aren't writable from this surface.
  const _ALL_GOALS = [
    { id: "race",      label: "Train for a race" },
    { id: "speed",     label: "Get faster" },
    { id: "endurance", label: "Build endurance" },
    { id: "general",   label: "General fitness" },
    { id: "stronger",  label: "Get stronger" },
  ];
  function _renderTIEditSportsGoals(ti) {
    const selectedSports = new Set(ti.selectedSports || []);
    const trainingGoals  = new Set(ti.trainingGoals  || []);
    const sportsCheckboxes = _ALL_SPORTS.map(s => `
      <label class="coach-ti-check">
        <input type="checkbox" name="ti-sport" value="${s.id}" ${selectedSports.has(s.id) ? "checked" : ""} />
        <span>${_esc(s.label)}</span>
      </label>`).join("");
    const goalsCheckboxes = _ALL_GOALS.map(g => `
      <label class="coach-ti-check">
        <input type="checkbox" name="ti-goal" value="${g.id}" ${trainingGoals.has(g.id) ? "checked" : ""} />
        <span>${_esc(g.label)}</span>
      </label>`).join("");
    return `<div class="card coach-ti-card coach-ti-card--editing">
      <div class="coach-ti-card-header">
        <div class="coach-ti-card-title">Edit Sports &amp; Goals</div>
      </div>
      <div class="coach-ti-row coach-ti-row--stacked">
        <div class="coach-ti-label">Sports</div>
        <div class="coach-ti-checks">${sportsCheckboxes}</div>
      </div>
      <div class="coach-ti-row coach-ti-row--stacked">
        <div class="coach-ti-label">Goals</div>
        <div class="coach-ti-checks">${goalsCheckboxes}</div>
      </div>
      ${_renderTISaveBar("sports-goals")}
    </div>`;
  }
  function _renderTIEditStrength(ti) {
    const role  = ti.strengthRole || "general";
    const setup = ti.strengthSetup || {};
    const sessions = setup.sessionsPerWeek || 3;
    const split    = setup.split           || "ppl";
    const length   = setup.sessionLength   || 45;
    const roles = [
      { id: "injury_prevention", label: "Injury prevention" },
      { id: "race_performance",  label: "Race performance" },
      { id: "general",           label: "General strength" },
      { id: "minimal",           label: "Minimal" },
    ];
    const splits = [
      { id: "ppl",      label: "Push / Pull / Legs" },
      { id: "ul",       label: "Upper / Lower" },
      { id: "fullBody", label: "Full body" },
      { id: "custom",   label: "Custom" },
    ];
    return `<div class="card coach-ti-card coach-ti-card--editing">
      <div class="coach-ti-card-header">
        <div class="coach-ti-card-title">Edit Strength</div>
      </div>
      <div class="coach-ti-row coach-ti-row--stacked">
        <div class="coach-ti-label">Role</div>
        <select id="ti-strength-role" class="coach-ti-input">
          ${roles.map(r => `<option value="${r.id}" ${r.id === role ? "selected" : ""}>${_esc(r.label)}</option>`).join("")}
        </select>
      </div>
      <div class="coach-ti-row coach-ti-row--stacked">
        <div class="coach-ti-label">Sessions / week</div>
        <input type="number" id="ti-strength-sessions" class="coach-ti-input" min="0" max="7" value="${_esc(String(sessions))}" />
      </div>
      <div class="coach-ti-row coach-ti-row--stacked">
        <div class="coach-ti-label">Split</div>
        <select id="ti-strength-split" class="coach-ti-input">
          ${splits.map(s => `<option value="${s.id}" ${s.id === split ? "selected" : ""}>${_esc(s.label)}</option>`).join("")}
        </select>
      </div>
      <div class="coach-ti-row coach-ti-row--stacked">
        <div class="coach-ti-label">Session length (min)</div>
        <input type="number" id="ti-strength-length" class="coach-ti-input" min="15" max="180" step="5" value="${_esc(String(length))}" />
      </div>
      ${_renderTISaveBar("strength")}
    </div>`;
  }
  function _renderTIEditLongDays(ti) {
    const longRun  = ti.longDays?.longRun  || "";
    const longRide = ti.longDays?.longRide || "";
    const days = [
      { id: "",    label: "Not set" },
      { id: "mon", label: "Monday" },
      { id: "tue", label: "Tuesday" },
      { id: "wed", label: "Wednesday" },
      { id: "thu", label: "Thursday" },
      { id: "fri", label: "Friday" },
      { id: "sat", label: "Saturday" },
      { id: "sun", label: "Sunday" },
    ];
    const opts = (sel) => days.map(d => `<option value="${d.id}" ${d.id === sel ? "selected" : ""}>${_esc(d.label)}</option>`).join("");
    return `<div class="card coach-ti-card coach-ti-card--editing">
      <div class="coach-ti-card-header">
        <div class="coach-ti-card-title">Edit Long Days</div>
      </div>
      <div class="coach-ti-row coach-ti-row--stacked">
        <div class="coach-ti-label">Long run</div>
        <select id="ti-longdays-run" class="coach-ti-input">${opts(longRun)}</select>
      </div>
      <div class="coach-ti-row coach-ti-row--stacked">
        <div class="coach-ti-label">Long ride</div>
        <select id="ti-longdays-ride" class="coach-ti-input">${opts(longRide)}</select>
      </div>
      ${_renderTISaveBar("long-days")}
    </div>`;
  }
  function _renderTISaveBar(card) {
    const saving = _tiSaveState === "saving";
    const errorHtml = _tiSaveError ? `<div class="coach-ti-save-err">${_esc(_tiSaveError)}</div>` : "";
    return `<div class="coach-ti-save-bar">
      ${errorHtml}
      <button type="button" class="btn-secondary" ${saving ? "disabled" : ""} onclick="coachTICancel()">Cancel</button>
      <button type="button" class="btn-primary" ${saving ? "disabled" : ""} onclick="coachTISave('${card}')">${saving ? "Saving…" : "Save"}</button>
    </div>`;
  }

  // ── Edit-mode handlers + RPC plumbing ───────────────────────────────
  function coachTIEdit(card) {
    _editingTI    = card;
    _tiSaveState  = "idle";
    _tiSaveError  = "";
    // Snapshot the current weekly template so picker add/remove
    // operations have a target to mutate that's separate from the
    // saved value. Per-day arrays are shallow-cloned so removals
    // don't reach back into _data.trainingInputs.
    if (card === "weekly-schedule") {
      const tpl = _data.trainingInputs?.buildPlanTemplate || {};
      _tiWeeklyDraft = {};
      for (const d of _TI_DAY_KEYS) {
        _tiWeeklyDraft[d] = Array.isArray(tpl[d]) ? tpl[d].slice() : [];
      }
    } else {
      _tiWeeklyDraft = null;
    }
    _rerenderTrainingInputs();
  }
  function coachTICancel() {
    _editingTI     = null;
    _tiSaveState   = "idle";
    _tiSaveError   = "";
    _tiWeeklyDraft = null;
    _rerenderTrainingInputs();
  }
  async function coachTISave(card) {
    if (!_client || !_client.id) return;
    _tiSaveState = "saving";
    _tiSaveError = "";
    _rerenderTrainingInputs();
    try {
      const writes = _readTIEditForm(card);
      if (!writes) {
        _tiSaveState = "error";
        _tiSaveError = "Couldn't read form values.";
        _rerenderTrainingInputs();
        return;
      }
      // Each writable field goes through its own RPC call so the audit
      // log captures field-level history. Sequential rather than
      // parallel — keeps the audit trail in a deterministic order and
      // means a partial failure reports cleanly.
      for (const [dataKey, dataValue] of writes) {
        await _callCoachTrainingInputRPC(dataKey, dataValue);
        // Patch local _data.trainingInputs so the UI reflects the save
        // immediately without a full re-fetch round-trip.
        _data.trainingInputs[
          dataKey === "selectedSports" ? "selectedSports"
          : dataKey === "trainingGoals" ? "trainingGoals"
          : dataKey === "strengthRole"  ? "strengthRole"
          : dataKey === "strengthSetup" ? "strengthSetup"
          : dataKey === "longDays"      ? "longDays"
          : dataKey
        ] = dataValue;
      }
      _editingTI     = null;
      _tiSaveState   = "idle";
      _tiSaveError   = "";
      _tiWeeklyDraft = null;
      _rerenderTrainingInputs();
    } catch (e) {
      _tiSaveState = "error";
      _tiSaveError = (e && e.message) || "Save failed.";
      _rerenderTrainingInputs();
    }
  }
  function _rerenderTrainingInputs() {
    if (_activeTab !== "training-inputs") return;
    const wrap = document.querySelector(".coach-client-tab-content");
    if (wrap) wrap.innerHTML = _renderTrainingInputs();
  }
  function _readTIEditForm(card) {
    if (card === "sports-goals") {
      const sports = Array.from(document.querySelectorAll('input[name="ti-sport"]:checked')).map(el => el.value);
      const goals  = Array.from(document.querySelectorAll('input[name="ti-goal"]:checked')).map(el => el.value);
      return [
        ["selectedSports", sports],
        ["trainingGoals",  goals],
      ];
    }
    if (card === "strength") {
      const role = document.getElementById("ti-strength-role")?.value || "general";
      const sessionsPerWeek = parseInt(document.getElementById("ti-strength-sessions")?.value, 10);
      const split = document.getElementById("ti-strength-split")?.value || "ppl";
      const sessionLength = parseInt(document.getElementById("ti-strength-length")?.value, 10);
      if (Number.isNaN(sessionsPerWeek) || sessionsPerWeek < 0 || sessionsPerWeek > 7) {
        throw new Error("Sessions / week must be 0–7.");
      }
      if (Number.isNaN(sessionLength) || sessionLength < 15 || sessionLength > 180) {
        throw new Error("Session length must be 15–180 min.");
      }
      // Preserve any prior fields (customMuscles, refreshWeeks, etc.) the
      // UI doesn't expose so a partial edit doesn't blow them away.
      const prior = _data.trainingInputs.strengthSetup || {};
      const setup = { ...prior, sessionsPerWeek, split, sessionLength };
      return [
        ["strengthRole",  role],
        ["strengthSetup", setup],
      ];
    }
    if (card === "long-days") {
      const longRun  = document.getElementById("ti-longdays-run")?.value || "";
      const longRide = document.getElementById("ti-longdays-ride")?.value || "";
      const next = {};
      if (longRun)  next.longRun  = longRun;
      if (longRide) next.longRide = longRide;
      return [["longDays", next]];
    }
    if (card === "weekly-schedule") {
      // Normalize the in-memory draft for save: only persist days that
      // have at least one slot (matches onboarding-v2 _normalizeTemplate).
      // Empty days are implicit rest — no entry needed in the JSONB.
      const out = {};
      for (const d of _TI_DAY_KEYS) {
        const slots = Array.isArray(_tiWeeklyDraft?.[d]) ? _tiWeeklyDraft[d] : [];
        if (slots.length) out[d] = slots.slice();
      }
      return [["buildPlanTemplate", out]];
    }
    return null;
  }
  async function _callCoachTrainingInputRPC(dataKey, dataValue) {
    const sb = window.supabaseClient;
    if (!sb) throw new Error("Supabase client not initialized.");
    const { error } = await sb.rpc("coach_update_client_training_input", {
      p_client_id:  _client.id,
      p_data_key:   dataKey,
      p_data_value: dataValue,
    });
    if (error) throw new Error(error.message);
  }

  // Helpers — minimal pretty-printers shared by the read-only render.
  // Kept inline to keep PR 1 self-contained; if PR 3 needs to write
  // these labels back through an edit form the maps lift up cleanly.
  // Coach-assigned program inputs — mirror of planner.js
  // _getCoachProgramInputs but reads from a passed-in schedule rather
  // than localStorage so the coach view sees the CLIENT's schedule.
  // Groups by program id; counts upcoming sessions; returns the
  // earliest start + latest end so the tile can show a window.
  function _coachProgramInputsFromSchedule(schedule) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const groups = {};
    for (const e of schedule || []) {
      if (!e || e.source !== "coach_assigned") continue;
      if (!e.date || e.date < todayStr) continue;
      const cp = e.coachProgram;
      if (!cp || !cp.id) continue;
      if (!groups[cp.id]) {
        groups[cp.id] = {
          programId:   cp.id,
          programName: cp.name || "Coach Program",
          weeks:       cp.weeks || null,
          coachName:   e.coachName || "Coach",
          sessions:    0,
          startDate:   e.date,
          endDate:     e.date,
        };
      }
      const g = groups[cp.id];
      g.sessions++;
      if (e.date < g.startDate) g.startDate = e.date;
      if (e.date > g.endDate)   g.endDate   = e.date;
    }
    return Object.values(groups).sort((a, b) => a.startDate.localeCompare(b.startDate));
  }
  // Aggregate athlete-owned coach-sheet imports (one tile per planId).
  // Same shape as _coachProgramInputsFromSchedule but keyed off
  // source==="coach_sheet" + the planId field stamped at import.
  function _coachSheetInputsFromSchedule(schedule) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const groups = {};
    for (const e of schedule || []) {
      if (!e || e.source !== "coach_sheet") continue;
      if (!e.date || e.date < todayStr) continue;
      if (!e.planId) continue;
      if (!groups[e.planId]) {
        groups[e.planId] = {
          planId:    e.planId,
          planName:  e.planName || "Coach plan",
          sessions:  0,
          startDate: e.date,
          endDate:   e.date,
        };
      }
      const g = groups[e.planId];
      g.sessions++;
      if (e.date < g.startDate) g.startDate = e.date;
      if (e.date > g.endDate)   g.endDate   = e.date;
    }
    // Compute weeks count per group from the date range.
    return Object.values(groups)
      .map(g => {
        const days = Math.round((new Date(g.endDate + "T00:00:00") - new Date(g.startDate + "T00:00:00")) / 86400000) + 1;
        g.weeks = Math.max(1, Math.ceil(days / 7));
        return g;
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }
  function _coachSheetTile(sp) {
    const endLabel = (() => {
      try {
        return new Date(sp.endDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      } catch { return sp.endDate; }
    })();
    const sessionLabel = `${sp.sessions} upcoming workout${sp.sessions === 1 ? "" : "s"}`;
    const meta = `${sp.weeks}-week plan · imported by athlete`;
    // No edit/delete — the athlete owns this, coach is a viewer.
    return `<div class="ti-card ti-card--coach-plan coach-ti-program-tile">
      <div class="race-card-top">
        <span class="ti-card-badge ti-card-badge--coach-plan">COACH SHEET</span>
      </div>
      <div class="race-card-name">${_esc(sp.planName)}</div>
      <div class="race-card-meta">${_esc(meta)}</div>
      <div class="race-card-footer">
        <span class="race-date-badge">${_esc(sessionLabel)}</span>
        <span class="race-countdown">through ${_esc(endLabel)}</span>
      </div>
    </div>`;
  }

  function _coachProgramTile(cp) {
    const endLabel = (() => {
      try {
        return new Date(cp.endDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      } catch { return cp.endDate; }
    })();
    const sessionLabel = `${cp.sessions} upcoming workout${cp.sessions === 1 ? "" : "s"}`;
    const meta = cp.weeks ? `${cp.weeks}-week program` : "Custom program";
    const programId = String(cp.programId || "");
    // Athletes can't delete coach-assigned workouts (intentional —
    // keeps a runaway "delete a workout" tap from wiping coach work).
    // Coach surfaces the delete here so they can pull a misapplied or
    // outdated program off the client's calendar in one tap. Wipes
    // future-dated coach_assigned_workouts rows for this program for
    // this client; AFTER DELETE trigger mirrors removal into
    // user_data.workoutSchedule. Past assignments stay for history.
    const delAttrs = programId
      ? `data-program-id="${_esc(programId)}" data-program-name="${_esc(cp.programName || "")}" data-session-count="${cp.sessions || 0}"`
      : "";
    return `<div class="ti-card ti-card--coach-plan coach-ti-program-tile">
      <div class="race-card-top">
        <span class="ti-card-badge ti-card-badge--coach-plan">COACH PLAN</span>
        <div class="coach-ti-program-actions">
          ${programId ? `<button type="button" class="coach-ti-edit-btn" onclick="openCoachProgramEdit('${programId}', { startDate: '${_esc(cp.startDate || "")}' })">Edit</button>` : ""}
          ${programId ? `<button type="button" class="coach-ti-delete-btn" ${delAttrs}
            onclick="coachDeleteAssignedProgram(this)" title="Remove from client's calendar">Delete</button>` : ""}
        </div>
      </div>
      <div class="race-card-name">${_esc(cp.programName)}</div>
      <div class="race-card-meta">${_esc(meta)}</div>
      <div class="race-card-footer">
        <span class="race-date-badge">${_esc(sessionLabel)}</span>
        <span class="race-countdown">through ${_esc(endLabel)}</span>
      </div>
    </div>`;
  }

  // Coach-side: remove every future-dated coach_assigned_workouts row
  // for this (client, program) pair. Past rows stay so the client's
  // history isn't rewritten. AFTER DELETE trigger
  // (20260429_coach_assignment_mirror.sql) propagates each removal
  // into user_data.workoutSchedule on its own; we just refresh the
  // local view after.
  async function coachDeleteAssignedProgram(btn) {
    if (!_client || !_client.id) return;
    const programId = btn?.dataset?.programId;
    const programName = btn?.dataset?.programName || "this program";
    const sessionCount = parseInt(btn?.dataset?.sessionCount, 10) || 0;
    if (!programId) return;
    const sessionLabel = sessionCount === 1 ? "1 upcoming workout" : `${sessionCount} upcoming workouts`;
    if (!confirm(`Remove "${programName}" from ${_client.full_name || _client.email || "this client"}'s calendar?\n\nThis deletes ${sessionLabel}. Past completed sessions stay for history. The client can't undo this.`)) {
      return;
    }
    const sb = window.supabaseClient;
    if (!sb) { alert("Auth client not available."); return; }
    const todayStr = new Date().toISOString().slice(0, 10);
    btn.disabled = true;
    btn.textContent = "Removing…";
    try {
      const { error } = await sb.from("coach_assigned_workouts")
        .delete()
        .eq("client_id", _client.id)
        .eq("program_id", programId)
        .gte("date", todayStr);
      if (error) throw new Error(error.message);
      // Reload the detail view so the COACH PLAN tile disappears /
      // the calendar reflects the strip.
      if (typeof window.loadCoachClientDetail === "function") {
        await window.loadCoachClientDetail(_client.id);
      } else {
        _render();
      }
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "Delete";
      alert("Couldn't delete: " + (e.message || "unknown error"));
    }
  }
  if (typeof window !== "undefined") {
    window.coachDeleteAssignedProgram = coachDeleteAssignedProgram;
  }

  function _coachRaceCard(race) {
    const dateObj = new Date(race.date + "T00:00:00");
    const today = new Date();
    const daysAway = Math.ceil((dateObj - today) / (1000 * 60 * 60 * 24));
    const priority = (race.priority || "A").toUpperCase();
    const priorityClass = priority.toLowerCase();
    const dateLabel = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const countdownLabel = daysAway >= 0 ? `${daysAway} days away` : `${Math.abs(daysAway)} days ago`;
    const tagBits = [
      race.level ? race.level.charAt(0).toUpperCase() + race.level.slice(1) : null,
      race.daysPerWeek ? `${race.daysPerWeek}× / week` : null,
    ].filter(Boolean).map(t => `<span class="race-tag">${_esc(t)}</span>`).join("");
    // Race id may be numeric or uuid — escape for the inline attribute
    // and pass through to the edit / typed-confirm flow as a string.
    const raceId = String(race.id || "");
    return `<div class="race-card coach-ti-race-card">
      <div class="race-card-top">
        <span class="race-priority-badge priority-${priorityClass}">${priority} Race</span>
        <div class="coach-ti-race-actions">
          <button type="button" class="coach-ti-edit-btn" onclick="coachTIRaceEditOpen('${raceId}')" title="Edit race">Edit</button>
          <button type="button" class="coach-ti-race-delete" aria-label="Delete this race"
                  title="Delete race + AI plan"
                  onclick="coachTIRaceDeleteOpen('${raceId}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>
          </button>
        </div>
      </div>
      <div class="race-card-name">${_esc(race.name || race.type || "Race")}</div>
      ${race.location ? `<div class="race-card-detail">${_esc(race.location)}</div>` : ""}
      ${tagBits ? `<div class="race-tags">${tagBits}</div>` : ""}
      <div class="race-card-footer">
        <span class="race-date-badge">${dateLabel}</span>
        <span class="race-countdown ${daysAway < 0 ? "past" : ""}">${countdownLabel}</span>
      </div>
    </div>`;
  }

  function _prettySport(s) {
    return ({ run: "Run", bike: "Bike", swim: "Swim", strength: "Strength", hyrox: "Hyrox", rowing: "Rowing", walking: "Walking", yoga: "Yoga", hiit: "HIIT" })[s] || s;
  }
  function _prettyGoal(g) {
    return ({ race: "Train for a race", speed: "Get faster", endurance: "Build endurance", general: "General fitness", stronger: "Get stronger" })[g] || g;
  }
  function _prettyRole(r) {
    return ({ injury_prevention: "Injury prevention", race_performance: "Race performance", general: "General strength", hypertrophy: "Build muscle", minimal: "Minimal" })[r] || r;
  }
  function _prettySplit(s) {
    return ({ ppl: "Push / Pull / Legs", ul: "Upper / Lower", "upper-lower": "Upper / Lower", fullBody: "Full body", full: "Full body", custom: "Custom" })[s] || s;
  }
  function _prettySlot(s) {
    if (!s) return "";
    if (s === "rest") return "Rest";
    if (s === "brick") return "Brick";
    const map = {
      "run-long": "Long run", "run-interval": "Interval run", "run-tempo": "Tempo run", "run-easy": "Easy run", "run-recovery": "Recovery run", "run": "Run",
      "bike-long": "Long ride", "bike-interval": "Interval ride", "bike-easy": "Easy ride", "bike": "Ride",
      "swim-css": "CSS swim", "swim-endurance": "Endurance swim", "swim": "Swim",
      "strength-push": "Push", "strength-pull": "Pull", "strength-legs": "Legs",
      "strength-upper": "Upper", "strength-lower": "Lower", "strength-full": "Full body",
      "strength-custom": "Custom", "strength": "Strength",
    };
    return map[s] || s;
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

  // Per-day macro overlay — coach can nudge calories, carbs, protein, or
  // fat for a single date. Stored on nutritionAdjustments[date]._coachOverlay
  // as { calories_add, carbs_add_g, protein_add_g, fat_add_g }. Each is
  // optional; renderer skips null/0 values when summarising.
  const _OVERLAY_FIELDS = [
    { key: "calories_add",   label: "Calories",  unit: "kcal", short: "kcal", emoji: "🔥" },
    { key: "carbs_add_g",    label: "Carbs",     unit: "g",    short: "g carbs",   emoji: "🍞" },
    { key: "protein_add_g",  label: "Protein",   unit: "g",    short: "g protein", emoji: "🥩" },
    { key: "fat_add_g",      label: "Fat",       unit: "g",    short: "g fat",     emoji: "🥑" },
  ];

  function _hasOverlayValue(overlay) {
    if (!overlay) return false;
    return _OVERLAY_FIELDS.some(f => overlay[f.key] != null && overlay[f.key] !== 0);
  }

  function _renderCoachCarbOverlayRow(date) {
    const overlay = _getOverlay(date);
    const isEditing = _editingOverlayDate === date;

    if (isEditing) {
      const inputs = _OVERLAY_FIELDS.map(f => {
        const v = overlay && overlay[f.key] != null ? overlay[f.key] : "";
        return `<label class="coach-overlay-field">
          <span class="coach-overlay-field-label">${_esc(f.label)}</span>
          <span class="coach-overlay-field-input-wrap">
            <input type="number" data-field="${f.key}" id="coach-overlay-input-${_esc(date)}-${f.key}"
                   class="input coach-overlay-input"
                   value="${_esc(v)}" placeholder="+/-" step="${f.key === "calories_add" ? "10" : "5"}" />
            <span class="coach-overlay-field-unit">${_esc(f.unit)}</span>
          </span>
        </label>`;
      }).join("");
      return `<div class="coach-cal-nutrition coach-cal-nutrition--editing" data-date="${_esc(date)}">
        <div class="coach-overlay-grid">${inputs}</div>
        <div class="coach-overlay-actions">
          <button class="btn-primary btn-sm" onclick="coachSaveDayCarbOverlay('${_esc(date)}')">Save</button>
          <button class="btn-secondary btn-sm" onclick="coachCancelDayCarbOverlay()">Cancel</button>
          ${_hasOverlayValue(overlay)
            ? `<button class="btn-ghost btn-sm" onclick="coachClearDayCarbOverlay('${_esc(date)}')">Clear</button>`
            : ""}
        </div>
      </div>`;
    }

    if (_hasOverlayValue(overlay)) {
      const pills = _OVERLAY_FIELDS
        .filter(f => overlay[f.key] != null && overlay[f.key] !== 0)
        .map(f => {
          const v = overlay[f.key];
          const sign = v > 0 ? "+" : "";
          return `<span class="coach-cal-nutrition-pill">${f.emoji} ${sign}${_esc(v)} ${_esc(f.short)}</span>`;
        }).join("");
      return `<div class="coach-cal-nutrition">
        ${pills}
        <button class="coach-feature-edit-btn" onclick="coachStartDayCarbOverlay('${_esc(date)}')">✎ edit</button>
      </div>`;
    }

    return `<div class="coach-cal-nutrition">
      <button class="coach-feature-edit-btn" onclick="coachStartDayCarbOverlay('${_esc(date)}')">+ Adjust nutrition</button>
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
    const next = {};
    let hasAny = false;
    for (const f of _OVERLAY_FIELDS) {
      const inp = document.getElementById(`coach-overlay-input-${date}-${f.key}`);
      if (!inp) continue;
      const raw = inp.value;
      if (raw === "" || raw == null) { next[f.key] = null; continue; }
      const v = parseFloat(raw);
      if (!isFinite(v)) { alert(`${f.label}: enter a number (e.g. 50) or leave blank.`); return; }
      next[f.key] = v;
      if (v !== 0) hasAny = true;
    }
    // No values at all → clear the overlay so we don't store an empty
    // _coachOverlay object on the day.
    const res = await _writeOverlayForDate(date, hasAny ? next : null);
    if (res.error) { alert("Couldn't save: " + res.error); return; }
    _editingOverlayDate = null;
    const wrap = document.querySelector(".coach-client-tab-content");
    if (wrap) wrap.innerHTML = _renderActiveTab();
    if (typeof trackEvent === "function") {
      try { trackEvent("coach_day_macro_overlay_saved", { date, fields: Object.keys(next).filter(k => next[k] != null && next[k] !== 0) }); } catch {}
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
    // Intervals can sit inside aiSession (current shape) or at the top
    // level (legacy). Pass through either so the modal pre-fills cardio
    // workouts on edit instead of opening with empty rows.
    const _entryIntervals =
      Array.isArray(entry.aiSession?.intervals) ? entry.aiSession.intervals
      : Array.isArray(entry.intervals)          ? entry.intervals
      : [];
    const prefill = {
      date:        entry.date,
      sessionName: entry.sessionName || "",
      type:        entry.type || "weightlifting",
      duration:    entry.duration || "",
      exercises:   Array.isArray(entry.exercises) ? entry.exercises : [],
      intervals:   _entryIntervals,
      hiitMeta:    entry.hiitMeta || null,
      details:     entry.details || "",
      coachNote:   entry.coachNote || "",
      whyText:     entry.whyText || entry.why_text || "",
    };
    if (entry.source === "coach_assigned" && entry.coachAssignmentId) {
      prefill.assignmentId = entry.coachAssignmentId;
    }
    window.openAssignWorkoutModal(_client.id, _clientName, prefill);
  }

  // ── Library picker — pick a saved workout, prefill the assign modal ───
  // Pulls from BOTH the coach's coaching-specific library
  // (coach_workout_library) and the coach's personal Saved library
  // (SavedWorkoutsLibrary). The two stores live separately by design —
  // the coaching library is for templates the coach builds explicitly
  // for clients; the personal library is whatever the user has bookmarked
  // for their own training. This picker surfaces both with section
  // headers + filter chips so a coach who is also an athlete can assign
  // either source without juggling between tabs. (User feedback
  // 2026-04-29: "i have one workout saved but now it's showing 4. doesn't
  // make any sense." — root cause was the two libraries being invisible
  // to each other.)
  let _libPickerSection = "all"; // "all" | "coach" | "personal"

  function _libPickerRowHtml(item, idx) {
    const isCoach = item._source === "coach";
    const w = isCoach ? (item.workout || {}) : (item.payload || {});
    const exCount = Array.isArray(w.exercises) ? w.exercises.length : 0;
    const ivCount = Array.isArray(w.aiSession?.intervals) ? w.aiSession.intervals.length
                  : Array.isArray(w.intervals)            ? w.intervals.length
                  : 0;
    const segCount = Array.isArray(w.segments) ? w.segments.length : 0;
    const typeLabelText = w.type ? _typeLabel(w.type) : (item.workout_kind ? _typeLabel(item.workout_kind) : null);
    const meta = [
      typeLabelText,
      w.duration ? `${w.duration} min` : null,
      exCount ? `${exCount} exercise${exCount === 1 ? "" : "s"}` : null,
      ivCount ? `${ivCount} interval${ivCount === 1 ? "" : "s"}` : null,
      (!exCount && !ivCount && segCount) ? `${segCount} segment${segCount === 1 ? "" : "s"}` : null,
    ].filter(Boolean).join(" · ");
    const name = isCoach
      ? (item.name || w.sessionName || "Untitled")
      : (item.custom_name || w.sessionName || item.variant_id || "Untitled");
    return `<div class="coach-lib-picker-row" data-picker-idx="${idx}"
                 onclick="pickCoachLibraryForAssign(${idx})"
                 tabindex="0"
                 onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();pickCoachLibraryForAssign(${idx})}">
      <div class="coach-lib-picker-row-name">${_esc(name)}</div>
      <div class="coach-lib-picker-row-meta">${_esc(meta || "—")}</div>
    </div>`;
  }

  function _renderLibPicker() {
    const list = document.getElementById("coach-lib-picker-list");
    if (!list) return;
    const cache = window._coachLibPickerCache || [];
    const coachItems    = [];
    const personalItems = [];
    cache.forEach((item, idx) => {
      const html = _libPickerRowHtml(item, idx);
      if (item._source === "coach") coachItems.push(html);
      else                          personalItems.push(html);
    });

    const showCoach    = _libPickerSection !== "personal";
    const showPersonal = _libPickerSection !== "coach";

    const chipHtml = `
      <div class="coach-lib-picker-chips">
        <button class="coach-lib-picker-chip${_libPickerSection === "all" ? " is-active" : ""}"
                onclick="setCoachLibPickerSection('all')">All <span class="coach-lib-picker-chip-count">${cache.length}</span></button>
        <button class="coach-lib-picker-chip${_libPickerSection === "coach" ? " is-active" : ""}"
                onclick="setCoachLibPickerSection('coach')">Coach Library <span class="coach-lib-picker-chip-count">${coachItems.length}</span></button>
        <button class="coach-lib-picker-chip${_libPickerSection === "personal" ? " is-active" : ""}"
                onclick="setCoachLibPickerSection('personal')">Personal Saved <span class="coach-lib-picker-chip-count">${personalItems.length}</span></button>
      </div>`;

    const sections = [];
    if (showCoach && coachItems.length) {
      sections.push(`<div class="coach-lib-picker-section-label">Coach Library</div>${coachItems.join("")}`);
    }
    if (showPersonal && personalItems.length) {
      sections.push(`<div class="coach-lib-picker-section-label">Personal Saved</div>${personalItems.join("")}`);
    }

    let body;
    if (sections.length) {
      body = sections.join("");
    } else if (cache.length) {
      // Filter selected has no items in it; show a tailored empty state.
      const which = _libPickerSection === "coach" ? "coach library" : "personal saved";
      body = `<div class="coach-lib-picker-empty">Nothing in your ${which} yet.</div>`;
    } else {
      body = `<div class="coach-lib-picker-empty">
        No saved workouts yet. Build one via the Library tab → New Workout, or save a workout from your own calendar.
      </div>`;
    }

    list.innerHTML = chipHtml + body;
  }

  function setCoachLibPickerSection(section) {
    _libPickerSection = section;
    _renderLibPicker();
  }

  async function openCoachLibraryPicker(clientId, clientName) {
    const overlay = document.getElementById("coach-lib-picker-overlay");
    const list = document.getElementById("coach-lib-picker-list");
    if (!overlay || !list) return;
    list.dataset.clientId = clientId;
    list.dataset.clientName = clientName || "";
    list.innerHTML = `<div class="coach-lib-picker-empty">Loading…</div>`;
    overlay.classList.add("is-open");
    _libPickerSection = "all";

    const sb = window.supabaseClient;
    if (!sb) { list.innerHTML = `<div class="coach-lib-picker-empty">Auth client not available.</div>`; return; }
    const sess = (await sb.auth.getSession())?.data?.session;
    const coachId = sess?.user?.id;
    if (!coachId) { list.innerHTML = `<div class="coach-lib-picker-empty">Not signed in.</div>`; return; }

    // Fetch both stores in parallel. Personal saved is a localStorage-
    // backed module, fast and offline-safe; coach library is a Supabase
    // round-trip that can fail or time out without blocking the personal
    // list from rendering.
    const coachPromise = sb.from("coach_workout_library")
      .select("id, name, notes, workout, created_at")
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false });
    const personalPromise = (window.SavedWorkoutsLibrary && typeof window.SavedWorkoutsLibrary.listSaved === "function")
      ? window.SavedWorkoutsLibrary.listSaved().catch(() => [])
      : Promise.resolve([]);

    const [coachRes, personal] = await Promise.all([coachPromise, personalPromise]);
    const coachData = (coachRes && !coachRes.error && Array.isArray(coachRes.data)) ? coachRes.data : [];

    // Tag each row with its source so the row renderer + click handler
    // know which data shape they're working with.
    const tagged = []
      .concat(coachData.map(x => Object.assign({ _source: "coach" }, x)))
      .concat((personal || []).map(x => Object.assign({ _source: "personal" }, x)));
    window._coachLibPickerCache = tagged;
    _renderLibPicker();
  }

  function closeCoachLibraryPicker() {
    const overlay = document.getElementById("coach-lib-picker-overlay");
    if (overlay) overlay.classList.remove("is-open");
  }

  function pickCoachLibraryForAssign(idxOrId) {
    const list = document.getElementById("coach-lib-picker-list");
    const cache = window._coachLibPickerCache || [];
    // Accept either a numeric index (new sectioned picker) or a string
    // id (legacy callers / direct id passing — defensive).
    let item = null;
    if (typeof idxOrId === "number") {
      item = cache[idxOrId] || null;
    } else {
      item = cache.find(x => x.id === idxOrId) || null;
    }
    if (!item || !list) return;
    const clientId = list.dataset.clientId;
    const clientName = list.dataset.clientName || "";
    const isCoach = item._source === "coach";
    const w = isCoach ? (item.workout || {}) : (item.payload || {});
    // Cardio intervals live under aiSession.intervals; reading w.intervals
    // alone produced empty rows when picking a running/cycling/swim item
    // from the library, and re-saving the assignment without re-typing
    // them blanked out the workout body on the client's calendar.
    const _intervals =
      Array.isArray(w.aiSession?.intervals) ? w.aiSession.intervals
      : Array.isArray(w.intervals)          ? w.intervals
      : [];
    const fallbackName = isCoach
      ? (item.name || "")
      : (item.custom_name || item.variant_id || "");
    const fallbackType = isCoach
      ? null
      : item.workout_kind || item.sport_id || null;
    // Pull any embedded per-interval / per-exercise text into the coach
    // note field if the coach hasn't already supplied one. Auto-generated
    // workout descriptions ("55 min @ conversational, by feel.
    // Conversational. Skip if you don't feel recovered.") used to live
    // only on the interval row, where the coach couldn't easily edit
    // them per-assignment. Surfacing them in the coach note gives the
    // coach an obvious place to amend or delete the wording before
    // assigning. (Library-level cleanup via the new "Clear" button on
    // the library list is the longer-term answer; this prefill makes
    // the per-assignment path bearable in the meantime.)
    const _embeddedNotes = [];
    for (const iv of _intervals) {
      const t = String(iv?.details || "").trim();
      if (t) _embeddedNotes.push(t);
    }
    if (Array.isArray(w.exercises)) {
      for (const ex of w.exercises) {
        const t = String(ex?.notes || "").trim();
        if (t) _embeddedNotes.push(ex.name ? `${ex.name}: ${t}` : t);
      }
    }
    const _libraryNote = isCoach ? (item.notes || "") : "";
    const _coachNotePrefill = _libraryNote || (_embeddedNotes.length ? _embeddedNotes.join("\n") : "");
    const prefill = {
      sessionName: w.sessionName || fallbackName || "",
      type:        w.type || fallbackType || "weightlifting",
      duration:    w.duration || "",
      coachNote:   _coachNotePrefill,
      exercises:   Array.isArray(w.exercises) ? w.exercises : [],
      intervals:   _intervals,
      aiSession:   w.aiSession || null,
      hiitMeta:    w.hiitMeta || null,
      details:     w.details || "",
      whyText:     w.whyText || w.why_text || "",
    };
    closeCoachLibraryPicker();
    if (typeof window.openAssignWorkoutModal === "function") {
      window.openAssignWorkoutModal(clientId, clientName, prefill);
    }
  }

  // ── Public surface ─────────────────────────────────────────────────────
  window.loadCoachClientDetail   = loadCoachClientDetail;
  window.setCoachClientTab       = setCoachClientTab;
  window.setCoachCalWeekDelta    = setCoachCalWeekDelta;
  // Namespaced surface for the Benchmarks sport sub-tabs — keeps the
  // bare-window namespace tidier than a fifth global.
  window.coachClientDetail       = Object.assign(window.coachClientDetail || {}, {
    setBenchmarkSport,
  });
  window.coachStartFeatureEdit   = coachStartFeatureEdit;
  window.coachCancelFeatureEdit  = coachCancelFeatureEdit;
  window.coachSaveFeatureEdit    = coachSaveFeatureEdit;
  window.coachEditCalItem        = coachEditCalItem;
  window.coachStartDayCarbOverlay  = coachStartDayCarbOverlay;
  window.coachCancelDayCarbOverlay = coachCancelDayCarbOverlay;
  window.coachSaveDayCarbOverlay   = coachSaveDayCarbOverlay;
  window.coachClearDayCarbOverlay  = coachClearDayCarbOverlay;
  window.openCoachLibraryPicker  = openCoachLibraryPicker;
  window.closeCoachLibraryPicker = closeCoachLibraryPicker;
  window.pickCoachLibraryForAssign = pickCoachLibraryForAssign;
  window.setCoachLibPickerSection = setCoachLibPickerSection;
  // PR 3b — Training Inputs edit handlers.
  window.coachTIEdit             = coachTIEdit;
  window.coachTICancel           = coachTICancel;
  window.coachTISave             = coachTISave;
  // PR 3c — Weekly Schedule chip-grid handlers.
  window.coachTIWeeklyAdd        = coachTIWeeklyAdd;
  window.coachTIWeeklyRemove     = coachTIWeeklyRemove;
  // PR 4 — Delete race + AI plan flow.
  window.coachTIRaceDeleteOpen     = coachTIRaceDeleteOpen;
  window.coachTIRaceDeleteClose    = coachTIRaceDeleteClose;
  window.coachTIRaceDeleteAdvance  = coachTIRaceDeleteAdvance;
  window.coachTIRaceDeleteType     = coachTIRaceDeleteType;
  window.coachTIRaceDeleteConfirm  = coachTIRaceDeleteConfirm;
  // PR 5 — Race edit flow.
  window.coachTIRaceEditOpen       = coachTIRaceEditOpen;
  window.coachTIRaceEditClose      = coachTIRaceEditClose;
  window.coachTIRaceEditField      = coachTIRaceEditField;
  window.coachTIRaceEditSave       = coachTIRaceEditSave;
})();
