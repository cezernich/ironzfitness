// coach-sheet-import.js — Coach Sheet Import (Phase A, Slice 1)
//
// Wires the drop zone + click-to-browse inside the existing "Import a
// Plan" tab. On a valid file:
//   1. Validates extension + size client-side
//   2. Generates an import_id (used as the storage path segment + tied
//      to every workout/template Phase B will eventually emit)
//   3. Uploads the file to `coach-sheet-imports/{user_id}/{import_id}/{filename}`
//   4. Invokes the `coach-sheet-import-parse` edge function with the
//      storage_path so the stub can return canned sheet metadata
//   5. Logs the response to the console (Slice 1 endpoint)
//
// Slices 2–3 add the sheet picker, date range picker, and review
// placeholder; this file is the entry point those steps will hang off.

(function () {
  "use strict";

  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — matches storage bucket cap
  const ALLOWED_EXT = new Set(["xlsx", "csv"]);
  const BUCKET = "coach-sheet-imports";

  // Per-spec §C2: undo button is visible for 1 hour after import; after
  // that the calendar has likely been viewed/edited and full undo
  // becomes risky. The summary itself persists for forensic value.
  const UNDO_KEY = "coachSheetImportLastCommit";
  const UNDO_WINDOW_MS = 60 * 60 * 1000;

  // Latest staged-file state lives on the module so Slices 2–3 can
  // read it when they advance through the modal steps.
  let _stagedFile = null;
  let _lastImport = null;

  function $(id) { return document.getElementById(id); }

  function _formatBytes(n) {
    if (!Number.isFinite(n)) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }

  function _setStatus(message, kind) {
    const el = $("csi-status");
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      el.className = "csi-status";
      return;
    }
    el.hidden = false;
    el.textContent = message;
    el.className = `csi-status csi-status--${kind || "info"}`;
  }

  function _setStaged(file) {
    _stagedFile = file;
    const idle = document.querySelector(".csi-dropzone-idle");
    const staged = $("csi-dropzone-staged");
    const dropzone = $("csi-dropzone");
    const textarea = $("import-plan-text");

    if (file) {
      $("csi-staged-name").textContent = file.name;
      $("csi-staged-size").textContent = _formatBytes(file.size);
      if (idle) idle.style.display = "none";
      if (staged) staged.hidden = false;
      if (dropzone) dropzone.classList.add("csi-dropzone--has-file");
      // Soft-disable the paste path — both UIs stay visible so the user
      // sees the choice, but only one is active at a time per spec.
      if (textarea) {
        textarea.disabled = true;
        textarea.placeholder = "Remove the file above to paste text instead.";
      }
    } else {
      _stagedFile = null;
      if (idle) idle.style.display = "";
      if (staged) staged.hidden = true;
      if (dropzone) dropzone.classList.remove("csi-dropzone--has-file");
      if (textarea) {
        textarea.disabled = false;
        textarea.placeholder = textarea.dataset.csiOriginalPlaceholder || "";
      }
      _setStatus("");
      // Clearing the staged file invalidates step 1+ state — bounce
      // back to step 0 so the user sees the drop zone again.
      if (_currentStep !== 0) _resetToStep0();
    }
  }

  function _validateFile(file) {
    if (!file) return "No file selected.";
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return "We support .xlsx and .csv right now. PDF support coming soon.";
    }
    if (file.size > MAX_BYTES) {
      return `File is ${_formatBytes(file.size)}. Max upload is 10 MB.`;
    }
    return null;
  }

  function _generateImportId() {
    // Compact, URL-safe, sortable. Doesn't need to be cryptographically
    // unique — it's a per-user namespace within a 30-day cleanup window.
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 8);
    return `imp_${t}_${r}`;
  }

  async function _uploadAndParse(file) {
    const supa = window.supabaseClient;
    if (!supa) {
      _setStatus("Supabase not initialized — try reloading.", "error");
      return null;
    }

    const { data: { session }, error: sessionErr } = await supa.auth.getSession();
    if (sessionErr || !session?.user) {
      _setStatus("You need to be signed in to import a sheet.", "error");
      return null;
    }
    const uid = session.user.id;

    const importId = _generateImportId();
    // Match the RLS path shape exactly: `{user_id}/{import_id}/{filename}`.
    // Storage RLS uses (storage.foldername(name))[1] to extract the uid
    // segment, so any other shape will fail the policy.
    const safeFilename = file.name.replace(/[^\w.\-]+/g, "_");
    const storagePath = `${uid}/${importId}/${safeFilename}`;

    _setStatus("Uploading…", "info");
    const { error: uploadErr } = await supa.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || undefined,
      });
    if (uploadErr) {
      console.warn("[CoachSheetImport] upload failed", uploadErr);
      _setStatus(`Upload failed: ${uploadErr.message}`, "error");
      return null;
    }

    _setStatus("Reading sheet…", "info");
    const { data: parseData, error: parseErr } = await supa.functions.invoke(
      "coach-sheet-import-parse",
      {
        body: {
          storage_path: storagePath,
          import_id: importId,
          filename: safeFilename,
          file_size_bytes: file.size,
          metadata_only: true,
        },
      },
    );

    if (parseErr) {
      console.warn("[CoachSheetImport] parse-stub error", parseErr);
      _setStatus(`Couldn't read the sheet: ${parseErr.message || "unknown error"}`, "error");
      return null;
    }
    if (parseData?.status === "error") {
      console.warn("[CoachSheetImport] parse-stub error envelope", parseData);
      _setStatus(parseData.message || "Couldn't read the sheet.", "error");
      return null;
    }

    _lastImport = {
      importId,
      storagePath,
      filename: safeFilename,
      fileSize: file.size,
      response: parseData,
      // Filled in by the picker / range steps as the user progresses.
      selectedSheets: [],
      dateRange: null,
    };
    window.__coachSheetImportLast = _lastImport; // surface for console smoke test

    const sheetCount = Array.isArray(parseData?.sheets) ? parseData.sheets.length : 0;
    _setStatus(
      `File staged (${sheetCount} sheet${sheetCount === 1 ? "" : "s"} detected).`,
      "success",
    );
    console.log("[CoachSheetImport] upload + parse-stub OK:", {
      importId,
      storagePath,
      sheets: parseData?.sheets,
      isStub: parseData?.is_stub,
    });

    // Auto-advance: skip the picker when there's only one sheet (per
    // spec §A2). Otherwise pre-select calendar + strength sheets and
    // show the picker.
    const sheets = Array.isArray(parseData?.sheets) ? parseData.sheets : [];
    if (sheets.length <= 1) {
      _lastImport.selectedSheets = sheets.map(s => s.name);
      _goToStep(2);
    } else {
      _goToStep(1);
    }

    return _lastImport;
  }

  async function _onFileChosen(file) {
    const err = _validateFile(file);
    if (err) {
      _setStatus(err, "error");
      _setStaged(null);
      return;
    }
    _setStaged(file);
    await _uploadAndParse(file);
  }

  function _initDropzone() {
    const dropzone = $("csi-dropzone");
    const input = $("csi-file-input");
    const removeBtn = $("csi-staged-remove");
    const textarea = $("import-plan-text");
    if (!dropzone || !input) return;

    if (textarea && !textarea.dataset.csiOriginalPlaceholder) {
      textarea.dataset.csiOriginalPlaceholder = textarea.placeholder || "";
    }

    dropzone.addEventListener("click", (e) => {
      // Only the idle/inner area should open the picker — clicking the
      // staged row's "x" button shouldn't re-open it.
      if (e.target.closest(".csi-staged-remove")) return;
      input.click();
    });

    dropzone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        input.click();
      }
    });

    input.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) _onFileChosen(file);
      // Reset so re-selecting the same file fires `change` again.
      input.value = "";
    });

    if (removeBtn) {
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        _setStaged(null);
      });
    }

    // Drag-and-drop wiring. Suppress the browser default on the whole
    // window so a stray drag outside the zone doesn't open the file in a
    // new tab while the modal is open.
    ["dragenter", "dragover"].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("csi-dropzone--dragover");
      });
    });
    ["dragleave", "drop"].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("csi-dropzone--dragover");
      });
    });
    dropzone.addEventListener("drop", (e) => {
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) _onFileChosen(file);
    });
  }

  // ── Multi-step state machine ─────────────────────────────────────────────
  //
  // Steps in import-plan-body:
  //   0 = drop zone + paste textarea
  //   1 = sheet picker (multi-sheet workbooks only)
  //   2 = date range picker
  //   3 = review (Slice 3 builds the real screen; Slice 2 ships a placeholder)
  //
  // _currentStep tracks the visible one. Only one is visible at a time.
  // _stepHistory enables Back navigation that respects the auto-skip
  // (single-sheet files skip step 1 forward and back).

  let _currentStep = 0;
  const _stepHistory = [];

  function _showStep(n) {
    [0, 1, 2, 3].forEach(i => {
      const el = $(`csi-step-${i}`);
      if (!el) return;
      if (i === n) el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
    });
    _currentStep = n;
    // Step 0 is also the natural place to surface the cross-session
    // undo banner — if the user committed an import recently and
    // re-opened the modal (whether to undo or to start a new
    // import), they get the affordance front and center.
    if (n === 0) _renderCrossSessionUndo();
  }

  function _renderCrossSessionUndo() {
    const host = $("csi-step-0");
    if (!host) return;
    let banner = document.getElementById("csi-recent-import-banner");
    let commit = null;
    try { commit = JSON.parse(localStorage.getItem(UNDO_KEY) || "null"); } catch {}

    const inWindow = commit && (Date.now() - (commit.committedAt || 0)) <= UNDO_WINDOW_MS;
    if (!inWindow) {
      if (banner) try { banner.remove(); } catch {}
      // Once the window passes, drop the persisted summary too —
      // a stale entry would otherwise sit forever in localStorage.
      if (commit && !inWindow) {
        try { localStorage.removeItem(UNDO_KEY); } catch {}
      }
      return;
    }

    const minsAgo = Math.max(1, Math.round((Date.now() - commit.committedAt) / 60000));
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "csi-recent-import-banner";
      banner.className = "csi-recent-import-banner";
      // Place at the top of step 0, before the drop zone, so the
      // user sees it before deciding whether to start another
      // import.
      host.insertBefore(banner, host.firstChild);
    }
    const wParts = [];
    if (commit.workoutsInserted) wParts.push(`${commit.workoutsInserted} workout${commit.workoutsInserted === 1 ? "" : "s"}`);
    if (commit.templatesInserted) wParts.push(`${commit.templatesInserted} template${commit.templatesInserted === 1 ? "" : "s"}`);
    if (commit.racesInserted)    wParts.push(`${commit.racesInserted} race${commit.racesInserted === 1 ? "" : "s"}`);
    if (commit.prsInserted)      wParts.push(`${commit.prsInserted} PR${commit.prsInserted === 1 ? "" : "s"}`);
    banner.innerHTML = `
      <div class="csi-recent-import-text">
        <strong>Imported "${_esc(commit.planName || "this plan")}"</strong> ${minsAgo}m ago
        — ${_esc(wParts.join(" · ") || "no items")}.
      </div>
      <button type="button" class="csi-recent-import-undo">Undo</button>
    `;
    const btn = banner.querySelector(".csi-recent-import-undo");
    if (btn) btn.addEventListener("click", () => _undoImport(commit));
  }

  function _goToStep(n) {
    if (_currentStep !== n) _stepHistory.push(_currentStep);
    if (n === 1) _renderSheetPicker();
    if (n === 2) _initRangeStep();
    if (n === 3) _renderReviewPlaceholder();
    _showStep(n);
  }

  function _goBack() {
    const prev = _stepHistory.length ? _stepHistory.pop() : 0;
    if (prev === 1) _renderSheetPicker();
    if (prev === 2) _initRangeStep();
    _showStep(prev);
  }

  function _resetToStep0() {
    _stepHistory.length = 0;
    _showStep(0);
  }

  // ── Step 1 — sheet picker ────────────────────────────────────────────────

  function _renderSheetPicker() {
    const host = $("csi-sheet-picker");
    if (!host || !_lastImport) return;
    const sheets = _lastImport.response?.sheets || [];

    // Pre-selection rules (spec §A2):
    //   - Calendar sheets that auto_detected → checked
    //   - Strength library → checked (we extract it)
    //   - Athlete profile / Resources → unchecked, beta tag
    //   - Fueling → disabled "Coming soon"
    if (!_lastImport.selectedSheets || !_lastImport.selectedSheets.length) {
      _lastImport.selectedSheets = sheets
        .filter(s => !s.disabled && (s.role === "calendar" || s.role === "strength_library") && s.auto_detected)
        .map(s => s.name);
    }
    const selected = new Set(_lastImport.selectedSheets);

    const calendarSheets = sheets.filter(s => s.role === "calendar");
    const otherSheets    = sheets.filter(s => s.role !== "calendar");

    const sub = $("csi-step-1-sub");
    if (sub) {
      sub.textContent = `We found ${sheets.length} sheets in your file. Calendar tabs are pre-selected.`;
    }

    const renderRow = (s) => {
      const isChecked = selected.has(s.name);
      const isDisabled = !!s.disabled;
      const range = s.date_range
        ? `${s.date_range.from} → ${s.date_range.to}${s.week_count ? ` · ${s.week_count} wk` : ""}`
        : "";
      const roleLabel = ({
        calendar:         "Calendar",
        strength_library: "Strength templates",
        athlete_profile:  "Athlete profile (beta)",
        fueling:          "Fueling",
      })[s.role] || s.role;
      const disabledNote = isDisabled
        ? `<div class="csi-sheet-row-disabled-note">${_esc(s.disabled_reason || "Coming soon")}</div>`
        : "";

      return `
        <label class="csi-sheet-row${isDisabled ? " csi-sheet-row--disabled" : ""}">
          <input type="checkbox" data-csi-sheet="${_esc(s.name)}" ${isChecked && !isDisabled ? "checked" : ""} ${isDisabled ? "disabled" : ""} />
          <div class="csi-sheet-row-meta">
            <div class="csi-sheet-row-name">${_esc(s.name)}</div>
            <div class="csi-sheet-row-role">${roleLabel}${range ? ` · ${range}` : ""}</div>
            ${disabledNote}
          </div>
        </label>`;
    };

    host.innerHTML = `
      ${calendarSheets.length ? `
        <div class="csi-sheet-section-label">Calendar sheets</div>
        ${calendarSheets.map(renderRow).join("")}
      ` : ""}
      ${otherSheets.length ? `
        <div class="csi-sheet-section-label">Other sheets</div>
        ${otherSheets.map(renderRow).join("")}
      ` : ""}
    `;

    host.querySelectorAll('input[type="checkbox"][data-csi-sheet]').forEach(cb => {
      cb.addEventListener("change", () => {
        const name = cb.getAttribute("data-csi-sheet");
        const set = new Set(_lastImport.selectedSheets || []);
        if (cb.checked) set.add(name);
        else set.delete(name);
        _lastImport.selectedSheets = Array.from(set);
        _updateContinueEnabled();
      });
    });
    _updateContinueEnabled();
  }

  function _updateContinueEnabled() {
    const btn = $("csi-step-1-continue");
    if (!btn || !_lastImport) return;
    btn.disabled = !(_lastImport.selectedSheets && _lastImport.selectedSheets.length);
  }

  // ── Step 2 — date range picker ────────────────────────────────────────────

  function _todayISO() { return new Date().toISOString().slice(0, 10); }

  function _addDays(dateStr, n) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function _diffDays(a, b) {
    const da = new Date(a + "T00:00:00");
    const db = new Date(b + "T00:00:00");
    return Math.round((db - da) / 86400000);
  }

  function _initRangeStep() {
    const fromEl = $("csi-range-from");
    const toEl   = $("csi-range-to");
    if (!fromEl || !toEl || !_lastImport) return;

    // Constrain pickers to dates that exist in the source file (per spec
    // §A3) — union of selected calendar sheets' date_range bounds.
    const sheets = _lastImport.response?.sheets || [];
    const selectedCalendarRanges = sheets
      .filter(s => (_lastImport.selectedSheets || []).includes(s.name) && s.date_range)
      .map(s => s.date_range);

    let fileMin = null, fileMax = null;
    selectedCalendarRanges.forEach(r => {
      if (!fileMin || r.from < fileMin) fileMin = r.from;
      if (!fileMax || r.to > fileMax)   fileMax = r.to;
    });

    // Default range = the union of the selected calendar sheets'
    // date ranges. This matches the user's mental model: "I checked
    // March + May + June, so import March + May + June." Users who
    // want to narrow the window can still adjust the pickers below.
    // If no sheets carry an explicit range (older parser response, no
    // sheets selected yet), fall back to today → today+28d.
    let defaultFrom, defaultTo;
    if (fileMin && fileMax) {
      defaultFrom = fileMin;
      defaultTo   = fileMax;
    } else {
      const today = _todayISO();
      defaultFrom = today;
      defaultTo   = _addDays(today, 28);
    }

    if (!_lastImport.dateRange) {
      _lastImport.dateRange = { from: defaultFrom, to: defaultTo };
    }

    fromEl.value = _lastImport.dateRange.from;
    toEl.value   = _lastImport.dateRange.to;
    if (fileMin) { fromEl.min = fileMin; toEl.min = fileMin; }
    if (fileMax) { fromEl.max = fileMax; toEl.max = fileMax; }

    // Wire change handlers idempotently — _initRangeStep can be called
    // multiple times if the user backs out and returns.
    if (!fromEl.dataset.csiBound) {
      fromEl.addEventListener("change", _onRangeChange);
      fromEl.dataset.csiBound = "1";
    }
    if (!toEl.dataset.csiBound) {
      toEl.addEventListener("change", _onRangeChange);
      toEl.dataset.csiBound = "1";
    }
    _renderRangePreview();
  }

  function _onRangeChange() {
    const fromEl = $("csi-range-from");
    const toEl   = $("csi-range-to");
    if (!fromEl || !toEl || !_lastImport) return;
    let from = fromEl.value;
    let to   = toEl.value;
    // If user dragged from past to, swap so the range is sane.
    if (from && to && from > to) { const t = from; from = to; to = t; fromEl.value = from; toEl.value = to; }
    _lastImport.dateRange = { from, to };
    _renderRangePreview();
  }

  function _renderRangePreview() {
    const host = $("csi-range-preview");
    const continueBtn = $("csi-step-2-continue");
    if (!host || !_lastImport) return;
    const range = _lastImport.dateRange || {};
    if (!range.from || !range.to) {
      host.innerHTML = `<span class="csi-range-warn">Pick a start and end date.</span>`;
      if (continueBtn) continueBtn.disabled = true;
      return;
    }
    const days = _diffDays(range.from, range.to);
    if (days < 0) {
      host.innerHTML = `<span class="csi-range-warn">End date can't be before start.</span>`;
      if (continueBtn) continueBtn.disabled = true;
      return;
    }
    if (days > 365) {
      host.innerHTML = `<span class="csi-range-warn">Plans longer than 12 months can't be imported in one go. Re-import to extend later.</span>`;
      if (continueBtn) continueBtn.disabled = true;
      return;
    }

    // Workout count estimate. Phase B does the real count via parser;
    // Phase A estimates from sheet metadata (week_count for each
    // selected calendar sheet whose date_range overlaps the user's
    // range, scaled by overlap fraction × 5 workouts/week).
    const sheets = _lastImport.response?.sheets || [];
    const sel = new Set(_lastImport.selectedSheets || []);
    let weekEstimate = 0;
    sheets.forEach(s => {
      if (!sel.has(s.name)) return;
      if (s.role !== "calendar" || !s.date_range) return;
      const overlapFrom = s.date_range.from > range.from ? s.date_range.from : range.from;
      const overlapTo   = s.date_range.to   < range.to   ? s.date_range.to   : range.to;
      const overlapDays = _diffDays(overlapFrom, overlapTo) + 1;
      if (overlapDays <= 0) return;
      const sheetDays = _diffDays(s.date_range.from, s.date_range.to) + 1;
      const fraction = sheetDays > 0 ? Math.min(1, overlapDays / sheetDays) : 0;
      weekEstimate += (s.week_count || 0) * fraction;
    });
    const workoutEstimate = Math.round(weekEstimate * 5);

    const weeks = Math.ceil((days + 1) / 7);
    host.innerHTML = `
      <div class="csi-range-stats">
        <div><strong>${weeks}</strong> week${weeks === 1 ? "" : "s"} selected</div>
        <div>~<strong>${workoutEstimate || 0}</strong> workouts in range</div>
      </div>
      <div class="csi-range-note">Phase B will return the exact count when the parser ships.</div>`;
    if (continueBtn) continueBtn.disabled = false;
  }

  // ── Step 3 — review screen ─────────────────────────────────────────────

  // Per-workout / per-template / per-profile-item selection state.
  // Workouts + templates default to checked (the user actively chose to
  // import a coach plan). Profile items default to UNCHECKED per
  // Decision #13 — opt-in beta.
  let _workoutInclude = null;
  let _templateInclude = null;
  let _raceInclude = null;
  let _prInclude = null;
  // Per spec §C3 Trigger 1 — opt-in zones recalc after PR import.
  // Default off; user explicitly toggles in the review.
  let _zonesUpdateOnImport = false;

  async function _renderReviewPlaceholder() {
    if (!_lastImport) return;
    const subEl = $("csi-step-3-sub");
    if (subEl) {
      const r = _lastImport.dateRange || {};
      subEl.textContent = `From ${_lastImport.filename} · ${r.from || "?"} → ${r.to || "?"}`;
    }

    const host = $("csi-review");
    if (!host) return;

    // First time on step 3 (or any time selected sheets / date range
    // changed) refetch the parse stub WITHOUT metadata_only so the real
    // workouts come back. Cached on _lastImport.fullResponse so back/
    // forward navigation doesn't re-fetch unnecessarily.
    const cacheKey = JSON.stringify({
      sheets: _lastImport.selectedSheets,
      range: _lastImport.dateRange,
    });
    if (!_lastImport.fullResponse || _lastImport._fullCacheKey !== cacheKey) {
      // Estimate workouts in range so the loading copy carries real
      // signal — same overlap×5/week math as _renderRangePreview.
      const _estWorkouts = (() => {
        try {
          const sheets = _lastImport.response?.sheets || [];
          const sel = new Set(_lastImport.selectedSheets || []);
          const range = _lastImport.dateRange || {};
          if (!range.from || !range.to) return 0;
          let weeks = 0;
          sheets.forEach(s => {
            if (!sel.has(s.name) || s.role !== "calendar" || !s.date_range) return;
            const overlapFrom = s.date_range.from > range.from ? s.date_range.from : range.from;
            const overlapTo   = s.date_range.to   < range.to   ? s.date_range.to   : range.to;
            const overlapDays = _diffDays(overlapFrom, overlapTo) + 1;
            if (overlapDays <= 0) return;
            const sheetDays = _diffDays(s.date_range.from, s.date_range.to) + 1;
            const fraction = sheetDays > 0 ? Math.min(1, overlapDays / sheetDays) : 0;
            weeks += (s.week_count || 0) * fraction;
          });
          return Math.round(weeks * 5);
        } catch { return 0; }
      })();
      const _loadingLabel = _estWorkouts > 0
        ? `Analyzing ~${_estWorkouts} workouts… this can take 30–60 seconds.`
        : `Analyzing your plan… this can take 30–60 seconds.`;
      host.innerHTML = `<div class="csi-review-loading">
        <div>${_loadingLabel}</div>
        <div class="csi-review-loading-sub">Running the LLM normalizer batch-by-batch.</div>
      </div>`;

      const supa = window.supabaseClient;
      if (supa) {
        // Hard 2-minute client-side cap so a stuck edge function or
        // upstream Anthropic hiccup doesn't leave the user staring at
        // the spinner forever. Surfaces a Retry button on timeout.
        const PARSE_TIMEOUT_MS = 120_000;
        try {
          const invokePromise = supa.functions.invoke(
            "coach-sheet-import-parse",
            {
              body: {
                storage_path: _lastImport.storagePath,
                import_id: _lastImport.importId,
                filename: _lastImport.filename,
                file_size_bytes: _lastImport.fileSize,
                selected_sheets: _lastImport.selectedSheets,
                date_range: _lastImport.dateRange,
                metadata_only: false,
              },
            },
          );
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("parse_timeout")), PARSE_TIMEOUT_MS));
          const { data, error } = await Promise.race([invokePromise, timeoutPromise]);
          if (error || data?.status === "error") {
            const msg = error?.message || data?.message || "Couldn't load plan details.";
            host.innerHTML = `<div class="csi-review-error">
              <div>${_esc(msg)}</div>
              <button type="button" class="btn-secondary csi-review-retry" onclick="window.CoachSheetImport && window.CoachSheetImport._retryReview && window.CoachSheetImport._retryReview()">Retry</button>
            </div>`;
            return;
          }
          _lastImport.fullResponse = data;
          _lastImport._fullCacheKey = cacheKey;
          _workoutInclude = (data.running_workouts || []).map(() => true);
          _templateInclude = (data.strength_templates || []).map(() => true);
          _raceInclude = ((data.athlete_profile?.races) || []).map(() => false);
          _prInclude   = ((data.athlete_profile?.prs)   || []).map(() => false);
        } catch (e) {
          const isTimeout = e && e.message === "parse_timeout";
          const msg = isTimeout
            ? "This is taking longer than expected. The plan may still process in the background — try again in a moment."
            : (e?.message || "Couldn't load plan details.");
          host.innerHTML = `<div class="csi-review-error">
            <div>${_esc(msg)}</div>
            <button type="button" class="btn-secondary csi-review-retry" onclick="window.CoachSheetImport && window.CoachSheetImport._retryReview && window.CoachSheetImport._retryReview()">Retry</button>
          </div>`;
          return;
        }
      }
    }

    const resp = _lastImport.fullResponse || {};
    const workouts = Array.isArray(resp.running_workouts) ? resp.running_workouts : [];
    const templates = Array.isArray(resp.strength_templates) ? resp.strength_templates : [];
    const profile = resp.athlete_profile || null;
    const profileRaceCount = profile?.races?.length || 0;
    const profilePrCount   = profile?.prs?.length   || 0;
    const warns = Array.isArray(resp.warnings) ? resp.warnings : [];

    if (!workouts.length && !templates.length) {
      host.innerHTML = `<div class="csi-review-empty">No workouts found in the selected range. Try a wider range or different sheets.</div>`;
      _updateImportButton(0, 0);
      return;
    }

    let html = `<div class="csi-review-summary">
      <strong>${workouts.length}</strong> workout${workouts.length === 1 ? "" : "s"} ·
      <strong>${templates.length}</strong> strength template${templates.length === 1 ? "" : "s"}
      ${profileRaceCount + profilePrCount > 0 ? `· profile data found (${profileRaceCount} race${profileRaceCount === 1 ? "" : "s"}, ${profilePrCount} PR${profilePrCount === 1 ? "" : "s"})` : ""}
    </div>`;

    if (warns.length) {
      html += `<div class="csi-review-warnings">${warns.map(w => `<div class="csi-review-warning">${_esc(w)}</div>`).join("")}</div>`;
    }

    if (workouts.length) {
      html += `<div class="csi-review-section-label">Running calendar</div>`;
      html += `<div class="csi-review-list">${workouts.map((w, i) => _renderWorkoutRow(w, i)).join("")}</div>`;
    }

    if (templates.length) {
      html += `<div class="csi-review-section-label">Strength templates</div>`;
      html += `<div class="csi-review-grid">${templates.map((t, i) => _renderTemplateCard(t, i)).join("")}</div>`;
    }

    if (profile && (profileRaceCount || profilePrCount)) {
      html += `<div class="csi-review-section-label">Athlete profile <span class="csi-beta-tag">beta</span></div>`;
      html += `<div class="csi-profile-note">Detected races and PRs from the Resources sheet. Per-item checkboxes default off — opt in to add to your race calendar / PR list.</div>`;
      // "Update zones" toggle — only meaningful when at least one PR
      // is being imported. Renders below the profile cards. Wiring
      // happens in the change handler block further down.
      if (profilePrCount) {
        const zonesChecked = _zonesUpdateOnImport === true;
        html += `<label class="csi-zones-toggle">
          <input type="checkbox" id="csi-zones-update" ${zonesChecked ? "checked" : ""} />
          <div class="csi-zones-toggle-meta">
            <div class="csi-zones-toggle-name">Update my training zones from these PRs</div>
            <div class="csi-zones-toggle-sub">Recalculates Z1–Z6 paces using the Jack Daniels VDOT formula. We'll show you the new zones before saving.</div>
          </div>
        </label>`;
      }
      html += `<div class="csi-profile-grid">`;
      (profile.races || []).forEach((r, i) => {
        const checked = _raceInclude[i] === true;
        html += `<label class="csi-profile-card">
          <input type="checkbox" data-csi-race="${i}" ${checked ? "checked" : ""} />
          <div class="csi-profile-card-meta">
            <div class="csi-profile-card-name">${_esc(r.name || "Race")}</div>
            <div class="csi-profile-card-sub">${_esc(r.distance || "")}${r.date ? ` · ${_esc(r.date)}` : ""}${r.priority ? ` · ${_esc(r.priority)}` : ""}</div>
          </div>
        </label>`;
      });
      (profile.prs || []).forEach((p, i) => {
        const checked = _prInclude[i] === true;
        html += `<label class="csi-profile-card">
          <input type="checkbox" data-csi-pr="${i}" ${checked ? "checked" : ""} />
          <div class="csi-profile-card-meta">
            <div class="csi-profile-card-name">${_esc(p.distance || "PR")}: ${_esc(p.time || "")}</div>
            <div class="csi-profile-card-sub">${_esc(p.race || "")}${p.pace_per_mi ? ` · ${_esc(p.pace_per_mi)}/mi` : ""}${p.date ? ` · ${_esc(p.date)}` : ""}</div>
          </div>
        </label>`;
      });
      html += `</div>`;
    }

    host.innerHTML = html;

    host.querySelectorAll('input[type="checkbox"][data-csi-workout]').forEach(cb => {
      cb.addEventListener("change", () => {
        const idx = parseInt(cb.getAttribute("data-csi-workout"), 10);
        if (Number.isFinite(idx)) _workoutInclude[idx] = cb.checked;
        _refreshImportButton();
      });
    });
    host.querySelectorAll('input[type="checkbox"][data-csi-template]').forEach(cb => {
      cb.addEventListener("change", () => {
        const idx = parseInt(cb.getAttribute("data-csi-template"), 10);
        if (Number.isFinite(idx)) _templateInclude[idx] = cb.checked;
        _refreshImportButton();
      });
    });
    host.querySelectorAll('input[type="checkbox"][data-csi-race]').forEach(cb => {
      cb.addEventListener("change", () => {
        const idx = parseInt(cb.getAttribute("data-csi-race"), 10);
        if (Number.isFinite(idx)) _raceInclude[idx] = cb.checked;
        _refreshImportButton();
      });
    });
    host.querySelectorAll('input[type="checkbox"][data-csi-pr]').forEach(cb => {
      cb.addEventListener("change", () => {
        const idx = parseInt(cb.getAttribute("data-csi-pr"), 10);
        if (Number.isFinite(idx)) _prInclude[idx] = cb.checked;
        _refreshImportButton();
      });
    });
    const zonesToggleEl = $("csi-zones-update");
    if (zonesToggleEl) {
      zonesToggleEl.addEventListener("change", () => {
        _zonesUpdateOnImport = zonesToggleEl.checked;
      });
    }
    host.querySelectorAll('[data-csi-source-toggle]').forEach(btn => {
      btn.addEventListener("click", () => {
        const idx = btn.getAttribute("data-csi-source-toggle");
        const detail = host.querySelector(`[data-csi-source-detail="${idx}"]`);
        if (!detail) return;
        const willOpen = detail.hasAttribute("hidden");
        if (willOpen) detail.removeAttribute("hidden");
        else detail.setAttribute("hidden", "");
        btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
      });
    });

    _refreshImportButton();
  }

  function _countSelected(arr) {
    if (!Array.isArray(arr)) return 0;
    return arr.reduce((n, v) => n + (v ? 1 : 0), 0);
  }

  // Wrapper that re-reads the four include arrays. Use this from
  // change handlers so we don't have to thread counts through call
  // sites whenever a new include category gets added.
  function _refreshImportButton() {
    _updateImportButton(
      _countSelected(_workoutInclude),
      _countSelected(_templateInclude),
      _countSelected(_raceInclude),
      _countSelected(_prInclude),
    );
  }

  function _updateImportButton(workoutCount, templateCount, raceCount, prCount) {
    const btn = $("csi-step-3-import");
    if (!btn) return;
    raceCount = raceCount || 0;
    prCount   = prCount   || 0;
    const total = workoutCount + templateCount + raceCount + prCount;
    btn.disabled = total === 0;
    if (!total) {
      btn.textContent = "Import all";
      return;
    }
    const parts = [];
    if (workoutCount) parts.push(`${workoutCount} workout${workoutCount === 1 ? "" : "s"}`);
    if (templateCount) parts.push(`${templateCount} template${templateCount === 1 ? "" : "s"}`);
    if (raceCount) parts.push(`${raceCount} race${raceCount === 1 ? "" : "s"}`);
    if (prCount)   parts.push(`${prCount} PR${prCount === 1 ? "" : "s"}`);
    btn.textContent = `Import all (${parts.join(" · ")})`;
  }

  const _DAY_TYPE_BADGE = {
    easy_run:     { cls: "csi-badge--easy",  label: "Easy" },
    hard_workout: { cls: "csi-badge--hard",  label: "Hard" },
    long_run:     { cls: "csi-badge--long",  label: "Long" },
    rest:         { cls: "csi-badge--rest",  label: "Rest" },
    unknown:      { cls: "csi-badge--rest",  label: "—"    },
  };

  function _renderWorkoutRow(w, idx) {
    const checked = _workoutInclude[idx] !== false;
    const badge = _DAY_TYPE_BADGE[w.day_type] || _DAY_TYPE_BADGE.unknown;
    const summary = _structureSummary(w);
    const pace = _firstPace(w.structure);
    const dow = w.day_of_week || "";
    const conflictCount = _countConflictsOnDate(w.date);
    const conflictBadge = conflictCount > 0
      ? `<span class="csi-conflict-badge" title="${conflictCount} existing item${conflictCount === 1 ? "" : "s"} on this date — both will appear on the calendar">+${conflictCount} existing</span>`
      : "";
    return `
      <div class="csi-workout-row">
        <input type="checkbox" data-csi-workout="${idx}" ${checked ? "checked" : ""} aria-label="Include workout" />
        <div class="csi-workout-meta">
          <div class="csi-workout-line1">
            <span class="csi-workout-date">${_esc(w.date)}${dow ? ` · ${_esc(dow)}` : ""}</span>
            <span class="csi-badge ${badge.cls}">${badge.label}</span>
            ${w.total_distance_mi ? `<span class="csi-workout-distance">${_esc(String(w.total_distance_mi))} mi</span>` : ""}
            ${conflictBadge}
          </div>
          <div class="csi-workout-line2">${_esc(summary || "—")}${pace ? ` · pace ${_esc(pace)}` : ""}</div>
          ${w.raw_description ? `
            <button type="button" class="csi-source-toggle" data-csi-source-toggle="${idx}" aria-expanded="false">View source</button>
            <div class="csi-source-detail" data-csi-source-detail="${idx}" hidden>${_esc(w.raw_description)}</div>
          ` : ""}
        </div>
      </div>`;
  }

  // Conflict detection — scan local workouts + scheduled sessions for
  // anything already on this date. The calendar already supports
  // multi-session days (Decision #8), so we don't block import — just
  // flag so the user knows what'll appear alongside.
  function _countConflictsOnDate(dateStr) {
    if (!dateStr) return 0;
    let n = 0;
    try {
      const ws = JSON.parse(localStorage.getItem("workouts") || "[]");
      n += ws.filter(w => w.date === dateStr && !w.fromImport).length;
    } catch {}
    try {
      const ss = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
      // Skip our own previously-imported entries — re-importing onto a
      // date already covered by an earlier import isn't a "conflict",
      // it's the user extending the same coach plan.
      n += ss.filter(s => s.date === dateStr && !s.fromImport).length;
    } catch {}
    return n;
  }

  function _renderTemplateCard(t, idx) {
    const checked = _templateInclude[idx] !== false;
    const exCount = (t.exercises || []).length;
    const preview = (t.exercises || []).slice(0, 3).map(e => _esc(e.name)).join("<br>");
    return `
      <label class="csi-template-card">
        <input type="checkbox" data-csi-template="${idx}" ${checked ? "checked" : ""} />
        <div class="csi-template-meta">
          <div class="csi-template-name">${_esc(t.library_name)}</div>
          <div class="csi-template-count">${exCount} exercise${exCount === 1 ? "" : "s"}</div>
          ${preview ? `<div class="csi-template-preview">${preview}${exCount > 3 ? "<br>…" : ""}</div>` : ""}
        </div>
      </label>`;
  }

  function _structureSummary(w) {
    const struct = Array.isArray(w.structure) ? w.structure : [];
    if (!struct.length) return w.day_type === "rest" ? "Rest day" : "";
    return struct.map(s => {
      const dist = s.distance_mi != null ? `${s.distance_mi}mi` : "";
      const phase = ({ warmup: "WU", main: "Main", cooldown: "CD" })[s.phase] || s.phase || "";
      return `${phase} ${dist}`.trim();
    }).join(" · ");
  }

  function _firstPace(structure) {
    const arr = Array.isArray(structure) ? structure : [];
    for (const s of arr) {
      if (s.target_pace_per_mi) return s.target_pace_per_mi;
    }
    return null;
  }

  // ── Atomic import ──────────────────────────────────────────────────────────
  //
  // Per spec §C2, all writes succeed or all fail. Slice 3's
  // implementation:
  //   1. Confirm dialog
  //   2. Insert each selected workout into localStorage `workouts` with
  //      import metadata; DB.syncWorkouts() pushes to Supabase via the
  //      same path native workouts use (Decision #11 — same shape, same
  //      editor downstream).
  //   3. Insert each selected template via SavedWorkoutsLibrary.saveCustom
  //      so it lands in the user's saved library identically to a
  //      manually-built custom workout.
  //   4. Call coach-sheet-import-commit edge function — increments
  //      monthly quota, flips the log row to status='success'.
  //   5. Toast on success; reset modal to step 0.
  //
  // Phase B can move steps 2–4 into a single SECURITY DEFINER function
  // for true atomicity once the parser ships.

  async function _commitImport() {
    if (!_lastImport?.fullResponse) return;
    const resp = _lastImport.fullResponse;
    const workouts = (resp.running_workouts || []).filter((_, i) => _workoutInclude[i] !== false);
    const templates = (resp.strength_templates || []).filter((_, i) => _templateInclude[i] !== false);

    const profile = resp.athlete_profile || null;
    const races = (profile?.races || []).filter((_, i) => _raceInclude?.[i] === true);
    const prs   = (profile?.prs   || []).filter((_, i) => _prInclude?.[i]   === true);

    if (!workouts.length && !templates.length && !races.length && !prs.length) {
      _csiToast("Nothing selected to import.", "error");
      return;
    }

    const profileFragment = (races.length || prs.length)
      ? ` (plus ${races.length} race${races.length === 1 ? "" : "s"} and ${prs.length} PR${prs.length === 1 ? "" : "s"} into your profile)`
      : "";
    const ok = window.confirm(
      `Import ${workouts.length} workout${workouts.length === 1 ? "" : "s"} and ${templates.length} strength template${templates.length === 1 ? "" : "s"}${profileFragment}? You can edit any of them after import.`,
    );
    if (!ok) return;

    const importBtn = $("csi-step-3-import");
    if (importBtn) {
      importBtn.disabled = true;
      const totalCount = workouts.length + templates.length;
      importBtn.textContent = totalCount > 0 ? `Importing ${totalCount}…` : "Importing…";
    }

    // Plan name (optional, user-supplied) + planId. The planId
    // groups every session in this import into one Active Training
    // Inputs card. Falling back to the filename-derived label when
    // empty; "Coach plan" if even that's missing.
    const planNameInput = $("csi-plan-name");
    const planName = (planNameInput?.value || "").trim()
      || (_lastImport.filename ? _lastImport.filename.replace(/\.[^.]+$/, "").replace(/[_\-]+/g, " ") : "")
      || "Coach plan";
    const planId = `coach-sheet-${_lastImport.importId}`;

    let workoutsInserted = 0;
    let templatesInserted = 0;
    const insertedWorkoutIds = [];
    const insertedTemplateIds = [];
    try {
      // Workouts → localStorage `workoutSchedule` array. This is the
      // bucket native plan generators (Build Plan, Custom Plan) write
      // to, so our entries inherit the same calendar treatment + flow
      // through Active Training Inputs grouping by planId. Per
      // Decision #11: imports look identical to native schedule
      // entries downstream — no `if (entry.fromImport)` branches in
      // the planner / calendar surfaces.
      let local = [];
      try { local = JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch {}
      for (const w of workouts) {
        const shaped = _shapeImportedWorkoutForSchedule(w, _lastImport.importId, planId, planName);
        local.push(shaped);
        insertedWorkoutIds.push(shaped.id);
        workoutsInserted++;
      }
      if (workouts.length) {
        localStorage.setItem("workoutSchedule", JSON.stringify(local));
        if (typeof DB !== "undefined" && DB.syncSchedule) DB.syncSchedule();
      }

      // Templates → saved workouts library. saveCustom returns the
      // saved row (with its generated id) so undo can call
      // SavedWorkoutsLibrary.removeSaved cleanly.
      if (templates.length && window.SavedWorkoutsLibrary && window.SavedWorkoutsLibrary.saveCustom) {
        for (const t of templates) {
          const exercises = (t.exercises || []).map(e => ({
            name: e.name,
            sets: e.sets,
            reps: e.reps,
            weight: e.weight,
          }));
          const savedRow = await window.SavedWorkoutsLibrary.saveCustom({
            name: t.library_name,
            workout_kind: "weightlifting",
            exercises,
            notes: `Imported from ${_lastImport.filename} (${_lastImport.importId})`,
          });
          if (savedRow && savedRow.id) insertedTemplateIds.push(savedRow.id);
          templatesInserted++;
        }
      }

      // Commit — increments quota + flips log to success. Local
      // writes have already happened, so a hung commit shouldn't
      // block the user. 30s race timeout + soft-warning on failure
      // means the toast and step reset land regardless.
      const supa = window.supabaseClient;
      if (supa) {
        const COMMIT_TIMEOUT_MS = 30_000;
        try {
          const invokePromise = supa.functions.invoke("coach-sheet-import-commit", {
            body: {
              import_id: _lastImport.importId,
              workouts_inserted: workoutsInserted,
              templates_inserted: templatesInserted,
              selected_sheets: _lastImport.selectedSheets,
              date_range: _lastImport.dateRange,
            },
          });
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("commit_timeout")), COMMIT_TIMEOUT_MS));
          const { data, error } = await Promise.race([invokePromise, timeoutPromise]);
          if (error || data?.status === "error") {
            const msg = error?.message || data?.message || "Commit failed.";
            console.warn("[CoachSheetImport] commit error", error || data);
            // Local writes already happened — partial-success warning.
            _csiToast(`Imported but commit hit an issue: ${msg}`, "error");
            _resetToStep0();
            _setStaged(null);
            return;
          }
          console.log("[CoachSheetImport] commit OK:", data);
        } catch (commitErr) {
          // Timeout or thrown — local data is safe, just warn.
          console.warn("[CoachSheetImport] commit timed out / threw:", commitErr);
          _csiToast(`Imported. Server-side log update is taking longer than usual; your workouts are saved.`, "info");
          _resetToStep0();
          _setStaged(null);
          return;
        }
      }

      // Refresh surfaces that read `workouts`.
      try {
        if (typeof renderCalendar === "function") renderCalendar();
        if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
          renderDayDetail(selectedDate);
        }
        if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();
        if (typeof renderStats === "function") renderStats();
      } catch (e) { console.warn("[CoachSheetImport] post-import render error", e); }

      // Profile writes — opt-in beta per Decision #13. Each checked
      // race lands in localStorage `events` (the race calendar) and
      // each checked PR keys into `personalRecords`. Both sync via
      // existing DB helpers. We capture the inserted IDs / keys so
      // undo can reverse cleanly.
      const insertedRaceIds = [];
      const insertedPrKeys = [];

      if (races.length) {
        let ev = [];
        try { ev = JSON.parse(localStorage.getItem("events") || "[]"); } catch {}
        for (const r of races) {
          const shaped = _shapeImportedRace(r, _lastImport.importId);
          if (!shaped) continue;
          ev.push(shaped);
          insertedRaceIds.push(shaped.id);
        }
        localStorage.setItem("events", JSON.stringify(ev));
        if (typeof DB !== "undefined" && DB.syncEvents) DB.syncEvents();
      }

      if (prs.length) {
        let pr = {};
        try { pr = JSON.parse(localStorage.getItem("personalRecords") || "{}"); } catch {}
        for (const p of prs) {
          const key = _normalizePRDistance(p.distance);
          if (!key) continue;
          // Don't blindly clobber an existing PR if it's faster than
          // ours — _comparePRTimes compares HH:MM:SS / MM:SS strings
          // and returns true if the new time is faster (or no
          // existing PR).
          if (_isFasterPR(p.time, pr[key]?.time)) {
            pr[key] = {
              time: p.time,
              date: _normalizePRDate(p.date) || (typeof getTodayString === "function" ? getTodayString() : new Date().toISOString().slice(0, 10)),
              importId: _lastImport.importId,
            };
            insertedPrKeys.push(key);
          }
        }
        localStorage.setItem("personalRecords", JSON.stringify(pr));
        if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("personalRecords");
      }

      // Persist a commit summary so the undo affordance survives a
      // page reload within the 1-hour window. UNDO_KEY is namespaced
      // so a future cross-session "Undo last import" entry point can
      // read it without re-deriving from logs.
      const commitSummary = {
        importId: _lastImport.importId,
        filename: _lastImport.filename,
        planId,
        planName,
        scheduleIds: insertedWorkoutIds,
        templateIds: insertedTemplateIds,
        raceIds: insertedRaceIds,
        prKeys: insertedPrKeys,
        workoutsInserted,
        templatesInserted,
        racesInserted: insertedRaceIds.length,
        prsInserted: insertedPrKeys.length,
        committedAt: Date.now(),
      };
      try { localStorage.setItem(UNDO_KEY, JSON.stringify(commitSummary)); } catch {}
      window.__coachSheetImportLastCommit = commitSummary;

      const profilePart = (commitSummary.racesInserted || commitSummary.prsInserted)
        ? `, ${commitSummary.racesInserted} race${commitSummary.racesInserted === 1 ? "" : "s"} + ${commitSummary.prsInserted} PR${commitSummary.prsInserted === 1 ? "" : "s"}`
        : "";
      const summaryText = `Imported "${planName}" — ${workoutsInserted} workout${workoutsInserted === 1 ? "" : "s"}` +
        (templatesInserted ? `, ${templatesInserted} template${templatesInserted === 1 ? "" : "s"}` : "") +
        profilePart + ".";
      _csiToastWithUndo(summaryText, commitSummary);
      _resetToStep0();
      _setStaged(null);

      // Spec §C1 Decision #11 — register the import as a structured
      // active plan via the existing storeGeneratedPlan() so it shows
      // up in feedback_loop, validator, and any future plan-aware
      // surface as a real plan with a known source. Keeps the
      // "Generate a plan" Build Plan nudge from suggesting itself
      // when the user already has a coach plan loaded. Synthesized
      // shape matches PLAN_OUTPUT_SCHEMA loosely — fields that don't
      // apply to a coach-imported plan (weekly_template,
      // progression_logic, nutrition_strategy) are null rather than
      // fabricated.
      if (typeof storeGeneratedPlan === "function") {
        try {
          const plan = _synthesizePlanFromImport(commitSummary, _lastImport.dateRange, workoutsInserted);
          // Fire-and-forget: storeGeneratedPlan awaits getSession + two
          // Supabase round-trips, all of which are unrelated to the
          // user-visible "import succeeded" outcome. Awaiting it added
          // 5–30s to the perceived import time. The local copy is
          // written synchronously inside storeGeneratedPlan, so the
          // active-plan badge updates immediately either way.
          storeGeneratedPlan(plan, "coach_sheet").catch(e => {
            console.warn("[CoachSheetImport] storeGeneratedPlan failed", e);
          });
        } catch (e) {
          console.warn("[CoachSheetImport] storeGeneratedPlan synth failed", e);
        }
      }

      // Spec §C3 Trigger 1 — zones recalc after PR import. Fires
      // AFTER the import toast + reset so the user sees the import
      // landed before the modal asks them to make another decision.
      // updateZonesFromPRs is the shared function that powers Trigger
      // 2 (post-race-completion) too.
      if (_zonesUpdateOnImport && insertedPrKeys.length) {
        // Re-read the saved PRs so we use what's actually in the
        // store (post-write, post-faster-PR comparison).
        let savedPRs = {};
        try { savedPRs = JSON.parse(localStorage.getItem("personalRecords") || "{}"); } catch {}
        const importedPRObjs = insertedPrKeys
          .map(k => ({ distance: k, ...(savedPRs[k] || {}) }))
          .filter(p => p.time);
        // Defer slightly so the import toast renders + the user gets
        // a beat before the next overlay appears.
        setTimeout(() => updateZonesFromPRs(importedPRObjs), 600);
      }
    } catch (e) {
      console.warn("[CoachSheetImport] commit threw", e);
      _csiToast(`Import failed: ${e?.message || "unknown error"}`, "error");
      if (importBtn) importBtn.disabled = false;
    } finally {
      _refreshImportButton();
    }
  }

  // Race-type normalization. Maps free-text distance from the
  // Resources sheet ("Marathon", "Half", "10K") to the IronZ taxonomy
  // expected by the race-form / generator. Falls through to "general"
  // for unrecognized inputs so the race still appears on the calendar.
  function _normalizeRaceType(distance) {
    const d = String(distance || "").toLowerCase().trim();
    if (!d) return null;
    if (d.includes("ironman") && !d.includes("half")) return "ironman";
    if (d.includes("half ironman") || d.includes("70.3")) return "halfIronman";
    if (d.includes("olympic")) return "olympic";
    if (d.includes("sprint"))  return "sprint";
    if (d.startsWith("marathon") || d === "full" || d === "26.2") return "marathon";
    if (d.includes("half"))    return "halfMarathon";
    if (d === "10k" || d.includes("10 k")) return "tenK";
    if (d === "5k"  || d.includes("5 k"))  return "fiveK";
    return "general";
  }

  function _normalizeImportDate(dateStr) {
    if (!dateStr) return null;
    const trimmed = String(dateStr).trim();
    // Already ISO?
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    // M/D/YY or M/D/YYYY (Paige's source format).
    const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      let yr = parseInt(m[3], 10);
      if (yr < 100) yr += 2000;
      return `${yr}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
    }
    return null;
  }

  function _shapeImportedRace(r, importId) {
    const date = _normalizeImportDate(r.date);
    if (!date) return null; // can't put on calendar without a date
    const type = _normalizeRaceType(r.distance);
    const priorityRaw = String(r.priority || "").toUpperCase().trim();
    const priority = priorityRaw === "MAIN" ? "A"
                   : (priorityRaw === "A" || priorityRaw === "B" || priorityRaw === "C") ? priorityRaw
                   : "B"; // sensible default — not as load-bearing as Main, not skip-worthy
    return {
      id: `coach-race-${importId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: r.name || "Race",
      type,
      level: "intermediate",
      priority,
      date,
      longDay: "Saturday", // placeholder; user can edit
      ...(r.course_type ? { courseNotes: String(r.course_type) } : {}),
      fromImport: true,
      importId,
      createdAt: new Date().toISOString(),
    };
  }

  // PR distance normalization. The personalRecords store uses
  // lowercase keys ("marathon", "half", "10k", "5k", "mile").
  function _normalizePRDistance(distance) {
    const d = String(distance || "").toLowerCase().trim();
    if (!d) return null;
    if (d.startsWith("marathon")) return "marathon";
    if (d.includes("half"))       return "half";
    if (d === "10k" || d.includes("10 k")) return "10k";
    if (d === "5k"  || d.includes("5 k"))  return "5k";
    if (d.includes("mile"))       return "mile";
    return null;
  }

  function _normalizePRDate(d) {
    return _normalizeImportDate(d);
  }

  // Coarse comparison of two HH:MM:SS / MM:SS strings — returns true
  // if `candidate` is faster than `existing` (or if no existing).
  // Conservative: any unparseable input means we don't overwrite.
  function _toSeconds(t) {
    if (!t) return Infinity;
    const parts = String(t).trim().split(":").map(s => parseInt(s, 10));
    if (parts.some(n => !Number.isFinite(n))) return Infinity;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return Infinity;
  }
  function _isFasterPR(candidate, existing) {
    if (!existing) return true;
    return _toSeconds(candidate) < _toSeconds(existing);
  }

  function _shapeImportedWorkoutForSchedule(w, importId, planId, planName) {
    // Match the workoutSchedule entry shape produced by Custom Plan
    // (custom-plan.js:2067) so the Active Training Inputs grouping
    // logic in planner.js _getBuildPlanInputs picks it up. Per
    // Decision #11: imported workouts must look identical to native
    // schedule entries downstream — same `source` allowlist, same
    // `planId` grouping, same `planName` field.
    const dt = w.day_type;
    const dist = w.total_distance_mi;
    const dtLabel = ({
      easy_run: "Easy Run",
      hard_workout: "Hard Workout",
      long_run: "Long Run",
      rest: "Rest",
    })[dt] || "Run";
    const sessionName = dist ? `${dtLabel} · ${dist}mi` : dtLabel;
    const id = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `coach-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Map day_type to a `load` value that calendar / day-detail
    // rendering uses for the icon tint and ring color.
    const load = dt === "long_run" ? "long" : dt === "hard_workout" ? "hard" : "easy";

    return {
      id,
      date: w.date,
      type: "running",
      sessionName,
      source: "coach_sheet",
      planId,
      ...(planName ? { planName } : {}),
      level: "intermediate",
      discipline: "run",
      load,
      details: w.raw_description || "",
      // Import metadata — _shapeTrainingSession in db.js skips named
      // columns and stashes the rest in `data` jsonb, so all of these
      // round-trip cross-device.
      fromImport: true,
      importId,
      importDayType: dt,
      importStructure: w.structure || null,
      importTotalDistanceMi: dist,
      importSourceFile: w.source_file,
      importSourceSheet: w.source_sheet,
      importSourceCell: w.source_cell,
    };
  }

  // ── Active plan synthesis (spec §C1 / Decision #11) ──────────────────
  //
  // Builds a PLAN_OUTPUT_SCHEMA-shaped object from an import commit so
  // storeGeneratedPlan can register it as the user's active plan.
  // Fields that don't apply to a coach-distributed plan are null —
  // we don't fabricate weekly templates or progression logic the
  // coach didn't specify. The plan_metadata block carries enough
  // forensic data (importId, planId, planName, filename) for any
  // downstream reader to identify a coach-imported plan as such.
  function _synthesizePlanFromImport(commit, dateRange, workoutCount) {
    const range = dateRange || {};
    return {
      plan_metadata: {
        generation_source: "coach_sheet",
        plan_version: "1.0",
        plan_id: commit.planId,
        plan_name: commit.planName,
        import_id: commit.importId,
        filename: commit.filename || null,
        created_at: new Date(commit.committedAt || Date.now()).toISOString(),
        session_count: workoutCount || 0,
        template_count: commit.templatesInserted || 0,
        date_range: { from: range.from || null, to: range.to || null },
        philosophy_modules_used: [],
        module_versions: {},
        validation_flags: [],
      },
      athlete_summary: null,
      plan_structure: {
        type: "coach_imported",
        total_sessions: workoutCount || 0,
        date_range: { from: range.from || null, to: range.to || null },
      },
      weekly_template:    null,
      progression_logic:  null,
      nutrition_strategy: null,
      hydration_strategy: null,
      adaptation_rules:   null,
      watchouts:          [],
      rationale: `Imported from coach sheet "${commit.filename || "unknown"}" on ${new Date(commit.committedAt || Date.now()).toISOString().slice(0, 10)}.`,
      assumptions: [
        "Coach plan is the source of truth for sessions and pacing.",
        "Universal warmup / cooldown applied to all running workouts per coach intent.",
      ],
    };
  }

  // ── Zones recalc (spec §C3) ───────────────────────────────────────────
  //
  // Shared entry point used by:
  //   1. Post-import — fired in _commitImport when the user opted in
  //      via the "Update zones from these PRs" toggle.
  //   2. Post-race-completion (future slice) — when a logged race time
  //      beats an existing PR, the same modal offers itself.
  //
  // Picks the longest PR (best for endurance zone derivation per
  // Daniels), computes new zones using the existing
  // computeRunningZones(distMeters, totalSeconds) in app.js, and
  // shows a side-by-side current-vs-proposed modal. Save → writes via
  // saveTrainingZonesData("running", { vdot, zones, referenceDist,
  // referenceTime }).

  const PR_DISTANCE_METERS = {
    marathon: 42195,
    half: 21097.5,
    "10k": 10000,
    "5k": 5000,
    mile: 1609.344,
  };
  const PR_DISTANCE_LABEL = {
    marathon: "Marathon",
    half: "Half Marathon",
    "10k": "10K",
    "5k": "5K",
    mile: "Mile",
  };

  function updateZonesFromPRs(prs) {
    if (!Array.isArray(prs) || !prs.length) return;
    if (typeof computeRunningZones !== "function" || typeof saveTrainingZonesData !== "function") {
      console.warn("[CoachSheetImport] zones recalc unavailable — computeRunningZones/saveTrainingZonesData not loaded");
      return;
    }

    // Pick the longest PR with parseable time. Daniels tends to give
    // the cleanest zone derivation from longer races; for marathon
    // training the marathon time itself is the natural anchor.
    const candidates = prs
      .map(p => {
        const meters = PR_DISTANCE_METERS[p.distance];
        const seconds = _toSeconds(p.time);
        if (!meters || !Number.isFinite(seconds) || seconds === Infinity) return null;
        return { distance: p.distance, meters, seconds, time: p.time };
      })
      .filter(Boolean)
      .sort((a, b) => b.meters - a.meters);
    if (!candidates.length) return;

    const best = candidates[0];
    const proposed = computeRunningZones(best.meters, best.seconds);
    if (!proposed?.zones) return;

    let current = null;
    try { current = (typeof loadTrainingZones === "function") ? loadTrainingZones("running") : null; } catch {}

    _showZonesModal({
      anchorPR: best,
      current,
      proposed,
      onSave: () => {
        const refLabel = PR_DISTANCE_LABEL[best.distance] || best.distance;
        saveTrainingZonesData("running", {
          referenceDist: refLabel,
          referenceTime: best.time,
          vdot: proposed.vdot,
          zones: proposed.zones,
        });
        // Refresh any zones panel that's currently rendered.
        try {
          if (typeof renderZones === "function") renderZones();
        } catch {}
        _csiToast(`Zones updated — VDOT ${proposed.vdot}.`, "success");
      },
    });
  }

  // ── Spec §C3 Trigger 2 — post-race-completion PR check ──────────────
  //
  // Called from finalizeWorkoutCompletion after any workout commit.
  // Heuristic — only trigger when the workout looks like a race (name
  // matches a known race-distance keyword + has a duration/time). If
  // the recorded time beats the existing PR for that distance, save
  // the new PR and offer the same updateZonesFromPRs modal as the
  // post-import flow. Conservative on ambiguous inputs to avoid
  // spurious "you set a PR!" notifications on training runs that
  // happen to have "marathon" in the name.

  function _detectRaceDistance(workout) {
    const name = String(workout?.name || "").toLowerCase();
    const type = String(workout?.type || "").toLowerCase();
    // Need a race signal — explicit type or "race" in the name. We
    // do NOT trigger on long runs that happen to be 26.2mi without
    // race intent.
    const isRace = type === "race" || /\brace\b|\bpr\b/.test(name);
    if (!isRace) return null;
    if (name.includes("marathon") && !name.includes("half")) return "marathon";
    if (name.includes("half"))    return "half";
    if (name.match(/\b10\s*k\b/)) return "10k";
    if (name.match(/\b5\s*k\b/))  return "5k";
    if (name.match(/\bmile\b/))   return "mile";
    return null;
  }

  function _formatDurationToHMS(durationMin) {
    const totalSec = Math.round(parseFloat(durationMin) * 60);
    if (!Number.isFinite(totalSec) || totalSec <= 0) return null;
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function checkRacePRImprovement(workout) {
    if (!workout) return;
    const distance = _detectRaceDistance(workout);
    if (!distance) return;
    const time = _formatDurationToHMS(workout.duration);
    if (!time) return;

    let prs = {};
    try { prs = JSON.parse(localStorage.getItem("personalRecords") || "{}"); } catch {}
    const existing = prs[distance]?.time;
    if (!_isFasterPR(time, existing)) return;

    // Save the PR. Stamp date from the workout if present, else today.
    const today = (typeof getTodayString === "function") ? getTodayString() : new Date().toISOString().slice(0, 10);
    prs[distance] = {
      time,
      date: workout.date || today,
      // No importId — this PR came from a logged race, not an import.
      // The undo path uses importId === commit.importId to guard
      // deletion, so a manually-set PR is safe from import undo.
    };
    localStorage.setItem("personalRecords", JSON.stringify(prs));
    if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("personalRecords");

    // Offer the same zones-recalc modal the post-import flow uses.
    // Defer slightly so the workout-complete UI (rating modal,
    // stretch suggestion, level-up) gets to fire first.
    setTimeout(() => {
      try { updateZonesFromPRs([{ distance, time }]); } catch {}
    }, 1200);

    // Surface the PR moment with a simple toast — the modal handles
    // the "what about your zones" decision separately.
    _csiToast(`New PR — ${PR_DISTANCE_LABEL[distance] || distance}: ${time}!`, "success");
  }

  function _showZonesModal(opts) {
    const { anchorPR, current, proposed, onSave } = opts;
    const existing = document.getElementById("csi-zones-modal");
    if (existing) try { existing.remove(); } catch {}

    const refLabel = PR_DISTANCE_LABEL[anchorPR.distance] || anchorPR.distance;
    const currentVdot = current?.vdot ?? null;
    const proposedVdot = proposed.vdot;
    const vdotDelta = currentVdot != null ? (proposedVdot - currentVdot).toFixed(1) : null;

    // Zone keys we render. Z6 may not exist on older saved zones —
    // fall back to "—" for that row in the current column.
    const zoneKeys = ["z1", "z2", "z3", "z4", "z5", "z6"];
    const zoneRow = (key) => {
      const cur = current?.zones?.[key]?.paceRange || "—";
      const prop = proposed.zones?.[key]?.paceRange || "—";
      const changed = cur !== prop && cur !== "—";
      return `<tr${changed ? ` class="csi-zones-row-changed"` : ""}>
        <td class="csi-zones-cell-label">${key.toUpperCase()}</td>
        <td class="csi-zones-cell-current">${_esc(cur)}</td>
        <td class="csi-zones-cell-proposed">${_esc(prop)}</td>
      </tr>`;
    };

    const overlay = document.createElement("div");
    overlay.id = "csi-zones-modal";
    overlay.className = "csi-zones-overlay";
    overlay.innerHTML = `
      <div class="csi-zones-modal" role="dialog" aria-modal="true" aria-labelledby="csi-zones-title">
        <div class="csi-zones-header">
          <div class="csi-zones-title" id="csi-zones-title">Update training zones?</div>
          <div class="csi-zones-sub">Based on ${_esc(refLabel)}: ${_esc(anchorPR.time)}</div>
        </div>
        <div class="csi-zones-vdot">
          ${currentVdot != null
            ? `<span class="csi-zones-vdot-current">VDOT ${currentVdot}</span> <span class="csi-zones-vdot-arrow">→</span> <span class="csi-zones-vdot-proposed">${proposedVdot}</span>${vdotDelta != null ? ` <span class="csi-zones-vdot-delta">(${vdotDelta > 0 ? "+" : ""}${vdotDelta})</span>` : ""}`
            : `<span class="csi-zones-vdot-proposed">VDOT ${proposedVdot}</span>`}
        </div>
        <table class="csi-zones-table">
          <thead><tr><th>Zone</th><th>Current</th><th>Proposed</th></tr></thead>
          <tbody>${zoneKeys.map(zoneRow).join("")}</tbody>
        </table>
        <div class="csi-zones-actions">
          <button type="button" class="btn-secondary" id="csi-zones-keep">Keep current</button>
          <button type="button" class="btn-primary"   id="csi-zones-save">Save new zones</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => { try { overlay.remove(); } catch {} };
    overlay.querySelector("#csi-zones-keep").addEventListener("click", close);
    overlay.querySelector("#csi-zones-save").addEventListener("click", () => {
      try { onSave(); } catch (e) { console.warn("[CoachSheetImport] zones save failed", e); }
      close();
    });
    // Click-outside dismiss.
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  }

  function _csiToast(message, kind) {
    // Reuse the shared `.ironz-toast` styling from app.js; tint via an
    // extra class so error/success read distinctly.
    const existing = document.getElementById("ironz-toast");
    if (existing) existing.remove();
    const t = document.createElement("div");
    t.id = "ironz-toast";
    t.className = `ironz-toast ironz-toast--${kind || "info"}`;
    t.textContent = message;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("visible"));
    setTimeout(() => {
      t.classList.remove("visible");
      setTimeout(() => { try { t.remove(); } catch {} }, 220);
    }, 3500);
  }

  // Success toast with an undo affordance. Stays visible ~10s so the
  // user has time to react. After dismissal the import is still
  // undoable via the persisted UNDO_KEY for up to 1 hour (Slice 2 of
  // Phase C will surface that as an entry-point on the import modal).
  function _csiToastWithUndo(message, commit) {
    const existing = document.getElementById("ironz-toast");
    if (existing) existing.remove();
    const t = document.createElement("div");
    t.id = "ironz-toast";
    t.className = "ironz-toast ironz-toast--success ironz-toast--with-action";
    t.innerHTML = `
      <span class="ironz-toast-text">${_esc(message)}</span>
      <button type="button" class="ironz-toast-action" data-action="undo">Undo</button>
    `;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("visible"));

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      t.classList.remove("visible");
      setTimeout(() => { try { t.remove(); } catch {} }, 220);
    };

    const undoBtn = t.querySelector('[data-action="undo"]');
    if (undoBtn) {
      undoBtn.addEventListener("click", async () => {
        dismiss();
        await _undoImport(commit);
      });
    }

    setTimeout(dismiss, 10000);
  }

  // Undo handler. Deletes every workout + template that was inserted by
  // this import_id, both locally and from Supabase. Doesn't decrement
  // the monthly quota — operationally simpler, and the user did
  // consume a parse pass; an undo is "I changed my mind about
  // committing", not "this never happened".
  async function _undoImport(commit) {
    if (!commit) {
      try { commit = JSON.parse(localStorage.getItem(UNDO_KEY) || "null"); } catch {}
    }
    if (!commit) {
      _csiToast("Nothing to undo.", "error");
      return;
    }
    const ageMs = Date.now() - (commit.committedAt || 0);
    if (ageMs > UNDO_WINDOW_MS) {
      _csiToast("This import is too old to undo (over 1 hour).", "error");
      return;
    }

    // Backwards-compat: older commits used `workoutIds` for what's
    // now `scheduleIds` (Phase C Slice 2 moved imports from the
    // `workouts` bucket to `workoutSchedule`). Read whichever exists.
    const scheduleIds = commit.scheduleIds || commit.workoutIds || [];
    const workoutCount = scheduleIds.length;
    const templateCount = (commit.templateIds || []).length;
    const raceCount = (commit.raceIds || []).length;
    const prCount   = (commit.prKeys  || []).length;
    const undoParts = [];
    if (workoutCount) undoParts.push(`${workoutCount} workout${workoutCount === 1 ? "" : "s"}`);
    if (templateCount) undoParts.push(`${templateCount} template${templateCount === 1 ? "" : "s"}`);
    if (raceCount) undoParts.push(`${raceCount} race${raceCount === 1 ? "" : "s"}`);
    if (prCount)   undoParts.push(`${prCount} PR${prCount === 1 ? "" : "s"}`);
    const ok = window.confirm(
      `Undo will remove "${commit.planName || "this import"}" — ${undoParts.join(", ")}. Continue?`,
    );
    if (!ok) return;

    _csiToast("Undoing import…", "info");

    // Remove from localStorage `workoutSchedule`. Use the captured
    // schedule ids so we don't accidentally clobber any concurrent
    // edits the user made on other plans/sessions.
    try {
      const sched = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
      const idsToRemove = new Set(scheduleIds);
      const remaining = sched.filter(s => !idsToRemove.has(s.id));
      localStorage.setItem("workoutSchedule", JSON.stringify(remaining));
      if (typeof DB !== "undefined" && DB.syncSchedule) DB.syncSchedule();
    } catch (e) {
      console.warn("[CoachSheetImport] undo: local schedule cleanup failed", e);
    }

    // Remove from Supabase training_sessions by id (RLS scopes to user).
    if (window.supabaseClient && scheduleIds.length) {
      try {
        const { error } = await window.supabaseClient
          .from("training_sessions")
          .delete()
          .in("id", scheduleIds);
        if (error) console.warn("[CoachSheetImport] undo: Supabase training_sessions delete error", error);
      } catch (e) {
        console.warn("[CoachSheetImport] undo: Supabase training_sessions delete threw", e);
      }
    }

    // Remove templates via the saved-workouts library API (handles
    // local + Supabase + tombstone in one shot).
    if (window.SavedWorkoutsLibrary && window.SavedWorkoutsLibrary.removeSaved) {
      for (const id of (commit.templateIds || [])) {
        try { await window.SavedWorkoutsLibrary.removeSaved(id); }
        catch (e) { console.warn("[CoachSheetImport] undo: template remove failed", id, e); }
      }
    }

    // Remove imported races from events[] (and Supabase race_events).
    if ((commit.raceIds || []).length) {
      try {
        const ev = JSON.parse(localStorage.getItem("events") || "[]");
        const ids = new Set(commit.raceIds);
        const remaining = ev.filter(e => !ids.has(e.id));
        localStorage.setItem("events", JSON.stringify(remaining));
        if (typeof DB !== "undefined" && DB.syncEvents) DB.syncEvents();
      } catch (e) {
        console.warn("[CoachSheetImport] undo: events cleanup failed", e);
      }
      // Note: race_events table delete is handled by syncEvents
      // upserting the new (smaller) array — the table is treated as a
      // mirror of the local events list, not append-only.
    }

    // Clear the activePlan if the registered plan was synthesized
    // from this import. Don't touch a different active plan — the
    // user might have generated a Build Plan after the import and
    // we shouldn't nuke that.
    try {
      const ap = JSON.parse(localStorage.getItem("activePlan") || "null");
      if (ap?.plan_metadata?.import_id === commit.importId) {
        ["activePlan", "activePlanSource", "activePlanAt", "activePlanId"].forEach(k => {
          try { localStorage.removeItem(k); } catch {}
          if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey(k);
        });
        // Also flip the generated_plans row to inactive on Supabase.
        // Best-effort — RLS scopes to user; a server failure here
        // doesn't block the rest of the undo.
        if (window.supabaseClient) {
          try {
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            const uid = session?.user?.id;
            if (uid) {
              await window.supabaseClient
                .from("generated_plans")
                .update({ is_active: false })
                .eq("user_id", uid)
                .eq("is_active", true)
                .filter("plan_data->plan_metadata->>import_id", "eq", commit.importId);
            }
          } catch (e) { console.warn("[CoachSheetImport] undo: generated_plans deactivate failed", e); }
        }
      }
    } catch (e) {
      console.warn("[CoachSheetImport] undo: activePlan cleanup failed", e);
    }

    // Remove imported PRs. Only delete keys that the import wrote;
    // PRs the user already had stay put. _isFasterPR meant we only
    // overwrote slower-or-missing PRs, but record-keeping is still
    // best-effort: if the user manually updated a PR that we
    // imported, the prKeys list won't catch that case (we'd
    // overwrite with the imported value). Accepting that edge for
    // now — a future slice can record the prior value to restore.
    if ((commit.prKeys || []).length) {
      try {
        const pr = JSON.parse(localStorage.getItem("personalRecords") || "{}");
        for (const key of commit.prKeys) {
          // Only delete if the entry's importId still matches ours —
          // protects against the case where the user manually
          // overwrote the PR after import.
          if (pr[key] && pr[key].importId === commit.importId) {
            delete pr[key];
          }
        }
        localStorage.setItem("personalRecords", JSON.stringify(pr));
        if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("personalRecords");
      } catch (e) {
        console.warn("[CoachSheetImport] undo: PR cleanup failed", e);
      }
    }

    // Clear the persisted commit summary so the toast / future
    // entry-point won't offer undo for an already-undone import.
    try { localStorage.removeItem(UNDO_KEY); } catch {}
    delete window.__coachSheetImportLastCommit;

    // Refresh surfaces.
    try {
      if (typeof renderCalendar === "function") renderCalendar();
      if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
        renderDayDetail(selectedDate);
      }
      if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();
      if (typeof renderStats === "function") renderStats();
    } catch (e) { console.warn("[CoachSheetImport] undo: post-render error", e); }

    _csiToast(
      `Undone — removed ${undoParts.join(", ")}.`,
      "success",
    );
    // If the cross-session banner is currently visible, drop it now
    // that the import it referenced is gone.
    const banner = document.getElementById("csi-recent-import-banner");
    if (banner) try { banner.remove(); } catch {}
  }

  function _esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[c]);
  }

  function _initStepNav() {
    document.querySelectorAll('[data-csi-back]').forEach(btn => {
      btn.addEventListener("click", _goBack);
    });
    const cont1 = $("csi-step-1-continue");
    if (cont1) cont1.addEventListener("click", () => _goToStep(2));
    const cont2 = $("csi-step-2-continue");
    if (cont2) cont2.addEventListener("click", () => _goToStep(3));
    const importBtn = $("csi-step-3-import");
    if (importBtn) importBtn.addEventListener("click", _commitImport);
  }

  // Defer init until DOM is parsed and Supabase is ready. The modal
  // itself is hidden behind a tab switch so the dropzone DOM exists at
  // load time even if it isn't visible yet.
  function _ready() {
    const init = () => { _initDropzone(); _initStepNav(); };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
      init();
    }
  }

  _ready();

  // Public surface for downstream slices + console testing.
  // Retry helper — clears the cached parse response so the next
  // _renderReviewPlaceholder call refetches. Wired to the Retry button
  // in the review error/timeout state.
  function _retryReview() {
    if (_lastImport) {
      _lastImport.fullResponse = null;
      _lastImport._fullCacheKey = null;
    }
    _renderReviewPlaceholder();
  }

  window.CoachSheetImport = {
    _retryReview,
    getStaged: () => _stagedFile,
    getLastImport: () => _lastImport,
    getCurrentStep: () => _currentStep,
    goToStep: _goToStep,
    resetToStep0: _resetToStep0,
    undoLastImport: () => _undoImport(null),
    getLastCommit: () => {
      try { return JSON.parse(localStorage.getItem(UNDO_KEY) || "null"); } catch { return null; }
    },
    // Shared zones recalc — exposed so a future post-race-completion
    // trigger (spec §C3 Trigger 2) can call the same modal without
    // duplicating the logic. Pass an array of `{ distance, time }`
    // (distance keys: marathon | half | 10k | 5k | mile).
    updateZonesFromPRs,
    // Spec §C3 Trigger 2 entry point. Pass the just-completed
    // workout record; if it's a race that beat an existing PR, this
    // saves the PR and fires the zones-recalc modal.
    checkRacePRImprovement,
    _setStatus,
    _validateFile,
  };
})();
