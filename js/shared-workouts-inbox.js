// js/shared-workouts-inbox.js
//
// Object-centric inbox of workouts that have been shared with the current
// user. Implements FEATURE_SPEC_2026-04-09_workout_sharing.md → SHARED_WORKOUTS_INBOX.
//
// NOT a message thread, no replies, no read receipts. Each entry is a workout.

(function () {
  "use strict";

  const LOCAL_INBOX_KEY = "ironz_shared_inbox_v1";
  // Per-entry status: 'unread' | 'read' | 'saved' | 'scheduled' | 'dismissed'

  function _readLocal() {
    if (typeof localStorage === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(LOCAL_INBOX_KEY) || "[]"); } catch { return []; }
  }
  function _writeLocal(list) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(LOCAL_INBOX_KEY, JSON.stringify(list));
      if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey(LOCAL_INBOX_KEY);
    } catch {}
  }

  function _getSupabase() {
    if (typeof window !== "undefined" && window.supabaseClient) return window.supabaseClient;
    return null;
  }

  /**
   * Pull the inbox from local cache. Source of truth is local until the
   * receiver opens a share via deep link, which calls upsertEntry() to add it.
   * (We don't have a server-side "inbox" table — inbox state is per-device.)
   */
  async function listInbox() {
    const local = _readLocal();
    return local.sort((a, b) => (b.received_at || "").localeCompare(a.received_at || ""));
  }

  async function getUnreadCount() {
    const list = _readLocal();
    return list.filter(e => e.status === "unread").length;
  }

  /**
   * Insert or update an inbox entry. Called when the user follows a deep link
   * to a share — the deep link handler resolves the share via the link service
   * and pushes the resolved payload here.
   */
  async function upsertEntry(entry) {
    if (!entry || !entry.shareToken) return;
    const list = _readLocal();
    const existing = list.find(e => e.shareToken === entry.shareToken);
    const now = new Date().toISOString();
    if (existing) {
      Object.assign(existing, entry, { updated_at: now });
    } else {
      list.push({
        ...entry,
        status: entry.status || "unread",
        received_at: entry.received_at || now,
      });
    }
    _writeLocal(list);
    _notifyChange();
    return entry;
  }

  async function markAsRead(shareToken) {
    const list = _readLocal();
    const e = list.find(x => x.shareToken === shareToken);
    if (!e) return;
    if (e.status === "unread") {
      e.status = "read";
      _writeLocal(list);
      _notifyChange();
    }
  }

  async function markAsSaved(shareToken) {
    const list = _readLocal();
    const e = list.find(x => x.shareToken === shareToken);
    if (!e) return;
    e.status = "saved";
    _writeLocal(list);
    _notifyChange();
  }

  async function markAsScheduled(shareToken, scheduledFor) {
    const list = _readLocal();
    const e = list.find(x => x.shareToken === shareToken);
    if (!e) return;
    e.status = "scheduled";
    if (scheduledFor) e.scheduled_for_date = scheduledFor;
    _writeLocal(list);
    _notifyChange();
  }

  async function dismiss(shareToken) {
    const list = _readLocal();
    const e = list.find(x => x.shareToken === shareToken);
    if (!e) return;
    // Soft delete: status flips to dismissed but row stays for 30 days.
    e.status = "dismissed";
    e.dismissed_at = new Date().toISOString();
    _writeLocal(list);
    _notifyChange();
  }

  // Pub/sub so the UI tab can re-render on changes.
  const _listeners = new Set();
  function onChange(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  }
  function _notifyChange() {
    for (const fn of _listeners) {
      try { fn(); } catch {}
    }
  }

  // Test helper.
  function _resetForTests() {
    if (typeof localStorage !== "undefined") {
      try { localStorage.removeItem(LOCAL_INBOX_KEY); } catch {}
    }
    _listeners.clear();
  }

  const api = {
    listInbox,
    getUnreadCount,
    upsertEntry,
    markAsRead,
    markAsSaved,
    markAsScheduled,
    dismiss,
    onChange,
    _resetForTests,
  };

  if (typeof window !== "undefined") window.SharedWorkoutsInbox = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
