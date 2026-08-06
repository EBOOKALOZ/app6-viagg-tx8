/**
 * ORION-QA Fase 3 — integração QA Wolf (PREPARADA, arquitetura plugável).
 *
 * Contrato tipado + normalizador prontos: quando o serviço QA Wolf for
 * conectado (webhook/export), chamar `registerQaWolfRun` com os resultados
 * registra execuções, casos e status sem nenhuma outra mudança.
 */
import { emitQaEvent, QA_EVENT_TYPES } from "../events";
import type { QaIntegrationRunInsert } from "../events/types";
import { qaIntegrations } from "./registry";
import { recordIntegrationRun } from "./runRecorder";

qaIntegrations.register({
  source: "qawolf",
  label: "QA Wolf",
  version: "1.0",
  status: "preparada",
  captures: ["Resultados de execução", "Casos e status individuais", "Execuções (histórico)"],
});

export type QaWolfCaseStatus = "passed" | "failed" | "flaky" | "skipped";

export interface QaWolfCaseResult {
  name: string;
  status: QaWolfCaseStatus;
  durationMs?: number;
  errorMessage?: string;
}

export interface QaWolfRunPayload {
  runId: string;
  cases: QaWolfCaseResult[];
  startedAt: string;
  finishedAt: string;
  environment?: "local" | "vm_testes" | "homologacao" | "producao";
}

/** Normaliza o payload do QA Wolf para a linha de qa_integration_runs. */
export function mapQaWolfRunToRun(payload: QaWolfRunPayload): QaIntegrationRunInsert {
  const failed = payload.cases.filter((c) => c.status === "failed");
  return {
    source: "qawolf",
    kind: "suite",
    status: failed.length > 0 ? "reprovado" : "aprovado",
    started_at: payload.startedAt,
    finished_at: payload.finishedAt,
    total: payload.cases.length,
    passed: payload.cases.filter((c) => c.status === "passed").length,
    failed: failed.length,
    warnings: payload.cases.filter((c) => c.status === "flaky" || c.status === "skipped").length,
    environment: payload.environment ?? "homologacao",
    external_ref: payload.runId,
    details: {
      cases: payload.cases.map((c) => ({
        name: c.name,
        status: c.status,
        duration_ms: c.durationMs ?? null,
        error: c.errorMessage ?? null,
      })),
    },
  };
}

/** Registra uma execução QA Wolf no ecossistema QA (fire-and-forget). */
export async function registerQaWolfRun(payload: QaWolfRunPayload): Promise<void> {
  try {
    const run = mapQaWolfRunToRun(payload);
    const runId = await recordIntegrationRun(run);
    const failed = (run.failed ?? 0) > 0;
    emitQaEvent({
      type: failed ? QA_EVENT_TYPES.QAWolfFailed : QA_EVENT_TYPES.QAWolfExecuted,
      title: failed
        ? `QA Wolf reprovado: ${run.failed} falha(s) em ${run.total} caso(s)`
        : `QA Wolf aprovado: ${run.passed}/${run.total} caso(s)`,
      source: "qawolf",
      severity: failed ? "error" : "info",
      runId: runId ?? undefined,
      payload: { external_run: payload.runId, total: run.total, failed: run.failed },
    });
  } catch (err) {
    console.warn(
      `[ORION-QA] integração QA Wolf falhou ao registrar run: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
