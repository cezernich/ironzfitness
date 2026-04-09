// js/workout-completion-notification.js
//
// Client-side hook into the workout completion flow. When a workout that
// has shared_from_token is marked complete, fire the Edge Function to
// notify the sender.
//
// Implements FEATURE_SPEC_2026-04-09_workout_sharing.md → WORKOUT_COMPLETION_NOTIFICATION.

(function () {
  "use strict";

  function _edgeUrl() {
    if (typeof window === "undefined") return null;
    if (window.IRONZ_NOTIFY_SHARE_COMPLETION_URL) return window.IRONZ_NOTIFY_SHARE_COMPLETION_URL;
    if (window.SUPABASE_URL) return `${window.SUPABASE_URL}/functions/v1/notify-share-completion`;
    if (window.supabaseClient && window.supabaseClient.supabaseUrl) {
      return `${window.supabaseClient.supabaseUrl}/functions/v1/notify-share-completion`;
    }
    return null;
  }

  /**
   * Fire-and-forget notification of a shared-workout completion.
   * Called from the existing workout completion code path.
   *
   * @param {Object} opts
   * @param {string} opts.shareToken
   * @param {number} [opts.deltaPercent] — receiver's pace delta vs target
   */
  async function notifyCompletion(opts) {
    if (!opts || !opts.shareToken) return { error: "missing_token" };
    const url = _edgeUrl();
    if (!url) return { error: "no_url" };

    let token = null;
    try {
      if (typeof window !== "undefined" && window.supabaseClient) {
        const session = await window.supabaseClient.auth.getSession();
        token = session && session.data && session.data.session && session.data.session.access_token;
      }
    } catch {}
    if (!token) return { error: "no_auth" };

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          share_token: opts.shareToken,
          receiver_delta_percent: opts.deltaPercent != null ? Number(opts.deltaPercent) : null,
        }),
      });
      if (!resp.ok) return { error: `api_${resp.status}` };
      return { ok: true };
    } catch (e) {
      return { error: "network_error" };
    }
  }

  /**
   * Hook to be called from the existing workout completion flow.
   * Pass the workout that was just marked complete.
   */
  async function onWorkoutCompleted(workout) {
    if (!workout) return;
    const token = workout.shared_from_token || workout.share_token;
    if (!token) return;
    const deltaPercent = (workout.target_duration_min && workout.actual_duration_min)
      ? ((workout.actual_duration_min - workout.target_duration_min) / workout.target_duration_min) * 100
      : null;
    return notifyCompletion({ shareToken: token, deltaPercent });
  }

  const api = { notifyCompletion, onWorkoutCompleted };
  if (typeof window !== "undefined") window.WorkoutCompletionNotification = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
