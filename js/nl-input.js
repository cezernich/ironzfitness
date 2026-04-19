// nl-input.js — Natural Language Training Inputs

let _nlProcessing = false;
let _pendingNLRestrictions = null;
let _faqCache = null; // lazy-loaded FAQ; single fetch then in-memory.

// Load the canonical FAQ that also powers the Supabase ask-ironz function.
// Fetched lazily on first ask; cached for the rest of the session. Failures
// are swallowed so the LLM fallback still runs (offline / deploy issues).
async function _loadFaq() {
  if (_faqCache !== null) return _faqCache;
  try {
    const resp = await fetch("assets/faq.json", { cache: "force-cache" });
    if (!resp.ok) throw new Error("faq fetch " + resp.status);
    _faqCache = await resp.json();
  } catch (e) {
    _faqCache = [];
  }
  return _faqCache;
}

// Strip filler words so "how do I create an account" matches keyword
// "create account" (the user naturally inserts articles/prepositions the
// keyword list doesn't include). Applied to both the user text and the
// FAQ keyword so comparisons are symmetric.
const _NL_FILLERS = new Set([
  "a", "an", "the", "to", "of", "for", "on", "in", "at",
  "my", "me", "i", "is", "it", "this", "that", "do", "does",
  "can", "will", "how", "what", "why", "when", "where", "should",
]);
function _stripFillers(s) {
  return String(s || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w && !_NL_FILLERS.has(w))
    .join(" ");
}

// Score a single FAQ entry against the user's question text. Mirrors the
// backend matcher in supabase/functions/ask-ironz/index.ts: counts keyword
// substring hits plus a question-text fuzzy overlap bonus. Returns 0 when
// nothing meaningful matched so the caller can thresh-hold easily.
function _scoreFaqEntry(text, entry) {
  const q      = String(text || "").toLowerCase();
  const qClean = _stripFillers(q);
  if (!q) return 0;
  let score = 0;
  const keywords = Array.isArray(entry.keywords) ? entry.keywords : [];
  for (const kw of keywords) {
    const k      = String(kw || "").toLowerCase().trim();
    const kClean = _stripFillers(k);
    if (!k) continue;
    if (q.includes(k) || (kClean && qClean.includes(kClean))) {
      // Longer keywords get more weight — "generate plan" beats "plan".
      const weight = Math.max(kClean.length, k.length);
      score += Math.max(2, Math.ceil(weight / 4));
    }
  }
  // Question-text overlap: for each 4+ letter word shared between the user's
  // text and the FAQ question, add a small bonus.
  const faqQ = String(entry.question || "").toLowerCase();
  const words = Array.from(new Set(q.split(/[^a-z0-9]+/).filter(w => w.length >= 4)));
  for (const w of words) {
    if (faqQ.includes(w)) score += 1;
  }
  return score;
}

// Return the best-matching FAQ entry (or null) for the given user text.
// Only returns a match when the score clears MIN_CONFIDENT_SCORE so the
// LLM still handles open-ended questions that don't map to an FAQ.
async function _findFaqMatch(text) {
  const MIN_CONFIDENT_SCORE = 4; // ~2 keyword hits, or 1 long keyword + shared words
  const faq = await _loadFaq();
  if (!Array.isArray(faq) || !faq.length) return null;
  let best = null;
  let bestScore = 0;
  for (const entry of faq) {
    const s = _scoreFaqEntry(text, entry);
    if (s > bestScore) { best = entry; bestScore = s; }
  }
  return bestScore >= MIN_CONFIDENT_SCORE ? best : null;
}

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
    // FAQ short-circuit: when the question clearly maps to a documented
    // answer, return the canonical FAQ text instead of paying for an LLM
    // call that will hallucinate details (wrong disciplines, imagined
    // ratings, etc.). The LLM still handles anything the FAQ doesn't cover.
    const faqMatch = await _findFaqMatch(text);
    if (faqMatch) {
      _renderNLResponse({
        summary: faqMatch.question,
        actions: [{ type: "message", text: faqMatch.answer }],
        source: "faq",
      }, dateStr, text);
      return;
    }

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

    const systemPrompt = `You are IronZ — a no-BS strength and endurance coach built into a training app. The user is either asking a question or telling you about a change in their situation.

Tone: Direct, confident, concise. Short sentences. Specific numbers when possible. No exclamation marks. No "Great question!" or motivational fluff. No "trust the process", "you've got this", or "listen to your body". If you don't know, say so.

Respond with EXACTLY this JSON format (no markdown, no extra text):
{
  "summary": "2-4 word topic label, e.g. 'Run Form' or 'Knee Pain' or 'Schedule Change'",
  "actions": [
    {
      "type": "restriction",
      "date": "YYYY-MM-DD",
      "restriction": { "type": "injury|illness|travel|soreness|fatigue|rest|other", "note": "description", "action": "reduce|remove" }
    },
    {
      "type": "message",
      "text": "Your coaching advice"
    }
  ]
}

Action types:
- "restriction": Add a day restriction (reduce intensity or remove session). Use type from: injury, illness, travel, soreness, fatigue, rest, other. Use action "remove" only for serious injury/illness, otherwise "reduce". Only add restrictions if the user's message clearly warrants schedule changes.
- "message": Coaching advice. Always include at least one.

The summary field is a SHORT topic label (2-4 words), NOT a sentence. Examples: "Run Form", "Hip Soreness", "Travel Week", "Nutrition Timing".
Today is ${dateStr} (${new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" })}).
When referring to dates, use the correct day-of-week name from the schedule context.`;

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

  // Always show dismiss button
  if (restrictions.length === 0) {
    html += `<div class="nl-confirm-btns"><button class="nl-dismiss-btn" onclick="_dismissNLResponse()">Dismiss</button></div>`;
  }

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
