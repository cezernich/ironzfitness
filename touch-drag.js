// touch-drag.js — Adds touch-based drag-and-drop for mobile devices
// Shared by workouts.js (log workout) and workout-editor.js (edit workout)

const TouchDrag = (() => {
  let _active = null;   // { el, clone, container, offsetX, offsetY, onDrop }
  let _lastOver = null;  // element currently hovered

  function _getRowAt(x, y, container, dragEl) {
    const rows = container.querySelectorAll(dragEl.className.split(" ")[0] ? "." + dragEl.className.split(" ")[0] : "[draggable]");
    for (const row of rows) {
      if (row === dragEl || row.style.display === "none") continue;
      const rect = row.getBoundingClientRect();
      if (y >= rect.top && y <= rect.bottom && x >= rect.left && x <= rect.right) return row;
    }
    return null;
  }

  function _clearHints(container, classes) {
    container.querySelectorAll("[draggable]").forEach(el => {
      classes.forEach(c => el.classList.remove(c));
    });
  }

  /**
   * Attach touch drag to an element.
   * @param {HTMLElement} el - The draggable row
   * @param {HTMLElement} container - Parent container of all rows
   * @param {object} opts
   *   opts.hintClasses - array of CSS classes to clear (default: drag-insert-above, drag-insert-below)
   *   opts.onDrop(dragEl, targetEl, clientY) - called on drop
   *   opts.rowSelector - selector for sibling rows (default: "[draggable]")
   *   opts.handleSelector - CSS selector for drag handle within el (if set, only touches on handle initiate drag)
   */
  function attach(el, container, opts = {}) {
    const hintClasses = opts.hintClasses || ["drag-insert-above", "drag-insert-below", "drag-ss-target"];
    const rowSelector = opts.rowSelector || "[draggable]";
    const handleSelector = opts.handleSelector || null;

    el.addEventListener("touchstart", (e) => {
      // Only start drag if touching the handle (when specified) or the row itself (legacy)
      if (handleSelector) {
        const handle = e.target.closest(handleSelector);
        if (!handle || !el.contains(handle)) return;
      } else {
        // Legacy: don't drag from inputs/buttons
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "SELECT" || tag === "BUTTON" || tag === "TEXTAREA") return;
        if (e.target.closest("button")) return;
      }

      const touch = e.touches[0];
      const rect = el.getBoundingClientRect();

      // Create a visual clone
      const clone = el.cloneNode(true);
      clone.style.cssText = `
        position: fixed; z-index: 9999; pointer-events: none;
        width: ${rect.width}px; opacity: 0.85;
        left: ${rect.left}px; top: ${rect.top}px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        transition: none;
      `;
      document.body.appendChild(clone);

      el.classList.add("drag-active");
      _active = {
        el,
        clone,
        container,
        offsetX: touch.clientX - rect.left,
        offsetY: touch.clientY - rect.top,
        hintClasses,
        rowSelector,
        onDrop: opts.onDrop,
      };
      _lastOver = null;

      // Prevent scroll only when drag is initiated via handle
      e.preventDefault();
    }, { passive: false });

    el.addEventListener("touchmove", (e) => {
      if (!_active || _active.el !== el) return;
      e.preventDefault(); // prevent scrolling while dragging

      const touch = e.touches[0];
      _active.clone.style.left = (touch.clientX - _active.offsetX) + "px";
      _active.clone.style.top  = (touch.clientY - _active.offsetY) + "px";

      // Find which row we're over
      // Temporarily hide clone so elementFromPoint can find the row behind it
      _active.clone.style.display = "none";
      const elAtPoint = document.elementFromPoint(touch.clientX, touch.clientY);
      _active.clone.style.display = "";

      const row = elAtPoint?.closest(_active.rowSelector);

      // Clear old hints
      if (_lastOver && _lastOver !== row) {
        _active.hintClasses.forEach(c => _lastOver.classList.remove(c));
      }

      if (row && row !== el && _active.container.contains(row)) {
        _lastOver = row;
        const rect = row.getBoundingClientRect();
        const pct = (touch.clientY - rect.top) / rect.height;

        row.classList.remove(..._active.hintClasses);
        if (_active.hintClasses.includes("drag-ss-target") && pct > 0.3 && pct < 0.7) {
          row.classList.add("drag-ss-target");
        } else if (pct <= 0.5) {
          row.classList.add("drag-insert-above");
        } else {
          row.classList.add("drag-insert-below");
        }
      } else {
        _lastOver = null;
      }
    }, { passive: false });

    el.addEventListener("touchend", (e) => {
      if (!_active || _active.el !== el) return;

      const touch = e.changedTouches[0];
      el.classList.remove("drag-active");
      _active.clone.remove();

      // Clear all hints
      _clearHints(_active.container, _active.hintClasses);

      if (_lastOver && _lastOver !== el && _active.onDrop) {
        _active.onDrop(el, _lastOver, touch.clientY);
      }

      _active = null;
      _lastOver = null;
    }, { passive: true });

    el.addEventListener("touchcancel", () => {
      if (!_active || _active.el !== el) return;
      el.classList.remove("drag-active");
      _active.clone.remove();
      _clearHints(_active.container, _active.hintClasses);
      _active = null;
      _lastOver = null;
    }, { passive: true });
  }

  return { attach };
})();
