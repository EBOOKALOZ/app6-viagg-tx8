import { supabase } from "@/integrations/supabase/client";
import type { ConvenioAccountability, ConvenioCampaign, ConvenioDonation } from "./types";

export interface PublicMedPrevStats {
  totalArrecadado: number;
  totalDestinado: number;
  conveniosBeneficiados: number;
  doacoesConfirmadas: number;
}

/** Últimas doações confirmadas exibidas no feed público — apenas vitrine. */
const RECENT_DONATIONS_LIMIT = 20;

export async function getPublicCampaigns(): Promise<ConvenioCampaign[]> {
  const { data, error } = await supabase
    .from("convenio_campaigns")
    .select("*")
    .in("status", ["ativa", "encerrada"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Feed das últimas doações confirmadas (limitado por design — é uma vitrine).
 * Totais e contagens NUNCA saem daqui: vêm de getPublicMedPrevStats(), que
 * agrega todos os registros no banco.
 */
export async function getPublicDonations(): Promise<ConvenioDonation[]> {
  const { data, error } = await supabase
    .from("convenio_donations")
    .select("*")
    .eq("status", "confirmada")
    .order("created_at", { ascending: false })
    .limit(RECENT_DONATIONS_LIMIT);
  if (error) throw error;
  return data ?? [];
}

export async function getPublicAccountability(): Promise<ConvenioAccountability[]> {
  const { data, error } = await supabase
    .from("convenio_accountability")
    .select("*")
    .eq("status", "publicada")
    .order("published_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Estatísticas públicas do MedPrev agregadas 100% no banco (RPC
 * convenio_public_stats, SECURITY DEFINER, somente números): considera TODOS
 * os registros válidos, escala independente do volume e não depende do feed
 * paginado acima.
 */
export async function getPublicMedPrevStats(): Promise<PublicMedPrevStats> {
  const { data, error } = await supabase.rpc("convenio_public_stats");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    totalArrecadado: Number(row?.total_arrecadado ?? 0),
    totalDestinado: Number(row?.total_destinado ?? 0),
    conveniosBeneficiados: Number(row?.convenios_beneficiados ?? 0),
    doacoesConfirmadas: Number(row?.doacoes_confirmadas ?? 0),
  };
}
