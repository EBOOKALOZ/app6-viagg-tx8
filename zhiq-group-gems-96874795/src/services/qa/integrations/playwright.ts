/**
 * ORION-QA Fase 3 — integração Playwright (PREPARADA).
 *
 * Contrato tipado + normalizador prontos. Quando um runner Playwright real
 * (CI ou local) publicar resultados, basta chamar `registerPlaywrightRun`
 * com o payload — suites, casos, screenshots, vídeos, tempo e falhas são
 * registrados sem nenhuma outra mudança no sistema.
 */
import { emitQaEvent, QA_EVENT_TYPES } from "../events";
import type { QaGitRef, QaIntegrationRunInsert } from "../events/types";
import { qaIntegrations } from "./registry";
import { recordIntegrationRun } from "./runRecorder";

qaIntegrations.register({
  source: "playwright",
  label: "Playwright",
  version: "1.0",
  status: "preparada",
  captures: [
    "Suites e casos de teste",
    "Screenshots e vídeos (caminhos)",
    "Tempo por caso e total",
    "Falhas com mensagem de erro",
  ],
});

export type PlaywrightCaseStatus = "passed" | "failed" | "skipped" | "timedout";

export interface PlaywrightCaseResult {
  suite: string;
  title: string;
  status: PlaywrightCaseStatus;
  durationMs: number;
  errorMessage?: string;
  screenshots?: string[];
  videos?: string[];
}

export interface PlaywrightRunPayload {
  cases: PlaywrightCaseResult[];
  startedAt: string;
  finishedAt: string;
  environment?: "local" | "vm_testes" | "homologacao" | "producao";
  buildNumber?: string;
  git?: QaGitRef;
}

/** Normaliza o payload do runner para a linha de qa_integration_runs. */
export function mapPlaywrightRunToRun(payload: PlaywrightRunPayload): QaIntegrationRunInsert {
  const suites = [...new Set(payload.cases.map((c) => c.suite))];
  const failed = payload.cases.filter((c) => c.status === "failed" || c.status === "timedout");
  const passed = payload.cases.filter((c) => c.status === "passed");
  const durationMs = payload.cases.reduce((acc, c) => acc + c.durationMs, 0);

  return {
    source: "playwright",
    kind: "suite",
    status: failed.length > 0 ? "reprovado" : "aprovado",
    started_at: payload.startedAt,
    finished_at: payload.finishedAt,
    duration_ms: durationMs,
    total: payload.cases.length,
    passed: passed.length,
    failed: failed.length,
    warnings: payload.cases.filter((c) => c.status === "skipped").length,
    environment: payload.environment ?? "local",
    build_number: payload.buildNumber ?? null,
    commit_hash: payload.git?.commitHash ?? null,
    branch: payload.git?.branch ?? null,
    author: payload.git?.author ?? null,
    details: {
      suites,
      failures: failed.map((c) => ({
        suite: c.suite,
        title: c.title,
        error: c.errorMessage ?? null,
        screenshots: c.screenshots ?? [],
        videos: c.videos ?? [],
      })),
      screenshots: payload.cases.flatMap((c) => c.screenshots ?? []),
      videos: payload.cases.flatMap((c) => c.videos ?? []),
    },
  };
}

/** Registra uma execução Playwright no ecossistema QA (fire-and-forget). */
export async function registerPlaywrightRun(payload: PlaywrightRunPayload): Promise<void> {
  try {
    const run = mapPlaywrightRunToRun(payload);
    const runId = await recordIntegrationRun(run);
    const failed = (run.failed ?? 0) > 0;
    emitQaEvent({
      type: failed ? QA_EVENT_TYPES.PlaywrightFailed : QA_EVENT_TYPES.PlaywrightExecuted,
      title: failed
        ? `Playwright reprovado: ${run.failed} falha(s) em ${run.total} caso(s)`
        : `Playwright aprovado: ${run.passed}/${run.total} caso(s)`,
      source: "playwright",
      severity: failed ? "error" : "info",
      environment: payload.environment ?? "local",
      runId: runId ?? undefined,
      git: payload.git,
      payload: { total: run.total, passed: run.passed, failed: run.failed },
    });
  } catch (err) {
    console.warn(
      `[ORION-QA] integração Playwright falhou ao registrar run: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
