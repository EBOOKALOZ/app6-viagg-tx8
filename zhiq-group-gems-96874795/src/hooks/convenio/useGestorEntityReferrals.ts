/**
 * useGestorEntityReferrals — Comando Convênio · Painel de Indicações.
 * Consulta e gestão das indicações de entidades (convenio_entity_referrals)
 * pelo Super Painel do Gestor. RLS: leitura/gestão restrita a
 * is_gestor_convenio(); toda alteração é gravada em convenio_audit_log pelo
 * trigger trg_convenio_audit (com _meta ip/origin/user_agent).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ConvenioEntityReferral, ConvenioEntityReferralUpdate } from "@/services/convenio/types";
import { listEntityAuditLog } from "@/services/convenio/auditLog";

export type EntityReferralStatus =
  | "novo"
  | "em_analise"
  | "contatado"
  | "documentacao_pendente"
  | "aprovado"
  | "recusado"
  | "convertido_convenio";

export type EntityReferral = ConvenioEntityReferral & { status: EntityReferralStatus };

export const ENTITY_REFERRAL_STATUS_LABEL: Record<EntityReferralStatus, string> = {
  novo: "Nova",
  em_analise: "Em análise",
  contatado: "Contato realizado",
  documentacao_pendente: "Documentação pendente",
  aprovado: "Aprovada",
  recusado: "Rejeitada",
  convertido_convenio: "Convertida em Convênio",
};

export const ENTITY_REFERRAL_STATUSES = Object.keys(
  ENTITY_REFERRAL_STATUS_LABEL
) as EntityReferralStatus[];

const QUERY_KEY = ["convenio", "entity-referrals"];

export function useEntityReferrals() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("convenio_entity_referrals")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EntityReferral[];
    },
  });
}

export function useUpdateEntityReferral() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id, status, observacoes,
    }: { id: string; status?: EntityReferralStatus; observacoes?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const updates: ConvenioEntityReferralUpdate = { updated_at: new Date().toISOString() };
      if (status) {
        updates.status = status;
        updates.reviewed_by = user?.id ?? null;
        updates.reviewed_at = new Date().toISOString();
      }
      if (observacoes !== undefined) updates.observacoes = observacoes;

      const { error } = await supabase
        .from("convenio_entity_referrals")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      // Prefixo cobre a lista e as trilhas de auditoria abertas
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Indicação atualizada com sucesso");
    },
    onError: (err) => {
      console.error("[useUpdateEntityReferral] error:", err);
      toast.error("Erro ao atualizar indicação");
    },
  });
}

export function useEntityReferralAudit(referralId: string | null) {
  return useQuery({
    queryKey: [...QUERY_KEY, "audit", referralId],
    queryFn: () => listEntityAuditLog("convenio_entity_referrals", referralId as string),
    enabled: !!referralId,
    staleTime: 15 * 1000,
  });
}
