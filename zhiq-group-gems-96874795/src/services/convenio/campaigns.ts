import { supabase } from "@/integrations/supabase/client";
import { assertStatusTransition } from "@/lib/convenio/statusTransitions";
import type { ConvenioCampaign, ConvenioCampaignInsert, ConvenioCampaignStatus, ConvenioCampaignUpdate } from "./types";

export async function listCampaigns(): Promise<ConvenioCampaign[]> {
  const { data, error } = await supabase
    .from("convenio_campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listActiveCampaignsForPicker(): Promise<Pick<ConvenioCampaign, "id" | "title">[]> {
  const { data, error } = await supabase
    .from("convenio_campaigns")
    .select("id, title")
    .in("status", ["ativa", "planejada"])
    .order("title", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createCampaign(input: ConvenioCampaignInsert): Promise<ConvenioCampaign> {
  const { data, error } = await supabase.from("convenio_campaigns").insert(input).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateCampaign(id: string, patch: ConvenioCampaignUpdate): Promise<ConvenioCampaign> {
  const { data, error } = await supabase
    .from("convenio_campaigns")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/**
 * Muda o status respeitando a máquina de estados (planejada → ativa →
 * pausada/encerrada). Validação aqui gera erro amigável; o trigger
 * trg_convenio_status_transition no banco é a autoridade final.
 */
export async function changeCampaignStatus(
  id: string,
  from: ConvenioCampaignStatus,
  to: ConvenioCampaignStatus
): Promise<ConvenioCampaign> {
  assertStatusTransition("campaign", from, to);
  return updateCampaign(id, { status: to });
}
