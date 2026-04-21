// js/threshold-reminders.js
//
// Threshold refresh reminder banner — SPEC_cardio_add_session_v1.md §3.4.
//
// Users are nudged to re-test their CSS pace / FTP / running threshold
// every 90 days. Stale thresholds mean workouts drift out of calibration.
// The banner is INFORMATIONAL (never blocks generation), dismissable for
// 14 days per-sport, and only fires when the threshold WAS set at some
// point — brand-new users without thresholds see the existing "log a
// test result" nudge instead.
//
// Public API (window.ThresholdReminders):
//   getStatus(sport)           → { stale, ageDays, lastUpdated, threshold, dismissedUntil }
//   buildBannerHtml(sport)     → string — empty when no banner should show
//   dismiss(sport)             → hide banner for 14 days
//   openSettings()             → scroll Settings → Training Zones into view
//
// Usage: render the banner HTML into your screen via buildBannerHtml('swim')
// (or 'cycling', 'running'). Attach the dismiss/open handlers by calling
// wireBanner(containerEl) after insert.

(function () {
  "use strict";

  const STALE_DAYS = 90;
  const DISMISS_DAYS = 14;
  const DISMISS_KEY = "threshold_reminder_dismissed";

  function _loadProfile() {
    try { return JSON.parse(localStorage.getItem("profile") || "{}") || {}; }
    catch { return {}; }
  }
  function _loadZones() {
    try { return JSON.parse(localStorage.getItem("trainingZones") || "{}") || {}; }
    catch { return {}; }
  }
  function _loadDismissed() {
    try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || "{}") || {}; }
    catch { return {}; }
  }
  function _saveDismissed(d) {
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(d)); } catch {}
  }

  function _daysBetween(iso, now) {
    if (!iso) return Infinity;
    try {
      const then = new Date(iso);
      const ms = (now || new Date()) - then;
      if (isNaN(ms)) return Infinity;
      return Math.max(0, Math.floor(ms / 86400000));
    } catch { return Infinity; }
  }

  // For a given sport, return the most recent "last updated" timestamp we
  // can find. We check, in order:
  //   1. profile.*Updated (the dedicated fields from the spec)
  //   2. trainingZones.<sport>.lastUpdated (the save-form timestamp)
  //   3. trainingZones.<sport>.calculatedAt (fallback — set by older save
  //      paths that didn't stamp lastUpdated; keeps the banner quiet for
  //      users whose zones were saved before the lastUpdated fix landed)
  //   4. profile.last_test.recorded_at if profile.last_test.sport matches
  function _lastUpdatedFor(sport, profile, zones) {
    const candidates = [];
    if (sport === "swim") {
      if (profile.cssTimeUpdated) candidates.push(profile.cssTimeUpdated);
      if (zones.swimming && zones.swimming.lastUpdated) candidates.push(zones.swimming.lastUpdated);
      if (zones.swimming && zones.swimming.calculatedAt) candidates.push(zones.swimming.calculatedAt);
      if (profile.last_test && profile.last_test.sport === "swim" && profile.last_test.recorded_at) {
        candidates.push(profile.last_test.recorded_at);
      }
    } else if (sport === "cycling") {
      if (profile.ftpUpdated) candidates.push(profile.ftpUpdated);
      if (zones.biking && zones.biking.lastUpdated) candidates.push(zones.biking.lastUpdated);
      if (zones.biking && zones.biking.calculatedAt) candidates.push(zones.biking.calculatedAt);
      if (profile.last_test && profile.last_test.sport === "cycling" && profile.last_test.recorded_at) {
        candidates.push(profile.last_test.recorded_at);
      }
    } else if (sport === "running") {
      if (profile.thresholdPaceUpdated) candidates.push(profile.thresholdPaceUpdated);
      if (zones.running && zones.running.lastUpdated) candidates.push(zones.running.lastUpdated);
      if (zones.running && zones.running.calculatedAt) candidates.push(zones.running.calculatedAt);
      if (profile.last_test && profile.last_test.sport === "running" && profile.last_test.recorded_at) {
        candidates.push(profile.last_test.recorded_at);
      }
    } else if (sport === "strength") {
      // Legacy: saveProfile used to stamp strengthThresholdUpdatedAt when
      // the profile-level 1RM fields changed. Those fields have moved to
      // the Training Zones → Strength form, which writes lastUpdated /
      // updatedAt onto zones.strength. Keep the legacy candidate so users
      // who saved a 1RM before the move still get a correct timestamp.
      if (profile.strengthThresholdUpdatedAt) candidates.push(profile.strengthThresholdUpdatedAt);
      if (zones.strength && zones.strength.lastUpdated) candidates.push(zones.strength.lastUpdated);
      if (zones.strength && zones.strength.updatedAt) candidates.push(zones.strength.updatedAt);
    }
    if (!candidates.length) return null;
    // Return the most recent
    return candidates.sort().slice(-1)[0];
  }

  // Check whether the sport's threshold has ever been set. Returns true only
  // when there's something to update — otherwise the existing "no threshold"
  // nudge applies and this banner stays quiet.
  function _hasThreshold(sport, profile, zones) {
    if (sport === "swim") {
      return !!(profile.css_sec_per_100m || profile.css || (zones.swimming && zones.swimming.css));
    }
    if (sport === "cycling") {
      return !!(profile.ftp_watts || profile.ftp || (zones.biking && zones.biking.ftp));
    }
    if (sport === "running") {
      return !!(profile.vdot || profile.run_vdot
        || (zones.running && (zones.running.vdot || zones.running.thresholdPaceMin || zones.running.tempo || zones.running.easyPaceMin)));
    }
    if (sport === "strength") {
      // Any reference lift in Training Zones → Strength counts as "set".
      // Also honor the legacy profile.*1RM fields so users who saved
      // 1RMs before the profile form was removed don't lose the banner.
      const s = zones.strength || {};
      const hasZoneLift = !!(
        (s.squat    && s.squat.weight > 0)    ||
        (s.bench    && s.bench.weight > 0)    ||
        (s.deadlift && s.deadlift.weight > 0) ||
        (s.ohp      && s.ohp.weight > 0)      ||
        (s.row      && s.row.weight > 0)
      );
      return hasZoneLift || !!(profile.squat1RM || profile.bench1RM || profile.deadlift1RM);
    }
    return false;
  }

  // getStatus(sport) — tells the caller everything they need to decide
  // whether to render the banner. `stale` is the gate: true means render.
  // Hard constraint (spec §6): threshold reminders suppressed within
  // 30 days of an A race. Testing this close to race day costs more in
  // fatigue than it gains in data. Returns the number of days until the
  // nearest upcoming A race, or null when no A race is within the
  // 30-day window.
  function _daysToNearestARace(now) {
    let events = [];
    try { events = JSON.parse(localStorage.getItem("events") || "[]") || []; } catch {}
    if (!Array.isArray(events) || events.length === 0) return null;
    const today = now || new Date();
    const todayMs = today.setHours(0, 0, 0, 0);
    let nearestDays = null;
    for (const ev of events) {
      if (!ev || !ev.date) continue;
      // Only A-priority races trigger the block. B/C races aren't
      // race-day-critical enough to gate threshold tests.
      const priority = String(ev.priority || "A").toUpperCase();
      if (priority !== "A") continue;
      const raceMs = new Date(ev.date + "T00:00:00").setHours(0, 0, 0, 0);
      const days = Math.floor((raceMs - todayMs) / 86400000);
      if (days >= 0 && days <= 30) {
        if (nearestDays == null || days < nearestDays) nearestDays = days;
      }
    }
    return nearestDays;
  }

  function getStatus(sport) {
    const profile = _loadProfile();
    const zones = _loadZones();
    const hasThreshold = _hasThreshold(sport, profile, zones);
    if (!hasThreshold) {
      return { stale: false, reason: "never_set", hasThreshold: false, ageDays: null, lastUpdated: null };
    }
    const lastUpdated = _lastUpdatedFor(sport, profile, zones);
    const ageDays = _daysBetween(lastUpdated);
    const dismissed = _loadDismissed();
    const dismissedUntil = dismissed[sport];
    const now = new Date();
    const dismissedActive = dismissedUntil && new Date(dismissedUntil) > now;
    const daysToRace = _daysToNearestARace(now);
    const raceWindow = daysToRace != null;
    const stale = !dismissedActive && !raceWindow && ageDays >= STALE_DAYS;
    return {
      stale,
      reason: stale ? "stale"
            : raceWindow ? "race_window"
            : dismissedActive ? "dismissed"
            : "fresh",
      hasThreshold: true,
      ageDays: isFinite(ageDays) ? ageDays : null,
      lastUpdated: lastUpdated || null,
      dismissedUntil: dismissedActive ? dismissedUntil : null,
      daysToRace: raceWindow ? daysToRace : null,
    };
  }

  const SPORT_LABELS = {
    swim:     { label: "swim threshold",    metric: "CSS pace" },
    cycling:  { label: "cycling FTP",       metric: "FTP" },
    running:  { label: "running threshold", metric: "threshold pace" },
    strength: { label: "strength numbers",  metric: "1RM" },
  };

  function _humanAge(days) {
    if (days == null || !isFinite(days)) return "a while";
    if (days < 120) {
      const months = Math.round(days / 30);
      return months <= 1 ? "over a month" : `${months} months`;
    }
    const months = Math.round(days / 30);
    if (months < 12) return `${months} months`;
    const years = Math.round(months / 12);
    return years === 1 ? "over a year" : `${years} years`;
  }

  function buildBannerHtml(sport) {
    const status = getStatus(sport);
    if (!status.stale) return "";
    const label = SPORT_LABELS[sport] || SPORT_LABELS.running;
    const ageText = _humanAge(status.ageDays);
    return `
      <div class="threshold-reminder" data-threshold-reminder="${sport}">
        <span class="threshold-reminder-icon">↻</span>
        <div class="threshold-reminder-body">
          <div class="threshold-reminder-title">Your ${label.label} was last updated ${ageText} ago.</div>
          <div class="threshold-reminder-sub">Re-test your ${label.metric} to keep workouts calibrated.</div>
        </div>
        <div class="threshold-reminder-actions">
          <button type="button" class="threshold-reminder-update" data-threshold-update="${sport}">Update</button>
          <button type="button" class="threshold-reminder-dismiss" data-threshold-dismiss="${sport}" aria-label="Dismiss">×</button>
        </div>
      </div>
    `;
  }

  // Hide the banner for 14 days. Uses delegation at the document level so
  // callers don't need to wire per-banner handlers — just render the HTML
  // and it Just Works.
  function dismiss(sport) {
    const dismissed = _loadDismissed();
    const until = new Date(Date.now() + DISMISS_DAYS * 86400000).toISOString();
    dismissed[sport] = until;
    _saveDismissed(dismissed);
    // Remove any visible banners for that sport immediately.
    document.querySelectorAll(`[data-threshold-reminder="${sport}"]`).forEach(el => el.remove());
  }

  // Sport key in this module ("swim"/"cycling"/"running"/"strength") maps to
  // the zones module's sport key ("swimming"/"biking"/"running"/"strength").
  const ZONES_SPORT_MAP = {
    swim: "swimming",
    cycling: "biking",
    running: "running",
    strength: "strength",
  };

  function openSettings(sport) {
    // Close the quick-entry wizard if it's open — the banner lives inside
    // that modal, and leaving it mounted blocks the Training tab underneath.
    try { if (typeof closeQuickEntry === "function") closeQuickEntry(); } catch {}

    try {
      if (typeof showTab === "function") showTab("training");
    } catch {}

    setTimeout(() => {
      const section = document.getElementById("section-running-zones");
      if (section) {
        section.classList.remove("is-collapsed");
      }
      // Switch the zones tab to the requested sport and open the update form.
      const zonesSport = ZONES_SPORT_MAP[sport];
      if (zonesSport && typeof selectZonesSport === "function") {
        try { selectZonesSport(zonesSport); } catch {}
      }
      if (typeof openUpdateZonesForm === "function") {
        try { openUpdateZonesForm(); } catch {}
      }
      if (section) {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);
  }

  // Document-level delegation for the banner buttons.
  if (typeof document !== "undefined" && !document.__thresholdRemindersWired) {
    document.__thresholdRemindersWired = true;
    document.addEventListener("click", function (e) {
      const dismissBtn = e.target.closest && e.target.closest("[data-threshold-dismiss]");
      if (dismissBtn) {
        e.stopPropagation();
        dismiss(dismissBtn.dataset.thresholdDismiss);
        return;
      }
      const updateBtn = e.target.closest && e.target.closest("[data-threshold-update]");
      if (updateBtn) {
        e.stopPropagation();
        openSettings(updateBtn.dataset.thresholdUpdate);
        return;
      }
    });
  }

  const api = {
    getStatus,
    buildBannerHtml,
    dismiss,
    openSettings,
    // Constants, exposed for tests.
    STALE_DAYS, DISMISS_DAYS,
  };
  if (typeof window !== "undefined") window.ThresholdReminders = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
