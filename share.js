// share.js — Direct share-link flow
//
// One-tap share icon. No modal, no note prompt. The icon creates (or reuses)
// a shared_workouts row in Supabase and either opens the native share sheet
// (iOS / Android Web Share API) or copies the preview URL to the clipboard
// and shows a toast.
//
// All share buttons across the app route through buildShareIconButton +
// shareWorkoutLink so styling and behavior stay identical everywhere.

const SHARE_PREVIEW_BASE = "https://dagdpdcwqdlibxbitdgr.supabase.co/functions/v1/share-preview";

// SVG used for every share icon in the app. 20px square, currentColor so
// themes can tint it. Arrow-out-of-box icon matching platform conventions.
const _SHARE_ICON_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';

// Cache for the entry blob so icon onclick handlers only need a short key.
const _shareEntryCache = {};
let _shareCacheSeq = 0;

/**
 * Stash an entry in the share cache and return its lookup key. Exposed so
 * callers that build their own button HTML can still register an entry
 * with the share subsystem.
 */
function stashShareEntry(entry) {
  if (!entry) return null;
  const cacheKey = "se" + (++_shareCacheSeq);
  _shareEntryCache[cacheKey] = entry;
  return cacheKey;
}

/**
 * Build the icon-only share button. Use this everywhere — don't roll your own.
 *
 * Emits a `data-share-key` + `data-share-source` pair instead of an inline
 * onclick. A document-level delegator (see below) resolves the click. This
 * avoids inline-onclick scope-resolution bugs on nested clickable parents
 * (card headers with toggleSection) and keeps the button working even when
 * the template renders into an otherwise-event-greedy container.
 *
 * @param {Object} entry  The workout/session/plan entry to share. Must carry
 *                        enough shape for shareWorkoutLink to build a payload
 *                        (name, exercises/segments/intervals, etc.).
 * @param {string} source  "calendar" | "history" | "saved" — used for
 *                         analytics.
 */
function buildShareIconButton(entry, source) {
  if (!entry) return "";
  const cacheKey = stashShareEntry(entry);
  return '<button type="button" class="share-icon-btn" title="Share" aria-label="Share workout"'
       + ' data-share-key="' + cacheKey + '" data-share-source="' + (source || "unknown") + '">'
       + _SHARE_ICON_SVG
       + '</button>';
}

/**
 * Share button click entry point. Shows the action sheet with
 * "Copy link" vs "Send to friend" options. Both options route to
 * their respective handlers — shareWorkoutLinkDirect for the link
 * flow, ShareActionSheet.openSendModal for the email flow.
 */
function shareWorkoutLink(cacheKey, source) {
  const entry = _shareEntryCache[cacheKey];
  if (!entry) { console.warn("[IronZ] share: entry not in cache"); return; }
  if (window.ShareActionSheet && window.ShareActionSheet.open) {
    window.ShareActionSheet.open(entry, source);
  } else {
    // Fallback if the action sheet module didn't load — go straight to
    // the legacy direct-link flow so sharing still works.
    shareWorkoutLinkDirect(entry, source);
  }
}

/**
 * Direct-share: create (or reuse) a shared_workouts row, then either open
 * the native share sheet or copy the preview URL to the clipboard.
 * Called by ShareActionSheet when the user picks "Copy link".
 */
async function shareWorkoutLinkDirect(entry, source) {
  if (!entry) { console.warn("[IronZ] share: no entry"); return; }

  const sb = window.supabaseClient;
  if (!sb) { _showShareToast("Can't share — not connected."); return; }

  let userId = null;
  try {
    const { data } = await sb.auth.getUser();
    userId = data && data.user && data.user.id;
  } catch {}
  if (!userId) { _showShareToast("Please log in to share."); return; }

  // Pull name + payload from the entry using the same field priority as
  // other render paths.
  const sportMap = { run: "run", running: "run", bike: "bike", cycling: "bike", swim: "swim", swimming: "swim",
    triathlon: "run", brick: "run", general: "strength", hiit: "hybrid",
    weightlifting: "strength", yoga: "strength", bodyweight: "strength", stairstepper: "run", hyrox: "hybrid" };
  const sportId = entry.sport_id || entry.sportId || sportMap[entry.discipline || entry.type] || "run";
  const sessionTypeId = entry.session_type_id || entry.sessionTypeId || entry.type || entry.discipline || "general";
  const workoutName = entry.sessionName || entry.name || entry.title
    || (entry.aiSession && entry.aiSession.title)
    || (entry.custom_name)
    || ((typeof _WORKOUT_TYPE_LABELS !== "undefined" && _WORKOUT_TYPE_LABELS[sessionTypeId])
        || (typeof capitalize === "function" ? capitalize(sessionTypeId) : sessionTypeId)
        || "Workout");

  // Reuse an existing share_token if this entry has been shared before —
  // keeps the same URL stable across taps.
  if (entry._lastShareToken) {
    _handleShareUrl(workoutName, entry._lastShareToken, source, sessionTypeId);
    return;
  }

  // Build the exercises array for the training_sessions row that the
  // share-preview edge function reads from.
  const exercises = _collectEntryExercises(entry);

  // Step 1: insert the full workout data into training_sessions so the
  // share-preview edge function has something to render.
  let realVariantId = entry.variant_id || entry.variantId || null;
  try {
    const tsPayload = {
      user_id: userId,
      session_name: workoutName,
      session_type: sessionTypeId,
      status: "shared",
      exercises: exercises.length ? exercises : null,
      data: { sport_id: sportId },
    };
    const { data: tsRow, error: tsErr } = await sb
      .from("training_sessions")
      .insert(tsPayload)
      .select("id")
      .single();
    if (tsErr) console.warn("[IronZ] training_sessions insert error:", tsErr);
    else if (tsRow && tsRow.id) realVariantId = tsRow.id;
  } catch (e) {
    console.warn("[IronZ] training_sessions insert exception:", e);
  }

  // Step 2: insert the share row.
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
  try {
    const { error } = await sb.from("shared_workouts").insert({
      share_token: token,
      sender_user_id: userId,
      variant_id: realVariantId,
      sport_id: sportId,
      session_type_id: sessionTypeId,
      share_note: null,
      expires_at: expiresAt,
    });
    if (error) {
      console.warn("[IronZ] shared_workouts insert failed:", error);
      // Fall back to copying a text summary.
      _fallbackTextShare(workoutName, exercises);
      return;
    }
  } catch (e) {
    console.warn("[IronZ] shared_workouts insert exception:", e);
    _fallbackTextShare(workoutName, exercises);
    return;
  }

  entry._lastShareToken = token;
  _handleShareUrl(workoutName, token, source, sessionTypeId);
}

// Trigger navigator.share or clipboard + toast. Analytics logged here.
async function _handleShareUrl(workoutName, token, source, sessionTypeId) {
  const url = SHARE_PREVIEW_BASE + "?id=" + encodeURIComponent(token);
  let method = "link";

  if (navigator.share) {
    try {
      await navigator.share({ title: workoutName, url });
      method = "native";
    } catch {
      // User cancelled or the share call threw — fall through to clipboard.
      method = "cancel";
    }
  }
  if (method !== "native" && method !== "cancel") {
    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url; ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    _showShareToast("Link copied!");
    method = "clipboard";
  } else if (method === "cancel") {
    // User cancelled native share — no toast, no analytics.
    return;
  }

  if (typeof trackEvent === "function") {
    trackEvent("workout_shared", { source: source || "unknown", method });
  }
}

// Build an exercises array out of whatever shape the entry has. Handles
// aiSession.intervals (logged cardio), exercises[] (strength), generatedSession
// (plan entries), and payload.exercises / payload.segments (saved library).
function _collectEntryExercises(entry) {
  const out = [];
  // Source: aiSession.intervals
  const ai = entry.aiSession && entry.aiSession.intervals;
  if (ai && ai.length) {
    ai.forEach(iv => out.push({
      name: iv.name || "Interval",
      duration: iv.duration || "",
      intensity: iv.effort || iv.intensity || "",
      details: iv.details || "",
      reps: iv.reps || null,
      repeatGroup: iv.repeatGroup || null,
      groupSets: iv.groupSets || null,
    }));
    return out;
  }
  // Source: strength exercises
  if (entry.exercises && entry.exercises.length) {
    entry.exercises.forEach(ex => out.push({
      name: ex.name || "Exercise",
      sets: ex.sets || null,
      reps: ex.reps || null,
      weight: ex.weight || null,
      duration: ex.duration || null,
      perSet: ex.perSet || ex.setDetails || null,
      supersetGroup: ex.supersetGroup || ex.supersetId || null,
    }));
    return out;
  }
  // Source: endurance segments
  if (entry.segments && entry.segments.length) {
    entry.segments.forEach(s => out.push({
      name: s.name || "Segment",
      duration: s.duration || "",
      intensity: s.effort || s.intensity || s.zone || "",
      details: s.details || "",
      discipline: s.discipline || null,
    }));
    return out;
  }
  // Source: generatedSession.steps (plan entries)
  const gs = entry.generatedSession;
  if (gs && gs.steps && gs.steps.length) {
    gs.steps.forEach(s => out.push({
      name: s.label || s.type || "Step",
      duration: s.duration ? s.duration + " min" : "",
      intensity: s.zone ? "Z" + s.zone : "",
      reps: s.reps || null,
    }));
    return out;
  }
  // Source: saved-library payload
  const p = entry.payload;
  if (p) {
    const src = p.exercises || p.segments || p.intervals;
    if (src && src.length) {
      src.forEach(ex => out.push({
        name: ex.name || "Exercise",
        sets: ex.sets || null,
        reps: ex.reps || null,
        weight: ex.weight || null,
        duration: ex.duration || "",
        intensity: ex.intensity || ex.effort || "",
        details: ex.details || "",
      }));
    }
  }
  return out;
}

// When Supabase is unreachable, copy a plain-text summary so the user still
// has something to paste.
function _fallbackTextShare(workoutName, exercises) {
  const lines = [workoutName];
  exercises.forEach(ex => {
    let line = ex.name || "Interval";
    if (ex.sets) line += ` · ${ex.sets} sets`;
    if (ex.reps) line += ` × ${ex.reps}`;
    if (ex.duration) line += ` · ${ex.duration}`;
    if (ex.weight) line += ` @ ${ex.weight}`;
    lines.push(line);
  });
  lines.push("", "— IronZ");
  const text = lines.join("\n");
  try { navigator.clipboard.writeText(text); } catch {}
  _showShareToast("Workout copied!");
}

// Fixed bottom-center toast — 2s auto-dismiss. Reused for every share outcome.
function _showShareToast(msg) {
  const existing = document.getElementById("ironz-share-toast");
  if (existing) existing.remove();
  const t = document.createElement("div");
  t.id = "ironz-share-toast";
  t.className = "ironz-share-toast";
  t.textContent = msg;
  document.body.appendChild(t);
  // Allow CSS transition
  requestAnimationFrame(() => t.classList.add("is-visible"));
  setTimeout(() => {
    t.classList.remove("is-visible");
    setTimeout(() => { try { t.remove(); } catch {} }, 250);
  }, 2000);
}

// ═════════════════════════════════════════════════════════════════════════════
// Back-compat shims — older call sites are progressively migrated to the
// new flow. These delegate to the direct-share path so nothing breaks during
// the migration.
// ═════════════════════════════════════════════════════════════════════════════

function buildShareButton(workoutId, dateStr) {
  // Legacy — used by calendar.js:1585 after workout completion. Resolve the
  // workout from localStorage so we can pass it through the new flow.
  const entry = _resolveWorkoutById(workoutId) || { id: workoutId, date: dateStr };
  return buildShareIconButton(entry, "calendar");
}

function openShareModal(workoutId, dateStr) {
  // Legacy — directly share the link instead of opening the old modal.
  const entry = _resolveWorkoutById(workoutId);
  if (!entry) return;
  const cacheKey = "se" + (++_shareCacheSeq);
  _shareEntryCache[cacheKey] = entry;
  shareWorkoutLink(cacheKey, "calendar");
}

function closeShareModal() { /* no-op */ }
function copyShareText(workoutId) { openShareModal(workoutId); }
function shareNative(workoutId) { openShareModal(workoutId); }

function _resolveWorkoutById(workoutId) {
  try {
    const list = JSON.parse(localStorage.getItem("workouts") || "[]");
    return list.find(w => String(w.id) === String(workoutId)) || null;
  } catch { return null; }
}

// Direct click handler attached per-button. Document-level delegation proved
// unreliable against card headers with inline onclick="toggleSection(...)".
// Attaching the handler directly to the button element runs at target phase
// and stopPropagation prevents the parent's bubble-phase inline handler
// from firing.
function _wireShareButton(btn) {
  if (!btn || btn.dataset.shareWired === "1") return;
  btn.dataset.shareWired = "1";
  btn.addEventListener("click", function (e) {
    e.stopPropagation();
    e.preventDefault();
    const key = this.getAttribute("data-share-key");
    const source = this.getAttribute("data-share-source") || "unknown";
    // Resolve entry from share.js's cache or the calendar fallback cache
    let entry = _shareEntryCache[key];
    if (!entry && typeof window !== "undefined" && window.__calShareFallbackCache) {
      entry = window.__calShareFallbackCache[key];
    }
    if (!entry) { console.warn("[IronZ] share: entry not in cache for key", key); return; }
    if (window.ShareActionSheet && window.ShareActionSheet.open) {
      window.ShareActionSheet.open(entry, source);
    } else {
      shareWorkoutLinkDirect(entry, source);
    }
  });
}

// ─── Per-set exercise-row toggle delegator ───────────────────────────────────
//
// The "Customize per set" / "Collapse" button on manual strength-entry rows
// (calendar.js qeAddExerciseRow, custom-plan.js cpManualAddExRow,
// workout-editor.js _addEditRow, workouts.js addExerciseRow) was using
// inline onclick="qeTogglePerSet(...)" which was silently not firing on the
// live site. Routing through a document-level listener bypasses whatever
// inline-onclick resolution issue was blocking the click.
//
// Each builder tags its toggle with data-pyr-toggle="<scope>:<id>" where
// scope is "qe"|"cp"|"edit"|"ex" and id identifies the row. The handler
// looks up the corresponding toggle function on window and calls it with
// the id (or the row element for "ex" which uses element-based routing).
function _wirePerSetToggleDelegator() {
  if (typeof document === "undefined") return;
  if (document.__pyrToggleWired) return;
  document.__pyrToggleWired = true;

  console.log("[PYR-DEBUG] share.js: per-set click delegator registered");

  // ── Click: "Customize per set" / "Collapse" toggle ─────────────────────
  document.addEventListener("click", function (e) {
    // TEMP DIAGNOSTIC — see ironz issue trace. Remove after verifying fix.
    console.log("[PYR-DEBUG] click delegator fired", {
      target: e.target,
      tag: e.target && e.target.tagName,
      className: e.target && e.target.className,
    });
    const btn = e.target && e.target.closest && e.target.closest(".ex-row-customize-toggle");
    console.log("[PYR-DEBUG] closest .ex-row-customize-toggle →", btn);
    if (!btn) return;
    e.stopPropagation();
    e.preventDefault();
    // Prefer the data-pyr-toggle attribute; fall back to legacy id parsing.
    const attr = btn.getAttribute("data-pyr-toggle") || "";
    console.log("[PYR-DEBUG] data-pyr-toggle attr =", JSON.stringify(attr), "btn.id =", btn.id);
    let scope = "", rowId = "";
    if (attr) {
      const parts = attr.split(":");
      scope = parts[0]; rowId = parts[1] || "";
    } else if (btn.id) {
      // Legacy: e.g. "qe-pyr-toggle-3" → scope="qe", rowId="3"
      const m = btn.id.match(/^(qe|cp|edit)-pyr-toggle-(.+)$/);
      if (m) { scope = m[1]; rowId = m[2]; }
    }
    console.log("[PYR-DEBUG] dispatch scope=", scope, "rowId=", rowId,
      "window.qeTogglePerSet?", typeof window.qeTogglePerSet,
      "window.cpTogglePerSet?", typeof window.cpTogglePerSet,
      "window.editTogglePerSet?", typeof window.editTogglePerSet,
      "window.exTogglePerSet?", typeof window.exTogglePerSet);
    if (scope === "qe" && typeof window.qeTogglePerSet === "function") {
      window.qeTogglePerSet(rowId);
    } else if (scope === "cp" && typeof window.cpTogglePerSet === "function") {
      window.cpTogglePerSet(rowId);
    } else if (scope === "edit" && typeof window.editTogglePerSet === "function") {
      window.editTogglePerSet(rowId);
    } else if (typeof window.exTogglePerSet === "function") {
      // workouts.js path — pass the button element
      window.exTogglePerSet(btn);
    } else {
      console.warn("[IronZ] per-set toggle: no handler for scope", scope, "attr", attr);
    }
  });

  // ── Input: Sets / Reps / Weight fields drive per-set row rebuild ──────
  // Inputs are tagged with data-pyr-field="<scope>:<kind>:<id>" where kind
  // is "sets" or "default" (Reps/Weight both count as defaults).
  document.addEventListener("input", function (e) {
    const inp = e.target && e.target.closest && e.target.closest("[data-pyr-field]");
    if (!inp) return;
    const parts = inp.getAttribute("data-pyr-field").split(":");
    const scope = parts[0], kind = parts[1], rowId = parts[2] || "";
    if (scope === "qe") {
      if (kind === "sets" && typeof window.qePyramidSetsChanged === "function") window.qePyramidSetsChanged(rowId);
      else if (kind === "default" && typeof window.qePyramidDefaultsChanged === "function") window.qePyramidDefaultsChanged(rowId);
    } else if (scope === "cp") {
      if (kind === "sets" && typeof window.cpPyramidSetsChanged === "function") window.cpPyramidSetsChanged(rowId);
      else if (kind === "default" && typeof window.cpPyramidDefaultsChanged === "function") window.cpPyramidDefaultsChanged(rowId);
    } else if (scope === "edit") {
      if (kind === "sets" && typeof window.editSetCountChanged === "function") window.editSetCountChanged(rowId);
      else if (kind === "default" && typeof window.editDefaultsChanged === "function") window.editDefaultsChanged(rowId);
    } else if (scope === "ex") {
      if (kind === "sets" && typeof window.exPyramidSetsChanged === "function") window.exPyramidSetsChanged(inp);
      else if (kind === "default" && typeof window.exPyramidDefaultsChanged === "function") window.exPyramidDefaultsChanged(inp);
    }
  });
}
console.log("[PYR-DEBUG] share.js: about to call _wirePerSetToggleDelegator()");
_wirePerSetToggleDelegator();
console.log("[PYR-DEBUG] share.js: _wirePerSetToggleDelegator() returned, document.__pyrToggleWired=", typeof document !== "undefined" ? document.__pyrToggleWired : "no-document");

// Wire every existing share button under `root` (or the whole document).
function _wireAllShareButtons(root) {
  const target = root || document;
  if (!target || typeof target.querySelectorAll !== "function") return;
  target.querySelectorAll(".share-icon-btn[data-share-key]").forEach(_wireShareButton);
}

// Auto-wire any new share buttons added to the DOM. Uses a MutationObserver
// so every render path in the app (calendar day-detail, workout history,
// saved library, community cards, completion badge) gets wired for free
// without needing to call a helper after every innerHTML assignment.
if (typeof document !== "undefined") {
  // Initial sweep for anything already in the DOM when share.js loads.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { _wireAllShareButtons(document); });
  } else {
    _wireAllShareButtons(document);
  }

  // Watch for future insertions. This fires on every renderDayDetail,
  // renderWorkoutHistory, renderSavedLibraryTab, etc.
  if (typeof MutationObserver !== "undefined") {
    const obs = new MutationObserver(function (mutations) {
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (!m.addedNodes) continue;
        for (let j = 0; j < m.addedNodes.length; j++) {
          const node = m.addedNodes[j];
          if (node.nodeType !== 1) continue; // element nodes only
          if (node.matches && node.matches(".share-icon-btn[data-share-key]")) {
            _wireShareButton(node);
          } else if (node.querySelectorAll) {
            node.querySelectorAll(".share-icon-btn[data-share-key]").forEach(_wireShareButton);
          }
        }
      }
    });
    obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }
}

// Expose for module-less script use
if (typeof window !== "undefined") {
  window.stashShareEntry = stashShareEntry;
  window.buildShareIconButton = buildShareIconButton;
  window.shareWorkoutLink = shareWorkoutLink;
  window.shareWorkoutLinkDirect = shareWorkoutLinkDirect;
  window._showShareToast = _showShareToast;
  window.buildShareButton = buildShareButton;
  window.openShareModal = openShareModal;
  window.closeShareModal = closeShareModal;
  window.copyShareText = copyShareText;
  window.shareNative = shareNative;
}
