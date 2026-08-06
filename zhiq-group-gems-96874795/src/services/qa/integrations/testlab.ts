/**
 * ORION-QA Fase 3 — integração ORION Local Test Lab (OLT v2.0).
 *
 * ATIVA: `salvarExecucao` (src/lib/qa/oltHistory.ts) chama
 * `registerTestLabExecution` a cada homologação concluída — fire-and-forget,
 * preservando o histórico local intacto. Registra execução, testes, falhas,
 * evidências técnicas, tempo, resultado e logs em qa_integration_runs e
 * emite testlab.executed / testlab.failed no Event Bus.
 */
import type { ExecucaoOLT } from "@/lib/qa/oltTypes";
import { emitQaEvent, QA_EVENT_TYPES } from "../events";
import type { QaIntegrationRunInsert } from "../events/types";
import { qaIntegrations } from "./registry";
import { recordIntegrationRun } from "./runRecorder";

qaIntegrations.register({
  source: "testlab",
  label: "ORION Local Test Lab",
  version: "2.0",
  status: "ativa",
  captures: [
    "Execuções da fila de homologação",
    "Testes (pass/fail/cli) e falhas por etapa",
    "Evidências técnicas capturadas",
    "Tempo total e resultado",
    "Logs (detalhe de cada etapa)",
  ],
});

/** Mapeia uma execução do OLT para a linha de qa_integration_runs. */
export function mapTestLabExecutionToRun(execucao: ExecucaoOLT): QaIntegrationRunInsert {
  const falhas = Object.entries(execucao.resultados)
    .filter(([, r]) => r.status === "fail")
    .map(([id, r]) => ({ etapa: id, detalhe: r.detalhe ?? null, ms: r.ms ?? null }));
  const evidencias = Object.values(execucao.resultados).reduce(
    (acc, r) => acc + (r.evidencias?.length ?? 0),
    0,
  );

  return {
    source: "testlab",
    kind: "homologacao",
    status:
      execucao.estadoFinal === "cancelada"
        ? "cancelado"
        : execucao.fail > 0
          ? "reprovado"
          : "aprovado",
    started_at: execucao.inicioTs,
    finished_at: execucao.fimTs,
    duration_ms: execucao.duracaoMs,
    total: execucao.total,
    passed: execucao.pass,
    failed: execucao.fail,
    warnings: execucao.cli,
    score: execucao.percentualPass,
    environment: "local",
    release_version: execucao.versao,
    external_ref: execucao.id,
    details: {
      parcial: execucao.parcial,
      nao_executadas: execucao.naoExec,
      cli: execucao.cli,
      percentual_pass: execucao.percentualPass,
      evidencias_capturadas: evidencias,
      falhas,
    },
  };
}

/**
 * Registra a execução do OLT no ecossistema QA. Fire-and-forget: erros são
 * logados e nunca propagados ao painel.
 */
export function registerTestLabExecution(execucao: ExecucaoOLT): void {
  void (async () => {
    try {
      const runId = await recordIntegrationRun(mapTestLabExecutionToRun(execucao));
      const failed = execucao.fail > 0;
      emitQaEvent({
        type: failed ? QA_EVENT_TYPES.TestLabFailed : QA_EVENT_TYPES.TestLabExecuted,
        title: failed
          ? `Test Lab reprovado: ${execucao.fail} falha(s) em ${execucao.total} etapas`
          : `Test Lab aprovado: ${execucao.pass}/${execucao.total} etapas (${execucao.percentualPass}%)`,
        source: "testlab",
        severity: failed ? "error" : "info",
        environment: "local",
        runId: runId ?? undefined,
        releaseVersion: execucao.versao,
        payload: {
          execucao_id: execucao.id,
          estado_final: execucao.estadoFinal,
          parcial: execucao.parcial,
          pass: execucao.pass,
          fail: execucao.fail,
          cli: execucao.cli,
          duracao_ms: execucao.duracaoMs,
        },
      });
    } catch (err) {
      console.warn(
        `[ORION-QA] integração Test Lab falhou ao registrar execução: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  })();
}
