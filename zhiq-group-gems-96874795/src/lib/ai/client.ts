/**
 * ai/client.ts — Cliente de IA para o frontend.
 *
 * Lê a configuração ativa de `ai_platform_config` via runtimeConfig (cache 60s).
 * A chave de API nunca transita pelo frontend — fica nos Secrets do Supabase.
 * Logging automático via logAIUsage().
 */

import { supabase }                              from "@/integrations/supabase/client";
import { logAIUsage, type AICallContext }        from "./usageLogger";
import { getRuntimeConfig }                      from "./runtimeConfig";

export async function chatCompletion(
  message:      string,
  model?:       string,
  systemPrompt?: string,
  logContext?:  AICallContext,
): Promise<string> {
  const t0 = Date.now();

  // Carrega configuração ativa do banco (cache 60s, fallback automático)
  const cfg = await getRuntimeConfig();
  const resolvedModel = model ?? cfg.model;

  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: message });

  let responseText = "";
  let status: "success" | "error" = "success";
  let errorMessage: string | undefined;

  try {
    const { data, error } = await supabase.functions.invoke("ai-chat", {
      body: {
        messages,
        model:       resolvedModel,
        temperature: cfg.temperature,
        max_tokens:  cfg.maxTokens,
      },
    });

    if (error) throw error;

    const choices = (data as { choices?: Array<{ message?: { content?: string } }> })?.choices;
    responseText = choices?.[0]?.message?.content ?? "";
    return responseText;
  } catch (err: unknown) {
    status = "error";
    errorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const elapsed = Date.now() - t0;
    logAIUsage({
      ...logContext,
      model:         resolvedModel,
      promptText:    message,
      responseText,
      status,
      processingMs:  elapsed,
      responseMs:    elapsed,
      errorMessage,
      operationType: logContext?.operationType ?? "chat",
    }).catch(() => {});
  }
}

export default { chatCompletion };
