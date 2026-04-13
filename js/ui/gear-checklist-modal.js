// js/ui/gear-checklist-modal.js
//
// Modal UI for the triathlon gear checklist. Built on top of the
// window.GearChecklist data module.
//
// Entry point:
//   window.GearChecklistModal.open(race)
// Where `race` is the race input object from the training inputs store.
//
// Behavior:
//   - Filter pills at top: All / Need / Nice / Extra
//   - Collapsible category sections (Swim / Bike / Run / Transition / Nutrition)
//   - Each item: checkbox + name + tier badge + expand-to-see-why + remove X
//   - Footer: show/hide removed items link + Reset button + progress bar
//   - Persists state via GearChecklist.toggleItem / removeItem / restoreItem
//   - Analytics: fires gear_checklist_opened on open

(function () {
  "use strict";

  const SHEET_ID = "gear-checklist-modal-overlay";

  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function _close() {
    const el = document.getElementById(SHEET_ID);
    if (!el) return;
    el.classList.remove("is-open");
    setTimeout(() => { try { el.remove(); } catch {} }, 220);
  }

  // View state, reset on each open
  let _state = null;

  function open(race) {
    if (!race) { console.warn("[GearChecklistModal] no race"); return; }
    const GC = window.GearChecklist;
    if (!GC) { console.warn("[GearChecklistModal] GearChecklist not loaded"); return; }

    const checklist = GC.loadChecklist(race.id, race);
    const progress = GC.progressFor(race.id);

    _state = {
      raceId: race.id,
      race,
      checklist,
      tierFilter: "all",          // "all"|"need"|"nice"|"extra"
      showRemoved: false,
      expandedItems: new Set(),
    };

    if (typeof trackEvent === "function") {
      trackEvent("gear_checklist_opened", {
        distance: checklist.distance,
        items_total: progress.total,
        items_checked: progress.checked,
      });
    }

    // Remove any previously-open sheet
    const old = document.getElementById(SHEET_ID);
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = SHEET_ID;
    overlay.className = "gear-sheet-overlay";
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) _close();
    });
    document.body.appendChild(overlay);

    _render();
    requestAnimationFrame(() => overlay.classList.add("is-open"));
  }

  // Build the subtitle: "Half Ironman · Jun 15, 2026 · 8 weeks away"
  function _buildSubtitle(race, distance) {
    const GC = window.GearChecklist;
    const parts = [];
    parts.push(GC.distanceLabel(distance));
    if (race.date) {
      try {
        const d = new Date(race.date + "T12:00:00");
        parts.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
        const now = new Date(); now.setHours(0, 0, 0, 0);
        const diff = Math.ceil((d - now) / 86400000);
        if (diff <= 0) parts.push("Race week!");
        else if (diff < 14) parts.push(diff + " day" + (diff === 1 ? "" : "s") + " away");
        else parts.push(Math.floor(diff / 7) + " weeks away");
      } catch {}
    }
    return parts.join(" · ");
  }

  function _render() {
    if (!_state) return;
    const overlay = document.getElementById(SHEET_ID);
    if (!overlay) return;

    // Preserve body scroll across re-renders (e.g. when a user checks an item).
    const prevBody = overlay.querySelector(".gear-sheet-body");
    const prevScroll = prevBody ? prevBody.scrollTop : 0;

    const GC = window.GearChecklist;
    const { race, checklist, tierFilter, showRemoved, expandedItems } = _state;
    const progress = GC.progressFor(race.id);
    const pct = progress.total > 0 ? Math.round((progress.checked / progress.total) * 100) : 0;

    const subtitle = _buildSubtitle(race, checklist.distance);

    const activeItems  = checklist.items.filter(i => !i.removed);
    const removedItems = checklist.items.filter(i => i.removed);

    // Apply tier filter
    const visibleItems = activeItems.filter(it => {
      if (tierFilter === "all") return true;
      return it.tier === tierFilter;
    });

    // Group by category
    const byCategory = {};
    visibleItems.forEach(it => {
      (byCategory[it.category] = byCategory[it.category] || []).push(it);
    });
    // Sort inside a category: need → nice → extra, then stable order.
    // Use nullish coalescing — tierOrder.need is 0, which would be falsy with ||.
    const tierOrder = { need: 0, nice: 1, extra: 2 };
    Object.keys(byCategory).forEach(cat => {
      byCategory[cat].sort((a, b) => (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9));
    });

    // Filter pill row
    const pills = ["all", "need", "nice", "extra"].map(t => {
      const label = t === "all" ? "All" : GC.TIER_LABELS[t];
      const count = t === "all"
        ? activeItems.length
        : activeItems.filter(i => i.tier === t).length;
      return `<button class="gear-pill${tierFilter === t ? " is-active" : ""}" data-gc-filter="${t}">${label} <span class="gear-pill-count">${count}</span></button>`;
    }).join("");

    // Category sections
    let bodyHtml = "";
    GC.CATEGORY_ORDER.forEach(cat => {
      const items = byCategory[cat] || [];
      if (!items.length) return;
      bodyHtml += `
        <div class="gear-cat">
          <div class="gear-cat-label">${_esc(GC.CATEGORY_LABELS[cat] || cat).toUpperCase()}</div>
          <div class="gear-cat-items">
            ${items.map(it => _renderItem(it, expandedItems)).join("")}
          </div>
        </div>`;
    });
    if (!bodyHtml) {
      bodyHtml = '<p class="gear-empty">No items match this filter.</p>';
    }

    // Removed-items footer
    let removedHtml = "";
    if (removedItems.length) {
      if (showRemoved) {
        removedHtml = `
          <div class="gear-removed">
            <div class="gear-removed-label">Removed (${removedItems.length})</div>
            ${removedItems.map(it => `
              <div class="gear-removed-item">
                <span>${_esc(it.name)}</span>
                <button class="gear-restore-btn" data-gc-restore="${_esc(it.id)}">Restore</button>
              </div>
            `).join("")}
            <button class="gear-hide-removed" data-gc-toggle-removed="1">Hide removed items</button>
          </div>`;
      } else {
        removedHtml = `
          <div class="gear-removed-toggle-row">
            <button class="gear-show-removed" data-gc-toggle-removed="1">Show ${removedItems.length} removed item${removedItems.length === 1 ? "" : "s"}</button>
          </div>`;
      }
    }

    overlay.innerHTML = `
      <div class="gear-sheet" role="dialog" aria-modal="true">
        <div class="gear-sheet-header">
          <div class="gear-sheet-title-wrap">
            <div class="gear-sheet-title">Race Day Gear</div>
            <div class="gear-sheet-subtitle">${_esc(race.name || "Triathlon")}</div>
            <div class="gear-sheet-meta">${_esc(subtitle)}</div>
          </div>
          <button class="gear-sheet-close" data-gc-close="1" aria-label="Close">&times;</button>
        </div>

        <div class="gear-progress-wrap">
          <div class="gear-progress-bar"><div class="gear-progress-fill" style="width:${pct}%"></div></div>
          <div class="gear-progress-label">${progress.checked} / ${progress.total} packed · ${pct}%</div>
        </div>

        <div class="gear-filter-row">${pills}</div>

        <div class="gear-sheet-body">
          ${bodyHtml}
          ${removedHtml}
        </div>

        <div class="gear-sheet-footer">
          <button class="btn-ghost gear-reset-btn" data-gc-reset="1">Reset checklist</button>
        </div>
      </div>
    `;

    // Restore body scroll after innerHTML replace (so checking an item
    // doesn't bounce the user back to the top of the list).
    const newBody = overlay.querySelector(".gear-sheet-body");
    if (newBody && prevScroll) newBody.scrollTop = prevScroll;

    _wireEvents(overlay);
  }

  function _renderItem(it, expandedItems) {
    const GC = window.GearChecklist;
    const isExpanded = expandedItems.has(it.id);
    const tierClass = "gear-tier-" + it.tier;
    const tierLabel = (GC.TIER_LABELS[it.tier] || it.tier).toUpperCase();
    const checkedClass = it.checked ? " is-checked" : "";
    const expandedClass = isExpanded ? " is-expanded" : "";

    return `
      <div class="gear-item${checkedClass}${expandedClass}" data-gc-item="${_esc(it.id)}">
        <button class="gear-item-checkbox" data-gc-toggle="${_esc(it.id)}" aria-label="Toggle ${_esc(it.name)}">
          ${it.checked ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
        </button>
        <button class="gear-item-main" data-gc-expand="${_esc(it.id)}">
          <div class="gear-item-row">
            <span class="gear-item-name">${_esc(it.name)}</span>
            <span class="gear-tier-badge ${tierClass}">${tierLabel}</span>
          </div>
          ${isExpanded ? `
            <div class="gear-item-detail">
              <div class="gear-item-why"><strong>Why:</strong> ${_esc(it.why || "")}</div>
              <div class="gear-item-tip"><strong>Pro tip:</strong> ${_esc(it.tip || "")}</div>
            </div>
          ` : ""}
        </button>
        <button class="gear-item-remove" data-gc-remove="${_esc(it.id)}" title="Remove from list" aria-label="Remove ${_esc(it.name)}">×</button>
      </div>`;
  }

  function _wireEvents(root) {
    // Close
    root.querySelectorAll("[data-gc-close]").forEach(el => {
      el.addEventListener("click", (e) => { e.stopPropagation(); _close(); });
    });
    // Filter pills
    root.querySelectorAll("[data-gc-filter]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        _state.tierFilter = el.dataset.gcFilter;
        _render();
      });
    });
    // Toggle check
    root.querySelectorAll("[data-gc-toggle]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = el.dataset.gcToggle;
        _state.checklist = window.GearChecklist.toggleItem(_state.raceId, id) || _state.checklist;
        _render();
      });
    });
    // Expand/collapse detail
    root.querySelectorAll("[data-gc-expand]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = el.dataset.gcExpand;
        if (_state.expandedItems.has(id)) _state.expandedItems.delete(id);
        else _state.expandedItems.add(id);
        _render();
      });
    });
    // Remove item
    root.querySelectorAll("[data-gc-remove]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = el.dataset.gcRemove;
        _state.checklist = window.GearChecklist.removeItem(_state.raceId, id) || _state.checklist;
        _render();
      });
    });
    // Restore item
    root.querySelectorAll("[data-gc-restore]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = el.dataset.gcRestore;
        _state.checklist = window.GearChecklist.restoreItem(_state.raceId, id) || _state.checklist;
        _render();
      });
    });
    // Toggle show/hide removed
    root.querySelectorAll("[data-gc-toggle-removed]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        _state.showRemoved = !_state.showRemoved;
        _render();
      });
    });
    // Reset
    root.querySelectorAll("[data-gc-reset]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!confirm("Reset checklist to the default items for this distance?")) return;
        _state.checklist = window.GearChecklist.resetChecklist(_state.raceId, _state.race);
        _state.expandedItems.clear();
        _state.showRemoved = false;
        _render();
      });
    });
  }

  const api = { open, close: _close };
  if (typeof window !== "undefined") window.GearChecklistModal = api;
})();
