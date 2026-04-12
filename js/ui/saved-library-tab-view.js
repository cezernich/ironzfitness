// js/ui/saved-library-tab-view.js
//
// Saved Library tab content. Shows the user's personal saved workouts
// (library bookmarks, shared imports, AND custom user-created workouts)
// plus a browsable library of canonical variants.

(function () {
  "use strict";

  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  let _state = { filterSport: null, sharedOnly: false, showBrowse: true };

  async function renderSavedLibraryTab(containerId) {
    const target = document.getElementById(containerId || "tab-saved-library-content");
    if (!target) return;
    const Saved = window.SavedWorkoutsLibrary;
    if (!Saved) {
      target.innerHTML = `<p class="hint">Saved library not loaded.</p>`;
      return;
    }
    const filter = {};
    if (_state.filterSport) filter.sport = _state.filterSport;
    if (_state.sharedOnly)  filter.source = "shared";
    const list = await Saved.listSaved(filter);
    const savedKeys = new Set(list.map(s => s.variant_id ? `${s.sport_id}::${s.session_type_id}::${s.variant_id}` : null).filter(Boolean));

    const browseHtml = _renderBrowseSection(savedKeys);

    if (list.length === 0) {
      target.innerHTML = `
        <h2 class="tab-h2">Saved</h2>
        ${_renderFilterRow()}
        <div class="saved-empty">
          <p>Save workouts from the library, from friends' shares, or create your own.</p>
        </div>
        <div class="saved-new-btn-wrap">
          <button class="btn-primary" id="sl-new-custom-btn">+ New Workout</button>
        </div>
        ${browseHtml}
      `;
      _wireFilters(target, containerId);
      _wireBrowseButtons(target, containerId);
      _wireNewCustomBtn(target, containerId);
      return;
    }

    target.innerHTML = `
      <h2 class="tab-h2">Saved</h2>
      ${_renderFilterRow()}
      <div class="saved-new-btn-wrap">
        <button class="btn-primary" id="sl-new-custom-btn">+ New Workout</button>
      </div>
      <div class="saved-list">
        ${list.map(s => s.source === "custom" ? _renderCustomCard(s) : _renderCard(s)).join("")}
      </div>
      ${browseHtml}
    `;
    _wireFilters(target, containerId);
    _wireBrowseButtons(target, containerId);
    _wireNewCustomBtn(target, containerId);
    _wireSavedActions(target, containerId);
  }

  // ─── New Custom Workout button ──────────────────────────────────────────────

  function _wireNewCustomBtn(target, containerId) {
    const btn = target.querySelector("#sl-new-custom-btn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (typeof openSaveWorkoutModal === "function") {
        // Re-use the existing modal from workouts.js but override save to go
        // through SavedWorkoutsLibrary instead of legacy localStorage.
        _openCustomWorkoutModal(null, containerId);
      }
    });
  }

  // ─── Saved item action wiring ───────────────────────────────────────────────

  function _wireSavedActions(target, containerId) {
    target.querySelectorAll("[data-saved-action]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const action = btn.dataset.savedAction;
        const id = btn.dataset.id;
        const Saved = window.SavedWorkoutsLibrary;
        if (!Saved) return;
        if (action === "remove") {
          if (confirm("Remove from saved library?")) {
            await Saved.removeSaved(id);
            renderSavedLibraryTab(containerId);
          }
        } else if (action === "schedule") {
          _scheduleSaved(id);
        } else if (action === "edit-custom") {
          _openCustomWorkoutModal(id, containerId);
        }
      });
    });
  }

  // ─── Custom workout cards ───────────────────────────────────────────────────

  function _renderCustomCard(s) {
    const p = s.payload || {};
    const name = s.custom_name || "Untitled";
    const kind = s.workout_kind || "general";
    const sportLabel = s.sport_id ? _esc(s.sport_id) : "";

    let detailHtml = "";
    if (p.segments && p.segments.length) {
      detailHtml = typeof buildSegmentTableHTML === "function"
        ? buildSegmentTableHTML(p.segments)
        : `<p class="hint">${p.segments.length} segment(s)</p>`;
    } else if (p.exercises && p.exercises.length) {
      detailHtml = typeof buildExerciseTableHTML === "function"
        ? buildExerciseTableHTML(p.exercises, { hiit: kind === "hiit" || !!p.hiitMeta })
        : `<p class="hint">${p.exercises.length} exercise(s)</p>`;
    }
    const notesHtml = p.notes ? `<p class="saved-card-notes">${_esc(p.notes)}</p>` : "";

    const cardId = "sl-custom-" + _esc(s.id);
    return `
      <div class="saved-card saved-card--custom collapsible is-collapsed" id="${cardId}" data-id="${_esc(s.id)}">
        <div class="saved-card-header card-toggle" onclick="toggleSection('${cardId}')">
          <div class="saved-card-header-left">
            <span class="saved-source-tag saved-source-custom">Custom</span>
            ${sportLabel ? `<span class="saved-sport-tag">${sportLabel}</span>` : ""}
            <span class="workout-tag tag-${_esc(kind)}" style="margin-left:4px">${_esc(kind)}</span>
          </div>
          <span class="card-chevron">▾</span>
        </div>
        <div class="saved-card-title">${_esc(name)}</div>
        <div class="card-body" style="display:none;padding:4px 0 0">
          ${notesHtml}
          ${detailHtml}
        </div>
        <div class="saved-card-actions">
          <button class="btn-primary"  data-saved-action="schedule"    data-id="${_esc(s.id)}">Schedule</button>
          ${typeof window.buildShareIconButton === "function" ? window.buildShareIconButton(s, "saved") : ""}
          <button class="btn-ghost"    data-saved-action="edit-custom" data-id="${_esc(s.id)}">Edit</button>
          <button class="btn-ghost"    data-saved-action="remove"      data-id="${_esc(s.id)}">${typeof ICONS !== "undefined" && ICONS.trash ? ICONS.trash : "Delete"}</button>
        </div>
      </div>
    `;
  }

  // ─── Library / shared cards (unchanged) ─────────────────────────────────────

  function _renderCard(s) {
    const sourceLabel = s.source === "shared" ? "Shared" : "Library";
    const sourceClass = s.source === "shared" ? "saved-source-shared" : "saved-source-library";
    const name = s.custom_name || s.variant_id;
    const cardId = "sl-card-" + _esc(s.id);
    const typeLabel = (s.session_type_id || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const shareBtn = typeof window.buildShareIconButton === "function"
      ? window.buildShareIconButton(s, "saved")
      : "";
    return `
      <div class="saved-card collapsible is-collapsed" id="${cardId}" data-id="${_esc(s.id)}" data-variant="${_esc(s.variant_id || "")}">
        <div class="saved-card-header card-toggle" onclick="toggleSection('${cardId}'); _slLoadDetail('${cardId}','${_esc(s.variant_id || "")}')">
          <div class="saved-card-header-left">
            <span class="saved-source-tag ${sourceClass}">${sourceLabel}</span>
            <span class="saved-sport-tag">${_esc(s.sport_id || "")}</span>
          </div>
          <span class="card-chevron">\u25be</span>
        </div>
        <div class="saved-card-title">${_esc(name)}</div>
        <div class="saved-card-meta">${_esc(typeLabel)}</div>
        <div class="card-body" id="${cardId}-detail">
          <p class="hint">Tap to see workout details</p>
        </div>
        <div class="saved-card-actions">
          <button class="btn-primary"   data-saved-action="schedule" data-id="${_esc(s.id)}">Schedule</button>
          ${shareBtn}
          <button class="btn-ghost"     data-saved-action="remove"   data-id="${_esc(s.id)}">Remove</button>
        </div>
      </div>
    `;
  }

  // Lazy-load workout details from training_sessions when a card is expanded
  const _detailLoaded = new Set();
  window._slLoadDetail = async function (cardId, variantId) {
    if (_detailLoaded.has(cardId)) return;
    _detailLoaded.add(cardId);
    const detailEl = document.getElementById(cardId + "-detail");
    if (!detailEl) return;

    // Try multiple sources for exercise data:
    // 1. training_sessions (Supabase) by variant_id
    // 2. The saved entry's local payload data (custom workouts)
    // 3. The saved entry's local exercises field
    let exercises = [];
    let description = "";

    // Source 1: Supabase training_sessions — only for shared-workout cards,
    // whose variant_id is a real row UUID. Library variants use local IDs
    // like "track_yasso_800s" and will never resolve in training_sessions.
    // Detect the saved source before trying the network round-trip.
    let savedSource = null;
    try {
      const Saved = window.SavedWorkoutsLibrary;
      if (Saved) {
        const savedId = cardId.replace("sl-card-", "").replace("sl-custom-", "");
        const _list = await Saved.listSaved();
        const _entry = _list.find(s => s.id === savedId);
        if (_entry) savedSource = _entry.source;
      }
    } catch {}

    if (variantId && savedSource === "shared") {
      const sb = window.supabaseClient;
      if (sb) {
        try {
          const { data } = await sb
            .from("training_sessions")
            .select("session_name, description, exercises, data")
            .eq("id", variantId)
            .maybeSingle();
          if (data) {
            let ex = data.exercises || [];
            if (typeof ex === "string") { try { ex = JSON.parse(ex); } catch { ex = []; } }
            if (ex.length) exercises = ex;
            if (data.description) description = data.description;
          }
        } catch {}
      }
    }

    // Source 2: local saved entry payload (custom workouts store data locally)
    if (!exercises.length) {
      const Saved = window.SavedWorkoutsLibrary;
      if (Saved) {
        try {
          const list = await Saved.listSaved();
          // Match by cardId which contains the saved entry id
          const savedId = cardId.replace("sl-card-", "").replace("sl-custom-", "");
          const entry = list.find(s => s.id === savedId);
          if (entry) {
            const p = entry.payload || {};
            if (p.exercises && p.exercises.length) exercises = p.exercises;
            else if (p.segments && p.segments.length) {
              exercises = p.segments.map(s => ({
                name: s.name || s.type || "Segment",
                duration: s.duration || "",
                intensity: s.effort || s.intensity || "",
                details: s.details || "",
                repeatGroup: s.repeatGroup || null,
                groupSets: s.groupSets || null,
              }));
            }
            if (p.notes && !description) description = p.notes;
            // Also check entry-level exercises
            if (!exercises.length && entry.exercises) {
              let ex = entry.exercises;
              if (typeof ex === "string") { try { ex = JSON.parse(ex); } catch { ex = []; } }
              if (ex.length) exercises = ex;
            }
          }
        } catch {}
      }
    }

    function _renderDetailRow(ex) {
      const name = ex.name || "Exercise";
      const parts = [];
      if (ex.sets && ex.reps) parts.push(`${ex.sets} \u00d7 ${ex.reps}`);
      else if (ex.reps) parts.push(`${ex.reps} reps`);
      if (ex.duration) parts.push(ex.duration);
      if (ex.weight) parts.push(`@ ${ex.weight}`);
      if (ex.intensity) parts.push(ex.intensity);
      if (ex.details) parts.push(ex.details);
      return `<div class="saved-detail-row">
        <span class="saved-detail-name">${_esc(name)}</span>
        <span class="saved-detail-info">${_esc(parts.join(" \u00b7 "))}</span>
      </div>`;
    }

    let html = "";
    if (description) {
      html += `<p class="saved-detail-desc">${_esc(description)}</p>`;
    }
    if (exercises.length > 0) {
      html += '<div class="saved-detail-exercises">';
      let i = 0;
      while (i < exercises.length) {
        const ex = exercises[i];
        const gid = ex.repeatGroup || ex.supersetGroup || ex.superset_group || ex.superset_id;
        if (gid) {
          const group = [];
          while (i < exercises.length) {
            const g = exercises[i];
            if ((g.repeatGroup || g.supersetGroup || g.superset_group || g.superset_id) === gid) {
              group.push(g); i++;
            } else break;
          }
          const sets = group[0].groupSets || "";
          html += `<div class="saved-detail-group">`;
          html += `<div class="saved-detail-group-label">${sets ? sets + "\u00d7 " : ""}Superset ${_esc(gid)}</div>`;
          group.forEach(g => { html += _renderDetailRow(g); });
          html += `</div>`;
        } else {
          html += _renderDetailRow(ex);
          i++;
        }
      }
      html += '</div>';
    } else {
      html += "<p class='hint'>No exercise details stored.</p>";
    }
    detailEl.innerHTML = html;
  };

  // ─── Custom workout modal (re-uses the existing saved-workout-modal) ────────

  function _openCustomWorkoutModal(editId, containerId) {
    const Saved = window.SavedWorkoutsLibrary;
    if (!Saved) return;

    // If we're editing, load the existing data into the modal
    if (editId) {
      Saved.listSaved().then(list => {
        const item = list.find(s => s.id === editId);
        if (!item || item.source !== "custom") return;
        _populateModal(item, containerId);
      });
    } else {
      _populateModal(null, containerId);
    }
  }

  function _populateModal(item, containerId) {
    const modal = document.getElementById("saved-workout-modal");
    if (!modal) return;
    const title = document.getElementById("sw-modal-title");
    const nameEl = document.getElementById("sw-name");
    const typeEl = document.getElementById("sw-type");
    const notesEl = document.getElementById("sw-notes");
    const msgEl = document.getElementById("sw-save-msg");
    const exEntries = document.getElementById("sw-exercise-entries");
    const segEntries = document.getElementById("sw-segment-entries");

    nameEl.value = "";
    typeEl.value = "weightlifting";
    notesEl.value = "";
    if (exEntries) exEntries.innerHTML = "";
    if (segEntries) segEntries.innerHTML = "";
    if (msgEl) msgEl.textContent = "";

    if (item) {
      const p = item.payload || {};
      nameEl.value = item.custom_name || "";
      typeEl.value = item.workout_kind || "weightlifting";
      notesEl.value = p.notes || "";
      if (typeof swTypeChanged === "function") swTypeChanged();
      const SW_ENDURANCE_TYPES = ["running", "cycling", "swimming", "triathlon", "stairstepper"];
      if (SW_ENDURANCE_TYPES.includes(item.workout_kind)) {
        (p.segments || []).forEach(s => { if (typeof addSwSegmentRow === "function") addSwSegmentRow(s); });
        if (!(p.segments && p.segments.length) && typeof addSwSegmentRow === "function") addSwSegmentRow();
      } else {
        (p.exercises || []).forEach(() => { if (typeof addSwExerciseRow === "function") addSwExerciseRow(); });
        document.querySelectorAll("#sw-exercise-entries .exercise-row").forEach((row, i) => {
          const e = (p.exercises || [])[i];
          if (!e) return;
          row.querySelector(".ex-name").value = e.name || "";
          const setsInput = row.querySelector(".ex-sets");
          if (setsInput) setsInput.value = e.sets || "";
          row.querySelector(".ex-reps").value = e.reps || "";
          row.querySelector(".ex-weight").value = e.weight || "";
        });
        if (!p.exercises || !p.exercises.length) {
          if (typeof addSwExerciseRow === "function") addSwExerciseRow();
        }
        if (item.workout_kind === "hiit" && p.hiitMeta) {
          const m = p.hiitMeta;
          if (document.getElementById("sw-hiit-format")) document.getElementById("sw-hiit-format").value = m.format || "circuit";
          if (document.getElementById("sw-hiit-rounds")) document.getElementById("sw-hiit-rounds").value = m.rounds || 3;
          if (document.getElementById("sw-hiit-rest-ex")) document.getElementById("sw-hiit-rest-ex").value = m.restBetweenExercises || "";
          if (document.getElementById("sw-hiit-rest-rnd")) document.getElementById("sw-hiit-rest-rnd").value = m.restBetweenRounds || "";
        }
      }
      title.textContent = "Edit Custom Workout";
    } else {
      title.textContent = "New Saved Workout";
      if (typeof swTypeChanged === "function") swTypeChanged();
      if (typeof addSwExerciseRow === "function") addSwExerciseRow();
    }

    // Override the save button to route through SavedWorkoutsLibrary
    const saveBtn = modal.querySelector("#sw-save-btn");
    if (saveBtn) {
      const clone = saveBtn.cloneNode(true);
      saveBtn.parentNode.replaceChild(clone, saveBtn);
      clone.addEventListener("click", () => _handleCustomSave(item ? item.id : null, containerId));
    }

    modal.style.display = "flex";
  }

  function _handleCustomSave(editId, containerId) {
    const nameVal = document.getElementById("sw-name").value.trim();
    const typeVal = document.getElementById("sw-type").value;
    const notesVal = document.getElementById("sw-notes").value.trim();
    const msgEl = document.getElementById("sw-save-msg");

    if (!nameVal) {
      if (msgEl) { msgEl.style.color = "#ef4444"; msgEl.textContent = "Please enter a workout name."; }
      return;
    }

    const SW_ENDURANCE_TYPES = ["running", "cycling", "swimming", "triathlon", "stairstepper"];
    let exercises = null, segments = null, hiitMeta = null;

    if (SW_ENDURANCE_TYPES.includes(typeVal)) {
      segments = [];
      const isBrick = typeVal === "triathlon";
      document.querySelectorAll("#sw-segment-entries .sw-segment-row").forEach(row => {
        const n = row.querySelector(".seg-name")?.value.trim();
        const seg = {
          name: n || "",
          duration: row.querySelector(".seg-duration")?.value.trim() || "",
          effort: row.querySelector(".seg-effort")?.value || "Easy",
        };
        if (isBrick) seg.discipline = row.querySelector(".seg-discipline")?.value || "bike";
        if (n || seg.duration || isBrick) segments.push(seg);
      });
    } else {
      const isHiit = typeVal === "hiit";
      exercises = [];
      document.querySelectorAll("#sw-exercise-entries .exercise-row").forEach(row => {
        const n = row.querySelector(".ex-name")?.value.trim();
        if (!n) return;
        const ex = { name: n, reps: row.querySelector(".ex-reps")?.value, weight: row.querySelector(".ex-weight")?.value.trim() };
        const setsInput = row.querySelector(".ex-sets");
        if (setsInput) ex.sets = setsInput.value;
        exercises.push(ex);
      });
      if (isHiit) {
        hiitMeta = {
          format: document.getElementById("sw-hiit-format")?.value || "circuit",
          rounds: parseInt(document.getElementById("sw-hiit-rounds")?.value) || 1,
          restBetweenExercises: (document.getElementById("sw-hiit-rest-ex")?.value || "").trim() || undefined,
          restBetweenRounds: (document.getElementById("sw-hiit-rest-rnd")?.value || "").trim() || undefined,
        };
      }
    }

    const sportMap = {
      running: "run", cycling: "bike", swimming: "swim",
      triathlon: "hybrid", stairstepper: "run",
      weightlifting: "strength", bodyweight: "strength",
      hiit: "strength", general: null, other: null,
    };

    const Saved = window.SavedWorkoutsLibrary;
    if (!Saved) return;

    const doSave = editId
      ? Saved.editCustom(editId, { name: nameVal, workout_kind: typeVal, sport_id: sportMap[typeVal] || null, exercises, segments, hiitMeta, notes: notesVal })
      : Saved.saveCustom({ name: nameVal, workout_kind: typeVal, sport_id: sportMap[typeVal] || null, exercises, segments, hiitMeta, notes: notesVal });

    Promise.resolve(doSave).then(result => {
      if (result && result.error === "LIMIT_REACHED") {
        if (msgEl) { msgEl.style.color = "#ef4444"; msgEl.textContent = "Saved workout limit reached. Remove one first."; }
        return;
      }
      if (typeof closeSaveWorkoutModal === "function") closeSaveWorkoutModal();
      renderSavedLibraryTab(containerId);
    });
  }

  // ─── Browse the canonical variant library ─────────────────────────────────

  function _renderBrowseSection(savedKeys) {
    const VL = window.VariantLibraries;
    if (!VL) return "";
    const sections = [];
    const sportFilter = _state.filterSport;
    const sports = sportFilter ? [sportFilter] : ["run", "bike", "swim", "strength", "hybrid"];
    for (const sport of sports) {
      const lib = VL.getLibrary(sport);
      if (!lib || !lib.variants) continue;
      const groups = [];
      for (const [sessionTypeId, variants] of Object.entries(lib.variants)) {
        if (!Array.isArray(variants) || variants.length === 0) continue;
        const cards = variants.map(v => _renderBrowseCard(sport, sessionTypeId, v, savedKeys)).join("");
        groups.push(`
          <div class="browse-group">
            <h4 class="browse-group-title">${_esc(sessionTypeId.replace(/_/g, " "))}</h4>
            <div class="browse-grid">${cards}</div>
          </div>
        `);
      }
      if (groups.length === 0) continue;
      sections.push(`
        <details class="browse-sport"${sportFilter ? " open" : ""}>
          <summary class="browse-sport-summary">${_esc(sport.toUpperCase())}</summary>
          ${groups.join("")}
        </details>
      `);
    }
    if (sections.length === 0) return "";
    return `
      <div class="browse-library-section">
        <h3 class="browse-library-title">Browse the library</h3>
        <p class="browse-library-hint">Tap the bookmark to save a workout to your personal library.</p>
        ${sections.join("")}
      </div>
    `;
  }

  function _renderBrowseCard(sport, sessionTypeId, variant, savedKeys) {
    const key = `${sport}::${sessionTypeId}::${variant.id}`;
    const isSaved = savedKeys.has(key);
    const desc = variant.description ? `<div class="browse-card-desc">${_esc(variant.description)}</div>` : "";
    return `
      <div class="browse-card${isSaved ? " is-saved" : ""}" data-key="${_esc(key)}">
        <div class="browse-card-header">
          <div class="browse-card-name">${_esc(variant.name || variant.id)}</div>
          <button class="browse-bookmark-btn${isSaved ? " is-saved" : ""}"
                  title="${isSaved ? "Remove from library" : "Save to library"}"
                  data-browse-action="bookmark"
                  data-sport="${_esc(sport)}"
                  data-session-type="${_esc(sessionTypeId)}"
                  data-variant="${_esc(variant.id)}"
                  aria-pressed="${isSaved ? "true" : "false"}">
            ${_bookmarkSvg(isSaved)}
          </button>
        </div>
        ${desc}
      </div>
    `;
  }

  function _bookmarkSvg(filled) {
    if (filled) {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
    }
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  }

  function _wireBrowseButtons(target, containerId) {
    target.querySelectorAll('[data-browse-action="bookmark"]').forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        e.preventDefault();
        const sport = btn.dataset.sport;
        const sessionType = btn.dataset.sessionType;
        const variant = btn.dataset.variant;
        const Saved = window.SavedWorkoutsLibrary;
        if (!Saved) return;
        const isSaved = btn.classList.contains("is-saved");
        if (isSaved) {
          const list = await Saved.listSaved();
          const existing = list.find(s =>
            s.variant_id === variant && s.sport_id === sport && s.source === "library"
          );
          if (existing) await Saved.removeSaved(existing.id);
          _showToast("Removed from library");
        } else {
          const result = await Saved.saveFromLibrary({
            variantId: variant,
            sportId: sport,
            sessionTypeId: sessionType,
          });
          if (result && result.error === "LIMIT_REACHED") {
            _showToast("Saved workout limit reached");
            return;
          }
          _showToast("Saved to library");
        }
        renderSavedLibraryTab(containerId);
      });
    });
  }

  function _showToast(msg) {
    if (typeof document === "undefined") return;
    const existing = document.getElementById("ironz-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.id = "ironz-toast";
    toast.className = "ironz-toast";
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("visible"));
    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 220);
    }, 1800);
  }

  function _renderFilterRow() {
    const sports = ["all", "run", "bike", "swim", "strength", "hybrid"];
    const labels = { all: "All", run: "Run", bike: "Bike", swim: "Swim", strength: "Strength", hybrid: "Hybrid" };
    return `
      <div class="saved-filter-row">
        ${sports.map(s => `
          <button class="saved-filter-chip${(_state.filterSport === s || (s === "all" && !_state.filterSport)) ? " is-active" : ""}"
                  data-filter-sport="${s === "all" ? "" : s}">${labels[s]}</button>
        `).join("")}
        <label class="saved-filter-toggle">
          <input type="checkbox" id="saved-filter-shared-only" ${_state.sharedOnly ? "checked" : ""} />
          Shared with me
        </label>
      </div>
    `;
  }

  function _wireFilters(target, containerId) {
    target.querySelectorAll("[data-filter-sport]").forEach(btn => {
      btn.addEventListener("click", () => {
        _state.filterSport = btn.dataset.filterSport || null;
        renderSavedLibraryTab(containerId);
      });
    });
    const sharedToggle = target.querySelector("#saved-filter-shared-only");
    if (sharedToggle) {
      sharedToggle.addEventListener("change", () => {
        _state.sharedOnly = !!sharedToggle.checked;
        renderSavedLibraryTab(containerId);
      });
    }
  }

  function _scheduleSaved(savedId) {
    const ScheduleCalendar = window.ScheduleCalendarModal;
    const Saved = window.SavedWorkoutsLibrary;
    const Validator = window.WorkoutImportValidator;
    if (!ScheduleCalendar || !Saved || !Validator) return;
    Saved.listSaved().then(list => {
      const e = list.find(x => x.id === savedId);
      if (!e) return;
      const pseudoSharedWorkout = {
        variantId: e.variant_id || e.id,
        sportId: e.sport_id,
        sessionTypeId: e.session_type_id || e.workout_kind,
        source: e.source || "shared",
        sessionName: e.custom_name,
        senderDisplayName: "Saved Library",
        createdAt: e.saved_at,
      };
      ScheduleCalendar.open({
        sharedWorkout: pseudoSharedWorkout,
        scaledWorkout: { sport_id: e.sport_id, session_type_id: e.session_type_id || e.workout_kind, variant_id: e.variant_id || e.id },
        onPick: ({ date, info }) => {
          if (info && info.isConflict && window.ConflictResolutionModal) {
            const hasHardBlock = info.hardBlocks && info.hardBlocks.length > 0;
            window.ConflictResolutionModal.open({
              attemptedDate: date,
              conflicts: [...(info.hardBlocks || []), ...(info.warnings || [])],
              suggestedDate: info.result && info.result.suggestedDate,
              hasHardBlock,
              onMove: (newDate) => Saved.scheduleFromSaved(savedId, newDate).then(_afterSchedule),
              onOverride: () => !hasHardBlock && Saved.scheduleFromSaved(savedId, date).then(_afterSchedule),
            });
          } else {
            Saved.scheduleFromSaved(savedId, date).then(_afterSchedule);
          }
        },
      });
    });
  }

  function _afterSchedule() {
    if (typeof renderCalendar === "function") renderCalendar();
    renderSavedLibraryTab();
  }

  const api = { renderSavedLibraryTab };
  if (typeof window !== "undefined") window.SavedLibraryTabView = api;
})();
