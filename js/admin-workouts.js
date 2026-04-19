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
      <tr>
        <td style="text-align:left"><strong>${_escape(w.name)}</strong><br><span class="hint" style="font-size:0.85em">${_escape(w.description || "")}</span></td>
        <td>${_escape(w.sport)}</td>
        <td>${_escape(w.session_type)}</td>
        <td>${_escape((w.phases || []).join(", "))}</td>
        <td>${_escape((w.levels || []).join(", "))}</td>
        <td><span class="status-pill status-${_escape(w.status)}">${_escape(w.status)}</span></td>
        <td>
          <button class="btn-link" onclick="adminOpenWorkoutEditor('${_escape(w.id)}')">Edit</button>
          <button class="btn-link" onclick="adminDuplicateWorkout('${_escape(w.id)}')">Duplicate</button>
          <button class="btn-link" onclick="adminToggleWorkoutStatus('${_escape(w.id)}')">${w.status === "published" ? "Unpublish" : "Publish"}</button>
        </td>
      </tr>
    `).join("");
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

    editor.style.display = "";
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function adminCloseWorkoutEditor() {
    const editor = document.getElementById("admin-workout-editor");
    if (editor) editor.style.display = "none";
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
})(typeof window !== "undefined" ? window : globalThis);
