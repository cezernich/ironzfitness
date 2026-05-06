// nutrition-v2.js — Smart nutrition dashboard, AI photo logging, meal suggestions, grocery list
// Extends the existing nutrition.js (which handles saveMeal, loadMeals, history, food prefs)

/* =====================================================================
   NUTRITION TARGET CALCULATIONS
   Uses Mifflin-St Jeor formula + goal-based adjustments
   ===================================================================== */

function calculateNutritionTargets() {
  let profile;
  try { profile = JSON.parse(localStorage.getItem("profile")) || {}; } catch { profile = {}; }

  const weight_lbs = parseFloat(profile.weight) || 160;
  const height_in = parseFloat(profile.height) || 70;
  const age = parseInt(profile.age) || 30;
  const gender = profile.gender || "";
  const goal = profile.goal || "general";

  // Convert to metric for Mifflin-St Jeor
  const weight_kg = weight_lbs * 0.453592;
  const height_cm = height_in * 2.54;

  // BMR
  let bmr;
  if (gender === "female") {
    bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age - 161;
  } else {
    bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + 5;
  }

  // Activity multiplier — default moderate, adjust based on today's workout
  let activityMultiplier = 1.55;
  const todayWorkout = getTodayScheduledWorkout();
  if (todayWorkout) {
    activityMultiplier = 1.725; // active day
  }

  let tdee = Math.round(bmr * activityMultiplier);

  // Goal adjustments
  const goalAdjustments = {
    strength: 300,   // bulk surplus
    endurance: 200,  // slight surplus for training
    speed: 100,      // slight surplus
    weight: -500,    // deficit
    general: 0,
  };
  tdee += (goalAdjustments[goal] || 0);

  // Macro splits by goal
  const macroSplits = {
    strength:  { protein: 0.30, carbs: 0.45, fat: 0.25 },
    endurance: { protein: 0.25, carbs: 0.50, fat: 0.25 },
    speed:     { protein: 0.28, carbs: 0.47, fat: 0.25 },
    weight:    { protein: 0.35, carbs: 0.35, fat: 0.30 },
    general:   { protein: 0.30, carbs: 0.40, fat: 0.30 },
  };
  const split = macroSplits[goal] || macroSplits.general;

  // Safety guardrails — minimum calorie floors
  const minCalories = gender === "female" ? 1200 : 1500;
  if (tdee < minCalories) tdee = minCalories;

  // Compute macros
  let protein = Math.round((tdee * split.protein) / 4);
  const carbs = Math.round((tdee * split.carbs) / 4);
  const fat = Math.round((tdee * split.fat) / 9);

  // Safety guardrail — minimum protein floor: 0.6g per lb bodyweight
  const minProtein = Math.round(weight_lbs * 0.6);
  if (protein < minProtein) protein = minProtein;

  return { calories: tdee, protein, carbs, fat };
}

function getTodayScheduledWorkout() {
  const today = getTodayString();
  try {
    const schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
    return schedule.find(w => w.date === today) || null;
  } catch { return null; }
}

/* =====================================================================
   SMART DASHBOARD — Calorie bar + Macro progress rings
   ===================================================================== */

function updateNutritionDashboard() {
  // Use the same target source as the home page day detail
  const today = getTodayString();
  const targets = (typeof getDailyNutritionTarget === "function")
    ? getDailyNutritionTarget(today)
    : calculateNutritionTargets();
  const meals = loadMeals();
  const todaysMeals = meals.filter(m => m.date === today);

  const eaten = todaysMeals.reduce((acc, m) => ({
    calories: acc.calories + (m.calories || 0),
    protein: acc.protein + (m.protein || 0),
    carbs: acc.carbs + (m.carbs || 0),
    fat: acc.fat + (m.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Calorie bar
  const calPct = Math.min(Math.round((eaten.calories / targets.calories) * 100), 100);
  const calFill = document.getElementById("nutri-progress-fill");
  const calEaten = document.getElementById("nutri-calories-eaten");
  const calTarget = document.getElementById("nutri-calories-target");
  if (calFill) calFill.style.width = calPct + "%";
  if (calEaten) calEaten.textContent = Math.round(eaten.calories).toLocaleString();
  if (calTarget) calTarget.textContent = targets.calories.toLocaleString();
  // Match the macro rings — they paint Math.round(pct*100)+"%" in the
  // center (clamped to 100). Mirror that here so the calorie row reads
  // "715 / 3,250 cal (22%)" and shares the same ceiling semantics.
  const calPctLabel = document.getElementById("nutri-calories-pct");
  if (calPctLabel) calPctLabel.textContent = "(" + calPct + "%)";

  // Over-budget warning
  if (calFill && eaten.calories > targets.calories) {
    calFill.style.background = "var(--color-danger, #ef4444)";
  } else if (calFill) {
    calFill.style.background = "";
  }

  // Macro rings
  drawMacroRing("nutri-ring-protein", eaten.protein, targets.protein, getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() || "#6366f1");
  drawMacroRing("nutri-ring-carbs", eaten.carbs, targets.carbs, "#22d3ee");
  drawMacroRing("nutri-ring-fat", eaten.fat, targets.fat, "#f59e0b");

  // Macro values
  const proteinVal = document.getElementById("nutri-protein-value");
  const carbsVal = document.getElementById("nutri-carbs-value");
  const fatVal = document.getElementById("nutri-fat-value");
  if (proteinVal) proteinVal.textContent = `${Math.round(eaten.protein)}/${targets.protein}g`;
  if (carbsVal) carbsVal.textContent = `${Math.round(eaten.carbs)}/${targets.carbs}g`;
  if (fatVal) fatVal.textContent = `${Math.round(eaten.fat)}/${targets.fat}g`;

  // Training context
  updateTrainingContext();

  // Bulking / cutting tip — surfaced once per session (dismissable).
  // Bulkers get a specific protein-shake nudge because hitting a surplus
  // on whole food alone is the main reason bulks stall. Cutters get a
  // protein-priority note to preserve lean mass in deficit.
  try {
    let tipHost = document.getElementById("nutri-goal-tip");
    if (!tipHost) {
      const target = document.getElementById("nutri-calories-target");
      const wrap = target && target.closest(".nutri-calorie-row, .nutri-calories, .nutrition-target-section, .section-card");
      if (wrap) {
        tipHost = document.createElement("div");
        tipHost.id = "nutri-goal-tip";
        tipHost.className = "nutri-goal-tip";
        wrap.appendChild(tipHost);
      }
    }
    if (tipHost) {
      if (targets.bulkingTip) {
        tipHost.style.display = "";
        tipHost.innerHTML = '<span class="nutri-goal-tip-icon">\uD83D\uDCA1</span> ' + _nutEsc(targets.bulkingTip);
      } else if (targets.isCutting) {
        tipHost.style.display = "";
        tipHost.innerHTML = '<span class="nutri-goal-tip-icon">\uD83D\uDCA1</span> Cutting — protein is the priority. Aim to hit protein before you cap calories so you preserve muscle in the deficit.';
      } else {
        tipHost.style.display = "none";
        tipHost.innerHTML = "";
      }
    }
  } catch {}
}

function drawMacroRing(canvasId, current, target, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Handle retina displays
  const dpr = window.devicePixelRatio || 1;
  const displaySize = 80;
  canvas.width = displaySize * dpr;
  canvas.height = displaySize * dpr;
  canvas.style.width = displaySize + "px";
  canvas.style.height = displaySize + "px";

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const center = displaySize / 2;
  const radius = center - 8;
  const lineWidth = 7;
  const pct = target > 0 ? Math.min(current / target, 1) : 0;

  ctx.clearRect(0, 0, displaySize, displaySize);

  // Background ring — use a visible gray regardless of theme
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-border").trim() || "#d1d5db";
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.stroke();

  // Progress ring
  if (pct > 0) {
    ctx.beginPath();
    ctx.arc(center, center, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  // Center percentage text
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-text").trim() || "#1a1a1a";
  ctx.font = `bold ${14}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(Math.round(pct * 100) + "%", center, center);
}

function updateTrainingContext() {
  const contextEl = document.getElementById("nutri-training-context");
  const textEl = document.getElementById("nutri-context-text");
  if (!contextEl || !textEl) return;

  const workout = getTodayScheduledWorkout();
  if (!workout) {
    contextEl.style.display = "none";
    return;
  }

  contextEl.style.display = "";
  // BUGFIX: brick sessions store type:"triathlon" with discipline:"brick"
  // — the old fallback printed "triathlon scheduled today" because neither
  // title nor name was set. Prefer sessionName (what the card displays),
  // fall back to a friendly type-label map, then to the raw type.
  const _NUT_TYPE_LABEL = {
    brick: "Brick", triathlon: "Brick",
    weightlifting: "Strength", strength: "Strength",
    hiit: "HIIT", hyrox: "Hyrox",
    running: "Run", run: "Run",
    cycling: "Ride", bike: "Ride",
    swimming: "Swim", swim: "Swim",
    yoga: "Yoga", bodyweight: "Bodyweight",
    general: "Workout", wellness: "Wellness",
    walking: "Walk", hiking: "Hike", rowing: "Row",
  };
  const key = String(workout.discipline || workout.type || "").toLowerCase();
  const labelFromType = _NUT_TYPE_LABEL[key] || workout.type || "Workout";
  const title = workout.sessionName || workout.title || workout.name || labelFromType;
  textEl.textContent = `${title} scheduled today — prioritize protein and stay hydrated.`;
}

/* =====================================================================
   PHOTO MEAL LOGGING — Claude Vision
   ===================================================================== */

let photoMealVisible = false;

function openPhotoMealLog() {
  const modal = document.getElementById("photo-meal-modal");
  // Reset state first so the modal opens in a clean state every time
  document.getElementById("photo-preview-area").style.display = "none";
  document.getElementById("photo-ai-result").style.display = "none";
  document.getElementById("photo-ai-loading").style.display = "none";
  document.getElementById("photo-meal-msg").textContent = "";
  // Hide the sticky save bar — it should only appear once a photo
  // has been analyzed and the macro fields are populated.
  const actions = document.getElementById("photo-meal-actions");
  if (actions) actions.style.display = "none";
  // Clear any stale photo input value so picking the same file twice
  // re-triggers the change event.
  const input = document.getElementById("meal-photo-input");
  if (input) input.value = "";
  // Reset notes textarea + drop the cached photo so a stale image
  // from a prior open doesn't get re-sent on the next Re-analyze.
  const notes = document.getElementById("photo-meal-notes");
  if (notes) notes.value = "";
  if (modal) {
    delete modal.dataset.photoBase64;
    delete modal.dataset.photoMediaType;
  }
  // survey-overlay needs both display:flex and .is-open to be visible —
  // same pattern as the barcode scanner. Previously this was an inline
  // div that hid the nutrition dashboard and tried to scroll the inline
  // card into view, which left the modal off-screen on mobile.
  modal.style.display = "flex";
  requestAnimationFrame(() => modal.classList.add("is-open"));
  photoMealVisible = true;
}

function closePhotoMealLog() {
  const modal = document.getElementById("photo-meal-modal");
  modal.classList.remove("is-open");
  // Match the 250ms fade-out transition on .survey-overlay before hiding.
  setTimeout(() => { modal.style.display = "none"; }, 250);
  photoMealVisible = false;
}

function openManualMealLog() {
  const modal = document.getElementById("manual-meal-modal");
  if (modal) modal.classList.add("is-open");
  // Clear any leftover estimate status from a prior session
  const status = document.getElementById("meal-estimate-status");
  if (status) { status.textContent = ""; status.style.display = "none"; }
  // Focus the name field for quick entry
  setTimeout(() => document.getElementById("meal-name")?.focus(), 200);
}

function closeManualMealLog() {
  const modal = document.getElementById("manual-meal-modal");
  if (modal) modal.classList.remove("is-open");
}

// Entry point for the Ask IronZ tile on the Log a Meal screen.
// Opens the manual-entry modal (which already hosts the free-text → macro
// estimator) and pulses the Estimate button so the intended flow is clear.
function openAskIronZMeal() {
  openManualMealLog();
  setTimeout(() => {
    const btn = document.getElementById("btn-estimate-meal");
    if (!btn) return;
    btn.classList.add("is-pulsing");
    setTimeout(() => btn.classList.remove("is-pulsing"), 1800);
  }, 250);
}

function saveMealAndClose() {
  const nameBefore = document.getElementById("meal-name")?.value?.trim();
  saveMeal();
  // saveMeal clears the name field on success
  const nameAfter = document.getElementById("meal-name")?.value?.trim();
  if (nameBefore && !nameAfter) {
    setTimeout(closeManualMealLog, 800);
  }
}

// Free-text → macro estimate via Claude (routed through the ask-ironz
// Edge Function, which handles auth + per-user daily rate limiting).
// Populates the four macro inputs so the user reviews/adjusts before
// hitting Log Meal — values are not saved until they confirm.
async function estimateMealWithAI() {
  const nameEl   = document.getElementById("meal-name");
  const btn      = document.getElementById("btn-estimate-meal");
  const status   = document.getElementById("meal-estimate-status");
  const description = nameEl?.value?.trim();

  if (!description) {
    if (status) {
      status.style.display = "";
      status.style.color = "#ef4444";
      status.textContent = "Type what you ate first, then tap Estimate.";
    }
    nameEl?.focus();
    return;
  }

  if (typeof callAI !== "function") {
    if (status) {
      status.style.display = "";
      status.style.color = "#ef4444";
      status.textContent = "AI is not available right now.";
    }
    return;
  }

  btn.disabled = true;
  const origLabel = btn.querySelector(".btn-estimate-ai-label")?.textContent;
  const labelEl = btn.querySelector(".btn-estimate-ai-label");
  if (labelEl) labelEl.textContent = "Estimating…";
  btn.classList.add("is-loading");
  if (status) {
    status.style.display = "";
    status.style.color = "var(--color-text-muted)";
    status.textContent = "Asking IronZ…";
  }

  try {
    const res = await callAI({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system:
        "You are a nutrition coach estimating typical macros for a meal from a short text description. Respond with ONLY a valid JSON object matching this shape: {\"calories\": number, \"protein_g\": number, \"carbs_g\": number, \"fat_g\": number}. Use whole numbers.\n\nQUANTITY HANDLING (priority order):\n1. Explicit weight in the description (lbs, lb, pounds, oz, ounces, g, grams, kg, kilograms) — scale the macros by the stated weight using realistic per-unit values for the specific food. Doubling the weight of the same food MUST roughly double the macros. Examples: \"0.4 lbs of plain chicken breast\" ≈ 0.4 × ~520 cal/lb ≈ 210 cal; \"0.8 lbs of plain chicken breast\" ≈ 0.8 × ~520 cal/lb ≈ 420 cal; \"0.4 lbs of flour-coated fried chicken tenders\" ≈ 0.4 × ~1100 cal/lb ≈ 440 cal (breading and frying oil push the per-pound number well above plain chicken). Use the food's actual calorie density — fried/breaded/oil-cooked items are 2-3× plain protein per pound.\n2. Multipliers (\"x2\", \"x3\", \"2x\", \"2 servings\", \"two\", \"three\", \"double\", \"half\", \"1.5\") — multiply per-serving macros by that exact factor.\n3. No quantity given → default to one standard serving.\nWhen both a weight and a multiplier are present, weight takes precedence.\n\nPORTION + PREP DEFAULTS: when the description doesn't specify, assume STANDARD portion sizes (one slice of bread ≈ 80g, one egg ≈ 70g, one cup of cooked rice ≈ 200g) and PLAIN preparation — no added butter, oil, dressing, or sauce. Only add cooking fat if the description mentions it (e.g., \"fried\", \"buttered\", \"olive oil\", \"with mayo\"). When in genuine doubt between a smaller and a larger plausible reading, prefer the smaller — users can adjust up after the estimate posts. Examples: \"2 eggs with a piece of sourdough\" → ~140 cal eggs (plain) + ~140 cal slice = ~280 total, NOT 370 (don't assume butter or oversize slice). \"chicken breast and rice\" → ~6 oz plain chicken (~280 cal) + ~1 cup cooked rice (~200 cal) = ~480 total. If the user mentioned cooking method or portion, follow that.\n\nDo not include any other text, comments, units, or formatting — just the JSON.",
      messages: [
        { role: "user", content: `Meal: ${description}` },
      ],
    });

    const text = res?.content?.[0]?.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Couldn't parse estimate.");
    const parsed = JSON.parse(match[0]);

    const cal = Math.round(Number(parsed.calories) || 0);
    const p   = Math.round(Number(parsed.protein_g) || 0);
    const c   = Math.round(Number(parsed.carbs_g)   || 0);
    const f   = Math.round(Number(parsed.fat_g)     || 0);

    document.getElementById("meal-calories").value = cal;
    document.getElementById("meal-protein").value  = p;
    document.getElementById("meal-carbs").value    = c;
    document.getElementById("meal-fat").value      = f;

    if (status) {
      status.style.display = "";
      status.style.color = "var(--color-accent, #16a34a)";
      const remaining = typeof res._remaining === "number" ? ` · ${res._remaining} left today` : "";
      status.textContent = `Estimated — review and adjust if needed, then Log Meal.${remaining}`;
    }

    if (typeof trackEvent === "function") trackEvent("meal_estimate_ai", { ok: true });
  } catch (err) {
    if (status) {
      status.style.display = "";
      status.style.color = "#ef4444";
      status.textContent = err.message || "Couldn't estimate. Try again or enter values manually.";
    }
    if (typeof trackEvent === "function") trackEvent("meal_estimate_ai", { ok: false, error: String(err.message || err) });
  } finally {
    btn.disabled = false;
    btn.classList.remove("is-loading");
    if (labelEl) labelEl.textContent = origLabel || "Estimate with IronZ";
  }
}

function openQuickAddMeal() {
  // Pull every distinct meal the user has logged. The modal scrolls so a
  // long history is fine — searchable too. Cap at 50 to keep the DOM
  // small for users with thousands of meals; the search box can find
  // older entries by name match.
  const meals = loadMeals();
  const recent = [];
  const seen = new Set();
  for (const m of meals) {
    const key = m.name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      recent.push(m);
    }
    if (recent.length >= 50) break;
  }

  if (recent.length === 0) {
    openManualMealLog();
    return;
  }

  const modal = document.getElementById("quick-add-meal-modal");
  if (!modal) return;
  modal.classList.add("is-open");

  // Reset search box every time the modal opens.
  const searchInput = document.getElementById("quick-add-meal-search");
  if (searchInput) searchInput.value = "";

  // Store full list for filtering + safe selection.
  window._quickAddMeals = recent;
  _renderQuickAddMealList(recent);
}

function _renderQuickAddMealList(meals) {
  const list = document.getElementById("quick-add-meal-list");
  if (!list) return;
  if (!meals.length) {
    list.innerHTML = `<p class="hint" style="padding:12px 4px">No meals match.</p>`;
    return;
  }
  // The button uses the meal's index in the FULL stored list so the
  // selection lookup remains stable even when the rendered list is
  // filtered.
  list.innerHTML = meals.map(m => {
    const i = window._quickAddMeals.indexOf(m);
    return `
      <button class="quick-add-meal-item" onclick="quickAddMealByIndex(${i})">
        <span class="quick-add-meal-name">${_nutEsc(m.name)}</span>
        <span class="quick-add-meal-macros">${Math.round(m.calories)} cal | P:${Math.round(m.protein)}g C:${Math.round(m.carbs)}g F:${Math.round(m.fat)}g</span>
      </button>`;
  }).join("");
}

function filterQuickAddMeals(query) {
  const all = window._quickAddMeals || [];
  const q = String(query || "").trim().toLowerCase();
  if (!q) { _renderQuickAddMealList(all); return; }
  const filtered = all.filter(m => m.name.toLowerCase().includes(q));
  _renderQuickAddMealList(filtered);
}

function closeQuickAddMeal() {
  const modal = document.getElementById("quick-add-meal-modal");
  if (modal) modal.classList.remove("is-open");
}

function quickAddMealByIndex(index) {
  const m = window._quickAddMeals?.[index];
  if (!m) return;
  quickAddMealSelect(m.calories, m.protein, m.carbs, m.fat, m.name);
}

function quickAddMealSelect(cal, protein, carbs, fat, name) {
  const meal = {
    id: generateId("meal"),
    date: getTodayString(),
    name: name,
    calories: cal,
    protein: protein,
    carbs: carbs,
    fat: fat,
  };
  const meals = loadMeals();
  meals.unshift(meal);
  localStorage.setItem("meals", JSON.stringify(meals)); if (typeof DB !== 'undefined') DB.syncKey('meals');

  if (typeof trackEvent === "function") trackEvent("meal_logged", { source: "quick_add", calories: cal });

  closeQuickAddMeal();
  updateNutritionDashboard();
  renderNutritionHistory();
  renderTodaysSummary();

  if (typeof selectedDate !== "undefined" && selectedDate === meal.date && typeof renderDayDetail === "function") {
    renderDayDetail(meal.date);
  }
}

async function handleMealPhoto(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];

  // Show preview
  const previewArea = document.getElementById("photo-preview-area");
  const previewImg = document.getElementById("meal-photo-preview");

  previewArea.style.display = "";

  // Display image preview
  const reader = new FileReader();
  reader.onload = function (e) {
    previewImg.src = e.target.result;
  };
  reader.readAsDataURL(file);

  // Convert to base64 once and cache on the modal so Re-analyze can
  // refire the same image with new notes without re-uploading.
  const base64 = await fileToBase64(file);
  const mediaType = file.type || "image/jpeg";
  const modal = document.getElementById("photo-meal-modal");
  modal.dataset.photoBase64 = base64;
  modal.dataset.photoMediaType = mediaType;

  await _runMealPhotoAnalysis(base64, mediaType);
}

// Re-fire the AI call with the cached photo + whatever's in the notes
// textarea now. Triggered by the "Re-analyze with notes above" button
// in the result panel — covers the case where the AI mis-identifies
// an item ("cheese" instead of salmon) and the user wants to correct
// without re-taking the photo.
async function reanalyzeMealPhoto() {
  const modal = document.getElementById("photo-meal-modal");
  const base64 = modal?.dataset.photoBase64;
  const mediaType = modal?.dataset.photoMediaType || "image/jpeg";
  if (!base64) {
    const msg = document.getElementById("photo-meal-msg");
    if (msg) {
      msg.style.color = "var(--color-danger)";
      msg.textContent = "Take a photo first, then add notes and re-analyze.";
    }
    return;
  }
  await _runMealPhotoAnalysis(base64, mediaType);
}
if (typeof window !== "undefined") window.reanalyzeMealPhoto = reanalyzeMealPhoto;

// Shared analysis worker — used by both the initial photo upload and
// the Re-analyze button. Reads the notes textarea live so corrections
// flow into the AI prompt without any extra plumbing.
async function _runMealPhotoAnalysis(base64, mediaType) {
  const loadingEl = document.getElementById("photo-ai-loading");
  const resultEl = document.getElementById("photo-ai-result");
  const msgEl = document.getElementById("photo-meal-msg");
  if (msgEl) { msgEl.textContent = ""; msgEl.style.color = ""; }

  resultEl.style.display = "none";
  loadingEl.style.display = "";

  const userNotes = (document.getElementById("photo-meal-notes")?.value || "").trim();
  const userText = userNotes
    ? `User notes: ${userNotes}\n\nIdentify all food items in this image and estimate the nutritional content for each. The user's notes above override what the image looks like — trust them when they correct an item or specify a portion. Be as accurate as possible with portion sizes.`
    : "Identify all food items in this image and estimate the nutritional content for each. Be as accurate as possible with portion sizes.";

  try {
    const data = await callAI({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: "You are a nutrition analysis AI. Analyze the food in this image. Return ONLY valid JSON with no markdown formatting: { \"foods\": [{\"name\": \"item\", \"estimated_calories\": 0, \"protein_g\": 0, \"carbs_g\": 0, \"fat_g\": 0}], \"total\": {\"calories\": 0, \"protein_g\": 0, \"carbs_g\": 0, \"fat_g\": 0}, \"description\": \"brief description\" }",
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: userText }
        ]
      }]
    });

    loadingEl.style.display = "none";

    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      if (msgEl) {
        msgEl.textContent = "Could not parse AI response.";
        msgEl.style.color = "var(--color-danger)";
      }
      return;
    }

    const result = JSON.parse(jsonMatch[0]);
    resultEl.style.display = "";

    const modalEl = document.getElementById("photo-meal-modal");
    modalEl._photoFoods = Array.isArray(result.foods) ? result.foods.slice() : [];
    modalEl._photoEditingIdx = null;
    _renderPhotoFoods();

    modalEl.dataset.description = result.description || "Photo-logged meal";

    const actions = document.getElementById("photo-meal-actions");
    if (actions) actions.style.display = "";
  } catch (err) {
    loadingEl.style.display = "none";
    if (!msgEl) return;
    msgEl.style.color = "var(--color-danger)";
    const isAuthLock = /Couldn't reach IronZ/i.test(err.message || "");
    if (isAuthLock) {
      msgEl.innerHTML = `Error analyzing photo: ${escHtml(err.message)} <button class="btn-secondary btn-sm" style="margin-left:8px" onclick="window.location.reload()">Reload app</button>`;
    } else {
      msgEl.textContent = "Error analyzing photo: " + err.message;
    }
  }
}

// Render the cached detected-foods list with per-item trash buttons, then
// recompute the totals fields. Called after analysis and after each delete
// so the saved macros always match what the user sees.
function _renderPhotoFoods() {
  const modalEl = document.getElementById("photo-meal-modal");
  const foodsEl = document.getElementById("photo-detected-foods");
  const foods = modalEl?._photoFoods || [];
  const trashIcon = (typeof ICONS !== "undefined" && ICONS.trash) || "&times;";
  const openIdx = modalEl?._photoEditingIdx;
  if (foodsEl) {
    foodsEl.innerHTML = foods.length
      ? foods.map((f, i) => {
          const open = i === openIdx;
          const cals = Math.round(f.estimated_calories || 0);
          const editor = open
            ? `<div class="photo-food-edit">
                <div class="photo-food-edit-grid">
                  <label>Cal<input type="number" inputmode="decimal" value="${escHtml(cals)}" oninput="updatePhotoMealFoodField(${i},'estimated_calories',this.value)" /></label>
                  <label>P (g)<input type="number" inputmode="decimal" value="${escHtml(Math.round((f.protein_g||0)*10)/10)}" oninput="updatePhotoMealFoodField(${i},'protein_g',this.value)" /></label>
                  <label>C (g)<input type="number" inputmode="decimal" value="${escHtml(Math.round((f.carbs_g||0)*10)/10)}" oninput="updatePhotoMealFoodField(${i},'carbs_g',this.value)" /></label>
                  <label>F (g)<input type="number" inputmode="decimal" value="${escHtml(Math.round((f.fat_g||0)*10)/10)}" oninput="updatePhotoMealFoodField(${i},'fat_g',this.value)" /></label>
                </div>
              </div>`
            : "";
          return `<div class="photo-food-row${open ? ' is-open' : ''}">
            <button type="button" class="photo-food-item photo-food-toggle" onclick="togglePhotoMealFoodEdit(${i})" aria-expanded="${open}">
              <span class="photo-food-name">${escHtml(f.name)}</span>
              <span class="photo-food-right">
                <span class="photo-food-cals" data-cal-for="${i}">${cals} cal</span>
              </span>
            </button>
            <button type="button" class="photo-food-remove" aria-label="Remove ${escHtml(f.name)}" title="Remove" onclick="removePhotoMealFood(${i})">${trashIcon}</button>
            ${editor}
          </div>`;
        }).join("")
      : `<div class="hint" style="padding:6px 0">No items — re-analyze or close.</div>`;
  }
  const total = foods.reduce((acc, f) => {
    acc.calories += Number(f.estimated_calories) || 0;
    acc.protein += Number(f.protein_g) || 0;
    acc.carbs += Number(f.carbs_g) || 0;
    acc.fat += Number(f.fat_g) || 0;
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  document.getElementById("photo-calories").value = Math.round(total.calories);
  document.getElementById("photo-protein").value = Math.round(total.protein);
  document.getElementById("photo-carbs").value = Math.round(total.carbs);
  document.getElementById("photo-fat").value = Math.round(total.fat);
}

function removePhotoMealFood(idx) {
  const modalEl = document.getElementById("photo-meal-modal");
  if (!modalEl?._photoFoods) return;
  modalEl._photoFoods.splice(idx, 1);
  if (modalEl._photoEditingIdx === idx) modalEl._photoEditingIdx = null;
  else if (typeof modalEl._photoEditingIdx === "number" && modalEl._photoEditingIdx > idx) modalEl._photoEditingIdx -= 1;
  _renderPhotoFoods();
}
if (typeof window !== "undefined") window.removePhotoMealFood = removePhotoMealFood;

function togglePhotoMealFoodEdit(idx) {
  const modalEl = document.getElementById("photo-meal-modal");
  if (!modalEl?._photoFoods) return;
  modalEl._photoEditingIdx = (modalEl._photoEditingIdx === idx) ? null : idx;
  _renderPhotoFoods();
}
if (typeof window !== "undefined") window.togglePhotoMealFoodEdit = togglePhotoMealFoodEdit;

// Live macro edit. Updates the cached food in place and refreshes only the
// totals + this row's calorie label — we deliberately don't re-render the
// list so the user keeps focus while typing.
function updatePhotoMealFoodField(idx, field, value) {
  const modalEl = document.getElementById("photo-meal-modal");
  const food = modalEl?._photoFoods?.[idx];
  if (!food) return;
  const num = parseFloat(value);
  food[field] = isFinite(num) ? num : 0;
  if (field === "estimated_calories") {
    const calEl = document.querySelector(`[data-cal-for="${idx}"]`);
    if (calEl) calEl.textContent = `${Math.round(food.estimated_calories || 0)} cal`;
  }
  const total = (modalEl._photoFoods || []).reduce((acc, f) => {
    acc.calories += Number(f.estimated_calories) || 0;
    acc.protein += Number(f.protein_g) || 0;
    acc.carbs += Number(f.carbs_g) || 0;
    acc.fat += Number(f.fat_g) || 0;
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  document.getElementById("photo-calories").value = Math.round(total.calories);
  document.getElementById("photo-protein").value = Math.round(total.protein);
  document.getElementById("photo-carbs").value = Math.round(total.carbs);
  document.getElementById("photo-fat").value = Math.round(total.fat);
}
if (typeof window !== "undefined") window.updatePhotoMealFoodField = updatePhotoMealFoodField;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      // Remove data URL prefix to get raw base64
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function savePhotoMeal() {
  const calories = parseFloat(document.getElementById("photo-calories").value) || 0;
  const protein = parseFloat(document.getElementById("photo-protein").value) || 0;
  const carbs = parseFloat(document.getElementById("photo-carbs").value) || 0;
  const fat = parseFloat(document.getElementById("photo-fat").value) || 0;
  const description = document.getElementById("photo-meal-modal").dataset.description || "Photo-logged meal";

  const meal = {
    id: generateId("meal"),
    date: getTodayString(),
    name: description,
    calories, protein, carbs, fat,
    source: "photo",
  };

  const meals = loadMeals();
  meals.unshift(meal);
  localStorage.setItem("meals", JSON.stringify(meals)); if (typeof DB !== 'undefined') DB.syncKey('meals');

  if (typeof trackEvent === "function") trackEvent("meal_logged", { source: "photo", calories });

  const msg = document.getElementById("photo-meal-msg");
  msg.style.color = "var(--color-success)";
  msg.textContent = "Meal logged!";
  setTimeout(() => { msg.textContent = ""; }, 3000);

  // Refresh views
  updateNutritionDashboard();
  renderNutritionHistory();
  renderTodaysSummary();

  if (typeof selectedDate !== "undefined" && selectedDate === meal.date && typeof renderDayDetail === "function") {
    renderDayDetail(meal.date);
  }

  setTimeout(closePhotoMealLog, 1500);
}

/* =====================================================================
   AI MEAL SUGGESTIONS
   ===================================================================== */

async function generateMealSuggestions() {
  const btn = document.querySelector("#section-meal-suggestions .btn-primary");
  const resultEl = document.getElementById("meal-suggestions-result");
  if (!btn || !resultEl) return;

  btn.disabled = true;
  btn.textContent = "Generating...";
  resultEl.style.display = "none";

  let profile;
  try { profile = JSON.parse(localStorage.getItem("profile")) || {}; } catch { profile = {}; }
  const prefs = typeof loadPrefs === "function" ? loadPrefs() : { likes: [], dislikes: [] };
  const today = getTodayString();
  const targets = (typeof getDailyNutritionTarget === "function") ? getDailyNutritionTarget(today) : calculateNutritionTargets();

  // What they've eaten today
  const meals = loadMeals();
  const todaysMeals = meals.filter(m => m.date === today);
  const eaten = todaysMeals.reduce((acc, m) => ({
    calories: acc.calories + (m.calories || 0),
    protein: acc.protein + (m.protein || 0),
    carbs: acc.carbs + (m.carbs || 0),
    fat: acc.fat + (m.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const remaining = {
    calories: Math.max(0, targets.calories - eaten.calories),
    protein: Math.max(0, targets.protein - eaten.protein),
    carbs: Math.max(0, targets.carbs - eaten.carbs),
    fat: Math.max(0, targets.fat - eaten.fat),
  };

  // Dietary context with allergy safety
  let dietaryCtx = "";
  let allergyConstraint = "";
  try {
    const obData = JSON.parse(localStorage.getItem("onboardingData") || "{}");
    if (obData.dietaryRestrictions?.length && !obData.dietaryRestrictions.includes("none")) {
      dietaryCtx = `Dietary restrictions: ${obData.dietaryRestrictions.join(", ")}. `;
    }
    if (obData.allergies) dietaryCtx += `Allergies: ${obData.allergies}. `;
  } catch {}

  // Structured allergy data from food preferences
  const aData = typeof getAllergyData === "function" ? getAllergyData() : null;
  if (aData && aData.allergies.length > 0) {
    allergyConstraint = `\nCRITICAL SAFETY CONSTRAINT: The user has the following allergies: ${aData.allergies.join(", ")}. NEVER suggest any meal, ingredient, or recipe that contains these items or derivatives of these items. This is a medical safety requirement.\n`;
  }
  const avoidsText = aData ? aData.avoids.join(", ") : prefs.dislikes.map(d => typeof d === "string" ? d : d.name).join(", ");

  const workout = getTodayScheduledWorkout();
  const workoutCtx = workout ? `Today's workout: ${workout.title || workout.type || "training session"}. ` : "Rest day. ";

  // Recently suggested meals (last 4 sessions worth) — fed into the prompt
  // so Claude doesn't regenerate the same three staple meals every tap.
  // Without this, identical inputs produced identical outputs and "Oatmeal
  // with Protein Powder" / "Grilled Chicken + Rice + Broccoli" / "Salmon +
  // Sweet Potato" became the permanent trio.
  let recentNames = [];
  try {
    const raw = JSON.parse(localStorage.getItem("mealSuggestionHistory") || "[]");
    if (Array.isArray(raw)) recentNames = raw.slice(0, 12);
  } catch {}
  const recentClause = recentNames.length
    ? `\nAVOID repeating any of these recently suggested meals (pick different dishes, different proteins, different cuisines): ${recentNames.join(", ")}.`
    : "";
  // Random variety nonce — invalidates any lingering prompt cache and
  // nudges Claude toward different dishes even when other inputs match.
  const varietyNonce = Math.random().toString(36).slice(2, 10);

  const prompt = `Generate 3 meal suggestions for the rest of today. Favor variety — different cuisines, proteins, and preparation styles. Don't default to the same Western staples (oatmeal, chicken + rice + broccoli, salmon + sweet potato) unless explicitly requested.
${allergyConstraint}
User: ${profile.age || 30}yo, ${profile.weight || 160}lbs, goal: ${profile.goal || "general fitness"}.
${workoutCtx}${dietaryCtx}
Foods they love: ${prefs.likes.join(", ") || "none specified"}.
Foods to avoid: ${avoidsText || "none specified"}.
Already eaten today: ${todaysMeals.length ? todaysMeals.map(m => m.name).join(", ") : "nothing yet"}.
Remaining macros needed: ${remaining.calories} cal, ${remaining.protein}g protein, ${remaining.carbs}g carbs, ${remaining.fat}g fat.${recentClause}
Variety key: ${varietyNonce}

Return ONLY valid JSON array, no markdown:
[{"meal_type":"lunch","name":"Meal Name","ingredients":["item1","item2"],"calories":0,"protein":0,"carbs":0,"fat":0,"prep_time":"15 min"}]`;

  try {
    const data = await callAI({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }]
    });

    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (!jsonMatch) throw new Error("Could not parse response");

    let suggestions = JSON.parse(jsonMatch[0]);
    // Post-generation safety: filter out meals containing allergens
    const postAData = typeof getAllergyData === "function" ? getAllergyData() : null;
    if (postAData && postAData.allergies.length > 0) {
      suggestions = suggestions.filter(s => {
        const text = (s.name + " " + (s.ingredients || []).join(" ")).toLowerCase();
        return !postAData.allergies.some(a => text.includes(a.toLowerCase()));
      });
    }
    resultEl.style.display = "";
    window._mealSuggestions = suggestions;

    // Persist the new suggestion names to history so the next generation
    // avoids them. Cap the list at 12 so we don't shrink the candidate
    // space indefinitely — after 4 sessions of 3 meals the oldest names
    // drop off and can re-appear.
    try {
      const newNames = suggestions.map(s => s && s.name).filter(Boolean);
      const merged = newNames.concat(recentNames).slice(0, 12);
      localStorage.setItem("mealSuggestionHistory", JSON.stringify(merged));
      if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("mealSuggestionHistory");
    } catch {}

    resultEl.innerHTML = suggestions.map((s, i) => `
      <div class="meal-suggestion-card">
        <div class="meal-suggestion-header">
          <span class="meal-suggestion-type">${_nutEsc(s.meal_type)}</span>
          <span class="meal-suggestion-time">${_nutEsc(s.prep_time || "")}</span>
        </div>
        <div class="meal-suggestion-name">${_nutEsc(s.name)}</div>
        <div class="meal-suggestion-ingredients">${_nutEsc(s.ingredients?.join(", ") || "")}</div>
        <div class="meal-suggestion-macros">
          ${s.calories} cal | P:${s.protein}g C:${s.carbs}g F:${s.fat}g
        </div>
        <button class="btn-secondary btn-sm" onclick="logSuggestedMealByIndex(${i})">
          + Log This Meal
        </button>
      </div>
    `).join("");

  } catch (err) {
    resultEl.style.display = "";
    resultEl.innerHTML = `<p class="empty-msg">Error generating suggestions: ${err.message}</p>`;
  }

  btn.disabled = false;
  btn.textContent = "Generate Today's Meal Ideas";
}

function logSuggestedMealByIndex(index) {
  const s = window._mealSuggestions?.[index];
  if (!s) return;
  logSuggestedMeal(s.name, s.calories, s.protein, s.carbs, s.fat);
}

function logSuggestedMeal(name, cal, protein, carbs, fat) {
  const meal = {
    id: generateId("meal"),
    date: getTodayString(),
    name, calories: cal, protein, carbs, fat,
    source: "suggestion",
  };
  const meals = loadMeals();
  meals.unshift(meal);
  localStorage.setItem("meals", JSON.stringify(meals)); if (typeof DB !== 'undefined') DB.syncKey('meals');

  if (typeof trackEvent === "function") trackEvent("meal_logged", { source: "suggestion", calories: cal });

  updateNutritionDashboard();
  renderNutritionHistory();
  renderTodaysSummary();

  if (typeof selectedDate !== "undefined" && selectedDate === meal.date && typeof renderDayDetail === "function") {
    renderDayDetail(meal.date);
  }
}

/* =====================================================================
   GROCERY LIST GENERATION
   ===================================================================== */

async function generateGroceryList() {
  const btn = document.querySelector("#section-grocery-list .btn-primary");
  const contentEl = document.getElementById("grocery-list-content");
  if (!btn || !contentEl) return;

  btn.disabled = true;
  btn.textContent = "Generating...";

  let profile;
  try { profile = JSON.parse(localStorage.getItem("profile")) || {}; } catch { profile = {}; }
  const prefs = typeof loadPrefs === "function" ? loadPrefs() : { likes: [], dislikes: [] };
  const targets = (typeof getDailyNutritionTarget === "function") ? getDailyNutritionTarget(getTodayString()) : calculateNutritionTargets();

  let dietaryCtx = "";
  let groceryAllergyConstraint = "";
  try {
    const obData = JSON.parse(localStorage.getItem("onboardingData") || "{}");
    if (obData.dietaryRestrictions?.length && !obData.dietaryRestrictions.includes("none")) {
      dietaryCtx = `Dietary restrictions: ${obData.dietaryRestrictions.join(", ")}. `;
    }
    if (obData.allergies) dietaryCtx += `Allergies: ${obData.allergies}. `;
  } catch {}

  const gAData = typeof getAllergyData === "function" ? getAllergyData() : null;
  if (gAData && gAData.allergies.length > 0) {
    groceryAllergyConstraint = `\nCRITICAL SAFETY CONSTRAINT: The user has the following allergies: ${gAData.allergies.join(", ")}. NEVER include any item that contains these allergens or derivatives. This is a medical safety requirement.\n`;
  }
  const gAvoidsText = gAData ? gAData.avoids.join(", ") : prefs.dislikes.map(d => typeof d === "string" ? d : d.name).join(", ");

  const prompt = `Generate a weekly grocery list for one person.
${groceryAllergyConstraint}
Profile: ${profile.age || 30}yo, ${profile.weight || 160}lbs, goal: ${profile.goal || "general fitness"}.
Daily targets: ${targets.calories} cal, ${targets.protein}g protein, ${targets.carbs}g carbs, ${targets.fat}g fat.
${dietaryCtx}
Foods they love: ${prefs.likes.join(", ") || "none specified"}.
Foods to avoid: ${gAvoidsText || "none specified"}.

Return ONLY valid JSON, no markdown:
{"categories":[{"name":"Produce","items":["item1","item2"]},{"name":"Protein","items":["item1"]},{"name":"Dairy","items":[]},{"name":"Grains","items":[]},{"name":"Other","items":[]}]}`;

  try {
    const data = await callAI({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }]
    });

    const text = data.content?.[0]?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) throw new Error("Could not parse response");

    const result = JSON.parse(jsonMatch[0]);
    contentEl.innerHTML = result.categories.map(cat => `
      <div class="grocery-category">
        <div class="grocery-category-name">${escHtml(cat.name)}</div>
        <div class="grocery-items">
          ${cat.items.map(item => `
            <label class="grocery-item">
              <input type="checkbox" />
              <span>${escHtml(item)}</span>
            </label>
          `).join("")}
        </div>
      </div>
    `).join("");

  } catch (err) {
    contentEl.innerHTML = `<p class="empty-msg">Error generating list: ${err.message}</p>`;
  }

  btn.disabled = false;
  btn.textContent = "Generate Grocery List";
}

/* =====================================================================
   HOOK INTO EXISTING MEAL SAVE
   Override saveMeal to also refresh the dashboard
   ===================================================================== */

const _originalSaveMeal = typeof saveMeal === "function" ? saveMeal : null;

if (_originalSaveMeal) {
  window._baseSaveMeal = _originalSaveMeal;

  window.saveMeal = function () {
    _originalSaveMeal();
    // Refresh dashboard after meal save
    setTimeout(updateNutritionDashboard, 100);
  };
}

/* =====================================================================
   INIT — called when nutrition tab is shown
   ===================================================================== */

function initNutritionDashboard() {
  // Reset photo modal state on tab re-entry
  if (photoMealVisible) closePhotoMealLog();
  updateNutritionDashboard();
}

function _nutEsc(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
