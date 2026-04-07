// life-training.js — Non-race endurance plan generation
// Structured running/cycling/swimming plans without a race goal.
// Progressive overload with deload weeks every 4th week, no taper/peak.

async function generateLifePlan(params) {
  const sport = params?.sport || document.getElementById("life-sport")?.value || "running";
  const goal = params?.goal || document.getElementById("life-goal")?.value || "base-building";
  const level = params?.level || document.getElementById("life-current-level")?.value || "beginner";
  const startDate = params?.startDate || document.getElementById("life-start-date")?.value;
  const durationVal = params?.duration || document.getElementById("life-duration")?.value || "8";
  const weeks = durationVal === "indefinite" ? 12 : parseInt(durationVal);

  const selectedDays = params?.selectedDays || Array.from(document.querySelectorAll("#life-day-picker input:checked")).map(el => parseInt(el.value));
  const daysPerWeek = selectedDays.length;

  const msg = params?.msgEl || document.getElementById("life-plan-msg");
  const preview = params?.previewEl || document.getElementById("life-plan-preview");

  if (!startDate) {
    if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Please select a start date."; }
    return;
  }
  if (daysPerWeek < 1) {
    if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Select at least one training day."; }
    return;
  }

  if (msg) { msg.style.color = "var(--color-text-muted)"; msg.textContent = "Generating plan..."; }

  // Get profile context
  let profileCtx = "";
  try {
    const p = JSON.parse(localStorage.getItem("profile") || "{}");
    if (p.age) profileCtx += `Age: ${p.age}. `;
    if (p.weight) profileCtx += `Weight: ${p.weight} lbs. `;
  } catch {}

  const goalDescriptions = {
    "base-building": "Build aerobic base — gradually increase weekly volume",
    "speed": "Improve speed — incorporate tempo, intervals, and threshold work",
    "endurance": "Build distance — progressive long sessions with volume increase",
    "consistency": "Maintain fitness — steady volume, variety, avoid burnout",
  };

  const sportLabels = { running: "running", cycling: "cycling", swimming: "swimming" };
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const trainingDayNames = selectedDays.map(d => dayNames[d]).join(", ");

  const prompt = `Create a ${weeks}-week ${sportLabels[sport]} training plan.

Goal: ${goalDescriptions[goal] || goal}
Level: ${level}
${profileCtx}
Training days: ${trainingDayNames} (${daysPerWeek} days/week)

Rules:
- Progressive overload: increase volume ~10% each week
- Every 4th week is a DELOAD week (reduce volume 30-40%)
- NO taper or peak phase — this is ongoing training, not race prep
- Each session needs: title, type (easy/tempo/interval/long/recovery), duration, and brief description
- For ${sport}, use appropriate session types

Return ONLY valid JSON, no markdown:
{"weeks":[{"weekNum":1,"theme":"Week theme","sessions":[{"day":"Mon","title":"Session Name","type":"easy","duration":"30 min","description":"Brief details"}]}]}

Include exactly ${daysPerWeek} sessions per week on the specified days.`;

  try {
    const data = await callAI({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }]
    });

    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const cleaned = text.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Could not parse AI response");

    const plan = JSON.parse(jsonMatch[0]);

    // Save to workoutSchedule
    const start = new Date(startDate + "T00:00:00");
    let schedule = [];
    try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch {}

    const newEntries = [];
    const dayMap = {};
    selectedDays.forEach((dow, i) => { dayMap[dayNames[dow]] = dow; });

    (plan.weeks || []).forEach(week => {
      const weekOffset = (week.weekNum - 1);
      (week.sessions || []).forEach(session => {
        const dow = dayMap[session.day];
        if (dow === undefined) return;

        const startDow = start.getDay();
        let dayOffset = (dow - startDow + 7) % 7 + weekOffset * 7;
        const date = new Date(start);
        date.setDate(date.getDate() + dayOffset);
        const dateStr = date.toISOString().slice(0, 10);

        newEntries.push({
          id: `life-${dateStr}-${sport}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          date: dateStr,
          type: sport === "running" ? "running" : sport === "cycling" ? "cycling" : "swimming",
          sessionName: session.title || "Session",
          source: "generated",
          level: level,
          details: `${session.type ? session.type.toUpperCase() + " | " : ""}${session.duration || ""}\n${session.description || ""}`.trim(),
          aiSession: {
            title: session.title,
            intervals: [{ name: session.title, duration: session.duration || "30 min", effort: _lifeEffortFromType(session.type), details: session.description || "" }]
          }
        });
      });
    });

    // Remove old life-training entries in the date range
    if (newEntries.length) {
      const minDate = newEntries[0].date;
      const maxDate = newEntries[newEntries.length - 1].date;
      schedule = schedule.filter(e => !(e.id?.startsWith("life-") && e.date >= minDate && e.date <= maxDate));
    }
    schedule.push(...newEntries);
    localStorage.setItem("workoutSchedule", JSON.stringify(schedule)); if (typeof DB !== 'undefined') DB.syncSchedule();

    if (msg) {
      msg.style.color = "var(--color-success)";
      msg.textContent = `Plan created! ${newEntries.length} sessions across ${weeks} weeks.`;
      setTimeout(() => { msg.textContent = ""; }, 5000);
    }

    // Render preview
    if (preview) {
      preview.innerHTML = (plan.weeks || []).map(week => `
        <div class="life-week-preview">
          <div class="life-week-header">Week ${week.weekNum}: ${_lifeEsc(week.theme || "")}</div>
          ${(week.sessions || []).map(s => `
            <div class="life-session-row">
              <span class="life-session-day">${_lifeEsc(s.day)}</span>
              <span class="life-session-title">${_lifeEsc(s.title)}</span>
              <span class="life-session-type life-session-type--${(s.type || "easy").toLowerCase()}">${_lifeEsc(s.type || "")}</span>
              <span class="life-session-dur">${_lifeEsc(s.duration || "")}</span>
            </div>
          `).join("")}
        </div>
      `).join("");
    }

    // Refresh calendar
    if (typeof renderCalendar === "function") renderCalendar();
    if (typeof selectDay === "function") selectDay(getTodayString());
    if (typeof renderTrainingInputs === "function") renderTrainingInputs();

  } catch (err) {
    if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Error: " + err.message; }
  }
}

function _lifeEffortFromType(type) {
  const map = { easy: "Easy", recovery: "Easy", tempo: "Moderate", threshold: "Moderate", interval: "Hard", long: "Moderate", speed: "Hard" };
  return map[(type || "").toLowerCase()] || "Moderate";
}

function _lifeEsc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
