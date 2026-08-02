import { supabase } from "@/integrations/supabase/client";
import type { ConvenioSettings, ConvenioSettingsUpdate } from "./types";

export async function getSettings(): Promise<ConvenioSettings> {
  const { data, error } = await supabase.from("convenio_settings").select("*").eq("id", true).single();
  if (error) throw error;
  return data;
}

export async function updateSettings(patch: ConvenioSettingsUpdate): Promise<ConvenioSettings> {
  const { data, error } = await supabase
    .from("convenio_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
