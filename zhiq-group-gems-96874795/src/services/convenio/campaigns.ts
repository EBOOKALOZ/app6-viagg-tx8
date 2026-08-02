import { supabase } from "@/integrations/supabase/client";
import type { ConvenioCampaign, ConvenioCampaignInsert, ConvenioCampaignUpdate } from "./types";

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
