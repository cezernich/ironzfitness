// admin-workouts.js — Admin UI for the workout_library table.
// Implements §9f of PLAN_GENERATOR_MASTER_SPEC.md.
//
// Surfaces coverage matrix + filterable table + add/edit form. Gated by
// window._userRole === 'admin' (enforced by admin.js showing the sub-tab).
// Writes use Supabase RLS policies — only admin profiles can mutate.

(function (global) {
  "use strict";

  let _workouts = [];   // full list, unfiltered
  let _editing = null;  // workout being edited, or null for new

  // Canonical session-type buckets per sport. Used to populate the type
  // filter dropdown and to define coverage matrix columns.
  const SESSION_TYPES_BY_SPORT = {
    run:      ["easy", "tempo", "vo2max", "long", "race_pace", "strides", "recovery"],
    bike:     ["easy", "sweet_spot", "threshold", "intervals", "long", "recovery"],
    swim:     ["easy", "technique", "threshold", "intervals"],
    strength: ["injury_prevention", "race_performance", "hypertrophy", "minimal"],
    brick:    ["easy", "race_simulation"],
    cross_train: ["easy", "intervals"],
    // Hyrox-specific session buckets: running intervals, individual station
    // work (sled/wall balls/burpees/etc.), simulations that chain stations
    // with running legs, and the easy aerobic base work hyrox athletes need
    // alongside their station intensity.
    hyrox:    ["easy", "mixed_intervals", "intervals", "stations", "race_simulation"],
    // Circuit / HIIT-style training — keeping HIIT formats as session types
    // so admins can curate each workout shape independently.
    circuit:  ["hiit", "amrap", "emom", "for_time", "metabolic"],
  };
  const PHASES = ["base", "build", "peak", "taper"];

  // "By-design empty" matrix: phases where a given (sport, session_type)
  // should never appear. The coverage matrix renders these as gray with a
  // dash instead of red 0 so real gaps stand out. Also excluded from the
  // "Coverage Gaps" count.
  //
  // Strength: all roles are never in Taper (§5b — strength drops to 0 in
  // Taper). Run/bike quality work is never in Base (§4a Base is all Z1–Z2)
  // and never in Taper (volume + intensity drop). Technique-ish sessions
  // (easy, recovery, technique) stay available everywhere except Taper for
  // the ones that would still fatigue a tapering athlete.
  const NEVER_MATRIX = {
    "run/tempo":      ["base", "taper"],
    "run/vo2max":     ["base", "taper"],
    "run/long":       ["taper"],
    "run/race_pace":  ["base", "build", "taper"],
    "run/strides":    ["taper"],
    "bike/sweet_spot": ["base", "taper"],
    "bike/threshold": ["base", "taper"],
    "bike/intervals": ["base", "taper"],
    "bike/long":      ["taper"],
    "swim/technique": ["taper"],
    "swim/threshold": ["base", "taper"],
    "strength/injury_prevention": ["taper"],
    "strength/race_performance":  ["taper"],
    "strength/hypertrophy":       ["taper"],
    "strength/minimal":           ["taper"],
  };
  function _isIntentionallyEmpty(sport, sessionType, phase) {
    const key = `${sport}/${sessionType}`;
    const neverPhases = NEVER_MATRIX[key];
    return !!(neverPhases && neverPhases.includes(phase));
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  async function loadAdminWorkouts() {
    const client = global.supabaseClient;
    if (!client) {
      console.warn("[AdminWorkouts] no supabase client");
      return;
    }
    try {
      const { data, error } = await client
        .from("workout_library")
        .select("*")
        .order("sport", { ascending: true })
        .order("session_type", { ascending: true })
        .order("name", { ascending: true });
      if (error) {
        console.warn("[AdminWorkouts] load error:", error.message);
        _workouts = [];
      } else {
        _workouts = data || [];
      }
    } catch (e) {
      console.warn("[AdminWorkouts] load exception:", e && e.message);
      _workouts = [];
    }
    renderWorkoutStats();
    renderCoverageMatrix();
    populateTypeFilter();
    renderWorkoutLibraryTable();
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  function renderWorkoutStats() {
    const total = _workouts.length;
    const published = _workouts.filter(w => w.status === "published").length;
    const draft = total - published;
    // Coverage gap = (sport × session_type × phase) cells with 0 published
    // workouts, EXCLUDING cells flagged as intentionally empty in
    // NEVER_MATRIX. Those "never" cells shouldn't count against the admin
    // — they're by design.
    let gaps = 0;
    Object.keys(SESSION_TYPES_BY_SPORT).forEach(sport => {
      SESSION_TYPES_BY_SPORT[sport].forEach(stype => {
        PHASES.forEach(phase => {
          if (_isIntentionallyEmpty(sport, stype, phase)) return;
          const count = _workouts.filter(w =>
            w.sport === sport &&
            w.session_type === stype &&
            w.status === "published" &&
            Array.isArray(w.phases) &&
            w.phases.map(p => String(p).toLowerCase()).includes(phase)
          ).length;
          if (count === 0) gaps++;
        });
      });
    });
    _setText("admin-workouts-total", total);
    _setText("admin-workouts-published", published);
    _setText("admin-workouts-draft", draft);
    _setText("admin-workouts-gaps", gaps);
  }

  // ── Coverage matrix ───────────────────────────────────────────────────────

  function renderCoverageMatrix() {
    const host = document.getElementById("admin-workouts-coverage");
    if (!host) return;

    const sports = Object.keys(SESSION_TYPES_BY_SPORT);
    let html = '<table class="admin-table" style="min-width:600px"><thead><tr><th style="text-align:left">Sport / Type</th>';
    PHASES.forEach(p => { html += `<th>${p}</th>`; });
    html += "<th>Total</th></tr></thead><tbody>";

    sports.forEach(sport => {
      SESSION_TYPES_BY_SPORT[sport].forEach(stype => {
        html += `<tr><td style="text-align:left"><strong>${sport}</strong> / ${stype}</td>`;
        let rowTotal = 0;
        PHASES.forEach(phase => {
          if (_isIntentionallyEmpty(sport, stype, phase)) {
            // By-design empty cell — gray dash so real red gaps stand out.
            html += `<td style="text-align:center;background:rgba(148,163,184,0.18);color:#64748b" title="By design — this session type should never appear in ${phase}">—</td>`;
            return;
          }
          const count = _workouts.filter(w =>
            w.sport === sport &&
            w.session_type === stype &&
            w.status === "published" &&
            Array.isArray(w.phases) &&
            w.phases.map(p => String(p).toLowerCase()).includes(phase)
          ).length;
          rowTotal += count;
          html += `<td style="text-align:center;background:${_coverageBg(count)};color:${_coverageFg(count)}">${count}</td>`;
        });
        html += `<td style="text-align:center;font-weight:600">${rowTotal}</td></tr>`;
      });
    });
    html += "</tbody></table>";
    host.innerHTML = html;
  }

  function _coverageBg(n) {
    if (n === 0) return "rgba(220, 38, 38, 0.15)";     // red
    if (n <= 3) return "rgba(234, 179, 8, 0.15)";      // yellow
    if (n <= 7) return "rgba(22, 163, 74, 0.15)";      // green
    return "rgba(37, 99, 235, 0.15)";                  // blue (8+)
  }
  function _coverageFg(n) {
    if (n === 0) return "#b91c1c";
    if (n <= 3) return "#a16207";
    if (n <= 7) return "#15803d";
    return "#1d4ed8";
  }

  // ── Filter dropdowns ──────────────────────────────────────────────────────

  function populateTypeFilter() {
    const sel = document.getElementById("admin-workouts-type-filter");
    if (!sel) return;
    // Collect unique types actually present in the data, fall back to canonical.
    const present = Array.from(new Set(_workouts.map(w => w.session_type))).filter(Boolean).sort();
    const optsHtml = ['<option value="">All Types</option>']
      .concat(present.map(t => `<option value="${_escape(t)}">${_escape(t)}</option>`))
      .join("");
    sel.innerHTML = optsHtml;
  }

  // ── Table render ──────────────────────────────────────────────────────────

  function renderWorkoutLibraryTable() {
    const tbody = document.getElementById("admin-workouts-tbody");
    if (!tbody) return;

    const search = (document.getElementById("admin-workouts-search")?.value || "").toLowerCase();
    const sport  = document.getElementById("admin-workouts-sport-filter")?.value || "";
    const stype  = document.getElementById("admin-workouts-type-filter")?.value || "";
    const phase  = document.getElementById("admin-workouts-phase-filter")?.value || "";
    const status = document.getElementById("admin-workouts-status-filter")?.value || "";

    const filtered = _workouts.filter(w => {
      if (search && !String(w.name).toLowerCase().includes(search)) return false;
      if (sport && w.sport !== sport) return false;
      if (stype && w.session_type !== stype) return false;
      if (status && w.status !== status) return false;
      if (phase) {
        if (!Array.isArray(w.phases) || !w.phases.map(p => String(p).toLowerCase()).includes(phase)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:16px;color:#666">No workouts match these filters.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(w => `
      <tr class="workout-row" onclick="adminShowPreview('${_escape(w.id)}')" style="cursor:pointer">
        <td style="text-align:left"><strong>${_escape(w.name)}</strong><br><span class="hint" style="font-size:0.85em">${_escape(w.description || "")}</span></td>
        <td>${_escape(w.sport)}</td>
        <td>${_escape(w.session_type)}</td>
        <td>${_escape((w.phases || []).join(", "))}</td>
        <td>${_escape((w.levels || []).join(", "))}</td>
        <td><span class="status-pill status-${_escape(w.status)}">${_escape(w.status)}</span></td>
        <td onclick="event.stopPropagation()">
          <button class="btn-link" onclick="adminOpenWorkoutEditor('${_escape(w.id)}')">Edit</button>
          <button class="btn-link" onclick="adminDuplicateWorkout('${_escape(w.id)}')">Duplicate</button>
          <button class="btn-link" onclick="adminToggleWorkoutStatus('${_escape(w.id)}')">${w.status === "published" ? "Unpublish" : "Publish"}</button>
        </td>
      </tr>
    `).join("");
  }

  // ── Preview panel ────────────────────────────────────────────────────────
  // Click any row → the preview panel opens showing the full workout
  // structure (warmup / main set / cooldown) with phase/level/goal tags.
  // The "Preview as" dropdown swaps zone placeholders (Z3) with concrete
  // paces for a chosen sample athlete. Zone colors come from style.css —
  // .zone-1..zone-5 — so the preview matches the athlete-facing UI.

  // Sample athletes for the "Preview as" dropdown. Each supplies thresholds
  // that TrainingZones uses to fill in real paces. Presets are sport-aware
  // — a bike workout shouldn't advertise "Intermediate runner" in its
  // preview picker. The running table uses VDOT → 5K time (Daniels), the
  // cycling table uses FTP watts, and swimming uses CSS pace.
  const PREVIEW_PRESET_TABLES = {
    running: {
      beginner:     { label: "Beginner runner (VDOT 35 — ~26:30 5K)",                    thresholds: { running_5k: "26:30" },                                   level: "beginner",     weight_lbs: 195 },
      intermediate: { label: "Intermediate runner (VDOT 45 — ~21:30 5K)",                thresholds: { running_5k: "21:30" },                                   level: "intermediate", weight_lbs: 170 },
      advanced:     { label: "Advanced runner (VDOT 50.8 — 19:40 5K)",                   thresholds: { running_5k: "19:40" },                                   level: "advanced",     weight_lbs: 165 },
    },
    cycling: {
      beginner:     { label: "Beginner cyclist (FTP 160W)",                              thresholds: { cycling_ftp: 160 },                                       level: "beginner",     weight_lbs: 195 },
      intermediate: { label: "Intermediate cyclist (FTP 220W)",                          thresholds: { cycling_ftp: 220 },                                       level: "intermediate", weight_lbs: 170 },
      advanced:     { label: "Advanced cyclist (FTP 270W)",                              thresholds: { cycling_ftp: 270 },                                       level: "advanced",     weight_lbs: 165 },
    },
    swimming: {
      beginner:     { label: "Beginner swimmer (CSS 2:15 /100m)",                        thresholds: { swim_css: "2:15" },                                       level: "beginner",     weight_lbs: 195 },
      intermediate: { label: "Intermediate swimmer (CSS 2:00 /100m)",                    thresholds: { swim_css: "2:00" },                                       level: "intermediate", weight_lbs: 170 },
      advanced:     { label: "Advanced swimmer (CSS 1:45 /100m)",                        thresholds: { swim_css: "1:45" },                                       level: "advanced",     weight_lbs: 165 },
    },
    triathlon: {
      beginner:     { label: "Beginner triathlete (VDOT 35, FTP 160W, CSS 2:15)",        thresholds: { running_5k: "26:30", cycling_ftp: 160, swim_css: "2:15" }, level: "beginner",     weight_lbs: 195 },
      intermediate: { label: "Intermediate triathlete (VDOT 45, FTP 220W, CSS 2:00)",    thresholds: { running_5k: "21:30", cycling_ftp: 220, swim_css: "2:00" }, level: "intermediate", weight_lbs: 170 },
      advanced:     { label: "Advanced triathlete (VDOT 50.8, FTP 270W, CSS 1:45)",      thresholds: { running_5k: "19:40", cycling_ftp: 270, swim_css: "1:45" }, level: "advanced",     weight_lbs: 165 },
    },
  };
  // Map a workout's `sport` field to the right preset table. Unknown sports
  // fall back to the multi-sport triathlete set so zone substitution still
  // finds the threshold it needs.
  function _previewTableForSport(sport) {
    const s = String(sport || "").toLowerCase();
    if (s === "run"  || s === "running")   return PREVIEW_PRESET_TABLES.running;
    if (s === "bike" || s === "cycling")   return PREVIEW_PRESET_TABLES.cycling;
    if (s === "swim" || s === "swimming")  return PREVIEW_PRESET_TABLES.swimming;
    return PREVIEW_PRESET_TABLES.triathlon;
  }
  let _currentPreviewId = null;
  let _currentPreviewPreset = "advanced";

  // Render the preview as a centered modal with a dimmed backdrop so the
  // admin doesn't have to scroll to the bottom of a long workout list to
  // see it. Backdrop click, ESC, or the Close button all dismiss it.
  function adminShowPreview(id) {
    const w = _workouts.find(x => x.id === id);
    if (!w) return;
    _currentPreviewId = id;
    const host = document.getElementById("admin-workout-preview-panel");
    if (!host) return;
    host.style.cssText = [
      "display:flex",
      "position:fixed",
      "inset:0",
      "background:rgba(15,23,42,0.55)",
      "z-index:9000",
      "align-items:flex-start",
      "justify-content:center",
      "padding:32px 16px",
      "overflow-y:auto",
    ].join(";");
    host.setAttribute("role", "dialog");
    host.setAttribute("aria-modal", "true");
    host.innerHTML =
      '<div class="admin-preview-modal" style="width:min(900px,100%);max-width:900px;background:transparent">' +
        _renderPreviewPanel(w, _currentPreviewPreset) +
      '</div>';
    host.onclick = (e) => { if (e.target === host) adminHidePreview(); };
    if (!host._escBound) {
      host._escHandler = (e) => { if (e.key === "Escape" && host.style.display !== "none") adminHidePreview(); };
      document.addEventListener("keydown", host._escHandler);
      host._escBound = true;
    }
  }

  function adminHidePreview() {
    _currentPreviewId = null;
    const host = document.getElementById("admin-workout-preview-panel");
    if (host) {
      host.style.display = "none";
      host.innerHTML = "";
      host.onclick = null;
      if (host._escBound && host._escHandler) {
        document.removeEventListener("keydown", host._escHandler);
        host._escBound = false;
        host._escHandler = null;
      }
    }
  }

  function adminSwitchPreviewPreset(key) {
    // Validate against whatever preset table the current workout uses —
    // keys are the same (beginner/intermediate/advanced) across sports,
    // but a stale value from another sport should still resolve.
    if (!["beginner", "intermediate", "advanced"].includes(key)) return;
    _currentPreviewPreset = key;
    if (_currentPreviewId) adminShowPreview(_currentPreviewId);
  }

  // ── Timeline bar ──────────────────────────────────────────────────────────
  // Horizontal stacked bar: warmup + main-set pieces + cooldown, each
  // segment's width proportional to its minutes, colored by zone. Uses the
  // same RGB palette as .zone-1 .. .zone-5 in style.css so admin preview
  // matches the athlete-facing calendar.
  const TIMELINE_ZONE_FILL = {
    0: "rgba(124, 58, 237, 0.85)",   // strength — violet
    1: "rgba(100, 116, 139, 0.85)",  // Z1 slate
    2: "rgba(52, 211, 153, 0.85)",   // Z2 green
    3: "rgba(245, 158, 11, 0.85)",   // Z3 amber
    4: "rgba(248, 113, 113, 0.85)",  // Z4 red
    5: "rgba(168, 85, 247, 0.85)",   // Z5 violet
  };
  // Parse duration strings like "8 min", "30 sec", "1.5 hr" into minutes.
  function _parseDurMin(s) {
    if (typeof s === "number") return s;
    const str = String(s || "").trim();
    const m = str.match(/(\d+(?:\.\d+)?)\s*(hr|h|min|m|sec|s)\b/i);
    if (!m) return 0;
    const v = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    if (unit.startsWith("h")) return v * 60;
    if (unit.startsWith("s")) return v / 60;
    return v;
  }
  // Midpoint of [lo, hi] or pass-through a scalar.
  function _rangeMid(x) {
    if (Array.isArray(x) && x.length === 2) return (Number(x[0]) + Number(x[1])) / 2;
    return Number(x) || 0;
  }
  function _zoneNumPreview(zoneStr) {
    const m = String(zoneStr || "").toUpperCase().match(/Z([1-5])/);
    return m ? parseInt(m[1], 10) : 1; // unknown → Z1 (easiest safe default)
  }
  // Expand the workout into an ordered list of {label, zone, minutes} segments.
  function _buildTimelineSegments(w) {
    const segs = [];
    if (w.warmup) {
      const dur = _parseDurMin(w.warmup.duration_min) || 5;
      segs.push({ label: "Warmup", zone: 1, minutes: dur });
    }
    const m = w.main_set || {};
    if (m.type === "intervals" && m.intervals) {
      const iv = m.intervals;
      const reps = Math.round(_rangeMid(iv.reps)) || 1;
      const work = _parseDurMin(iv.duration);
      const rest = _parseDurMin(iv.rest);
      const workZone = _zoneNumPreview(iv.zone);
      for (let i = 0; i < reps; i++) {
        if (work > 0) segs.push({ label: `Rep ${i + 1} — ${iv.zone || "work"}`, zone: workZone, minutes: work });
        if (i < reps - 1 && rest > 0) segs.push({ label: "Rest jog", zone: 1, minutes: rest });
      }
    } else if (m.type === "continuous" && m.effort) {
      const dur = _rangeMid(m.effort.duration_min);
      const zone = _zoneNumPreview(m.effort.zone);
      if (dur > 0) segs.push({ label: `Continuous ${m.effort.zone || ""}`.trim(), zone, minutes: dur });
    } else if (m.type === "ladder" && Array.isArray(m.steps)) {
      m.steps.forEach((s, i) => {
        const dur = _parseDurMin(s.duration);
        if (dur > 0) segs.push({ label: `Step ${i + 1} — ${s.zone || ""}`, zone: _zoneNumPreview(s.zone), minutes: dur });
      });
    } else if (m.type === "mixed" && Array.isArray(m.blocks)) {
      m.blocks.forEach(b => {
        const reps = Math.round(_rangeMid(b.reps)) || 1;
        const work = _parseDurMin(b.duration_min) || _parseDurMin(b.duration);
        const rest = _parseDurMin(b.rest);
        const zone = _zoneNumPreview(b.zone);
        for (let i = 0; i < reps; i++) {
          if (work > 0) segs.push({ label: `${b.zone || "Block"}`, zone, minutes: work });
          if (i < reps - 1 && rest > 0) segs.push({ label: "Rest", zone: 1, minutes: rest });
        }
      });
    } else if (m.type === "strength" && Array.isArray(m.exercises)) {
      // Strength circuits don't have zones; estimate 4 min/exercise (3 sets
      // × ~40s work + rest) and render as one strength-colored block.
      const est = (m.exercises.length || 1) * 4;
      segs.push({ label: `Strength — ${m.exercises.length} exercises`, zone: 0, minutes: est });
    }
    if (w.cooldown) {
      const dur = _parseDurMin(w.cooldown.duration_min) || 5;
      segs.push({ label: "Cooldown", zone: 1, minutes: dur });
    }
    return segs;
  }
  function _buildTimelineBar(w) {
    const segs = _buildTimelineSegments(w);
    const total = segs.reduce((s, x) => s + x.minutes, 0);
    if (!total) return "";

    // Legend — only show zones actually present in this workout.
    const zonesPresent = Array.from(new Set(segs.map(s => s.zone))).sort((a, b) => a - b);
    const zoneLabel = { 0: "Strength", 1: "Z1", 2: "Z2", 3: "Z3", 4: "Z4", 5: "Z5" };
    const legend = zonesPresent.map(z => `
      <span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:0.78em;color:#475569">
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${TIMELINE_ZONE_FILL[z] || TIMELINE_ZONE_FILL[1]}"></span>
        ${zoneLabel[z] || ("Z" + z)}
      </span>
    `).join("");

    const bars = segs.map(s => {
      const pct = (s.minutes / total) * 100;
      const fill = TIMELINE_ZONE_FILL[s.zone] || TIMELINE_ZONE_FILL[1];
      const mins = Math.round(s.minutes * 10) / 10;
      return `<div title="${_escape(s.label)} — ${mins} min" style="width:${pct}%;background:${fill};min-width:2px"></div>`;
    }).join("");

    return `
      <div class="workout-timeline" style="margin:12px 0">
        <div class="hint" style="font-size:0.78em;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center">
          <span>Timeline (${Math.round(total)} min)</span>
          <span>${legend}</span>
        </div>
        <div class="workout-timeline-bar" style="display:flex;height:22px;border-radius:6px;overflow:hidden;background:rgba(148,163,184,0.15)">
          ${bars}
        </div>
      </div>
    `;
  }

  function _renderPreviewPanel(w, presetKey) {
    const table = _previewTableForSport(w.sport);
    const preset = table[presetKey] || table.advanced;
    const zones = (global.TrainingZones && global.TrainingZones.computeAllZones(preset.thresholds)) || {};

    // Sport badge color — re-use existing discipline tint via inline style.
    const sportBadge = `<span class="badge badge-sport" style="background:rgba(100,116,139,0.15);color:#475569;padding:2px 8px;border-radius:8px;font-size:0.85em;font-weight:600">${_escape(w.sport)}</span>`;
    const typeBadge  = `<span class="badge badge-type" style="background:rgba(37,99,235,0.12);color:#1d4ed8;padding:2px 8px;border-radius:8px;font-size:0.85em;font-weight:600">${_escape(w.session_type)}</span>`;
    const energyBadge = `<span class="badge badge-energy" style="background:rgba(124,58,237,0.12);color:#6d28d9;padding:2px 8px;border-radius:8px;font-size:0.85em">${_escape(w.energy_system)}</span>`;

    const phasePills = (w.phases || []).map(p => `<span class="tag-pill" style="background:rgba(16,185,129,0.12);color:#047857;padding:2px 8px;border-radius:8px;font-size:0.8em;margin-right:4px">${_escape(p)}</span>`).join("");
    const levelPills = (w.levels || []).map(l => `<span class="tag-pill" style="background:rgba(234,179,8,0.15);color:#a16207;padding:2px 8px;border-radius:8px;font-size:0.8em;margin-right:4px">${_escape(l)}</span>`).join("");
    const distPills  = (w.race_distances || []).map(d => `<span class="tag-pill" style="background:rgba(244,114,182,0.15);color:#be185d;padding:2px 8px;border-radius:8px;font-size:0.8em;margin-right:4px">${_escape(d)}</span>`).join("");
    const goalPills  = (w.race_goals || []).map(g => `<span class="tag-pill" style="background:rgba(59,130,246,0.12);color:#1e40af;padding:2px 8px;border-radius:8px;font-size:0.8em;margin-right:4px">${_escape(g)}</span>`).join("");

    const warmup   = _renderSection("WARMUP", w.warmup, w.sport, zones);
    const mainSet  = _renderMainSet(w.main_set, w.sport, zones);
    const cooldown = _renderSection("COOLDOWN", w.cooldown, w.sport, zones);

    const totalDur = Array.isArray(w.total_duration_range) && w.total_duration_range.length === 2
      ? `${w.total_duration_range[0]}–${w.total_duration_range[1]} min`
      : "—";
    const created = w.created_at ? new Date(w.created_at).toLocaleDateString() : "—";

    const presetOpts = Object.keys(table).map(k =>
      `<option value="${k}" ${k === presetKey ? "selected" : ""}>${_escape(table[k].label)}</option>`
    ).join("");

    return `
      <div class="card" style="border:2px solid rgba(37,99,235,0.25);background:#fafbff">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
          <div>
            <h3 style="margin:0 0 4px">${_escape(w.name)}</h3>
            <div style="display:flex;gap:6px;flex-wrap:wrap">${sportBadge}${typeBadge}${energyBadge}</div>
          </div>
          <button class="btn-secondary btn-sm" onclick="adminHidePreview()">Close preview</button>
        </div>

        ${w.description ? `<p class="hint" style="margin:12px 0 0">${_escape(w.description)}</p>` : ""}

        <div style="margin:12px 0;display:flex;gap:12px;flex-wrap:wrap">
          ${phasePills ? `<div><div class="hint" style="font-size:0.75em;margin-bottom:3px">Phases</div><div>${phasePills}</div></div>` : ""}
          ${levelPills ? `<div><div class="hint" style="font-size:0.75em;margin-bottom:3px">Levels</div><div>${levelPills}</div></div>` : ""}
          ${distPills  ? `<div><div class="hint" style="font-size:0.75em;margin-bottom:3px">Race distances</div><div>${distPills}</div></div>` : ""}
          ${goalPills  ? `<div><div class="hint" style="font-size:0.75em;margin-bottom:3px">Race goals</div><div>${goalPills}</div></div>` : ""}
        </div>

        <div class="form-row" style="margin:12px 0;padding:8px 10px;background:rgba(37,99,235,0.06);border-radius:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <label style="margin:0;font-weight:600">Preview as athlete:</label>
          <select class="input" style="flex:1;min-width:220px" onchange="adminSwitchPreviewPreset(this.value)">
            ${presetOpts}
          </select>
        </div>

        ${_buildTimelineBar(w)}

        <div class="workout-structure" style="margin-top:8px">
          ${warmup}
          ${mainSet}
          ${cooldown}
        </div>

        <div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(100,116,139,0.2);display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:0.85em;color:#64748b">
          <span><strong>Total:</strong> ${_escape(totalDur)}</span>
          <span><strong>Status:</strong> <span class="status-pill status-${_escape(w.status)}">${_escape(w.status)}</span></span>
          <span><strong>Created:</strong> ${_escape(created)}</span>
        </div>
      </div>
    `;
  }

  // Render warmup or cooldown. Both are `{ description, duration_min }` in
  // the seed but defensive against missing fields.
  function _renderSection(heading, section, sport, zones) {
    if (!section || typeof section !== "object") {
      return `<div class="workout-block"><h4 style="margin:12px 0 4px;color:#475569;letter-spacing:0.05em;font-size:0.85em">${heading}</h4><p class="hint" style="margin:0">—</p></div>`;
    }
    const dur = section.duration_min ? `<span style="font-weight:600">${section.duration_min} min</span>` : "";
    const desc = section.description ? _substituteZones(section.description, sport, zones) : "";
    return `
      <div class="workout-block" style="padding:8px 0">
        <h4 style="margin:0 0 4px;color:#475569;letter-spacing:0.05em;font-size:0.85em">${heading}</h4>
        <p style="margin:0">${dur}${dur && desc ? " — " : ""}${desc}</p>
      </div>
    `;
  }

  // Render main set — the shape depends on type (intervals / continuous /
  // ladder / mixed / strength). Produces a zone-colored block per piece so
  // the admin can visually scan intensity distribution.
  function _renderMainSet(main, sport, zones) {
    if (!main || typeof main !== "object") {
      return `<div class="workout-block"><h4 style="margin:12px 0 4px;color:#475569;letter-spacing:0.05em;font-size:0.85em">MAIN SET</h4><p class="hint" style="margin:0">—</p></div>`;
    }
    const typeLabel = _mainSetTypeLabel(main.type);
    const desc = main.description ? `<p style="margin:4px 0">${_substituteZones(main.description, sport, zones)}</p>` : "";
    let body = "";

    if (main.type === "intervals" && main.intervals) {
      const iv = main.intervals;
      const reps = Array.isArray(iv.reps) ? `${iv.reps[0]}–${iv.reps[1]}` : (iv.reps || "?");
      body = `
        <div class="zone-${_zoneNum(iv.zone)}" style="padding:8px 10px;border-radius:8px;margin-top:6px">
          <strong>${reps} × ${_escape(iv.duration || "")}</strong> at <strong>${_resolveZoneLabel(sport, iv.zone, zones)}</strong>
          ${iv.rest ? `<div class="hint" style="margin-top:2px;font-size:0.85em">Rest: ${_escape(iv.rest)}</div>` : ""}
        </div>
      `;
    } else if (main.type === "continuous" && main.effort) {
      const ef = main.effort;
      const dur = Array.isArray(ef.duration_min) ? `${ef.duration_min[0]}–${ef.duration_min[1]} min` : (ef.duration_min ? `${ef.duration_min} min` : "?");
      body = `
        <div class="zone-${_zoneNum(ef.zone)}" style="padding:8px 10px;border-radius:8px;margin-top:6px">
          <strong>${dur}</strong> continuous at <strong>${_resolveZoneLabel(sport, ef.zone, zones)}</strong>
        </div>
      `;
    } else if (main.type === "ladder" && Array.isArray(main.steps)) {
      body = `
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">
          ${main.steps.map(s => `
            <div class="zone-${_zoneNum(s.zone)}" style="padding:6px 10px;border-radius:8px;font-size:0.85em">
              <strong>${_escape(s.duration || "?")}</strong> @ <strong>${_resolveZoneLabel(sport, s.zone, zones)}</strong>
            </div>
          `).join("")}
        </div>
        ${main.rest_between ? `<div class="hint" style="margin-top:6px;font-size:0.85em">Rest between: ${_escape(main.rest_between)}</div>` : ""}
        ${Array.isArray(main.reps_range) ? `<div class="hint" style="margin-top:2px;font-size:0.85em">Volume range: ${main.reps_range[0]}–${main.reps_range[1]} sets</div>` : ""}
      `;
    } else if (main.type === "mixed" && Array.isArray(main.blocks)) {
      body = main.blocks.map(b => {
        const reps = Array.isArray(b.reps) ? `${b.reps[0]}–${b.reps[1]}` : (b.reps || "?");
        const dur = Array.isArray(b.duration_min) ? `${b.duration_min[0]}–${b.duration_min[1]} min` : (b.duration || b.distance || "");
        return `
          <div class="zone-${_zoneNum(b.zone)}" style="padding:8px 10px;border-radius:8px;margin-top:6px">
            <strong>${reps} × ${_escape(dur)}</strong> at <strong>${_resolveZoneLabel(sport, b.zone, zones)}</strong>
            ${b.rest ? `<div class="hint" style="margin-top:2px;font-size:0.85em">Rest: ${_escape(b.rest)}</div>` : ""}
            ${b.description ? `<div class="hint" style="margin-top:2px;font-size:0.85em">${_escape(b.description)}</div>` : ""}
          </div>
        `;
      }).join("");
    } else if (main.type === "strength" && Array.isArray(main.exercises)) {
      body = `
        <ul style="margin:6px 0;padding-left:20px">
          ${main.exercises.map(ex => `
            <li style="margin:4px 0">
              <strong>${_escape(ex.name || "?")}</strong> —
              ${Array.isArray(ex.sets) ? `${ex.sets[0]}–${ex.sets[1]}` : (ex.sets || "?")} sets
              × ${_escape(ex.reps || "?")}
              ${ex.load ? ` @ ${_escape(ex.load)}` : ""}
            </li>
          `).join("")}
        </ul>
        ${main.rest_between_exercises ? `<div class="hint" style="font-size:0.85em">Rest between exercises: ${_escape(main.rest_between_exercises)}</div>` : ""}
        ${main.rest_between_sets ? `<div class="hint" style="font-size:0.85em">Rest between sets: ${_escape(main.rest_between_sets)}</div>` : ""}
      `;
    } else {
      // Fallback: raw JSON for patterns we don't recognize yet.
      body = `<pre style="background:rgba(100,116,139,0.08);padding:8px;border-radius:6px;font-size:0.8em;margin:6px 0;white-space:pre-wrap">${_escape(JSON.stringify(main, null, 2))}</pre>`;
    }

    // Volume / rest summary at the bottom — user-requested line.
    let volLine = "";
    if (main.intervals && Array.isArray(main.intervals.reps)) {
      volLine = `Volume range: ${main.intervals.reps[0]}–${main.intervals.reps[1]} reps`;
      if (main.intervals.rest) volLine += ` · Rest: ${main.intervals.rest}`;
    } else if (main.effort && Array.isArray(main.effort.duration_min)) {
      volLine = `Volume range: ${main.effort.duration_min[0]}–${main.effort.duration_min[1]} min`;
    }

    return `
      <div class="workout-block" style="padding:8px 0">
        <h4 style="margin:0 0 4px;color:#475569;letter-spacing:0.05em;font-size:0.85em">MAIN SET — ${typeLabel}</h4>
        ${desc}
        ${body}
        ${volLine ? `<div class="hint" style="margin-top:8px;font-size:0.85em">${_escape(volLine)}</div>` : ""}
      </div>
    `;
  }

  function _mainSetTypeLabel(t) {
    switch (t) {
      case "intervals":  return "Intervals";
      case "continuous": return "Continuous";
      case "ladder":     return "Ladder";
      case "mixed":      return "Mixed Set";
      case "strength":   return "Strength Circuit";
      default:           return t ? _escape(t) : "Main Set";
    }
  }

  // Extract the numeric part of a zone string ("Z3" → 3, "Z2–Z3" → 2 for
  // color purposes — pick the lower/easier end so the block doesn't look
  // more intense than it is). Returns empty string when absent so the
  // zone-N class simply isn't applied.
  function _zoneNum(zoneStr) {
    if (!zoneStr) return "";
    const m = String(zoneStr).toUpperCase().match(/Z([1-5])/);
    return m ? m[1] : "";
  }

  // Resolve a zone to a concrete label using TrainingZones.resolveZone if
  // available; otherwise echo the raw zone string.
  function _resolveZoneLabel(sport, zone, zones) {
    if (!zone) return "";
    if (global.TrainingZones && typeof global.TrainingZones.resolveZone === "function") {
      return _escape(global.TrainingZones.resolveZone(zones, sport, zone));
    }
    return _escape(String(zone));
  }

  // Replace inline "Z3" / "Z2–Z3" tokens inside a description string with
  // concrete paces. Keeps the rest of the sentence intact.
  function _substituteZones(text, sport, zones) {
    const s = _escape(String(text || ""));
    return s.replace(/Z[1-5](?:[\u2013\u2014\-]Z[1-5])?/g, (match) => {
      const label = _resolveZoneLabel(sport, match, zones);
      // If the label is the same as the match, no threshold data → keep Z-ref.
      if (label === _escape(match)) return match;
      return `<strong>${label}</strong>`;
    });
  }

  // ── Editor ────────────────────────────────────────────────────────────────

  function adminOpenWorkoutEditor(idOrNull) {
    const editor = document.getElementById("admin-workout-editor");
    const title  = document.getElementById("admin-workout-editor-title");
    if (!editor) return;

    _editing = idOrNull ? _workouts.find(w => w.id === idOrNull) : null;
    title.textContent = _editing ? "Edit Workout" : "Add Workout";

    const w = _editing || {
      name: "", sport: "run", session_type: "", energy_system: "aerobic",
      description: "", phases: [], levels: [], race_distances: null, race_goals: null,
      warmup: {}, main_set: {}, cooldown: {},
      volume_range: {}, total_duration_range: [0, 0], status: "draft",
    };
    _setValue("admin-wo-name", w.name || "");
    _setValue("admin-wo-sport", w.sport || "run");
    _setValue("admin-wo-type", w.session_type || "");
    _setValue("admin-wo-energy", w.energy_system || "aerobic");
    _setValue("admin-wo-description", w.description || "");
    _setValue("admin-wo-phases", (w.phases || []).join(", "));
    _setValue("admin-wo-levels", (w.levels || []).join(", "));
    _setValue("admin-wo-distances", (w.race_distances || []).join(", "));
    _setValue("admin-wo-goals", (w.race_goals || []).join(", "));
    _setValue("admin-wo-warmup", _prettyJson(w.warmup));
    _setValue("admin-wo-main", _prettyJson(w.main_set));
    _setValue("admin-wo-cooldown", _prettyJson(w.cooldown));
    _setValue("admin-wo-volume", _prettyJson(w.volume_range));
    _setValue("admin-wo-duration", Array.isArray(w.total_duration_range) ? w.total_duration_range.join(", ") : "");
    _setValue("admin-wo-status", w.status || "draft");

    // Render as a centered modal with a dimmed backdrop — same pattern as
    // adminShowPreview so admin UX is consistent. Wrap existing children
    // in a scrollable modal panel on first open so we don't touch the
    // form-field IDs that _readEditor / adminSaveWorkout depend on.
    editor.style.cssText = [
      "display:flex",
      "position:fixed",
      "inset:0",
      "background:rgba(15,23,42,0.55)",
      "z-index:9000",
      "align-items:flex-start",
      "justify-content:center",
      "padding:32px 16px",
      "overflow-y:auto",
    ].join(";");
    editor.setAttribute("role", "dialog");
    editor.setAttribute("aria-modal", "true");

    // One-time wrap: move the editor's existing children inside a
    // modal-panel div so they get a card background + max-width.
    if (!editor.querySelector(":scope > .admin-editor-modal")) {
      const panel = document.createElement("div");
      panel.className = "admin-editor-modal";
      panel.style.cssText = [
        "width:min(900px,100%)",
        "max-width:900px",
        "background:var(--color-card,#fff)",
        "border-radius:12px",
        "padding:20px 24px",
        "box-shadow:0 20px 60px rgba(0,0,0,0.25)",
      ].join(";");
      // Clicking inside the panel must NOT close the modal.
      panel.addEventListener("click", e => e.stopPropagation());
      while (editor.firstChild) panel.appendChild(editor.firstChild);
      editor.appendChild(panel);
    }

    // Backdrop click (on the editor element itself, bubbles from anything
    // NOT inside the panel) closes the modal.
    editor.onclick = (e) => { if (e.target === editor) adminCloseWorkoutEditor(); };

    // ESC to close.
    if (!editor._escBound) {
      editor._escHandler = (e) => {
        if (e.key === "Escape" && editor.style.display !== "none") adminCloseWorkoutEditor();
      };
      document.addEventListener("keydown", editor._escHandler);
      editor._escBound = true;
    }

    // Scroll modal body to top for a fresh form.
    const panel = editor.querySelector(":scope > .admin-editor-modal");
    if (panel) panel.scrollTop = 0;
  }

  function adminCloseWorkoutEditor() {
    const editor = document.getElementById("admin-workout-editor");
    if (editor) {
      editor.style.display = "none";
      editor.onclick = null;
      if (editor._escBound && editor._escHandler) {
        document.removeEventListener("keydown", editor._escHandler);
        editor._escBound = false;
        editor._escHandler = null;
      }
    }
    _editing = null;
    const preview = document.getElementById("admin-workout-preview");
    if (preview) preview.innerHTML = "";
  }

  async function adminSaveWorkout() {
    const payload = _readEditor();
    if (!payload) return; // validation failed inline

    const client = global.supabaseClient;
    if (!client) { alert("No Supabase client."); return; }

    try {
      let res;
      if (_editing && _editing.id) {
        res = await client.from("workout_library").update(payload).eq("id", _editing.id).select();
      } else {
        res = await client.from("workout_library").insert(payload).select();
      }
      if (res.error) {
        alert("Save failed: " + res.error.message);
        return;
      }
      adminCloseWorkoutEditor();
      await loadAdminWorkouts();
      // Invalidate the plan generator's library cache so new workouts show
      // up in the next plan generation without a page reload.
      if (global.WorkoutLibrary && global.WorkoutLibrary.refresh) {
        global.WorkoutLibrary.refresh().catch(() => {});
      }
    } catch (e) {
      alert("Save exception: " + (e && e.message));
    }
  }

  function _readEditor() {
    const name = _val("admin-wo-name").trim();
    if (!name) { alert("Name is required."); return null; }
    const sport = _val("admin-wo-sport");
    const sessionType = _val("admin-wo-type").trim();
    if (!sessionType) { alert("Session type is required."); return null; }
    const energy = _val("admin-wo-energy");
    const description = _val("admin-wo-description");
    const phases = _splitCSV(_val("admin-wo-phases"));
    if (phases.length === 0) { alert("Phases must have at least one value."); return null; }
    const levels = _splitCSV(_val("admin-wo-levels"));
    if (levels.length === 0) { alert("Levels must have at least one value."); return null; }
    const distances = _splitCSV(_val("admin-wo-distances"));
    const goals = _splitCSV(_val("admin-wo-goals"));
    let warmup, mainSet, cooldown, volumeRange;
    try { warmup = JSON.parse(_val("admin-wo-warmup") || "{}"); }
    catch (e) { alert("Warmup JSON invalid: " + e.message); return null; }
    try { mainSet = JSON.parse(_val("admin-wo-main") || "{}"); }
    catch (e) { alert("Main set JSON invalid: " + e.message); return null; }
    try { cooldown = JSON.parse(_val("admin-wo-cooldown") || "{}"); }
    catch (e) { alert("Cooldown JSON invalid: " + e.message); return null; }
    try { volumeRange = JSON.parse(_val("admin-wo-volume") || "{}"); }
    catch (e) { alert("Volume range JSON invalid: " + e.message); return null; }

    const durationTokens = _val("admin-wo-duration").split(/[,\s]+/).filter(Boolean).map(Number);
    if (durationTokens.length !== 2 || durationTokens.some(isNaN)) {
      alert("Total duration range must be two numbers (min, max).");
      return null;
    }
    const status = _val("admin-wo-status");

    return {
      name, sport, session_type: sessionType, energy_system: energy, description,
      phases, levels,
      race_distances: distances.length ? distances : null,
      race_goals:     goals.length ? goals : null,
      warmup, main_set: mainSet, cooldown,
      volume_range: volumeRange,
      total_duration_range: durationTokens,
      status,
    };
  }

  async function adminDuplicateWorkout(id) {
    const w = _workouts.find(x => x.id === id);
    if (!w) return;
    _editing = null; // treat as new insert
    adminOpenWorkoutEditor(null);
    // Overwrite fields with the source workout's values, append " (Copy)" to
    // avoid the unique (name, sport) constraint.
    _setValue("admin-wo-name", w.name + " (Copy)");
    _setValue("admin-wo-sport", w.sport);
    _setValue("admin-wo-type", w.session_type);
    _setValue("admin-wo-energy", w.energy_system);
    _setValue("admin-wo-description", w.description || "");
    _setValue("admin-wo-phases", (w.phases || []).join(", "));
    _setValue("admin-wo-levels", (w.levels || []).join(", "));
    _setValue("admin-wo-distances", (w.race_distances || []).join(", "));
    _setValue("admin-wo-goals", (w.race_goals || []).join(", "));
    _setValue("admin-wo-warmup", _prettyJson(w.warmup));
    _setValue("admin-wo-main", _prettyJson(w.main_set));
    _setValue("admin-wo-cooldown", _prettyJson(w.cooldown));
    _setValue("admin-wo-volume", _prettyJson(w.volume_range));
    _setValue("admin-wo-duration", Array.isArray(w.total_duration_range) ? w.total_duration_range.join(", ") : "");
    _setValue("admin-wo-status", "draft"); // duplicates start as draft
  }

  async function adminToggleWorkoutStatus(id) {
    const w = _workouts.find(x => x.id === id);
    if (!w) return;
    const next = w.status === "published" ? "draft" : "published";
    const ok = confirm(`Mark "${w.name}" as ${next}?`);
    if (!ok) return;
    const client = global.supabaseClient;
    const { error } = await client.from("workout_library").update({ status: next }).eq("id", id);
    if (error) { alert("Toggle failed: " + error.message); return; }
    await loadAdminWorkouts();
    if (global.WorkoutLibrary && global.WorkoutLibrary.refresh) {
      global.WorkoutLibrary.refresh().catch(() => {});
    }
  }

  // Preview: show what Chase (advanced runner, 19:40 5K) would see for the
  // current editor contents without persisting. Useful for tweaking
  // parameters and seeing the output immediately.
  function adminPreviewWorkout() {
    const payload = _readEditor();
    if (!payload) return;
    const host = document.getElementById("admin-workout-preview");
    if (!host) return;

    const thresholds = { running_5k: "19:40", cycling_ftp: 250, swim_css: "1:50" };
    const zones = (global.TrainingZones && global.TrainingZones.computeAllZones(thresholds)) || {};
    // Build a pseudo-workout object (what the library row looks like after insert).
    const pseudo = { id: "preview", ...payload };
    const params = (global.WorkoutLibrary && global.WorkoutLibrary.parameterize)
      ? global.WorkoutLibrary.parameterize(pseudo, {
          zones, sport: pseudo.sport, phase: "build",
          weekInPhase: 3, totalWeeksInPhase: 4, isDeload: false, level: "advanced",
        })
      : null;
    if (!params) {
      host.innerHTML = '<p class="hint">Parameterize unavailable — workout library not loaded.</p>';
      return;
    }

    host.innerHTML = `
      <div class="card" style="background:#f5f7fa;padding:12px">
        <h4 style="margin:0 0 8px">Preview: ${_escape(pseudo.name)} — ${_escape(pseudo.sport)} / Build Week 3</h4>
        <p class="hint" style="margin:0 0 6px">Athlete: Chase — VDOT 50.8, FTP 250W, CSS 1:50/100m, Advanced.</p>
        <div style="margin:8px 0"><strong>Warmup</strong><br>${_escape(pseudo.warmup?.description || "")}${pseudo.warmup?.duration_min ? ` (${pseudo.warmup.duration_min} min)` : ""}</div>
        <div style="margin:8px 0"><strong>Main Set (scaled, factor ${params.volume_factor.toFixed(2)})</strong><br><pre style="white-space:pre-wrap;margin:4px 0;font-size:0.85em">${_escape(JSON.stringify(params.main_set, null, 2))}</pre></div>
        <div style="margin:8px 0"><strong>Cooldown</strong><br>${_escape(pseudo.cooldown?.description || "")}${pseudo.cooldown?.duration_min ? ` (${pseudo.cooldown.duration_min} min)` : ""}</div>
        <div style="margin-top:8px" class="hint">Estimated duration: ${params.duration_min || "--"} min</div>
      </div>`;
  }

  // ── Hook into admin sub-tab showing ───────────────────────────────────────

  // The admin panel uses a generic showAdminSubtab; we piggyback on it so
  // the workout table loads lazily when the user first opens the tab.
  if (typeof global.showAdminSubtab === "function") {
    const orig = global.showAdminSubtab;
    global.showAdminSubtab = function (name) {
      orig(name);
      if (name === "admin-workouts" && global._userRole === "admin") {
        loadAdminWorkouts();
      }
    };
  } else {
    // Fall back: expose a hook the admin panel can call after loading.
    global._adminWorkoutsLazyLoad = loadAdminWorkouts;
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  function _escape(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function _val(id) { const el = document.getElementById(id); return el ? el.value : ""; }
  function _setValue(id, v) { const el = document.getElementById(id); if (el) el.value = v; }
  function _setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = String(v); }
  function _splitCSV(s) { return String(s || "").split(",").map(x => x.trim()).filter(Boolean); }
  function _prettyJson(obj) {
    if (obj == null) return "";
    try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
  }

  // Exports
  global.loadAdminWorkouts = loadAdminWorkouts;
  global.renderWorkoutLibraryTable = renderWorkoutLibraryTable;
  global.adminOpenWorkoutEditor = adminOpenWorkoutEditor;
  global.adminCloseWorkoutEditor = adminCloseWorkoutEditor;
  global.adminSaveWorkout = adminSaveWorkout;
  global.adminDuplicateWorkout = adminDuplicateWorkout;
  global.adminToggleWorkoutStatus = adminToggleWorkoutStatus;
  global.adminPreviewWorkout = adminPreviewWorkout;
  global.adminShowPreview = adminShowPreview;
  global.adminHidePreview = adminHidePreview;
  global.adminSwitchPreviewPreset = adminSwitchPreviewPreset;
})(typeof window !== "undefined" ? window : globalThis);
