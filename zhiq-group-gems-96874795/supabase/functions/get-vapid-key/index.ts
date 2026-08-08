import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'), {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  });
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const vapidKey = Deno.env.get('FIREBASE_VAPID_KEY');

  if (!vapidKey) {
    return new Response(
      JSON.stringify({ error: 'VAPID key not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ vapidKey }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
