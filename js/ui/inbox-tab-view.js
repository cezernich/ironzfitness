// js/ui/inbox-tab-view.js
//
// Renders the Inbox tab content. The tab itself is added to the existing main
// nav by index.html. This module exposes renderInboxTab() which the tab switcher
// calls when the user opens the tab.

(function () {
  "use strict";

  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function _initials(name) {
    if (!name) return "?";
    return String(name).trim().slice(0, 1).toUpperCase();
  }

  function _formatRelative(dateStr) {
    if (!dateStr) return "";
    const then = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - then.getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 60) return `${Math.max(1, mins)}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  }

  // Humanize a raw workout_type like "track_workout" → "Track · Running".
  // Prefers the global _WORKOUT_TYPE_LABELS map from calendar.js when
  // available; otherwise title-cases the identifier with underscores
  // replaced by spaces.
  function _formatWorkoutType(type) {
    if (!type) return "";
    if (typeof _WORKOUT_TYPE_LABELS !== "undefined" && _WORKOUT_TYPE_LABELS[type]) {
      return _WORKOUT_TYPE_LABELS[type];
    }
    return String(type).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  // Build a collapsible workout-preview block from a workout_payload. Uses
  // buildExerciseTableHTML / buildSegmentTableHTML when they're loaded
  // globally (workouts.js), otherwise falls back to a minimal inline
  // renderer so the preview still works if workouts.js hasn't loaded.
  function _buildWorkoutPreview(payload, cardKey) {
    if (!payload) return "";
    const hasExercises = payload.exercises && payload.exercises.length;
    const hasSegments  = payload.segments && payload.segments.length;
    const hasIntervals = payload.intervals && payload.intervals.length;
    const isHiit = payload.type === "hiit" || !!payload.hiitMeta;
    if (!hasExercises && !hasSegments && !hasIntervals) return "";

    let bodyHtml = "";
    if (hasSegments) {
      if (typeof buildSegmentTableHTML === "function") {
        bodyHtml = buildSegmentTableHTML(payload.segments);
      } else {
        bodyHtml = _simpleSegmentTable(payload.segments);
      }
    } else if (hasIntervals) {
      // Intervals from the sender's aiSession — same shape as segments.
      const segs = payload.intervals.map(iv => ({
        name: iv.name || "Interval",
        duration: iv.duration || "",
        effort: iv.effort || iv.intensity || "Z2",
      }));
      bodyHtml = _simpleSegmentTable(segs);
    } else if (hasExercises) {
      if (typeof buildExerciseTableHTML === "function") {
        bodyHtml = buildExerciseTableHTML(payload.exercises, { hiit: isHiit });
      } else {
        bodyHtml = _simpleExerciseTable(payload.exercises);
      }
    }

    // HIIT metadata header (format, rounds, rests)
    let metaHtml = "";
    if (isHiit && payload.hiitMeta) {
      const m = payload.hiitMeta;
      const fmtLabels = { circuit: "Circuit", tabata: "Tabata", emom: "EMOM", amrap: "AMRAP", "for-time": "For Time" };
      const parts = [fmtLabels[m.format] || m.format || "HIIT"];
      if (m.rounds) parts.push(`${m.rounds} rounds`);
      if (m.restBetweenRounds) parts.push(`${m.restBetweenRounds} between rounds`);
      metaHtml = `<div class="inbox-preview-meta">${_esc(parts.join(" · "))}</div>`;
    }

    const key = cardKey || Math.random().toString(36).slice(2, 8);
    return `
      <div class="inbox-preview-wrap">
        <button type="button" class="inbox-preview-toggle" data-inbox-preview-toggle="${_esc(key)}">Show details \u25be</button>
        <div class="inbox-preview-body" id="inbox-preview-${_esc(key)}" style="display:none">
          ${metaHtml}
          ${bodyHtml}
        </div>
      </div>`;
  }

  function _simpleSegmentTable(segments) {
    const rows = segments.map(s =>
      `<tr><td>${_esc(s.name || "—")}</td><td>${_esc(s.duration || "—")}</td><td>${_esc(s.effort || s.intensity || "—")}</td></tr>`
    ).join("");
    return `<table class="exercise-table"><thead><tr><th>Phase</th><th>Duration</th><th>Effort</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function _simpleExerciseTable(exercises) {
    const rows = exercises.map(e => {
      const sets = e.sets != null ? e.sets : "—";
      const reps = e.reps != null ? e.reps : "—";
      const weight = e.weight != null && e.weight !== "" ? e.weight : "—";
      return `<tr><td>${_esc(e.name || "—")}</td><td>${_esc(String(sets))}</td><td>${_esc(String(reps))}</td><td>${_esc(String(weight))}</td></tr>`;
    }).join("");
    return `<table class="exercise-table"><thead><tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>Weight</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // Inbox view state: "received" or "sent"
  let _inboxView = "received";

  /**
   * Render the inbox tab into a target element. Shows a Received/Sent
   * toggle at the top. The Received view merges:
   *   - Phase 1 link-shared inbox items (SharedWorkoutsInbox, localStorage)
   *   - Phase 2 direct-sent items (WorkoutInboxDirect, Supabase workout_inbox)
   * The Sent view shows outgoing Phase 2 direct sends only.
   * @param {string} containerId — DOM id of the tab body
   */
  async function renderInboxTab(containerId) {
    const target = document.getElementById(containerId || "tab-inbox-content");
    if (!target) return;

    const LinkInbox = window.SharedWorkoutsInbox;
    const Direct    = window.WorkoutInboxDirect;

    // Capture unread count BEFORE markAllRead so analytics reflect what the
    // user actually saw as new.
    let directUnread = 0;
    if (Direct && Direct.getUnreadCount) {
      try { directUnread = await Direct.getUnreadCount(true); } catch {}
    }

    // Mark Supabase workout_inbox items as read when the inbox tab is opened.
    if (Direct && Direct.markAllRead) {
      try { await Direct.markAllRead(); } catch {}
    }

    const receivedLinks = LinkInbox
      ? (await LinkInbox.listInbox()).filter(e => e.status !== "dismissed")
      : [];
    const receivedDirect = Direct ? await Direct.listReceived() : [];
    const sentDirect     = Direct ? await Direct.listSent()     : [];

    const linksUnread  = receivedLinks.filter(e => e.status === "unread").length;
    const unreadCount  = directUnread + linksUnread;

    if (typeof trackEvent === "function") {
      trackEvent("inbox_opened", { unread_count: unreadCount });
    }

    const receivedHtml = _renderReceivedList(receivedLinks, receivedDirect);
    const sentHtml     = _renderSentList(sentDirect);

    target.innerHTML = `
      <h2 class="tab-h2">Inbox</h2>
      <div class="inbox-view-switcher">
        <button class="inbox-view-btn${_inboxView === "received" ? " is-active" : ""}" data-view="received">Received</button>
        <button class="inbox-view-btn${_inboxView === "sent" ? " is-active" : ""}" data-view="sent">Sent</button>
      </div>
      <div class="inbox-view-body">
        ${_inboxView === "received" ? receivedHtml : sentHtml}
      </div>
    `;

    // Toggle handlers
    target.querySelectorAll(".inbox-view-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        _inboxView = btn.dataset.view || "received";
        renderInboxTab(containerId);
      });
    });

    // Link-share card actions (Phase 1)
    target.querySelectorAll("[data-inbox-action]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const action = btn.dataset.inboxAction;
        const token = btn.dataset.token;
        if (action === "save") {
          await _save(token);
        } else if (action === "schedule") {
          await _schedule(token);
        } else if (action === "dismiss") {
          if (confirm("Dismiss this workout from your inbox?")) {
            await LinkInbox.dismiss(token);
            renderInboxTab(containerId);
          }
        }
      });
    });
    target.querySelectorAll(".inbox-card").forEach(card => {
      const token = card.dataset.token;
      if (!token) return;
      card.addEventListener("click", async () => {
        if (LinkInbox && LinkInbox.markAsRead) await LinkInbox.markAsRead(token);
        _openPreview(token);
      });
    });

    // Direct (Phase 2) card actions
    target.querySelectorAll("[data-direct-action]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const action = btn.dataset.directAction;
        const itemId = btn.dataset.itemId;
        if (action === "accept") {
          await _acceptDirect(itemId, receivedDirect);
        } else if (action === "dismiss") {
          await _dismissDirect(itemId, receivedDirect);
        }
        renderInboxTab(containerId);
      });
    });

    // Workout preview expand/collapse toggles
    target.querySelectorAll("[data-inbox-preview-toggle]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const key = btn.dataset.inboxPreviewToggle;
        const body = document.getElementById("inbox-preview-" + key);
        if (!body) return;
        // Only treat "none" as hidden — the empty-string fallback made
        // every click after the first re-open the panel instead of
        // alternating show/hide. Set explicit "block" on expand.
        const isHidden = body.style.display === "none";
        body.style.display = isHidden ? "block" : "none";
        btn.textContent = isHidden ? "Hide details \u25b4" : "Show details \u25be";
      });
    });

    _refreshBadge();
  }

  function _renderReceivedList(links, direct) {
    if (!links.length && !direct.length) {
      return `
        <div class="inbox-empty">
          <p>No shared workouts yet. When a friend shares a workout with you, it'll show up here.</p>
        </div>`;
    }
    let html = '<div class="inbox-list">';
    // Phase 2 direct sends first (newer, richer)
    direct.forEach(item => { html += _renderDirectCard(item); });
    // Phase 1 link-share items after
    links.forEach(e => { html += _renderCard(e); });
    html += "</div>";
    return html;
  }

  function _renderSentList(sent) {
    if (!sent.length) {
      return `<div class="inbox-empty"><p>You haven't sent any workouts yet. Tap the share button on any workout to send it to a friend.</p></div>`;
    }
    let html = '<div class="inbox-list">';
    sent.forEach(item => { html += _renderSentCard(item); });
    html += "</div>";
    return html;
  }

  function _renderDirectCard(item) {
    const isAccepted = item.status === "accepted";
    const noteHtml = item.message ? `<div class="inbox-card-note">"${_esc(item.message)}"</div>` : "";
    const sender = item.sender_display_name || "A friend";
    const typeLabel = _formatWorkoutType(item.workout_type);
    const previewHtml = _buildWorkoutPreview(item.workout_payload, "d-" + item.id);
    const actionsHtml = isAccepted
      ? `<div class="inbox-card-saved">Saved ${"\u2713"}</div>`
      : `
        <button class="btn-primary" data-direct-action="accept"  data-item-id="${_esc(item.id)}">Save to Library</button>
        <button class="btn-ghost"   data-direct-action="dismiss" data-item-id="${_esc(item.id)}">Dismiss</button>
      `;
    return `
      <div class="inbox-card inbox-card--direct${isAccepted ? " is-accepted" : ""}">
        <div class="inbox-card-header">
          <div class="avatar">${_esc(_initials(sender))}</div>
          <div class="inbox-card-meta">
            <div class="inbox-card-sender">${_esc(sender)}</div>
            <div class="inbox-card-time">${_esc(_formatRelative(item.created_at))}</div>
          </div>
        </div>
        <div class="inbox-card-title">${_esc(item.workout_name || "Workout")}</div>
        ${typeLabel ? `<div class="inbox-card-sport">${_esc(typeLabel)}</div>` : ""}
        ${noteHtml}
        ${previewHtml}
        <div class="inbox-card-actions">
          ${actionsHtml}
        </div>
      </div>
    `;
  }

  function _renderSentCard(item) {
    const statusLabels = {
      unread: "Delivered",
      read: "Seen",
      accepted: "Saved",
      dismissed: "Dismissed",
    };
    const statusClass = "inbox-sent-status inbox-sent-status--" + item.status;
    const recipient = item.recipient_display_name || "recipient";
    const typeLabel = _formatWorkoutType(item.workout_type);
    const previewHtml = _buildWorkoutPreview(item.workout_payload, "s-" + item.id);
    return `
      <div class="inbox-card inbox-card--sent">
        <div class="inbox-card-header">
          <div class="inbox-card-meta">
            <div class="inbox-card-sender">To ${_esc(recipient)}</div>
            <div class="inbox-card-time">${_esc(_formatRelative(item.created_at))}</div>
          </div>
          <span class="${statusClass}">${_esc(statusLabels[item.status] || item.status)}</span>
        </div>
        <div class="inbox-card-title">${_esc(item.workout_name || "Workout")}</div>
        ${typeLabel ? `<div class="inbox-card-sport">${_esc(typeLabel)}</div>` : ""}
        ${item.message ? `<div class="inbox-card-note">"${_esc(item.message)}"</div>` : ""}
        ${previewHtml}
      </div>
    `;
  }

  async function _acceptDirect(itemId, cachedList) {
    const Direct = window.WorkoutInboxDirect;
    if (!Direct) return;
    const item = (cachedList || []).find(x => x.id === itemId);
    if (!item) return;
    // Save the full payload to the Saved library, then flip status to accepted.
    // saveItemPayloadToLibrary is now async (routes through
    // SavedWorkoutsLibrary.saveCustom).
    await Direct.saveItemPayloadToLibrary(item);
    await Direct.acceptItem(itemId);
    if (typeof trackEvent === "function") {
      trackEvent("inbox_workout_accepted", {
        workout_type: item.workout_type,
        sender_id: item.sender_id,
      });
    }
    if (typeof _showShareToast === "function") _showShareToast("Saved to library!");
  }

  async function _dismissDirect(itemId, cachedList) {
    const Direct = window.WorkoutInboxDirect;
    if (!Direct) return;
    const item = (cachedList || []).find(x => x.id === itemId);
    await Direct.dismissItem(itemId);
    if (typeof trackEvent === "function") {
      trackEvent("inbox_workout_dismissed", {
        workout_type: item?.workout_type,
      });
    }
  }

  function _renderCard(e) {
    const isUnread = e.status === "unread";
    const noteHtml = e.shareNote ? `<div class="inbox-card-note">"${_esc(e.shareNote)}"</div>` : "";
    return `
      <div class="inbox-card${isUnread ? " is-unread" : ""}" data-token="${_esc(e.shareToken)}">
        <div class="inbox-card-header">
          <div class="avatar">${_esc(_initials(e.senderDisplayName))}</div>
          <div class="inbox-card-meta">
            <div class="inbox-card-sender">${_esc(e.senderDisplayName || "A friend")}</div>
            <div class="inbox-card-time">${_esc(_formatRelative(e.received_at))}</div>
          </div>
          ${isUnread ? `<span class="inbox-unread-dot"></span>` : ""}
        </div>
        <div class="inbox-card-title">${_esc(e.variantName || e.variantId || "Workout")}</div>
        <div class="inbox-card-sport">${_esc(e.sportId || "")} · ${_esc(e.sessionTypeId || "")}</div>
        ${noteHtml}
        <div class="inbox-card-actions">
          <button class="btn-secondary" data-inbox-action="save"     data-token="${_esc(e.shareToken)}">Save to Library</button>
          <button class="btn-primary"   data-inbox-action="schedule" data-token="${_esc(e.shareToken)}">Schedule</button>
          <button class="btn-ghost"     data-inbox-action="dismiss"  data-token="${_esc(e.shareToken)}">Dismiss</button>
        </div>
      </div>
    `;
  }

  async function _save(token) {
    const Inbox = window.SharedWorkoutsInbox;
    const Saved = window.SavedWorkoutsLibrary;
    const entry = (await Inbox.listInbox()).find(e => e.shareToken === token);
    if (!entry) return;
    if (Saved && Saved.saveFromShare) {
      await Saved.saveFromShare({
        shareToken: entry.shareToken,
        variantId: entry.variantId,
        sportId: entry.sportId,
        sessionTypeId: entry.sessionTypeId,
        senderUserId: entry.senderUserId,
      });
    }
    await Inbox.markAsSaved(token);
    renderInboxTab();
  }

  async function _schedule(token) {
    const Inbox = window.SharedWorkoutsInbox;
    const entry = (await Inbox.listInbox()).find(e => e.shareToken === token);
    if (!entry) return;
    _openPreview(token, "schedule");
  }

  function _openPreview(token, action) {
    const PreviewModal = window.SharedWorkoutPreviewModal;
    const ScheduleCalendar = window.ScheduleCalendarModal;
    const Inbox = window.SharedWorkoutsInbox;
    if (!PreviewModal) return;
    Inbox.listInbox().then(list => {
      const e = list.find(x => x.shareToken === token);
      if (!e) return;
      const sharedWorkout = {
        shareToken: e.shareToken,
        senderDisplayName: e.senderDisplayName,
        senderAvatarUrl: e.senderAvatarUrl,
        variantId: e.variantId,
        sportId: e.sportId,
        sessionTypeId: e.sessionTypeId,
        shareNote: e.shareNote,
        createdAt: e.received_at,
      };
      PreviewModal.open({
        sharedWorkout,
        onSave: async () => {
          await _save(token);
        },
        onSchedule: async () => {
          if (ScheduleCalendar) {
            ScheduleCalendar.open({
              sharedWorkout,
              scaledWorkout: { sport_id: e.sportId, session_type_id: e.sessionTypeId, variant_id: e.variantId },
              onPick: ({ date, info }) => _afterPick(token, date, info, sharedWorkout),
            });
          }
        },
      });
      if (action === "schedule" && ScheduleCalendar) {
        ScheduleCalendar.open({
          sharedWorkout,
          scaledWorkout: { sport_id: e.sportId, session_type_id: e.sessionTypeId, variant_id: e.variantId },
          onPick: ({ date, info }) => _afterPick(token, date, info, sharedWorkout),
        });
      }
    });
  }

  async function _afterPick(token, date, info, sharedWorkout) {
    const Inbox = window.SharedWorkoutsInbox;
    const ConflictModal = window.ConflictResolutionModal;
    if (info && info.isConflict && ConflictModal) {
      const hasHardBlock = info.hardBlocks && info.hardBlocks.length > 0;
      ConflictModal.open({
        attemptedDate: date,
        conflicts: [...(info.hardBlocks || []), ...(info.warnings || [])],
        suggestedDate: info.result && info.result.suggestedDate,
        hasHardBlock,
        onMove: (newDate) => _commitSchedule(token, newDate, sharedWorkout),
        onOverride: () => !hasHardBlock && _commitSchedule(token, date, sharedWorkout),
      });
    } else {
      _commitSchedule(token, date, sharedWorkout);
    }
  }

  function _commitSchedule(token, date, sharedWorkout) {
    const Inbox = window.SharedWorkoutsInbox;
    // Insert a new schedule entry at the chosen date.
    let schedule = [];
    try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch {}
    schedule.push({
      id: "shared-" + token + "-" + Date.now(),
      date,
      type: sharedWorkout.sessionTypeId,
      sessionName: sharedWorkout.variantId,
      variant_id: sharedWorkout.variantId,
      sport_id: sharedWorkout.sportId,
      shared_from_token: token,
      source: "shared",
    });
    try {
      localStorage.setItem("workoutSchedule", JSON.stringify(schedule));
      if (typeof DB !== "undefined" && DB.syncSchedule) DB.syncSchedule();
    } catch {}
    Inbox.markAsScheduled(token, date);
    if (typeof renderCalendar === "function") renderCalendar();
    renderInboxTab();
  }

  async function _refreshBadge() {
    const Inbox  = window.SharedWorkoutsInbox;
    const Direct = window.WorkoutInboxDirect;
    const badge  = document.getElementById("inbox-tab-badge");
    if (!badge) return;

    let total = 0;
    try {
      if (Inbox && Inbox.getUnreadCount) {
        const n = await Inbox.getUnreadCount();
        total += n || 0;
      }
    } catch {}
    try {
      if (Direct && Direct.getUnreadCount) {
        const n = await Direct.getUnreadCount();
        total += n || 0;
      }
    } catch {}

    if (total > 0) {
      badge.textContent = total > 99 ? "99+" : String(total);
      badge.style.display = "";
      // Pulse animation on appearance
      if (!badge.classList.contains("has-count")) {
        badge.classList.add("has-count", "is-pulsing");
        setTimeout(() => badge.classList.remove("is-pulsing"), 1200);
      }
    } else {
      badge.style.display = "none";
      badge.classList.remove("has-count");
    }
  }

  const api = { renderInboxTab, refreshBadge: _refreshBadge };
  if (typeof window !== "undefined") {
    window.InboxTabView = api;
    // Wire change subscription so the badge updates anywhere the inbox changes.
    if (window.SharedWorkoutsInbox && window.SharedWorkoutsInbox.onChange) {
      window.SharedWorkoutsInbox.onChange(_refreshBadge);
    }
  }
})();
