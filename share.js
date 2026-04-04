// share.js — Export & Share Workouts

function buildShareButton(workoutId, dateStr) {
  return `<button class="btn-share-workout" onclick="event.stopPropagation();openShareModal('${workoutId}','${dateStr}')">
    ${typeof ICONS !== "undefined" ? ICONS.award : ""} Share
  </button>`;
}

function openShareModal(workoutId, dateStr) {
  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}
  const w = workouts.find(w => String(w.id) === String(workoutId));
  if (!w) return;

  // Build workout summary
  const summary = _buildWorkoutSummary(w);

  // Remove existing modal
  const existing = document.getElementById("share-modal-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "share-modal-overlay";
  overlay.className = "share-modal-overlay";
  overlay.onclick = e => { if (e.target === overlay) closeShareModal(); };

  const rating = typeof getWorkoutRating === "function" ? getWorkoutRating(String(workoutId)) : null;
  const RATING_EMOJIS = ["", "\u{1F971}", "\u{1F60C}", "\u{1F44C}", "\u{1F4AA}", "\u{1F635}"];
  const RATING_LABELS = ["", "Too Easy", "Easy", "Just Right", "Hard", "Crushed Me"];
  const ratingLine = rating ? `<div class="share-card-rating">${RATING_EMOJIS[rating.rating] || ""} ${RATING_LABELS[rating.rating] || ""}</div>` : "";

  overlay.innerHTML = `
    <div class="share-modal">
      <div class="share-modal-header">
        <span>Share Workout</span>
        <button class="qe-close-btn" onclick="closeShareModal()">&#10005;</button>
      </div>

      <div class="share-card" id="share-card-preview">
        <div class="share-card-brand">IRONZ</div>
        <div class="share-card-date">${typeof formatDisplayDate === "function" ? formatDisplayDate(w.date) : w.date}</div>
        <div class="share-card-name">${_escShareHtml(summary.name)}</div>
        <div class="share-card-stats">
          ${summary.duration ? `<div class="share-card-stat"><span class="share-stat-val">${summary.duration}</span><span class="share-stat-label">min</span></div>` : ""}
          ${summary.exercises ? `<div class="share-card-stat"><span class="share-stat-val">${summary.exercises}</span><span class="share-stat-label">exercises</span></div>` : ""}
          ${summary.volume ? `<div class="share-card-stat"><span class="share-stat-val">${summary.volume}</span><span class="share-stat-label">total lbs</span></div>` : ""}
          ${summary.distance ? `<div class="share-card-stat"><span class="share-stat-val">${summary.distance}</span><span class="share-stat-label">${typeof getDistanceUnit === "function" ? getDistanceUnit() : "mi"}</span></div>` : ""}
        </div>
        ${ratingLine}
        ${summary.exerciseList ? `<div class="share-card-exercises">${summary.exerciseList}</div>` : ""}
      </div>

      <div class="share-actions">
        <button class="share-action-btn" onclick="copyShareText('${workoutId}')">
          ${typeof ICONS !== "undefined" ? ICONS.tag : ""} Copy Text
        </button>
        <button class="share-action-btn" onclick="shareNative('${workoutId}')">
          ${typeof ICONS !== "undefined" ? ICONS.award : ""} Share
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("visible"));
}

function closeShareModal() {
  const overlay = document.getElementById("share-modal-overlay");
  if (overlay) {
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 200);
  }
}

function _buildWorkoutSummary(w) {
  const name = w.name || w.notes || _shareTypeLabel(w.type);
  const duration = w.duration || null;
  const distance = w.distance || null;

  let exerciseCount = 0;
  let totalVolume = 0;
  let exerciseLines = [];

  if (w.exercises && w.exercises.length) {
    exerciseCount = w.exercises.length;
    w.exercises.forEach(ex => {
      const sets = parseInt(String(ex.sets || "0").replace(/[^\d]/g, "")) || 0;
      const reps = parseInt(String(ex.reps || "0").replace(/[^\d]/g, "")) || 0;
      const weight = parseFloat(String(ex.weight || "0").replace(/[^\d.]/g, "")) || 0;
      totalVolume += sets * reps * weight;
      exerciseLines.push(`${ex.name}: ${ex.sets || ""}x${ex.reps || ""} @ ${ex.weight || "BW"}`);
    });
  }

  return {
    name,
    duration,
    distance,
    exercises: exerciseCount || null,
    volume: totalVolume > 0 ? _formatVolume(totalVolume) : null,
    exerciseList: exerciseLines.length > 0 ? exerciseLines.map(l => `<div class="share-ex-line">${_escShareHtml(l)}</div>`).join("") : "",
    exerciseText: exerciseLines.join("\n"),
  };
}

function _formatVolume(v) {
  if (v >= 10000) return Math.round(v / 1000) + "K";
  return String(Math.round(v));
}

function _shareTypeLabel(type) {
  const labels = { weightlifting: "Weightlifting", running: "Running", cycling: "Cycling", swimming: "Swimming", triathlon: "Triathlon", general: "Workout" };
  return labels[type] || "Workout";
}

function copyShareText(workoutId) {
  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}
  const w = workouts.find(w => String(w.id) === String(workoutId));
  if (!w) return;

  const summary = _buildWorkoutSummary(w);
  const rating = typeof getWorkoutRating === "function" ? getWorkoutRating(String(workoutId)) : null;
  const RATING_LABELS = ["", "Too Easy", "Easy", "Just Right", "Hard", "Crushed Me"];

  let text = `${summary.name}\n`;
  text += `${typeof formatDisplayDate === "function" ? formatDisplayDate(w.date) : w.date}\n`;
  if (summary.duration) text += `Duration: ${summary.duration} min\n`;
  if (summary.distance) text += `Distance: ${summary.distance}\n`;
  if (summary.exercises) text += `Exercises: ${summary.exercises}\n`;
  if (summary.volume) text += `Volume: ${summary.volume} lbs\n`;
  if (rating) text += `Feel: ${RATING_LABELS[rating.rating] || ""}\n`;
  if (summary.exerciseText) text += `\n${summary.exerciseText}\n`;
  text += `\nTracked with IronZ`;

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector(".share-action-btn");
    if (btn) { const orig = btn.innerHTML; btn.textContent = "Copied!"; setTimeout(() => btn.innerHTML = orig, 1500); }
  }).catch(() => {});
}

async function shareNative(workoutId) {
  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}
  const w = workouts.find(w => String(w.id) === String(workoutId));
  if (!w) return;

  const summary = _buildWorkoutSummary(w);
  let text = `${summary.name} - ${typeof formatDisplayDate === "function" ? formatDisplayDate(w.date) : w.date}`;
  if (summary.duration) text += ` | ${summary.duration} min`;
  if (summary.volume) text += ` | ${summary.volume} lbs`;
  text += `\n\nTracked with IronZ`;

  if (navigator.share) {
    try {
      await navigator.share({ title: "IronZ Workout", text });
    } catch {}
  } else {
    copyShareText(workoutId);
  }
}

function _escShareHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}
