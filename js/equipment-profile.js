// equipment-profile.js — user's owned-equipment checklist.
//
// Backs window.ExerciseDB.getUserEquipment() / saveToCalendar's planner
// queries. Spec: cowork-handoff/EXERCISE_DB_SPEC.md §Onboarding equipment
// profile + §Equipment profile schema.
//
// Storage: localStorage.equipmentProfile = JSON array of canonical tokens.
// Empty/unset = no filtering (full library, gym assumed) — backward
// compatible for users who haven't yet completed the checklist.
//
// Synced via DB.syncKey('equipmentProfile') (see SYNCED_KEYS in db.js).

(function () {
  "use strict";

  // Canonical equipment tokens grouped for the UI. The token strings here
  // MUST match the tokens emitted by scripts/generate-exercise-db.py
  // (EQUIPMENT_FRAGMENT_MAP). When you add a token here, also add the
  // mapping there so the spreadsheet → DB pipeline stays in sync.
  const EQUIPMENT_GROUPS = [
    {
      label: "Free weights",
      items: [
        { tok: "dumbbells",     label: "Dumbbells" },
        { tok: "barbell-rack",  label: "Barbell + Rack" },
        { tok: "kettlebell",    label: "Kettlebell" },
        { tok: "trap-bar",      label: "Trap Bar" },
        { tok: "weight-plate",  label: "Weight Plate" },
        { tok: "sandbag",       label: "Sandbag" },
      ],
    },
    {
      label: "Bench & bars",
      items: [
        { tok: "bench",         label: "Bench" },
        { tok: "pull-up-bar",   label: "Pull-Up Bar" },
        { tok: "ghd",           label: "GHD" },
      ],
    },
    {
      label: "Machines & cables",
      items: [
        { tok: "cable-machine",          label: "Cable Machine" },
        { tok: "functional-trainer",     label: "Functional Trainer" },
        { tok: "lat-pulldown",           label: "Lat Pulldown" },
        { tok: "seated-row",             label: "Seated Row" },
        { tok: "smith-machine",          label: "Smith Machine" },
        { tok: "leg-press",              label: "Leg Press" },
        { tok: "leg-curl",               label: "Leg Curl" },
        { tok: "leg-extension",          label: "Leg Extension" },
        { tok: "hip-abductor-adductor",  label: "Hip Ab/Adductor" },
        { tok: "chest-press-machine",    label: "Chest Press Machine" },
        { tok: "chest-fly-machine",      label: "Chest Fly Machine" },
        { tok: "shoulder-press-machine", label: "Shoulder Press Machine" },
      ],
    },
    {
      label: "Conditioning",
      items: [
        { tok: "rowing-machine", label: "Rowing Machine" },
        { tok: "ski-erg",        label: "SkiErg" },
        { tok: "sled",           label: "Sled" },
        { tok: "jump-rope",      label: "Jump Rope" },
        { tok: "med-ball",       label: "Med Ball" },
      ],
    },
    {
      label: "Other",
      items: [
        { tok: "band",      label: "Resistance Bands" },
        { tok: "ab-wheel",  label: "Ab Wheel" },
      ],
    },
  ];

  function _read() {
    try {
      const raw = localStorage.getItem("equipmentProfile");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }

  function _write(tokens) {
    const clean = Array.isArray(tokens) ? tokens.filter(Boolean) : [];
    localStorage.setItem("equipmentProfile", JSON.stringify(clean));
    try { if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("equipmentProfile"); } catch {}
  }

  function getProfile() {
    return _read();
  }

  function setProfile(tokens) {
    _write(tokens);
  }

  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // Render the checklist into #equipment-profile-grid. Idempotent —
  // safe to call multiple times (overwrites the grid contents).
  function render() {
    const grid = document.getElementById("equipment-profile-grid");
    if (!grid) return;
    const owned = new Set(_read());
    grid.innerHTML = EQUIPMENT_GROUPS.map(group => `
      <div class="equipment-group">
        <div class="equipment-group-label">${_esc(group.label)}</div>
        <div class="equipment-group-items">
          ${group.items.map(it => `
            <label class="equipment-checkbox">
              <input type="checkbox" data-token="${_esc(it.tok)}"
                ${owned.has(it.tok) ? "checked" : ""}
                onchange="EquipmentProfile._onToggle()" />
              <span>${_esc(it.label)}</span>
            </label>
          `).join("")}
        </div>
      </div>
    `).join("");
  }

  function _onToggle() {
    const grid = document.getElementById("equipment-profile-grid");
    if (!grid) return;
    const tokens = [];
    grid.querySelectorAll('input[type="checkbox"][data-token]').forEach(cb => {
      if (cb.checked) tokens.push(cb.dataset.token);
    });
    _write(tokens);
    const msg = document.getElementById("equipment-profile-msg");
    if (msg) {
      msg.style.color = "var(--color-success)";
      msg.textContent = tokens.length
        ? `Saved · ${tokens.length} item${tokens.length === 1 ? "" : "s"}`
        : "Saved · no equipment selected (full library shown)";
      clearTimeout(_onToggle._t);
      _onToggle._t = setTimeout(() => { msg.textContent = ""; }, 2500);
    }
  }

  // Public API
  window.EquipmentProfile = {
    getProfile,
    setProfile,
    render,
    EQUIPMENT_GROUPS,
    _onToggle,   // internal but referenced from inline onchange
  };

  // Auto-render on DOM ready in case the Profile section is already
  // visible at app boot. The Profile tab handler also calls render()
  // explicitly so user toggles between tabs see fresh state.
  if (typeof document !== "undefined") {
    if (document.readyState !== "loading") {
      try { render(); } catch {}
    } else {
      document.addEventListener("DOMContentLoaded", () => { try { render(); } catch {} });
    }
  }
})();
