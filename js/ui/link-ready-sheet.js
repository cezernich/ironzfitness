// js/ui/link-ready-sheet.js
//
// Modal #2: Link ready sheet (sender). Shows the freshly-minted link with
// "Messages / Copy / Mail / More" share options. Matches the prototype.

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

  async function _copyToClipboard(text) {
    try {
      if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    // Fallback: temporary textarea
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand && document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch { return false; }
  }

  function _shareViaWebShareAPI(url, title) {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        return navigator.share({ url, title }).catch(() => false);
      } catch { return Promise.resolve(false); }
    }
    return Promise.resolve(false);
  }

  /**
   * @param {Object} opts
   * @param {string} opts.shareUrl
   * @param {string} opts.shareToken
   * @param {string|Date} opts.expiresAt
   * @param {string} [opts.workoutTitle]
   */
  function open(opts) {
    if (!opts || !opts.shareUrl) return;
    const id = "link-ready-overlay";
    const old = document.getElementById(id);
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "rating-modal-overlay share-sheet-overlay";
    overlay.onclick = e => { if (e.target === overlay) _close(id); };

    overlay.innerHTML = `
      <div class="share-sheet">
        <div class="sheet-handle"></div>
        <div class="sheet-title">Link ready</div>
        <div class="link-box" id="link-ready-url">${_esc(opts.shareUrl)}</div>
        <div class="link-meta">Expires in 30 days · No personal data attached</div>
        <div class="share-options">
          <div class="share-option" data-action="messages">
            <div class="share-icon">💬</div>
            <span>Messages</span>
          </div>
          <div class="share-option" data-action="copy">
            <div class="share-icon">📋</div>
            <span>Copy</span>
          </div>
          <div class="share-option" data-action="mail">
            <div class="share-icon">✉️</div>
            <span>Mail</span>
          </div>
          <div class="share-option" data-action="more">
            <div class="share-icon">⋯</div>
            <span>More</span>
          </div>
        </div>
        <button class="btn-ghost" id="link-ready-close">Done</button>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    overlay.querySelectorAll(".share-option").forEach(el => {
      el.addEventListener("click", async () => {
        const action = el.dataset.action;
        if (action === "copy") {
          const ok = await _copyToClipboard(opts.shareUrl);
          el.querySelector("span").textContent = ok ? "Copied!" : "Try again";
          setTimeout(() => { el.querySelector("span").textContent = "Copy"; }, 1500);
        } else if (action === "messages") {
          // sms: scheme works on iOS Safari and Android Chrome
          window.location.href = `sms:?&body=${encodeURIComponent(opts.shareUrl)}`;
        } else if (action === "mail") {
          window.location.href = `mailto:?subject=${encodeURIComponent("A workout from IronZ")}&body=${encodeURIComponent(opts.shareUrl)}`;
        } else if (action === "more") {
          await _shareViaWebShareAPI(opts.shareUrl, opts.workoutTitle || "Workout");
        }
      });
    });

    overlay.querySelector("#link-ready-close").onclick = () => _close(id);
  }

  const api = { open };
  if (typeof window !== "undefined") window.LinkReadySheet = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
