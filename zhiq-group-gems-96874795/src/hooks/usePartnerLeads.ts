/**
 * usePartnerLeads — Comando Convênio: leads captados pelo botão
 * "Quero ser parceiro" (convenio_partner_leads). Uso exclusivo do
 * Super Painel do Gestor (RLS: leitura/gestão restrita a is_gestor_convenio()).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ConvenioPartnerLead, ConvenioPartnerLeadUpdate } from "@/services/convenio/types";

export type PartnerLeadStatus = "novo" | "em_analise" | "contatado" | "aprovado" | "recusado";

export type PartnerLead = ConvenioPartnerLead & { status: PartnerLeadStatus };

const QUERY_KEY = ["convenio", "partner-leads"];

export function usePartnerLeads() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("convenio_partner_leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PartnerLead[];
    },
  });
}

export function useUpdatePartnerLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id, status, observacoes,
    }: { id: string; status?: PartnerLeadStatus; observacoes?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const updates: ConvenioPartnerLeadUpdate = { updated_at: new Date().toISOString() };
      if (status) updates.status = status;
      if (observacoes !== undefined) updates.observacoes = observacoes;
      if (status) {
        updates.reviewed_by = user?.id ?? null;
        updates.reviewed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("convenio_partner_leads")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Lead atualizado com sucesso");
    },
    onError: (err) => {
      console.error("[useUpdatePartnerLead] error:", err);
      toast.error("Erro ao atualizar lead");
    },
  });
}
