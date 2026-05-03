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

  // ── Step 3 — review screen ─────────────────────────────────────────────

  // Per-workout / per-template selection state — Map keyed by index so
  // we can toggle inclusion without mutating the parsed payload.
  let _workoutInclude = null;
  let _templateInclude = null;

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
      host.innerHTML = `<div class="csi-review-loading">Fetching plan details…</div>`;
      const supa = window.supabaseClient;
      if (supa) {
        try {
          const { data, error } = await supa.functions.invoke(
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
          if (error || data?.status === "error") {
            const msg = error?.message || data?.message || "Couldn't load plan details.";
            host.innerHTML = `<div class="csi-review-error">${_esc(msg)}</div>`;
            return;
          }
          _lastImport.fullResponse = data;
          _lastImport._fullCacheKey = cacheKey;
          _workoutInclude = (data.running_workouts || []).map(() => true);
          _templateInclude = (data.strength_templates || []).map(() => true);
        } catch (e) {
          host.innerHTML = `<div class="csi-review-error">${_esc(e?.message || "Couldn't load plan details.")}</div>`;
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
      html += `<div class="csi-profile-note">Detected races and PRs from the Resources sheet. Full profile import ships in a follow-up; for now this is a heads-up that the data was found.</div>`;
      html += `<div class="csi-profile-grid">`;
      (profile.races || []).forEach(r => {
        html += `<div class="csi-profile-card">
          <div class="csi-profile-card-name">${_esc(r.name || "Race")}</div>
          <div class="csi-profile-card-sub">${_esc(r.distance || "")}${r.date ? ` · ${_esc(r.date)}` : ""}${r.priority ? ` · ${_esc(r.priority)}` : ""}</div>
        </div>`;
      });
      (profile.prs || []).forEach(p => {
        html += `<div class="csi-profile-card">
          <div class="csi-profile-card-name">${_esc(p.distance || "PR")}: ${_esc(p.time || "")}</div>
          <div class="csi-profile-card-sub">${_esc(p.race || "")}${p.pace_per_mi ? ` · ${_esc(p.pace_per_mi)}/mi` : ""}${p.date ? ` · ${_esc(p.date)}` : ""}</div>
        </div>`;
      });
      html += `</div>`;
    }

    host.innerHTML = html;

    host.querySelectorAll('input[type="checkbox"][data-csi-workout]').forEach(cb => {
      cb.addEventListener("change", () => {
        const idx = parseInt(cb.getAttribute("data-csi-workout"), 10);
        if (Number.isFinite(idx)) _workoutInclude[idx] = cb.checked;
        _updateImportButton(_countSelected(_workoutInclude), _countSelected(_templateInclude));
      });
    });
    host.querySelectorAll('input[type="checkbox"][data-csi-template]').forEach(cb => {
      cb.addEventListener("change", () => {
        const idx = parseInt(cb.getAttribute("data-csi-template"), 10);
        if (Number.isFinite(idx)) _templateInclude[idx] = cb.checked;
        _updateImportButton(_countSelected(_workoutInclude), _countSelected(_templateInclude));
      });
    });
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

    _updateImportButton(_countSelected(_workoutInclude), _countSelected(_templateInclude));
  }

  function _countSelected(arr) {
    if (!Array.isArray(arr)) return 0;
    return arr.reduce((n, v) => n + (v ? 1 : 0), 0);
  }

  function _updateImportButton(workoutCount, templateCount) {
    const btn = $("csi-step-3-import");
    if (!btn) return;
    const total = workoutCount + templateCount;
    btn.disabled = total === 0;
    btn.textContent = total
      ? `Import all (${workoutCount} workout${workoutCount === 1 ? "" : "s"} · ${templateCount} template${templateCount === 1 ? "" : "s"})`
      : "Import all";
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

    if (!workouts.length && !templates.length) {
      _csiToast("Nothing selected to import.", "error");
      return;
    }

    const ok = window.confirm(
      `Import ${workouts.length} workout${workouts.length === 1 ? "" : "s"} and ${templates.length} strength template${templates.length === 1 ? "" : "s"}? You can edit any of them after import.`,
    );
    if (!ok) return;

    const importBtn = $("csi-step-3-import");
    if (importBtn) { importBtn.disabled = true; importBtn.textContent = "Importing…"; }

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

      // Commit — increments quota + flips log to success.
      const supa = window.supabaseClient;
      if (supa) {
        const { data, error } = await supa.functions.invoke("coach-sheet-import-commit", {
          body: {
            import_id: _lastImport.importId,
            workouts_inserted: workoutsInserted,
            templates_inserted: templatesInserted,
            selected_sheets: _lastImport.selectedSheets,
            date_range: _lastImport.dateRange,
          },
        });
        if (error || data?.status === "error") {
          const msg = error?.message || data?.message || "Commit failed.";
          console.warn("[CoachSheetImport] commit error", error || data);
          // Local writes already happened — surface as a partial-success
          // warning rather than a hard error. User can still see the
          // workouts on the calendar.
          _csiToast(`Imported but commit hit an issue: ${msg}`, "error");
          _resetToStep0();
          _setStaged(null);
          return;
        }
        console.log("[CoachSheetImport] commit OK:", data);
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
        workoutsInserted,
        templatesInserted,
        committedAt: Date.now(),
      };
      try { localStorage.setItem(UNDO_KEY, JSON.stringify(commitSummary)); } catch {}
      window.__coachSheetImportLastCommit = commitSummary;

      const summaryText = `Imported "${planName}" — ${workoutsInserted} workout${workoutsInserted === 1 ? "" : "s"}` +
        (templatesInserted ? `, ${templatesInserted} template${templatesInserted === 1 ? "" : "s"}` : "") + ".";
      _csiToastWithUndo(summaryText, commitSummary);
      _resetToStep0();
      _setStaged(null);
    } catch (e) {
      console.warn("[CoachSheetImport] commit threw", e);
      _csiToast(`Import failed: ${e?.message || "unknown error"}`, "error");
      if (importBtn) importBtn.disabled = false;
    } finally {
      _updateImportButton(_countSelected(_workoutInclude), _countSelected(_templateInclude));
    }
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
    const ok = window.confirm(
      `Undo will remove "${commit.planName || "this import"}" — ${workoutCount} workout${workoutCount === 1 ? "" : "s"}` +
      (templateCount ? ` and ${templateCount} template${templateCount === 1 ? "" : "s"}` : "") +
      `. Continue?`,
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
      `Undone — removed ${workoutCount} workout${workoutCount === 1 ? "" : "s"}` +
      (templateCount ? ` and ${templateCount} template${templateCount === 1 ? "" : "s"}` : "") + ".",
      "success",
    );
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
  window.CoachSheetImport = {
    getStaged: () => _stagedFile,
    getLastImport: () => _lastImport,
    getCurrentStep: () => _currentStep,
    goToStep: _goToStep,
    resetToStep0: _resetToStep0,
    undoLastImport: () => _undoImport(null),
    getLastCommit: () => {
      try { return JSON.parse(localStorage.getItem(UNDO_KEY) || "null"); } catch { return null; }
    },
    _setStatus,
    _validateFile,
  };
})();
