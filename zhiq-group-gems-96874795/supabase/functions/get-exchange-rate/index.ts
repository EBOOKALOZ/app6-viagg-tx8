import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const CACHE_TTL = 5 * 60 * 1000;
let cached: { data: Record<string, unknown> | null; ts: number } = { data: null, ts: 0 };

async function fetchAwesomeApi() {
  const res = await fetch(
    "https://economia.awesomeapi.com.br/json/last/USD-BRL",
    { headers: { "User-Agent": "Viagg/1.0" } }
  );
  if (!res.ok) throw new Error(`AwesomeAPI ${res.status}`);
  const json = await res.json();
  const item = json?.USDBRL;
  if (!item?.bid) throw new Error("Invalid AwesomeAPI format");

  const pct = parseFloat(item.pctChange) || 0;
  return {
    current: parseFloat(item.bid),
    open: parseFloat(item.open || item.bid),
    high: parseFloat(item.high),
    low: parseFloat(item.low),
    variationPercent: pct,
    direction: pct > 0 ? "up" : pct < 0 ? "down" : "neutral",
    timestamp: new Date().toISOString(),
  };
}

async function fetchOpenExchangeRates() {
  // Free tier endpoint — no key needed for latest rates
  const res = await fetch(
    "https://open.er-api.com/v6/latest/USD",
    { headers: { "User-Agent": "Viagg/1.0" } }
  );
  if (!res.ok) throw new Error(`ExchangeRate-API ${res.status}`);
  const json = await res.json();
  const brl = json?.rates?.BRL;
  if (!brl) throw new Error("No BRL rate found");

  return {
    current: brl,
    open: brl,
    high: brl,
    low: brl,
    variationPercent: 0,
    direction: "neutral" as const,
    timestamp: new Date().toISOString(),
  };
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("Origin"), {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  });
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Serve from memory cache
  if (cached.data && Date.now() - cached.ts < CACHE_TTL) {
    return new Response(JSON.stringify(cached.data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let data: Record<string, unknown> | null = null;

  // Try primary source
  try {
    data = await fetchAwesomeApi();
    console.log("[exchange-rate] AwesomeAPI OK:", data.current);
  } catch (err: unknown) {
    console.warn("[exchange-rate] AwesomeAPI failed:", (err as Error).message);
  }

  // Try fallback
  if (!data) {
    try {
      data = await fetchOpenExchangeRates();
      console.log("[exchange-rate] Fallback API OK:", data.current);
    } catch (err2: unknown) {
      console.warn("[exchange-rate] Fallback also failed:", (err2 as Error).message);
    }
  }

  if (data) {
    cached = { data, ts: Date.now() };
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Return stale cache if available
  if (cached.data) {
    return new Response(JSON.stringify({ ...cached.data, stale: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ error: "Failed to fetch exchange rate" }),
    {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
