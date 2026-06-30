/**
 * ai/usageLogger.ts — Registro silencioso de todas as chamadas à IA.
 *
 * • Usado internamente por chatCompletion() em client.ts.
 * • Nunca lança exceção — erros de log são descartados.
 * • O nome da tabela está em AI_USAGE_TABLE (config.ts) — renomear lá quando
 *   a migration `supabase/migrations/rename_ai_usage_table.sql` for executada.
 *
 * Migration SQL (rodar quando pronto):
 *   ALTER TABLE glm_usage_log RENAME TO ai_usage_log;
 *   -- Após renomear: altere AI_USAGE_TABLE em config.ts para "ai_usage_log"
 */

import { supabase }        from "@/integrations/supabase/client";
import { AI_USAGE_TABLE }  from "./config";

/* ── Tipos públicos ───────────────────────────────────────────────────────── */

export interface AICallContext {
  userId?:       string;
  userEmail?:    string;
  userName?:     string;
  profileType?:  string;
  module?:       string;
  page?:         string;
  feature?:      string;
  operationType?: string;
  sessionId?:    string;
  requestId?:    string;
  category?:     string;
}

export interface AIUsagePayload extends AICallContext {
  model:         string;
  promptText:    string;
  promptSummary?: string;
  responseText?: string;
  processingMs?: number;
  responseMs?:   number;
  status:        "success" | "error" | "timeout" | "pending";
  errorMessage?: string;
  metadata?:     Record<string, unknown>;
}

// Aliases legados — não remover (código existente importa estes nomes)
export type GlmCallContext   = AICallContext;
export type GlmUsagePayload  = AIUsagePayload;

/* ── Helpers internos ─────────────────────────────────────────────────────── */

function detectModuleFromPath(path?: string): string {
  const p = path ?? (typeof window !== "undefined" ? window.location.pathname : "");
  if (p.includes("/ai-analytics") || p.includes("/glm-analytics")) return "admin_ai_analytics";
  if (p.includes("/ai")           || p.includes("/glm"))          return "admin_ai";
  if (p.includes("/imoveis"))    return "imoveis";
  if (p.includes("/veiculos"))   return "veiculos";
  if (p.includes("/servicos"))   return "servicos";
  if (p.includes("/fretes"))     return "fretes";
  if (p.includes("/viagens"))    return "viagens";
  if (p.includes("/marketplace") || p.includes("/mercado")) return "mercado";
  if (p.includes("/postador"))   return "postador";
  if (p.includes("/grupos"))     return "grupos";
  if (p.includes("/wallet")      || p.includes("/carteira"))  return "carteira";
  if (p.includes("/financeiro")  || p.includes("/finance"))   return "financeiro";
  if (p.includes("/promotion")   || p.includes("/promocao"))  return "promocoes";
  if (p.includes("/admin"))      return "admin";
  if (p.includes("/anunciante")) return "anunciante";
  return "plataforma";
}

function detectPage(): string {
  return typeof window !== "undefined" ? window.location.pathname : "desconhecido";
}

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let sid = sessionStorage.getItem("ai_session_id") ?? sessionStorage.getItem("glm_session_id");
  if (!sid) {
    sid = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem("ai_session_id", sid);
  }
  return sid;
}

/* ── Função principal ─────────────────────────────────────────────────────── */

/**
 * logAIUsage — insere registro de uso no banco.
 * Fire-and-forget: nunca lança exceção.
 */
export async function logAIUsage(payload: AIUsagePayload): Promise<void> {
  try {
    const page      = payload.page      ?? detectPage();
    const module_   = payload.module    ?? detectModuleFromPath(page);
    const sessionId = payload.sessionId ?? getOrCreateSessionId();
    const promptSummary = payload.promptSummary
      ?? payload.promptText.slice(0, 300).replace(/\s+/g, " ").trim();

    await (supabase as any).from(AI_USAGE_TABLE).insert({
      user_id:        payload.userId        ?? null,
      user_email:     payload.userEmail     ?? null,
      user_name:      payload.userName      ?? null,
      profile_type:   payload.profileType   ?? null,
      module:         module_,
      page,
      feature:        payload.feature       ?? null,
      operation_type: payload.operationType ?? "chat",
      status:         payload.status,
      processing_ms:  payload.processingMs  ?? null,
      response_ms:    payload.responseMs    ?? null,
      model:          payload.model,
      session_id:     sessionId,
      request_id:     payload.requestId     ?? null,
      prompt_text:    payload.promptText,
      prompt_summary: promptSummary,
      prompt_category: payload.category     ?? null,
      response_text:  payload.responseText  ?? null,
      error_message:  payload.errorMessage  ?? null,
      metadata:       payload.metadata      ?? null,
    });
  } catch {
    // silencioso
  }
}

/** Alias legado — não remover */
export const logGlmUsage = logAIUsage;
