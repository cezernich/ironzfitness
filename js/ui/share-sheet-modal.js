// js/ui/share-sheet-modal.js
//
// Modal #1: the share sheet (sender). Bottom-sheet with privacy labels
// (INCLUDED / PRIVATE), optional note toggle, "Generate link" button.
// Copy and structure match Plan/workout-sharing-prototype.html exactly.

(function () {
  "use strict";

  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function _close(id) {
    const o = document.getElementById(id);
    if (o) {
      o.classList.remove("visible");
      setTimeout(() => o.remove(), 200);
    }
  }

  /**
   * Open the share sheet.
   * @param {Object} opts
   * @param {string} opts.workoutTitle — display title (e.g. "Yasso 800s")
   * @param {string} opts.variantId
   * @param {string} opts.sportId
   * @param {string} opts.sessionTypeId
   * @param {Function} opts.onGenerated — called with { shareToken, shareUrl, expiresAt }
   *   after successful link mint, OR with { error } on failure.
   */
  function open(opts) {
    if (!opts || !opts.variantId || !opts.sportId || !opts.sessionTypeId) {
      console.warn("[share-sheet-modal] missing required opts");
      return;
    }
    const id = "share-sheet-overlay";
    const old = document.getElementById(id);
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "rating-modal-overlay share-sheet-overlay";
    overlay.onclick = e => { if (e.target === overlay) _close(id); };

    overlay.innerHTML = `
      <div class="share-sheet">
        <div class="sheet-handle"></div>
        <div class="sheet-title">Share ${_esc(opts.workoutTitle || "Workout")}</div>
        <div class="sheet-subtitle">Your friend will run this in their zones, not yours</div>
        <div class="privacy-row">
          <span class="privacy-label">Workout structure</span>
          <span class="privacy-status shared">INCLUDED</span>
        </div>
        <div class="privacy-row">
          <span class="privacy-label">Your actual paces</span>
          <span class="privacy-status private">PRIVATE</span>
        </div>
        <div class="privacy-row">
          <span class="privacy-label">Your VDOT / zones</span>
          <span class="privacy-status private">PRIVATE</span>
        </div>
        <div class="privacy-row">
          <span class="privacy-label">Include a note</span>
          <div class="ironz-toggle off" id="share-sheet-note-toggle"></div>
        </div>
        <div id="share-sheet-note-row" style="display:none">
          <textarea id="share-sheet-note" maxlength="280" placeholder="Add a note (optional, 280 chars)"></textarea>
          <div class="share-sheet-note-meta" id="share-sheet-note-meta">0 / 280</div>
        </div>
        <button class="btn-primary" id="share-sheet-generate">Generate link</button>
        <button class="btn-ghost" id="share-sheet-cancel">Cancel</button>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    const $toggle = overlay.querySelector("#share-sheet-note-toggle");
    const $noteRow = overlay.querySelector("#share-sheet-note-row");
    const $note = overlay.querySelector("#share-sheet-note");
    const $noteMeta = overlay.querySelector("#share-sheet-note-meta");
    const $generate = overlay.querySelector("#share-sheet-generate");
    const $cancel = overlay.querySelector("#share-sheet-cancel");

    $toggle.onclick = () => {
      $toggle.classList.toggle("off");
      const on = !$toggle.classList.contains("off");
      $noteRow.style.display = on ? "" : "none";
      if (on) $note.focus();
    };

    if ($note) {
      $note.oninput = () => {
        $noteMeta.textContent = `${$note.value.length} / 280`;
      };
    }

    $cancel.onclick = () => _close(id);

    $generate.onclick = async () => {
      $generate.disabled = true;
      $generate.textContent = "Creating link...";
      const note = !$toggle.classList.contains("off") ? ($note.value || "").trim() : null;
      const Flow = (typeof window !== "undefined" && window.WorkoutSharingFlow) || null;
      if (!Flow) {
        $generate.disabled = false;
        $generate.textContent = "Generate link";
        if (typeof opts.onGenerated === "function") opts.onGenerated({ error: "FLOW_MODULE_MISSING" });
        return;
      }
      const result = await Flow.createShare({
        variantId: opts.variantId,
        sportId: opts.sportId,
        sessionTypeId: opts.sessionTypeId,
        note,
      });
      _close(id);
      if (typeof opts.onGenerated === "function") opts.onGenerated(result);
    };
  }

  const api = { open };
  if (typeof window !== "undefined") window.ShareSheetModal = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
