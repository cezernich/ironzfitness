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
          placeholder="Ask IronZ anything training related\u2026"
          onkeydown="if(event.key==='Enter') submitNLInput('${dateStr}')" />
        <button class="nl-submit-btn" id="nl-submit-btn" onclick="submitNLInput('${dateStr}')">
          ${typeof ICONS !== "undefined" ? ICONS.sparkles : "AI"}
        </button>
      </div>
      <div id="nl-response" class="nl-response" style="display:none"></div>
    </div>`;
}

// ─── Question classifier (keyword-based) ──────────────────────────────────
// Assigns one of the ask_ironz_logs.category enum values based on keywords
// in the question. Ordered: the first matching category wins. Designed so
// the most specific topics (injury, race_strategy) are checked before
// broader ones (general_fitness). Unknown → "uncategorized".
const _NL_CATEGORY_RULES = [
  { category: "injury",         patterns: [/\b(injur(y|ies|ed)|pain|hurt|sore|strain|sprain|pull(ed)?|tendon|knee|shin|achill|plantar|IT[ -]?band|stress fracture|inflam|swell)\b/i] },
  { category: "recovery",       patterns: [/\b(recover|rest day|sleep|fatigue|burned? out|overtrain|deload|taper|off day|recovery)\b/i] },
  { category: "nutrition",      patterns: [/\b(nutrit|food|diet|eat|meal|calorie|macro|carb|protein|fat|fuel|snack|breakfast|lunch|dinner|grocery|recipe)\b/i] },
  { category: "hydration",      patterns: [/\b(hydrat|water|drink|electrolyte|sodium|thirst|fluid)\b/i] },
  { category: "race_strategy",  patterns: [/\b(race|pace|PR|personal record|goal time|BQ|podium|strategy|pacing|taper strategy|carb[- ]load|race day|race week|negative split|taper)\b/i] },
  { category: "technique",      patterns: [/\b(form|technique|cadence|stride|gait|breathing|drill|posture|footstrike|pull (mechanics|form)|swim stroke|catch|kick|aero position)\b/i] },
  { category: "equipment",      patterns: [/\b(shoes?|bike|gear|watch|garmin|strava|hrm|heart rate monitor|pedals?|cleats?|wetsuit|kit|trainer|treadmill)\b/i] },
  { category: "training_plan",  patterns: [/\b(plan|schedule|workout|session|intervals|tempo|long run|long ride|vo2|threshold|build|base|peak|week|day|mon|tue|wed|thu|fri|sat|sun|generate)\b/i] },
  { category: "app_help",       patterns: [/\b(how do I|how does|account|sign up|log in|login|password|settings|delete|export|import|sync|bug|crash|error)\b/i] },
  { category: "general_fitness", patterns: [/\b(strength|mobility|flexibility|stretch|warm[- ]up|cooldown|fitness|cardio)\b/i] },
];
function _classifyQuestion(text) {
  if (!text) return "uncategorized";
  for (const rule of _NL_CATEGORY_RULES) {
    if (rule.patterns.some(p => p.test(text))) return rule.category;
  }
  return "uncategorized";
}

// Insert a pending log row. Returns the row id (or null on failure / when
// the user isn't authenticated / when Supabase isn't wired up). Logging
// failures MUST NOT break the Ask IronZ flow — always returns gracefully.
async function _logAskIronZPending(questionText) {
  try {
    const client = window.supabaseClient;
    if (!client) return null;
    const { data: { session } } = await client.auth.getSession();
    if (!session || !session.user || !session.user.id) return null;
    const { data, error } = await client
      .from("ask_ironz_logs")
      .insert({
        user_id: session.user.id,
        question_text: questionText,
        category: _classifyQuestion(questionText),
        response_type: "pending",
      })
      .select("id")
      .single();
    if (error) { console.warn("[ask-ironz-log] insert failed:", error.message); return null; }
    return data && data.id;
  } catch (e) {
    console.warn("[ask-ironz-log] insert exception:", e && e.message);
    return null;
  }
}

// Finalize a log row after the response completes. Non-blocking: swallows
// any errors so analytics never break the UX.
async function _logAskIronZComplete(logId, payload) {
  if (!logId) return;
  try {
    const client = window.supabaseClient;
    if (!client) return;
    const update = {};
    if (payload.response_type)   update.response_type   = payload.response_type;
    if (payload.tokens_used != null)     update.tokens_used     = payload.tokens_used;
    if (payload.response_time_ms != null) update.response_time_ms = payload.response_time_ms;
    const { error } = await client.from("ask_ironz_logs").update(update).eq("id", logId);
    if (error) console.warn("[ask-ironz-log] update failed:", error.message);
  } catch (e) {
    console.warn("[ask-ironz-log] update exception:", e && e.message);
  }
}

// User clicked thumbs-up / thumbs-down. Called from the rendered response.
async function submitAskIronZFeedback(logId, helpful) {
  if (!logId) return;
  try {
    const client = window.supabaseClient;
    if (!client) return;
    const { error } = await client
      .from("ask_ironz_logs")
      .update({ helpful: !!helpful })
      .eq("id", logId);
    if (error) { console.warn("[ask-ironz-log] feedback failed:", error.message); return; }
    // Reflect state in the UI — replace the buttons with a small confirmation.
    const host = document.getElementById("nl-feedback-" + logId);
    if (host) {
      host.innerHTML = `<span class="nl-feedback-thanks">Thanks — feedback recorded.</span>`;
    }
  } catch (e) {
    console.warn("[ask-ironz-log] feedback exception:", e && e.message);
  }
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

  // Log every submission with a pending response_type. Final status gets
  // patched in after the response lands. Log id is threaded through the
  // render so the thumbs-up/down button can update the same row.
  const _startedAt = Date.now();
  const _logId = await _logAskIronZPending(text);

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
      }, dateStr, text, _logId);
      _logAskIronZComplete(_logId, {
        response_type: "faq_answer",
        tokens_used: 0,
        response_time_ms: Date.now() - _startedAt,
      });
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

## Hard capability boundary — do NOT pretend to mutate state

You cannot:
- Edit exercise weights, sets, or reps on a planned workout.
- Update the athlete's 1RM / strength benchmarks.
- Change training-zone thresholds (5K time, FTP, CSS).
- Add / remove / swap exercises in a planned session.
- Update preferred training days, daysPerWeek, or race dates.

When the user asks for any of the above, NEVER write a message that implies the change happened (do not say "updated to X", "bench max updated", "set your FTP to Y", etc.). Return a "message" action that directs them to the manual UI path instead:

- Exercise weight / sets / reps on today's workout → "Tap the exercise row on today's workout card to edit the weight, sets, or reps directly."
- 1RM / strength max (bench, squat, deadlift, OHP) → "Head to Profile → Training Zones → Strength Benchmarks to update your 1RMs. Planned working weights will recalculate from there."
- Training zones (5K time, FTP, CSS) → "Profile → Training Zones has the fields for 5K time, FTP, and CSS."
- Add / swap / remove an exercise → "Tap the ⋯ menu on the exercise row to swap or remove it, or use + at the bottom of the workout card to add a new one."
- Race date / daysPerWeek / training days → "Tap Edit on the Active Training Inputs card on the home screen to adjust race, days, or weekly template."

If the user's request is ambiguous between "the workout's weight" vs. "my 1RM max", default to the workout-card path — "update my bench from 175 to 180" almost always means the working weight on today's session, not the 1RM benchmark.

Restrictions are the one thing you CAN do — because the user separately presses Apply Changes before anything is persisted. Everything else is a read-only capability.

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
    _renderNLResponse(result, dateStr, text, _logId);

    // Classify final response type — if the LLM produced any restriction
    // action, treat as plan_generated (schedule change). Otherwise it's a
    // coaching_tip (advice only). tokens_used comes from Claude's usage
    // block surfaced by the Edge Function in data._raw.
    const hasRestriction = Array.isArray(result.actions) &&
      result.actions.some(a => a && a.type === "restriction");
    const usage = (data && data._raw && data._raw.usage) || {};
    const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
    _logAskIronZComplete(_logId, {
      response_type: hasRestriction ? "plan_generated" : "coaching_tip",
      tokens_used: totalTokens || null,
      response_time_ms: Date.now() - _startedAt,
    });

  } catch (err) {
    responseEl.innerHTML = `<div class="nl-error">Something went wrong: ${_escHtml(err.message || "Unknown error")}</div>`;
    // Log the failure so we can see what kinds of questions bounce.
    _logAskIronZComplete(_logId, {
      response_type: "couldnt_help",
      response_time_ms: Date.now() - _startedAt,
    });
  } finally {
    _nlProcessing = false;
    if (btn) btn.disabled = false;
  }
}

function _renderNLResponse(result, dateStr, originalInput, logId) {
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

  // Feedback row — only render when we have a log id (authenticated user
  // whose insert succeeded). Updates ask_ironz_logs.helpful via a scoped
  // RLS-protected UPDATE from the anon key.
  if (logId) {
    html += `
      <div class="nl-feedback" id="nl-feedback-${_escHtml(logId)}">
        <span class="nl-feedback-label">Was this helpful?</span>
        <button class="nl-feedback-btn nl-feedback-up"
                onclick="submitAskIronZFeedback('${_escHtml(logId)}', true)"
                title="Helpful" aria-label="Helpful">👍</button>
        <button class="nl-feedback-btn nl-feedback-down"
                onclick="submitAskIronZFeedback('${_escHtml(logId)}', false)"
                title="Not helpful" aria-label="Not helpful">👎</button>
      </div>
    `;
  }

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
