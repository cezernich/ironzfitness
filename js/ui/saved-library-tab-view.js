// js/ui/saved-library-tab-view.js
//
// Saved Library tab content. Filter chips at top + card grid below.

(function () {
  "use strict";

  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  let _state = { filterSport: null, sharedOnly: false, showBrowse: true };

  async function renderSavedLibraryTab(containerId) {
    const target = document.getElementById(containerId || "tab-saved-content");
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
    const savedKeys = new Set(list.map(s => `${s.sport_id}::${s.session_type_id}::${s.variant_id}`));

    const browseHtml = _renderBrowseSection(savedKeys);

    if (list.length === 0) {
      target.innerHTML = `
        <h2 class="tab-h2">Saved</h2>
        ${_renderFilterRow()}
        <div class="saved-empty">
          <p>Save workouts from the library or from friends' shares to build your own collection.</p>
        </div>
        ${browseHtml}
      `;
      _wireFilters(target, containerId);
      _wireBrowseButtons(target, containerId);
      return;
    }

    target.innerHTML = `
      <h2 class="tab-h2">Saved</h2>
      ${_renderFilterRow()}
      <div class="saved-list">
        ${list.map(_renderCard).join("")}
      </div>
      ${browseHtml}
    `;
    _wireFilters(target, containerId);
    _wireBrowseButtons(target, containerId);

    target.querySelectorAll("[data-saved-action]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const action = btn.dataset.savedAction;
        const id = btn.dataset.id;
        if (action === "remove") {
          if (confirm("Remove from saved library?")) {
            await Saved.removeSaved(id);
            renderSavedLibraryTab(containerId);
          }
        } else if (action === "schedule") {
          _scheduleSaved(id);
        }
      });
    });
  }

  // ─── Browse the canonical variant library ─────────────────────────────────
  //
  // Renders every variant from the 5 libraries (run / bike / swim / strength /
  // hybrid) as a bookmark-able card. Tap the bookmark icon to save the variant
  // to the user's personal library; tap again to remove. Shows a brief toast.

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
          // Remove existing
          const list = await Saved.listSaved();
          const existing = list.find(s =>
            s.variant_id === variant && s.sport_id === sport && s.source === "library"
          );
          if (existing) await Saved.removeSaved(existing.id);
          _showToast("Removed from library");
        } else {
          await Saved.saveFromLibrary({
            variantId: variant,
            sportId: sport,
            sessionTypeId: sessionType,
          });
          _showToast("Saved to library");
        }
        renderSavedLibraryTab(containerId);
      });
    });
  }

  // Brief toast notification.
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

  function _renderCard(s) {
    const sourceLabel = s.source === "shared" ? "Shared" : "Library";
    const sourceIcon = s.source === "shared" ? "⇪" : "📚";
    const name = s.custom_name || s.variant_id;
    return `
      <div class="saved-card" data-id="${_esc(s.id)}">
        <div class="saved-card-header">
          <span class="saved-source-tag">${sourceIcon} ${sourceLabel}</span>
          <span class="saved-sport-tag">${_esc(s.sport_id || "")}</span>
        </div>
        <div class="saved-card-title">${_esc(name)}</div>
        <div class="saved-card-meta">${_esc(s.session_type_id || "")}</div>
        <div class="saved-card-actions">
          <button class="btn-primary"   data-saved-action="schedule" data-id="${_esc(s.id)}">Schedule</button>
          <button class="btn-ghost"     data-saved-action="remove"   data-id="${_esc(s.id)}">Remove</button>
        </div>
      </div>
    `;
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
        variantId: e.variant_id,
        sportId: e.sport_id,
        sessionTypeId: e.session_type_id,
        senderDisplayName: "Saved Library",
        createdAt: e.saved_at,
      };
      ScheduleCalendar.open({
        sharedWorkout: pseudoSharedWorkout,
        scaledWorkout: { sport_id: e.sport_id, session_type_id: e.session_type_id, variant_id: e.variant_id },
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
