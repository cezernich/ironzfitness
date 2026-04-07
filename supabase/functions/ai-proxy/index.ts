// ai-proxy — Supabase Edge Function
// Proxies requests to the Anthropic Claude API with auth + rate limiting.
// Deploy: supabase functions deploy ai-proxy
// Set secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_REQUESTS_PER_DAY = 20;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ── 1. Verify auth ────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the JWT from the client
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Rate limiting ──────────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);

    // Get or create today's usage record
    const { data: usage } = await supabase
      .from("ai_usage")
      .select("request_count")
      .eq("user_id", user.id)
      .eq("usage_date", today)
      .single();

    const currentCount = usage?.request_count || 0;

    if (currentCount >= MAX_REQUESTS_PER_DAY) {
      return new Response(JSON.stringify({
        error: "Rate limit exceeded",
        message: `You've reached the limit of ${MAX_REQUESTS_PER_DAY} AI requests per day. Resets at midnight UTC.`,
        remaining: 0,
      }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Increment usage count (upsert)
    await supabase.from("ai_usage").upsert(
      { user_id: user.id, usage_date: today, request_count: currentCount + 1 },
      { onConflict: "user_id,usage_date" }
    );

    // ── 3. Proxy to Anthropic ─────────────────────────────────────────────
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // Validate required fields
    if (!body.messages || !Array.isArray(body.messages)) {
      return new Response(JSON.stringify({ error: "Invalid request: messages array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cap max_tokens to prevent abuse
    const maxTokens = Math.min(body.max_tokens || 1024, 4096);

    const anthropicResponse = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: body.model || "claude-haiku-4-5-20251001",
        max_tokens: maxTokens,
        messages: body.messages,
        ...(body.system && { system: body.system }),
      }),
    });

    const result = await anthropicResponse.json();
    const remaining = MAX_REQUESTS_PER_DAY - (currentCount + 1);

    return new Response(JSON.stringify({ ...result, _remaining: remaining }), {
      status: anthropicResponse.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-RateLimit-Remaining": String(remaining),
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal error", message: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
