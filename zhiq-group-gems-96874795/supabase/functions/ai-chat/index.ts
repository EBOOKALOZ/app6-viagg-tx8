// Edge Function: ai-chat
// Proxy server-side para o AIAPI.world. Mantém a chave secreta no servidor
// e exige JWT do Supabase (verify_jwt = true no config.toml).
//
// O frontend chama:
//   supabase.functions.invoke('ai-chat', { body: { messages, model } })
//
// Variáveis de ambiente necessárias:
//   AIAPI_BASE_URL  (ex.: https://api.aiapi.world/v1)
//   AIAPI_KEY       (sk-...)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messages, model = "glm-4-plus", max_tokens = 1024, temperature = 0.7 } =
      await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Campo 'messages' é obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const BASE_URL = Deno.env.get("AIAPI_BASE_URL") || "https://api.aiapi.world/v1";
    const API_KEY = Deno.env.get("AIAPI_KEY");

    if (!API_KEY) {
      console.error("[ai-chat] AIAPI_KEY não configurada no servidor.");
      return new Response(
        JSON.stringify({ error: "Chave da IA não configurada no servidor." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ model, messages, max_tokens, temperature }),
    });

    const data = await upstream.json();

    return new Response(JSON.stringify(data), {
      status: upstream.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[ai-chat] erro:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
