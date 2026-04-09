// js/ui/conflict-resolution-modal.js
//
// Modal #5: Conflict resolution (receiver). Shows the warning, lists concrete
// alternatives (Move to suggested / Swap / Override). Matches receiver4 in the
// prototype.

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

  function _formatDate(d) {
    if (!d) return "";
    return new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  /**
   * @param {Object} opts
   * @param {string} opts.attemptedDate — date the user picked
   * @param {Array}  opts.conflicts     — from validator
   * @param {string} [opts.suggestedDate] — best alternative the validator found
   * @param {boolean} [opts.hasHardBlock] — if true, "Override" is hidden
   * @param {Function} opts.onMove      — onMove(suggestedDate)
   * @param {Function} [opts.onSwap]    — onSwap()
   * @param {Function} [opts.onOverride] — onOverride()
   * @param {Function} [opts.onCancel]
   */
  function open(opts) {
    if (!opts) return;
    const id = "conflict-resolution-overlay";
    const old = document.getElementById(id);
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "rating-modal-overlay";
    overlay.onclick = e => { if (e.target === overlay) _close(id); };

    const conflicts = opts.conflicts || [];
    const primary = conflicts[0] || { message: "Conflict on this day." };
    const dateLabel = _formatDate(opts.attemptedDate);
    const suggestedLabel = opts.suggestedDate ? _formatDate(opts.suggestedDate) : null;

    const conflictsHtml = conflicts.map(c => `
      <div class="warning-text">• ${_esc(c.message)}</div>
    `).join("");

    overlay.innerHTML = `
      <div class="rating-modal conflict-resolution-modal">
        <div class="warning-box">
          <div class="warning-title">⚠ Can't add on ${_esc(dateLabel)}</div>
          ${conflictsHtml}
        </div>
        <div class="post-test-modal-body">
          <div class="conflict-section-label">Here's what we can do:</div>
        </div>
        <div class="conflict-actions">
          ${suggestedLabel
            ? `<button class="btn-primary" id="conflict-move">Move to ${_esc(suggestedLabel)} (suggested)</button>`
            : ""}
          ${opts.onSwap ? `<button class="btn-secondary" id="conflict-swap">Swap with the long run</button>` : ""}
          ${!opts.hasHardBlock ? `<button class="btn-ghost" id="conflict-override">Override anyway (not recommended)</button>` : ""}
          <button class="btn-ghost" id="conflict-cancel">Cancel</button>
        </div>
        <p class="conflict-footer-note">The validator runs the same rules on shared workouts as on your built-in plan. No exceptions.</p>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    const $move = overlay.querySelector("#conflict-move");
    const $swap = overlay.querySelector("#conflict-swap");
    const $override = overlay.querySelector("#conflict-override");
    const $cancel = overlay.querySelector("#conflict-cancel");

    if ($move) $move.onclick = () => {
      _close(id);
      if (typeof opts.onMove === "function") opts.onMove(opts.suggestedDate);
    };
    if ($swap) $swap.onclick = () => {
      _close(id);
      if (typeof opts.onSwap === "function") opts.onSwap();
    };
    if ($override) $override.onclick = () => {
      _close(id);
      if (typeof opts.onOverride === "function") opts.onOverride();
    };
    if ($cancel) $cancel.onclick = () => {
      _close(id);
      if (typeof opts.onCancel === "function") opts.onCancel();
    };
  }

  const api = { open };
  if (typeof window !== "undefined") window.ConflictResolutionModal = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
