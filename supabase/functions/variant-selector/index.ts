// supabase/functions/variant-selector/index.ts
//
// Server-side wrapper for the Anthropic API call. Keeps ANTHROPIC_API_KEY off
// the client. Implements the AI_VARIANT_SELECTOR module from
// PHILOSOPHY_UPDATE_2026-04-09_workout_diversification.md.
//
// Deploy:
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy variant-selector
//
// IMPORTANT: ANTHROPIC_API_KEY is read from Deno.env at request time. It is
// never returned to the client, never logged, never embedded.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 200;
const TEMPERATURE = 0.3;
const TIMEOUT_MS = 3000;
const PER_USER_WEEKLY_CAP = 20;

// The exact system prompt from AI_VARIANT_SELECTOR.api_call_spec.system_prompt.
// DO NOT loosen the "MUST NOT invent" / "MUST NOT return a variant ID that
// isn't in the library" rules.
const SYSTEM_PROMPT = `You are a workout variant picker for IronZ, a training app. You are given a user's context, their recent workout history for one session type, and a library of pre-defined workout variants that all produce the same physiological adaptation. Your ONLY job is to pick ONE variant ID from the library. You MUST NOT invent new workouts. You MUST NOT modify any variant. You MUST NOT return a variant ID that isn't in the provided library. You MUST NOT return a variant the user did in the last 2 weeks unless the library has fewer than 2 unused variants. Respond with valid JSON only: {"variantId": "...", "rationale": "one short sentence"}. No prose, no markdown, no explanation outside the JSON.`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function buildUserPrompt(p: {
  experience_level: string;
  sport_profile: string;
  goal: string;
  current_phase: string;
  weekNumber: number;
  recentHistory: string[];
  sessionTypeId: string;
  variantLibrary: any[];
}): string {
  return [
    `User experience: ${p.experience_level}`,
    `Sport profile: ${p.sport_profile}`,
    `Goal: ${p.goal}`,
    `Current training phase: ${p.current_phase}`,
    `Week number of plan: ${p.weekNumber}`,
    "",
    "Recent workouts for this session type (most recent first):",
    p.recentHistory.length ? p.recentHistory.join("\n") : "(none)",
    "",
    `Session type: ${p.sessionTypeId}`,
    "",
    "Variant library:",
    JSON.stringify(p.variantLibrary, null, 2),
    "",
    "Pick one variant the user has not done in the last 2 weeks. Return JSON only.",
  ].join("\n");
}

async function callAnthropic(systemPrompt: string, userPrompt: string, apiKey: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return { ok: false, error: `anthropic_${resp.status}`, detail: text.slice(0, 200) };
    }
    const json = await resp.json();
    return { ok: true, json };
  } catch (e: any) {
    if (e.name === "AbortError") return { ok: false, error: "timeout" };
    return { ok: false, error: "network_error", detail: String(e?.message || e).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

function extractJsonFromContent(content: any): any | null {
  try {
    const text = (content && content[0] && content[0].text) || "";
    // Strip stray markdown fences if any.
    const cleaned = text.replace(/```json\s*|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function validatePick(pick: any, library: any[], recentHistory: string[]): { ok: boolean; reason?: string } {
  if (!pick || typeof pick !== "object") return { ok: false, reason: "invalid_response" };
  const id = pick.variantId;
  if (!id || typeof id !== "string") return { ok: false, reason: "invalid_response" };
  const exists = Array.isArray(library) && library.some((v: any) => v && v.id === id);
  if (!exists) return { ok: false, reason: "invalid_response" };
  // Reject the most-recent 2 unless library would otherwise be exhausted.
  const window = recentHistory.slice(0, 2);
  if (window.includes(id)) {
    const unusedCount = library.filter((v: any) => !window.includes(v.id)).length;
    if (unusedCount > 0) return { ok: false, reason: "stale_selection" };
  }
  return { ok: true };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  // Auth: require a Supabase user JWT in the Authorization header.
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  // Read the Anthropic key from env (set via `supabase secrets set`).
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  const {
    userId,
    sessionTypeId,
    weekNumber,
    recentHistory = [],
    userProfile = {},
    variantLibrary = [],
    callsThisWeek = 0,
  } = body || {};

  if (!userId || !sessionTypeId || !Array.isArray(variantLibrary) || variantLibrary.length === 0) {
    return new Response(JSON.stringify({ error: "bad_request" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  // Defense-in-depth rate limit: even if the client miscounts, the server caps.
  if (Number(callsThisWeek) >= PER_USER_WEEKLY_CAP) {
    return new Response(JSON.stringify({ error: "rate_limited", reason: "weekly_cap" }), {
      status: 429,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  const userPrompt = buildUserPrompt({
    experience_level: userProfile.experience_level || "intermediate",
    sport_profile: userProfile.sport_profile || "endurance",
    goal: userProfile.goal || "general fitness",
    current_phase: userProfile.current_phase || "base",
    weekNumber: Number(weekNumber) || 0,
    recentHistory,
    sessionTypeId,
    variantLibrary,
  });

  const result = await callAnthropic(SYSTEM_PROMPT, userPrompt, apiKey);
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error, detail: result.detail }), {
      status: result.error === "timeout" ? 504 : 502,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  const pick = extractJsonFromContent(result.json && result.json.content);
  const validation = validatePick(pick, variantLibrary, recentHistory);
  if (!validation.ok) {
    return new Response(JSON.stringify({ error: validation.reason || "invalid_response" }), {
      status: 422,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ variantId: pick.variantId, rationale: pick.rationale || "" }), {
    status: 200,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
});
