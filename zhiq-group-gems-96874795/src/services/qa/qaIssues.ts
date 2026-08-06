/**
 * ORION-QA — repository de acesso a dados da Central de Problemas.
 * Fase 2: listagem paginada server-side sobre qa_issues_enriched (view com
 * contadores p/ Score IA), busca avançada, filtros rápidos e emissão de
 * eventos para a arquitetura plugável de notificações.
 * Sem mascaramento de erro — falha de SQL sobe para a UI tratar (Error State).
 */
import { supabase } from "@/integrations/supabase/client";
import { buildQaEvent, emitQaNotification } from "./notifications";
import {
  QA_ATTACHMENTS_BUCKET,
  QA_ALLOWED_MIME_TYPES,
  QA_MAX_ATTACHMENT_BYTES,
  type QaAuditLog,
  type QaIssue,
  type QaIssueAttachment,
  type QaIssueComment,
  type QaIssueEnriched,
  type QaIssueHistory,
  type QaIssueInsert,
  type QaIssueUpdate,
  type QaQuickFilter,
  type QaSortState,
} from "./types";
import type { QaHistoryRow, QaStatRow } from "./metrics";

export interface QaProfileRef {
  id: string;
  name: string | null;
  email: string | null;
}

export interface QaIssueWithRefs extends QaIssue {
  createdByProfile: QaProfileRef | null;
  assignedToProfile: QaProfileRef | null;
}

/** Linha da view enriquecida normalizada (NOT NULL garantidos pela tabela base). */
export interface QaIssueListItem {
  id: string;
  issue_number: number;
  title: string;
  description: string;
  module: string;
  environment: string;
  severity: string;
  status: string;
  priority: string;
  origin: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  assigned_to: string | null;
  current_version: string | null;
  fixed_version: string | null;
  commit_hash: string | null;
  build_number: string | null;
  browser: string | null;
  device: string | null;
  operating_system: string | null;
  error_message: string | null;
  stack_trace: string | null;
  steps_to_reproduce: string | null;
  expected_behavior: string | null;
  actual_behavior: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  comments_count: number;
  history_count: number;
  attachments_count: number;
  reopen_count: number;
  assignedToProfile: QaProfileRef | null;
  createdByProfile: QaProfileRef | null;
}

export interface QaIssueFilters {
  search?: string;
  module?: string;
  status?: string;
  severity?: string;
  origin?: string;
  environment?: string;
  assignedTo?: string;
  periodFrom?: string; // ISO date
  periodTo?: string;   // ISO date
  quickFilters?: QaQuickFilter[];
}

export interface QaIssuesPage {
  items: QaIssueListItem[];
  total: number;
}

/** Normaliza a linha nullable da view para o tipo de domínio. */
function normalizeEnriched(row: QaIssueEnriched): Omit<QaIssueListItem, "assignedToProfile" | "createdByProfile"> {
  return {
    id: row.id ?? "",
    issue_number: row.issue_number ?? 0,
    title: row.title ?? "",
    description: row.description ?? "",
    module: row.module ?? "geral",
    environment: row.environment ?? "producao",
    severity: row.severity ?? "medio",
    status: row.status ?? "novo",
    priority: row.priority ?? "media",
    origin: row.origin ?? "manual",
    created_at: row.created_at ?? new Date(0).toISOString(),
    updated_at: row.updated_at ?? new Date(0).toISOString(),
    created_by: row.created_by,
    assigned_to: row.assigned_to,
    current_version: row.current_version,
    fixed_version: row.fixed_version,
    commit_hash: row.commit_hash,
    build_number: row.build_number,
    browser: row.browser,
    device: row.device,
    operating_system: row.operating_system,
    error_message: row.error_message,
    stack_trace: row.stack_trace,
    steps_to_reproduce: row.steps_to_reproduce,
    expected_behavior: row.expected_behavior,
    actual_behavior: row.actual_behavior,
    resolution_notes: row.resolution_notes,
    resolved_at: row.resolved_at,
    closed_at: row.closed_at,
    comments_count: row.comments_count ?? 0,
    history_count: row.history_count ?? 0,
    attachments_count: row.attachments_count ?? 0,
    reopen_count: row.reopen_count ?? 0,
  };
}

async function fetchProfileMap(userIds: string[]): Promise<Map<string, QaProfileRef>> {
  const map = new Map<string, QaProfileRef>();
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return map;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email")
    .in("id", unique);
  if (error) throw error;
  for (const p of data ?? []) map.set(p.id, p);
  return map;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Termo → padrão ilike seguro dentro de .or() (aspas duplas isolam , e ()). */
function ilikePattern(term: string): string {
  const escaped = term.replace(/[%_]/g, "\\$&").replace(/"/g, "");
  return `"%${escaped}%"`;
}

/** Busca avançada: resolve IDs extras via responsável/usuário (profiles) e
 *  IP/User-Agent (histórico) para compor o OR principal. */
async function resolveSearchExtraIds(term: string): Promise<{ issueIds: string[]; userIds: string[] }> {
  const [profilesRes, historyRes] = await Promise.all([
    supabase.from("profiles").select("id").or(`name.ilike.${ilikePattern(term)},email.ilike.${ilikePattern(term)}`).limit(25),
    supabase.from("qa_issue_history").select("issue_id").or(`ip.ilike.${ilikePattern(term)},user_agent.ilike.${ilikePattern(term)}`).limit(200),
  ]);
  // Busca extra é best-effort: erro aqui não pode derrubar a listagem inteira
  const userIds = profilesRes.error ? [] : (profilesRes.data ?? []).map((p) => p.id);
  const issueIds = historyRes.error
    ? []
    : [...new Set((historyRes.data ?? []).map((h) => h.issue_id))];
  return { issueIds, userIds };
}

function todayStartIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Listagem paginada server-side (contagem exata) sobre a view enriquecida. */
export async function listQaIssuesPage(
  filters: QaIssueFilters,
  sort: QaSortState,
  page: number,
  pageSize: number,
): Promise<QaIssuesPage> {
  let query = supabase.from("qa_issues_enriched").select("*", { count: "exact" });

  if (filters.module && filters.module !== "all") query = query.eq("module", filters.module);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.severity && filters.severity !== "all") query = query.eq("severity", filters.severity);
  if (filters.origin && filters.origin !== "all") query = query.eq("origin", filters.origin);
  if (filters.environment && filters.environment !== "all") query = query.eq("environment", filters.environment);
  if (filters.assignedTo && filters.assignedTo !== "all") query = query.eq("assigned_to", filters.assignedTo);
  if (filters.periodFrom) query = query.gte("created_at", filters.periodFrom);
  if (filters.periodTo) query = query.lte("created_at", `${filters.periodTo}T23:59:59.999Z`);

  let ascending = sort.ascending;
  for (const quick of filters.quickFilters ?? []) {
    switch (quick) {
      case "criticos": query = query.eq("severity", "critico"); break;
      case "producao": query = query.eq("environment", "producao"); break;
      case "reabertos": query = query.or("status.eq.reaberto,reopen_count.gt.0"); break;
      case "sem_responsavel": query = query.is("assigned_to", null); break;
      case "mais_antigos": ascending = true; break;
      case "resolvidos_hoje": query = query.gte("resolved_at", todayStartIso()); break;
      case "fechados_hoje": query = query.gte("closed_at", todayStartIso()); break;
      case "em_homologacao": query = query.eq("status", "em_homologacao"); break;
    }
  }

  const term = filters.search?.trim();
  if (term) {
    const like = ilikePattern(term);
    const ors = [
      `title.ilike.${like}`,
      `description.ilike.${like}`,
      `error_message.ilike.${like}`,
      `commit_hash.ilike.${like}`,
      `stack_trace.ilike.${like}`, // cobre pesquisa por arquivo (paths aparecem no stack)
    ];
    if (/^#?\d+$/.test(term)) ors.push(`issue_number.eq.${term.replace("#", "")}`);
    if (UUID_RE.test(term)) ors.push(`id.eq.${term}`);

    const extra = await resolveSearchExtraIds(term);
    if (extra.issueIds.length > 0) ors.push(`id.in.(${extra.issueIds.join(",")})`);
    if (extra.userIds.length > 0) {
      ors.push(`assigned_to.in.(${extra.userIds.join(",")})`);
      ors.push(`created_by.in.(${extra.userIds.join(",")})`);
    }
    query = query.or(ors.join(","));
  }

  const from = (page - 1) * pageSize;
  query = query.order(sort.field, { ascending }).range(from, from + pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  const rows = (data ?? []).map(normalizeEnriched);
  const profileMap = await fetchProfileMap(
    rows.flatMap((r) => [r.created_by, r.assigned_to]).filter((v): v is string => !!v),
  );
  const items: QaIssueListItem[] = rows.map((r) => ({
    ...r,
    createdByProfile: r.created_by ? profileMap.get(r.created_by) ?? null : null,
    assignedToProfile: r.assigned_to ? profileMap.get(r.assigned_to) ?? null : null,
  }));
  return { items, total: count ?? items.length };
}

/** Linhas mínimas p/ dashboard/heatmap/gráficos/ranking (payload enxuto). */
export async function listQaStatRows(): Promise<QaStatRow[]> {
  const { data, error } = await supabase
    .from("qa_issues_enriched")
    .select("id, status, severity, module, environment, origin, assigned_to, created_at, resolved_at, closed_at, reopen_count")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id ?? "",
    status: r.status ?? "novo",
    severity: r.severity ?? "medio",
    module: r.module ?? "geral",
    environment: r.environment ?? "producao",
    origin: r.origin ?? "manual",
    assigned_to: r.assigned_to,
    created_at: r.created_at ?? new Date(0).toISOString(),
    resolved_at: r.resolved_at,
    closed_at: r.closed_at,
    reopen_count: r.reopen_count ?? 0,
  }));
}

/** Histórico global (eventos de status) p/ tempo médio por status. */
export async function listQaHistoryAll(): Promise<QaHistoryRow[]> {
  const { data, error } = await supabase
    .from("qa_issue_history")
    .select("issue_id, event_type, old_value, new_value, created_at")
    .in("event_type", ["criacao", "mudanca_status", "fechamento", "reabertura"])
    .order("created_at", { ascending: true })
    .limit(10000);
  if (error) throw error;
  return data ?? [];
}

/** Candidatos p/ similaridade (Problemas Relacionados) — recentes, campos textuais. */
export async function listQaSimilarityCandidates(): Promise<
  { id: string; issue_number: number; title: string; description: string | null; module: string; error_message: string | null; commit_hash: string | null; stack_trace: string | null; status: string }[]
> {
  const { data, error } = await supabase
    .from("qa_issues")
    .select("id, issue_number, title, description, module, error_message, commit_hash, stack_trace, status")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return data ?? [];
}

export async function getQaIssue(id: string): Promise<QaIssueWithRefs> {
  const { data, error } = await supabase.from("qa_issues").select("*").eq("id", id).single();
  if (error) throw error;
  const profileMap = await fetchProfileMap(
    [data.created_by, data.assigned_to].filter((v): v is string => !!v),
  );
  return {
    ...data,
    createdByProfile: data.created_by ? profileMap.get(data.created_by) ?? null : null,
    assignedToProfile: data.assigned_to ? profileMap.get(data.assigned_to) ?? null : null,
  };
}

/** Contadores da view p/ um problema (Score IA na página de detalhe). */
export async function getQaIssueCounts(id: string): Promise<{ comments_count: number; history_count: number; attachments_count: number; reopen_count: number }> {
  const { data, error } = await supabase
    .from("qa_issues_enriched")
    .select("comments_count, history_count, attachments_count, reopen_count")
    .eq("id", id)
    .single();
  if (error) throw error;
  return {
    comments_count: data.comments_count ?? 0,
    history_count: data.history_count ?? 0,
    attachments_count: data.attachments_count ?? 0,
    reopen_count: data.reopen_count ?? 0,
  };
}

export async function createQaIssue(input: QaIssueInsert): Promise<QaIssue> {
  const { data, error } = await supabase.from("qa_issues").insert(input).select().single();
  if (error) throw error;
  emitQaNotification(buildQaEvent("novo_problema", data, {
    severity: data.severity, module: data.module, environment: data.environment,
  }));
  return data;
}

export async function updateQaIssue(id: string, patch: QaIssueUpdate): Promise<QaIssue> {
  const { data, error } = await supabase.from("qa_issues").update(patch).eq("id", id).select().single();
  if (error) throw error;
  if (typeof patch.status === "string") {
    emitQaNotification(buildQaEvent(
      patch.status === "reaberto" ? "reabertura" : "mudanca_status",
      data,
      { novo_status: data.status },
    ));
  }
  if ("assigned_to" in patch) {
    emitQaNotification(buildQaEvent("responsavel_alterado", data, { responsavel: data.assigned_to }));
  }
  return data;
}

export interface QaCommentWithRef extends QaIssueComment {
  createdByProfile: QaProfileRef | null;
}

export async function listQaComments(issueId: string): Promise<QaCommentWithRef[]> {
  const { data, error } = await supabase
    .from("qa_issue_comments")
    .select("*")
    .eq("issue_id", issueId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const comments = data ?? [];
  const profileMap = await fetchProfileMap(
    comments.map((c) => c.created_by).filter((v): v is string => !!v),
  );
  return comments.map((c) => ({
    ...c,
    createdByProfile: c.created_by ? profileMap.get(c.created_by) ?? null : null,
  }));
}

export async function addQaComment(
  issueId: string,
  comment: string,
  issueRef?: { id: string; issue_number: number | null; title: string },
): Promise<QaIssueComment> {
  const { data, error } = await supabase
    .from("qa_issue_comments")
    .insert({ issue_id: issueId, comment })
    .select()
    .single();
  if (error) throw error;
  if (issueRef) emitQaNotification(buildQaEvent("comentario", issueRef, {}));
  return data;
}

export async function listQaHistory(issueId: string): Promise<QaIssueHistory[]> {
  const { data, error } = await supabase
    .from("qa_issue_history")
    .select("*")
    .eq("issue_id", issueId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listQaAuditLogs(issueId: string): Promise<QaAuditLog[]> {
  const { data, error } = await supabase
    .from("qa_audit_log")
    .select("*")
    .eq("entity_id", issueId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listQaAttachments(issueId: string): Promise<QaIssueAttachment[]> {
  const { data, error } = await supabase
    .from("qa_issue_attachments")
    .select("*")
    .eq("issue_id", issueId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Sobe o arquivo no bucket privado e registra os metadados. Validação client-side
 *  espelha os CHECKs do banco (tipo e 25 MB) para falhar cedo com mensagem clara. */
export async function uploadQaAttachment(
  issueId: string,
  file: File,
  issueRef?: { id: string; issue_number: number | null; title: string },
): Promise<QaIssueAttachment> {
  const mime = file.type === "application/x-zip-compressed" ? "application/zip" : file.type;
  if (!QA_ALLOWED_MIME_TYPES.includes(mime as (typeof QA_ALLOWED_MIME_TYPES)[number])) {
    throw new Error("Tipo de arquivo não permitido. Aceitos: png, jpg, pdf, txt, json, zip.");
  }
  if (file.size > QA_MAX_ATTACHMENT_BYTES) {
    throw new Error("Arquivo acima do limite de 25 MB.");
  }
  const safeName = file.name.replace(/[^\w.-]+/g, "_").slice(-120);
  const path = `${issueId}/${crypto.randomUUID()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from(QA_ATTACHMENTS_BUCKET)
    .upload(path, file, { contentType: mime, upsert: false });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from("qa_issue_attachments")
    .insert({
      issue_id: issueId,
      file_name: file.name,
      file_path: path,
      mime_type: mime,
      size_bytes: file.size,
    })
    .select()
    .single();
  if (error) {
    // metadado falhou → remove o arquivo órfão do Storage
    await supabase.storage.from(QA_ATTACHMENTS_BUCKET).remove([path]);
    throw error;
  }
  if (issueRef) emitQaNotification(buildQaEvent("anexo", issueRef, { arquivo: file.name }));
  return data;
}

export async function deleteQaAttachment(attachment: QaIssueAttachment): Promise<void> {
  const { error } = await supabase.from("qa_issue_attachments").delete().eq("id", attachment.id);
  if (error) throw error;
  await supabase.storage.from(QA_ATTACHMENTS_BUCKET).remove([attachment.file_path]);
}

/** URL assinada de curta duração (bucket é privado). */
export async function getQaAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(QA_ATTACHMENTS_BUCKET)
    .createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

/** Administradores da plataforma — candidatos a responsável (assigned_to). */
export async function listQaAdmins(): Promise<QaProfileRef[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, email")
    .eq("is_admin", true)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
