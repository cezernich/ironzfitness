// goals.js — Goal Setting System

const GOAL_TYPES = {
  performance: { label: "Performance", icon: "target", examples: "Run sub-25 5K, Bench 225 lbs" },
  body:        { label: "Body",        icon: "activity", examples: "Lose 15 lbs, Reach 12% BF" },
  habit:       { label: "Habit",       icon: "flame", examples: "Work out 4x/week, Drink 100oz daily" },
};

function loadGoals() {
  try { return JSON.parse(localStorage.getItem("fitnessGoals")) || []; } catch { return []; }
}

function saveGoals(goals) {
  localStorage.setItem("fitnessGoals", JSON.stringify(goals)); if (typeof DB !== 'undefined') DB.syncKey('fitnessGoals');
}

function renderGoals() {
  const container = document.getElementById("goals-content");
  if (!container) return;

  const goals = loadGoals();
  const active = goals.filter(g => !g.archived);
  const archived = goals.filter(g => g.archived);

  let html = "";

  // Active goals
  if (active.length > 0) {
    active.forEach(g => {
      const pct = Math.min(Math.round((g.progress || 0) / (g.target || 1) * 100), 100);
      const isComplete = pct >= 100;
      const typeInfo = GOAL_TYPES[g.type] || GOAL_TYPES.habit;
      const icon = (typeof ICONS !== "undefined") ? (ICONS[typeInfo.icon] || "") : "";
      const deadlineStr = g.deadline ? ` · by ${formatDisplayDate(g.deadline)}` : "";
      const progressColor = isComplete ? "var(--color-success)" : "var(--color-accent)";

      html += `
        <div class="goal-card${isComplete ? " goal-card--complete" : ""}">
          <div class="goal-header">
            <span class="goal-icon">${icon}</span>
            <div class="goal-info">
              <div class="goal-name">${_escGoalHtml(g.name)}</div>
              <div class="goal-meta">${typeInfo.label}${deadlineStr}</div>
            </div>
            <div class="goal-actions">
              <button class="goal-edit-btn" onclick="openGoalEdit('${g.id}')">Edit</button>
              ${isComplete ? `<button class="goal-archive-btn" onclick="archiveGoal('${g.id}')">Archive</button>` : ""}
              <button class="delete-btn" title="Delete" onclick="if(confirm('Delete this goal?')) deleteGoal('${g.id}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
            </div>
          </div>
          <div class="goal-progress-row">
            <div class="goal-progress-track">
              <div class="goal-progress-fill" style="width:${pct}%;background:${progressColor}"></div>
            </div>
            <span class="goal-progress-pct">${pct}%</span>
          </div>
          ${g.unit ? `<div class="goal-progress-detail">${g.progress || 0} / ${g.target} ${g.unit}</div>` : ""}
          <div class="goal-update-row">
            <input type="number" class="goal-update-input" id="goal-update-${g.id}" placeholder="Update progress" min="0" step="any" />
            <button class="goal-update-btn" onclick="updateGoalProgress('${g.id}')">Update</button>
          </div>
        </div>`;
    });
  } else {
    html += `<div class="goals-empty">
      <p class="empty-msg" style="margin:0">No active goals. Set a goal to start tracking.</p>
      <button class="btn-primary" onclick="openGoalForm()" style="margin-top:10px">+ Add Goal</button>
    </div>`;
  }

  // Archived goals
  if (archived.length > 0) {
    html += `<div class="goals-archived-section">
      <button class="goals-archived-toggle" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none';this.textContent=this.nextElementSibling.style.display==='none'?'Show Completed (${archived.length})':'Hide Completed'">
        Show Completed (${archived.length})
      </button>
      <div style="display:none">`;
    archived.forEach(g => {
      html += `<div class="goal-card goal-card--archived">
        <div class="goal-header">
          <span class="goal-icon">${typeof ICONS !== "undefined" ? ICONS.check || "" : ""}</span>
          <div class="goal-info">
            <div class="goal-name">${_escGoalHtml(g.name)}</div>
            <div class="goal-meta">Completed ${g.archivedAt ? formatDisplayDate(g.archivedAt.slice(0, 10)) : ""}</div>
          </div>
          <button class="goal-edit-btn" onclick="deleteGoal('${g.id}')">Remove</button>
        </div>
      </div>`;
    });
    html += `</div></div>`;
  }

  if (active.length > 0) {
    html += `<button class="btn-secondary" style="margin-top:8px" onclick="openGoalForm()">+ Add Goal</button>`;
  }

  container.innerHTML = html;
}

function openGoalForm() {
  const modal = document.getElementById("goal-form-modal");
  if (!modal) return;
  modal.style.display = "";
  modal.classList.add("is-open");
  // Reset form
  document.getElementById("goal-form-name").value = "";
  document.getElementById("goal-form-type").value = "performance";
  document.getElementById("goal-form-target").value = "";
  document.getElementById("goal-form-unit").value = "";
  document.getElementById("goal-form-deadline").value = "";
  document.getElementById("goal-form-id").value = "";
  document.getElementById("goal-form-title").textContent = "New Goal";
}

function closeGoalForm() {
  const modal = document.getElementById("goal-form-modal");
  if (modal) { modal.classList.remove("is-open"); modal.style.display = "none"; }
}

function openGoalEdit(id) {
  const goals = loadGoals();
  const goal = goals.find(g => g.id === id);
  if (!goal) return;

  const modal = document.getElementById("goal-form-modal");
  if (!modal) return;
  modal.style.display = "";
  modal.classList.add("is-open");
  document.getElementById("goal-form-name").value = goal.name || "";
  document.getElementById("goal-form-type").value = goal.type || "performance";
  document.getElementById("goal-form-target").value = goal.target || "";
  document.getElementById("goal-form-unit").value = goal.unit || "";
  document.getElementById("goal-form-deadline").value = goal.deadline || "";
  document.getElementById("goal-form-id").value = id;
  document.getElementById("goal-form-title").textContent = "Edit Goal";
}

function saveGoalForm() {
  const name = (document.getElementById("goal-form-name")?.value || "").trim();
  const type = document.getElementById("goal-form-type")?.value || "habit";
  const target = parseFloat(document.getElementById("goal-form-target")?.value) || 0;
  const unit = (document.getElementById("goal-form-unit")?.value || "").trim();
  const deadline = document.getElementById("goal-form-deadline")?.value || "";
  const editId = document.getElementById("goal-form-id")?.value || "";

  if (!name) return;

  const goals = loadGoals();

  if (editId) {
    const idx = goals.findIndex(g => g.id === editId);
    if (idx !== -1) {
      goals[idx].name = name;
      goals[idx].type = type;
      goals[idx].target = target;
      goals[idx].unit = unit;
      goals[idx].deadline = deadline;
    }
  } else {
    goals.push({
      id: String(Date.now()),
      name,
      type,
      target,
      unit,
      deadline,
      progress: 0,
      createdAt: new Date().toISOString(),
      archived: false,
    });
  }

  saveGoals(goals);
  closeGoalForm();
  renderGoals();
}

function updateGoalProgress(id) {
  const input = document.getElementById(`goal-update-${id}`);
  if (!input) return;
  const val = parseFloat(input.value);
  if (isNaN(val)) return;

  const goals = loadGoals();
  const goal = goals.find(g => g.id === id);
  if (!goal) return;

  goal.progress = val;
  goal.lastUpdated = new Date().toISOString();

  saveGoals(goals);
  renderGoals();
}

function archiveGoal(id) {
  const goals = loadGoals();
  const goal = goals.find(g => g.id === id);
  if (!goal) return;
  goal.archived = true;
  goal.archivedAt = new Date().toISOString();
  saveGoals(goals);
  renderGoals();
}

function deleteGoal(id) {
  let goals = loadGoals();
  goals = goals.filter(g => g.id !== id);
  saveGoals(goals);
  renderGoals();
}

function buildGoalsSummaryForHome() {
  const goals = loadGoals().filter(g => !g.archived);
  if (goals.length === 0) return "";

  const topGoal = goals[0];
  const pct = Math.min(Math.round((topGoal.progress || 0) / (topGoal.target || 1) * 100), 100);

  return `<div class="home-goal-summary">
    <div class="home-goal-label">${typeof ICONS !== "undefined" ? ICONS.target : ""} ${_escGoalHtml(topGoal.name)}</div>
    <div class="home-goal-bar">
      <div class="home-goal-fill" style="width:${pct}%"></div>
    </div>
    <span class="home-goal-pct">${pct}%</span>
  </div>`;
}

function _escGoalHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}
