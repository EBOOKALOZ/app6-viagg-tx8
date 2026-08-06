import { supabase } from "@/integrations/supabase/client";
import { assertStatusTransition } from "@/lib/convenio/statusTransitions";
import type { ConvenioDonation, ConvenioDonationInsert, ConvenioDonationStatus } from "./types";

export interface ConvenioDonationWithCampaign extends ConvenioDonation {
  campaign_title: string | null;
}

export const DONATIONS_PAGE_SIZE = 50;

export interface DonationsPage {
  rows: ConvenioDonationWithCampaign[];
  hasMore: boolean;
}

export async function listDonations(page = 0): Promise<DonationsPage> {
  const from = page * DONATIONS_PAGE_SIZE;
  const to = from + DONATIONS_PAGE_SIZE - 1;

  const { data, error } = await supabase
    .from("convenio_donations")
    .select("*, convenio_campaigns(title)")
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;

  const rows = (data ?? []).map((row) => {
    const { convenio_campaigns, ...rest } = row as ConvenioDonation & { convenio_campaigns: { title: string } | null };
    return { ...rest, campaign_title: convenio_campaigns?.title ?? null };
  });
  return { rows, hasMore: rows.length === DONATIONS_PAGE_SIZE };
}

/**
 * Todas as doações para exportação de relatório (PDF/Excel): varre o banco em
 * lotes de 1000 — não usa a página da tela nem trunca o relatório.
 */
export async function listAllDonationsForExport(): Promise<ConvenioDonationWithCampaign[]> {
  const BATCH = 1000;
  const all: ConvenioDonationWithCampaign[] = [];
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await supabase
      .from("convenio_donations")
      .select("*, convenio_campaigns(title)")
      .order("created_at", { ascending: false })
      .range(from, from + BATCH - 1);
    if (error) throw error;
    const rows = (data ?? []).map((row) => {
      const { convenio_campaigns, ...rest } = row as ConvenioDonation & { convenio_campaigns: { title: string } | null };
      return { ...rest, campaign_title: convenio_campaigns?.title ?? null };
    });
    all.push(...rows);
    if (rows.length < BATCH) return all;
  }
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

/**
 * Muda o status de uma doação respeitando a máquina de estados
 * (registrada → confirmada/estornada; confirmada → estornada; estornada é
 * terminal). A validação aqui gera erro amigável; o trigger
 * trg_convenio_status_transition no banco é a autoridade final e o trigger
 * trg_convenio_sync_campaign_raised ajusta raised_amount da campanha.
 */
export async function updateDonationStatus(params: {
  id: string;
  from: ConvenioDonationStatus;
  to: ConvenioDonationStatus;
}): Promise<ConvenioDonation> {
  assertStatusTransition("donation", params.from, params.to);
  const { data, error } = await supabase
    .from("convenio_donations")
    .update({ status: params.to })
    .eq("id", params.id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
