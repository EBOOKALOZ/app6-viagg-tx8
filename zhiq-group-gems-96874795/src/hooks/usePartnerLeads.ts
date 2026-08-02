/**
 * usePartnerLeads — Comando Convênio: leads captados pelo botão
 * "Quero ser parceiro" (convenio_partner_leads). Uso exclusivo do
 * Super Painel do Gestor (RLS: leitura/gestão restrita a is_gestor_convenio()).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PartnerLeadStatus = "novo" | "em_analise" | "contatado" | "aprovado" | "recusado";

export interface PartnerLead {
  id: string;
  nome: string;
  instituicao: string | null;
  tipo_parceiro: string;
  cidade: string;
  estado: string;
  whatsapp: string;
  email: string | null;
  mensagem: string | null;
  status: PartnerLeadStatus;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

const QUERY_KEY = ["convenio-partner-leads"];

export function usePartnerLeads() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await (supabase.from("convenio_partner_leads") as any)
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
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (status) updates.status = status;
      if (observacoes !== undefined) updates.observacoes = observacoes;
      if (status) {
        updates.reviewed_by = user?.id ?? null;
        updates.reviewed_at = new Date().toISOString();
      }

      const { error } = await (supabase.from("convenio_partner_leads") as any)
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
