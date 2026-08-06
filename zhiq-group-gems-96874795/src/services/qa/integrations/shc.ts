/**
 * ORION-QA Fase 3 — integração SHC (Sistema de Homologação Contínua).
 *
 * ATIVA: o cliente do executor oficial (src/services/shc/executor.ts) chama
 * `registerShcRun` ao final de cada homologação — fire-and-forget, sem
 * alterar o fluxo do SHC. Registra execução, resultado, tempo, arquivos
 * analisados (tabelas/RPCs/checks), erros, build, commit, autor e histórico
 * (qa_integration_runs) e emite shc.executed / shc.failed no Event Bus.
 */
import type { ExecutorEvidence, ExecutorResult } from "@/services/shc/executor";
import { emitQaEvent, QA_EVENT_TYPES } from "../events";
import type { QaEventSeverity, QaIntegrationRunInsert } from "../events/types";
import { qaIntegrations } from "./registry";
import { recordIntegrationRun } from "./runRecorder";

qaIntegrations.register({
  source: "shc",
  label: "SHC — Homologação Contínua",
  version: "2.1",
  status: "ativa",
  captures: [
    "Execução e resultado (decisão do motor)",
    "Tempo, score e contadores de testes",
    "Arquivos analisados (tabelas, RPCs, checks)",
    "Erros encontrados (P0/P1)",
    "Build, commit, branch e autor",
  ],
});

const DECISION_TO_STATUS: Record<string, QaIntegrationRunInsert["status"]> = {
  APPROVED: "aprovado",
  APPROVED_WITH_WARNINGS: "aprovado_com_ressalvas",
  FAILED: "reprovado",
};

/** Mapeia o retorno do executor oficial para a linha de qa_integration_runs. */
export function mapShcResultToRun(
  slug: string,
  result: ExecutorResult,
  evidence?: ExecutorEvidence,
): QaIntegrationRunInsert {
  const status = result.ok
    ? DECISION_TO_STATUS[result.decision ?? ""] ?? "erro"
    : "erro";
  return {
    source: "shc",
    kind: "homologacao",
    status,
    total: result.tests ?? 0,
    passed: result.pass ?? 0,
    failed: result.fail ?? 0,
    warnings: result.warnings ?? 0,
    score: result.score ?? null,
    module: result.module ?? slug,
    commit_hash: evidence?.commit_hash ?? null,
    branch: evidence?.branch ?? null,
    author: evidence?.executed_by ?? null,
    release_version: evidence?.version ?? null,
    external_ref: result.run_id ?? null,
    details: {
      decision: result.decision ?? null,
      p0p1: result.p0p1 ?? 0,
      certificate_hash: result.certificate_hash ?? null,
      error: result.error ?? null,
      tables_analyzed: evidence?.tables ?? [],
      rpcs_analyzed: evidence?.rpcs ?? [],
      checks: (evidence?.checks ?? []).map((c) => ({
        name: c.name,
        status: c.status,
        severity: c.severity ?? "NONE",
      })),
      agents: evidence?.agents ?? [],
    },
  };
}

/** Severidade do evento a partir do desfecho da homologação. */
export function shcEventSeverity(result: ExecutorResult): QaEventSeverity {
  if (!result.ok) return "error";
  if (result.decision === "FAILED") return (result.p0p1 ?? 0) > 0 ? "critical" : "error";
  if (result.decision === "APPROVED_WITH_WARNINGS") return "warning";
  return "info";
}

/**
 * Registra a homologação no ecossistema QA. Fire-and-forget: erros são
 * logados e nunca propagados ao SHC.
 */
export async function registerShcRun(
  slug: string,
  result: ExecutorResult,
  evidence?: ExecutorEvidence,
): Promise<void> {
  try {
    const run = mapShcResultToRun(slug, result, evidence);
    const runId = await recordIntegrationRun({
      ...run,
      finished_at: new Date().toISOString(),
    });

    const failed = !result.ok || result.decision === "FAILED";
    emitQaEvent({
      type: failed ? QA_EVENT_TYPES.SHCFailed : QA_EVENT_TYPES.SHCExecuted,
      title: failed
        ? `SHC reprovou o módulo ${result.module ?? slug}`
        : `SHC aprovou o módulo ${result.module ?? slug} (score ${result.score ?? "—"})`,
      source: "shc",
      severity: shcEventSeverity(result),
      module: result.module ?? slug,
      runId: runId ?? undefined,
      releaseVersion: evidence?.version,
      git: {
        commitHash: evidence?.commit_hash,
        branch: evidence?.branch,
        author: evidence?.executed_by,
      },
      payload: {
        decision: result.decision ?? null,
        score: result.score ?? null,
        tests: result.tests ?? 0,
        pass: result.pass ?? 0,
        fail: result.fail ?? 0,
        p0p1: result.p0p1 ?? 0,
        error: result.error ?? null,
      },
    });
  } catch (err) {
    console.warn(
      `[ORION-QA] integração SHC falhou ao registrar run: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
