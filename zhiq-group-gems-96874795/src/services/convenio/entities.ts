import { supabase } from "@/integrations/supabase/client";
import type { ConvenioEntity, ConvenioEntityCategory, ConvenioEntityInsert, ConvenioEntityUpdate } from "./types";

export async function listEntities(category: ConvenioEntityCategory): Promise<ConvenioEntity[]> {
  const { data, error } = await supabase
    .from("convenio_entities")
    .select("*")
    .eq("category", category)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createEntity(input: ConvenioEntityInsert): Promise<ConvenioEntity> {
  const { data, error } = await supabase.from("convenio_entities").insert(input).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateEntity(id: string, patch: ConvenioEntityUpdate): Promise<ConvenioEntity> {
  const { data, error } = await supabase
    .from("convenio_entities")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listAllEntitiesForPicker(): Promise<Pick<ConvenioEntity, "id" | "name" | "category">[]> {
  const { data, error } = await supabase
    .from("convenio_entities")
    .select("id, name, category")
    .eq("status", "ativo")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function countEntitiesByCategory(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("convenio_entities").select("category");
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.category] = (counts[row.category] ?? 0) + 1;
  }
  return counts;
}
