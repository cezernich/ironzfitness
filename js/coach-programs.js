// coach-programs.js — Phase 3D: multi-week program templates
//
// CRUD on public.coach_programs + apply-to-client. A program is a
// weekly template (one workout slot per day, drawn from the coach's
// library) repeated for N weeks. Apply iterates (week, day) and
// inserts into coach_assigned_workouts for each filled slot. Phase 3A.1
// trigger mirrors each into the client's workoutSchedule.
//
// Race-truncation: at apply time, query race_events for the client. If
// a race falls inside the program window, warn the coach and offer to
// stop at the race date. The user explicitly flagged this as a key
// edge case.
//
// Spec: new features/COACHING_FEATURE_SPEC_2026-04-28.md

(function () {
  "use strict";

  let _coachUid = null;
  let _programs = [];
  let _libraryItems = [];   // mirrored from coach-library on demand
  let _editingProgram = null; // null OR an existing program object
  let _draftTemplate = {};    // { mon: <libraryItemId>, tue: <id>, ... }
  let _draftName = "";
  let _draftWeeks = 4;
  let _applyState = null;     // { program, clientId, startDate }

  const DAYS = [
    { key: "mon", label: "Mon", offset: 0 },
    { key: "tue", label: "Tue", offset: 1 },
    { key: "wed", label: "Wed", offset: 2 },
    { key: "thu", label: "Thu", offset: 3 },
    { key: "fri", label: "Fri", offset: 4 },
    { key: "sat", label: "Sat", offset: 5 },
    { key: "sun", label: "Sun", offset: 6 },
  ];

  function _esc(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }

  // ── Load ──────────────────────────────────────────────────────────────
  async function loadCoachPrograms() {
    const sb = window.supabaseClient;
    if (!sb) return;
    const sess = (await sb.auth.getSession())?.data?.session;
    _coachUid = sess?.user?.id || null;
    if (!_coachUid) return;

    // Programs + library together — the program builder needs library
    // items for the per-day picker.
    const [progRes, libRes] = await Promise.all([
      sb.from("coach_programs").select("*").eq("coach_id", _coachUid).order("created_at", { ascending: false }),
      sb.from("coach_workout_library").select("id, name, workout").eq("coach_id", _coachUid).order("created_at", { ascending: false }),
    ]);
    _programs = progRes?.data || [];
    _libraryItems = libRes?.data || [];

    _renderProgramsView();
  }

  // ── Render ────────────────────────────────────────────────────────────
  function renderCoachProgramsView() {
    return `
      <div class="card coach-section">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="coach-section-title">Programs</div>
          <button class="btn-primary btn-sm" onclick="openCoachProgramBuilder()">+ New Program</button>
        </div>
        <div id="coach-programs-list">${_renderProgramItems()}</div>
      </div>`;
  }

  function _renderProgramsView() {
    const list = document.getElementById("coach-programs-list");
    if (list) list.innerHTML = _renderProgramItems();
  }

  function _renderProgramItems() {
    if (!_programs.length) {
      return `<div style="color:var(--color-text-muted);padding:16px;text-align:center;font-size:0.9rem">
        No programs yet. Build a multi-week template here, then apply it to clients.
      </div>`;
    }
    return _programs.map(p => {
      const slots = _slotCount(p.weekly_template || {});
      return `<div class="coach-library-row">
        <div class="coach-library-row-main">
          <div class="coach-library-row-name">${_esc(p.name)}</div>
          <div class="coach-library-row-meta">
            ${p.duration_weeks} week${p.duration_weeks === 1 ? "" : "s"} ·
            ${slots} workout${slots === 1 ? "" : "s"}/week ·
            ${p.duration_weeks * slots} total
          </div>
        </div>
        <div class="coach-library-row-actions">
          <button class="btn-secondary btn-sm" onclick="openCoachProgramApply('${p.id}')">Apply</button>
          <button class="admin-action-btn" aria-label="Edit" title="Edit"
            onclick="openCoachProgramEdit('${p.id}')">✎</button>
          <button class="admin-action-btn" aria-label="Delete" title="Delete"
            onclick="deleteCoachProgram('${p.id}')"
            style="color:var(--color-danger,#b91c1c)">×</button>
        </div>
      </div>`;
    }).join("");
  }

  function _slotCount(template) {
    return DAYS.filter(d => template[d.key]).length;
  }

  // ── Builder modal ─────────────────────────────────────────────────────
  function openCoachProgramBuilder() {
    _editingProgram = null;
    _draftTemplate = {};
    _draftName = "";
    _draftWeeks = 4;
    _renderBuilder();
    document.getElementById("coach-program-builder-overlay")?.classList.add("is-open");
  }

  function openCoachProgramEdit(id) {
    const p = _programs.find(x => x.id === id);
    if (!p) return;
    _editingProgram = p;
    _draftName = p.name;
    _draftWeeks = p.duration_weeks;
    // Template can store either a library_id or a custom workout JSONB
    // per day. v1 only supports library_id; if a row has anything else
    // we keep the raw value so a save round-trip doesn't lose data.
    _draftTemplate = { ...(p.weekly_template || {}) };
    _renderBuilder();
    document.getElementById("coach-program-builder-overlay")?.classList.add("is-open");
  }

  function closeCoachProgramBuilder() {
    document.getElementById("coach-program-builder-overlay")?.classList.remove("is-open");
  }

  function _renderBuilder() {
    const root = document.getElementById("coach-program-builder-body");
    if (!root) return;

    const libOptions = _libraryItems.map(li => `<option value="${_esc(li.id)}">${_esc(li.name)}</option>`).join("");

    const dayRows = DAYS.map(d => {
      const slot = _draftTemplate[d.key];
      let display;
      if (slot && typeof slot === "object" && slot.library_id) {
        const lib = _libraryItems.find(x => x.id === slot.library_id);
        display = lib ? `<span class="coach-program-day-name">${_esc(lib.name)}</span>` : `<span class="coach-program-day-empty">(library item gone)</span>`;
      } else if (slot) {
        // Legacy raw JSONB shape. Show its name or a placeholder.
        display = `<span class="coach-program-day-name">${_esc(slot.sessionName || "Custom")}</span>`;
      } else {
        display = `<span class="coach-program-day-empty">Rest</span>`;
      }
      const selectedId = (slot && slot.library_id) || "";
      return `<div class="coach-program-day-row">
        <span class="coach-program-day-label">${d.label}</span>
        <div class="coach-program-day-content">${display}</div>
        <select class="input coach-program-day-pick" onchange="setCoachProgramDay('${d.key}', this.value)">
          <option value="">— Pick —</option>
          <option value="__rest__"${slot == null ? " selected" : ""}>Rest</option>
          ${libOptions.replace(/<option value="(.*?)"/g, (m, v) => v === selectedId
            ? `<option value="${v}" selected`
            : m)}
        </select>
      </div>`;
    }).join("");

    root.innerHTML = `
      <div class="form-row">
        <label for="coach-program-name">Program name</label>
        <input type="text" id="coach-program-name" class="input"
          value="${_esc(_draftName)}" placeholder="e.g. Hyrox 8-Week Build"
          oninput="setCoachProgramName(this.value)" />
      </div>
      <div class="form-row" style="max-width:160px">
        <label for="coach-program-weeks">Duration (weeks)</label>
        <input type="number" id="coach-program-weeks" class="input"
          value="${_esc(_draftWeeks)}" min="1" max="52"
          oninput="setCoachProgramWeeks(this.value)" />
      </div>

      <div class="form-row">
        <label>Weekly template <span class="optional-tag">pick a library workout per day</span></label>
        <div class="coach-program-week">${dayRows}</div>
      </div>

      <p id="coach-program-error" class="hint" style="color:var(--color-danger);min-height:1em"></p>
    `;
  }

  function setCoachProgramName(v) { _draftName = v; }
  function setCoachProgramWeeks(v) {
    const n = parseInt(v, 10);
    _draftWeeks = isNaN(n) || n < 1 ? 1 : (n > 52 ? 52 : n);
  }

  function setCoachProgramDay(dayKey, libraryId) {
    if (libraryId === "__rest__" || libraryId === "") {
      delete _draftTemplate[dayKey];
    } else {
      _draftTemplate[dayKey] = { library_id: libraryId };
    }
    _renderBuilder();
  }

  async function saveCoachProgram() {
    const errEl = document.getElementById("coach-program-error");
    const setErr = (m) => { if (errEl) errEl.textContent = m || ""; };
    setErr("");

    if (!_draftName.trim()) return setErr("Give the program a name.");
    if (_slotCount(_draftTemplate) === 0) return setErr("Add at least one workout day to the template.");

    const sb = window.supabaseClient;
    if (!sb) return;
    let res;
    if (_editingProgram) {
      res = await sb.from("coach_programs").update({
        name: _draftName.trim(),
        duration_weeks: _draftWeeks,
        weekly_template: _draftTemplate,
      }).eq("id", _editingProgram.id);
    } else {
      res = await sb.from("coach_programs").insert({
        coach_id: _coachUid,
        name: _draftName.trim(),
        duration_weeks: _draftWeeks,
        weekly_template: _draftTemplate,
      });
    }
    if (res?.error) return setErr("Couldn't save: " + res.error.message);

    closeCoachProgramBuilder();
    await loadCoachPrograms();
  }

  async function deleteCoachProgram(id) {
    const p = _programs.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`Delete program "${p.name}"? Already-applied workouts on client calendars stay.`)) return;
    const sb = window.supabaseClient;
    const { error } = await sb.from("coach_programs").delete().eq("id", id);
    if (error) { alert("Couldn't delete: " + error.message); return; }
    await loadCoachPrograms();
  }

  // ── Apply program ────────────────────────────────────────────────────
  async function openCoachProgramApply(id) {
    const p = _programs.find(x => x.id === id);
    if (!p) return;
    _applyState = {
      program: p,
      clientId: null,
      startDate: _nextMondayIso(),
    };
    _renderApply();
    document.getElementById("coach-program-apply-overlay")?.classList.add("is-open");
  }

  function closeCoachProgramApply() {
    document.getElementById("coach-program-apply-overlay")?.classList.remove("is-open");
    _applyState = null;
  }

  function _nextMondayIso() {
    const d = new Date();
    const dayIdx = d.getDay() || 7;
    d.setDate(d.getDate() + (8 - dayIdx) % 7 || 7);
    return d.toISOString().slice(0, 10);
  }

  function _renderApply() {
    const root = document.getElementById("coach-program-apply-body");
    if (!root || !_applyState) return;
    const clients = (window._coachDashState && window._coachDashState.clients) || [];

    if (!clients.length) {
      root.innerHTML = `<div style="padding:14px;color:var(--color-text-muted)">No active clients. Add one via Admin Portal → Coaches.</div>`;
      return;
    }

    const clientOpts = clients.map(c =>
      `<option value="${_esc(c.id)}"${_applyState.clientId === c.id ? " selected" : ""}>${_esc(c.full_name || c.email || c.id.slice(0, 8))}</option>`
    ).join("");

    const totalSlots = _applyState.program.duration_weeks * _slotCount(_applyState.program.weekly_template || {});

    root.innerHTML = `
      <div class="coach-bulk-summary">
        <strong>${_esc(_applyState.program.name)}</strong>
        <div style="font-size:0.82rem;color:var(--color-text-muted);margin-top:2px">
          ${_applyState.program.duration_weeks} weeks · ${totalSlots} workout${totalSlots === 1 ? "" : "s"} total
        </div>
      </div>

      <div class="form-row">
        <label for="coach-program-apply-client">Client</label>
        <select id="coach-program-apply-client" class="input" onchange="setCoachProgramApplyClient(this.value)">
          <option value="">— Pick a client —</option>
          ${clientOpts}
        </select>
      </div>

      <div class="form-row">
        <label for="coach-program-apply-start">Start date</label>
        <input type="date" id="coach-program-apply-start" class="input"
          value="${_esc(_applyState.startDate)}"
          onchange="setCoachProgramApplyStart(this.value)" />
        <div class="hint" style="font-size:0.78rem;margin-top:2px">
          Defaults to next Monday. Day-of-week order in the template starts from this date.
        </div>
      </div>

      <div id="coach-program-apply-warning"></div>
      <p id="coach-program-apply-error" class="hint" style="color:var(--color-danger);min-height:1em"></p>
    `;

    // After client + start are chosen, fire the truncation check so the
    // warning shows up before the user clicks Apply.
    if (_applyState.clientId && _applyState.startDate) {
      _refreshTruncationWarning();
    }
  }

  function setCoachProgramApplyClient(id) {
    _applyState.clientId = id;
    _refreshTruncationWarning();
  }

  function setCoachProgramApplyStart(d) {
    _applyState.startDate = d;
    _refreshTruncationWarning();
  }

  // Race-truncation: check if any race for this client falls inside the
  // program window. If so, surface a warning + give the coach a chance
  // to cap the program at the race date instead of overrunning it.
  async function _refreshTruncationWarning() {
    const wrap = document.getElementById("coach-program-apply-warning");
    if (!wrap) return;
    if (!_applyState?.clientId || !_applyState?.startDate) {
      wrap.innerHTML = "";
      return;
    }
    const sb = window.supabaseClient;
    if (!sb) return;

    const start = new Date(_applyState.startDate + "T00:00:00");
    const endDate = new Date(start);
    endDate.setDate(start.getDate() + _applyState.program.duration_weeks * 7 - 1);

    // races live in TWO places: the dedicated race_events table AND
    // user_data.events (legacy mirror). Query both, take the soonest
    // race that falls inside the window.
    const startStr = _applyState.startDate;
    const endStr = endDate.toISOString().slice(0, 10);

    const [racesRes, eventsRes] = await Promise.all([
      sb.from("race_events").select("id, name, race_date").eq("user_id", _applyState.clientId)
        .gte("race_date", startStr).lte("race_date", endStr).order("race_date", { ascending: true }).limit(1),
      sb.from("user_data").select("data_value").eq("user_id", _applyState.clientId).eq("data_key", "raceEvents").maybeSingle(),
    ]);

    let race = (racesRes?.data || [])[0] || null;
    if (!race) {
      const arr = Array.isArray(eventsRes?.data?.data_value) ? eventsRes.data.data_value : [];
      const inWindow = arr.filter(e => e?.date >= startStr && e?.date <= endStr).sort((a, b) => a.date.localeCompare(b.date));
      if (inWindow[0]) {
        race = { name: inWindow[0].name || inWindow[0].type || "Race", race_date: inWindow[0].date };
      }
    }

    if (!race) {
      wrap.innerHTML = "";
      _applyState.truncateAt = null;
      return;
    }

    const raceDate = race.race_date;
    const truncatedWeeks = _weeksBetween(_applyState.startDate, raceDate);
    _applyState.truncateAt = raceDate;

    wrap.innerHTML = `
      <div class="coach-program-warning">
        <strong>⚠ Race in window</strong>
        <div style="font-size:0.85rem;margin-top:4px">
          ${_esc(race.name || "Race")} on ${_esc(raceDate)} —
          this ${_applyState.program.duration_weeks}-week program would run past it.
          Apply will stop at the race date (covers ${truncatedWeeks} week${truncatedWeeks === 1 ? "" : "s"}).
        </div>
      </div>`;
  }

  function _weeksBetween(startStr, endStr) {
    const a = new Date(startStr + "T00:00:00").getTime();
    const b = new Date(endStr + "T00:00:00").getTime();
    return Math.max(0, Math.floor((b - a) / (1000 * 60 * 60 * 24 * 7)) + 1);
  }

  async function confirmCoachProgramApply() {
    const errEl = document.getElementById("coach-program-apply-error");
    const setErr = (m) => { if (errEl) errEl.textContent = m || ""; };
    setErr("");
    if (!_applyState?.clientId) return setErr("Pick a client.");
    if (!_applyState?.startDate) return setErr("Pick a start date.");

    const sb = window.supabaseClient;
    if (!sb) return;
    const sess = (await sb.auth.getSession())?.data?.session;
    const coachId = sess?.user?.id;
    if (!coachId) return setErr("Not signed in.");
    const coachName = (window._coachNameCache && window._coachNameCache[coachId]) || "Your coach";

    const program = _applyState.program;
    const template = program.weekly_template || {};
    const startDate = new Date(_applyState.startDate + "T00:00:00");
    const truncateAt = _applyState.truncateAt
      ? new Date(_applyState.truncateAt + "T00:00:00").getTime()
      : null;

    // Build (week, day) → row list. Look up each library_id once and
    // expand into a workout JSONB.
    const libById = {};
    for (const li of _libraryItems) libById[li.id] = li;

    const rows = [];
    for (let w = 0; w < program.duration_weeks; w++) {
      for (const d of DAYS) {
        const slot = template[d.key];
        if (!slot) continue;

        const date = new Date(startDate);
        date.setDate(startDate.getDate() + w * 7 + d.offset);
        if (truncateAt && date.getTime() > truncateAt) continue;

        let workoutJson;
        if (slot.library_id && libById[slot.library_id]) {
          workoutJson = { ...(libById[slot.library_id].workout || {}), coachName };
        } else if (slot.library_id) {
          // Library item went missing between save and apply. Skip
          // this day rather than dropping the whole apply.
          continue;
        } else {
          // Legacy raw workout JSONB — pass through.
          workoutJson = { ...slot, coachName };
        }

        rows.push({
          client_id: _applyState.clientId,
          coach_id:  coachId,
          date:      date.toISOString().slice(0, 10),
          // conflict_mode set after the row list is built, once the
          // coach has confirmed replace-vs-stack via the prompt below.
          workout:   workoutJson,
          program_id:  program.id,
          program_week: w + 1,
          program_day:  d.offset + 1,
        });
      }
    }

    if (!rows.length) return setErr("This program has no workout days inside the window.");

    // Coach picks the conflict behavior up front in an in-app modal.
    // Remove → replace any existing workouts on those dates.
    // Add    → stack alongside what's there.
    // Cancel → close, no-op.
    _openProgramConflictModeModal({
      title: "Existing workouts on those dates?",
      body: `Applying ${_pgEsc(rows.length + " workout" + (rows.length === 1 ? "" : "s"))} from "${_pgEsc(program.name || "this program")}".<br><br><strong>Remove</strong> deletes any current workouts on those dates and replaces them.<br><strong>Add</strong> keeps the current plan and adds yours alongside.`,
      onChoose: async (mode) => {
        if (!mode) return;
        for (const r of rows) r.conflict_mode = mode;

        const { error } = await sb.from("coach_assigned_workouts").insert(rows);
        if (error) return setErr("Couldn't apply: " + error.message);

        closeCoachProgramApply();
        if (typeof window.showCoachToast === "function") {
          window.showCoachToast(`Applied — ${rows.length} workout${rows.length === 1 ? "" : "s"} added`);
        } else {
          const el = document.createElement("div");
          el.className = "coach-toast is-visible";
          el.textContent = `Applied — ${rows.length} workouts added`;
          document.body.appendChild(el);
          setTimeout(() => el.remove(), 1800);
        }

        if (typeof trackEvent === "function") {
          try {
            trackEvent("coach_program_applied", {
              programId: program.id,
              weeks: program.duration_weeks,
              rows: rows.length,
              truncated: !!truncateAt,
              mode,
            });
          } catch {}
        }
      },
    });
  }

  // Local copy of the in-app conflict-mode modal used by coach-library.js.
  // Programs and the per-workout assign flow share the same Remove / Add /
  // Cancel UX, so the styling stays in sync across the two entry points.
  function _pgEsc(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }
  function _openProgramConflictModeModal({ title, body, onChoose }) {
    const id = "coach-program-conflict-mode-overlay";
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
        <div class="rating-modal-title">${_pgEsc(title || "Existing workouts on those dates")}</div>
        ${body ? `<div style="text-align:center;color:var(--color-text-muted);font-size:0.9rem;margin-bottom:14px;line-height:1.45">${body}</div>` : ""}
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn-danger"    id="cpcm-remove" style="min-height:42px">Remove existing &amp; replace</button>
          <button class="btn-primary"   id="cpcm-add"    style="min-height:42px">Add alongside existing</button>
          <button class="btn-secondary" id="cpcm-cancel" style="min-height:38px">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
    overlay.querySelector("#cpcm-remove").onclick = (e) => { e.stopPropagation(); close(); onChoose && onChoose("replace"); };
    overlay.querySelector("#cpcm-add").onclick    = (e) => { e.stopPropagation(); close(); onChoose && onChoose("stack"); };
    overlay.querySelector("#cpcm-cancel").onclick = (e) => { e.stopPropagation(); close(); onChoose && onChoose(null); };
  }

  // ── Public surface ─────────────────────────────────────────────────────
  window.loadCoachPrograms             = loadCoachPrograms;
  window.renderCoachProgramsView       = renderCoachProgramsView;
  window.openCoachProgramBuilder       = openCoachProgramBuilder;
  window.openCoachProgramEdit          = openCoachProgramEdit;
  window.closeCoachProgramBuilder      = closeCoachProgramBuilder;
  window.setCoachProgramName           = setCoachProgramName;
  window.setCoachProgramWeeks          = setCoachProgramWeeks;
  window.setCoachProgramDay            = setCoachProgramDay;
  window.saveCoachProgram              = saveCoachProgram;
  window.deleteCoachProgram            = deleteCoachProgram;
  window.openCoachProgramApply         = openCoachProgramApply;
  window.closeCoachProgramApply        = closeCoachProgramApply;
  window.setCoachProgramApplyClient    = setCoachProgramApplyClient;
  window.setCoachProgramApplyStart     = setCoachProgramApplyStart;
  window.confirmCoachProgramApply      = confirmCoachProgramApply;
})();
