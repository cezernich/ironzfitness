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

  /**
   * Render the inbox tab into a target element.
   * @param {string} containerId — DOM id of the tab body
   */
  async function renderInboxTab(containerId) {
    const target = document.getElementById(containerId || "tab-inbox-content");
    if (!target) return;
    const Inbox = window.SharedWorkoutsInbox;
    if (!Inbox) {
      target.innerHTML = `<p class="hint">Inbox not loaded.</p>`;
      return;
    }
    const entries = (await Inbox.listInbox()).filter(e => e.status !== "dismissed");

    if (entries.length === 0) {
      target.innerHTML = `
        <div class="inbox-empty">
          <h2>Inbox</h2>
          <p>No shared workouts yet. When a friend shares a workout with you, it'll show up here.</p>
        </div>
      `;
      _refreshBadge();
      return;
    }

    target.innerHTML = `
      <h2 class="tab-h2">Inbox</h2>
      <div class="inbox-list">
        ${entries.map(_renderCard).join("")}
      </div>
    `;

    // Wire actions
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
            await Inbox.dismiss(token);
            renderInboxTab(containerId);
          }
        }
      });
    });
    target.querySelectorAll(".inbox-card").forEach(card => {
      card.addEventListener("click", async () => {
        const token = card.dataset.token;
        await Inbox.markAsRead(token);
        _openPreview(token);
      });
    });

    _refreshBadge();
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

  function _refreshBadge() {
    const Inbox = window.SharedWorkoutsInbox;
    if (!Inbox) return;
    Inbox.getUnreadCount().then(n => {
      const badge = document.getElementById("inbox-tab-badge");
      if (!badge) return;
      if (n > 0) {
        badge.textContent = String(n);
        badge.style.display = "";
      } else {
        badge.style.display = "none";
      }
    });
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
