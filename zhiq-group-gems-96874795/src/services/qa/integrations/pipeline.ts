/**
 * ORION-QA Fase 3 — integração Pipeline (deploy, build, rollback, release,
 * migration, versionamento).
 *
 * ATIVA para registro manual/automático via painel e preparada para CI:
 * cada função registra a run correspondente e emite o evento canônico —
 * os alertas (deploy com falha, build quebrado, rollback, migration com
 * erro) nascem automaticamente do trigger server-side sobre qa_events.
 */
import { emitQaEvent, QA_EVENT_TYPES } from "../events";
import type { QaEventInput, QaGitRef } from "../events/types";
import { qaIntegrations } from "./registry";
import { finishIntegrationRun, recordIntegrationRun } from "./runRecorder";

qaIntegrations.register({
  source: "pipeline",
  label: "Pipeline (Deploy/Build/Release)",
  version: "1.0",
  status: "ativa",
  captures: [
    "Deploys (início, fim, resultado, tempo)",
    "Builds (resultado, nº, tempo)",
    "Rollbacks e releases",
    "Migrations executadas",
    "Versionamento",
  ],
});

export type PipelineResult = "sucesso" | "falha";

export interface DeployInfo {
  version?: string;
  environment?: "local" | "vm_testes" | "homologacao" | "producao";
  git?: QaGitRef;
}

/** Marca o início de um deploy; retorna o id da run para o finish. */
export async function recordDeployStarted(info: DeployInfo): Promise<string | null> {
  const runId = await recordIntegrationRun({
    source: "pipeline",
    kind: "deploy",
    status: "executando",
    environment: info.environment ?? "producao",
    release_version: info.version ?? null,
    commit_hash: info.git?.commitHash ?? null,
    branch: info.git?.branch ?? null,
    author: info.git?.author ?? null,
  });
  emitQaEvent({
    type: QA_EVENT_TYPES.DeployStarted,
    title: `Deploy iniciado${info.version ? ` — versão ${info.version}` : ""}`,
    source: "pipeline",
    severity: "info",
    environment: info.environment,
    runId: runId ?? undefined,
    releaseVersion: info.version,
    git: info.git,
  });
  return runId;
}

/** Conclui um deploy; falha gera alerta automático (trigger server-side). */
export async function recordDeployFinished(
  runId: string | null,
  info: DeployInfo & { result: PipelineResult; durationMs?: number },
): Promise<void> {
  if (runId) {
    await finishIntegrationRun(runId, {
      status: info.result === "sucesso" ? "aprovado" : "reprovado",
      duration_ms: info.durationMs ?? null,
    });
  }
  emitQaEvent({
    type:
      info.result === "sucesso" ? QA_EVENT_TYPES.DeployFinished : QA_EVENT_TYPES.DeployFailed,
    title:
      info.result === "sucesso"
        ? `Deploy concluído${info.version ? ` — versão ${info.version}` : ""}`
        : `Deploy com falha${info.version ? ` — versão ${info.version}` : ""}`,
    source: "pipeline",
    severity: info.result === "sucesso" ? "info" : "error",
    environment: info.environment,
    runId: runId ?? undefined,
    releaseVersion: info.version,
    git: info.git,
    payload: { result: info.result, duration_ms: info.durationMs ?? null },
  });
}

export interface BuildInfo {
  result: PipelineResult;
  buildNumber?: string;
  durationMs?: number;
  logExcerpt?: string;
  git?: QaGitRef;
}

/** Registra um build; build quebrado gera alerta automático. */
export async function recordBuild(info: BuildInfo): Promise<void> {
  const runId = await recordIntegrationRun({
    source: "pipeline",
    kind: "build",
    status: info.result === "sucesso" ? "aprovado" : "reprovado",
    finished_at: new Date().toISOString(),
    duration_ms: info.durationMs ?? null,
    build_number: info.buildNumber ?? null,
    commit_hash: info.git?.commitHash ?? null,
    branch: info.git?.branch ?? null,
    author: info.git?.author ?? null,
    details: { log_excerpt: info.logExcerpt ?? null },
  });
  emitQaEvent({
    type: info.result === "sucesso" ? QA_EVENT_TYPES.BuildSucceeded : QA_EVENT_TYPES.BuildFailed,
    title:
      info.result === "sucesso"
        ? `Build concluído${info.buildNumber ? ` #${info.buildNumber}` : ""}`
        : `Build quebrado${info.buildNumber ? ` #${info.buildNumber}` : ""}`,
    source: "pipeline",
    severity: info.result === "sucesso" ? "info" : "error",
    runId: runId ?? undefined,
    git: info.git,
    payload: {
      result: info.result,
      build_number: info.buildNumber ?? null,
      duration_ms: info.durationMs ?? null,
      log_excerpt: info.logExcerpt ?? null,
    },
  });
}

export interface MigrationInfo {
  file: string;
  result: PipelineResult;
  environment?: "local" | "vm_testes" | "homologacao" | "producao";
  durationMs?: number;
  errorMessage?: string;
  executedBy?: string;
}

/** Registra uma migration executada; erro gera alerta automático. */
export async function recordMigration(info: MigrationInfo): Promise<void> {
  const runId = await recordIntegrationRun({
    source: "pipeline",
    kind: "migration",
    status: info.result === "sucesso" ? "aprovado" : "erro",
    finished_at: new Date().toISOString(),
    duration_ms: info.durationMs ?? null,
    environment: info.environment ?? "producao",
    author: info.executedBy ?? null,
    details: { file: info.file, error: info.errorMessage ?? null },
  });
  emitQaEvent({
    type:
      info.result === "sucesso"
        ? QA_EVENT_TYPES.MigrationExecuted
        : QA_EVENT_TYPES.MigrationFailed,
    title:
      info.result === "sucesso"
        ? `Migration executada: ${info.file}`
        : `Migration com erro: ${info.file}`,
    source: "pipeline",
    severity: info.result === "sucesso" ? "info" : "error",
    environment: info.environment,
    runId: runId ?? undefined,
    payload: {
      result: info.result,
      file: info.file,
      error: info.errorMessage ?? null,
      executed_by: info.executedBy ?? null,
    },
  });
}

export interface RollbackInfo {
  fromVersion?: string;
  toVersion?: string;
  reason?: string;
  environment?: "local" | "vm_testes" | "homologacao" | "producao";
}

/** Registra um rollback; sempre gera alerta automático. */
export async function recordRollback(info: RollbackInfo): Promise<void> {
  const runId = await recordIntegrationRun({
    source: "pipeline",
    kind: "rollback",
    status: "aprovado",
    finished_at: new Date().toISOString(),
    environment: info.environment ?? "producao",
    release_version: info.toVersion ?? null,
    details: { from_version: info.fromVersion ?? null, reason: info.reason ?? null },
  });
  emitQaEvent({
    type: QA_EVENT_TYPES.PipelineRollback,
    title: `Rollback${info.fromVersion ? ` de ${info.fromVersion}` : ""}${info.toVersion ? ` para ${info.toVersion}` : ""}`,
    source: "pipeline",
    severity: "warning",
    environment: info.environment,
    runId: runId ?? undefined,
    releaseVersion: info.toVersion,
    payload: {
      from_version: info.fromVersion ?? null,
      to_version: info.toVersion ?? null,
      reason: info.reason ?? null,
    },
  });
}

/** Emite o evento de release publicada (usado pela visão de Releases). */
export function emitReleasePublished(version: string, notes?: string): void {
  const input: QaEventInput = {
    type: QA_EVENT_TYPES.ReleasePublished,
    title: `Release ${version} publicada`,
    source: "pipeline",
    severity: "info",
    releaseVersion: version,
    payload: { version, notes: notes ?? null },
  };
  emitQaEvent(input);
}
