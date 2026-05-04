// coach-library.js — Phase 3C: coach's personal workout library
//
// CRUD on public.coach_workout_library + bulk-assign to one or more
// clients on one or more dates. The bulk-assign loop just inserts N
// rows into coach_assigned_workouts; the Phase 3A.1 trigger mirrors
// each into the corresponding client's workoutSchedule.
//
// Lives as the second tab on the Coach Portal dashboard (Clients |
// Library). Phase 3D adds a third (Programs).
//
// Spec: new features/COACHING_FEATURE_SPEC_2026-04-28.md
// Schema: supabase/migrations/20260428_coaching_schema.sql

(function () {
  "use strict";

  let _coachUid = null;
  let _coachName = "";
  let _items = [];                 // coach_workout_library rows
  let _activeTab = "clients";      // "clients" | "library"
  let _assignSelection = {         // bulk-assign modal scratch state
    workout: null,
    clientIds: new Set(),
    dates: new Set(),
  };

  function _esc(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }

  // ── Tab switching (called from coach-dashboard.js) ────────────────────
  function setCoachDashboardTab(name) {
    _activeTab = name;
    if (typeof window.renderCoachDashboard === "function" && window._coachDashState) {
      window.renderCoachDashboard(window._coachDashState);
    }
    if (name === "library") {
      // Library data is independent of the dashboard fetch — load it
      // lazily on first tab open, refresh on every subsequent open.
      loadCoachLibrary();
    }
    if (name === "programs" && typeof window.loadCoachPrograms === "function") {
      window.loadCoachPrograms();
    }
    if (name === "invite" && typeof window.loadCoachInviteLink === "function") {
      // Refresh the invite link on every tab open so a freshly-rotated
      // code shows up without a full reload.
      const coachUid = window._coachDashState?.coachUid || null;
      window.loadCoachInviteLink(coachUid);
    }
  }

  function getCoachDashboardTab() { return _activeTab; }

  // ── Library load ──────────────────────────────────────────────────────
  async function loadCoachLibrary() {
    const sb = window.supabaseClient;
    if (!sb) return;
    const sess = (await sb.auth.getSession())?.data?.session;
    _coachUid = sess?.user?.id || null;
    if (!_coachUid) return;
    if (window._coachNameCache && window._coachNameCache[_coachUid]) {
      _coachName = window._coachNameCache[_coachUid];
    }

    const { data } = await sb.from("coach_workout_library")
      .select("*")
      .eq("coach_id", _coachUid)
      .order("created_at", { ascending: false });
    _items = data || [];

    _renderLibraryList();
  }

  // Filter / search state — kept module-level so re-renders preserve
  // the coach's filter while they edit / assign / tag rows.
  let _filterSearch = "";
  let _filterType   = "";
  let _filterTag    = ""; // empty = no tag filter; tag chip click sets this

  // ── Render library list (called by coach-dashboard.js when tab=library) ─
  function renderCoachLibraryView(coachState) {
    const types = _availableTypes();
    const tags  = _availableTags();
    return `
      <div class="card coach-section">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div class="coach-section-title">Workout Library</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn-secondary btn-sm" onclick="openImportFromSavedPicker()">+ Import from Saved</button>
            <button class="btn-primary btn-sm" onclick="openCoachLibraryNew()">+ New Workout</button>
          </div>
        </div>
        <div class="coach-library-filters">
          <input type="search" id="coach-library-search" class="input"
                 placeholder="Search by name, type, or tag…"
                 value="${_esc(_filterSearch)}"
                 oninput="setCoachLibrarySearch(this.value)" />
          <select id="coach-library-type-filter" class="input" onchange="setCoachLibraryType(this.value)">
            <option value="">All types</option>
            ${types.map(t => `<option value="${_esc(t)}" ${t === _filterType ? "selected" : ""}>${_esc(_typeLabel(t))}</option>`).join("")}
          </select>
        </div>
        ${tags.length ? `<div class="coach-library-tag-row">
          <span class="coach-library-tag-row-label">Tags</span>
          ${tags.map(t => `<button type="button" class="coach-library-tag-chip ${t === _filterTag ? "is-active" : ""}"
                                 onclick="setCoachLibraryTagFilter('${_esc(t)}')">${_esc(t)}</button>`).join("")}
          ${_filterTag ? `<button type="button" class="coach-library-tag-clear" onclick="setCoachLibraryTagFilter('')">Clear</button>` : ""}
        </div>` : ""}
        <div class="coach-section-summary" id="coach-library-summary">
          ${_summaryText()}
        </div>
        <div id="coach-library-list">${_renderItems()}</div>
      </div>`;
  }

  // Filtered view of _items based on search / type / tag.
  function _filteredItems() {
    const q = _filterSearch.trim().toLowerCase();
    return _items.filter(item => {
      const w = item.workout || {};
      if (_filterType && _parentType(w.type) !== _filterType) return false;
      const tags = Array.isArray(w.tags) ? w.tags : [];
      if (_filterTag && !tags.includes(_filterTag)) return false;
      if (q) {
        const hay = [
          item.name, w.sessionName, _typeLabel(w.type),
          item.notes, ...tags,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }
  function _summaryText() {
    if (!_items.length) return "No saved workouts yet.";
    const filtered = _filteredItems();
    if (filtered.length === _items.length) {
      return `${_items.length} saved workout${_items.length === 1 ? "" : "s"}`;
    }
    return `${filtered.length} of ${_items.length} workouts match`;
  }
  function _availableTypes() {
    const set = new Set();
    for (const it of _items) {
      const parent = _parentType(it && it.workout && it.workout.type);
      if (parent) set.add(parent);
    }
    return Array.from(set).sort();
  }
  function _availableTags() {
    const set = new Set();
    for (const it of _items) {
      const tags = (it && it.workout && Array.isArray(it.workout.tags)) ? it.workout.tags : [];
      for (const t of tags) {
        const norm = String(t || "").trim();
        if (norm) set.add(norm);
      }
    }
    return Array.from(set).sort();
  }
  function setCoachLibrarySearch(v) {
    _filterSearch = String(v || "");
    _renderLibraryList();
  }
  function setCoachLibraryType(v) {
    _filterType = String(v || "");
    _renderLibraryList();
  }
  function setCoachLibraryTagFilter(v) {
    _filterTag = String(v || "");
    _renderLibraryList();
  }

  // ── Import from Saved Workouts ───────────────────────────────────────
  // Lets the coach pull from their personal SavedWorkoutsLibrary into the
  // coach Library. Bridges the two stores: anything saved on a workout
  // card via the overflow "Save to Library" item shows up here, which
  // the coach can then assign to clients.
  async function openImportFromSavedPicker() {
    const Saved = window.SavedWorkoutsLibrary;
    if (!Saved || typeof Saved.listSaved !== "function") {
      alert("Saved workouts library not available.");
      return;
    }
    // Pull EVERY saved workout regardless of source — `custom` covers
    // anything saved from a workout card; `library` covers items the user
    // bookmarked from the built-in variants; `shared` covers inbox
    // accepts. All three are valid imports for a coach building their
    // library.
    let saved = [];
    try { saved = await Saved.listSaved(); } catch (e) { console.warn(e); }
    saved = (saved || []).slice().sort((a, b) => String(b.saved_at || "").localeCompare(String(a.saved_at || "")));

    const id = "coach-import-saved-overlay";
    const old = document.getElementById(id);
    if (old) old.remove();
    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "rating-modal-overlay";
    const close = () => {
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 200);
    };
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    function _rowHtml(s) {
      const p = s.payload || {};
      const exCount = Array.isArray(p.exercises) ? p.exercises.length : 0;
      const segCount = Array.isArray(p.segments) ? p.segments.length : 0;
      const meta = [
        s.workout_kind ? _typeLabel(s.workout_kind) : null,
        p.duration ? `${p.duration} min` : null,
        exCount ? `${exCount} exercise${exCount === 1 ? "" : "s"}` : null,
        segCount ? `${segCount} interval${segCount === 1 ? "" : "s"}` : null,
      ].filter(Boolean).join(" · ");
      const name = s.custom_name || s.variant_id || "Untitled";
      return `<div class="coach-lib-picker-row" data-saved-id="${_esc(s.id)}" tabindex="0"
                   onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click()}">
        <div class="coach-lib-picker-row-name">${_esc(name)}</div>
        <div class="coach-lib-picker-row-meta">${_esc(meta || "—")}</div>
      </div>`;
    }

    const emptyHtml = `<div class="coach-lib-picker-empty">
        You don't have any saved workouts yet. Tap "Save to Library" on any workout card to send it here.
      </div>`;

    // List body sized to ~3 rows so long lists don't blow out the modal —
    // the inner div scrolls. Search box live-filters on each keystroke.
    overlay.innerHTML = `
      <div class="rating-modal coach-import-modal">
        <div class="rating-modal-title">Import from Saved Workouts</div>
        <input type="search" id="coach-import-search" class="input"
          placeholder="Search by name…"
          style="width:100%;margin-bottom:10px;padding:8px 12px;font-size:0.95rem" />
        <div id="coach-import-list" class="coach-import-list">
          ${saved.length ? saved.map(_rowHtml).join("") : emptyHtml}
        </div>
        <div style="display:flex;gap:8px;margin-top:14px">
          <button class="btn-secondary" id="coach-import-cancel" style="flex:1;min-height:38px">Close</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
    overlay.querySelector("#coach-import-cancel").onclick = close;

    function _wireRows() {
      overlay.querySelectorAll(".coach-lib-picker-row[data-saved-id]").forEach(el => {
        el.onclick = async () => {
          const sid = el.getAttribute("data-saved-id");
          const s = saved.find(x => x.id === sid);
          if (!s) return;
          close();
          await _importSavedIntoCoachLibrary(s);
        };
      });
    }
    _wireRows();

    const searchInput = overlay.querySelector("#coach-import-search");
    const listEl = overlay.querySelector("#coach-import-list");
    if (searchInput && listEl) {
      searchInput.oninput = () => {
        const q = String(searchInput.value || "").toLowerCase().trim();
        const filtered = q
          ? saved.filter(s => {
              const name = String(s.custom_name || s.variant_id || "").toLowerCase();
              const kind = String(s.workout_kind || "").toLowerCase();
              return name.includes(q) || kind.includes(q);
            })
          : saved;
        listEl.innerHTML = filtered.length ? filtered.map(_rowHtml).join("") : `<div class="coach-lib-picker-empty">No matches.</div>`;
        _wireRows();
      };
      // Autofocus the search input on desktop only — autofocus on mobile
      // pops the keyboard immediately, which feels intrusive.
      try {
        if (window.matchMedia && !window.matchMedia("(pointer: coarse)").matches) {
          setTimeout(() => searchInput.focus(), 50);
        }
      } catch {}
    }
  }

  // Map a SavedWorkoutsLibrary row into a coach_workout_library row and
  // insert it. The coach library schema mirrors what the assignment form
  // emits (sessionName + type + exercises | aiSession.intervals + duration),
  // so we shape the payload to match.
  async function _importSavedIntoCoachLibrary(saved) {
    const sb = window.supabaseClient;
    if (!sb || !_coachUid) {
      alert("Not signed in.");
      return;
    }
    const p = saved.payload || {};
    const type = saved.workout_kind || saved.sport_id || "weightlifting";
    const intervals = Array.isArray(p.segments) && p.segments.length
      ? p.segments.map(seg => ({
          name: seg.name || "Interval",
          duration: seg.duration || "",
          effort: seg.effort || "Z2",
          details: seg.details || "",
        }))
      : null;
    const sessionName = saved.custom_name || "Imported workout";
    const workoutJson = {
      sessionName,
      type,
      ...(intervals && intervals.length ? { aiSession: { title: sessionName, intervals } } : {}),
      ...(Array.isArray(p.exercises) && p.exercises.length ? { exercises: p.exercises } : {}),
      ...(p.hiitMeta ? { hiitMeta: p.hiitMeta } : {}),
      ...(type === "hyrox" ? { isHyrox: true } : {}),
      ...(p.duration ? { duration: p.duration } : {}),
      level: "intermediate",
    };
    const { error } = await sb.from("coach_workout_library").insert({
      coach_id: _coachUid,
      name:     sessionName,
      workout:  workoutJson,
      notes:    p.notes || null,
    });
    if (error) {
      alert("Couldn't import: " + error.message);
      return;
    }
    if (typeof window._showShareToast === "function") {
      window._showShareToast(`Imported "${sessionName}" into your Library.`);
    }
    await loadCoachLibrary();
  }

  function _renderLibraryList() {
    // Re-render the entire library card so the type-filter dropdown's
    // option list reflects newly-edited tags / types and the tag chip
    // row stays accurate after a tag was added or removed. Falls back
    // to a list-only refresh if the card host isn't on screen yet.
    const card = document.querySelector(".coach-section");
    const cardHost = document.querySelector(".coach-tab-content") ||
                     document.getElementById("coach-portal-content");
    // Cheaper path — just refresh the inner list and summary. Full
    // re-render of filters is reserved for tag/type edits via
    // refreshFiltersAndList() below.
    const list = document.getElementById("coach-library-list");
    if (list) list.innerHTML = _renderItems();
    const sum = document.getElementById("coach-library-summary");
    if (sum) sum.textContent = _summaryText();
  }
  // Full re-render including filter dropdown + tag chips. Used after
  // tag edits so the chip row picks up new/removed tags and the type
  // dropdown picks up newly-saved types.
  function _refreshFiltersAndList() {
    const host = document.getElementById("coach-library-list")?.closest(".coach-section");
    if (host && host.parentElement) {
      host.outerHTML = renderCoachLibraryView();
    } else {
      _renderLibraryList();
    }
  }

  // Pull every per-interval / per-exercise text snippet out of a saved
  // workout. Returns an array of strings — used for the library row's
  // "Embedded notes" preview and the Clear-notes bulk strip below.
  // Per-interval `details` carry generator-emitted text like "55 min @
  // conversational, by feel. Conversational. Skip if you don't feel
  // recovered." and per-exercise `notes` carry coach-typed instructions;
  // both render on the client's workout card and were the source of the
  // "I have to delete this comment on every assignment" pain point
  // (user feedback 2026-04-29).
  function _extractBodyNotesText(workout) {
    const notes = [];
    const ivs = (workout?.aiSession?.intervals) || workout?.intervals || [];
    for (const iv of ivs) {
      const t = String(iv?.details || "").trim();
      if (t) notes.push(t);
    }
    for (const ex of (workout?.exercises || [])) {
      const t = String(ex?.notes || "").trim();
      if (t) notes.push(ex.name ? `${ex.name}: ${t}` : t);
    }
    return notes;
  }

  function _renderItems() {
    if (!_items.length) {
      return `<div style="color:var(--color-text-muted);padding:16px;text-align:center;font-size:0.9rem">
        Save a workout from the Assign flow → it'll show up here for quick reuse.
      </div>`;
    }
    const filtered = _filteredItems();
    if (!filtered.length) {
      return `<div style="color:var(--color-text-muted);padding:16px;text-align:center;font-size:0.9rem">
        No workouts match. <button type="button" class="btn-link" onclick="clearCoachLibraryFilters()">Clear filters</button>
      </div>`;
    }
    return filtered.map(item => {
      const w = item.workout || {};
      const exCount = Array.isArray(w.exercises) ? w.exercises.length : 0;
      const meta = [
        w.type ? _typeLabel(w.type) : null,
        w.duration ? `${w.duration} min` : null,
        exCount ? `${exCount} exercise${exCount === 1 ? "" : "s"}` : null,
      ].filter(Boolean).join(" · ");
      const bodyNotes = _extractBodyNotesText(w);
      const _bodyPreview = bodyNotes.length
        ? (bodyNotes[0].length > 90 ? bodyNotes[0].slice(0, 90) + "…" : bodyNotes[0])
        : "";
      const _bodyMore = bodyNotes.length > 1 ? ` (+${bodyNotes.length - 1} more)` : "";
      const tags = Array.isArray(w.tags) ? w.tags : [];
      // Tag chips on the row are clickable filter shortcuts; the +Tag
      // button opens an inline editor for adding new ones. Tag delete
      // (×) is part of the chip itself.
      const tagChips = tags.map(t => `<span class="coach-library-tag-chip-row">
          <span class="coach-library-tag-chip-text" onclick="setCoachLibraryTagFilter('${_esc(t)}')">${_esc(t)}</span>
          <button type="button" class="coach-library-tag-chip-x" aria-label="Remove tag"
                  onclick="event.stopPropagation();removeCoachLibraryTag('${item.id}','${_esc(t)}')">×</button>
        </span>`).join("");
      return `<div class="coach-library-row">
        <div class="coach-library-row-main">
          <div class="coach-library-row-name">${_esc(item.name || w.sessionName || "Untitled")}</div>
          <div class="coach-library-row-meta">${_esc(meta || "—")}</div>
          ${item.notes ? `<div class="coach-library-row-notes">${_esc(item.notes)}</div>` : ""}
          ${bodyNotes.length ? `<div class="coach-library-row-body-notes">
            <span class="coach-library-row-body-notes-label">Embedded:</span>
            <span class="coach-library-row-body-notes-text">${_esc(_bodyPreview)}${_bodyMore}</span>
            <button class="coach-library-row-body-notes-clear" onclick="event.stopPropagation();clearCoachLibraryBodyNotes('${item.id}')" title="Clear all embedded interval/exercise notes from this workout">Clear</button>
          </div>` : ""}
          <div class="coach-library-row-tags">
            ${tagChips}
            <button type="button" class="coach-library-tag-add" onclick="addCoachLibraryTag('${item.id}')" title="Add tag">+ Tag</button>
          </div>
        </div>
        <div class="coach-library-row-actions">
          <button class="btn-secondary btn-sm" onclick="openCoachLibraryAssign('${item.id}')">Assign</button>
          <button class="admin-action-btn" aria-label="Edit" title="Edit"
            onclick="openCoachLibraryEdit('${item.id}')">✎</button>
          <button class="admin-action-btn" aria-label="Duplicate" title="Duplicate"
            onclick="duplicateCoachLibraryItem('${item.id}')">⎘</button>
          <button class="admin-action-btn" aria-label="Delete" title="Delete"
            onclick="deleteCoachLibraryItem('${item.id}')"
            style="color:var(--color-danger,#b91c1c)">×</button>
        </div>
      </div>`;
    }).join("");
  }
  function clearCoachLibraryFilters() {
    _filterSearch = "";
    _filterType   = "";
    _filterTag    = "";
    _refreshFiltersAndList();
  }
  // Tag CRUD — both writes update the row's workout JSONB in
  // coach_workout_library and patch _items locally so the re-render
  // shows the new state without an extra round-trip.
  async function addCoachLibraryTag(id) {
    const item = _items.find(x => x.id === id);
    if (!item) return;
    const raw = window.prompt("Tag (comma-separate to add multiple):");
    if (!raw) return;
    const incoming = raw.split(",").map(s => s.trim()).filter(Boolean);
    if (!incoming.length) return;
    const w = { ...(item.workout || {}) };
    const existing = Array.isArray(w.tags) ? w.tags.slice() : [];
    for (const t of incoming) if (!existing.includes(t)) existing.push(t);
    w.tags = existing;
    const sb = window.supabaseClient;
    if (!sb) return;
    const { error } = await sb.from("coach_workout_library").update({ workout: w }).eq("id", id);
    if (error) { alert("Couldn't save tag: " + error.message); return; }
    item.workout = w;
    _refreshFiltersAndList();
  }
  async function removeCoachLibraryTag(id, tag) {
    const item = _items.find(x => x.id === id);
    if (!item) return;
    const w = { ...(item.workout || {}) };
    w.tags = (Array.isArray(w.tags) ? w.tags : []).filter(t => t !== tag);
    const sb = window.supabaseClient;
    if (!sb) return;
    const { error } = await sb.from("coach_workout_library").update({ workout: w }).eq("id", id);
    if (error) { alert("Couldn't remove tag: " + error.message); return; }
    item.workout = w;
    // If the active tag-filter is the one we just stripped from this
    // item, clear it so the row doesn't fall out of view immediately.
    if (_filterTag === tag && !_availableTags().includes(tag)) _filterTag = "";
    _refreshFiltersAndList();
  }

  // One-click strip of every per-interval / per-exercise note from a
  // library item. The structural data (zones, durations, reps, rest)
  // stays — the workout still runs the same on the client; only the
  // free-text guidance is removed. Coach can re-add a single coach
  // note at assign time. (Counterpart to the "Embedded notes" preview
  // above — the user wanted to be able to delete this stuff once at
  // the source instead of per-assignment.)
  async function clearCoachLibraryBodyNotes(id) {
    const item = _items.find(x => x.id === id);
    if (!item) return;
    const bodyCount = _extractBodyNotesText(item.workout || {}).length;
    if (!bodyCount) return;
    const ok = window.confirm(
      `Clear ${bodyCount} embedded note${bodyCount === 1 ? "" : "s"} from "${item.name}"?\n\n` +
      `Workout structure (zones, durations, reps, rest) stays intact — only the free-text descriptions are removed.`
    );
    if (!ok) return;
    const w = JSON.parse(JSON.stringify(item.workout || {}));
    const stripIv = (iv) => Object.assign({}, iv, { details: "" });
    if (Array.isArray(w.aiSession?.intervals)) {
      w.aiSession = Object.assign({}, w.aiSession, { intervals: w.aiSession.intervals.map(stripIv) });
    }
    if (Array.isArray(w.intervals)) {
      w.intervals = w.intervals.map(stripIv);
    }
    if (Array.isArray(w.exercises)) {
      w.exercises = w.exercises.map(ex => Object.assign({}, ex, { notes: "" }));
    }
    const sb = window.supabaseClient;
    if (!sb) { alert("Auth client not available."); return; }
    const { error } = await sb.from("coach_workout_library").update({ workout: w }).eq("id", id);
    if (error) { alert("Couldn't clear notes: " + error.message); return; }
    await loadCoachLibrary();
  }

  // Mirrors strava-integration.js / stats.js: subtype keys emitted by the
  // running/cycling/swimming generators (e.g. "easy_recovery",
  // "bike_tempo", "swim_css_intervals") roll up to a single parent
  // discipline so the filter shows "Run / Ride / Swim" instead of every
  // template id leaking into the dropdown.
  const _RUN_SUBTYPES = new Set([
    "easy_recovery", "endurance", "long_run", "tempo_threshold",
    "track_workout", "speed_work", "hills", "fun_social",
    "recovery_run", "base_run", "progression_run",
  ]);
  const _BIKE_SUBTYPES = new Set([
    "bike_endurance", "bike_tempo", "bike_threshold", "bike_intervals",
    "bike_vo2", "bike_recovery", "bike_long", "bike_sweetspot",
  ]);
  const _SWIM_SUBTYPES = new Set([
    "swim_endurance", "swim_technique", "swim_css_intervals", "swim_speed",
    "swim_threshold", "swim_recovery", "swim_long",
  ]);
  function _parentType(t) {
    const x = String(t || "").toLowerCase();
    if (!x) return "";
    if (_RUN_SUBTYPES.has(x))  return "running";
    if (_BIKE_SUBTYPES.has(x)) return "cycling";
    if (_SWIM_SUBTYPES.has(x)) return "swimming";
    return x;
  }
  function _typeLabel(t) {
    const map = { running: "Run", cycling: "Ride", swimming: "Swim",
      weightlifting: "Strength", strength: "Strength", hiit: "HIIT",
      hyrox: "Hyrox", brick: "Brick", general: "Workout", yoga: "Yoga",
      bodyweight: "Bodyweight" };
    const parent = _parentType(t);
    return map[parent] || parent || t;
  }

  // ── New / edit / duplicate / delete ──────────────────────────────────
  // Reuses the existing Assign Workout modal in "save to library" mode.
  // The submit path checks _libraryMode and writes to
  // coach_workout_library instead of coach_assigned_workouts.
  function openCoachLibraryNew() {
    if (typeof window.openAssignWorkoutModalForLibrary === "function") {
      window.openAssignWorkoutModalForLibrary(null);
    }
  }

  function openCoachLibraryEdit(id) {
    const item = _items.find(x => x.id === id);
    if (!item) return;
    const w = item.workout || {};
    // Cardio intervals live in w.aiSession.intervals (current shape), not in
    // w.intervals at the top level. Reading the wrong key meant editing a
    // saved running/cycling/swim workout opened with no rows — re-saving
    // then wiped the intervals from the library row, blanking out every
    // future assignment.
    const _intervals =
      Array.isArray(w.aiSession?.intervals) ? w.aiSession.intervals
      : Array.isArray(w.intervals)          ? w.intervals
      : [];
    const prefill = {
      libraryId: id,
      libraryName: item.name,
      libraryNotes: item.notes,
      sessionName: w.sessionName || item.name || "",
      type:        w.type || "weightlifting",
      duration:    w.duration || "",
      exercises:   Array.isArray(w.exercises) ? w.exercises : [],
      intervals:   _intervals,
      hiitMeta:    w.hiitMeta || null,
      details:     w.details || "",
      whyText:     w.whyText || w.why_text || "",
    };
    if (typeof window.openAssignWorkoutModalForLibrary === "function") {
      window.openAssignWorkoutModalForLibrary(prefill);
    }
  }

  async function duplicateCoachLibraryItem(id) {
    const item = _items.find(x => x.id === id);
    if (!item) return;
    const sb = window.supabaseClient;
    const { error } = await sb.from("coach_workout_library").insert({
      coach_id: _coachUid,
      name:     `${item.name} (copy)`,
      workout:  item.workout,
      notes:    item.notes,
    });
    if (error) { alert("Couldn't duplicate: " + error.message); return; }
    await loadCoachLibrary();
  }

  async function deleteCoachLibraryItem(id) {
    const item = _items.find(x => x.id === id);
    if (!item) return;
    if (!confirm(`Delete "${item.name}" from your library? Already-assigned workouts on client calendars are unaffected.`)) return;
    const sb = window.supabaseClient;
    const { error } = await sb.from("coach_workout_library").delete().eq("id", id);
    if (error) { alert("Couldn't delete: " + error.message); return; }
    await loadCoachLibrary();
  }

  // ── Bulk assign ──────────────────────────────────────────────────────
  function openCoachLibraryAssign(id) {
    const item = _items.find(x => x.id === id);
    if (!item) return;
    _assignSelection = {
      workout: item,
      clientIds: new Set(),
      dates: new Set([_isoToday()]),
    };
    _renderBulkAssignModal();
    const overlay = document.getElementById("coach-bulk-assign-overlay");
    if (overlay) overlay.classList.add("is-open");
  }

  function closeCoachLibraryAssign() {
    const overlay = document.getElementById("coach-bulk-assign-overlay");
    if (overlay) overlay.classList.remove("is-open");
    _assignSelection = { workout: null, clientIds: new Set(), dates: new Set() };
  }

  function _isoToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function _renderBulkAssignModal() {
    const root = document.getElementById("coach-bulk-assign-body");
    if (!root) return;
    const item = _assignSelection.workout;
    if (!item) { root.innerHTML = ""; return; }

    // Pull the active client list cached on the dashboard so we don't
    // re-fetch. coach-portal.js exposes this on _coachDashState.
    const clients = (window._coachDashState && window._coachDashState.clients) || [];
    const profilesById = (window._coachDashState && window._coachDashState.profilesById) || {};

    if (!clients.length) {
      root.innerHTML = `<div style="padding:14px;color:var(--color-text-muted)">
        You don't have any active clients. Add one via Admin Portal → Coaches.
      </div>`;
      return;
    }

    const clientRows = clients.map(c => {
      const checked = _assignSelection.clientIds.has(c.id);
      const label = _esc(c.full_name || c.email || c.id.slice(0, 8));
      return `<label class="coach-bulk-client">
        <input type="checkbox" ${checked ? "checked" : ""}
          onchange="toggleCoachBulkClient('${c.id}', this.checked)" />
        <span>${label}</span>
        <span class="coach-bulk-client-email">${_esc(c.email || "")}</span>
      </label>`;
    }).join("");

    const dateRows = Array.from(_assignSelection.dates).sort().map(d => `
      <span class="coach-bulk-date-pill">
        ${_esc(d)}
        <button onclick="removeCoachBulkDate('${d}')" aria-label="Remove ${_esc(d)}">×</button>
      </span>`).join("");

    const w = item.workout || {};
    const exCount = Array.isArray(w.exercises) ? w.exercises.length : 0;

    root.innerHTML = `
      <div class="coach-bulk-summary">
        <strong>${_esc(item.name || w.sessionName || "Untitled")}</strong>
        <div style="font-size:0.82rem;color:var(--color-text-muted);margin-top:2px">
          ${_esc(_typeLabel(w.type) || "—")} · ${exCount} exercise${exCount === 1 ? "" : "s"}${w.duration ? " · " + w.duration + " min" : ""}
        </div>
      </div>

      <div class="form-row">
        <label>Clients <span class="optional-tag">${_assignSelection.clientIds.size} selected</span></label>
        <div class="coach-bulk-client-list">${clientRows}</div>
      </div>

      <div class="form-row">
        <label>Dates <span class="optional-tag">${_assignSelection.dates.size} selected</span></label>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          ${dateRows}
          <input type="date" id="coach-bulk-date-input" class="input"
                 value="${_esc(_isoToday())}" style="width:160px" />
          <button class="btn-secondary btn-sm" onclick="addCoachBulkDate()">+ Add date</button>
        </div>
      </div>

      <div class="form-row">
        <label for="coach-bulk-note">Coach note <span class="optional-tag">applies to every assignment</span></label>
        <textarea id="coach-bulk-note" rows="2" class="input"
          placeholder="e.g. Focus on the second half — negative split."
          style="font-family:inherit"></textarea>
      </div>

      <p id="coach-bulk-error" class="hint" style="color:var(--color-danger);min-height:1em"></p>
    `;
  }

  function toggleCoachBulkClient(id, checked) {
    if (checked) _assignSelection.clientIds.add(id);
    else         _assignSelection.clientIds.delete(id);
    _renderBulkAssignModal();
  }

  function addCoachBulkDate() {
    const inp = document.getElementById("coach-bulk-date-input");
    const v = inp?.value;
    if (!v) return;
    _assignSelection.dates.add(v);
    _renderBulkAssignModal();
  }

  function removeCoachBulkDate(d) {
    _assignSelection.dates.delete(d);
    _renderBulkAssignModal();
  }

  // In-app 3-button confirm. Themed like the rest of IronZ (reuses the
  // .rating-modal-overlay shell). Buttons = Remove / Add / Cancel:
  //   • Remove — replace any existing workouts on those dates
  //   • Add    — assign on top of whatever is already there
  //   • Cancel — close, no-op
  // Returns "replace" | "stack" | null via the callback.
  function _openConflictModeModal({ title, body, onChoose }) {
    const id = "coach-conflict-mode-overlay";
    const old = document.getElementById(id);
    if (old) old.remove();
    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "rating-modal-overlay";
    const close = () => {
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 200);
    };
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    overlay.innerHTML = `
      <div class="rating-modal" style="max-width:400px">
        <div class="rating-modal-title">${_esc(title || "Existing workouts on those dates")}</div>
        ${body ? `<div style="text-align:center;color:var(--color-text-muted);font-size:0.9rem;margin-bottom:14px;line-height:1.45">${body}</div>` : ""}
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn-danger"    id="ccm-remove" style="min-height:42px">Remove existing &amp; replace</button>
          <button class="btn-primary"   id="ccm-add"    style="min-height:42px">Add alongside existing</button>
          <button class="btn-secondary" id="ccm-cancel" style="min-height:38px">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
    overlay.querySelector("#ccm-remove").onclick = (e) => { e.stopPropagation(); close(); onChoose && onChoose("replace"); };
    overlay.querySelector("#ccm-add").onclick    = (e) => { e.stopPropagation(); close(); onChoose && onChoose("stack"); };
    overlay.querySelector("#ccm-cancel").onclick = (e) => { e.stopPropagation(); close(); onChoose && onChoose(null); };
  }

  async function confirmCoachBulkAssign() {
    const errEl = document.getElementById("coach-bulk-error");
    const setErr = (m) => { if (errEl) errEl.textContent = m || ""; };
    setErr("");
    const item = _assignSelection.workout;
    if (!item) return;
    if (_assignSelection.clientIds.size === 0) return setErr("Pick at least one client.");
    if (_assignSelection.dates.size === 0)     return setErr("Pick at least one date.");

    const note = document.getElementById("coach-bulk-note")?.value?.trim() || null;
    const sb = window.supabaseClient;
    if (!sb) return;
    const sess = (await sb.auth.getSession())?.data?.session;
    const coachId = sess?.user?.id;
    if (!coachId) return setErr("Not signed in.");

    // Stamp coachName onto the workout JSONB so the FROM-coach badge
    // renders synchronously on the client side without a separate
    // profile fetch (matches 3A.2's pattern).
    const coachName = (window._coachNameCache && window._coachNameCache[coachId]) || _coachName || "Your coach";
    const workoutJson = { ...(item.workout || {}), coachName };

    // Build N rows: one per (client, date) pair. Conflict mode is
    // chosen by the coach below — used to silently default to replace
    // and overwrote unsynced client workouts (user feedback 2026-04-29:
    // "an assigned workout shouldn't delete any of the existing
    // workouts. The coach should have to do that.").
    const rows = [];
    for (const cid of _assignSelection.clientIds) {
      for (const d of _assignSelection.dates) {
        rows.push({
          client_id: cid,
          coach_id:  coachId,
          date:      d,
          // conflict_mode set after the loop, once the coach confirms.
          coach_note: note,
          workout:   workoutJson,
        });
      }
    }

    const summary = `Assigning ${rows.length} workout${rows.length === 1 ? "" : "s"} `
      + `(${_assignSelection.clientIds.size} client${_assignSelection.clientIds.size === 1 ? "" : "s"} × `
      + `${_assignSelection.dates.size} date${_assignSelection.dates.size === 1 ? "" : "s"}).`;

    _openConflictModeModal({
      title: "Existing workouts on those dates?",
      body: `${_esc(summary)}<br><br><strong>Remove</strong> deletes any current workouts on those dates and replaces them.<br><strong>Add</strong> keeps the current plan and adds yours alongside.`,
      onChoose: async (mode) => {
        if (!mode) return;             // user cancelled
        for (const r of rows) r.conflict_mode = mode;

        const { error } = await sb.from("coach_assigned_workouts").insert(rows);
        if (error) { setErr("Couldn't assign: " + error.message); return; }

        closeCoachLibraryAssign();
        if (typeof window.showCoachToast === "function") {
          window.showCoachToast(`Assigned ${rows.length} workout${rows.length === 1 ? "" : "s"}`);
        } else {
          const el = document.createElement("div");
          el.className = "coach-toast is-visible";
          el.textContent = `Assigned ${rows.length} workout${rows.length === 1 ? "" : "s"}`;
          document.body.appendChild(el);
          setTimeout(() => el.remove(), 1800);
        }

        if (typeof trackEvent === "function") {
          try {
            trackEvent("coach_bulk_assigned", {
              clients: _assignSelection.clientIds.size,
              dates: _assignSelection.dates.size,
              rows: rows.length,
              mode,
            });
          } catch {}
        }
      },
    });
  }

  // ── Public surface ─────────────────────────────────────────────────────
  window.setCoachDashboardTab     = setCoachDashboardTab;
  window.getCoachDashboardTab     = getCoachDashboardTab;
  window.loadCoachLibrary         = loadCoachLibrary;
  window.renderCoachLibraryView   = renderCoachLibraryView;
  window.openCoachLibraryNew      = openCoachLibraryNew;
  window.openCoachLibraryEdit     = openCoachLibraryEdit;
  window.openImportFromSavedPicker = openImportFromSavedPicker;
  window.duplicateCoachLibraryItem= duplicateCoachLibraryItem;
  window.deleteCoachLibraryItem   = deleteCoachLibraryItem;
  window.clearCoachLibraryBodyNotes = clearCoachLibraryBodyNotes;
  window.openCoachLibraryAssign   = openCoachLibraryAssign;
  window.closeCoachLibraryAssign  = closeCoachLibraryAssign;
  window.toggleCoachBulkClient    = toggleCoachBulkClient;
  window.addCoachBulkDate         = addCoachBulkDate;
  window.removeCoachBulkDate      = removeCoachBulkDate;
  window.confirmCoachBulkAssign   = confirmCoachBulkAssign;
  // Search / filter / tag UX.
  window.setCoachLibrarySearch    = setCoachLibrarySearch;
  window.setCoachLibraryType      = setCoachLibraryType;
  window.setCoachLibraryTagFilter = setCoachLibraryTagFilter;
  window.clearCoachLibraryFilters = clearCoachLibraryFilters;
  window.addCoachLibraryTag       = addCoachLibraryTag;
  window.removeCoachLibraryTag    = removeCoachLibraryTag;
})();
