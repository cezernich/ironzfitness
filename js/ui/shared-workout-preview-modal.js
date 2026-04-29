// js/ui/shared-workout-preview-modal.js
//
// Modal #3: receiver's preview of an inbound shared workout.
// Shows sender attribution, the scaled workout in receiver's zones, and
// Save / Schedule actions. Matches the prototype receiver1 + receiver2 screens.

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
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  function _renderPhases(phases) {
    if (!Array.isArray(phases) || phases.length === 0) return "";
    return phases.map(p => `
      <div class="structure-row">
        <span class="structure-label">${_esc((p.phase || "").replace(/_/g, " "))}</span>
        <span class="structure-value">${_esc(p.instruction || p.target || "")}</span>
      </div>
    `).join("");
  }

  // Render the preview body for a list of strength/training exercises pulled
  // from training_sessions. Groups consecutive items by superset id so the
  // receiver sees the same structure the sender intended.
  function _renderExerciseList(exercises) {
    if (!Array.isArray(exercises) || exercises.length === 0) return "";
    const _row = (e) => {
      const parts = [];
      if (e.sets && e.reps) parts.push(`${e.sets} × ${e.reps}`);
      else if (e.reps) parts.push(`${e.reps} reps`);
      else if (e.duration) parts.push(String(e.duration));
      if (e.weight) parts.push(`@ ${e.weight}`);
      else if (e.intensity) parts.push(String(e.intensity));
      return `<div class="structure-row">
        <span class="structure-label">${_esc(e.name || "Exercise")}</span>
        <span class="structure-value">${_esc(parts.join(" · "))}</span>
      </div>`;
    };
    let html = "";
    let i = 0;
    while (i < exercises.length) {
      const ex = exercises[i];
      const gid = ex.supersetId || ex.supersetGroup || ex.repeatGroup;
      if (gid) {
        const group = [];
        while (i < exercises.length) {
          const g = exercises[i];
          if ((g.supersetId || g.supersetGroup || g.repeatGroup) === gid) {
            group.push(g); i++;
          } else break;
        }
        const sets = group[0].sets || group[0].groupSets || "";
        html += `<div class="structure-row" style="font-weight:600">${sets ? sets + "× " : ""}Superset</div>`;
        group.forEach(g => { html += _row(g); });
      } else {
        html += _row(ex);
        i++;
      }
    }
    return html;
  }

  // Lazy-load training_sessions row when the variant_id is a UUID. Shared
  // strength workouts and custom shares use a real training_sessions row
  // for the workout body — the validator's _scaleForReceiver doesn't have a
  // strength path, so we hydrate here.
  async function _hydrateExercisesFromTrainingSessions(variantId) {
    const _uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!variantId || !_uuidRe.test(variantId)) return null;
    const sb = (typeof window !== "undefined") ? window.supabaseClient : null;
    if (!sb) return null;
    try {
      const { data } = await sb
        .from("training_sessions")
        .select("session_name, exercises")
        .eq("id", variantId)
        .maybeSingle();
      if (!data) return null;
      let ex = data.exercises || [];
      if (typeof ex === "string") { try { ex = JSON.parse(ex); } catch { ex = []; } }
      return { name: data.session_name || null, exercises: Array.isArray(ex) ? ex : [] };
    } catch (e) {
      console.warn("[IronZ] preview hydration failed:", e);
      return null;
    }
  }

  /**
   * @param {Object} opts
   * @param {Object} opts.sharedWorkout — { shareToken, senderDisplayName, senderAvatarUrl,
   *   variantId, sportId, sessionTypeId, shareNote, createdAt }
   * @param {Function} [opts.onSave]
   * @param {Function} [opts.onSchedule]
   */
  async function open(opts) {
    if (!opts || !opts.sharedWorkout) return;
    const sw = opts.sharedWorkout;
    const id = "shared-preview-overlay";
    const old = document.getElementById(id);
    if (old) old.remove();

    // Validate to get the scaled workout in the receiver's zones.
    const Validator = (typeof window !== "undefined" && window.WorkoutImportValidator) || null;
    let canSave = true;
    let scaledWorkout = null;
    let validatorError = null;
    if (Validator && Validator.validateImport) {
      const result = Validator.validateImport({ sharedWorkout: sw, targetDate: null });
      canSave = result.canSave;
      scaledWorkout = result.scaledWorkout;
      validatorError = result.error || null;
    }

    // For shared strength / custom workouts the validator's _scaleForReceiver
    // can't fetch the body (no generator path), so hit training_sessions
    // directly here. Failure leaves us with the validator's minimal scaled
    // object and an empty body.
    let hydratedExercises = null;
    let hydratedName = null;
    const hydration = await _hydrateExercisesFromTrainingSessions(sw.variantId || sw.variant_id);
    if (hydration) {
      hydratedExercises = hydration.exercises;
      hydratedName = hydration.name;
    }

    const variantName = hydratedName
      || (scaledWorkout && scaledWorkout.variant_name)
      || sw.variantId || "Workout";
    const phasesHtml = scaledWorkout && scaledWorkout.phases ? _renderPhases(scaledWorkout.phases) : "";
    const exercisesHtml = hydratedExercises && hydratedExercises.length
      ? _renderExerciseList(hydratedExercises)
      : "";

    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "rating-modal-overlay";
    overlay.onclick = e => { if (e.target === overlay) _close(id); };

    if (validatorError === "INVALID_VARIANT") {
      // Render the legacy / no-longer-available error state.
      overlay.innerHTML = `
        <div class="rating-modal post-test-modal">
          <div class="post-test-modal-title">This workout is no longer available</div>
          <div class="post-test-modal-body">
            <p>The shared workout references a library variant that has been removed in a later update.</p>
          </div>
          <div class="post-test-modal-actions">
            <button class="rating-save-btn" id="shared-preview-close-btn">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add("visible"));
      overlay.querySelector("#shared-preview-close-btn").onclick = () => _close(id);
      return;
    }

    const senderName = sw.senderDisplayName || "A friend";
    const noteHtml = sw.shareNote
      ? `<div class="shared-note">"${_esc(sw.shareNote)}"</div>`
      : "";

    const ZTC = (typeof window !== "undefined" && window.ZoneTranslationCard) || null;
    const metricLabel =
      sw.sportId === "run"  ? "I-pace" :
      sw.sportId === "bike" ? "FTP" :
      sw.sportId === "swim" ? "CSS" : "Effort";
    const ztcHtml = ZTC ? ZTC.render({
      senderName,
      receiverPaceLabel: scaledWorkout && scaledWorkout.estimated_duration_min
        ? `~${scaledWorkout.estimated_duration_min} min`
        : "—",
      metricLabel,
    }) : "";

    overlay.innerHTML = `
      <div class="rating-modal shared-preview-modal">
        <div class="shared-from">
          <div class="avatar">${_esc(_initials(senderName))}</div>
          <div>
            <div class="shared-from-label">${_esc(senderName)} shared a workout</div>
            <div class="shared-from-name">${_esc(_formatRelative(sw.createdAt || sw.created_at))}</div>
          </div>
        </div>
        <div class="workout-card">
          <span class="highlight-badge">SCALED TO YOU</span>
          <div class="workout-title">${_esc(variantName)}</div>
          <div class="workout-subtitle">${_esc(sw.sportId || "")} · ${_esc(sw.sessionTypeId || "")}</div>
          ${ztcHtml}
          ${noteHtml}
          <div class="workout-structure">${phasesHtml}${exercisesHtml}</div>
          <button class="btn-primary" id="shared-preview-schedule">Add to my plan</button>
          <button class="btn-secondary" id="shared-preview-save">Save to library</button>
          <button class="btn-ghost" id="shared-preview-cancel">Not now</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    const $schedule = overlay.querySelector("#shared-preview-schedule");
    const $save = overlay.querySelector("#shared-preview-save");
    const $cancel = overlay.querySelector("#shared-preview-cancel");

    if ($schedule) {
      // canImport from validateImport({targetDate: null}) is always false
      // (it's only meaningful when a target date is supplied). The schedule
      // action just opens the calendar for date selection, so use canSave —
      // which reflects whether the workout is valid to import at all.
      $schedule.disabled = !canSave;
      $schedule.onclick = () => {
        _close(id);
        if (typeof opts.onSchedule === "function") opts.onSchedule({ sharedWorkout: sw, scaledWorkout });
      };
    }
    if ($save) {
      $save.disabled = !canSave;
      $save.onclick = () => {
        _close(id);
        if (typeof opts.onSave === "function") opts.onSave({ sharedWorkout: sw, scaledWorkout });
      };
    }
    if ($cancel) $cancel.onclick = () => _close(id);
  }

  const api = { open };
  if (typeof window !== "undefined") window.SharedWorkoutPreviewModal = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
