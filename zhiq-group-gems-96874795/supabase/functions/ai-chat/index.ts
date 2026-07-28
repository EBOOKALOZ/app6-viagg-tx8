// Edge Function: ai-chat
// Proxy server-side para a API de IA ativa (OpenAI-compatible).
//
// Variáveis de ambiente obrigatórias (Supabase → Edge Functions → Secrets):
//   AI_API_KEY       chave do provedor ativo (sk-proj-...)
//   SUPABASE_URL     (injetado automaticamente)
//   SUPABASE_SERVICE_ROLE_KEY (injetado automaticamente)
//
// Opcionais (fallback para config DB quando ausentes):
//   AIAPI_BASE_URL   sobrescreve a base URL do banco
//   OPENAI_API_KEY   legado — fallback de AI_API_KEY
//   AIAPI_KEY        legado — fallback de OPENAI_API_KEY

import { serve }         from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient }  from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/* ── Cache de config em memória (evita query por request) ────────────────── */

interface CachedAIConfig {
  baseUrl:   string;
  model:     string;
  cachedAt:  number;
}

let _configCache: CachedAIConfig | null = null;
const CONFIG_TTL = 60_000; // 1 minuto

async function getDBConfig(): Promise<CachedAIConfig> {
  const now = Date.now();
  if (_configCache && now - _configCache.cachedAt < CONFIG_TTL) return _configCache;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { data } = await sb
      .from("ai_platform_config")
      .select("base_url, model")
      .eq("singleton", true)
      .single();

    if (data) {
      _configCache = { baseUrl: data.base_url, model: data.model, cachedAt: now };
    }
  } catch (e) {
    console.warn("[ai-chat] Não foi possível ler config do banco:", e);
  }

  if (!_configCache) {
    _configCache = {
      baseUrl:  "https://api.openai.com/v1",
      model:    "gpt-4o-mini",
      cachedAt: now,
    };
  }

  return _configCache;
}

/* ── Handler principal ───────────────────────────────────────────────────── */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      messages,
      model: bodyModel,
      max_tokens   = 1024,
      temperature  = 0.7,
    } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Campo 'messages' é obrigatório." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Base URL: env var (prioridade) → banco de dados
    const dbCfg  = await getDBConfig();
    const BASE_URL = Deno.env.get("AIAPI_BASE_URL") || dbCfg.baseUrl;
    const model    = bodyModel ?? dbCfg.model;

    // Chave de API: prioridade genérica → OpenAI → legado
    const API_KEY =
      Deno.env.get("AI_API_KEY") ||
      Deno.env.get("OPENAI_API_KEY") ||
      Deno.env.get("AIAPI_KEY");

    if (!API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, error: "Chave da IA não configurada no servidor." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ model, messages, max_tokens, temperature }),
    });

    const responseText = await upstream.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error("[ai-chat] resposta não-JSON:", responseText.slice(0, 300));
      return new Response(
        JSON.stringify({ ok: false, error: `Resposta inválida da API (${upstream.status}): ${responseText.slice(0, 120)}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!upstream.ok) {
      const errMsg = data?.error?.message || data?.msg || `Erro ${upstream.status} da API de IA`;
      console.error("[ai-chat] upstream error:", upstream.status, errMsg);
      return new Response(
        JSON.stringify({ ok: false, error: errMsg }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(data), {
      status:  200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[ai-chat] erro:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error.message || "Erro interno" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
