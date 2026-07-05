import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ExecutionRecord {
  rendered_prompt: string;
  model_used: string;
  max_tokens: number;
  temperature: number;
  response_format: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const t0 = Date.now();
  let executionId: string | null = null;

  // Service-role client for DB reads + ai_engine_complete()
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    executionId = body.execution_id as string;

    if (!executionId) {
      throw new Error("execution_id é obrigatório");
    }

    // ── 1. Busca config resolvida no log (pending) ──────────────
    // O ai_engine_call() já interpolou as variáveis e salvou tudo aqui.
    // Buscar do DB garante que o frontend não pode alterar o prompt.
    const { data: exec, error: execError } = await supabase
      .from("ai_execution_log")
      .select("rendered_prompt, model_used, max_tokens, temperature, response_format")
      .eq("id", executionId)
      .eq("status", "pending")
      .single<ExecutionRecord>();

    if (execError || !exec) {
      throw new Error(
        execError?.message ?? "Execução não encontrada ou já processada"
      );
    }

    const {
      rendered_prompt,
      model_used,
      max_tokens,
      temperature,
      response_format,
    } = exec;

    // ── 2. Chama Anthropic Claude API ───────────────────────────
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurado");

    const anthropicBody: Record<string, unknown> = {
      model: model_used,
      max_tokens: max_tokens ?? 500,
      temperature: temperature ?? 0.7,
      messages: [{ role: "user", content: rendered_prompt }],
    };

    const anthropicResp = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(anthropicBody),
      }
    );

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      throw new Error(
        `Anthropic API ${anthropicResp.status}: ${errText}`
      );
    }

    const anthropicData = await anthropicResp.json();
    const rawText: string = anthropicData.content?.[0]?.text ?? "";
    const tokensInput: number = anthropicData.usage?.input_tokens ?? 0;
    const tokensOutput: number = anthropicData.usage?.output_tokens ?? 0;
    const modelUsed: string = anthropicData.model ?? model_used;
    const latencyMs = Date.now() - t0;

    // ── 3. Parse da resposta ────────────────────────────────────
    let parsedResponse: Record<string, unknown>;
    if (response_format === "json") {
      try {
        // Remove blocos de código markdown se presentes
        const jsonContent = rawText
          .replace(/^```(?:json)?\s*/m, "")
          .replace(/\s*```\s*$/m, "")
          .trim();
        parsedResponse = JSON.parse(jsonContent);
      } catch {
        parsedResponse = { raw: rawText };
      }
    } else {
      parsedResponse = { text: rawText };
    }

    // ── 4. Registra conclusão no log ────────────────────────────
    const { error: completeError } = await supabase.rpc(
      "ai_engine_complete",
      {
        p_execution_id:  executionId,
        p_response:      parsedResponse,
        p_model_used:    modelUsed,
        p_tokens_input:  tokensInput,
        p_tokens_output: tokensOutput,
        p_latency_ms:    latencyMs,
        p_error:         null,
      }
    );

    if (completeError) {
      console.error("ai_engine_complete error:", completeError.message);
      // Não aborta — o resultado já foi obtido; log é best-effort
    }

    return new Response(
      JSON.stringify({
        execution_id:  executionId,
        data:          parsedResponse,
        model_used:    modelUsed,
        tokens_input:  tokensInput,
        tokens_output: tokensOutput,
        latency_ms:    latencyMs,
      }),
      {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const latencyMs = Date.now() - t0;

    // Tenta registrar erro no log
    if (executionId) {
      try {
        await supabase.rpc("ai_engine_complete", {
          p_execution_id: executionId,
          p_error:        errorMessage,
          p_latency_ms:   latencyMs,
        });
      } catch {
        // Best-effort — não propaga erro do logging
      }
    }

    return new Response(
      JSON.stringify({ error: errorMessage, execution_id: executionId }),
      {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
