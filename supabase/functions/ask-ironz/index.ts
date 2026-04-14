// ask-ironz — Philosophy-aware AI coaching endpoint
// Pulls relevant philosophy modules from DB, builds a constrained prompt,
// and proxies to Claude with the philosophy as guardrails.
//
// Deploy: supabase functions deploy ask-ironz --no-verify-jwt
// Secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import faqData from "./faq.json" with { type: "json" };
import { KNOWLEDGE_BASE } from "./knowledge_base.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_REQUESTS_PER_DAY = 30;

// ── FAQ matching ─────────────────────────────────────────────────────────────
function findFaqMatch(question: string): { answer: string; faq_id: string; faq_question: string } | null {
  const q = question.toLowerCase().replace(/[?!.,'"]/g, "").trim();
  const qWords = q.split(/\s+/);

  let bestMatch: typeof faqData[number] | null = null;
  let bestScore = 0;

  for (const entry of faqData) {
    let score = 0;

    // Check keyword matches (each keyword phrase can be multi-word)
    for (const kw of entry.keywords) {
      if (q.includes(kw.toLowerCase())) {
        score += 3;
      }
    }

    // Check question similarity — count shared significant words
    const faqWords = entry.question.toLowerCase().replace(/[?!.,'"]/g, "").split(/\s+/)
      .filter((w: string) => w.length > 3); // skip short words
    const sharedWords = faqWords.filter((w: string) => qWords.includes(w));
    score += sharedWords.length;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  // Require a minimum score to avoid false matches
  if (bestMatch && bestScore >= 4) {
    return { answer: bestMatch.answer, faq_id: bestMatch.id, faq_question: bestMatch.question };
  }
  return null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Use service role client to verify user token
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({
        error: "Invalid or expired token",
        debug: authError?.message || "getUser returned no user",
      }, 401);
    }

    // ── 2. Rate limiting ─────────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    const { data: usage } = await supabase
      .from("ai_usage")
      .select("request_count")
      .eq("user_id", user.id)
      .eq("usage_date", today)
      .single();

    const currentCount = usage?.request_count || 0;
    if (currentCount >= MAX_REQUESTS_PER_DAY) {
      return jsonResponse({
        error: "Rate limit exceeded",
        message: `Limit of ${MAX_REQUESTS_PER_DAY} questions per day. Resets at midnight UTC.`,
        remaining: 0,
      }, 429);
    }

    await supabase.from("ai_usage").upsert(
      { user_id: user.id, usage_date: today, request_count: currentCount + 1 },
      { onConflict: "user_id,usage_date" }
    );

    // ── 3. Parse request ─────────────────────────────────────────────────
    const body = await req.json();

    // ── Passthrough mode: raw messages from callAI (NL input, etc.) ──────
    if (body.messages && Array.isArray(body.messages)) {
      const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!anthropicKey) return jsonResponse({ error: "AI service not configured" }, 503);

      const anthropicResponse = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: body.model || "claude-haiku-4-5-20251001",
          max_tokens: Math.min(body.max_tokens || 1024, 4096),
          messages: body.messages,
          ...(body.system && { system: body.system }),
        }),
      });

      const result = await anthropicResponse.json();
      const remaining = MAX_REQUESTS_PER_DAY - (currentCount + 1);

      return jsonResponse({ ...result, _remaining: remaining }, anthropicResponse.status);
    }

    // ── Question mode: philosophy-aware coaching ─────────────────────────
    const { question, profile, context } = body;

    if (!question || typeof question !== "string") {
      return jsonResponse({ error: "Missing 'question' or 'messages' field" }, 400);
    }

    // ── 3b. Check FAQ for a match (saves API calls) ─────────────────────
    // Skip FAQ for workout modification requests (need AI for actions)
    if (!context?.current_workout) {
      const faqMatch = findFaqMatch(question);
      if (faqMatch) {
        const remaining = MAX_REQUESTS_PER_DAY - (currentCount + 1);
        return jsonResponse({
          answer: faqMatch.answer,
          source: "faq",
          faq_id: faqMatch.faq_id,
          faq_question: faqMatch.faq_question,
          modules_used: [],
          modules_count: 0,
          _remaining: remaining,
        });
      }
    }

    // ── 4. Pull user profile from DB ─────────────────────────────────────
    const { data: dbProfile } = await supabase
      .from("profiles")
      .select("age, weight_lbs, height_inches, gender, primary_goal, fitness_level")
      .eq("id", user.id)
      .single();

    const userProfile = { ...dbProfile, ...(profile || {}) };

    // ── 5. Classify user and pull matching philosophy modules ─────────────
    const classifiers: Record<string, string | null> = {
      athlete_level: userProfile.fitness_level || null,
      goal: userProfile.primary_goal || null,
    };
    // Add sport if provided in context
    if (context?.sport) classifiers.sport_profile = context.sport;
    if (context?.race_type) classifiers.race_config = context.race_type;

    // Pull all active modules
    const { data: allModules } = await supabase
      .from("philosophy_modules")
      .select("id, category, title, principles, plan_rules, hard_constraints, nutrition_rules, training_adjustments, coaching_tone, rationale, priority")
      .eq("is_active", true);

    // Match modules by applies_when conditions
    const modules = (allModules || []).filter((m: any) => {
      if (classifiers[m.category]) return true;
      // Always include high-priority modules
      if (m.priority === "high") return true;
      return false;
    });

    // Sort: high priority first, then medium, then low
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    modules.sort((a: any, b: any) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));

    // Limit to top 15 modules to stay within prompt budget
    const selectedModules = modules.slice(0, 15);

    // ── 6. Log gap if no modules matched ─────────────────────────────────
    if (selectedModules.length === 0 && context?.sport) {
      await supabase.from("philosophy_gaps").upsert({
        dimension: "sport_profile",
        value: context.sport,
        user_count: 1,
        sample_user_profiles: [{ level: userProfile.fitness_level, goal: userProfile.primary_goal }],
      }, { onConflict: "dimension,value" }).then(async () => {
        // Increment count if already exists
        const { data: existing } = await supabase
          .from("philosophy_gaps")
          .select("id, user_count")
          .eq("dimension", "sport_profile")
          .eq("value", context.sport)
          .single();
        if (existing) {
          await supabase.from("philosophy_gaps")
            .update({ user_count: existing.user_count + 1, last_seen: new Date().toISOString() })
            .eq("id", existing.id);
        }
      });
    }

    // ── 7. Build constrained system prompt ───────────────────────────────
    const philosophyBlock = selectedModules.map((m: any) => {
      const parts = [`## ${m.title} (${m.id})`];
      if (m.principles?.length) parts.push(`Principles:\n- ${m.principles.join("\n- ")}`);
      if (m.plan_rules?.length) parts.push(`Plan Rules:\n- ${m.plan_rules.join("\n- ")}`);
      if (m.hard_constraints?.length) parts.push(`Hard Constraints (NEVER violate):\n- ${m.hard_constraints.join("\n- ")}`);
      if (m.nutrition_rules?.length) parts.push(`Nutrition:\n- ${m.nutrition_rules.join("\n- ")}`);
      if (m.training_adjustments?.length) parts.push(`Adjustments:\n- ${m.training_adjustments.join("\n- ")}`);
      if (m.rationale) parts.push(`Rationale: ${m.rationale}`);
      return parts.join("\n");
    }).join("\n\n");

    const systemPrompt = `You are IronZ Coach — a no-BS strength and endurance coach.

## Tone
- Be direct, confident, and concise. Short sentences. Actionable advice. Specific numbers when possible.
- No exclamation marks. No "Great question!" or "You're on track!" or motivational fluff.
- Talk like a coach talking to an athlete, not a chatbot talking to a customer.
- Never use phrases like "trust the process", "you've got this", "keep it up", "listen to your body", or "everyone is different".
- If you don't know something, say so. Don't hedge with vague encouragement.

## Request vs Question Detection
- A REQUEST is when the athlete tells you to DO something: "increase my bench weight", "swap X for Y", "add a set", "change my rest time". For requests, just CONFIRM the action. Do NOT add unsolicited advice, caveats, warnings, or coaching tips. One sentence confirmation is enough.
- A QUESTION is when the athlete ASKS something: "should I increase weight?", "what's better for hypertrophy?", "how much rest between sets?". For questions, give coaching advice.
- If in doubt, treat it as a request. The athlete knows what they want.

## Workout Modification Actions
When the athlete requests a change to their current workout and the message includes a "current_workout" context, return a JSON block with the modification action. The response format MUST be:

Your confirmation text here.

\`\`\`action
{"actions": [<action objects>]}
\`\`\`

Available action types:
- {"action":"update_exercise","target":"<exercise name (case-insensitive partial match)>","updates":{"weight":"<lbs>","sets":<n>,"reps":"<reps>","rest":"<rest>","name":"<new name>"}} — only include fields that change
- {"action":"swap_exercise","target":"<exercise name to remove>","replacement":{"name":"<new exercise>","sets":<n>,"reps":"<reps>","weight":"<lbs>","rest":"<rest>"}}
- {"action":"add_exercise","exercise":{"name":"<name>","sets":<n>,"reps":"<reps>","weight":"<lbs>","rest":"<rest>"},"position":"end"}
- {"action":"remove_exercise","target":"<exercise name>"}
- {"action":"update_cardio_interval","target":"<interval name>","updates":{"duration":"<dur>","effort":"<effort>","details":"<details>"}}

If no current_workout is provided, just give a text response. Never fabricate a workout context.

## Rules
1. The Knowledge Base below is your factual source of truth. If a question is covered there (race distances, leg times, gear guidance, nutrition targets, training hours, sport-specific facts), use that content — do NOT generate numbers, distances, or gear recommendations from scratch.
2. The Philosophy Modules below are your training-rules source of truth. ALWAYS follow them.
3. If a hard constraint exists, NEVER suggest anything that violates it.
4. NEVER contradict the Knowledge Base. If you don't see the answer there, say so rather than guessing.
5. Give specific, practical advice. Include sets, reps, durations, paces, or percentages where relevant.
6. Reference the athlete's profile when personalizing advice.
7. Never recommend medical treatments or diagnose injuries — tell them to see a professional.
8. Keep responses under 300 words. Shorter is better.

## Knowledge Base (facts — use verbatim when the question is covered)
${KNOWLEDGE_BASE}

## Athlete Profile
- Level: ${userProfile.fitness_level || "unknown"}
- Goal: ${userProfile.primary_goal || "general fitness"}
- Age: ${userProfile.age || "unknown"}
- Weight: ${userProfile.weight_lbs ? userProfile.weight_lbs + " lbs" : "unknown"}
${context?.sport ? `- Sport: ${context.sport}` : ""}
${context?.race_type ? `- Race: ${context.race_type}` : ""}

## Philosophy Modules (${selectedModules.length} loaded)
${philosophyBlock || "No specific modules matched. Provide general evidence-based fitness advice."}

${selectedModules.length > 0 ? `## Module IDs Used
${selectedModules.map((m: any) => m.id).join(", ")}` : ""}`;

    // ── 8. Call Claude ───────────────────────────────────────────────────
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) return jsonResponse({ error: "AI service not configured" }, 503);

    const anthropicResponse = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: body.model || "claude-haiku-4-5-20251001",
        max_tokens: Math.min(body.max_tokens || 1024, 4096),
        system: systemPrompt,
        messages: [{ role: "user", content: context?.current_workout
          ? `Current workout:\n${JSON.stringify(context.current_workout, null, 2)}\n\nAthlete says: ${question}`
          : question }],
      }),
    });

    const result = await anthropicResponse.json();
    const remaining = MAX_REQUESTS_PER_DAY - (currentCount + 1);

    // ── 9. Return response with metadata ─────────────────────────────────
    return jsonResponse({
      answer: result.content?.[0]?.text || null,
      model: result.model,
      modules_used: selectedModules.map((m: any) => m.id),
      modules_count: selectedModules.length,
      _remaining: remaining,
      _raw: result,
    });

  } catch (err) {
    return jsonResponse({ error: "Internal error", message: (err as Error).message }, 500);
  }
});
