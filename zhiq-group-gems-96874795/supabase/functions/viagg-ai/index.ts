import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

// Prioridade: AI_API_KEY (genérico) → OPENAI_API_KEY → GLM_API_KEY (legado)
const GLM_API_KEY = Deno.env.get("AI_API_KEY") || Deno.env.get("OPENAI_API_KEY") || Deno.env.get("GLM_API_KEY") || "";
const GLM_ENDPOINT = "https://api.openai.com/v1/chat/completions";

const SISTEMA_BASE = `Você é a IA Viagg-TX8, assistente inteligente da plataforma VIAGG de entregas por motoboy.
Você auxilia clientes, visitantes, motoboys e administradores.
Seja sempre prestativo, objetivo e use linguagem natural e amigável em português brasileiro.
Nunca mencione "GLM", "Zhipu" ou qualquer outra tecnologia de IA — você é exclusivamente a IA Viagg-TX8.
Quando não souber a resposta, seja honesto e sugira contato com o suporte da VIAGG.
Use emojis moderadamente para tornar a conversa mais amigável.`;

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("Origin"), {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  });
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { messages, context, maxTokens } = await req.json();

    // Monta mensagens com contexto do sistema
    const systemContent = context
      ? `${SISTEMA_BASE}\n\nContexto adicional:\n${context}`
      : SISTEMA_BASE;

    const finalMessages = [
      { role: "system", content: systemContent },
      ...(messages ?? []),
    ];

    const glmRes = await fetch(GLM_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: finalMessages,
        max_tokens: maxTokens ?? 600,
        temperature: 0.7,
      }),
    });

    if (!glmRes.ok) {
      const errText = await glmRes.text();
      throw new Error(`GLM error ${glmRes.status}: ${errText}`);
    }

    const data = await glmRes.json();
    const content =
      data.choices?.[0]?.message?.content ??
      "Desculpe, não consegui processar sua solicitação no momento. Tente novamente.";

    const usage = data.usage ?? {};

    return new Response(JSON.stringify({ content, usage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[viagg-ai]", err);
    return new Response(
      JSON.stringify({
        content:
          "⚠️ A IA Viagg-TX8 está temporariamente indisponível. Por favor, tente novamente em instantes.",
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 200, // retorna 200 com mensagem de erro amigável para o usuário
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
