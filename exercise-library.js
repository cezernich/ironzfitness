// exercise-library.js — Exercise demo info + Post-workout stretching recommendations
// Tapping an exercise name in any workout view shows a brief demo card.
// After completing a workout, a stretch routine is suggested based on muscles worked.

/* =====================================================================
   EXERCISE → MUSCLE GROUP MAPPING
   ===================================================================== */

const EXERCISE_MUSCLES = {
  // Compound
  "squat": ["quads", "glutes", "hamstrings", "core"],
  "back squat": ["quads", "glutes", "hamstrings", "core"],
  "front squat": ["quads", "core", "glutes"],
  "deadlift": ["hamstrings", "glutes", "back", "core"],
  "romanian deadlift": ["hamstrings", "glutes", "back"],
  "bench press": ["chest", "triceps", "shoulders"],
  "incline bench press": ["chest", "shoulders", "triceps"],
  "overhead press": ["shoulders", "triceps", "core"],
  "military press": ["shoulders", "triceps", "core"],
  "barbell row": ["back", "biceps", "core"],
  "bent over row": ["back", "biceps"],
  "pull up": ["back", "biceps", "core"],
  "pull-up": ["back", "biceps", "core"],
  "chin up": ["back", "biceps"],
  "chin-up": ["back", "biceps"],
  "dip": ["chest", "triceps", "shoulders"],
  "clean": ["hamstrings", "glutes", "back", "shoulders"],
  "snatch": ["hamstrings", "glutes", "back", "shoulders"],
  "thruster": ["quads", "glutes", "shoulders", "core"],
  "lunge": ["quads", "glutes", "hamstrings"],
  "walking lunge": ["quads", "glutes", "hamstrings"],
  "bulgarian split squat": ["quads", "glutes", "hamstrings"],
  "hip thrust": ["glutes", "hamstrings"],

  // Upper push
  "push up": ["chest", "triceps", "shoulders"],
  "push-up": ["chest", "triceps", "shoulders"],
  "dumbbell press": ["chest", "triceps", "shoulders"],
  "dumbbell fly": ["chest", "shoulders"],
  "cable fly": ["chest", "shoulders"],
  "tricep extension": ["triceps"],
  "tricep pushdown": ["triceps"],
  "skull crusher": ["triceps"],
  "lateral raise": ["shoulders"],
  "front raise": ["shoulders"],
  "face pull": ["shoulders", "back"],

  // Upper pull
  "lat pulldown": ["back", "biceps"],
  "seated row": ["back", "biceps"],
  "cable row": ["back", "biceps"],
  "dumbbell row": ["back", "biceps"],
  "bicep curl": ["biceps"],
  "hammer curl": ["biceps"],
  "preacher curl": ["biceps"],
  "shrug": ["traps"],

  // Legs
  "leg press": ["quads", "glutes"],
  "leg extension": ["quads"],
  "leg curl": ["hamstrings"],
  "calf raise": ["calves"],
  "goblet squat": ["quads", "glutes", "core"],
  "step up": ["quads", "glutes"],
  "glute bridge": ["glutes", "hamstrings"],

  // Core
  "plank": ["core"],
  "crunch": ["core"],
  "sit up": ["core", "hip flexors"],
  "russian twist": ["core", "obliques"],
  "hanging leg raise": ["core", "hip flexors"],
  "ab wheel": ["core"],
  "dead bug": ["core"],
  "bird dog": ["core", "back"],
  "mountain climber": ["core", "shoulders"],
};

const EXERCISE_CUES = {
  "squat": "Feet shoulder-width, chest up, push knees out, drive through heels.",
  "back squat": "Bar on upper traps, brace core, sit back and down to parallel or below.",
  "front squat": "Elbows high, core braced, upright torso, drive through heels.",
  "deadlift": "Flat back, hinge at hips, push the floor away, squeeze glutes at top.",
  "romanian deadlift": "Slight knee bend, hinge at hips, feel hamstring stretch, squeeze glutes up.",
  "bench press": "Retract shoulder blades, arch slightly, lower to chest, drive up.",
  "overhead press": "Core tight, press straight up, lock out overhead, controlled lower.",
  "barbell row": "Hinge forward 45deg, pull to lower chest, squeeze shoulder blades.",
  "pull up": "Dead hang start, pull chest to bar, control the descent.",
  "push up": "Hands under shoulders, body straight, lower chest to floor, press up.",
  "lunge": "Step forward, lower back knee toward floor, front knee over ankle, drive up.",
  "hip thrust": "Upper back on bench, drive hips up, squeeze glutes hard at top.",
  "plank": "Forearms on floor, body straight line, brace core, breathe steadily.",
  "deadlift": "Flat back, hinge at hips, push the floor away, lockout with glutes.",
  "dip": "Lean slightly forward for chest, upright for triceps. Control the descent.",
  "lat pulldown": "Wide grip, pull to upper chest, squeeze lats, slow return.",
  "leg press": "Feet shoulder-width on platform, lower until 90deg, press through heels.",
  "bicep curl": "Elbows pinned to sides, full range of motion, control the negative.",
  "lateral raise": "Slight bend in elbows, raise to shoulder height, control down.",
};

/* =====================================================================
   EXERCISE INFO MODAL
   ===================================================================== */

function showExerciseInfo(name) {
  const key = name.toLowerCase().trim();
  const muscles = _findMuscles(key);
  const cues = _findCues(key);

  const modal = document.getElementById("exercise-info-modal");
  const content = document.getElementById("exercise-info-content");
  if (!modal || !content) return;

  content.innerHTML = `
    <h2 style="margin:0 0 12px">${_exEsc(name)}</h2>
    <div class="ex-info-section">
      <div class="ex-info-label">Muscles Worked</div>
      <div class="ex-info-muscles">
        ${muscles.length ? muscles.map(m => `<span class="ex-muscle-tag">${m}</span>`).join("") : '<span class="ex-muscle-tag">General</span>'}
      </div>
    </div>
    ${cues ? `
    <div class="ex-info-section">
      <div class="ex-info-label">Form Cues</div>
      <p class="ex-info-cues">${_exEsc(cues)}</p>
    </div>` : ""}
    <button class="btn-primary" style="width:100%;margin-top:16px" onclick="closeExerciseInfo()">Got It</button>
  `;

  modal.style.display = "";
}

function closeExerciseInfo() {
  const modal = document.getElementById("exercise-info-modal");
  if (modal) modal.style.display = "none";
}

function _findMuscles(key) {
  if (EXERCISE_MUSCLES[key]) return EXERCISE_MUSCLES[key];
  // Fuzzy match: check if any key is contained in the exercise name
  for (const [k, v] of Object.entries(EXERCISE_MUSCLES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return [];
}

function _findCues(key) {
  if (EXERCISE_CUES[key]) return EXERCISE_CUES[key];
  for (const [k, v] of Object.entries(EXERCISE_CUES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return "";
}

/* =====================================================================
   MAKE EXERCISE NAMES CLICKABLE
   Hook into exercise table rendering by overriding buildExerciseTableHTML
   ===================================================================== */

function buildExerciseTableHTML(exercises, opts) {
  if (!exercises || !exercises.length) return "";

  const isHiit = opts?.hiit || false;
  const cols = isHiit ? 3 : 4;
  const headerRow = isHiit
    ? `<th>Exercise</th><th>Reps / Time / Distance</th><th>Weight</th>`
    : `<th>Exercise</th><th>Sets</th><th>Reps</th><th>Weight</th>`;

  const _wt = typeof _normalizeWeightDisplay === "function" ? _normalizeWeightDisplay : v => v || "\u2014";
  const _link = e => `<a class="ex-name-link" onclick="showExerciseInfo('${_exEsc(e.name).replace(/'/g, "\\'")}')">${_exEsc(e.name)}</a>`;

  // Group consecutive exercises by supersetId
  const segments = [];
  let i = 0;
  while (i < exercises.length) {
    const ex = exercises[i];
    if (ex.supersetId) {
      const gid = ex.supersetId;
      const group = [];
      while (i < exercises.length && exercises[i].supersetId === gid) {
        group.push(exercises[i]);
        i++;
      }
      segments.push({ supersetId: gid, items: group });
    } else {
      segments.push({ supersetId: null, items: [ex] });
      i++;
    }
  }

  let rows = "";
  segments.forEach(seg => {
    if (seg.supersetId) {
      const ssSets = seg.items[0]?.sets || "\u2014";
      rows += `<tr class="superset-label-row"><td colspan="${cols}">Superset &mdash; ${ssSets} sets</td></tr>`;
      seg.items.forEach(e => {
        rows += `<tr class="superset-ex-row"><td>${_link(e)}</td><td></td><td>${e.reps||"\u2014"}</td><td>${_wt(e.weight)}</td></tr>`;
        if (e.setDetails && e.setDetails.length) {
          e.setDetails.forEach((sd, si) => {
            rows += `<tr class="superset-ex-row set-detail-row"><td class="set-detail-label">Set ${si+1}</td><td></td><td>${sd.reps||"\u2014"}</td><td>${_wt(sd.weight)}</td></tr>`;
          });
        }
      });
      rows += `<tr class="superset-end-row"><td colspan="${cols}"></td></tr>`;
    } else {
      const e = seg.items[0];
      if (isHiit) {
        rows += `<tr><td>${_link(e)}</td><td>${e.reps||"\u2014"}</td><td>${_wt(e.weight)}</td></tr>`;
      } else {
        rows += `<tr><td>${_link(e)}</td><td>${e.sets||"\u2014"}</td><td>${e.reps||"\u2014"}</td><td>${_wt(e.weight)}</td></tr>`;
      }
      if (e.setDetails && e.setDetails.length) {
        e.setDetails.forEach((sd, si) => {
          rows += `<tr class="set-detail-row"><td class="set-detail-label">Set ${si+1}</td><td></td><td>${sd.reps||"\u2014"}</td><td>${_wt(sd.weight)}</td></tr>`;
        });
      }
    }
  });

  return `<table class="exercise-table"><thead><tr>${headerRow}</tr></thead><tbody>${rows}</tbody></table>`;
}

/* =====================================================================
   STRETCHING & MOBILITY RECOMMENDATIONS
   ===================================================================== */

const STRETCHES_BY_MUSCLE = {
  quads:       [{ name: "Standing Quad Stretch", duration: "30s each", desc: "Pull heel to glute, keep knees together" },
                { name: "Couch Stretch", duration: "45s each", desc: "Back foot on wall/couch, lunge forward" }],
  hamstrings:  [{ name: "Standing Toe Touch", duration: "30s", desc: "Straight legs, fold forward, reach for toes" },
                { name: "Seated Hamstring Stretch", duration: "30s each", desc: "One leg extended, reach for foot" }],
  glutes:      [{ name: "Pigeon Pose", duration: "45s each", desc: "Front shin across mat, back leg extended" },
                { name: "Figure-4 Stretch", duration: "30s each", desc: "Ankle on opposite knee, pull through" }],
  chest:       [{ name: "Doorway Chest Stretch", duration: "30s each", desc: "Arm on doorframe, lean through" },
                { name: "Behind-Back Clasp", duration: "20s", desc: "Clasp hands behind back, lift and squeeze" }],
  back:        [{ name: "Cat-Cow Stretch", duration: "30s", desc: "Alternate arching and rounding spine on all fours" },
                { name: "Child's Pose", duration: "45s", desc: "Knees wide, arms extended, sink hips back" }],
  shoulders:   [{ name: "Cross-Body Shoulder Stretch", duration: "30s each", desc: "Pull arm across chest with other hand" },
                { name: "Overhead Tricep Stretch", duration: "20s each", desc: "Reach behind head, pull elbow with other hand" }],
  triceps:     [{ name: "Overhead Tricep Stretch", duration: "20s each", desc: "Reach behind head, pull elbow" }],
  biceps:      [{ name: "Wall Bicep Stretch", duration: "20s each", desc: "Palm on wall, rotate body away" }],
  core:        [{ name: "Cobra Stretch", duration: "30s", desc: "Lie face down, press chest up, keep hips on floor" },
                { name: "Supine Twist", duration: "30s each", desc: "Lie on back, drop knees to one side" }],
  calves:      [{ name: "Wall Calf Stretch", duration: "30s each", desc: "Hands on wall, step back, press heel down" }],
  "hip flexors": [{ name: "Kneeling Hip Flexor Stretch", duration: "30s each", desc: "Lunge position, push hips forward" }],
  obliques:    [{ name: "Standing Side Bend", duration: "20s each", desc: "Reach overhead, lean to one side" }],
  traps:       [{ name: "Neck Side Bend", duration: "20s each", desc: "Tilt ear to shoulder, gentle pressure with hand" }],
};

// Cardio sport → muscle groups
const CARDIO_MUSCLES = {
  running:  ["quads", "hamstrings", "calves", "glutes", "hip flexors"],
  cycling:  ["quads", "hamstrings", "glutes", "calves", "core"],
  swimming: ["shoulders", "back", "core", "chest", "triceps"],
  walking:  ["quads", "calves", "hamstrings", "glutes"],
  rowing:   ["back", "biceps", "core", "hamstrings"],
};

function getStretchRoutine(workout) {
  const muscles = new Set();

  // From exercises
  if (workout.exercises) {
    workout.exercises.forEach(ex => {
      const found = _findMuscles((ex.name || "").toLowerCase());
      found.forEach(m => muscles.add(m));
    });
  }

  // From workout type (cardio)
  const type = (workout.type || workout.discipline || "").toLowerCase();
  if (CARDIO_MUSCLES[type]) {
    CARDIO_MUSCLES[type].forEach(m => muscles.add(m));
  }

  // If no muscles identified, give a general routine
  if (muscles.size === 0) {
    muscles.add("quads"); muscles.add("hamstrings"); muscles.add("chest"); muscles.add("back"); muscles.add("core");
  }

  // Collect stretches, max 2 per muscle, max 8 total
  const stretches = [];
  const seen = new Set();
  for (const muscle of muscles) {
    const options = STRETCHES_BY_MUSCLE[muscle] || [];
    for (const s of options) {
      if (!seen.has(s.name) && stretches.length < 8) {
        seen.add(s.name);
        stretches.push({ ...s, muscle });
      }
    }
  }

  return stretches;
}

function renderStretchSuggestion(workout, containerEl) {
  if (!containerEl) return;
  const stretches = getStretchRoutine(workout);
  if (stretches.length === 0) return;

  const totalTime = stretches.reduce((sum, s) => {
    const match = s.duration.match(/(\d+)/);
    const secs = match ? parseInt(match[1]) : 30;
    const isEach = s.duration.includes("each");
    return sum + (isEach ? secs * 2 : secs);
  }, 0);
  const minutes = Math.ceil(totalTime / 60);

  containerEl.innerHTML = `
    <div class="stretch-suggestion">
      <div class="stretch-header">
        <span class="stretch-title">Post-Workout Stretch</span>
        <span style="display:flex;align-items:center;gap:4px">
          <span class="stretch-time">${minutes} min</span>
          <button class="stretch-dismiss-btn" onclick="this.closest('.stretch-suggestion').remove()" title="Dismiss">&times;</button>
        </span>
      </div>
      <div class="stretch-list">
        ${stretches.map(s => `
          <div class="stretch-item">
            <div class="stretch-item-name">${_exEsc(s.name)}</div>
            <div class="stretch-item-detail">${_exEsc(s.duration)} — ${_exEsc(s.desc)}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

/* =====================================================================
   UTILITY
   ===================================================================== */

function _exEsc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
