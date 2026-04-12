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

    // Premium gate. When PREMIUM_ENABLED is false in subscription.js this is a
    // pass-through; when it flips on, the caller sees { ok:false, reason:"premium_required" }
    // after the upsell modal has already been shown.
    if (typeof window !== "undefined" && window.Subscription && typeof window.Subscription.requirePremium === "function") {
      const allowed = await window.Subscription.requirePremium("workout_inbox");
      if (!allowed) return { ok: false, reason: "premium_required" };
    }

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
  //
  // Routes through SavedWorkoutsLibrary.saveCustom so the entry lands in the
  // same `ironz_saved_workouts_v1` store the Saved tab reads from. Previously
  // this wrote directly to the legacy `savedWorkouts` key — which hasn't been
  // the source of truth since the library migration — so accepted inbox
  // workouts never appeared in the Saved Workouts tab.
  //
  // Input `item.workout_payload` shape (set by share-action-sheet.js at send
  // time via _buildPayloadFromEntry):
  //   { name, type, duration, notes, exercises?, segments?, intervals?, hiitMeta? }
  //
  // We unpack it into the fields saveCustom expects. Returns a promise that
  // resolves to the created saved-workout row (or null on failure).
  async function saveItemPayloadToLibrary(item) {
    if (!item || !item.workout_payload) return null;

    const Saved = (typeof window !== "undefined") ? window.SavedWorkoutsLibrary : null;
    if (!Saved || typeof Saved.saveCustom !== "function") {
      console.warn("[InboxDirect] SavedWorkoutsLibrary not loaded — cannot save to library");
      return null;
    }

    // Dedupe: if this inbox item was already accepted into the library, bail.
    try {
      const existing = await Saved.listSaved({ source: "custom" });
      if (existing && existing.some(s => s._sharedFromInboxId === item.id)) {
        return existing.find(s => s._sharedFromInboxId === item.id);
      }
    } catch {}

    const p = item.workout_payload || {};
    const type = item.workout_type || p.type || "general";

    // Map workout type → sport_id used by saveCustom
    const sportMap = {
      run: "run", running: "run",
      bike: "bike", cycling: "bike",
      swim: "swim", swimming: "swim",
      track_workout: "run", tempo_threshold: "run", speed_work: "run",
      hills: "run", long_run: "run", endurance: "run", easy_recovery: "run",
      fun_social: "run",
      weightlifting: "strength", bodyweight: "strength",
      hiit: "strength", hyrox: "strength",
      yoga: "strength",
    };
    const sportId = sportMap[type] || null;

    // If the sender sent aiSession.intervals, map them into a "segments"
    // shape so the Saved card's _renderCustomCard can render them via
    // buildSegmentTableHTML. Also include the raw intervals for the
    // calendar path that reads payload.intervals.
    let segments = p.segments || null;
    if (!segments && p.intervals && p.intervals.length) {
      segments = p.intervals.map(iv => ({
        name: iv.name || "Interval",
        duration: iv.duration || "",
        effort: iv.effort || iv.intensity || "Z2",
        details: iv.details || "",
      }));
    }

    const senderTag = item.sender_display_name ? `Shared by ${item.sender_display_name}` : "Shared workout";
    const notes = [senderTag, p.notes, item.message].filter(Boolean).join(" · ");

    const row = await Saved.saveCustom({
      name: item.workout_name || p.name || "Shared Workout",
      workout_kind: type,
      sport_id: sportId,
      exercises: p.exercises || null,
      segments: segments,
      hiitMeta: p.hiitMeta || null,
      notes: notes,
      duration: p.duration || null,
    });

    // Tag the row with the inbox ID so we can dedupe on subsequent accepts
    // and attribute the sender in the UI.
    if (row && !row.error) {
      try {
        const list = JSON.parse(localStorage.getItem("ironz_saved_workouts_v1") || "[]");
        const entry = list.find(s => s.id === row.id);
        if (entry) {
          entry._sharedFromInboxId = item.id;
          entry.shared_from_user_id = item.sender_id;
          entry.shared_from_name = item.sender_display_name;
          localStorage.setItem("ironz_saved_workouts_v1", JSON.stringify(list));
          if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("ironz_saved_workouts_v1");
        }
      } catch (e) {
        console.warn("[InboxDirect] failed to tag saved entry with inbox id:", e);
      }
    }

    return row;
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
