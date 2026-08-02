import { supabase } from "@/integrations/supabase/client";
import type { ConvenioMessage, ConvenioMessageInsert } from "./types";

export interface ConvenioMessageWithEntity extends ConvenioMessage {
  entity_name: string | null;
}

export async function listMessages(): Promise<ConvenioMessageWithEntity[]> {
  const { data, error } = await supabase
    .from("convenio_messages")
    .select("*, convenio_entities(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const { convenio_entities, ...rest } = row as ConvenioMessage & { convenio_entities: { name: string } | null };
    return { ...rest, entity_name: convenio_entities?.name ?? null };
  });
}

export async function sendMessage(input: ConvenioMessageInsert): Promise<ConvenioMessage> {
  const { data, error } = await supabase.from("convenio_messages").insert(input).select("*").single();
  if (error) throw error;
  return data;
}

export async function markMessageRead(id: string): Promise<void> {
  const { error } = await supabase.from("convenio_messages").update({ is_read: true }).eq("id", id);
  if (error) throw error;
}
