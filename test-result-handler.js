// test-result-handler.js
// Centralized handler for ingesting threshold-week test results, sanity-checking
// them against the user's prior value, persisting both the new value and the
// archived prior value to fitness_history, and triggering a zone recalculation.
//
// Implements PHILOSOPHY_UPDATE_2026-04-09_threshold_weeks.md (post_test_workflow).
//
// Public surface: window.TestResultHandler

(function () {
  "use strict";

  const SANITY_PCT_LIMIT = 15; // ±15% from prior — see TRAINING_THRESHOLD_WEEK.validation_rules

  // ─── Sport-specific calculations ─────────────────────────────────────────────

  function vdotFromFiveK(finishTimeSeconds) {
    // Daniels VDOT lookup table for 5K finish time → VDOT.
    // Excerpted key values; we interpolate linearly between rows.
    const TABLE = [
      // [seconds, vdot]
      [1140, 85], // 19:00
      [1200, 80], // 20:00
      [1260, 76], // 21:00
      [1320, 72], // 22:00
      [1380, 68], // 23:00
      [1440, 65], // 24:00
      [1500, 62], // 25:00
      [1560, 59], // 26:00
      [1620, 56], // 27:00
      [1680, 54], // 28:00
      [1740, 52], // 29:00
      [1800, 50], // 30:00
      [1860, 48], // 31:00
      [1920, 46], // 32:00
      [1980, 45], // 33:00
      [2040, 43], // 34:00
      [2100, 42], // 35:00
      [2160, 40], // 36:00
      [2220, 39], // 37:00
      [2280, 38], // 38:00
      [2340, 37], // 39:00
      [2400, 36], // 40:00
      [2460, 34], // 41:00
      [2520, 33], // 42:00
      [2700, 30], // 45:00
      [2880, 28], // 48:00
    ];
    const t = Number(finishTimeSeconds);
    if (!t || t <= 0) return null;
    if (t <= TABLE[0][0]) return TABLE[0][1];
    if (t >= TABLE[TABLE.length - 1][0]) return TABLE[TABLE.length - 1][1];
    for (let i = 0; i < TABLE.length - 1; i++) {
      const [t1, v1] = TABLE[i];
      const [t2, v2] = TABLE[i + 1];
      if (t >= t1 && t <= t2) {
        const frac = (t - t1) / (t2 - t1);
        return Math.round((v1 + (v2 - v1) * frac) * 10) / 10;
      }
    }
    return null;
  }

  function ftpFromTwentyMin(avgPower20min) {
    const p = Number(avgPower20min);
    if (!p || p <= 0) return null;
    return Math.round(p * 0.95);
  }

  function cssFromFourHundredAndTwoHundred(t400, t200) {
    const a = Number(t400);
    const b = Number(t200);
    if (!a || !b || a <= b) return null;
    return Math.round(((a - b) / 2) * 10) / 10;
  }

  // ─── Profile helpers ─────────────────────────────────────────────────────────

  function loadProfile() {
    try { return JSON.parse(localStorage.getItem("profile") || "{}"); }
    catch { return {}; }
  }

  function saveProfile(p) {
    try {
      localStorage.setItem("profile", JSON.stringify(p));
      if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("profile");
    } catch (e) {
      console.warn("[IronZ] Failed to persist profile:", e.message);
    }
  }

  function getPriorValue(profile, sport) {
    if (sport === "run")  return Number(profile.vdot || profile.run_vdot) || null;
    if (sport === "bike") return Number(profile.ftp_watts || profile.ftp) || null;
    if (sport === "swim") return Number(profile.css_sec_per_100m || profile.css) || null;
    return null;
  }

  function writeNewValue(profile, sport, value) {
    const nowIso = new Date().toISOString();
    if (sport === "run")  { profile.vdot = value; profile.run_vdot = value; profile.thresholdPaceUpdated = nowIso; }
    if (sport === "bike") { profile.ftp_watts = value; profile.ftp = value; profile.ftpUpdated = nowIso; }
    if (sport === "swim") { profile.css_sec_per_100m = value; profile.css = value; profile.cssTimeUpdated = nowIso; }
    profile.last_test = {
      sport, value, recorded_at: nowIso
    };
    return profile;
  }

  // ─── Sanity check ────────────────────────────────────────────────────────────

  function sanityCheck(prior, next) {
    if (!prior || prior <= 0) return { ok: true, changePct: null };
    const changePct = Math.round(((next - prior) / prior) * 1000) / 10;
    if (Math.abs(changePct) > SANITY_PCT_LIMIT) {
      return { ok: false, changePct };
    }
    return { ok: true, changePct };
  }

  // ─── Persistence: fitness_history ────────────────────────────────────────────

  function archivePriorToHistory(sport, metricType, priorValue, source) {
    if (!priorValue) return;
    const row = {
      sport,
      metric_type: metricType,
      value: priorValue,
      source: source || "threshold_week_test",
      recorded_at: new Date().toISOString(),
    };
    // Local mirror
    let local = [];
    try { local = JSON.parse(localStorage.getItem("fitness_history") || "[]"); }
    catch { local = []; }
    local.push(row);
    try {
      localStorage.setItem("fitness_history", JSON.stringify(local));
      if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("fitness_history");
    } catch (e) {
      console.warn("[IronZ] Failed to persist fitness_history locally:", e.message);
    }

    // Best-effort Supabase insert (the table is created by the 20260409 migration)
    try {
      if (typeof window !== "undefined" && window.supabaseClient) {
        const sb = window.supabaseClient;
        sb.auth.getUser().then(({ data }) => {
          if (data && data.user) {
            sb.from("fitness_history").insert({
              user_id: data.user.id,
              sport,
              metric_type: metricType,
              value: priorValue,
              source: source || "threshold_week_test",
            }).then(({ error }) => {
              if (error) console.warn("[IronZ] fitness_history insert failed:", error.message);
            });
          }
        });
      }
    } catch (e) {
      console.warn("[IronZ] supabase fitness_history insert skipped:", e.message);
    }
  }

  // ─── Notification ────────────────────────────────────────────────────────────

  function buildNotificationMessage(sport, oldZ3, newZ3) {
    const labels = { run: "pace", bike: "power", swim: "css" };
    const unit = labels[sport] || "";
    return `Zones updated. Your Z3 (threshold) ${unit} was ${oldZ3 || "—"}, now ${newZ3 || "—"}. Tap to see all the new zones.`;
  }

  function pushUpdateNotification(message) {
    try {
      if (typeof window !== "undefined" && window.IronZNotifications && window.IronZNotifications.push) {
        window.IronZNotifications.push({ title: "Threshold test logged", body: message });
      } else {
        console.log("[IronZ] " + message);
      }
    } catch {}
  }

  // ─── Plan refresh ────────────────────────────────────────────────────────────

  function refreshActivePlan() {
    try {
      if (typeof window !== "undefined" && window.Planner && window.Planner.refreshActivePlan) {
        window.Planner.refreshActivePlan();
      } else if (typeof window !== "undefined" && typeof window.regeneratePlan === "function") {
        window.regeneratePlan();
      } else if (typeof window !== "undefined" && typeof window.renderCalendar === "function") {
        // Last resort: re-render the calendar so card zone labels reflect new values.
        window.renderCalendar();
      }
    } catch (e) {
      console.warn("[IronZ] active plan refresh failed:", e.message);
    }
  }

  // ─── Z3 snapshot helper for the notification ─────────────────────────────────

  function z3Label(sport, zonesBundle) {
    if (!zonesBundle) return null;
    if (sport === "run" && zonesBundle.run && zonesBundle.run.zones && zonesBundle.run.zones.T) {
      return zonesBundle.run.zones.T.label;
    }
    if (sport === "bike" && zonesBundle.bike && zonesBundle.bike.zones && zonesBundle.bike.zones.z4) {
      const z = zonesBundle.bike.zones.z4;
      return `${z.low}-${z.high}W`;
    }
    if (sport === "swim" && zonesBundle.swim && zonesBundle.swim.zones && zonesBundle.swim.zones.threshold) {
      return zonesBundle.swim.zones.threshold.label;
    }
    return null;
  }

  // ─── Main entry point ────────────────────────────────────────────────────────

  /**
   * Process a threshold-week test result.
   *
   * Input:
   *   { sport: "run"|"bike"|"swim",
   *     testType: "RUN_5K_TT"|"RUN_30MIN_TT"|"BIKE_FTP_20"|"SWIM_CSS",
   *     rawInput: { ... per-test fields ... },
   *     userId?: string,
   *     forceConfirm?: boolean   // user already saw the sanity-check modal and OK'd it
   *   }
   *
   * Returns one of:
   *   { status: "needs_confirmation", oldValue, newValue, changePct, message }
   *   { status: "invalid", error }
   *   { status: "ok", sport, oldValue, newValue, changePct, zones }
   */
  function processResult(input) {
    if (!input || !input.sport || !input.rawInput) {
      return { status: "invalid", error: "missing sport or rawInput" };
    }
    const { sport, testType, rawInput, forceConfirm } = input;

    // 1. Compute the new value from the raw input.
    let newValue = null;
    let metricType = null;
    if (sport === "run") {
      if (testType === "RUN_5K_TT") {
        newValue = vdotFromFiveK(rawInput.finish_time_seconds || rawInput.finish_time);
        metricType = "vdot";
      } else if (testType === "RUN_30MIN_TT") {
        // Returns LTHR + T-pace; we store LTHR as the metric (T-pace falls out of the zone calc).
        const lthr = Number(rawInput.avg_hr_last_20min);
        if (!lthr || lthr < 80) return { status: "invalid", error: "missing or implausible LTHR" };
        newValue = lthr;
        metricType = "lthr";
      } else {
        return { status: "invalid", error: "unknown run testType: " + testType };
      }
    } else if (sport === "bike") {
      newValue = ftpFromTwentyMin(rawInput.avg_power_20min);
      metricType = "ftp_watts";
    } else if (sport === "swim") {
      newValue = cssFromFourHundredAndTwoHundred(rawInput.time_400m_seconds, rawInput.time_200m_seconds);
      metricType = "css_sec_per_100m";
    } else {
      return { status: "invalid", error: "unsupported sport: " + sport };
    }

    if (newValue == null) {
      return { status: "invalid", error: "could not derive value from rawInput" };
    }

    // 2. Sanity check vs prior.
    const profile = loadProfile();
    const priorValue = (sport === "run" && metricType === "lthr")
      ? Number(profile.lthr || profile.lactateThresholdHR) || null
      : getPriorValue(profile, sport);

    const sanity = sanityCheck(priorValue, newValue);
    if (!sanity.ok && !forceConfirm) {
      return {
        status: "needs_confirmation",
        sport,
        oldValue: priorValue,
        newValue,
        changePct: sanity.changePct,
        message: `This is a ${Math.abs(sanity.changePct)}% change from your last test. Confirm the result is correct, or retake the test.`
      };
    }

    // 3. Capture old Z3 (for the notification) before we overwrite the profile.
    let oldZones = null;
    try { oldZones = JSON.parse(localStorage.getItem("trainingZones") || "{}"); } catch {}
    const oldZ3 = z3Label(sport, oldZones);

    // 4. Archive prior value.
    archivePriorToHistory(sport, metricType, priorValue, "threshold_week_test");

    // 5. Write new value to profile.
    if (sport === "run" && metricType === "lthr") {
      profile.lthr = newValue;
      profile.last_test = { sport, metric: "lthr", value: newValue, recorded_at: new Date().toISOString() };
    } else {
      writeNewValue(profile, sport, newValue);
    }
    saveProfile(profile);

    // 6. Recalculate zones.
    let newZones = null;
    if (typeof window !== "undefined" && window.ZoneCalculator && window.ZoneCalculator.recalculateAllZones) {
      newZones = window.ZoneCalculator.recalculateAllZones(profile);
    } else if (typeof recalculateAllZones === "function") {
      newZones = recalculateAllZones(profile);
    }
    const newZ3 = z3Label(sport, newZones);

    // 7. Record threshold-week completion.
    try {
      if (typeof window !== "undefined" && window.ThresholdWeekScheduler) {
        window.ThresholdWeekScheduler.recordThresholdWeekCompleted(new Date(), [{ sport, testType, value: newValue }]);
      }
    } catch {}

    // 8. Notify + refresh.
    pushUpdateNotification(buildNotificationMessage(sport, oldZ3, newZ3));
    refreshActivePlan();

    return {
      status: "ok",
      sport,
      oldValue: priorValue,
      newValue,
      changePct: sanity.changePct,
      oldZ3,
      newZ3,
      zones: newZones
    };
  }

  const api = {
    processResult,
    sanityCheck,
    vdotFromFiveK,
    ftpFromTwentyMin,
    cssFromFourHundredAndTwoHundred,
    SANITY_PCT_LIMIT,
  };

  if (typeof window !== "undefined") window.TestResultHandler = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
