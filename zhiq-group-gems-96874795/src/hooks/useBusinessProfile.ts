/**
 * useBusinessProfile — perfil de negócio por módulo (advertiser_module_profiles).
 *
 * Mesmo contrato do modelo lojista, com uma garantia a mais: TODA gravação é
 * VERIFICADA — depois do RPC relemos a linha e conferimos que o dado persistiu
 * (evita o "salvei mas não refletiu" silencioso). Escrita só via RPC:
 *   upsert_business_profile / set_business_appearance.
 */
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { sanitizeAppearance, type StoreAppearance } from "@/lib/store-theme";
import type { BusinessModuleDef } from "@/lib/business-modules";

export interface BusinessProfileRow {
  id: string;
  user_id: string;
  module_key: string;
  display_name: string | null;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  cover_url: string | null;
  opening_hours: string | null;
  whatsapp: string | null;
  phone: string | null;
  instagram: string | null;
  facebook: string | null;
  site: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  appearance: unknown;
  updated_at: string | null;
}

async function readRow(userId: string, moduleKey: string): Promise<BusinessProfileRow | null> {
  const { data } = await (supabase.from("advertiser_module_profiles") as unknown)
    .select("*")
    .eq("user_id", userId)
    .eq("module_key", moduleKey)
    .maybeSingle();
  return (data as BusinessProfileRow) ?? null;
}

export function useBusinessProfile(module: BusinessModuleDef) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["business-profile", module.key, user?.id],
    enabled: !!user?.id,
    refetchOnMount: "always",
    staleTime: 0,
    queryFn: () => readRow(user!.id, module.key),
  });

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["business-profile", module.key] });
    await queryClient.invalidateQueries({ queryKey: ["business-module-profile"] });
    await queryClient.invalidateQueries({ queryKey: ["advertiser-summary-info"] });
  }, [queryClient, module.key]);

  /** Salva campos de identidade; resolve com a linha persistida (verificada). */
  const saveProfile = useCallback(
    async (patch: Partial<BusinessProfileRow>): Promise<BusinessProfileRow> => {
      if (!user?.id) throw new Error("Sessão expirada — entre novamente.");
      const { data, error } = await (supabase.rpc as unknown)("upsert_business_profile", {
        p_module: module.key,
        p_patch: patch,
      });
      if (error) throw new Error(error.message || "Erro ao salvar o perfil.");
      if (!(data as unknown)?.success) {
        throw new Error((data as unknown)?.error === "not_authenticated"
          ? "Sessão expirada — entre novamente."
          : `Erro ao salvar: ${(data as unknown)?.error || "verifique se a migration foi aplicada."}`);
      }
      // Verificação: a linha relida precisa refletir o patch enviado.
      const row = await readRow(user.id, module.key);
      if (!row) throw new Error("Salvou mas não foi possível confirmar a gravação.");
      await invalidate();
      return row;
    },
    [user?.id, module.key, invalidate],
  );

  /** Salva a aparência (null = restaurar padrão) e CONFIRMA que persistiu. */
  const saveAppearance = useCallback(
    async (appearance: StoreAppearance | null): Promise<void> => {
      if (!user?.id) throw new Error("Sessão expirada — entre novamente.");
      const payload = appearance ? sanitizeAppearance(appearance) : null;
      const { data, error } = await (supabase.rpc as unknown)("set_business_appearance", {
        p_module: module.key,
        p_appearance: payload,
      });
      if (error) throw new Error(error.message || "Erro ao salvar a aparência.");
      if (!(data as unknown)?.success) {
        throw new Error(`Erro ao salvar: ${(data as unknown)?.error || "verifique se a migration foi aplicada."}`);
      }
      const row = await readRow(user.id, module.key);
      const persisted = JSON.stringify(sanitizeAppearance(row?.appearance));
      if (persisted !== JSON.stringify(payload)) {
        throw new Error("A aparência não persistiu no banco — nada foi alterado. Verifique a migration/permissões.");
      }
      await invalidate();
    },
    [user?.id, module.key, invalidate],
  );

  return {
    profile: query.data ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
    saveProfile,
    saveAppearance,
  };
}
