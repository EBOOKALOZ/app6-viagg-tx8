/**
 * useAIConfig — lê e grava a configuração ativa da IA (tabela ai_platform_config).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase }                               from "@/integrations/supabase/client";
import { invalidateRuntimeConfigCache }           from "@/lib/ai/runtimeConfig";
import { PROVIDER_CONFIGS }                       from "@/lib/ai/config";

export interface AIConfig {
  provider:    string;
  model:       string;
  base_url:    string;
  temperature: number;
  max_tokens:  number;
  notes?:      string | null;
  updated_at?: string;
}

const QK = ["ai-platform-config"] as const;

export function useAIConfig() {
  const qc = useQueryClient();

  const query = useQuery<AIConfig>({
    queryKey: QK,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ai_platform_config")
        .select("provider, model, base_url, temperature, max_tokens, notes, updated_at")
        .eq("singleton", true)
        .single();
      if (error) throw error;
      return data as AIConfig;
    },
  });

  const mutation = useMutation({
    mutationFn: async (cfg: Omit<AIConfig, "updated_at">) => {
      // Tenta via RPC (valida admin no servidor)
      const { error: rpcErr } = await (supabase as any).rpc("update_ai_platform_config", {
        p_provider:    cfg.provider,
        p_model:       cfg.model,
        p_base_url:    cfg.base_url,
        p_temperature: cfg.temperature,
        p_max_tokens:  cfg.max_tokens,
        p_notes:       cfg.notes ?? null,
      });

      // Fallback: update direto (funciona enquanto RLS de service_role cobrir)
      if (rpcErr) {
        const { error: updateErr } = await (supabase as any)
          .from("ai_platform_config")
          .update({
            provider:    cfg.provider,
            model:       cfg.model,
            base_url:    cfg.base_url,
            temperature: cfg.temperature,
            max_tokens:  cfg.max_tokens,
            notes:       cfg.notes ?? null,
            updated_at:  new Date().toISOString(),
          })
          .eq("singleton", true);
        if (updateErr) throw updateErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      invalidateRuntimeConfigCache(); // invalida cache in-memory do client.ts
    },
  });

  return {
    config:       query.data,
    isLoading:    query.isLoading,
    isError:      query.isError,
    refetch:      query.refetch,
    saveConfig:   mutation.mutateAsync,
    isSaving:     mutation.isPending,
    saveError:    mutation.error,
    providerInfo: query.data ? PROVIDER_CONFIGS[query.data.provider as keyof typeof PROVIDER_CONFIGS] : null,
  };
}
