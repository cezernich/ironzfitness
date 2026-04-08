// nl-input.js — Natural Language Training Inputs

let _nlProcessing = false;
let _pendingNLRestrictions = null;

function renderNLInput(dateStr) {
  const container = document.getElementById("nl-input-container");
  if (!container) return;

  container.innerHTML = `
    <div class="nl-input-bar">
      <div class="nl-input-wrap">
        <input type="text" id="nl-input-field" class="nl-input-field"
          placeholder="Ask IronZ anything or tell us what's going on\u2026"
          onkeydown="if(event.key==='Enter') submitNLInput('${dateStr}')" />
        <button class="nl-submit-btn" id="nl-submit-btn" onclick="submitNLInput('${dateStr}')">
          ${typeof ICONS !== "undefined" ? ICONS.sparkles : "AI"}
        </button>
      </div>
      <div id="nl-response" class="nl-response" style="display:none"></div>
    </div>`;
}

async function submitNLInput(dateStr) {
  if (_nlProcessing) return;
  const input = document.getElementById("nl-input-field");
  const responseEl = document.getElementById("nl-response");
  const btn = document.getElementById("nl-submit-btn");
  if (!input || !responseEl) return;

  const text = input.value.trim();
  if (!text) { input.focus(); return; }

  _nlProcessing = true;
  if (btn) btn.disabled = true;
  responseEl.style.display = "";
  responseEl.innerHTML = `<div class="nl-loading">Thinking\u2026</div>`;

  try {
    // Gather context
    const profile = _safeJSON("profile") || {};
    const schedule = (_safeJSON("workoutSchedule") || []).filter(w => w.date >= dateStr).slice(0, 14);
    const plan = (_safeJSON("trainingPlan") || []).filter(p => p.date >= dateStr).slice(0, 14);
    const restrictions = _safeJSON("dayRestrictions") || {};
    const ratings = _safeJSON("workoutRatings") || {};
    const recentRatings = Object.values(ratings)
      .filter(r => r.date)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5)
      .map(r => ({ rating: r.rating, note: r.note }));

    const context = {
      today: dateStr,
      userProfile: { level: profile.fitnessLevel || "intermediate", goals: profile.goals || "" },
      upcomingSchedule: schedule.map(w => ({ date: w.date, day: new Date(w.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" }), name: w.sessionName, type: w.type || w.discipline })),
      upcomingPlan: plan.map(p => ({ date: p.date, day: new Date(p.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" }), name: p.sessionName, discipline: p.discipline, load: p.load })),
      currentRestrictions: restrictions,
      recentRatings,
    };

    const systemPrompt = `You are IronZ, an AI fitness coach built into a training app. The user is telling you about a change in their situation — injury, schedule conflict, fatigue, travel, equipment limitation, etc.

Given their message and the context below, respond with EXACTLY this JSON format (no markdown, no extra text):
{
  "summary": "Brief 1-sentence summary of what you understood",
  "actions": [
    {
      "type": "restriction",
      "date": "YYYY-MM-DD",
      "restriction": { "type": "injury|illness|travel|soreness|fatigue|rest|other", "note": "description", "action": "reduce|remove" }
    },
    {
      "type": "message",
      "text": "Advice or encouragement for the user"
    }
  ]
}

Action types:
- "restriction": Add a day restriction (reduce intensity or remove session). Use type from: injury, illness, travel, soreness, fatigue, rest, other. Use action "remove" only for serious injury/illness, otherwise "reduce".
- "message": A coaching message/advice for the user.

You can include multiple actions. Always include at least one "message" action with helpful advice.
Be conservative — only add restrictions if the user's message clearly warrants it. For vague fatigue, suggest reducing rather than removing.
Today is ${dateStr} (${new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}).
When referring to dates, use the correct day-of-week name. Do NOT guess day names — derive them from the dates in the schedule context.`;

    const data = await callAI({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: `User says: "${text}"\n\nContext: ${JSON.stringify(context)}`
      }]
    });

    const rawText = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const result = JSON.parse(rawText.replace(/```json|```/g, "").trim());

    // Show the response with confirmation
    _renderNLResponse(result, dateStr, text);

  } catch (err) {
    responseEl.innerHTML = `<div class="nl-error">Something went wrong: ${_escHtml(err.message || "Unknown error")}</div>`;
  } finally {
    _nlProcessing = false;
    if (btn) btn.disabled = false;
  }
}

function _renderNLResponse(result, dateStr, originalInput) {
  const responseEl = document.getElementById("nl-response");
  if (!responseEl) return;

  let html = `<div class="nl-result">`;
  html += `<div class="nl-summary">${_escHtml(result.summary || "")}</div>`;

  const restrictions = (result.actions || []).filter(a => a.type === "restriction");
  const messages = (result.actions || []).filter(a => a.type === "message");

  if (restrictions.length > 0) {
    _pendingNLRestrictions = restrictions;
    html += `<div class="nl-actions-preview">`;
    restrictions.forEach((a, i) => {
      const r = a.restriction || {};
      const actionLabel = r.action === "remove" ? "Remove session" : "Reduce intensity";
      html += `<div class="nl-action-item">
        <span class="nl-action-date">${_escHtml(a.date || "")}</span>
        <span class="nl-action-type">${_escHtml(r.type || "adjustment")}</span>
        <span class="nl-action-effect">${actionLabel}</span>
      </div>`;
    });
    html += `</div>`;
    html += `<div class="nl-confirm-btns">
      <button class="nl-apply-btn" onclick="_applyPendingNLActions('${dateStr}')">Apply Changes</button>
      <button class="nl-dismiss-btn" onclick="_dismissNLResponse()">Dismiss</button>
    </div>`;
  }

  messages.forEach(m => {
    html += `<div class="nl-coach-msg">${_escHtml(m.text || "")}</div>`;
  });

  html += `</div>`;
  responseEl.innerHTML = html;

  // Clear input
  const input = document.getElementById("nl-input-field");
  if (input) input.value = "";
}

function _applyPendingNLActions(dateStr) {
  if (!_pendingNLRestrictions) return;
  _applyNLActions(_pendingNLRestrictions, dateStr);
  _pendingNLRestrictions = null;
}

function _applyNLActions(restrictions, dateStr) {
  let dayRestrictions = {};
  try { dayRestrictions = JSON.parse(localStorage.getItem("dayRestrictions")) || {}; } catch {}

  restrictions.forEach(a => {
    if (a.date && a.restriction) {
      dayRestrictions[a.date] = {
        type: a.restriction.type || "other",
        note: a.restriction.note || "",
        action: a.restriction.action || "reduce",
        createdAt: new Date().toISOString(),
      };
    }
  });

  localStorage.setItem("dayRestrictions", JSON.stringify(dayRestrictions)); if (typeof DB !== 'undefined') DB.syncKey('dayRestrictions');

  // Refresh views
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof renderDayDetail === "function") renderDayDetail(dateStr);

  // Show confirmation
  const responseEl = document.getElementById("nl-response");
  if (responseEl) {
    responseEl.innerHTML = `<div class="nl-applied">${typeof ICONS !== "undefined" ? ICONS.check : ""} Changes applied to your schedule.</div>`;
    setTimeout(() => { responseEl.style.display = "none"; }, 3000);
  }
}

function _dismissNLResponse() {
  const responseEl = document.getElementById("nl-response");
  if (responseEl) responseEl.style.display = "none";
}

function _safeJSON(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function _escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function _escAttrJson(str) {
  return str.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
}
