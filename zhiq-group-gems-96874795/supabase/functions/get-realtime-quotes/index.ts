import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

// Ativos suportados hoje. Novos ativos (Iene, Franco Suíço, Peso Argentino,
// Ouro, Prata, Ethereum, Solana, Ibovespa, Nasdaq, Dow Jones, CDI, Selic,
// IPCA) entram apenas adicionando uma entrada aqui — sem mudança estrutural.
const AWESOMEAPI_PAIRS = ["USD-BRL", "EUR-BRL", "GBP-BRL", "BTC-BRL"];

interface Quote {
  code: string;
  name: string;
  current: number;
  open: number;
  high: number;
  low: number;
  variationPercent: number;
  direction: "up" | "down" | "neutral";
}

interface QuotesPayload {
  quotes: Quote[];
  series24h: Array<{ timestamp: string; value: number }>;
  timestamp: string;
  source: string;
  stale?: boolean;
}

const CACHE_TTL = 60 * 1000; // 60s — acompanha o intervalo de atualização do card
let cached: { data: QuotesPayload | null; ts: number } = { data: null, ts: 0 };

const NAMES: Record<string, string> = {
  USD: "Dólar Comercial",
  EUR: "Euro",
  GBP: "Libra Esterlina",
  BTC: "Bitcoin",
};

async function fetchAwesomeApiLast(): Promise<Quote[]> {
  const res = await fetch(
    `https://economia.awesomeapi.com.br/json/last/${AWESOMEAPI_PAIRS.join(",")}`,
    { headers: { "User-Agent": "Viagg/1.0" } }
  );
  if (!res.ok) throw new Error(`AwesomeAPI ${res.status}`);
  const json = await res.json();

  return AWESOMEAPI_PAIRS.map((pair) => {
    const key = pair.replace("-", "");
    const item = json?.[key];
    if (!item?.bid) throw new Error(`Missing quote for ${pair}`);
    const pct = parseFloat(item.pctChange) || 0;
    const code = pair.split("-")[0];
    return {
      code,
      name: NAMES[code] ?? code,
      current: parseFloat(item.bid),
      open: parseFloat(item.open || item.bid),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      variationPercent: pct,
      direction: pct > 0 ? "up" : pct < 0 ? "down" : "neutral",
    } satisfies Quote;
  });
}

async function fetchAwesomeApiSeries24h(): Promise<Array<{ timestamp: string; value: number }>> {
  // 24 pontos horários do USD-BRL para o gráfico do modal
  const res = await fetch(
    "https://economia.awesomeapi.com.br/json/daily/USD-BRL/24",
    { headers: { "User-Agent": "Viagg/1.0" } }
  );
  if (!res.ok) throw new Error(`AwesomeAPI series ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json)) throw new Error("Invalid series format");

  return json
    .map((item: Record<string, string>) => ({
      timestamp: new Date(parseInt(item.timestamp, 10) * 1000).toISOString(),
      value: parseFloat(item.bid),
    }))
    .reverse();
}

async function fetchFallbackQuotes(): Promise<Quote[]> {
  // Fonte alternativa sem chave — só cobre USD/EUR/GBP, sem variação/série
  const res = await fetch("https://open.er-api.com/v6/latest/USD", {
    headers: { "User-Agent": "Viagg/1.0" },
  });
  if (!res.ok) throw new Error(`ExchangeRate-API ${res.status}`);
  const json = await res.json();
  const brl = json?.rates?.BRL;
  const eurRate = json?.rates?.EUR;
  const gbpRate = json?.rates?.GBP;
  if (!brl) throw new Error("No BRL rate found");

  const quotes: Quote[] = [
    { code: "USD", name: NAMES.USD, current: brl, open: brl, high: brl, low: brl, variationPercent: 0, direction: "neutral" },
  ];
  if (eurRate) {
    const eurBrl = brl / eurRate;
    quotes.push({ code: "EUR", name: NAMES.EUR, current: eurBrl, open: eurBrl, high: eurBrl, low: eurBrl, variationPercent: 0, direction: "neutral" });
  }
  if (gbpRate) {
    const gbpBrl = brl / gbpRate;
    quotes.push({ code: "GBP", name: NAMES.GBP, current: gbpBrl, open: gbpBrl, high: gbpBrl, low: gbpBrl, variationPercent: 0, direction: "neutral" });
  }
  return quotes;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("Origin"), {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  });
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (cached.data && Date.now() - cached.ts < CACHE_TTL) {
    return new Response(JSON.stringify(cached.data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: QuotesPayload | null = null;

  try {
    const [quotes, series24h] = await Promise.all([
      fetchAwesomeApiLast(),
      fetchAwesomeApiSeries24h(),
    ]);
    payload = {
      quotes,
      series24h,
      timestamp: new Date().toISOString(),
      source: "AwesomeAPI",
    };
    console.log("[realtime-quotes] AwesomeAPI OK:", quotes.map((q) => q.code).join(","));
  } catch (err) {
    console.warn("[realtime-quotes] AwesomeAPI failed:", (err as Error).message);
  }

  if (!payload) {
    try {
      const quotes = await fetchFallbackQuotes();
      payload = {
        quotes,
        series24h: [],
        timestamp: new Date().toISOString(),
        source: "ExchangeRate-API (fallback)",
      };
      console.log("[realtime-quotes] Fallback OK");
    } catch (err2) {
      console.warn("[realtime-quotes] Fallback also failed:", (err2 as Error).message);
    }
  }

  if (payload) {
    cached = { data: payload, ts: Date.now() };
    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (cached.data) {
    return new Response(JSON.stringify({ ...cached.data, stale: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ error: "Failed to fetch realtime quotes" }),
    { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
