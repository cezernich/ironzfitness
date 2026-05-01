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
    };
    window.__coachSheetImportLast = _lastImport; // surface for console smoke test

    const sheetCount = Array.isArray(parseData?.sheets) ? parseData.sheets.length : 0;
    _setStatus(
      `File staged (${sheetCount} sheet${sheetCount === 1 ? "" : "s"} detected). Slice 2 ships the picker — see console for details.`,
      "success",
    );
    console.log("[CoachSheetImport] upload + parse-stub OK:", {
      importId,
      storagePath,
      sheets: parseData?.sheets,
      isStub: parseData?.is_stub,
    });

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

  // Defer init until DOM is parsed and Supabase is ready. The modal
  // itself is hidden behind a tab switch so the dropzone DOM exists at
  // load time even if it isn't visible yet.
  function _ready() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", _initDropzone, { once: true });
    } else {
      _initDropzone();
    }
  }

  _ready();

  // Export for Slices 2–3 + console testing.
  window.CoachSheetImport = {
    getStaged: () => _stagedFile,
    getLastImport: () => _lastImport,
    _setStatus,
    _setStaged,
    _validateFile,
  };
})();
