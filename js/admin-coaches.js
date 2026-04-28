// admin-coaches.js — Admin Portal "Coaches" sub-tab
//
// Two inner sub-tabs:
//   1. Roster — coach list with promote / assign-client / remove flows.
//   2. Requests — pending Request-a-Coach submissions with match/archive.
//
// Loads after admin.js. Reuses _adminProfiles cached by loadAdminData()
// so the user-picker modals don't re-fetch the same profile list.
//
// Spec: new features/COACHING_FEATURE_SPEC_2026-04-28.md
// Schema: supabase/migrations/20260428_coaching_schema.sql

(function () {
  "use strict";

  // ── State ──────────────────────────────────────────────────────────────
  let _coaches = [];               // profiles with is_coach=true
  let _assignments = [];            // active coaching_assignments
  let _coachRequests = [];          // coach_requests rows (all statuses)
  let _profilesById = {};           // id → profile, populated on load
  let _coachInnerTab = "coach-roster";

  // ── Entry point ────────────────────────────────────────────────────────
  // Called from admin.js showAdminSubtab when the user picks "Coaches".
  async function loadAdminCoaches() {
    const client = window.supabaseClient;
    if (!client) {
      _setText("admin-coaches-total", "—");
      _setText("admin-coaches-active", "—");
      _setText("admin-coaches-pending-requests", "—");
      return;
    }

    _setText("admin-coaches-total", "…");
    _setText("admin-coaches-active", "…");
    _setText("admin-coaches-pending-requests", "…");

    // Four queries in parallel. The profiles fetch is independent of
    // window._adminProfiles so the Coaches tab works even when the admin
    // hasn't opened the Users tab yet — earlier the UUID-prefix fallback
    // showed up in archived request rows because _profileMap() had nothing
    // to look up against.
    try {
      const [profilesRes, coachesRes, assignRes, reqRes] = await Promise.all([
        client.from("profiles").select("id, full_name, email, subscription_status, role, is_coach, created_at"),
        client.from("profiles").select("*").eq("is_coach", true).order("full_name"),
        client.from("coaching_assignments").select("*").eq("active", true).order("assigned_at", { ascending: false }),
        client.from("coach_requests").select("*").order("created_at", { ascending: false }),
      ]);

      _coaches      = coachesRes.data || [];
      _assignments  = assignRes.data || [];
      _coachRequests = reqRes.data || [];

      _profilesById = {};
      for (const p of (profilesRes.data || [])) _profilesById[p.id] = p;
      // Also populate the shared cache so Roster modals don't re-fetch.
      if (profilesRes.data && profilesRes.data.length) {
        window._adminProfiles = profilesRes.data;
      }

      if (profilesRes.error) console.warn("[AdminCoaches] profiles query:", profilesRes.error);
      if (coachesRes.error)  console.warn("[AdminCoaches] coaches query:", coachesRes.error);
      if (assignRes.error)   console.warn("[AdminCoaches] assignments query:", assignRes.error);
      if (reqRes.error)      console.warn("[AdminCoaches] requests query:", reqRes.error);
    } catch (e) {
      console.warn("[AdminCoaches] load failed:", e);
    }

    _renderCoachStats();
    _renderRoster();
    _renderRequests();
  }

  function _renderCoachStats() {
    _setText("admin-coaches-total", _coaches.length);
    _setText("admin-coaches-active", _assignments.length);
    const pending = _coachRequests.filter(r => r.status === "pending").length;
    _setText("admin-coaches-pending-requests", pending);
    const badge = document.getElementById("admin-coach-requests-badge");
    if (badge) badge.textContent = pending > 0 ? ` (${pending})` : "";
  }

  // ── Inner sub-tab switcher ─────────────────────────────────────────────
  function showCoachInnerTab(id) {
    _coachInnerTab = id;
    document.querySelectorAll(".admin-coach-tab-content").forEach(el => el.style.display = "none");
    document.querySelectorAll(".admin-coach-tab").forEach(el => el.classList.remove("active"));
    const panel = document.getElementById(id);
    if (panel) panel.style.display = "";
    const btn = document.querySelector(`.admin-coach-tab[data-coach-tab="${id}"]`);
    if (btn) btn.classList.add("active");
  }

  // ══════════════════════════════════════════════════════════════════════
  // ROSTER SUB-TAB
  // ══════════════════════════════════════════════════════════════════════

  function _renderRoster() {
    const list = document.getElementById("admin-coach-roster-list");
    if (!list) return;

    if (_coaches.length === 0) {
      list.innerHTML = `<div class="card" style="color:var(--color-text-muted);text-align:center;padding:24px">
        No coaches yet. Promote a user to coach to get started.
      </div>`;
      return;
    }

    // Group assignments by coach for the per-coach client roster display.
    const byCoach = {};
    for (const a of _assignments) {
      if (!byCoach[a.coach_id]) byCoach[a.coach_id] = [];
      byCoach[a.coach_id].push(a);
    }
    const profileLookup = _profileMap();

    list.innerHTML = _coaches.map(coach => {
      const clients = byCoach[coach.id] || [];
      const clientRows = clients.map(a => {
        const cp = profileLookup[a.client_id];
        const cname = _esc(cp?.full_name || cp?.email || a.client_id.slice(0, 8));
        const since = a.assigned_at ? new Date(a.assigned_at).toLocaleDateString() : "—";
        const roleLabel = a.role === "primary" ? "primary" : "sub";
        return `<div class="admin-coach-client-row">
          <span class="admin-coach-client-name">${cname}</span>
          <span class="admin-coach-client-meta">${roleLabel} · since ${since}</span>
          <button class="admin-action-btn" title="Remove" onclick="adminRemoveCoachAssignment('${a.id}')">${(window.ICONS && window.ICONS.x) || "×"}</button>
        </div>`;
      }).join("") || `<div style="color:var(--color-text-muted);font-size:0.85rem;padding:6px 0">No clients assigned yet.</div>`;

      const coachName = _esc(coach.full_name || coach.email || coach.id.slice(0, 8));
      const coachEmail = _esc(coach.email || "");

      return `
        <div class="card admin-coach-card">
          <div class="admin-coach-card-header">
            <div>
              <div class="admin-coach-card-title">${coachName}</div>
              <div class="admin-coach-card-sub">${coachEmail} · ${clients.length} client${clients.length === 1 ? "" : "s"}</div>
            </div>
            <div class="admin-coach-card-actions">
              <button class="btn-secondary btn-sm" onclick="adminAssignClientOpen('${coach.id}')">+ Assign client</button>
              <button class="admin-action-btn" title="Demote (revoke coach status)" onclick="adminDemoteCoach('${coach.id}')">⤓</button>
            </div>
          </div>
          <div class="admin-coach-clients">${clientRows}</div>
          <div class="admin-coach-assign-form" id="admin-coach-assign-form-${coach.id}" style="display:none"></div>
        </div>`;
    }).join("");
  }

  function _profileMap() {
    // Prefer the local _profilesById fetched at loadAdminCoaches time —
    // that's the freshest. Fall back to window._adminProfiles cached by
    // the Users tab. Always fold coaches in case a coach is also a client.
    const map = { ..._profilesById };
    const profiles = window._adminProfiles || [];
    for (const p of profiles) if (!map[p.id]) map[p.id] = p;
    for (const c of _coaches) if (!map[c.id]) map[c.id] = c;
    return map;
  }

  // ── Promote-to-coach flow ──────────────────────────────────────────────

  function adminPromoteCoachOpen() {
    const editor = document.getElementById("admin-coach-promote-editor");
    if (!editor) return;
    if (editor.style.display !== "none") {
      editor.style.display = "none";
      return;
    }
    // Filter: non-coach users with an active account — has both an email
    // (auth bound) and a full_name (completed signup), so the dropdown
    // doesn't surface ghost rows from incomplete signups.
    const candidates = (window._adminProfiles || []).filter(_isPromoteEligible);
    editor.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0">Promote user to coach</h3>
        <button class="admin-action-btn" onclick="document.getElementById('admin-coach-promote-editor').style.display='none'">×</button>
      </div>
      <input type="search" class="input" id="admin-coach-promote-search"
        placeholder="Search by name or email..." style="width:100%;box-sizing:border-box;margin-bottom:8px"
        oninput="adminPromoteCoachFilter(this.value)" />
      <div id="admin-coach-promote-candidates" style="max-height:280px;overflow-y:auto">
        ${_renderPromoteCandidates(candidates)}
      </div>`;
    editor.style.display = "";
  }

  function adminPromoteCoachFilter(q) {
    const candidates = (window._adminProfiles || []).filter(p => !p.is_coach);
    const filtered = _filterByQuery(candidates, q);
    const el = document.getElementById("admin-coach-promote-candidates");
    if (el) el.innerHTML = _renderPromoteCandidates(filtered);
  }

  function _renderPromoteCandidates(list) {
    if (!list.length) return `<div style="color:var(--color-text-muted);padding:8px">No candidates.</div>`;
    return list.slice(0, 100).map(p => {
      const name = _esc(p.full_name || "—");
      const email = _esc(p.email || "");
      return `<div class="admin-coach-candidate-row">
        <div>
          <div style="font-weight:600">${name}</div>
          <div style="font-size:0.78rem;color:var(--color-text-muted)">${email}</div>
        </div>
        <button class="btn-primary btn-sm" onclick="adminPromoteCoachConfirm('${p.id}')">Promote</button>
      </div>`;
    }).join("");
  }

  async function adminPromoteCoachConfirm(userId) {
    const profile = (window._adminProfiles || []).find(p => p.id === userId);
    const label = profile?.full_name || profile?.email || userId;
    if (!confirm(`Promote ${label} to coach? They'll see a Coach Portal entry on their Profile screen.`)) return;

    const { error } = await window.supabaseClient
      .from("profiles")
      .update({ is_coach: true })
      .eq("id", userId);

    if (error) {
      alert("Failed to promote: " + error.message);
      return;
    }

    // Reflect locally so the UI updates without a full reload.
    if (profile) profile.is_coach = true;
    _coaches.push({ ...profile, is_coach: true });
    _coaches.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));

    document.getElementById("admin-coach-promote-editor").style.display = "none";
    _renderCoachStats();
    _renderRoster();
  }

  async function adminDemoteCoach(coachId) {
    const profile = (window._adminProfiles || []).find(p => p.id === coachId)
                 || _coaches.find(c => c.id === coachId);
    const label = profile?.full_name || profile?.email || coachId;
    const clientCount = _assignments.filter(a => a.coach_id === coachId).length;

    let msg = `Revoke coach status for ${label}?`;
    if (clientCount > 0) {
      msg += `\n\n${clientCount} active client assignment${clientCount === 1 ? "" : "s"} will be deactivated. Coach-assigned workouts already on client calendars stay (tagged "from former coach").`;
    }
    if (!confirm(msg)) return;

    // Two-step: demote + deactivate any active assignments.
    const { error: demoteErr } = await window.supabaseClient
      .from("profiles").update({ is_coach: false }).eq("id", coachId);
    if (demoteErr) { alert("Failed to demote: " + demoteErr.message); return; }

    if (clientCount > 0) {
      const { error: assignErr } = await window.supabaseClient
        .from("coaching_assignments")
        .update({ active: false, deactivated_at: new Date().toISOString() })
        .eq("coach_id", coachId).eq("active", true);
      if (assignErr) console.warn("[AdminCoaches] deactivate-on-demote failed:", assignErr);
    }

    await loadAdminCoaches();
  }

  // ── Assign-client flow ─────────────────────────────────────────────────

  function adminAssignClientOpen(coachId) {
    const form = document.getElementById(`admin-coach-assign-form-${coachId}`);
    if (!form) return;
    if (form.style.display !== "none") {
      form.style.display = "none";
      form.innerHTML = "";
      return;
    }
    const candidates = (window._adminProfiles || []).filter(p => p.id !== coachId);
    // Exclude users this coach already actively coaches.
    const alreadyAssigned = new Set(_assignments.filter(a => a.coach_id === coachId).map(a => a.client_id));
    const filtered = candidates.filter(p => !alreadyAssigned.has(p.id));

    form.innerHTML = `
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--color-border)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong>Assign new client</strong>
          <button class="admin-action-btn" onclick="adminAssignClientOpen('${coachId}')">×</button>
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
          <select class="input" id="admin-coach-assign-role-${coachId}" style="width:auto">
            <option value="primary">Primary coach</option>
            <option value="sub">Sub-coach</option>
          </select>
          <input type="search" class="input" id="admin-coach-assign-search-${coachId}"
            placeholder="Search candidate clients..."
            style="flex:1" oninput="adminAssignClientFilter('${coachId}', this.value)" />
        </div>
        <div id="admin-coach-assign-candidates-${coachId}" style="max-height:240px;overflow-y:auto">
          ${_renderAssignCandidates(coachId, filtered)}
        </div>
      </div>`;
    form.style.display = "";
  }

  function adminAssignClientFilter(coachId, q) {
    const candidates = (window._adminProfiles || []).filter(p => p.id !== coachId);
    const alreadyAssigned = new Set(_assignments.filter(a => a.coach_id === coachId).map(a => a.client_id));
    const filtered = _filterByQuery(candidates, q).filter(p => !alreadyAssigned.has(p.id));
    const el = document.getElementById(`admin-coach-assign-candidates-${coachId}`);
    if (el) el.innerHTML = _renderAssignCandidates(coachId, filtered);
  }

  function _renderAssignCandidates(coachId, list) {
    if (!list.length) return `<div style="color:var(--color-text-muted);padding:8px">No candidates.</div>`;
    return list.slice(0, 100).map(p => {
      const name = _esc(p.full_name || "—");
      const email = _esc(p.email || "");
      return `<div class="admin-coach-candidate-row">
        <div>
          <div style="font-weight:600">${name}</div>
          <div style="font-size:0.78rem;color:var(--color-text-muted)">${email}</div>
        </div>
        <button class="btn-primary btn-sm" onclick="adminAssignClientConfirm('${coachId}','${p.id}')">Assign</button>
      </div>`;
    }).join("");
  }

  async function adminAssignClientConfirm(coachId, clientId) {
    const roleSel = document.getElementById(`admin-coach-assign-role-${coachId}`);
    const role = roleSel?.value === "sub" ? "sub" : "primary";

    const adminUid = (await window.supabaseClient.auth.getUser())?.data?.user?.id || null;

    const { error } = await window.supabaseClient
      .from("coaching_assignments")
      .insert({
        client_id: clientId,
        coach_id: coachId,
        role,
        assigned_by: adminUid,
        active: true,
      });

    if (error) {
      // Common cases: client already has a primary (partial unique index),
      // or duplicate active row.
      if (/duplicate key/i.test(error.message)) {
        alert(role === "primary"
          ? "That client already has a primary coach. Demote the existing primary first, or assign as sub-coach."
          : "That client is already assigned to this coach.");
      } else {
        alert("Failed to assign: " + error.message);
      }
      return;
    }

    await loadAdminCoaches();
  }

  async function adminRemoveCoachAssignment(assignmentId) {
    const a = _assignments.find(x => x.id === assignmentId);
    const coach = _coaches.find(c => c.id === a?.coach_id);
    const client = (window._adminProfiles || []).find(p => p.id === a?.client_id);
    const cn = client?.full_name || client?.email || a?.client_id;
    const ch = coach?.full_name || coach?.email || a?.coach_id;
    if (!confirm(`Remove ${cn} from ${ch}'s clients?\n\nFuture coach-assigned workouts on the calendar stay, tagged "from former coach."`)) return;

    const { error } = await window.supabaseClient
      .from("coaching_assignments")
      .update({ active: false, deactivated_at: new Date().toISOString() })
      .eq("id", assignmentId);

    if (error) { alert("Failed to remove: " + error.message); return; }
    await loadAdminCoaches();
  }

  // ══════════════════════════════════════════════════════════════════════
  // REQUESTS SUB-TAB
  // ══════════════════════════════════════════════════════════════════════

  function _renderRequests() {
    const list = document.getElementById("admin-coach-requests-list");
    if (!list) return;

    const pending  = _coachRequests.filter(r => r.status === "pending");
    const matched  = _coachRequests.filter(r => r.status === "matched");
    const archived = _coachRequests.filter(r => r.status === "archived" || r.status === "declined");

    let html = "";
    html += _renderRequestSection("PENDING", pending, "pending");
    if (matched.length)  html += _renderRequestSection("MATCHED", matched, "matched");
    if (archived.length) html += _renderRequestSection("ARCHIVED", archived, "archived");

    if (!_coachRequests.length) {
      html = `<div class="card" style="color:var(--color-text-muted);text-align:center;padding:24px">
        No coach requests yet.
      </div>`;
    }

    list.innerHTML = html;
  }

  const _SPORT_LABEL = {
    running: "Running", cycling: "Cycling", swimming: "Swimming",
    triathlon: "Triathlon", strength: "Strength", hyrox: "Hyrox",
    general_fitness: "General fitness", other: "Other",
  };
  const _GOAL_LABEL = {
    race: "Race", general_fitness: "General fitness", body_comp: "Body comp",
    performance: "Performance", injury_return: "Injury return", other: "Other",
  };
  const _EXP_LABEL = {
    beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced",
  };

  function _renderRequestSection(title, rows, status) {
    // status: "pending" | "matched" | "archived"
    // Drives which actions render. Pending → Match + Archive. Matched +
    // Archived → Delete (for cleanup).
    if (!rows.length) return "";
    const profileLookup = _profileMap();
    const items = rows.map(r => {
      const p = profileLookup[r.user_id];
      // Header: prefer "Full Name · email". Fall back gracefully when
      // either is missing. The UUID prefix is now a last-resort sentinel
      // (e.g. profile somehow not loaded).
      const fullName = (p?.full_name || "").trim();
      const email    = (p?.email || "").trim();
      let nameLine;
      if (fullName && email)        nameLine = `${_esc(fullName)} <span style="color:var(--color-text-muted);font-weight:400">· ${_esc(email)}</span>`;
      else if (fullName)            nameLine = _esc(fullName);
      else if (email)               nameLine = _esc(email);
      else                          nameLine = `<span style="color:var(--color-text-muted);font-weight:400">${_esc(r.user_id.slice(0, 8))}</span>`;

      // Plan badge — current subscription_status from the profile, NOT
      // the snapshot at request time. Admin wants to know what the user
      // has right now when triaging.
      const isPremium = p?.subscription_status === "premium";
      const planBadge = isPremium
        ? `<span class="admin-badge admin-badge-premium" style="margin-left:6px">Premium</span>`
        : `<span class="admin-badge admin-badge-free" style="margin-left:6px">Free</span>`;

      const ago = r.created_at ? _relativeTime(r.created_at) : "";
      const sport = _SPORT_LABEL[r.sport] || r.sport;
      const goal  = _GOAL_LABEL[r.goal]   || r.goal;
      const exp   = _EXP_LABEL[r.experience] || r.experience;

      const notesBlock = _renderNotesBlock(r.id, r.notes || "");

      const matched = r.matched_coach_id
        ? (() => {
            const mc = profileLookup[r.matched_coach_id];
            const mcLabel = _esc(mc?.full_name || mc?.email || r.matched_coach_id.slice(0, 8));
            const mcDate  = r.matched_at ? " · " + new Date(r.matched_at).toLocaleDateString() : "";
            return `<div style="font-size:0.78rem;color:var(--color-text-muted);margin-top:4px">Matched to ${mcLabel}${mcDate}</div>`;
          })()
        : "";

      let actions = "";
      if (status === "pending") {
        actions = `
          <div class="admin-coach-request-actions">
            <button class="btn-secondary btn-sm" onclick="adminCoachRequestMatch('${r.id}')">Match to coach</button>
            <button class="btn-secondary btn-sm" aria-label="Archive request" title="Archive request"
              onclick="adminCoachRequestArchive('${r.id}')">Archive</button>
          </div>
          <div id="admin-coach-request-match-${r.id}" style="display:none"></div>`;
      } else if (status === "matched" || status === "archived") {
        actions = `
          <div class="admin-coach-request-actions">
            <button class="btn-secondary btn-sm" aria-label="Delete request" title="Delete request"
              onclick="adminCoachRequestDelete('${r.id}')" style="color:var(--color-danger,#b91c1c)">Delete</button>
          </div>`;
      }

      return `<div class="admin-coach-request-row">
        <div class="admin-coach-request-header">
          <div style="min-width:0;flex:1">
            <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis">${nameLine}${planBadge}</div>
            <div style="font-size:0.78rem;color:var(--color-text-muted);margin-top:2px">${ago}</div>
          </div>
          <div style="font-size:0.78rem;color:var(--color-text-muted);text-align:right;flex-shrink:0">
            ${_esc(sport)} · ${_esc(goal)} · ${_esc(exp)}
          </div>
        </div>
        ${notesBlock}
        ${matched}
        ${actions}
      </div>`;
    }).join("");

    return `<div class="card">
      <div style="font-size:0.78rem;font-weight:700;letter-spacing:0.06em;color:var(--color-text-muted);margin-bottom:8px">${title} (${rows.length})</div>
      ${items}
    </div>`;
  }

  // Long notes get a "Show more / Show less" toggle so the row stays
  // scannable at a glance. Threshold tuned so single-line notes never
  // need expansion but a paragraph does. Full text is stored on a
  // data-full attribute (HTML-escaped via _esc) — safer than embedding
  // it in an inline onclick payload, which breaks on quoted notes.
  const NOTES_PREVIEW_CHARS = 140;
  function _renderNotesBlock(requestId, raw) {
    if (!raw) return "";
    const text = String(raw);
    if (text.length <= NOTES_PREVIEW_CHARS) {
      return `<div class="admin-coach-request-notes">"${_esc(text)}"</div>`;
    }
    const preview = text.slice(0, NOTES_PREVIEW_CHARS).replace(/\s+\S*$/, "") + "…";
    return `
      <div class="admin-coach-request-notes" id="admin-coach-req-notes-${requestId}"
           data-expanded="0" data-full="${_esc(text)}" data-preview="${_esc(preview)}">
        <span class="admin-coach-req-notes-text">"${_esc(preview)}"</span>
        <button class="admin-coach-req-notes-toggle"
          aria-expanded="false"
          onclick="adminCoachRequestToggleNotes('${requestId}')">
          Show more
        </button>
      </div>`;
  }

  function adminCoachRequestToggleNotes(requestId) {
    const wrap = document.getElementById(`admin-coach-req-notes-${requestId}`);
    if (!wrap) return;
    const textEl = wrap.querySelector(".admin-coach-req-notes-text");
    const btn    = wrap.querySelector(".admin-coach-req-notes-toggle");
    if (!textEl || !btn) return;
    const expanded = wrap.dataset.expanded === "1";
    if (expanded) {
      textEl.textContent = `"${wrap.dataset.preview || ""}"`;
      btn.textContent = "Show more";
      btn.setAttribute("aria-expanded", "false");
      wrap.dataset.expanded = "0";
    } else {
      textEl.textContent = `"${wrap.dataset.full || ""}"`;
      btn.textContent = "Show less";
      btn.setAttribute("aria-expanded", "true");
      wrap.dataset.expanded = "1";
    }
  }

  async function adminCoachRequestDelete(requestId) {
    const r = _coachRequests.find(x => x.id === requestId);
    if (!r) return;
    const profileLookup = _profileMap();
    const p = profileLookup[r.user_id];
    const label = (p?.full_name || p?.email || r.user_id.slice(0, 8));
    if (!confirm(`Delete this request from ${label}? This is permanent — the row is removed from the database.`)) return;

    const { error } = await window.supabaseClient
      .from("coach_requests")
      .delete()
      .eq("id", requestId);

    if (error) {
      alert("Failed to delete: " + error.message);
      return;
    }
    await loadAdminCoaches();
  }

  function adminCoachRequestMatch(requestId) {
    const slot = document.getElementById(`admin-coach-request-match-${requestId}`);
    if (!slot) return;
    if (slot.style.display !== "none") {
      slot.style.display = "none";
      slot.innerHTML = "";
      return;
    }
    if (!_coaches.length) {
      slot.innerHTML = `<div style="color:var(--color-text-muted);padding:8px">No coaches available — promote one first.</div>`;
      slot.style.display = "";
      return;
    }
    const opts = _coaches.map(c => {
      const label = _esc(c.full_name || c.email || c.id.slice(0, 8));
      return `<option value="${c.id}">${label}</option>`;
    }).join("");
    slot.innerHTML = `
      <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--color-border);display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select class="input" id="admin-coach-request-coach-${requestId}" style="flex:1;min-width:180px">${opts}</select>
        <select class="input" id="admin-coach-request-role-${requestId}" style="width:auto">
          <option value="primary">Primary</option>
          <option value="sub">Sub</option>
        </select>
        <button class="btn-primary btn-sm" onclick="adminCoachRequestMatchConfirm('${requestId}')">Confirm match</button>
      </div>`;
    slot.style.display = "";
  }

  async function adminCoachRequestMatchConfirm(requestId) {
    const req = _coachRequests.find(r => r.id === requestId);
    if (!req) return;
    const coachId = document.getElementById(`admin-coach-request-coach-${requestId}`)?.value;
    const role = document.getElementById(`admin-coach-request-role-${requestId}`)?.value === "sub" ? "sub" : "primary";
    if (!coachId) { alert("Pick a coach first."); return; }

    const adminUid = (await window.supabaseClient.auth.getUser())?.data?.user?.id || null;

    // Two-step: create coaching_assignments row, then mark request matched.
    const { error: assignErr } = await window.supabaseClient
      .from("coaching_assignments")
      .insert({ client_id: req.user_id, coach_id: coachId, role, assigned_by: adminUid, active: true });
    if (assignErr) {
      if (/duplicate key/i.test(assignErr.message)) {
        if (!confirm("That client already has a primary coach. Mark the request matched anyway?")) return;
      } else {
        alert("Failed to create assignment: " + assignErr.message);
        return;
      }
    }

    const { error: reqErr } = await window.supabaseClient
      .from("coach_requests")
      .update({ status: "matched", matched_coach_id: coachId, matched_at: new Date().toISOString() })
      .eq("id", requestId);
    if (reqErr) { alert("Assignment created but failed to mark request matched: " + reqErr.message); }

    await loadAdminCoaches();
  }

  async function adminCoachRequestArchive(requestId) {
    const reason = prompt("Archive reason (optional):", "");
    if (reason === null) return;  // cancelled
    const { error } = await window.supabaseClient
      .from("coach_requests")
      .update({ status: "archived", archived_reason: reason || null })
      .eq("id", requestId);
    if (error) { alert("Failed to archive: " + error.message); return; }
    await loadAdminCoaches();
  }

  // ══════════════════════════════════════════════════════════════════════
  // Helpers
  // ══════════════════════════════════════════════════════════════════════

  function _setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
  }

  function _esc(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }

  function _filterByQuery(list, q) {
    const s = String(q || "").trim().toLowerCase();
    if (!s) return list;
    return list.filter(p =>
      (p.full_name || "").toLowerCase().includes(s) ||
      (p.email || "").toLowerCase().includes(s)
    );
  }

  function _relativeTime(iso) {
    try {
      const ms = Date.now() - new Date(iso).getTime();
      if (ms < 60 * 1000)             return "just now";
      const minutes = Math.floor(ms / (60 * 1000));
      if (minutes < 60)               return minutes === 1 ? "1m ago" : `${minutes}m ago`;
      const hours = Math.floor(ms / (60 * 60 * 1000));
      if (hours < 24)                 return hours === 1 ? "1h ago" : `${hours}h ago`;
      const days = Math.floor(ms / (24 * 60 * 60 * 1000));
      if (days === 1)                 return "1 day ago";
      if (days < 30)                  return `${days} days ago`;
      const months = Math.floor(days / 30);
      return months === 1 ? "1 month ago" : `${months} months ago`;
    } catch { return ""; }
  }

  // ── Public surface ─────────────────────────────────────────────────────
  window.loadAdminCoaches               = loadAdminCoaches;
  window.showCoachInnerTab              = showCoachInnerTab;
  window.adminPromoteCoachOpen          = adminPromoteCoachOpen;
  window.adminPromoteCoachFilter        = adminPromoteCoachFilter;
  window.adminPromoteCoachConfirm       = adminPromoteCoachConfirm;
  window.adminDemoteCoach               = adminDemoteCoach;
  window.adminAssignClientOpen          = adminAssignClientOpen;
  window.adminAssignClientFilter        = adminAssignClientFilter;
  window.adminAssignClientConfirm       = adminAssignClientConfirm;
  window.adminRemoveCoachAssignment     = adminRemoveCoachAssignment;
  window.adminCoachRequestMatch         = adminCoachRequestMatch;
  window.adminCoachRequestMatchConfirm  = adminCoachRequestMatchConfirm;
  window.adminCoachRequestArchive       = adminCoachRequestArchive;
  window.adminCoachRequestDelete        = adminCoachRequestDelete;
  window.adminCoachRequestToggleNotes   = adminCoachRequestToggleNotes;
})();
