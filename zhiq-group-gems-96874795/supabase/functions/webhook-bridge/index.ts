// supabase/functions/webhook-bridge/index.ts
Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: corsHeaders }
    );
  }

  try {
    const payload = await req.json();

    const res = await fetch("https://seu-webhook.com/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    return new Response(
      JSON.stringify({ forwarded: true, status: res.status }),
      { status: res.ok ? 200 : 502, headers: corsHeaders }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Webhook bridge failed" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
