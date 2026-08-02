import { supabase } from "@/integrations/supabase/client";
import type { ConvenioGestor } from "./types";

export async function listGestores(): Promise<ConvenioGestor[]> {
  const { data, error } = await supabase.rpc("convenio_list_gestores");
  if (error) throw error;
  return data ?? [];
}

export async function grantGestorRole(email: string): Promise<void> {
  const { error } = await supabase.rpc("convenio_grant_role", { p_email: email });
  if (error) throw error;
}

export async function revokeGestorRole(email: string): Promise<void> {
  const { error } = await supabase.rpc("convenio_revoke_role", { p_email: email });
  if (error) throw error;
}
