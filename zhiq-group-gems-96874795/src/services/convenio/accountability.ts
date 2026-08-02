import { supabase } from "@/integrations/supabase/client";
import type { ConvenioAccountability, ConvenioAccountabilityInsert, ConvenioAccountabilityUpdate } from "./types";

const BUCKET = "convenio-documentos";

export async function listAccountability(): Promise<ConvenioAccountability[]> {
  const { data, error } = await supabase
    .from("convenio_accountability")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function uploadAccountabilityDocument(file: File): Promise<string> {
  const path = `${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

export async function getAccountabilityDocumentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export async function createAccountability(input: ConvenioAccountabilityInsert): Promise<ConvenioAccountability> {
  const { data, error } = await supabase.from("convenio_accountability").insert(input).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateAccountability(
  id: string,
  patch: ConvenioAccountabilityUpdate
): Promise<ConvenioAccountability> {
  const { data, error } = await supabase
    .from("convenio_accountability")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function publishAccountability(id: string): Promise<ConvenioAccountability> {
  return updateAccountability(id, { status: "publicada", published_at: new Date().toISOString() });
}

export async function archiveAccountability(id: string): Promise<ConvenioAccountability> {
  return updateAccountability(id, { status: "arquivada" });
}
