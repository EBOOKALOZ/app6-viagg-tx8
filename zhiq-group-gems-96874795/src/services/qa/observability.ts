/**
 * ORION-QA Fase 3 — acesso a dados de observabilidade.
 *
 * Eventos, alertas, execuções de integrações e releases — tudo admin-only
 * via RLS (is_admin()); sem mascaramento de erro: falha de SQL sobe para a
 * UI tratar (padrão da Fase 1).
 */
import { supabase } from "@/integrations/supabase/client";
import { emitReleasePublished } from "./integrations/pipeline";
import type {
  QaAlertRecord,
  QaEventRecord,
  QaIntegrationRunRecord,
  QaReleaseRecord,
} from "./events/types";

// ── Eventos ─────────────────────────────────────────────────────────────────

export interface QaEventFilters {
  source?: string;
  severity?: string;
  eventType?: string;
  module?: string;
  issueId?: string;
  commitHash?: string;
  releaseVersion?: string;
  limit?: number;
}

export async function listQaEvents(filters: QaEventFilters = {}): Promise<QaEventRecord[]> {
  let query = supabase
    .from("qa_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.source && filters.source !== "all") query = query.eq("source", filters.source);
  if (filters.severity && filters.severity !== "all") query = query.eq("severity", filters.severity);
  if (filters.eventType && filters.eventType !== "all") query = query.eq("event_type", filters.eventType);
  if (filters.module) query = query.eq("module", filters.module);
  if (filters.issueId) query = query.eq("issue_id", filters.issueId);
  if (filters.commitHash) query = query.eq("commit_hash", filters.commitHash);
  if (filters.releaseVersion) query = query.eq("release_version", filters.releaseVersion);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Correlação (seção 14): eventos ligados ao problema por FK, commit ou módulo. */
export interface QaIssueCorrelation {
  direct: QaEventRecord[];
  sameCommit: QaEventRecord[];
  sameModule: QaEventRecord[];
}

export async function getIssueCorrelation(issue: {
  id: string;
  commit_hash: string | null;
  module: string;
}): Promise<QaIssueCorrelation> {
  const direct = await listQaEvents({ issueId: issue.id, limit: 50 });
  const directIds = new Set(direct.map((e) => e.id));

  const sameCommit = issue.commit_hash
    ? (await listQaEvents({ commitHash: issue.commit_hash, limit: 25 })).filter(
        (e) => !directIds.has(e.id),
      )
    : [];
  const commitIds = new Set(sameCommit.map((e) => e.id));

  const sameModule = (await listQaEvents({ module: issue.module, limit: 25 })).filter(
    (e) => !directIds.has(e.id) && !commitIds.has(e.id),
  );

  return { direct, sameCommit, sameModule };
}

// ── Alertas ─────────────────────────────────────────────────────────────────

export async function listQaAlerts(onlyOpen: boolean): Promise<QaAlertRecord[]> {
  let query = supabase
    .from("qa_alerts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (onlyOpen) query = query.is("acknowledged_at", null);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function acknowledgeQaAlert(alertId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("qa_alerts")
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: auth.user?.id ?? null,
    })
    .eq("id", alertId);
  if (error) throw error;
}

// ── Execuções de integrações ────────────────────────────────────────────────

export async function listQaRuns(source?: string, limit = 100): Promise<QaIntegrationRunRecord[]> {
  let query = supabase
    .from("qa_integration_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (source && source !== "all") query = query.eq("source", source);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ── Releases ────────────────────────────────────────────────────────────────

export async function listQaReleases(): Promise<QaReleaseRecord[]> {
  const { data, error } = await supabase
    .from("qa_releases")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createQaRelease(input: {
  version: string;
  name?: string;
  notes?: string;
}): Promise<QaReleaseRecord> {
  const { data, error } = await supabase
    .from("qa_releases")
    .insert({
      version: input.version.trim(),
      name: input.name?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateQaReleaseStatus(
  release: QaReleaseRecord,
  status: "planejada" | "em_homologacao" | "publicada" | "rollback",
): Promise<QaReleaseRecord> {
  const { data, error } = await supabase
    .from("qa_releases")
    .update({
      status,
      released_at:
        status === "publicada" && !release.released_at
          ? new Date().toISOString()
          : release.released_at,
    })
    .eq("id", release.id)
    .select()
    .single();
  if (error) throw error;
  if (status === "publicada") emitReleasePublished(release.version, release.notes ?? undefined);
  return data;
}

/** Contagem de problemas por release (corrigidos = fixed_version; conhecidos = current_version aberta). */
export interface QaReleaseIssueCounts {
  fixed: number;
  known: number;
}

const OPEN_STATUSES = [
  "novo",
  "em_analise",
  "em_desenvolvimento",
  "aguardando_teste",
  "em_homologacao",
  "reaberto",
];

export async function getReleaseIssueCounts(
  versions: string[],
): Promise<Map<string, QaReleaseIssueCounts>> {
  const counts = new Map<string, QaReleaseIssueCounts>();
  if (versions.length === 0) return counts;

  const [{ data: fixed, error: fixedError }, { data: known, error: knownError }] =
    await Promise.all([
      supabase.from("qa_issues").select("fixed_version").in("fixed_version", versions),
      supabase
        .from("qa_issues")
        .select("current_version")
        .in("current_version", versions)
        .in("status", OPEN_STATUSES),
    ]);
  if (fixedError) throw fixedError;
  if (knownError) throw knownError;

  for (const v of versions) counts.set(v, { fixed: 0, known: 0 });
  for (const row of fixed ?? []) {
    if (!row.fixed_version) continue;
    const entry = counts.get(row.fixed_version);
    if (entry) entry.fixed += 1;
  }
  for (const row of known ?? []) {
    if (!row.current_version) continue;
    const entry = counts.get(row.current_version);
    if (entry) entry.known += 1;
  }
  return counts;
}

// ── Dashboard executivo ─────────────────────────────────────────────────────

export interface QaExecutiveDashboard {
  deploys: number;
  deploysComFalha: number;
  builds: number;
  buildsQuebrados: number;
  execucoesTeste: number;
  testesReprovados: number;
  taxaSucesso: number | null;
  tempoMedioMs: number | null;
  alertasAbertos: number;
  eventos24h: number;
}

const TEST_SOURCES = ["shc", "testlab", "playwright", "qawolf", "browserstack"];

/** Indicadores agregados sobre as últimas execuções e eventos. */
export function buildExecutiveDashboard(
  runs: QaIntegrationRunRecord[],
  alerts: QaAlertRecord[],
  events: QaEventRecord[],
): QaExecutiveDashboard {
  const deploys = runs.filter((r) => r.kind === "deploy");
  const builds = runs.filter((r) => r.kind === "build");
  const tests = runs.filter((r) => TEST_SOURCES.includes(r.source));
  const finished = runs.filter((r) => r.status !== "executando" && r.status !== "cancelado");
  const ok = finished.filter(
    (r) => r.status === "aprovado" || r.status === "aprovado_com_ressalvas",
  );
  const durations = runs
    .map((r) => r.duration_ms)
    .filter((d): d is number => typeof d === "number" && d > 0);
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

  return {
    deploys: deploys.length,
    deploysComFalha: deploys.filter((r) => r.status === "reprovado" || r.status === "erro").length,
    builds: builds.length,
    buildsQuebrados: builds.filter((r) => r.status === "reprovado" || r.status === "erro").length,
    execucoesTeste: tests.length,
    testesReprovados: tests.filter((r) => r.status === "reprovado").length,
    taxaSucesso: finished.length ? Math.round((ok.length / finished.length) * 100) : null,
    tempoMedioMs: durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null,
    alertasAbertos: alerts.filter((a) => !a.acknowledged_at).length,
    eventos24h: events.filter((e) => new Date(e.created_at).getTime() >= dayAgo).length,
  };
}

/** Ranking "problemas por X" para o dashboard executivo. */
export function rankBy<T>(
  items: T[],
  key: (item: T) => string | null | undefined,
  top = 8,
): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const label = key(item);
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);
}
