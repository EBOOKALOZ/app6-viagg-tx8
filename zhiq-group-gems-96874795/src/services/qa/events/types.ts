/**
 * ORION-QA Fase 3 — Event Bus: vocabulário canônico de eventos.
 *
 * Todo módulo da plataforma emite eventos SEM conhecer a Central de
 * Problemas: o contrato é apenas este vocabulário + `qaEventBus.emit()`.
 * Os códigos espelham o CHECK de formato de qa_events.event_type
 * ("dominio.acao") — a lista pode crescer sem migration.
 */
import type { Database, Json } from "@/integrations/supabase/types";

export type QaEventRecord = Database["public"]["Tables"]["qa_events"]["Row"];
export type QaEventInsert = Database["public"]["Tables"]["qa_events"]["Insert"];
export type QaAlertRecord = Database["public"]["Tables"]["qa_alerts"]["Row"];
export type QaIntegrationRunRecord = Database["public"]["Tables"]["qa_integration_runs"]["Row"];
export type QaIntegrationRunInsert = Database["public"]["Tables"]["qa_integration_runs"]["Insert"];
export type QaReleaseRecord = Database["public"]["Tables"]["qa_releases"]["Row"];

/** Nomes do plano ORION-QA 003 → código canônico persistido em qa_events. */
export const QA_EVENT_TYPES = {
  IssueCreated: "issue.created",
  IssueUpdated: "issue.updated",
  IssueClosed: "issue.closed",
  IssueReopened: "issue.reopened",
  DeployStarted: "deploy.started",
  DeployFinished: "deploy.finished",
  DeployFailed: "deploy.failed",
  BuildSucceeded: "build.succeeded",
  BuildFailed: "build.failed",
  MigrationExecuted: "migration.executed",
  MigrationFailed: "migration.failed",
  SHCExecuted: "shc.executed",
  SHCFailed: "shc.failed",
  TestLabExecuted: "testlab.executed",
  TestLabFailed: "testlab.failed",
  PlaywrightExecuted: "playwright.executed",
  PlaywrightFailed: "playwright.failed",
  QAWolfExecuted: "qawolf.executed",
  QAWolfFailed: "qawolf.failed",
  BrowserStackExecuted: "browserstack.executed",
  BrowserStackFailed: "browserstack.failed",
  SentryException: "sentry.exception",
  PipelineRollback: "pipeline.rollback",
  ReleasePublished: "release.published",
  PerformanceAlert: "performance.alert",
  SecurityAlert: "security.alert",
} as const;

export type QaEventType = (typeof QA_EVENT_TYPES)[keyof typeof QA_EVENT_TYPES];

export const QA_EVENT_TYPE_LABELS: Record<QaEventType, string> = {
  "issue.created": "Problema criado",
  "issue.updated": "Problema atualizado",
  "issue.closed": "Problema fechado",
  "issue.reopened": "Problema reaberto",
  "deploy.started": "Deploy iniciado",
  "deploy.finished": "Deploy concluído",
  "deploy.failed": "Deploy com falha",
  "build.succeeded": "Build concluído",
  "build.failed": "Build quebrado",
  "migration.executed": "Migration executada",
  "migration.failed": "Migration com erro",
  "shc.executed": "SHC executado",
  "shc.failed": "SHC reprovado",
  "testlab.executed": "Test Lab executado",
  "testlab.failed": "Test Lab reprovado",
  "playwright.executed": "Playwright executado",
  "playwright.failed": "Playwright reprovado",
  "qawolf.executed": "QA Wolf executado",
  "qawolf.failed": "QA Wolf reprovado",
  "browserstack.executed": "BrowserStack executado",
  "browserstack.failed": "BrowserStack reprovado",
  "sentry.exception": "Exception (Sentry)",
  "pipeline.rollback": "Rollback",
  "release.published": "Release publicada",
  "performance.alert": "Alerta de performance",
  "security.alert": "Alerta de segurança",
};

export const QA_EVENT_SOURCES = [
  "central",
  "shc",
  "testlab",
  "playwright",
  "qawolf",
  "browserstack",
  "sentry",
  "pipeline",
  "git",
  "manual",
] as const;
export type QaEventSource = (typeof QA_EVENT_SOURCES)[number];

export const QA_EVENT_SOURCE_LABELS: Record<QaEventSource, string> = {
  central: "Central de Problemas",
  shc: "SHC",
  testlab: "ORION Local Test Lab",
  playwright: "Playwright",
  qawolf: "QA Wolf",
  browserstack: "BrowserStack",
  sentry: "Sentry",
  pipeline: "Pipeline",
  git: "Git",
  manual: "Manual",
};

export const QA_EVENT_SEVERITIES = ["info", "warning", "error", "critical"] as const;
export type QaEventSeverity = (typeof QA_EVENT_SEVERITIES)[number];

export const QA_EVENT_SEVERITY_LABELS: Record<QaEventSeverity, string> = {
  info: "Informativo",
  warning: "Atenção",
  error: "Erro",
  critical: "Crítico",
};

/** Referência Git anexável a qualquer evento (seção 9 do plano). */
export interface QaGitRef {
  commitHash?: string;
  branch?: string;
  pullRequest?: string;
  author?: string;
}

/** Entrada mínima para emitir um evento — tudo além de type/title é opcional. */
export interface QaEventInput {
  type: QaEventType;
  title: string;
  source?: QaEventSource;
  severity?: QaEventSeverity;
  module?: string;
  environment?: "local" | "vm_testes" | "homologacao" | "producao";
  issueId?: string;
  runId?: string;
  releaseVersion?: string;
  git?: QaGitRef;
  payload?: Record<string, unknown>;
}

/** Evento já normalizado pelo bus: id gerado (entrega idempotente) + defaults. */
export interface QaEmittedEvent extends Required<Pick<QaEventInput, "type" | "title">> {
  id: string;
  source: QaEventSource;
  severity: QaEventSeverity;
  module?: string;
  environment?: "local" | "vm_testes" | "homologacao" | "producao";
  issueId?: string;
  runId?: string;
  releaseVersion?: string;
  git?: QaGitRef;
  payload: Record<string, unknown>;
  emittedAt: string;
}

/** Converte o evento do bus para a linha de qa_events. */
export function toQaEventInsert(event: QaEmittedEvent): QaEventInsert {
  return {
    id: event.id,
    event_type: event.type,
    source: event.source,
    severity: event.severity,
    title: event.title.slice(0, 300),
    module: event.module ?? null,
    ...(event.environment ? { environment: event.environment } : {}),
    issue_id: event.issueId ?? null,
    run_id: event.runId ?? null,
    release_version: event.releaseVersion ?? null,
    commit_hash: event.git?.commitHash ?? null,
    branch: event.git?.branch ?? null,
    pull_request: event.git?.pullRequest ?? null,
    author: event.git?.author ?? null,
    // Round-trip garante payload serializável; o cast para Json é a ponte
    // entre Record<string, unknown> e o tipo recursivo gerado pelo Supabase.
    payload: JSON.parse(JSON.stringify(event.payload)) as Json,
  };
}
