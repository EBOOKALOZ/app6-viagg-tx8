/**
 * ORION-QA Fase 1 — Central de Problemas: tipos e vocabulário do domínio.
 * Valores espelham os CHECKs da migration 20260804_orion_qa_central_problemas.sql.
 */
import type { Database } from "@/integrations/supabase/types";

export type QaIssue = Database["public"]["Tables"]["qa_issues"]["Row"];
export type QaIssueInsert = Database["public"]["Tables"]["qa_issues"]["Insert"];
export type QaIssueUpdate = Database["public"]["Tables"]["qa_issues"]["Update"];
export type QaIssueComment = Database["public"]["Tables"]["qa_issue_comments"]["Row"];
export type QaIssueHistory = Database["public"]["Tables"]["qa_issue_history"]["Row"];
export type QaIssueAttachment = Database["public"]["Tables"]["qa_issue_attachments"]["Row"];
export type QaAuditLog = Database["public"]["Tables"]["qa_audit_log"]["Row"];

export const QA_STATUSES = [
  "novo",
  "em_analise",
  "em_desenvolvimento",
  "aguardando_teste",
  "em_homologacao",
  "homologado",
  "fechado",
  "reaberto",
] as const;
export type QaStatus = (typeof QA_STATUSES)[number];

export const QA_STATUS_LABELS: Record<QaStatus, string> = {
  novo: "Novo",
  em_analise: "Em análise",
  em_desenvolvimento: "Em desenvolvimento",
  aguardando_teste: "Aguardando teste",
  em_homologacao: "Em homologação",
  homologado: "Homologado",
  fechado: "Fechado",
  reaberto: "Reaberto",
};

export const QA_STATUS_COLORS: Record<QaStatus, string> = {
  novo: "bg-blue-500 hover:bg-blue-600",
  em_analise: "bg-yellow-500 hover:bg-yellow-600",
  em_desenvolvimento: "bg-orange-500 hover:bg-orange-600",
  aguardando_teste: "bg-purple-500 hover:bg-purple-600",
  em_homologacao: "bg-cyan-600 hover:bg-cyan-700",
  homologado: "bg-green-600 hover:bg-green-700",
  fechado: "bg-gray-500 hover:bg-gray-600",
  reaberto: "bg-red-500 hover:bg-red-600",
};

/** Status considerados "abertos" nos cards do dashboard. */
export const QA_OPEN_STATUSES: QaStatus[] = [
  "novo",
  "em_analise",
  "em_desenvolvimento",
  "aguardando_teste",
  "em_homologacao",
  "reaberto",
];

export const QA_SEVERITIES = ["critico", "alto", "medio", "baixo", "melhoria"] as const;
export type QaSeverity = (typeof QA_SEVERITIES)[number];

export const QA_SEVERITY_LABELS: Record<QaSeverity, string> = {
  critico: "Crítico",
  alto: "Alto",
  medio: "Médio",
  baixo: "Baixo",
  melhoria: "Melhoria",
};

export const QA_SEVERITY_COLORS: Record<QaSeverity, string> = {
  critico: "bg-red-100 text-red-800 border-red-200 font-bold",
  alto: "bg-orange-100 text-orange-800 border-orange-200",
  medio: "bg-yellow-100 text-yellow-800 border-yellow-200",
  baixo: "bg-blue-100 text-blue-800 border-blue-200",
  melhoria: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export const QA_PRIORITIES = ["baixa", "media", "alta", "urgente"] as const;
export type QaPriority = (typeof QA_PRIORITIES)[number];

export const QA_PRIORITY_LABELS: Record<QaPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export const QA_ORIGINS = [
  "manual",
  "shc",
  "maquina_virtual",
  "frontend",
  "backend",
  "supabase",
  "banco",
  "api",
  "ia",
  "deploy",
  "performance",
  "seguranca",
] as const;
export type QaOrigin = (typeof QA_ORIGINS)[number];

export const QA_ORIGIN_LABELS: Record<QaOrigin, string> = {
  manual: "Manual",
  shc: "SHC",
  maquina_virtual: "Máquina Virtual",
  frontend: "Frontend",
  backend: "Backend",
  supabase: "Supabase",
  banco: "Banco",
  api: "API",
  ia: "IA",
  deploy: "Deploy",
  performance: "Performance",
  seguranca: "Segurança",
};

export const QA_ENVIRONMENTS = ["local", "vm_testes", "homologacao", "producao"] as const;
export type QaEnvironment = (typeof QA_ENVIRONMENTS)[number];

export const QA_ENVIRONMENT_LABELS: Record<QaEnvironment, string> = {
  local: "Local",
  vm_testes: "VM Testes",
  homologacao: "Homologação",
  producao: "Produção",
};

export const QA_HISTORY_EVENT_LABELS: Record<string, string> = {
  criacao: "Criação",
  edicao: "Edição",
  mudanca_status: "Mudança de status",
  atribuicao: "Atribuição",
  fechamento: "Fechamento",
  reabertura: "Reabertura",
};

/** Bucket privado dos anexos (policies admin-only na migration). */
export const QA_ATTACHMENTS_BUCKET = "qa-attachments";

/** Extensões/mime aceitos pelo CHECK de qa_issue_attachments. */
export const QA_ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "application/pdf",
  "text/plain",
  "application/json",
  "application/zip",
  "application/x-zip-compressed",
] as const;

export const QA_MAX_ATTACHMENT_BYTES = 26214400; // 25 MB — espelha o CHECK do banco

export const qaLabel = {
  status: (v: string) => QA_STATUS_LABELS[v as QaStatus] ?? v,
  severity: (v: string) => QA_SEVERITY_LABELS[v as QaSeverity] ?? v,
  priority: (v: string) => QA_PRIORITY_LABELS[v as QaPriority] ?? v,
  origin: (v: string) => QA_ORIGIN_LABELS[v as QaOrigin] ?? v,
  environment: (v: string) => QA_ENVIRONMENT_LABELS[v as QaEnvironment] ?? v,
};

/* ═══════════════════════ ORION-QA FASE 2 ═══════════════════════ */

/** Linha da view qa_issues_enriched (qa_issues + contadores p/ Score IA). */
export type QaIssueEnriched = Database["public"]["Views"]["qa_issues_enriched"]["Row"];

/** Filtros rápidos (chips) da listagem. */
export const QA_QUICK_FILTERS = [
  "criticos",
  "producao",
  "reabertos",
  "sem_responsavel",
  "mais_antigos",
  "resolvidos_hoje",
  "fechados_hoje",
  "em_homologacao",
] as const;
export type QaQuickFilter = (typeof QA_QUICK_FILTERS)[number];

export const QA_QUICK_FILTER_LABELS: Record<QaQuickFilter, string> = {
  criticos: "Somente críticos",
  producao: "Somente produção",
  reabertos: "Reabertos",
  sem_responsavel: "Sem responsável",
  mais_antigos: "Mais antigos",
  resolvidos_hoje: "Resolvidos hoje",
  fechados_hoje: "Fechados hoje",
  em_homologacao: "Em homologação",
};

/** Modos de visualização da Central. */
export const QA_VIEW_MODES = ["tabela", "kanban", "analytics", "equipe"] as const;
export type QaViewMode = (typeof QA_VIEW_MODES)[number];

/** Colunas configuráveis da tabela. */
export const QA_TABLE_COLUMNS = [
  "prioridade_ia",
  "modulo",
  "severidade",
  "status",
  "origem",
  "ambiente",
  "responsavel",
  "data",
] as const;
export type QaTableColumn = (typeof QA_TABLE_COLUMNS)[number];

export const QA_TABLE_COLUMN_LABELS: Record<QaTableColumn, string> = {
  prioridade_ia: "Prioridade IA",
  modulo: "Módulo",
  severidade: "Severidade",
  status: "Status",
  origem: "Origem",
  ambiente: "Ambiente",
  responsavel: "Responsável",
  data: "Data",
};

/** Ordenações server-side suportadas. */
export const QA_SORT_FIELDS = ["created_at", "updated_at", "issue_number", "severity", "status"] as const;
export type QaSortField = (typeof QA_SORT_FIELDS)[number];

export interface QaSortState {
  field: QaSortField;
  ascending: boolean;
}

/** Colunas do Kanban → status do banco (coluna mesclada aponta p/ status primário no drop). */
export interface QaKanbanColumn {
  key: string;
  title: string;
  statuses: QaStatus[];
  dropStatus: QaStatus;
  accent: string;
}

export const QA_KANBAN_COLUMNS: QaKanbanColumn[] = [
  { key: "aberto", title: "Aberto", statuses: ["novo", "reaberto"], dropStatus: "novo", accent: "border-t-blue-500" },
  { key: "em_analise", title: "Em análise", statuses: ["em_analise"], dropStatus: "em_analise", accent: "border-t-yellow-500" },
  { key: "desenvolvimento", title: "Desenvolvimento", statuses: ["em_desenvolvimento", "aguardando_teste"], dropStatus: "em_desenvolvimento", accent: "border-t-orange-500" },
  { key: "homologacao", title: "Homologação", statuses: ["em_homologacao"], dropStatus: "em_homologacao", accent: "border-t-cyan-600" },
  { key: "resolvido", title: "Resolvido", statuses: ["homologado"], dropStatus: "homologado", accent: "border-t-green-600" },
  { key: "fechado", title: "Fechado", statuses: ["fechado"], dropStatus: "fechado", accent: "border-t-gray-500" },
];
