/**
 * ai/runtimeConfig.ts
 * Carrega a configuração ativa da IA a partir da tabela `ai_platform_config`.
 * Cache em memória de 60 segundos. Fallback para config.ts se DB indisponível.
 *
 * Usado por chatCompletion() — transparente para todos os callsites.
 */

import { supabase }    from "@/integrations/supabase/client";
import { AI_MODEL, AI_BASE_URL } from "./config";

export interface RuntimeAIConfig {
  provider:    string;
  model:       string;
  baseUrl:     string;
  temperature: number;
  maxTokens:   number;
  fetchedAt:   number;
}

const FALLBACK: RuntimeAIConfig = {
  provider:    "openai",
  model:       AI_MODEL,
  baseUrl:     AI_BASE_URL,
  temperature: 0.7,
  maxTokens:   1024,
  fetchedAt:   0,
};

const CACHE_TTL_MS = 60_000; // 1 minuto

let _cache: RuntimeAIConfig | null = null;
let _inflight: Promise<RuntimeAIConfig> | null = null;

/** Retorna a configuração ativa (com cache). */
export async function getRuntimeConfig(): Promise<RuntimeAIConfig> {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) return _cache;

  // Dedup: se já há uma requisição em voo, aguarda a mesma
  if (_inflight) return _inflight;

  _inflight = (async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("ai_platform_config")
        .select("provider, model, base_url, temperature, max_tokens")
        .eq("singleton", true)
        .single();

      if (error || !data) throw error;

      _cache = {
        provider:    data.provider,
        model:       data.model,
        baseUrl:     data.base_url,
        temperature: Number(data.temperature),
        maxTokens:   Number(data.max_tokens),
        fetchedAt:   Date.now(),
      };
      return _cache;
    } catch {
      // Fallback silencioso — não interrompe o fluxo
      _cache = { ...FALLBACK, fetchedAt: Date.now() };
      return _cache;
    } finally {
      _inflight = null;
    }
  })();

  return _inflight;
}

/** Invalida o cache local (chamar após salvar nova config). */
export function invalidateRuntimeConfigCache(): void {
  _cache = null;
}
