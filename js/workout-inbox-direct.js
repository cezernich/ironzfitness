// js/workout-inbox-direct.js
//
// Phase 2 direct-to-inbox workout sharing. Unlike the Phase 1 link-share flow
// (which writes to shared_workouts and is consumed via deep links), this
// module writes to the workout_inbox table: a user-to-user mailbox where the
// recipient is picked by email address at send time.
//
// Exposes window.WorkoutInboxDirect with:
//   sendToFriend(email, workoutPayload, workoutName, workoutType, message)
//   listReceived()
//   listSent()
//   getUnreadCount()
//   markAllRead()
//   acceptItem(itemId)
//   dismissItem(itemId)
//   getRecentRecipients()
//   addRecentRecipient(email)
//
// This module does NOT replace SharedWorkoutsInbox (link-share inbox). Both
// sources are merged in the inbox tab view.

(function () {
  "use strict";

  const RECENT_KEY = "recentShareRecipients";
  const RECENT_MAX = 5;

  function _client() {
    return (typeof window !== "undefined" && window.supabaseClient) || null;
  }

  async function _currentUserId() {
    const sb = _client();
    if (!sb) return null;
    try {
      const { data } = await sb.auth.getSession();
      return data?.session?.user?.id || null;
    } catch { return null; }
  }

  async function _currentDisplayName() {
    const sb = _client();
    if (!sb) return null;
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return null;
      const meta = session.user?.user_metadata || {};
      if (meta.full_name) return meta.full_name;
      // Fall back to profile
      const { data } = await sb.from("profiles").select("full_name")
        .eq("id", session.user.id).maybeSingle();
      return data?.full_name || session.user?.email || null;
    } catch { return null; }
  }

  // ── Profile lookup by email ──────────────────────────────────────────────

  async function _lookupRecipientByEmail(email) {
    const sb = _client();
    if (!sb || !email) return null;
    const cleaned = String(email).trim().toLowerCase();
    if (!cleaned) return null;
    try {
      const { data, error } = await sb.from("profiles")
        .select("id, full_name, email")
        .ilike("email", cleaned)
        .limit(1)
        .maybeSingle();
      if (error) { console.warn("[InboxDirect] lookup error:", error.message); return null; }
      return data || null;
    } catch (e) {
      console.warn("[InboxDirect] lookup exception:", e);
      return null;
    }
  }

  // ── Send ─────────────────────────────────────────────────────────────────

  /**
   * Send a workout payload to a user by email.
   * Returns { ok: true, recipient } on success,
   *         { ok: false, reason: "not_found" | "self_send" | "error", message }
   * on failure.
   */
  async function sendToFriend(email, workoutPayload, workoutName, workoutType, message) {
    const sb = _client();
    if (!sb) return { ok: false, reason: "error", message: "Not connected" };

    const senderId = await _currentUserId();
    if (!senderId) return { ok: false, reason: "error", message: "Please log in" };

    const recipient = await _lookupRecipientByEmail(email);
    if (!recipient) return { ok: false, reason: "not_found" };

    if (recipient.id === senderId) {
      return { ok: false, reason: "self_send", message: "You can't send a workout to yourself" };
    }

    const senderName = (await _currentDisplayName()) || "An IronZ user";

    const row = {
      sender_id: senderId,
      recipient_id: recipient.id,
      workout_payload: workoutPayload || {},
      workout_name: String(workoutName || "Workout").slice(0, 200),
      workout_type: workoutType || null,
      sender_display_name: senderName,
      message: message ? String(message).slice(0, 200) : null,
      status: "unread",
    };

    try {
      const { error } = await sb.from("workout_inbox").insert(row);
      if (error) {
        console.warn("[InboxDirect] send error:", error.message);
        return { ok: false, reason: "error", message: error.message };
      }
    } catch (e) {
      console.warn("[InboxDirect] send exception:", e);
      return { ok: false, reason: "error", message: e.message };
    }

    addRecentRecipient(email);
    return { ok: true, recipient };
  }

  // ── Listing ──────────────────────────────────────────────────────────────

  async function listReceived() {
    const sb = _client();
    if (!sb) return [];
    const uid = await _currentUserId();
    if (!uid) return [];
    try {
      const { data, error } = await sb.from("workout_inbox")
        .select("*")
        .eq("recipient_id", uid)
        .neq("status", "dismissed")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) { console.warn("[InboxDirect] listReceived error:", error.message); return []; }
      return data || [];
    } catch (e) { console.warn("[InboxDirect] listReceived exception:", e); return []; }
  }

  async function listSent() {
    const sb = _client();
    if (!sb) return [];
    const uid = await _currentUserId();
    if (!uid) return [];
    try {
      const { data, error } = await sb.from("workout_inbox")
        .select("*")
        .eq("sender_id", uid)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) { console.warn("[InboxDirect] listSent error:", error.message); return []; }
      const rows = data || [];
      // Enrich with recipient display names via a single batch query.
      // Falls back to "recipient" if the profile read fails.
      const recipientIds = [...new Set(rows.map(r => r.recipient_id).filter(Boolean))];
      if (recipientIds.length) {
        try {
          const { data: profs } = await sb.from("profiles")
            .select("id, full_name, email")
            .in("id", recipientIds);
          if (profs) {
            const byId = {};
            profs.forEach(p => { byId[p.id] = p; });
            rows.forEach(r => {
              const p = byId[r.recipient_id];
              r.recipient_display_name = (p && (p.full_name || p.email)) || "recipient";
            });
          }
        } catch {}
      }
      return rows;
    } catch (e) { console.warn("[InboxDirect] listSent exception:", e); return []; }
  }

  // ── Unread count / badge ─────────────────────────────────────────────────

  let _cachedUnreadCount = 0;
  let _cachedUnreadAt = 0;
  const _CACHE_TTL_MS = 60000;

  async function getUnreadCount(forceRefresh) {
    const now = Date.now();
    if (!forceRefresh && (now - _cachedUnreadAt) < _CACHE_TTL_MS) {
      return _cachedUnreadCount;
    }
    const sb = _client();
    if (!sb) return 0;
    const uid = await _currentUserId();
    if (!uid) return 0;
    try {
      const { count, error } = await sb.from("workout_inbox")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", uid)
        .eq("status", "unread");
      if (error) { console.warn("[InboxDirect] unread count error:", error.message); return 0; }
      _cachedUnreadCount = count || 0;
      _cachedUnreadAt = now;
      return _cachedUnreadCount;
    } catch (e) { console.warn("[InboxDirect] unread count exception:", e); return 0; }
  }

  async function markAllRead() {
    const sb = _client();
    if (!sb) return 0;
    const uid = await _currentUserId();
    if (!uid) return 0;
    try {
      const { error } = await sb.from("workout_inbox")
        .update({ status: "read" })
        .eq("recipient_id", uid)
        .eq("status", "unread");
      if (error) { console.warn("[InboxDirect] markAllRead error:", error.message); return 0; }
      _cachedUnreadCount = 0;
      _cachedUnreadAt = Date.now();
      return 1;
    } catch (e) { console.warn("[InboxDirect] markAllRead exception:", e); return 0; }
  }

  // ── Accept / Dismiss ─────────────────────────────────────────────────────

  async function acceptItem(itemId) {
    const sb = _client();
    if (!sb) return false;
    try {
      const { error } = await sb.from("workout_inbox")
        .update({ status: "accepted" })
        .eq("id", itemId);
      if (error) { console.warn("[InboxDirect] accept error:", error.message); return false; }
      return true;
    } catch (e) { console.warn("[InboxDirect] accept exception:", e); return false; }
  }

  async function dismissItem(itemId) {
    const sb = _client();
    if (!sb) return false;
    try {
      const { error } = await sb.from("workout_inbox")
        .update({ status: "dismissed" })
        .eq("id", itemId);
      if (error) { console.warn("[InboxDirect] dismiss error:", error.message); return false; }
      return true;
    } catch (e) { console.warn("[InboxDirect] dismiss exception:", e); return false; }
  }

  // ── Save accepted item to Library ────────────────────────────────────────

  // workout_inbox stores the full workout payload inline (not a share token),
  // so the existing SavedWorkoutsLibrary.saveFromShare path doesn't fit.
  // We append directly to the local savedWorkouts store using the same shape
  // that Saved Library expects for "custom" source entries.
  function saveItemPayloadToLibrary(item) {
    if (!item || !item.workout_payload) return null;

    let saved = [];
    try { saved = JSON.parse(localStorage.getItem("savedWorkouts") || "[]"); } catch {}

    const entry = {
      id: "inbox-" + item.id,
      name: item.workout_name,
      type: item.workout_type || "general",
      source: "shared",
      shared_from_user_id: item.sender_id,
      shared_from_name: item.sender_display_name,
      shared_from_inbox_id: item.id,
      payload: item.workout_payload,
      saved_at: new Date().toISOString(),
    };
    // Dedupe: if we've already saved this inbox item, don't duplicate.
    if (saved.some(s => s.shared_from_inbox_id === item.id)) return entry;

    saved.unshift(entry);
    try {
      localStorage.setItem("savedWorkouts", JSON.stringify(saved));
      if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("savedWorkouts");
    } catch (e) {
      console.warn("[InboxDirect] saveItemPayloadToLibrary write failed:", e);
    }
    return entry;
  }

  // ── Recent recipients (localStorage) ─────────────────────────────────────

  function getRecentRecipients() {
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      return Array.isArray(raw) ? raw.slice(0, RECENT_MAX) : [];
    } catch { return []; }
  }

  function addRecentRecipient(email) {
    const cleaned = String(email || "").trim().toLowerCase();
    if (!cleaned) return;
    const current = getRecentRecipients().filter(e => e.toLowerCase() !== cleaned);
    current.unshift(cleaned);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(current.slice(0, RECENT_MAX)));
    } catch {}
  }

  // ── Public API ───────────────────────────────────────────────────────────

  const api = {
    sendToFriend,
    listReceived,
    listSent,
    getUnreadCount,
    markAllRead,
    acceptItem,
    dismissItem,
    saveItemPayloadToLibrary,
    getRecentRecipients,
    addRecentRecipient,
    _lookupRecipientByEmail, // exposed for debugging
  };
  if (typeof window !== "undefined") window.WorkoutInboxDirect = api;
})();
