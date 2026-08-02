import { supabase } from "@/integrations/supabase/client";
import type { ConvenioAccountability, ConvenioCampaign, ConvenioDonation } from "./types";

export interface PublicMedPrevStats {
  totalArrecadado: number;
  totalDestinado: number;
  conveniosBeneficiados: number;
  doacoesConfirmadas: number;
}

export async function getPublicCampaigns(): Promise<ConvenioCampaign[]> {
  const { data, error } = await supabase
    .from("convenio_campaigns")
    .select("*")
    .in("status", ["ativa", "encerrada"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPublicDonations(): Promise<ConvenioDonation[]> {
  const { data, error } = await supabase
    .from("convenio_donations")
    .select("*")
    .eq("status", "confirmada")
    .order("created_at", { ascending: false })
    .limit(20);
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

export async function getPublicMedPrevStats(): Promise<PublicMedPrevStats> {
  const [campaigns, donations] = await Promise.all([getPublicCampaigns(), getPublicDonations()]);

  const totalArrecadado = donations.reduce((sum, d) => sum + Number(d.amount), 0);
  const totalDestinado = campaigns.reduce((sum, c) => sum + Number(c.raised_amount), 0);
  const conveniosBeneficiados = campaigns.filter((c) => c.status === "ativa").length;
  const doacoesConfirmadas = donations.length;

  return { totalArrecadado, totalDestinado, conveniosBeneficiados, doacoesConfirmadas };
}
