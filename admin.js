// admin.js — Admin Panel
// Gated by window._userRole === 'admin'

let _adminProfiles = [];

// ── Visibility ────────────────────────────────────────────────────────────────

function initAdminVisibility() {
  const btn = document.getElementById("admin-dropdown-btn");
  if (btn) btn.style.display = window._userRole === "admin" ? "" : "none";
}

// ── Patch showTab to load admin data ─────────────────────────────────────────

const _origShowTab = showTab;
showTab = function (name) {
  _origShowTab(name);
  if (name === "admin" && window._userRole === "admin") {
    loadAdminData();
  }
};

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

// ── Filter listeners ─────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  const search = document.getElementById("admin-search");
  const roleFilter = document.getElementById("admin-filter-role");
  const subFilter = document.getElementById("admin-filter-sub");

  if (search) search.addEventListener("input", () => renderAdminUsers());
  if (roleFilter) roleFilter.addEventListener("change", () => renderAdminUsers());
  if (subFilter) subFilter.addEventListener("change", () => renderAdminUsers());
});
