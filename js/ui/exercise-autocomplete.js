// js/ui/exercise-autocomplete.js
//
// Typeahead dropdown for any input with class .ex-row-name. Single shared
// dropdown attached to document.body, document-level event delegation —
// no MutationObserver needed because every existing manual-workout
// builder (workouts.js Log a Workout, calendar.js Add Session manual,
// custom-plan.js manual sessions, workout-editor.js, the community admin
// strength rows) uses .ex-row-name on its exercise-name inputs.
//
// Not a validation gate. Users can type anything; the dropdown is just a
// suggestion. Selecting a suggestion fills the input and advances focus
// to the next field in the row for fast tabbing.

(function () {
  "use strict";

  const MIN_CHARS   = 2;
  const MAX_RESULTS = 8;
  const ROW_HEIGHT  = 44; // matches CSS — used for above/below position math

  // Shared singleton dropdown
  let _dropdown        = null;
  let _activeInput     = null;
  let _highlightedIdx  = -1;
  let _currentResults  = [];
  let _currentQuery    = "";

  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function _searchKey(s) {
    if (window.IronZExerciseDB && window.IronZExerciseDB._searchKey) {
      return window.IronZExerciseDB._searchKey(s);
    }
    return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  // Filter the database for `query`. Prefix matches first, then contains
  // matches. Capped at MAX_RESULTS.
  function _filter(query, db) {
    const q = _searchKey(query);
    if (!q || q.length < MIN_CHARS) return [];
    const prefix   = [];
    const contains = [];
    for (const ex of db) {
      const key = ex._searchKey || _searchKey(ex.name);
      if (key.startsWith(q))      prefix.push(ex);
      else if (key.includes(q))   contains.push(ex);
    }
    return prefix.concat(contains).slice(0, MAX_RESULTS);
  }

  // Bold the matching prefix of `name` against `query`. Handles both literal
  // substring matches and normalized matches (e.g. "benchpress" → bold
  // "Bench Press" by walking the original until we've consumed enough
  // alphanumeric chars to cover the query).
  function _highlightMatch(name, query) {
    if (!query) return _esc(name);
    const lowerName = name.toLowerCase();
    const lowerQ    = query.toLowerCase();
    const idx = lowerName.indexOf(lowerQ);
    if (idx >= 0) {
      return _esc(name.slice(0, idx))
           + "<strong>" + _esc(name.slice(idx, idx + query.length)) + "</strong>"
           + _esc(name.slice(idx + query.length));
    }
    // Fall back to normalized match — bold the first N visible chars of the
    // original name that correspond to the normalized query length.
    const norm = _searchKey(name);
    const qn   = _searchKey(query);
    if (!norm.startsWith(qn)) return _esc(name);
    let consumed = 0;
    let cut = 0;
    while (cut < name.length && consumed < qn.length) {
      const ch = name[cut].toLowerCase();
      if (/[a-z0-9]/.test(ch)) consumed++;
      cut++;
    }
    return "<strong>" + _esc(name.slice(0, cut)) + "</strong>" + _esc(name.slice(cut));
  }

  function _getDropdown() {
    if (_dropdown) return _dropdown;
    _dropdown = document.createElement("div");
    _dropdown.className = "exercise-autocomplete";
    _dropdown.setAttribute("role", "listbox");
    _dropdown.style.display = "none";
    document.body.appendChild(_dropdown);
    return _dropdown;
  }

  function _hideDropdown() {
    if (_dropdown) _dropdown.style.display = "none";
    _activeInput    = null;
    _highlightedIdx = -1;
    _currentResults = [];
    _currentQuery   = "";
  }

  // Position the dropdown relative to the input. Uses fixed positioning so
  // we can flip above the input when there's not enough room below (e.g.
  // when the on-screen keyboard pushes the input toward the bottom).
  function _positionDropdown(input) {
    const rect = input.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const dropdown = _getDropdown();

    dropdown.style.position = "fixed";
    dropdown.style.left  = rect.left + "px";
    dropdown.style.width = rect.width + "px";

    const estHeight = Math.min(_currentResults.length, MAX_RESULTS) * ROW_HEIGHT + 4;
    const spaceBelow = viewportH - rect.bottom;
    const spaceAbove = rect.top;

    if (spaceBelow < estHeight && spaceAbove > spaceBelow) {
      dropdown.style.top    = "auto";
      dropdown.style.bottom = (viewportH - rect.top) + "px";
    } else {
      dropdown.style.top    = rect.bottom + "px";
      dropdown.style.bottom = "auto";
    }
  }

  function _renderResults() {
    const dropdown = _getDropdown();
    if (_currentResults.length === 0) {
      _hideDropdown();
      return;
    }
    dropdown.innerHTML = _currentResults.map((ex, i) => {
      const muscle = ex.muscleGroup
        ? `<span class="exercise-autocomplete-muscle">${_esc(ex.muscleGroup)}</span>`
        : "";
      return `<div class="exercise-autocomplete-item${i === _highlightedIdx ? " is-active" : ""}" data-idx="${i}" role="option">
        <span class="exercise-autocomplete-name">${_highlightMatch(ex.name, _currentQuery)}</span>${muscle}
      </div>`;
    }).join("");
    dropdown.style.display = "";
    _positionDropdown(_activeInput);
  }

  function _updateForInput(input) {
    const query = (input.value || "").trim();
    _currentQuery = query;
    if (query.length < MIN_CHARS) {
      if (_activeInput === input) _hideDropdown();
      return;
    }
    const db = window.IronZExerciseDB && window.IronZExerciseDB.get();
    if (!db) {
      // Database isn't loaded yet — kick off the load and wait for the next
      // keystroke. No suggestions on this stroke, but never an error.
      if (window.IronZExerciseDB) window.IronZExerciseDB.load().then(() => {
        if (_activeInput === input) _updateForInput(input);
      });
      return;
    }
    _activeInput    = input;
    _currentResults = _filter(query, db);
    _highlightedIdx = -1;
    _renderResults();
  }

  function _onInput(e) {
    const input = e.target;
    if (!input || !input.matches || !input.matches(".ex-row-name")) return;
    _updateForInput(input);
  }

  function _onFocusIn(e) {
    const input = e.target;
    if (!input || !input.matches || !input.matches(".ex-row-name")) return;
    if ((input.value || "").trim().length >= MIN_CHARS) _updateForInput(input);
  }

  function _selectResult(idx) {
    const ex = _currentResults[idx];
    if (!ex || !_activeInput) return;
    const input = _activeInput;
    input.value = ex.name;
    // Re-fire input so any per-row listeners (per-set rebuild, validation)
    // see the new value the same way they would on a real keystroke.
    try { input.dispatchEvent(new Event("input", { bubbles: true })); } catch {}
    try { input.dispatchEvent(new Event("change", { bubbles: true })); } catch {}

    // Move focus to the next text/number input in the same row for fast
    // tabbing. The row container varies across builders (.exercise-row in
    // workouts.js / calendar.js, .ca-ex-row in the community builder, etc.)
    // so we look for any of them.
    const row = input.closest(".ca-ex-row, .qe-manual-row, .exercise-row, .ex-row, .ca-pyr-row");
    if (row) {
      const fields = Array.from(row.querySelectorAll('input[type="text"], input[type="number"]'))
        .filter(el => !el.disabled && el.offsetParent !== null);
      const i = fields.indexOf(input);
      if (i >= 0 && i < fields.length - 1) {
        try { fields[i + 1].focus(); fields[i + 1].select && fields[i + 1].select(); } catch {}
      } else {
        try { input.blur(); } catch {}
      }
    } else {
      try { input.blur(); } catch {}
    }
    _hideDropdown();
  }

  function _onClick(e) {
    const item = e.target && e.target.closest && e.target.closest(".exercise-autocomplete-item");
    if (item) {
      e.preventDefault();
      e.stopPropagation();
      const idx = parseInt(item.getAttribute("data-idx"), 10);
      _selectResult(idx);
      return;
    }
    // Outside click — collapse if the click isn't on the active input or
    // inside the dropdown.
    if (!_activeInput) return;
    const target = e.target;
    if (target === _activeInput) return;
    if (target.closest && target.closest(".exercise-autocomplete")) return;
    _hideDropdown();
  }

  // Pointerdown on a dropdown item must NOT blur the input first, otherwise
  // mobile Safari/Chrome blur the field before the click even fires and the
  // dropdown is gone before _onClick runs. preventDefault on pointerdown
  // keeps the focus on the input.
  function _onPointerdown(e) {
    if (e.target && e.target.closest && e.target.closest(".exercise-autocomplete")) {
      e.preventDefault();
    }
  }

  function _onKeydown(e) {
    if (!_activeInput || e.target !== _activeInput || _currentResults.length === 0) {
      // Esc still hides even without results, so a stray escape never
      // leaves a stale dropdown on screen.
      if (e.key === "Escape" && _activeInput) _hideDropdown();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      _highlightedIdx = (_highlightedIdx + 1) % _currentResults.length;
      _renderResults();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      _highlightedIdx = (_highlightedIdx - 1 + _currentResults.length) % _currentResults.length;
      _renderResults();
    } else if (e.key === "Enter") {
      if (_highlightedIdx >= 0) {
        e.preventDefault();
        _selectResult(_highlightedIdx);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      _hideDropdown();
    } else if (e.key === "Tab") {
      _hideDropdown();
    }
  }

  function _onScrollOrResize() {
    if (_activeInput) _positionDropdown(_activeInput);
  }

  function init() {
    if (typeof document === "undefined" || document.__exerciseAutocompleteWired) return;
    document.__exerciseAutocompleteWired = true;
    document.addEventListener("input",       _onInput);
    document.addEventListener("focusin",     _onFocusIn);
    document.addEventListener("pointerdown", _onPointerdown, true);
    document.addEventListener("click",       _onClick, true);
    document.addEventListener("keydown",     _onKeydown);
    window.addEventListener("scroll",        _onScrollOrResize, true);
    window.addEventListener("resize",        _onScrollOrResize);
  }

  if (typeof window !== "undefined") {
    window.ExerciseAutocomplete = { init };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();
