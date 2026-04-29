// admin.js — Admin Panel
// Gated by window._userRole === 'admin'

let _adminProfiles = [];

// ── Visibility ────────────────────────────────────────────────────────────────

function initAdminVisibility() {
  const isAdmin = window._userRole === "admin";
  // New entry point: dedicated card at the top of the Settings tab
  const card = document.getElementById("section-admin-entry");
  if (card) card.style.display = isAdmin ? "" : "none";
  // Legacy entry point: profile-dropdown button (dropdown removed during
  // the bottom-nav refactor but the id is still checked by older builds)
  const btn = document.getElementById("admin-dropdown-btn");
  if (btn) btn.style.display = isAdmin ? "" : "none";
  if (typeof window.refreshToolsCardVisibility === "function") window.refreshToolsCardVisibility();
}

// ── Patch showTab to load admin data ─────────────────────────────────────────

if (typeof showTab === 'function') {
  const _origShowTab = showTab;
  showTab = function (name) {
    _origShowTab(name);
    if (name === "admin" && window._userRole === "admin") {
      loadAdminData();
    }
  };
}

// ── Data Loading ─────────────────────────────────────────────────────────────

async function loadAdminData() {
  const client = window.supabaseClient;
  console.log("[Admin] loadAdminData start, role:", window._userRole, "client:", !!client);

  // Show "…" as a loading state so users can tell the call is in flight
  // (rather than the static "--" placeholder which reads as "broken").
  setText("admin-total-users", "…");
  setText("admin-new-7d", "…");
  setText("admin-premium-count", "…");
  setText("admin-admin-count", "…");

  // Dev bypass with placeholder credentials — show mock data
  if (typeof DEV_BYPASS_AUTH !== "undefined" && DEV_BYPASS_AUTH) {
    _adminProfiles = generateMockProfiles();
    _hideAdminError();
    renderAdminStats();
    renderAdminUsers();
    return;
  }

  // Bug 4: silent failures (Supabase not initialized in the Capacitor
  // WebView, RLS denying the query, network error) used to leave "--"
  // in every stat. Now we surface a red error banner so the cause is
  // visible instead of guessable.
  if (!client) {
    _showAdminError("Supabase client not available — check connection.");
    setText("admin-total-users", "—");
    setText("admin-new-7d", "—");
    setText("admin-premium-count", "—");
    setText("admin-admin-count", "—");
    return;
  }

  // Prime the auth context BEFORE the first PostgREST call. Without this
  // the supabase-js client can hang indefinitely on the first query of
  // the session — internally it tries to refresh the JWT lazily, and if
  // the realtime websocket / another tab holds the auth lock the query
  // stalls until the lock releases (which on this app reliably exceeded
  // 15s, hence the timeout users were seeing on first admin-tab open).
  // A refresh "fixed" it because the page reload re-primed everything.
  try {
    await Promise.race([
      client.auth.getSession(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("auth getSession timeout")), 3000)),
    ]);
  } catch (e) {
    console.warn("[Admin] session prime failed (continuing anyway):", e?.message);
  }

  // Fetch with a single retry on timeout. The first call after a long
  // idle (or right after init) is the one that hangs; the second almost
  // always succeeds because the session has now been primed.
  const fetchProfiles = async (timeoutMs) => {
    const queryPromise = client
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Query timed out after ${timeoutMs / 1000}s`)), timeoutMs)
    );
    return Promise.race([queryPromise, timeoutPromise]);
  };

  let result;
  try {
    result = await fetchProfiles(6000);
  } catch (e) {
    console.warn("[Admin] first attempt failed, retrying:", e?.message);
    try {
      result = await fetchProfiles(8000);
    } catch (e2) {
      console.warn("[Admin] retry failed:", e2);
      _adminProfiles = [];
      _showAdminError(`Failed to load: ${e2 && e2.message ? e2.message : "unknown"}`);
      setText("admin-total-users", "—");
      setText("admin-new-7d", "—");
      setText("admin-premium-count", "—");
      setText("admin-admin-count", "—");
      return;
    }
  }

  const { data, error } = result || {};
  if (error) {
    console.warn("[Admin] query error:", error);
    _showAdminError(`Failed to load profiles: ${error.message || error.code || "unknown error"}`);
    setText("admin-total-users", "—");
    setText("admin-new-7d", "—");
    setText("admin-premium-count", "—");
    setText("admin-admin-count", "—");
    return;
  }

  _adminProfiles = data || [];
  console.log("[Admin] loaded", _adminProfiles.length, "profiles");
  _hideAdminError();
  renderAdminStats();
  renderAdminUsers();
}

function _showAdminError(msg) {
  let banner = document.getElementById("admin-error-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "admin-error-banner";
    banner.className = "admin-error-banner";
    const tab = document.getElementById("tab-admin") || document.body;
    tab.insertBefore(banner, tab.firstChild);
  }
  banner.textContent = msg;
  banner.style.display = "";
}
function _hideAdminError() {
  const banner = document.getElementById("admin-error-banner");
  if (banner) banner.style.display = "none";
}

// ── Mock data for dev mode ───────────────────────────────────────────────────

function generateMockProfiles() {
  const now = new Date();
  const names = [
    { full_name: "Chase Zernich", email: "chase@ironz.app", role: "admin", subscription_status: "premium" },
    { full_name: "Alex Rivera", email: "alex.r@gmail.com", role: "user", subscription_status: "premium" },
    { full_name: "Jordan Lee", email: "j.lee@outlook.com", role: "user", subscription_status: "free" },
    { full_name: "Sam Patel", email: "sam.patel@yahoo.com", role: "user", subscription_status: "free" },
    { full_name: "Morgan Chen", email: "morgan.c@icloud.com", role: "user", subscription_status: "premium" },
    { full_name: "Taylor Kim", email: "tkim@gmail.com", role: "user", subscription_status: "free" },
    { full_name: "Casey Brooks", email: "casey.b@hotmail.com", role: "user", subscription_status: "free" },
    { full_name: "Riley Quinn", email: "rileyq@proton.me", role: "user", subscription_status: "premium" },
  ];
  return names.map((n, i) => ({
    id: `mock-${i}`,
    ...n,
    created_at: new Date(now.getTime() - i * 2 * 86400000).toISOString(),
  }));
}

// ── Analytics ────────────────────────────────────────────────────────────────

function renderAdminStats() {
  const total = _adminProfiles.length;
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

  const newLast7 = _adminProfiles.filter(p => new Date(p.created_at) >= sevenDaysAgo).length;
  const premium = _adminProfiles.filter(p => p.subscription_status === "premium").length;
  const admins = _adminProfiles.filter(p => p.role === "admin").length;

  setText("admin-total-users", total);
  setText("admin-new-7d", newLast7);
  setText("admin-premium-count", premium);
  setText("admin-admin-count", admins);

  renderSignupChart();
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Signup chart (last 30 days) ──────────────────────────────────────────────

function renderSignupChart() {
  const container = document.getElementById("admin-signup-chart");
  if (!container) return;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const days = 30;
  const buckets = {};

  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - i * 86400000);
    buckets[d.toISOString().slice(0, 10)] = 0;
  }

  _adminProfiles.forEach(p => {
    const dateStr = (p.created_at || "").slice(0, 10);
    if (dateStr in buckets) buckets[dateStr]++;
  });

  const entries = Object.entries(buckets).sort((a, b) => a[0].localeCompare(b[0]));
  const max = Math.max(1, ...entries.map(e => e[1]));

  container.innerHTML = `
    <div class="admin-chart-header">
      <span class="admin-chart-title">Signups (30 days)</span>
    </div>
    <div class="admin-chart-bars">
      ${entries.map(([date, count]) => {
        const pct = (count / max) * 100;
        const label = date.slice(5); // MM-DD
        return `<div class="admin-chart-col" title="${date}: ${count}">
          <div class="admin-chart-bar" style="height:${Math.max(pct, 2)}%"></div>
          ${entries.length <= 14 ? `<span class="admin-chart-date">${label}</span>` : ""}
        </div>`;
      }).join("")}
    </div>
  `;
}

// ── User Table ───────────────────────────────────────────────────────────────

function renderAdminUsers() {
  const tbody = document.getElementById("admin-users-tbody");
  if (!tbody) return;

  const search = (document.getElementById("admin-search")?.value || "").toLowerCase();
  const roleFilter = document.getElementById("admin-filter-role")?.value || "";
  const subFilter = document.getElementById("admin-filter-sub")?.value || "";

  let filtered = _adminProfiles;

  if (search) {
    filtered = filtered.filter(p =>
      (p.full_name || "").toLowerCase().includes(search) ||
      (p.email || "").toLowerCase().includes(search)
    );
  }
  if (roleFilter) filtered = filtered.filter(p => p.role === roleFilter);
  if (subFilter) filtered = filtered.filter(p => p.subscription_status === subFilter);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--color-text-muted)">No users found</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const name = escAdmin(p.full_name || "—");
    const email = escAdmin(p.email || "—");
    const roleBadge = p.role === "admin"
      ? `<span class="admin-badge admin-badge-admin">Admin</span>`
      : `<span class="admin-badge admin-badge-user">User</span>`;
    // Surface profiles.is_coach so the Users list reflects coaching
    // status without forcing the admin into the Coaches sub-tab.
    const coachBadge = p.is_coach
      ? `<span class="admin-badge admin-badge-coach" style="margin-left:4px">Coach</span>`
      : "";
    const subBadge = p.subscription_status === "premium"
      ? `<span class="admin-badge admin-badge-premium">Premium</span>`
      : `<span class="admin-badge admin-badge-free">Free</span>`;
    const joined = p.created_at ? new Date(p.created_at).toLocaleDateString() : "—";

    const isMock = String(p.id).startsWith("mock-");

    return `<tr>
      <td class="admin-td-name">${name}</td>
      <td class="admin-td-email"><span class="admin-td-email-text" title="${email}">${email}</span></td>
      <td style="white-space:nowrap">${roleBadge}${coachBadge}</td>
      <td>${subBadge}</td>
      <td style="white-space:nowrap">${joined}</td>
      <td class="admin-td-actions">
        <button class="admin-action-btn" onclick="adminToggleRole('${p.id}')" ${isMock ? "" : ""} title="Set role: User / Coach / Admin">
          ${ICONS.settings || "Role"}
        </button>
        <button class="admin-action-btn" onclick="adminToggleSub('${p.id}', '${p.subscription_status}')" title="Toggle plan">
          ${ICONS.star || "Plan"}
        </button>
      </td>
    </tr>`;
  }).join("");
}

function escAdmin(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// ── Actions ──────────────────────────────────────────────────────────────────

// Lightweight in-app confirm/picker modal. Reuses the `.rating-modal-overlay`
// shell so it lands inside the app's design system instead of the native
// browser confirm() (which renders as an OS-styled alert with no theming).
// `actions` is an array of { label, kind, onClick }. Returns nothing — the
// chosen button's onClick handler drives the next step.
function _adminOpenModal({ title, body, actions }) {
  const id = "admin-modal-overlay";
  const old = document.getElementById(id);
  if (old) old.remove();
  const overlay = document.createElement("div");
  overlay.id = id;
  overlay.className = "rating-modal-overlay";
  const close = () => {
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  const btnHtml = (actions || []).map((a, i) => {
    const cls =
      a.kind === "primary" ? "btn-primary" :
      a.kind === "danger"  ? "btn-danger"  :
      a.kind === "active"  ? "btn-primary" :
                             "btn-secondary";
    const disabled = a.disabled ? " disabled" : "";
    return `<button class="${cls}" data-action-idx="${i}" style="flex:1;min-height:38px"${disabled}>${escAdmin(a.label)}</button>`;
  }).join("");
  overlay.innerHTML = `
    <div class="rating-modal" style="max-width:380px">
      <div class="rating-modal-title">${escAdmin(title || "Confirm")}</div>
      ${body ? `<div style="text-align:center;color:var(--color-text-muted);font-size:0.9rem;margin-bottom:14px">${body}</div>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap">${btnHtml}</div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));
  overlay.querySelectorAll("button[data-action-idx]").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.getAttribute("data-action-idx"), 10);
      const a = actions[idx];
      close();
      if (a && typeof a.onClick === "function") a.onClick();
    };
  });
}

async function adminToggleRole(userId) {
  // Three-tier UI on top of the two-column data model:
  //   user  → role=user,  is_coach=false
  //   coach → role=user,  is_coach=true
  //   admin → role=admin, is_coach=false
  const p = _adminProfiles.find(x => x.id === userId);
  if (!p) return;
  const current = p.role === "admin" ? "admin" : (p.is_coach ? "coach" : "user");

  const apply = async (next) => {
    if (next === current) return;
    const updates =
      next === "admin" ? { role: "admin", is_coach: false } :
      next === "coach" ? { role: "user",  is_coach: true  } :
                         { role: "user",  is_coach: false };

    if (String(userId).startsWith("mock-")) {
      Object.assign(p, updates);
      renderAdminStats();
      renderAdminUsers();
      return;
    }

    const { error } = await window.supabaseClient
      .from("profiles")
      .update(updates)
      .eq("id", userId);

    if (error) {
      _adminOpenModal({
        title: "Couldn't update role",
        body: error.message,
        actions: [{ label: "OK", kind: "primary", onClick: () => {} }],
      });
      return;
    }
    await loadAdminData();
  };

  const subjectName = p.full_name || p.email || "this user";
  _adminOpenModal({
    title: `Set role for ${subjectName}`,
    body: `Currently: <strong>${current}</strong>`,
    actions: [
      { label: "User",   kind: current === "user"  ? "active" : "secondary", onClick: () => apply("user") },
      { label: "Coach",  kind: current === "coach" ? "active" : "secondary", onClick: () => apply("coach") },
      { label: "Admin",  kind: current === "admin" ? "active" : "secondary", onClick: () => apply("admin") },
      { label: "Cancel", kind: "secondary", onClick: () => {} },
    ],
  });
}

async function adminToggleSub(userId, currentSub) {
  const newSub = currentSub === "premium" ? "free" : "premium";
  const p = _adminProfiles.find(x => x.id === userId);
  const subjectName = p?.full_name || p?.email || "this user";
  return new Promise((resolve) => {
    _adminOpenModal({
      title: `Change plan for ${subjectName}`,
      body: `Switch to <strong>${newSub}</strong>?`,
      actions: [
        { label: "Cancel", kind: "secondary", onClick: () => resolve(false) },
        { label: `Set ${newSub}`, kind: "primary", onClick: () => { _adminApplySub(userId, newSub); resolve(true); } },
      ],
    });
  });
}

async function _adminApplySub(userId, newSub) {
  // Mock mode
  if (String(userId).startsWith("mock-")) {
    const p = _adminProfiles.find(x => x.id === userId);
    if (p) p.subscription_status = newSub;
    renderAdminStats();
    renderAdminUsers();
    return;
  }

  const { error } = await window.supabaseClient
    .from("profiles")
    .update({ subscription_status: newSub })
    .eq("id", userId);

  if (error) {
    _adminOpenModal({
      title: "Couldn't update plan",
      body: error.message,
      actions: [{ label: "OK", kind: "primary", onClick: () => {} }],
    });
    return;
  }
  await loadAdminData();
}

// ── Sub-tab navigation ──────────────────────────────────────────────────────

function showAdminSubtab(id) {
  document.querySelectorAll('.admin-subtab-content').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.admin-subtab').forEach(el => el.classList.remove('active'));
  const panel = document.getElementById(id);
  if (panel) panel.style.display = '';
  const btn = document.querySelector(`.admin-subtab[data-subtab="${id}"]`);
  if (btn) btn.classList.add('active');

  if (id === 'admin-philosophy') loadAdminModules();
  if (id === 'admin-exercises') loadAdminExercises();
  if (id === 'admin-gaps') loadAdminGaps();
  if (id === 'admin-analytics') loadAdminAnalytics();
  if (id === 'admin-coaches' && typeof loadAdminCoaches === 'function') loadAdminCoaches();
}

// ── Philosophy Modules ──────────────────────────────────────────────────────

let _adminModules = [];
let _adminEditingModule = null;

async function loadAdminModules() {
  const client = window.supabaseClient;
  try {
    const { data, error } = await client.from('philosophy_modules').select('*').order('category');
    if (error) { console.warn('Admin: modules load error', error.message); return; }
    _adminModules = data || [];
  } catch (e) { console.warn('Admin: modules error', e); _adminModules = []; }
  renderAdminModuleStats();
  renderAdminModules();
}

function renderAdminModuleStats() {
  setText('admin-modules-total', _adminModules.length);
  setText('admin-modules-active', _adminModules.filter(m => m.is_active).length);
  const cats = new Set(_adminModules.map(m => m.category));
  setText('admin-modules-categories', cats.size);

  const sel = document.getElementById('admin-modules-category-filter');
  if (sel && sel.options.length <= 1) {
    cats.forEach(c => { const o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o); });
  }
}

function renderAdminModules() {
  const tbody = document.getElementById('admin-modules-tbody');
  if (!tbody) return;
  const search = (document.getElementById('admin-modules-search')?.value || '').toLowerCase();
  const catFilter = document.getElementById('admin-modules-category-filter')?.value || '';

  let filtered = _adminModules;
  if (search) filtered = filtered.filter(m => m.id.toLowerCase().includes(search) || m.title.toLowerCase().includes(search));
  if (catFilter) filtered = filtered.filter(m => m.category === catFilter);

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--color-text-muted)">No modules found</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(m => `<tr>
    <td><code style="font-size:0.85em">${escAdmin(m.id)}</code></td>
    <td><span class="admin-badge">${escAdmin(m.category)}</span></td>
    <td>${escAdmin(m.title)}</td>
    <td>${escAdmin(m.version)}</td>
    <td>${m.is_active ? '<span style="color:var(--color-success)">Yes</span>' : '<span style="color:var(--color-danger)">No</span>'}</td>
    <td class="admin-td-actions">
      <button class="admin-action-btn" onclick="adminEditModule('${escAdmin(m.id)}')" title="Edit">${ICONS.edit || 'Edit'}</button>
      <button class="admin-action-btn" onclick="adminToggleModuleActive('${escAdmin(m.id)}', ${m.is_active})" title="${m.is_active ? 'Deactivate' : 'Activate'}">${m.is_active ? (ICONS.eyeOff || 'Off') : (ICONS.eye || 'On')}</button>
    </td>
  </tr>`).join('');
}

function adminToggleModuleEditor(show) {
  const ed = document.getElementById('admin-module-editor');
  if (!ed) return;
  if (show === false || ed.style.display !== 'none') {
    ed.style.display = 'none';
    _adminEditingModule = null;
    return;
  }
  _adminEditingModule = null;
  document.getElementById('admin-module-editor-title').textContent = 'Add Module';
  ['admin-mod-id','admin-mod-category','admin-mod-title','admin-mod-applies','admin-mod-principles','admin-mod-rules','admin-mod-rationale'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('admin-mod-version').value = '1.0';
  document.getElementById('admin-mod-priority').value = 'medium';
  document.getElementById('admin-mod-id').disabled = false;
  ed.style.display = '';
}

function adminEditModule(moduleId) {
  const m = _adminModules.find(x => x.id === moduleId);
  if (!m) return;
  _adminEditingModule = moduleId;
  document.getElementById('admin-module-editor-title').textContent = 'Edit Module';
  document.getElementById('admin-mod-id').value = m.id;
  document.getElementById('admin-mod-id').disabled = true;
  document.getElementById('admin-mod-category').value = m.category || '';
  document.getElementById('admin-mod-title').value = m.title || '';
  document.getElementById('admin-mod-version').value = m.version || '1.0';
  document.getElementById('admin-mod-applies').value = JSON.stringify(m.applies_when || {}, null, 2);
  document.getElementById('admin-mod-principles').value = (m.principles || []).join('\n');
  document.getElementById('admin-mod-rules').value = (m.plan_rules || []).join('\n');
  document.getElementById('admin-mod-rationale').value = m.rationale || '';
  document.getElementById('admin-mod-priority').value = m.priority || 'medium';
  document.getElementById('admin-module-editor').style.display = '';
}

async function adminSaveModule() {
  const msg = document.getElementById('admin-mod-msg');
  const id = document.getElementById('admin-mod-id').value.trim();
  const category = document.getElementById('admin-mod-category').value.trim();
  const title = document.getElementById('admin-mod-title').value.trim();
  if (!id || !category || !title) { msg.textContent = 'ID, category, and title are required.'; msg.style.color = 'var(--color-danger)'; return; }

  let applies_when;
  try { applies_when = JSON.parse(document.getElementById('admin-mod-applies').value || '{}'); }
  catch { msg.textContent = 'Invalid JSON in Applies When.'; msg.style.color = 'var(--color-danger)'; return; }

  const row = {
    id,
    category,
    title,
    version: document.getElementById('admin-mod-version').value || '1.0',
    applies_when,
    principles: document.getElementById('admin-mod-principles').value.split('\n').filter(Boolean),
    plan_rules: document.getElementById('admin-mod-rules').value.split('\n').filter(Boolean),
    rationale: document.getElementById('admin-mod-rationale').value || null,
    priority: document.getElementById('admin-mod-priority').value || 'medium',
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  const { error } = await window.supabaseClient.from('philosophy_modules').upsert(row, { onConflict: 'id' });
  if (error) { msg.textContent = 'Save failed: ' + error.message; msg.style.color = 'var(--color-danger)'; return; }
  msg.textContent = 'Saved!'; msg.style.color = 'var(--color-success)';
  setTimeout(() => { msg.textContent = ''; adminToggleModuleEditor(false); }, 1500);
  await loadAdminModules();
}

async function adminToggleModuleActive(moduleId, currentActive) {
  const { error } = await window.supabaseClient.from('philosophy_modules').update({ is_active: !currentActive }).eq('id', moduleId);
  if (error) { alert('Failed: ' + error.message); return; }
  await loadAdminModules();
}

// ── Exercise Library ────────────────────────────────────────────────────────

let _adminExercises = [];

// Admin table expects Supabase `exercise_library` shape (name, movement_pattern,
// muscle_groups[], difficulty, tier, equipment_required[]). window.EXERCISE_DB
// uses a different schema — map it here so the admin view doesn't need to
// know the difference. Derives difficulty from tier for rows that don't
// carry one explicitly.
function _tierToDifficulty(tier) {
  switch (tier) {
    case 'primary':   return 'intermediate';
    case 'secondary': return 'intermediate';
    case 'tertiary':  return 'beginner';
    default:          return '—';
  }
}

function _adminShapeFromExerciseDB(ex) {
  return {
    id: ex.id,
    name: ex.name,
    movement_pattern: ex.pattern || ex.sheet || '—',
    muscle_groups: Array.isArray(ex.muscleCategory) ? ex.muscleCategory : [],
    difficulty: _tierToDifficulty(ex.tier),
    tier: ex.tier || '—',
    equipment_required: Array.isArray(ex.equipmentNeeded) ? ex.equipmentNeeded : [],
  };
}

async function loadAdminExercises() {
  // Primary source: window.EXERCISE_DB (generated from the spreadsheet +
  // supplement — 307 exercises). Keeps the admin view in lockstep with
  // what the planner + builders actually see.
  //
  // Retry once after a short wait if the script tag hasn't evaluated yet
  // (browsers can defer parsing under load). Without this we'd silently
  // fall through to the 158-row Supabase table whenever EXERCISE_DB is a
  // hair late — the exact symptom that made this view look broken.
  async function _waitForExerciseDB(maxMs) {
    const start = Date.now();
    while (!(Array.isArray(window.EXERCISE_DB) && window.EXERCISE_DB.length > 0)) {
      if (Date.now() - start > maxMs) return false;
      await new Promise(r => setTimeout(r, 50));
    }
    return true;
  }

  const ready = Array.isArray(window.EXERCISE_DB) && window.EXERCISE_DB.length > 0
    ? true
    : await _waitForExerciseDB(1500);

  if (ready) {
    _adminExercises = window.EXERCISE_DB.map(_adminShapeFromExerciseDB);
    _adminExercises.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    console.log(`[admin] Exercises loaded from window.EXERCISE_DB: ${_adminExercises.length} rows`);
    renderAdminExerciseStats();
    renderAdminExercises();
    return;
  }
  // Fallback: legacy Supabase exercise_library table. Only runs if
  // exercise-data.js failed to load entirely (script error, offline
  // first boot). Emits a visible warning so the mismatched count isn't
  // silent.
  console.warn('[admin] window.EXERCISE_DB not available — falling back to Supabase exercise_library (legacy, 158 rows)');
  const client = window.supabaseClient;
  try {
    const { data, error } = await client.from('exercise_library').select('*').order('name');
    if (error) { console.warn('Admin: exercises load error', error.message); return; }
    _adminExercises = data || [];
  } catch (e) { console.warn('Admin: exercises error', e); _adminExercises = []; }
  renderAdminExerciseStats();
  renderAdminExercises();
}

function renderAdminExerciseStats() {
  setText('admin-exercises-total', _adminExercises.length);
  const patterns = new Set(_adminExercises.map(e => e.movement_pattern));
  setText('admin-exercises-patterns', patterns.size);

  const sel = document.getElementById('admin-exercises-pattern-filter');
  if (sel && sel.options.length <= 1) {
    patterns.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; sel.appendChild(o); });
  }
}

function renderAdminExercises() {
  const tbody = document.getElementById('admin-exercises-tbody');
  if (!tbody) return;
  const search = (document.getElementById('admin-exercises-search')?.value || '').toLowerCase();
  const patFilter = document.getElementById('admin-exercises-pattern-filter')?.value || '';
  const diffFilter = document.getElementById('admin-exercises-diff-filter')?.value || '';

  let filtered = _adminExercises;
  if (search) filtered = filtered.filter(e => e.name.toLowerCase().includes(search) || e.id.toLowerCase().includes(search));
  if (patFilter) filtered = filtered.filter(e => e.movement_pattern === patFilter);
  if (diffFilter) filtered = filtered.filter(e => e.difficulty === diffFilter);

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--color-text-muted)">No exercises found</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.slice(0, 100).map(e => `<tr>
    <td>${escAdmin(e.name)}</td>
    <td><span class="admin-badge">${escAdmin(e.movement_pattern)}</span></td>
    <td style="font-size:0.85em">${(e.muscle_groups || []).join(', ')}</td>
    <td>${escAdmin(e.difficulty)}</td>
    <td>${e.tier}</td>
    <td style="font-size:0.85em">${(e.equipment_required || []).join(', ') || 'None'}</td>
  </tr>`).join('');

  if (filtered.length > 100) {
    tbody.innerHTML += `<tr><td colspan="6" style="text-align:center;padding:12px;color:var(--color-text-muted)">Showing 100 of ${filtered.length}</td></tr>`;
  }
}

// ── Philosophy Gaps ─────────────────────────────────────────────────────────

let _adminGaps = [];

async function loadAdminGaps() {
  const client = window.supabaseClient;
  try {
    const { data, error } = await client.from('philosophy_gaps').select('*').order('last_seen', { ascending: false });
    if (error) { console.warn('Admin: gaps load error', error.message); return; }
    _adminGaps = data || [];
  } catch (e) { console.warn('Admin: gaps error', e); _adminGaps = []; }
  renderAdminGapStats();
  renderAdminGaps();
}

function renderAdminGapStats() {
  const open = _adminGaps.filter(g => g.resolution_status === 'open').length;
  const resolved = _adminGaps.filter(g => g.resolution_status === 'resolved').length;
  const totalUsers = _adminGaps.reduce((s, g) => s + (g.user_count || 0), 0);
  setText('admin-gaps-open', open);
  setText('admin-gaps-resolved', resolved);
  setText('admin-gaps-users', totalUsers);
}

function renderAdminGaps() {
  const container = document.getElementById('admin-gaps-list');
  if (!container) return;
  const statusFilter = document.getElementById('admin-gaps-filter')?.value || '';

  let filtered = _adminGaps;
  if (statusFilter) filtered = filtered.filter(g => g.resolution_status === statusFilter);

  if (!filtered.length) {
    container.innerHTML = '<div class="card" style="text-align:center;color:var(--color-text-muted);padding:24px">No gaps found</div>';
    return;
  }

  container.innerHTML = filtered.map(g => {
    const statusColors = { open: 'var(--color-danger)', in_progress: 'var(--color-warning, orange)', resolved: 'var(--color-success)' };
    return `<div class="card" style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:12px">
        <div>
          <strong>${escAdmin(g.dimension)}</strong>: ${escAdmin(g.value)}
          <div style="font-size:0.85em;color:var(--color-text-muted);margin-top:4px">
            ${g.user_count} user${g.user_count !== 1 ? 's' : ''} affected &middot; First seen ${new Date(g.first_seen).toLocaleDateString()}
          </div>
          ${g.resolution_notes ? `<div style="font-size:0.85em;margin-top:4px">Note: ${escAdmin(g.resolution_notes)}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
          <span class="admin-badge" style="background:${statusColors[g.resolution_status] || 'gray'};color:#fff">${g.resolution_status}</span>
          ${g.resolution_status !== 'resolved' ? `
            <select class="input" style="width:auto;font-size:0.85em" onchange="adminUpdateGapStatus('${g.id}', this.value)">
              <option value="">Change...</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

async function adminUpdateGapStatus(gapId, newStatus) {
  if (!newStatus) return;
  const notes = newStatus === 'resolved' ? prompt('Resolution notes (optional):') : null;
  const update = { resolution_status: newStatus };
  if (notes) update.resolution_notes = notes;
  const { error } = await window.supabaseClient.from('philosophy_gaps').update(update).eq('id', gapId);
  if (error) { alert('Failed: ' + error.message); return; }
  await loadAdminGaps();
}

// ── Analytics ───────────────────────────────────────────────────────────────

async function loadAdminAnalytics() {
  const client = window.supabaseClient;

  // Fire the new analytics_events dashboard independently so it can't
  // block the older plans/outcomes widgets if it errors out.
  loadAdminEventAnalytics().catch(e => {
    console.warn("Admin: event analytics failed", e);
    if (typeof reportCaughtError === "function") reportCaughtError(e, { context: "admin", action: "load_event_analytics" });
  });

  // Plan count
  try {
    const { count } = await client.from('generated_plans').select('id', { count: 'exact', head: true });
    setText('admin-plans-total', count || 0);
  } catch { setText('admin-plans-total', '?'); }

  // Outcomes count
  try {
    const { count } = await client.from('user_outcomes').select('id', { count: 'exact', head: true });
    setText('admin-outcomes-total', count || 0);
  } catch { setText('admin-outcomes-total', '?'); }

  // Module effectiveness report
  const reportEl = document.getElementById('admin-effectiveness-report');
  try {
    const { data, error } = await client.rpc('module_effectiveness_report');
    if (error || !data || data.length === 0) {
      reportEl.innerHTML = '<p style="color:var(--color-text-muted)">No outcome data yet. Analytics will appear once users complete plans and log outcomes.</p>';
    } else {
      reportEl.innerHTML = `<table class="admin-table"><thead><tr>
        <th>Module</th><th>Plans</th><th>Avg Difficulty</th><th>Completion %</th><th>Avg Energy</th>
      </tr></thead><tbody>${data.map(r => `<tr>
        <td><code style="font-size:0.85em">${escAdmin(r.module_id)}</code></td>
        <td>${r.plan_count}</td>
        <td>${r.avg_difficulty_score != null ? (r.avg_difficulty_score * 100).toFixed(0) + '%' : '—'}</td>
        <td>${r.avg_completion_rate != null ? (r.avg_completion_rate * 100).toFixed(0) + '%' : '—'}</td>
        <td>${r.avg_energy != null ? (r.avg_energy * 100).toFixed(0) + '%' : '—'}</td>
      </tr>`).join('')}</tbody></table>`;
    }
  } catch (e) {
    reportEl.innerHTML = '<p style="color:var(--color-text-muted)">Could not load effectiveness report.</p>';
  }

  // Recent plans
  const plansEl = document.getElementById('admin-recent-plans');
  try {
    const { data, error } = await client.from('generated_plans').select('id, user_id, generation_source, is_active, created_at').order('created_at', { ascending: false }).limit(10);
    if (error || !data || data.length === 0) {
      plansEl.innerHTML = '<p style="color:var(--color-text-muted)">No plans generated yet.</p>';
    } else {
      plansEl.innerHTML = `<table class="admin-table"><thead><tr>
        <th>Date</th><th>Source</th><th>Active</th><th>User</th>
      </tr></thead><tbody>${data.map(p => `<tr>
        <td>${new Date(p.created_at).toLocaleDateString()}</td>
        <td><span class="admin-badge">${escAdmin(p.generation_source)}</span></td>
        <td>${p.is_active ? 'Yes' : 'No'}</td>
        <td style="font-size:0.85em">${p.user_id.slice(0, 8)}...</td>
      </tr>`).join('')}</tbody></table>`;
    }
  } catch (e) {
    plansEl.innerHTML = '<p style="color:var(--color-text-muted)">Could not load plans.</p>';
  }
}

// ── Filter listeners ─────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  const search = document.getElementById("admin-search");
  const roleFilter = document.getElementById("admin-filter-role");
  const subFilter = document.getElementById("admin-filter-sub");

  if (search) search.addEventListener("input", () => renderAdminUsers());
  if (roleFilter) roleFilter.addEventListener("change", () => renderAdminUsers());
  if (subFilter) subFilter.addEventListener("change", () => renderAdminUsers());

  // Module filters
  const modSearch = document.getElementById("admin-modules-search");
  const modCat = document.getElementById("admin-modules-category-filter");
  if (modSearch) modSearch.addEventListener("input", () => renderAdminModules());
  if (modCat) modCat.addEventListener("change", () => renderAdminModules());

  // Exercise filters
  const exSearch = document.getElementById("admin-exercises-search");
  const exPat = document.getElementById("admin-exercises-pattern-filter");
  const exDiff = document.getElementById("admin-exercises-diff-filter");
  if (exSearch) exSearch.addEventListener("input", () => renderAdminExercises());
  if (exPat) exPat.addEventListener("change", () => renderAdminExercises());
  if (exDiff) exDiff.addEventListener("change", () => renderAdminExercises());

  // Gaps filter
  const gapFilter = document.getElementById("admin-gaps-filter");
  if (gapFilter) gapFilter.addEventListener("change", () => renderAdminGaps());
});

// ══════════════════════════════════════════════════════════════════════════
// Event analytics dashboard (analytics_events + profiles join)
// ══════════════════════════════════════════════════════════════════════════
//
// Pulls last 30 days of events + last 100 events + all profiles in three
// Supabase queries, then aggregates client-side. This is fine for an MVP
// admin dashboard with dozens of users; for 100k+ events it should move
// to SQL views or RPC functions.
//
// The function is idempotent and safe to call repeatedly — each call
// overwrites the rendered content of every #admin-ae-* target.

async function loadAdminEventAnalytics() {
  const client = window.supabaseClient;
  if (!client) return;

  // ── Query 1: last 30 days of events (for DAU/WAU/MAU/top events) ─────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  let recentEvents = [];
  try {
    const { data, error } = await client
      .from("analytics_events")
      .select("id, user_id, event_name, created_at")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(20000);
    if (error) throw error;
    recentEvents = data || [];
  } catch (e) {
    console.warn("[Admin] recent events query failed:", e.message || e);
    _aeRenderError("Failed to load recent events");
    return;
  }

  // ── Query 2: last 100 events (for the activity feed — more detail) ──
  let latest100 = [];
  try {
    const { data } = await client
      .from("analytics_events")
      .select("id, user_id, event_name, created_at, properties")
      .order("created_at", { ascending: false })
      .limit(100);
    latest100 = data || [];
  } catch (e) {
    console.warn("[Admin] latest 100 events query failed:", e.message || e);
  }

  // ── Query 3: profiles (for email join) ───────────────────────────────
  let profiles = [];
  try {
    const { data } = await client
      .from("profiles")
      .select("id, email, full_name, created_at")
      .order("created_at", { ascending: false })
      .limit(10000);
    profiles = data || [];
  } catch (e) {
    console.warn("[Admin] profiles query failed:", e.message || e);
  }
  const profilesById = {};
  profiles.forEach(p => { profilesById[p.id] = p; });

  // ── Total registered users ───────────────────────────────────────────
  const eventUserIds = new Set(recentEvents.map(e => e.user_id).filter(Boolean));
  const totalRegistered = Math.max(profiles.length, eventUserIds.size);
  setText("admin-ae-total-users", totalRegistered);

  // ── DAU/WAU/MAU ──────────────────────────────────────────────────────
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const weekAgo    = new Date(now.getTime() - 7  * 86400000);
  const monthAgo   = new Date(now.getTime() - 30 * 86400000);

  const distinctIn = (sinceMs) => {
    const set = new Set();
    recentEvents.forEach(e => {
      if (!e.user_id) return;
      if (new Date(e.created_at).getTime() >= sinceMs) set.add(e.user_id);
    });
    return set.size;
  };
  setText("admin-ae-dau", distinctIn(todayStart.getTime()));
  setText("admin-ae-wau", distinctIn(weekAgo.getTime()));
  setText("admin-ae-mau", distinctIn(monthAgo.getTime()));

  // ── Total sessions (session_started events) ──────────────────────────
  try {
    const { count } = await client
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("event_name", "session_started");
    setText("admin-ae-sessions-total", count || 0);
  } catch {
    setText("admin-ae-sessions-total", "?");
  }

  // ── DAU chart — last 7 days ──────────────────────────────────────────
  const dauBuckets = _aeDailyBuckets(recentEvents, 7, /*distinctUsers*/true);
  _aeRenderBarChart("admin-ae-dau-chart", dauBuckets, (b) => `${b.value} user${b.value === 1 ? "" : "s"}`);

  // ── WAU chart — last 4 weeks ────────────────────────────────────────
  const wauBuckets = _aeWeeklyBuckets(recentEvents, 4);
  _aeRenderBarChart("admin-ae-wau-chart", wauBuckets, (b) => `${b.value} user${b.value === 1 ? "" : "s"}`);

  // ── New users per day — last 14 days ─────────────────────────────────
  const newUserBuckets = _aeNewUsersBuckets(profiles, 14);
  _aeRenderBarChart("admin-ae-new-users-chart", newUserBuckets, (b) => `${b.value} new`);

  // ── Top 10 event names (last 30d) ────────────────────────────────────
  const eventCounts = {};
  recentEvents.forEach(e => {
    if (!e.event_name) return;
    eventCounts[e.event_name] = (eventCounts[e.event_name] || 0) + 1;
  });
  const topEvents = Object.entries(eventCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  _aeRenderTopEventsTable("admin-ae-top-events", topEvents);

  // ── Last login per user (most recent session_started) ────────────────
  const lastLoginByUser = {};
  recentEvents.forEach(e => {
    if (e.event_name !== "session_started" || !e.user_id) return;
    const t = new Date(e.created_at).getTime();
    if (!lastLoginByUser[e.user_id] || t > lastLoginByUser[e.user_id]) {
      lastLoginByUser[e.user_id] = t;
    }
  });
  _aeRenderUserTimeTable("admin-ae-last-login", lastLoginByUser, profilesById, null);

  // ── Last activity per user (most recent event of any type) ───────────
  const lastActivityByUser = {};
  recentEvents.forEach(e => {
    if (!e.user_id) return;
    const t = new Date(e.created_at).getTime();
    if (!lastActivityByUser[e.user_id] || t > lastActivityByUser[e.user_id].t) {
      lastActivityByUser[e.user_id] = { t, eventName: e.event_name };
    }
  });
  _aeRenderUserActivityTable("admin-ae-last-activity", lastActivityByUser, profilesById);

  // ── User activity log — last 100 events ──────────────────────────────
  _aeRenderActivityLog("admin-ae-activity-log", latest100, profilesById);
}

// ── Helpers ───────────────────────────────────────────────────────────────

function _aeRenderError(msg) {
  ["admin-ae-dau-chart","admin-ae-wau-chart","admin-ae-new-users-chart",
   "admin-ae-top-events","admin-ae-last-login","admin-ae-last-activity",
   "admin-ae-activity-log"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<p style="color:var(--color-text-muted)">${escAdmin(msg)}</p>`;
  });
}

// Build N daily buckets ending today. If distinctUsers, count distinct
// user_ids per day; otherwise count events per day.
function _aeDailyBuckets(events, days, distinctUsers) {
  const buckets = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const dNext = new Date(d); dNext.setDate(dNext.getDate() + 1);
    const users = new Set();
    let count = 0;
    events.forEach(e => {
      const t = new Date(e.created_at).getTime();
      if (t >= d.getTime() && t < dNext.getTime()) {
        count++;
        if (e.user_id) users.add(e.user_id);
      }
    });
    buckets.push({
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: distinctUsers ? users.size : count,
    });
  }
  return buckets;
}

// Build N weekly buckets ending this week.
function _aeWeeklyBuckets(events, weeks) {
  const buckets = [];
  // Find this week's Monday
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const dow = now.getDay();
  const thisMonday = new Date(now);
  thisMonday.setDate(thisMonday.getDate() + (dow === 0 ? -6 : 1 - dow));
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = new Date(thisMonday); weekStart.setDate(weekStart.getDate() - i * 7);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
    const users = new Set();
    events.forEach(e => {
      const t = new Date(e.created_at).getTime();
      if (t >= weekStart.getTime() && t < weekEnd.getTime() && e.user_id) users.add(e.user_id);
    });
    buckets.push({
      label: weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: users.size,
    });
  }
  return buckets;
}

function _aeNewUsersBuckets(profiles, days) {
  const buckets = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const dNext = new Date(d); dNext.setDate(dNext.getDate() + 1);
    let count = 0;
    profiles.forEach(p => {
      if (!p.created_at) return;
      const t = new Date(p.created_at).getTime();
      if (t >= d.getTime() && t < dNext.getTime()) count++;
    });
    buckets.push({
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: count,
    });
  }
  return buckets;
}

// Render a simple pure-CSS bar chart. Each bucket = { label, value }.
function _aeRenderBarChart(elId, buckets, tooltipFn) {
  const el = document.getElementById(elId);
  if (!el) return;
  const maxVal = Math.max(...buckets.map(b => b.value), 1);
  const bars = buckets.map(b => {
    const pct = b.value === 0 ? 0 : Math.max(8, Math.round((b.value / maxVal) * 100));
    const tooltip = tooltipFn ? tooltipFn(b) : String(b.value);
    return `<div class="admin-bar-col" title="${escAdmin(b.label)}: ${escAdmin(tooltip)}">
      <div class="admin-bar-value">${b.value || ""}</div>
      <div class="admin-bar-track">
        <div class="admin-bar-fill" style="height:${pct}%"></div>
      </div>
      <div class="admin-bar-label">${escAdmin(b.label)}</div>
    </div>`;
  }).join("");
  el.innerHTML = `<div class="admin-bar-chart">${bars}</div>`;
}

function _aeRenderTopEventsTable(elId, topEvents) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!topEvents.length) {
    el.innerHTML = `<p style="color:var(--color-text-muted)">No events in the last 30 days.</p>`;
    return;
  }
  const total = topEvents.reduce((s, [, n]) => s + n, 0);
  const rows = topEvents.map(([name, count]) => {
    const pct = Math.round((count / total) * 100);
    return `<tr>
      <td>${escAdmin(name)}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${count}</td>
      <td style="width:40%">
        <div class="admin-bar-track admin-bar-track--inline">
          <div class="admin-bar-fill" style="width:${pct}%;height:100%"></div>
        </div>
      </td>
      <td style="text-align:right;width:44px;font-variant-numeric:tabular-nums">${pct}%</td>
    </tr>`;
  }).join("");
  el.innerHTML = `<table class="admin-table">
    <thead><tr><th>Event</th><th style="text-align:right">Count</th><th></th><th style="text-align:right">%</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function _aeRenderUserTimeTable(elId, timeByUser, profilesById, extraCol) {
  const el = document.getElementById(elId);
  if (!el) return;
  const entries = Object.entries(timeByUser)
    .map(([uid, t]) => ({ uid, t, profile: profilesById[uid] }))
    .sort((a, b) => b.t - a.t);
  if (!entries.length) {
    el.innerHTML = `<p style="color:var(--color-text-muted)">No logins in the last 30 days.</p>`;
    return;
  }
  const rows = entries.map(e => `<tr>
    <td>${escAdmin((e.profile && (e.profile.full_name || e.profile.email)) || e.uid.slice(0, 8))}</td>
    <td>${escAdmin((e.profile && e.profile.email) || "—")}</td>
    <td style="font-variant-numeric:tabular-nums">${escAdmin(_aeFormatRelative(e.t))}</td>
  </tr>`).join("");
  el.innerHTML = `<table class="admin-table">
    <thead><tr><th>Name</th><th>Email</th><th>Last Login</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function _aeRenderUserActivityTable(elId, activityByUser, profilesById) {
  const el = document.getElementById(elId);
  if (!el) return;
  const entries = Object.entries(activityByUser)
    .map(([uid, v]) => ({ uid, t: v.t, eventName: v.eventName, profile: profilesById[uid] }))
    .sort((a, b) => b.t - a.t);
  if (!entries.length) {
    el.innerHTML = `<p style="color:var(--color-text-muted)">No user activity in the last 30 days.</p>`;
    return;
  }
  const rows = entries.map(e => `<tr>
    <td>${escAdmin((e.profile && (e.profile.full_name || e.profile.email)) || e.uid.slice(0, 8))}</td>
    <td>${escAdmin((e.profile && e.profile.email) || "—")}</td>
    <td><code style="font-size:0.85em">${escAdmin(e.eventName || "")}</code></td>
    <td style="font-variant-numeric:tabular-nums">${escAdmin(_aeFormatRelative(e.t))}</td>
  </tr>`).join("");
  el.innerHTML = `<table class="admin-table">
    <thead><tr><th>Name</th><th>Email</th><th>Last Event</th><th>When</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function _aeRenderActivityLog(elId, events, profilesById) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!events.length) {
    el.innerHTML = `<p style="color:var(--color-text-muted)">No events yet.</p>`;
    return;
  }
  const rows = events.map(e => {
    const p = profilesById[e.user_id];
    const label = (p && (p.email || p.full_name)) || (e.user_id ? e.user_id.slice(0, 8) + "…" : "anonymous");
    const ts = new Date(e.created_at);
    const when = ts.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    return `<div class="admin-activity-row">
      <span class="admin-activity-time">${escAdmin(when)}</span>
      <span class="admin-activity-event"><code>${escAdmin(e.event_name || "unknown")}</code></span>
      <span class="admin-activity-user">${escAdmin(label)}</span>
    </div>`;
  }).join("");
  el.innerHTML = rows;
}

function _aeFormatRelative(ms) {
  const diff = Date.now() - ms;
  if (diff < 60 * 1000) return "just now";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 30 * 86400000) return `${Math.floor(diff / 86400000)}d ago`;
  const d = new Date(ms);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
