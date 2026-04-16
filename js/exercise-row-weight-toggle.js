// exercise-row-weight-toggle.js — hides weight inputs for exercises that
// don't use load (Plank, Burpees, Wall Sit, …) and offers a Bodyweight
// toggle for exercises that can be done loaded OR unloaded.
//
// Spec: cowork-handoff/EXERCISE_DB_SPEC.md §UI enforcement rules.
//
// Hooks document-level input events on .ex-row-name (the existing
// typeahead-equipped name input shared across calendar.js Add Session,
// custom-plan.js Build a Plan Manual, workouts.js Log a Workout, etc).
// On change we look up the typed name in window.ExerciseDB and:
//
//   - usesWeights === false:          hide the row's weight input,
//                                     stamp "Bodyweight" as the value.
//   - canBeBodyweight && usesWeights: render a small "Weighted / BW"
//                                     toggle next to the weight input.
//   - everything else:                show the weight input as-is.
//
// No-op when ExerciseDB isn't loaded — this module never blocks input.

(function () {
  "use strict";

  // Selectors that identify a "row" in the various manual-exercise
  // builders. Same set the typeahead's tab-advance uses.
  const ROW_SELECTORS = ".qe-manual-row, .ca-ex-row, .exercise-row, .ex-row";

  function _findRow(input) {
    return input && input.closest && input.closest(ROW_SELECTORS);
  }

  // Find the weight input for a row. Builders use different id patterns
  // (qe-mwt-N, cp-mwt-N, ca-wt-N, …) but they all carry "wt" or "weight"
  // somewhere — easier to find by a shared class than to enumerate ids.
  function _weightInput(row) {
    if (!row) return null;
    return row.querySelector(
      'input.qe-weight-input, input.ex-weight-input, ' +
      'input[id^="qe-mwt-"], input[id^="cp-mwt-"], input[id^="ca-wt-"]'
    );
  }

  function _setRowMode(row, mode, exMeta) {
    if (!row) return;
    row.classList.remove("ex-row--bw", "ex-row--weighted", "ex-row--bw-toggleable");
    const wt = _weightInput(row);
    if (mode === "bw") {
      row.classList.add("ex-row--bw");
      if (wt) {
        wt.value = "Bodyweight";
        wt.dataset.prevWeight = wt.dataset.prevWeight || "";
        wt.disabled = true;
        wt.style.display = "none";
      }
      _renderBwBadge(row, "Bodyweight");
    } else if (mode === "bw-toggleable") {
      row.classList.add("ex-row--weighted", "ex-row--bw-toggleable");
      if (wt) {
        wt.disabled = false;
        wt.style.display = "";
      }
      _renderBwToggle(row, exMeta);
    } else {
      row.classList.add("ex-row--weighted");
      if (wt) {
        wt.disabled = false;
        wt.style.display = "";
      }
      _removeBwBadge(row);
    }
  }

  function _renderBwBadge(row, text) {
    _removeBwBadge(row);
    const wt = _weightInput(row);
    if (!wt) return;
    const span = document.createElement("span");
    span.className = "ex-row-bw-badge";
    span.textContent = text;
    wt.parentNode.insertBefore(span, wt);
  }

  function _removeBwBadge(row) {
    row.querySelectorAll(".ex-row-bw-badge, .ex-row-bw-toggle").forEach(el => el.remove());
  }

  function _renderBwToggle(row, exMeta) {
    _removeBwBadge(row);
    const wt = _weightInput(row);
    if (!wt) return;
    const wrap = document.createElement("span");
    wrap.className = "ex-row-bw-toggle";
    wrap.innerHTML = `
      <button type="button" class="ex-row-bw-mode is-active" data-mode="weighted">Weighted</button>
      <button type="button" class="ex-row-bw-mode"           data-mode="bw">BW</button>
    `;
    wt.parentNode.insertBefore(wrap, wt);
    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest(".ex-row-bw-mode");
      if (!btn) return;
      const mode = btn.dataset.mode;
      wrap.querySelectorAll(".ex-row-bw-mode").forEach(b => b.classList.toggle("is-active", b === btn));
      if (mode === "bw") {
        wt.dataset.prevWeight = wt.value || "";
        wt.value = "Bodyweight";
        wt.disabled = true;
      } else {
        if (wt.value === "Bodyweight" && wt.dataset.prevWeight) {
          wt.value = wt.dataset.prevWeight;
        } else if (wt.value === "Bodyweight") {
          wt.value = "";
        }
        wt.disabled = false;
      }
    });
  }

  function _applyForName(input) {
    if (!input || !input.matches || !input.matches(".ex-row-name")) return;
    const row = _findRow(input);
    if (!row) return;
    const E = window.ExerciseDB;
    if (!E) return; // no-op until exercise-filters.js loads
    const name = (input.value || "").trim();
    if (!name) {
      _setRowMode(row, "weighted");
      return;
    }
    const meta = E.getByName(name);
    if (!meta) {
      // Unknown exercise → leave row as-is (user typed something not in DB)
      _setRowMode(row, "weighted");
      return;
    }
    if (!meta.usesWeights) {
      _setRowMode(row, "bw", meta);
    } else if (meta.canBeBodyweight) {
      _setRowMode(row, "bw-toggleable", meta);
    } else {
      _setRowMode(row, "weighted", meta);
    }
  }

  // Re-apply on `input` and `change` so both keystrokes and autocomplete
  // selection (which fires both events) get picked up.
  document.addEventListener("input",  e => _applyForName(e.target));
  document.addEventListener("change", e => _applyForName(e.target));
})();
