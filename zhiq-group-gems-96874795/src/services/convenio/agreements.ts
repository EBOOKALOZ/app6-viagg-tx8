import { supabase } from "@/integrations/supabase/client";
import type {
  ConvenioAgreement,
  ConvenioAgreementHistory,
  ConvenioAgreementInsert,
  ConvenioAgreementStatus,
  ConvenioAgreementUpdate,
} from "./types";

export interface ConvenioAgreementWithEntity extends ConvenioAgreement {
  entity_name: string | null;
}

export async function listAgreements(): Promise<ConvenioAgreementWithEntity[]> {
  const { data, error } = await supabase
    .from("convenio_agreements")
    .select("*, convenio_entities(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { convenio_entities, ...rest } = row as ConvenioAgreement & { convenio_entities: { name: string } | null };
    return { ...rest, entity_name: convenio_entities?.name ?? null };
  });
}

export async function createAgreement(input: ConvenioAgreementInsert): Promise<ConvenioAgreement> {
  const { data, error } = await supabase.from("convenio_agreements").insert(input).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateAgreement(id: string, patch: ConvenioAgreementUpdate): Promise<ConvenioAgreement> {
  const { data, error } = await supabase
    .from("convenio_agreements")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function changeAgreementStatus(id: string, status: ConvenioAgreementStatus): Promise<ConvenioAgreement> {
  return updateAgreement(id, { status });
}

export async function listAgreementHistory(agreementId: string): Promise<ConvenioAgreementHistory[]> {
  const { data, error } = await supabase
    .from("convenio_agreement_history")
    .select("*")
    .eq("agreement_id", agreementId)
    .order("changed_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
