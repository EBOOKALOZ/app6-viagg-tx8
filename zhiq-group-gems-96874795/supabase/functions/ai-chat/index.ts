// Edge Function: ai-chat
// Proxy server-side para o AIAPI.world. Mantém a chave secreta no servidor
// (Deno.env.get) — nunca exposta no bundle do frontend.
//
// Rota: POST /functions/v1/ai-chat
// Body: { messages: [{role, content}], model?, max_tokens?, temperature? }
// Header obrigatório: Authorization: Bearer <JWT do Supabase> (verify_jwt = true)
//
// Variáveis de ambiente necessárias (Supabase → Edge Functions → Secrets):
//   AIAPI_BASE_URL  (ex.: https://api.aiapi.world/v1)
//   AIAPI_KEY       (sk-...)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_MODEL = "glm-5.2";
const MAX_TOKENS_LIMIT = 2000;
const MAX_MESSAGES = 30;

interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const BASE_URL = Deno.env.get("AIAPI_BASE_URL") || "https://api.aiapi.world/v1";
  const API_KEY = Deno.env.get("AIAPI_KEY");

  if (!API_KEY) {
    console.error("[ai-chat] AIAPI_KEY não configurada no servidor.");
    return new Response(
      JSON.stringify({ error: "Serviço de IA indisponível." }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let body: {
    messages?: ChatMsg[];
    model?: string;
    max_tokens?: number;
    temperature?: number;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "body inválido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages obrigatório" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (messages.length > MAX_MESSAGES) {
    return new Response(
      JSON.stringify({ error: `Máximo de ${MAX_MESSAGES} mensagens excedido.` }),
      { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Sanitiza cada mensagem: role válida + conteúdo texto não vazio.
  const allowedRoles = new Set(["system", "user", "assistant"]);
  const sanitized: ChatMsg[] = [];
  for (const m of messages) {
    if (!m || typeof m.content !== "string") continue;
    const role = allowedRoles.has(m.role) ? m.role : "user";
    const content = m.content.slice(0, 4000); // limite por mensagem
    if (content.trim().length === 0) continue;
    sanitized.push({ role, content });
  }
  if (sanitized.length === 0) {
    return new Response(JSON.stringify({ error: "nenhuma mensagem válida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const model = typeof body.model === "string" && body.model.length > 0
    ? body.model.slice(0, 80)
    : DEFAULT_MODEL;
  const max_tokens = Math.min(
    Math.max(Number(body.max_tokens) || 800, 1),
    MAX_TOKENS_LIMIT
  );
  const temperature = Math.min(
    Math.max(Number(body.temperature) || 0.7, 0),
    2
  );

  try {
    const upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ model, messages: sanitized, max_tokens, temperature }),
    });

    const text = await upstream.text();
    let data: unknown = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { _raw: text };
    }

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: "Falha no provedor de IA." }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    console.error("[ai-chat] erro:", message);
    return new Response(
      JSON.stringify({ error: "Erro ao contatar provedor de IA." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
