// Staging-only adapter. Never deploy this over a production function.
// Explicitly unavailable is preferable to fabricated AI/provider results.
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Content-Type': 'application/json',
};
Deno.serve((request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  return new Response(JSON.stringify({
    error: 'STAGING_INTEGRATION_DISABLED',
    message: 'This external integration is disabled in staging. No live provider credentials are configured.',
    environment: 'staging',
  }), { status: 503, headers });
});
