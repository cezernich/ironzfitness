// admin-questions.js — Admin UI for ask_ironz_logs.
// Gated by window._userRole === 'admin'. Reads every row the caller has
// access to (with the profiles.role admin policy applied, that's all rows).
//
// Renders:
//   - Summary bar: total, % helpful, top category, avg response time
//   - Category breakdown pills
//   - Filterable + sortable table of the last N questions
//
// Read-only. No editing of the underlying rows from this page.

(function (global) {
  "use strict";

  // Pull a generous cap per fetch — most admins want to see everything but
  // we don't need to page infinitely. 1000 rows is enough for the first
  // analytics pass; if log volume exceeds that we'll add paging.
  const MAX_ROWS = 1000;

  let _logs = [];        // raw rows from Supabase
  let _sortKey = "created_at";
  let _sortDir = "desc"; // 'asc' | 'desc'

  // ─── Fetch ────────────────────────────────────────────────────────────────
  async function loadAdminQuestions() {
    const client = global.supabaseClient;
    if (!client) { console.warn("[AdminQuestions] no supabase client"); return; }
    try {
      const { data, error } = await client
        .from("ask_ironz_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(MAX_ROWS);
      if (error) {
        console.warn("[AdminQuestions] load error:", error.message);
        _logs = [];
      } else {
        _logs = data || [];
      }
    } catch (e) {
      console.warn("[AdminQuestions] load exception:", e && e.message);
      _logs = [];
    }
    renderAskIronZSummary();
    renderAskIronZLogs();
  }

  // ─── Summary + breakdown ──────────────────────────────────────────────────
  function renderAskIronZSummary() {
    const total = _logs.length;
    _setText("admin-q-total", total);

    // % helpful — only among rows with a feedback value (true/false, not null).
    const withFb = _logs.filter(r => r.helpful === true || r.helpful === false);
    const helpfulCount = withFb.filter(r => r.helpful === true).length;
    const pct = withFb.length ? Math.round((helpfulCount / withFb.length) * 100) : null;
    _setText("admin-q-helpful-pct", pct == null ? "—" : (pct + "%"));

    // Top category
    const byCat = {};
    _logs.forEach(r => { const c = r.category || "uncategorized"; byCat[c] = (byCat[c] || 0) + 1; });
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    _setText("admin-q-top-category", top ? `${top[0]} (${top[1]})` : "—");

    // Avg response ms — null-safe over rows that actually have a time recorded.
    const withMs = _logs.filter(r => typeof r.response_time_ms === "number" && r.response_time_ms > 0);
    const avgMs = withMs.length
      ? Math.round(withMs.reduce((s, r) => s + r.response_time_ms, 0) / withMs.length)
      : null;
    _setText("admin-q-avg-ms", avgMs == null ? "—" : avgMs.toLocaleString());

    // Category breakdown pills
    const host = document.getElementById("admin-q-category-breakdown");
    if (host) {
      const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
      if (!sorted.length) {
        host.innerHTML = '<span class="hint">No questions logged yet.</span>';
      } else {
        host.innerHTML = sorted.map(([cat, n]) => {
          const colors = _CATEGORY_COLORS[cat] || _CATEGORY_COLORS.default;
          return `<span class="admin-q-pill" style="background:${colors.bg};color:${colors.fg};padding:4px 10px;border-radius:10px;font-size:0.85em;font-weight:600">${_escape(cat)} · ${n}</span>`;
        }).join("");
      }
    }
  }

  // ─── Filterable, sortable table ───────────────────────────────────────────
  function _applyFilters(rows) {
    const search = (document.getElementById("admin-q-search")?.value || "").toLowerCase().trim();
    const cat    = document.getElementById("admin-q-filter-category")?.value || "";
    const resp   = document.getElementById("admin-q-filter-response")?.value || "";
    const help   = document.getElementById("admin-q-filter-helpful")?.value || "";
    const dFrom  = document.getElementById("admin-q-date-from")?.value || "";
    const dTo    = document.getElementById("admin-q-date-to")?.value || "";

    return rows.filter(r => {
      if (search && !(String(r.question_text || "").toLowerCase().includes(search))) return false;
      if (cat && r.category !== cat) return false;
      if (resp && r.response_type !== resp) return false;
      if (help === "yes" && r.helpful !== true) return false;
      if (help === "no"  && r.helpful !== false) return false;
      if (help === "none" && (r.helpful === true || r.helpful === false)) return false;
      if (dFrom || dTo) {
        const created = String(r.created_at || "").slice(0, 10);
        if (dFrom && created < dFrom) return false;
        if (dTo   && created > dTo)   return false;
      }
      return true;
    });
  }

  function _applySort(rows) {
    const key = _sortKey;
    const dir = _sortDir === "asc" ? 1 : -1;
    return rows.slice().sort((a, b) => {
      let av = a[key], bv = b[key];
      // Null / undefined sort last regardless of direction so a "descending
      // by response time" query doesn't dump all the pending rows at top.
      const aN = av == null;
      const bN = bv == null;
      if (aN && bN) return 0;
      if (aN) return 1;
      if (bN) return -1;
      if (typeof av === "boolean") av = av ? 1 : 0;
      if (typeof bv === "boolean") bv = bv ? 1 : 0;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
    });
  }

  function renderAskIronZLogs() {
    const tbody = document.getElementById("admin-q-tbody");
    if (!tbody) return;
    const filtered = _applySort(_applyFilters(_logs));

    // Update sort indicators (↑ / ↓ / blank)
    document.querySelectorAll(".admin-q-sort").forEach(el => {
      const col = el.getAttribute("data-col");
      el.textContent = col === _sortKey ? (_sortDir === "asc" ? " ↑" : " ↓") : "";
    });

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:#666">No questions match these filters.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(r => {
      const created = r.created_at ? _formatDateTime(r.created_at) : "—";
      const qPreview = _truncate(r.question_text || "", 120);
      const catColors = _CATEGORY_COLORS[r.category] || _CATEGORY_COLORS.default;
      const catPill = `<span class="admin-q-cat-pill" style="background:${catColors.bg};color:${catColors.fg};padding:2px 8px;border-radius:8px;font-size:0.78em">${_escape(r.category || "uncategorized")}</span>`;
      const respPill = `<span class="admin-q-resp-pill" style="background:rgba(100,116,139,0.15);color:#334155;padding:2px 8px;border-radius:8px;font-size:0.78em">${_escape(r.response_type || "—")}</span>`;
      const helpful = r.helpful === true ? '<span title="Helpful">👍</span>'
                    : r.helpful === false ? '<span title="Not helpful">👎</span>'
                    : '<span class="hint">—</span>';
      const rt = typeof r.response_time_ms === "number" && r.response_time_ms > 0
        ? r.response_time_ms.toLocaleString()
        : "—";
      return `
        <tr>
          <td style="white-space:nowrap">${_escape(created)}</td>
          <td style="max-width:480px"><span title="${_escape(r.question_text || "")}">${_escape(qPreview)}</span></td>
          <td>${catPill}</td>
          <td>${respPill}</td>
          <td style="text-align:center">${helpful}</td>
          <td style="text-align:right">${_escape(rt)}</td>
        </tr>
      `;
    }).join("");
  }

  function sortAskIronZLogs(key) {
    if (_sortKey === key) {
      _sortDir = _sortDir === "asc" ? "desc" : "asc";
    } else {
      _sortKey = key;
      _sortDir = "desc"; // new column → default descending (newest / largest first)
    }
    renderAskIronZLogs();
  }

  // ─── Hook into admin sub-tab switching ────────────────────────────────────
  if (typeof global.showAdminSubtab === "function") {
    const orig = global.showAdminSubtab;
    global.showAdminSubtab = function (name) {
      orig(name);
      if (name === "admin-questions" && global._userRole === "admin") {
        loadAdminQuestions();
      }
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const _CATEGORY_COLORS = {
    injury:          { bg: "rgba(220,38,38,0.12)",  fg: "#b91c1c" },
    recovery:        { bg: "rgba(14,165,233,0.12)", fg: "#0369a1" },
    nutrition:       { bg: "rgba(16,185,129,0.12)", fg: "#047857" },
    hydration:       { bg: "rgba(59,130,246,0.12)", fg: "#1e40af" },
    race_strategy:   { bg: "rgba(234,88,12,0.12)",  fg: "#9a3412" },
    technique:       { bg: "rgba(168,85,247,0.12)", fg: "#6b21a8" },
    equipment:       { bg: "rgba(100,116,139,0.12)", fg: "#475569" },
    training_plan:   { bg: "rgba(37,99,235,0.12)",  fg: "#1d4ed8" },
    app_help:        { bg: "rgba(234,179,8,0.15)",  fg: "#a16207" },
    general_fitness: { bg: "rgba(132,204,22,0.12)", fg: "#4d7c0f" },
    uncategorized:   { bg: "rgba(148,163,184,0.18)", fg: "#64748b" },
    default:         { bg: "rgba(148,163,184,0.18)", fg: "#64748b" },
  };

  function _escape(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function _setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = String(v); }
  function _truncate(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n) + "…" : s; }
  function _formatDateTime(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
      const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      return `${date} ${time}`;
    } catch { return iso; }
  }

  // Exports
  global.loadAdminQuestions = loadAdminQuestions;
  global.renderAskIronZLogs = renderAskIronZLogs;
  global.sortAskIronZLogs   = sortAskIronZLogs;
})(typeof window !== "undefined" ? window : globalThis);
