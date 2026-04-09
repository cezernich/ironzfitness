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

  let _state = { filterSport: null, sharedOnly: false };

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

    if (list.length === 0) {
      target.innerHTML = `
        ${_renderFilterRow()}
        <div class="saved-empty">
          <h2>Saved</h2>
          <p>Save workouts from the library or from friends' shares to build your own collection.</p>
        </div>
      `;
      _wireFilters(target, containerId);
      return;
    }

    target.innerHTML = `
      <h2 class="tab-h2">Saved</h2>
      ${_renderFilterRow()}
      <div class="saved-list">
        ${list.map(_renderCard).join("")}
      </div>
    `;
    _wireFilters(target, containerId);

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
