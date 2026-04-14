// post-test-modal.js
// UI for entering threshold-week test results.
// Implements PHILOSOPHY_UPDATE_2026-04-09_threshold_weeks.md → "Post-Test Workflow".
//
// Public:
//   PostTestModal.open({ sport, testType, dateStr })
//   PostTestModal.maybeOpenForCompletedWorkout(workout)

(function () {
  "use strict";

  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function _close() {
    const o = document.getElementById("post-test-modal-overlay");
    if (o) {
      o.classList.remove("visible");
      setTimeout(() => o.remove(), 200);
    }
  }

  // Parse "MM:SS" or "HH:MM:SS" or "1234" → seconds.
  function parseTimeToSeconds(input) {
    if (input == null) return null;
    const s = String(input).trim();
    if (!s) return null;
    if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    const parts = s.split(":").map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }

  function buildBody(sport, testType) {
    if (testType === "RUN_5K_TT") {
      return {
        title: "5K Time Trial",
        instructions: "Enter your 5K finish time. Format: mm:ss (e.g. 22:30)",
        fields: [{ id: "finish_time", label: "Finish time (mm:ss)", placeholder: "22:30" }],
        parse: vals => ({ finish_time_seconds: parseTimeToSeconds(vals.finish_time) }),
      };
    }
    if (testType === "RUN_30MIN_TT") {
      return {
        title: "30-Minute Run Test",
        instructions: "Enter the average HR and pace from the last 20 minutes of the test.",
        fields: [
          { id: "avg_hr_last_20min", label: "Average HR (bpm)", placeholder: "168" },
          { id: "avg_pace_last_20min", label: "Average pace (mm:ss/mi)", placeholder: "7:30" },
        ],
        parse: vals => ({
          avg_hr_last_20min: parseFloat(vals.avg_hr_last_20min),
          avg_pace_last_20min: parseTimeToSeconds(vals.avg_pace_last_20min),
        }),
      };
    }
    if (testType === "BIKE_FTP_20") {
      return {
        title: "20-Minute FTP Test",
        instructions: "Enter your average power for the 20-minute test effort.",
        fields: [{ id: "avg_power_20min", label: "Average power (W)", placeholder: "265" }],
        parse: vals => ({ avg_power_20min: parseFloat(vals.avg_power_20min) }),
      };
    }
    if (testType === "SWIM_CSS") {
      return {
        title: "Critical Swim Speed Test",
        instructions: "Enter your 400m and 200m time-trial times.",
        fields: [
          { id: "time_400m", label: "400m time (mm:ss)", placeholder: "6:00" },
          { id: "time_200m", label: "200m time (mm:ss)", placeholder: "2:50" },
        ],
        parse: vals => ({
          time_400m_seconds: parseTimeToSeconds(vals.time_400m),
          time_200m_seconds: parseTimeToSeconds(vals.time_200m),
        }),
      };
    }
    return null;
  }

  // Render the result-confirmation step (after a successful submit).
  function renderSuccessStep(result) {
    const overlay = document.getElementById("post-test-modal-overlay");
    if (!overlay) return;
    const body = overlay.querySelector(".post-test-modal");
    if (!body) return;
    const oldZ3 = result.oldZ3 || "—";
    const newZ3 = result.newZ3 || "—";
    body.innerHTML = `
      <div class="post-test-modal-title">Zones updated</div>
      <div class="post-test-modal-body">
        <p>Your Z3 (threshold) was <b>${_esc(oldZ3)}</b>, now <b>${_esc(newZ3)}</b>.</p>
        <p>All future workouts in your active plan will use the new zones.</p>
      </div>
      <div class="post-test-modal-actions">
        <button class="rating-save-btn" id="post-test-done">Got it</button>
      </div>
    `;
    body.querySelector("#post-test-done").onclick = _close;
  }

  // Render the sanity-check confirmation step (out-of-range result).
  function renderConfirmStep(result, sport, testType, parsedRaw) {
    const overlay = document.getElementById("post-test-modal-overlay");
    if (!overlay) return;
    const body = overlay.querySelector(".post-test-modal");
    if (!body) return;
    body.innerHTML = `
      <div class="post-test-modal-title">Confirm result</div>
      <div class="post-test-modal-body">
        <p>${_esc(result.message)}</p>
        <p>Old: <b>${_esc(result.oldValue)}</b> &nbsp;→&nbsp; New: <b>${_esc(result.newValue)}</b></p>
      </div>
      <div class="post-test-modal-actions">
        <button class="rating-skip-btn" id="post-test-retake">Retake</button>
        <button class="rating-save-btn" id="post-test-confirm">Confirm</button>
      </div>
    `;
    body.querySelector("#post-test-retake").onclick = _close;
    body.querySelector("#post-test-confirm").onclick = () => {
      const TRH = window.TestResultHandler;
      const second = TRH.processResult({ sport, testType, rawInput: parsedRaw, forceConfirm: true });
      if (second.status === "ok") renderSuccessStep(second);
      else _close();
    };
  }

  function open(opts) {
    const { sport, testType } = opts || {};
    if (!sport || !testType) return;
    const spec = buildBody(sport, testType);
    if (!spec) return;

    // Remove any existing overlay
    const existing = document.getElementById("post-test-modal-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "post-test-modal-overlay";
    overlay.className = "rating-modal-overlay";
    overlay.onclick = e => { if (e.target === overlay) _close(); };

    const fieldsHtml = spec.fields.map(f => `
      <label class="post-test-field">
        <span>${_esc(f.label)}</span>
        <input type="text" id="ptf-${_esc(f.id)}" placeholder="${_esc(f.placeholder)}" autocomplete="off">
      </label>
    `).join("");

    overlay.innerHTML = `
      <div class="post-test-modal rating-modal">
        <div class="post-test-modal-title rating-modal-title">${_esc(spec.title)}</div>
        <div class="post-test-modal-body">
          <p>${_esc(spec.instructions)}</p>
          ${fieldsHtml}
        </div>
        <div class="post-test-modal-actions rating-modal-actions">
          <button class="rating-skip-btn" id="post-test-cancel">Cancel</button>
          <button class="rating-save-btn" id="post-test-submit">Submit</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    overlay.querySelector("#post-test-cancel").onclick = _close;
    overlay.querySelector("#post-test-submit").onclick = () => {
      const vals = {};
      spec.fields.forEach(f => {
        const el = document.getElementById("ptf-" + f.id);
        vals[f.id] = el ? el.value : "";
      });
      const parsed = spec.parse(vals);
      // Validate that every required field parsed.
      if (Object.values(parsed).some(v => v == null || (typeof v === "number" && (isNaN(v) || v <= 0)))) {
        alert("Please enter valid values for every field.");
        return;
      }
      const TRH = window.TestResultHandler;
      if (!TRH || !TRH.processResult) { _close(); return; }
      const result = TRH.processResult({ sport, testType, rawInput: parsed });
      if (result.status === "needs_confirmation") {
        renderConfirmStep(result, sport, testType, parsed);
      } else if (result.status === "ok") {
        renderSuccessStep(result);
      } else {
        alert("Test result error: " + (result.error || "unknown"));
      }
    };
  }

  // Convenience: called by the calendar when a threshold-week test workout is marked complete.
  function maybeOpenForCompletedWorkout(workout) {
    if (!workout || !workout.isThresholdTest) return;
    const sportMap = {
      RUN_5K_TT: "run",
      RUN_30MIN_TT: "run",
      BIKE_FTP_20: "bike",
      SWIM_CSS: "swim",
    };
    const testType = workout.thresholdTestType;
    const sport = sportMap[testType];
    if (!sport || !testType) return;
    open({ sport, testType, dateStr: workout.date });
  }

  // ─── Settings UI: cadence override + skip next ──────────────────────────────

  function _readUserData() {
    try { return JSON.parse(localStorage.getItem("user_data") || "{}"); }
    catch { return {}; }
  }
  function _writeUserData(ud) {
    try {
      localStorage.setItem("user_data", JSON.stringify(ud));
      if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("user_data");
    } catch {}
  }

  function renderThresholdWeekSettings() {
    const host = document.getElementById("threshold-week-settings");
    if (!host) return;
    const ud = _readUserData();
    const override = Number(ud.threshold_week_cadence_override) || 0;
    const last = ud.last_threshold_week_date || null;
    const TW = window.ThresholdWeekScheduler;
    let nextLabel = "—";
    let cadenceLabel = "Auto";
    if (TW) {
      let profile = {};
      try { profile = JSON.parse(localStorage.getItem("profile") || "{}"); } catch {}
      const phase = TW.detectPhase(profile);
      const cadence = TW.resolveCadence({ ...profile, threshold_week_cadence_override: override }, phase);
      cadenceLabel = override
        ? `Every ${override} weeks (override)`
        : `Auto — every ${cadence} weeks (${phase})`;
      // Estimate next from last + cadence (or today + cadence if no history)
      const anchor = last || new Date().toISOString().slice(0, 10);
      const next = TW.computeNextThresholdWeek(
        { ...profile, threshold_week_cadence_override: override },
        last, anchor
      );
      if (next.thresholdWeekStartDate) {
        nextLabel = TW.toDateStr(next.thresholdWeekStartDate);
      } else {
        nextLabel = "no slot before next race";
      }
    }
    host.innerHTML = `
      <div class="threshold-settings-row">
        <label for="tw-cadence">Cadence</label>
        <select id="tw-cadence">
          <option value="0">Auto (recommended)</option>
          <option value="4">Every 4 weeks</option>
          <option value="6">Every 6 weeks</option>
          <option value="8">Every 8 weeks</option>
        </select>
        <div class="threshold-settings-meta">${cadenceLabel}</div>
      </div>
      <div class="threshold-settings-row">
        <label>Next threshold week</label>
        <div class="threshold-settings-meta">${nextLabel}</div>
        <button id="tw-skip-next" class="btn-secondary">Skip the next threshold week</button>
      </div>
    `;
    const sel = host.querySelector("#tw-cadence");
    if (sel) {
      sel.value = String(override || 0);
      sel.onchange = () => {
        const v = parseInt(sel.value, 10) || 0;
        const ud2 = _readUserData();
        if (v >= 4 && v <= 8) ud2.threshold_week_cadence_override = v;
        else delete ud2.threshold_week_cadence_override;
        _writeUserData(ud2);
        renderThresholdWeekSettings();
      };
    }
    const skipBtn = host.querySelector("#tw-skip-next");
    if (skipBtn) {
      skipBtn.onclick = () => {
        if (!TW) return;
        const ud2 = _readUserData();
        const profile = JSON.parse(localStorage.getItem("profile") || "{}");
        const next = TW.computeNextThresholdWeek(
          { ...profile, threshold_week_cadence_override: override },
          ud2.last_threshold_week_date || null,
          new Date().toISOString().slice(0, 10)
        );
        const skipDate = next.thresholdWeekStartDate
          ? TW.toDateStr(next.thresholdWeekStartDate)
          : new Date().toISOString().slice(0, 10);
        const after = TW.computeNextThresholdWeek(
          { ...profile, threshold_week_cadence_override: override },
          skipDate,
          skipDate
        );
        const afterStr = after.thresholdWeekStartDate
          ? TW.toDateStr(after.thresholdWeekStartDate)
          : "no slot before next race";
        if (confirm(`Your next threshold week will be rescheduled to ${afterStr}. Proceed?`)) {
          TW.markThresholdWeekSkipped(skipDate);
          renderThresholdWeekSettings();
        }
      };
    }
  }

  if (typeof window !== "undefined") {
    window.PostTestModal = { open, maybeOpenForCompletedWorkout, renderThresholdWeekSettings };
  }
})();
