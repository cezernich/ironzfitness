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

    // Default range = today → today+28d, intersected with the file's
    // bounds if the file doesn't cover today.
    const today = _todayISO();
    let defaultFrom = today;
    let defaultTo   = _addDays(today, 28);
    if (fileMin && fileMax) {
      // If today is before the file starts, anchor to fileMin.
      if (defaultFrom < fileMin) defaultFrom = fileMin;
      // If 4-week window pushes past file end, clamp.
      if (defaultTo > fileMax) defaultTo = fileMax;
      if (defaultFrom > defaultTo) defaultFrom = fileMin;
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

  // ── Step 3 — review placeholder (Slice 3 ships the full screen) ────────

  function _renderReviewPlaceholder() {
    if (!_lastImport) return;
    const subEl = $("csi-step-3-sub");
    if (subEl) {
      const r = _lastImport.dateRange || {};
      subEl.textContent = `From ${_lastImport.filename} · ${r.from || "?"} → ${r.to || "?"}`;
    }
    const debug = $("csi-review-debug");
    if (debug) {
      debug.textContent = JSON.stringify({
        import_id: _lastImport.importId,
        storage_path: _lastImport.storagePath,
        selected_sheets: _lastImport.selectedSheets,
        date_range: _lastImport.dateRange,
      }, null, 2);
    }
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
    const done3 = $("csi-step-3-done");
    if (done3) done3.addEventListener("click", () => {
      // Slice 3 will commit the import; for now just dump state and
      // close the modal if there's a known close hook. Otherwise reset
      // to step 0 so the next attempt starts clean.
      console.log("[CoachSheetImport] (Slice 2) Done pressed with state:", _lastImport);
      _resetToStep0();
      _setStaged(null);
      // If the modal exposes a close, call it. Soft-fallback: leave
      // the modal open at step 0 — user can hit the modal's own close.
      if (typeof closeCustomPlanModal === "function") {
        try { closeCustomPlanModal(); } catch {}
      }
    });
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

  // Export for Slice 3 + console testing.
  window.CoachSheetImport = {
    getStaged: () => _stagedFile,
    getLastImport: () => _lastImport,
    getCurrentStep: () => _currentStep,
    goToStep: _goToStep,
    resetToStep0: _resetToStep0,
    _setStatus,
    _validateFile,
  };
})();
