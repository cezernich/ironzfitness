// stripe-webhook — Supabase Edge Function
//
// Receives Stripe webhook events and syncs the user's subscription state
// into public.subscriptions using the service role client (bypasses RLS).
//
// Deploy:
//   supabase functions deploy stripe-webhook --no-verify-jwt
//
// Required secrets (set these in the Supabase dashboard or via CLI; NEVER
// commit the values into this file):
//   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by
// the Edge Functions runtime — no need to set them.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.5.0?target=denonext";

// Stripe docs: Deno / Supabase Edge Functions require the Fetch HTTP client
// and the SubtleCrypto provider for webhook signature verification.
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "stripe-signature, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function planFromInterval(interval: string | undefined): "monthly" | "annual" | null {
  if (interval === "month") return "monthly";
  if (interval === "year")  return "annual";
  return null;
}

function isoOrNull(secondsFromEpoch: number | null | undefined): string | null {
  if (!secondsFromEpoch) return null;
  return new Date(secondsFromEpoch * 1000).toISOString();
}

// Upsert one subscription row keyed by user_id. Called from multiple event
// handlers with partial patches — field values set to `undefined` are
// filtered out so a "status-only" update doesn't clobber existing columns.
async function upsertSubscription(row: {
  user_id: string;
  plan?: "monthly" | "annual" | null;
  status?: "active" | "past_due" | "canceled" | "expired";
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
}) {
  const payload: Record<string, unknown> = { user_id: row.user_id };
  for (const [k, v] of Object.entries(row)) {
    if (v !== undefined) payload[k] = v;
  }

  const { error } = await supabase
    .from("subscriptions")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    console.error("[stripe-webhook] upsert error:", error.message, payload);
    throw error;
  }
}

// Resolve the auth user_id for a Stripe subscription we already have on file.
// Used by customer.subscription.* events which don't carry client_reference_id.
async function userIdFromStripeSubscription(stripeSubId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_subscription_id", stripeSubId)
    .maybeSingle();
  if (error) {
    console.warn("[stripe-webhook] user lookup error:", error.message);
    return null;
  }
  return data?.user_id ?? null;
}

/* ─── Event handlers ───────────────────────────────────────────────────── */

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const userId = session.client_reference_id;
  if (!userId) {
    console.warn("[stripe-webhook] checkout.session.completed missing client_reference_id", session.id);
    return;
  }

  // Subscription mode only — one-time payments don't populate `subscription`.
  const subId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id;
  if (!subId) {
    console.warn("[stripe-webhook] no subscription on checkout session", session.id);
    return;
  }

  const sub = await stripe.subscriptions.retrieve(subId, { expand: ["items.data.price"] });
  const priceInterval = sub.items.data[0]?.price?.recurring?.interval;
  const plan = planFromInterval(priceInterval);

  await upsertSubscription({
    user_id: userId,
    plan: plan,
    status: "active",
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
    stripe_subscription_id: sub.id,
    current_period_start: isoOrNull(sub.current_period_start),
    current_period_end:   isoOrNull(sub.current_period_end),
  });
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const userId = await userIdFromStripeSubscription(sub.id);
  if (!userId) {
    console.warn("[stripe-webhook] subscription.updated — no local row for", sub.id);
    return;
  }

  // Map Stripe status → our enum. `active` and `trialing` both count as live
  // premium so the user doesn't lose access mid-trial. Everything else maps
  // to past_due/canceled/expired.
  let status: "active" | "past_due" | "canceled" | "expired" = "active";
  if (sub.status === "active" || sub.status === "trialing") status = "active";
  else if (sub.status === "past_due" || sub.status === "unpaid") status = "past_due";
  else if (sub.status === "canceled") status = "canceled";
  else status = "expired";

  const priceInterval = sub.items.data[0]?.price?.recurring?.interval;
  const plan = planFromInterval(priceInterval);

  await upsertSubscription({
    user_id: userId,
    plan: plan ?? undefined,
    status,
    current_period_start: isoOrNull(sub.current_period_start),
    current_period_end:   isoOrNull(sub.current_period_end),
  });
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const userId = await userIdFromStripeSubscription(sub.id);
  if (!userId) return;
  await upsertSubscription({
    user_id: userId,
    status: "canceled",
    current_period_end: isoOrNull(sub.current_period_end),
  });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subId = typeof invoice.subscription === "string"
    ? invoice.subscription
    : invoice.subscription?.id;
  if (!subId) return;
  const userId = await userIdFromStripeSubscription(subId);
  if (!userId) return;
  await upsertSubscription({
    user_id: userId,
    status: "past_due",
  });
}

/* ─── Request entry point ──────────────────────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400, headers: corsHeaders });
  }
  if (!WEBHOOK_SECRET) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set");
    return new Response("Server misconfigured", { status: 500, headers: corsHeaders });
  }

  // Read the raw body for signature verification — must not be pre-parsed.
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      WEBHOOK_SECRET,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.warn("[stripe-webhook] signature verification failed:", (err as Error).message);
    return new Response(`Webhook signature verification failed: ${(err as Error).message}`, {
      status: 400,
      headers: corsHeaders,
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        // Acknowledge other events so Stripe doesn't retry them.
        console.log("[stripe-webhook] ignored event:", event.type);
    }
  } catch (err) {
    console.error("[stripe-webhook] handler error for", event.type, (err as Error).message);
    // Return 500 so Stripe retries — the error is on our side, not theirs.
    return new Response("Handler error", { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
