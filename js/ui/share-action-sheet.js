// js/ui/share-action-sheet.js
//
// Bottom-anchored action sheet shown when the user taps a share button.
// Two options: "Copy link" (routes to the Phase 1 flow) and "Send to friend"
// (opens the send-to-friend modal from Phase 2).
//
// Exposes window.ShareActionSheet.open(entry, source) which every share
// button routes through via share.js → shareWorkoutLink.

(function () {
  "use strict";

  const SHEET_ID = "share-action-sheet";
  const SEND_MODAL_ID = "send-to-friend-modal";

  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function _removeSheet(id) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove("is-open");
      setTimeout(() => el.remove(), 220);
    }
  }

  function _showToast(msg) {
    if (typeof _showShareToast === "function") { _showShareToast(msg); return; }
    // Fallback: lightweight inline toast
    const t = document.createElement("div");
    t.className = "ironz-toast visible";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.classList.remove("visible"); setTimeout(() => t.remove(), 300); }, 2400);
  }

  // ── Action sheet (copy link vs send to friend) ───────────────────────────

  function open(entry, source) {
    _removeSheet(SHEET_ID);
    const overlay = document.createElement("div");
    overlay.id = SHEET_ID;
    overlay.className = "share-action-sheet-overlay";
    overlay.innerHTML = `
      <div class="share-action-sheet">
        <div class="share-action-sheet-handle"></div>
        <button class="share-action-sheet-btn" data-action="copy-link">
          <span class="share-action-sheet-btn-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>
          <span class="share-action-sheet-btn-label">
            <span class="share-action-sheet-btn-title">Copy link</span>
            <span class="share-action-sheet-btn-sub">Share anywhere via a preview URL</span>
          </span>
        </button>
        <button class="share-action-sheet-btn" data-action="send-friend">
          <span class="share-action-sheet-btn-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4 20-7z"/></svg></span>
          <span class="share-action-sheet-btn-label">
            <span class="share-action-sheet-btn-title">Send to friend</span>
            <span class="share-action-sheet-btn-sub">Direct to their IronZ inbox</span>
          </span>
        </button>
        <button class="share-action-sheet-btn share-action-sheet-btn--strava" data-action="share-strava">
          <span class="share-action-sheet-btn-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/></svg></span>
          <span class="share-action-sheet-btn-label">
            <span class="share-action-sheet-btn-title">Share to Strava</span>
            <span class="share-action-sheet-btn-sub">Post this workout to your Strava feed</span>
          </span>
        </button>
        <button class="share-action-sheet-cancel" data-action="cancel">Cancel</button>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("is-open"));

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) _removeSheet(SHEET_ID);
    });
    overlay.querySelector('[data-action="copy-link"]').addEventListener("click", () => {
      _removeSheet(SHEET_ID);
      if (typeof shareWorkoutLinkDirect === "function") {
        shareWorkoutLinkDirect(entry, source);
      }
    });
    overlay.querySelector('[data-action="send-friend"]').addEventListener("click", () => {
      _removeSheet(SHEET_ID);
      openSendModal(entry, source);
    });
    overlay.querySelector('[data-action="share-strava"]').addEventListener("click", async () => {
      _removeSheet(SHEET_ID);
      if (typeof window.uploadWorkoutToStrava !== "function") {
        if (typeof _showShareToast === "function") _showShareToast("Strava integration not loaded");
        return;
      }
      // Confirm before pushing — uploads are visible on the user's Strava feed.
      const name = entry.sessionName || entry.name || entry.title || "this workout";
      if (!confirm(`Post "${name}" to your Strava feed?`)) return;
      await window.uploadWorkoutToStrava(entry, { silent: false });
    });
    overlay.querySelector('[data-action="cancel"]').addEventListener("click", () => {
      _removeSheet(SHEET_ID);
    });
  }

  // ── Send-to-friend modal ─────────────────────────────────────────────────

  function openSendModal(entry, source) {
    _removeSheet(SEND_MODAL_ID);

    const Direct = window.WorkoutInboxDirect;
    const recents = (Direct && Direct.getRecentRecipients()) || [];
    const recentsHtml = recents.length
      ? `<div class="send-recent-label">Recent</div>
         <div class="send-recent-chips">
           ${recents.map(e => `<button type="button" class="send-recent-chip" data-email="${_esc(e)}">${_esc(e)}</button>`).join("")}
         </div>`
      : "";

    const workoutName = entry.sessionName || entry.name || entry.title
      || (entry.aiSession && entry.aiSession.title) || "Workout";

    const overlay = document.createElement("div");
    overlay.id = SEND_MODAL_ID;
    overlay.className = "send-modal-overlay";
    overlay.innerHTML = `
      <div class="send-modal">
        <div class="send-modal-header">
          <h2>Send workout</h2>
          <button class="send-modal-close" data-action="cancel" aria-label="Close">&times;</button>
        </div>
        <div class="send-modal-body">
          <div class="send-modal-workout">${_esc(workoutName)}</div>
          <label class="send-modal-field">
            <span>Friend's email</span>
            <input type="email" id="send-modal-email" placeholder="friend@example.com" autocomplete="email">
          </label>
          ${recentsHtml}
          <label class="send-modal-field">
            <span>Note (optional)</span>
            <textarea id="send-modal-message" maxlength="200" rows="2" placeholder="Add a note..."></textarea>
          </label>
          <div class="send-modal-msg" id="send-modal-msg"></div>
        </div>
        <div class="send-modal-actions">
          <button class="btn-ghost"   data-action="cancel">Cancel</button>
          <button class="btn-primary" data-action="send" id="send-modal-send">Send</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("is-open"));

    const $email   = overlay.querySelector("#send-modal-email");
    const $message = overlay.querySelector("#send-modal-message");
    const $msg     = overlay.querySelector("#send-modal-msg");
    const $send    = overlay.querySelector("#send-modal-send");

    function setMsg(html, type) {
      $msg.className = "send-modal-msg" + (type ? " send-modal-msg--" + type : "");
      $msg.innerHTML = html;
    }

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) _removeSheet(SEND_MODAL_ID);
    });
    overlay.querySelectorAll('[data-action="cancel"]').forEach(el => {
      el.addEventListener("click", () => _removeSheet(SEND_MODAL_ID));
    });

    // Recent chip tap: fill the email input
    overlay.querySelectorAll(".send-recent-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        $email.value = btn.dataset.email || "";
        $email.focus();
      });
    });

    overlay.querySelector('[data-action="send"]').addEventListener("click", async () => {
      const email = ($email.value || "").trim();
      const message = ($message.value || "").trim();
      if (!email || !/@/.test(email)) {
        setMsg("Please enter a valid email address.", "error");
        return;
      }

      if (!window.WorkoutInboxDirect) {
        setMsg("Inbox not loaded.", "error");
        return;
      }

      $send.disabled = true;
      $send.textContent = "Sending…";
      setMsg("");

      // Build the workout_payload as a flattened shape that Save-to-Library
      // understands later. We lean on _collectEntryExercises from share.js
      // for normalization if available, otherwise copy the raw entry.
      const payload = _buildPayloadFromEntry(entry);
      const workoutType = entry.type || entry.discipline || null;
      const workoutName = entry.sessionName || entry.name || entry.title
        || (entry.aiSession && entry.aiSession.title) || "Workout";

      const result = await window.WorkoutInboxDirect.sendToFriend(
        email, payload, workoutName, workoutType, message
      );

      $send.disabled = false;
      $send.textContent = "Send";

      if (result.ok) {
        if (typeof trackEvent === "function") {
          trackEvent("workout_sent_to_friend", {
            workout_type: workoutType,
            recipient_found: true,
            source: source || "unknown",
          });
        }
        _showToast("Sent!");
        _removeSheet(SEND_MODAL_ID);
        return;
      }

      if (result.reason === "self_send") {
        setMsg(result.message || "You can't send to yourself.", "error");
        return;
      }

      if (result.reason === "not_found") {
        if (typeof trackEvent === "function") {
          trackEvent("workout_sent_to_friend", {
            workout_type: workoutType,
            recipient_found: false,
            source: source || "unknown",
          });
        }
        // Offer the link-share fallback inline
        setMsg(
          `They're not on IronZ yet. <button class="send-modal-link-fallback" id="send-modal-link-fallback">Share a link instead</button>`,
          "warn"
        );
        const fb = document.getElementById("send-modal-link-fallback");
        if (fb) {
          fb.addEventListener("click", () => {
            _removeSheet(SEND_MODAL_ID);
            if (typeof shareWorkoutLinkDirect === "function") {
              shareWorkoutLinkDirect(entry, source);
            }
          });
        }
        return;
      }

      setMsg(result.message || "Couldn't send. Try again.", "error");
    });

    setTimeout(() => $email.focus(), 200);
  }

  // ── Payload shape ────────────────────────────────────────────────────────

  function _buildPayloadFromEntry(entry) {
    // Keep the shape Save-to-Library and calendar renderers already handle.
    const payload = {
      name: entry.sessionName || entry.name || entry.title
           || (entry.aiSession && entry.aiSession.title) || "Workout",
      type: entry.type || entry.discipline || null,
      duration: entry.duration || null,
      notes: entry.notes || null,
    };
    if (entry.exercises && entry.exercises.length) payload.exercises = entry.exercises;
    if (entry.segments && entry.segments.length)   payload.segments = entry.segments;
    if (entry.aiSession && entry.aiSession.intervals) payload.intervals = entry.aiSession.intervals;
    if (entry.hiitMeta) payload.hiitMeta = entry.hiitMeta;
    if (entry.phases) payload.phases = entry.phases;
    return payload;
  }

  if (typeof window !== "undefined") {
    window.ShareActionSheet = { open, openSendModal };
  }
})();
