/**
 * ORION AI Gateway — cliente oficial do front (ORION-AI-00).
 *
 * REGRA: nenhum módulo chama provedor de IA (OpenAI/Anthropic/...)
 * diretamente. Todo consumo passa pela edge orion-ai-gateway, que
 * resolve modelo por módulo, aplica cache/rate limit, faz retry e
 * fallback entre provedores e grava auditoria imutável.
 *
 * A chave de API NUNCA existe aqui: vive só nos secrets das edges.
 */
import { supabase } from "@/integrations/supabase/client";

export interface OrionAiResposta {
  ok: boolean;
  texto?: string;
  provider?: string;
  model?: string;
  tokens_in?: number;
  tokens_out?: number;
  custo_estimado?: number;
  cache?: boolean;
  error?: string;
  fallback?: "manual_review";
}

async function invocar(body: Record<string, unknown>): Promise<OrionAiResposta> {
  const { data, error } = await supabase.functions.invoke("orion-ai-gateway", { body });
  if (error) return { ok: false, error: error.message, fallback: "manual_review" };
  return data as OrionAiResposta;
}

/** Texto livre (conversa, resposta longa). */
export const orionAiText = (module: string, prompt: string, opts?: { system?: string; model?: string; maxTokens?: number }) =>
  invocar({ module, task: "text", prompt, system: opts?.system, model: opts?.model, max_tokens: opts?.maxTokens });

/** Moderação de conteúdo (retorno esperado: JSON de veredito). */
export const orionAiModeration = (module: string, prompt: string, opts?: { system?: string; model?: string }) =>
  invocar({ module, task: "moderation", prompt, system: opts?.system, model: opts?.model });

/** Classificação em categorias. */
export const orionAiClassification = (module: string, prompt: string, opts?: { system?: string; model?: string }) =>
  invocar({ module, task: "classification", prompt, system: opts?.system, model: opts?.model });

/** Resumo de texto. */
export const orionAiSummary = (module: string, prompt: string, opts?: { model?: string; maxTokens?: number }) =>
  invocar({ module, task: "summary", prompt, system: "Resuma o conteúdo em pt-BR, fiel e conciso.", model: opts?.model, max_tokens: opts?.maxTokens });

/** Geração de conteúdo (textos de divulgação, títulos etc.). */
export const orionAiGenerate = (module: string, prompt: string, opts?: { system?: string; model?: string; maxTokens?: number; cache?: boolean }) =>
  invocar({ module, task: "generate", prompt, system: opts?.system, model: opts?.model, max_tokens: opts?.maxTokens, cache: opts?.cache });

/** Health check do gateway (status das chaves por provedor, sem custo). */
export const orionAiHealth = () => invocar({ action: "health" });
