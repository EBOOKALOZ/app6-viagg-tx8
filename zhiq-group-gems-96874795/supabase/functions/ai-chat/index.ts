// Edge Function: ai-chat
// Suporta chaves ZhipuAI/z.ai (formato id.secret → JWT) e chaves Bearer simples.
//
// Variáveis de ambiente:
//   AIAPI_BASE_URL  (ex.: https://api.z.ai/v1)
//   AIAPI_KEY       (ex.: eebc698...wYU2GC... — formato ZhipuAI id.secret)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Gera JWT para autenticação ZhipuAI (formato id.secret) */
async function buildZhipuToken(apiKey: string): Promise<string> {
  const dotIdx = apiKey.indexOf(".");
  const keyId = apiKey.slice(0, dotIdx);
  const keySecret = apiKey.slice(dotIdx + 1);

  const now = Date.now();
  const toB64url = (buf: ArrayBuffer) =>
    btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const enc = new TextEncoder();
  const header = toB64url(enc.encode(JSON.stringify({ alg: "HS256", sign_type: "SIGN" })).buffer);
  const payload = toB64url(enc.encode(JSON.stringify({
    api_key: keyId,
    exp: now + 3_600_000,
    timestamp: now,
  })).buffer);

  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(keySecret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${toB64url(sig)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messages, model = "glm-4-plus", max_tokens = 1024, temperature = 0.7 } =
      await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Campo 'messages' é obrigatório." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const BASE_URL = Deno.env.get("AIAPI_BASE_URL") || "https://api.z.ai/v1";
    const API_KEY = Deno.env.get("AIAPI_KEY");

    if (!API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "Chave da IA não configurada no servidor." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Chaves ZhipuAI têm formato "id.secret" — gera JWT. Senão, usa Bearer direto.
    const token = API_KEY.includes(".")
      ? await buildZhipuToken(API_KEY)
      : API_KEY;

    const upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ model, messages, max_tokens, temperature }),
    });

    const responseText = await upstream.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error("[ai-chat] resposta não-JSON:", responseText.slice(0, 300));
      return new Response(
        JSON.stringify({ ok: false, error: `URL da API inválida (${upstream.status}). Resposta: ${responseText.slice(0, 120)}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!upstream.ok) {
      const errMsg = data?.error?.message || data?.msg || data?.error || `Erro ${upstream.status} da API de IA`;
      console.error("[ai-chat] upstream error:", upstream.status, errMsg);
      return new Response(
        JSON.stringify({ ok: false, error: errMsg }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[ai-chat] erro:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message || "Erro interno" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
