import { supabase } from "@/integrations/supabase/client";
import type { ConvenioDonation, ConvenioDonationInsert } from "./types";

export interface ConvenioDonationWithCampaign extends ConvenioDonation {
  campaign_title: string | null;
}

export async function listDonations(): Promise<ConvenioDonationWithCampaign[]> {
  const { data, error } = await supabase
    .from("convenio_donations")
    .select("*, convenio_campaigns(title)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { convenio_campaigns, ...rest } = row as ConvenioDonation & { convenio_campaigns: { title: string } | null };
    return { ...rest, campaign_title: convenio_campaigns?.title ?? null };
  });
}

export async function createDonation(input: ConvenioDonationInsert): Promise<ConvenioDonation> {
  const { data, error } = await supabase
    .from("convenio_donations")
    .insert({ ...input, source: input.source ?? "manual" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
