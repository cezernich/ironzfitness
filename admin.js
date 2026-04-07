// admin.js — Admin Panel
// Gated by window._userRole === 'admin'

let _adminProfiles = [];

// ── Visibility ────────────────────────────────────────────────────────────────

function initAdminVisibility() {
  const btn = document.getElementById("admin-dropdown-btn");
  if (btn) btn.style.display = window._userRole === "admin" ? "" : "none";
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

  // Dev bypass with placeholder credentials — show mock data
  if (typeof DEV_BYPASS_AUTH !== "undefined" && DEV_BYPASS_AUTH) {
    _adminProfiles = generateMockProfiles();
    renderAdminStats();
    renderAdminUsers();
    return;
  }

  try {
    const { data, error } = await client
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Admin: failed to load profiles", error.message);
      return;
    }
    _adminProfiles = data || [];
  } catch (e) {
    console.warn("Admin: supabase error", e);
    _adminProfiles = [];
  }

  renderAdminStats();
  renderAdminUsers();
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
    const subBadge = p.subscription_status === "premium"
      ? `<span class="admin-badge admin-badge-premium">Premium</span>`
      : `<span class="admin-badge admin-badge-free">Free</span>`;
    const joined = p.created_at ? new Date(p.created_at).toLocaleDateString() : "—";

    const isMock = String(p.id).startsWith("mock-");

    return `<tr>
      <td class="admin-td-name">${name}</td>
      <td class="admin-td-email">${email}</td>
      <td>${roleBadge}</td>
      <td>${subBadge}</td>
      <td>${joined}</td>
      <td class="admin-td-actions">
        <button class="admin-action-btn" onclick="adminToggleRole('${p.id}', '${p.role}')" ${isMock ? "" : ""} title="Toggle role">
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

async function adminToggleRole(userId, currentRole) {
  const newRole = currentRole === "admin" ? "user" : "admin";
  if (!confirm(`Change role to "${newRole}"?`)) return;

  // Mock mode
  if (String(userId).startsWith("mock-")) {
    const p = _adminProfiles.find(x => x.id === userId);
    if (p) p.role = newRole;
    renderAdminStats();
    renderAdminUsers();
    return;
  }

  const { error } = await window.supabaseClient
    .from("profiles")
    .update({ role: newRole })
    .eq("id", userId);

  if (error) {
    alert("Failed to update role: " + error.message);
    return;
  }
  await loadAdminData();
}

async function adminToggleSub(userId, currentSub) {
  const newSub = currentSub === "premium" ? "free" : "premium";
  if (!confirm(`Change subscription to "${newSub}"?`)) return;

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
    alert("Failed to update subscription: " + error.message);
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

async function loadAdminExercises() {
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
