import { supabase } from "@/integrations/supabase/client";
import type { ConvenioAuditLog } from "./types";

const PAGE_SIZE = 50;

export interface ConvenioAuditLogWithActor extends ConvenioAuditLog {
  actor_email: string | null;
}

export async function listAuditLog(page = 0): Promise<{ rows: ConvenioAuditLogWithActor[]; hasMore: boolean }> {
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error } = await supabase
    .from("convenio_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;

  const entries = data ?? [];
  const actorIds = Array.from(new Set(entries.map((e) => e.actor_id).filter((id): id is string => !!id)));

  const emailById = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", actorIds);
    if (profilesError) throw profilesError;
    for (const p of profilesData ?? []) {
      if (p.email) emailById.set(p.id, p.email);
    }
  }

  const rows = entries.map((row) => ({
    ...row,
    actor_email: row.actor_id ? emailById.get(row.actor_id) ?? null : null,
  }));

  return { rows, hasMore: rows.length === PAGE_SIZE };
}

/**
 * Trilha de auditoria de UM registro específico (Painel de Indicações e afins):
 * todos os eventos de convenio_audit_log da tabela+id informados, mais novo
 * primeiro, com e-mail do autor resolvido via profiles.
 */
export async function listEntityAuditLog(
  entityTable: string,
  entityId: string
): Promise<ConvenioAuditLogWithActor[]> {
  const { data, error } = await supabase
    .from("convenio_audit_log")
    .select("*")
    .eq("entity_table", entityTable)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const entries = data ?? [];
  const actorIds = Array.from(new Set(entries.map((e) => e.actor_id).filter((id): id is string => !!id)));

  const emailById = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", actorIds);
    if (profilesError) throw profilesError;
    for (const p of profilesData ?? []) {
      if (p.email) emailById.set(p.id, p.email);
    }
  }

  return entries.map((row) => ({
    ...row,
    actor_email: row.actor_id ? emailById.get(row.actor_id) ?? null : null,
  }));
}
