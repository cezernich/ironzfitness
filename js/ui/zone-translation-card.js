// js/ui/zone-translation-card.js
//
// Small reusable component that renders the side-by-side "Sender's pace" /
// "Your pace" card from the prototype. Used inside the receiver preview modal.

(function () {
  "use strict";

  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  /**
   * Render the zone-translation card. Sender pace is intentionally shown
   * as a hyphen — the spec is explicit that sender paces never leave the
   * sender's device. We can only display the receiver's scaled pace.
   *
   * @param {Object} opts
   * @param {string} [opts.senderName] — display name only, no paces
   * @param {string} [opts.receiverPaceLabel] — receiver's pace string
   * @param {string} [opts.metricLabel] — "I-pace", "FTP", "CSS"
   * @returns {string} HTML
   */
  function render(opts) {
    const senderName = (opts && opts.senderName) || "Sender";
    const receiverPaceLabel = (opts && opts.receiverPaceLabel) || "—";
    const metricLabel = (opts && opts.metricLabel) || "Pace";
    return `
      <div class="zone-translation">
        <div class="zone-col">
          <div class="zone-col-label">${_esc(senderName)}'s ${_esc(metricLabel)}</div>
          <div class="zone-col-value">private</div>
        </div>
        <div class="zone-col you">
          <div class="zone-col-label">Your ${_esc(metricLabel)}</div>
          <div class="zone-col-value">${_esc(receiverPaceLabel)}</div>
        </div>
      </div>
    `;
  }

  const api = { render };
  if (typeof window !== "undefined") window.ZoneTranslationCard = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
