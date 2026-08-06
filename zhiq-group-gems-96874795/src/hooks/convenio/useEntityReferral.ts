/**
 * useEntityReferral — Comando Convênio P1.
 * Envio REAL do formulário público "Indicar entidade" (/medprev) para
 * convenio_entity_referrals (RLS: INSERT público; leitura só do Gestor).
 * created_by/origem/source_ip são resolvidos no banco (DEFAULT auth.uid()
 * + trigger de captura de headers), cobrindo visitante e usuário autenticado.
 */
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ConvenioEntityReferralInsert } from "@/services/convenio/types";

export interface EntityReferralInput {
  nome_entidade: string;
  cidade: string;
  responsavel?: string | null;
  telefone?: string | null;
  motivo?: string | null;
}

export function useCreateEntityReferral() {
  return useMutation({
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    mutationFn: async (input: EntityReferralInput) => {
      const payload: ConvenioEntityReferralInsert = {
        nome_entidade: input.nome_entidade.trim(),
        cidade: input.cidade.trim(),
        responsavel: input.responsavel?.trim() || null,
        telefone: input.telefone ? input.telefone.replace(/\D/g, "") || null : null,
        motivo: input.motivo?.trim() || null,
        consentimento: true,
        status: "novo",
      };
      const { error } = await supabase.from("convenio_entity_referrals").insert(payload);
      if (error) throw error;
    },
  });
}
