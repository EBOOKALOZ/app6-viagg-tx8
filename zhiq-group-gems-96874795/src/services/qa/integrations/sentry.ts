/**
 * ORION-QA Fase 3 — integração Sentry (PREPARADA).
 *
 * Contrato tipado + normalizador prontos: quando o projeto Sentry for
 * conectado (webhook de alerta ou SDK), `registerSentryException` registra
 * exception, stack, release, environment, usuários afetados e ocorrências;
 * `createIssueInputFromSentry` prepara a abertura de problema na Central.
 */
import type { QaIssueInsert } from "@/services/qa/types";
import { emitQaEvent, QA_EVENT_TYPES } from "../events";
import type { QaEventSeverity } from "../events/types";
import { qaIntegrations } from "./registry";

qaIntegrations.register({
  source: "sentry",
  label: "Sentry",
  version: "1.0",
  status: "preparada",
  captures: [
    "Exceptions e stack trace",
    "Release e environment",
    "Usuários afetados",
    "Quantidade de ocorrências",
  ],
});

export interface SentryExceptionPayload {
  exceptionType: string;
  message: string;
  stackTrace?: string;
  release?: string;
  environment?: "local" | "vm_testes" | "homologacao" | "producao";
  usersAffected?: number;
  occurrences?: number;
  externalId?: string;
  module?: string;
  platform?: "frontend" | "backend";
}

/** Severidade sugerida a partir do impacto real reportado pelo Sentry. */
export function sentrySeverity(payload: SentryExceptionPayload): QaEventSeverity {
  if ((payload.usersAffected ?? 0) >= 10 || (payload.occurrences ?? 0) >= 100) return "critical";
  return "error";
}

/** Registra uma exception do Sentry no Event Bus (fire-and-forget). */
export function registerSentryException(payload: SentryExceptionPayload): void {
  try {
    emitQaEvent({
      type: QA_EVENT_TYPES.SentryException,
      title: `${payload.exceptionType}: ${payload.message}`.slice(0, 300),
      source: "sentry",
      severity: sentrySeverity(payload),
      module: payload.module,
      environment: payload.environment ?? "producao",
      releaseVersion: payload.release,
      payload: {
        exception_type: payload.exceptionType,
        message: payload.message,
        stack_trace: payload.stackTrace ?? null,
        release: payload.release ?? null,
        users_affected: payload.usersAffected ?? null,
        occurrences: payload.occurrences ?? null,
        external_id: payload.externalId ?? null,
        platform: payload.platform ?? null,
      },
    });
  } catch (err) {
    console.warn(
      `[ORION-QA] integração Sentry falhou ao registrar exception: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/**
 * Prepara a criação de um problema na Central a partir da exception —
 * quem decide criar (auto ou manual) é o consumidor.
 */
export function createIssueInputFromSentry(payload: SentryExceptionPayload): QaIssueInsert {
  return {
    title: `[Sentry] ${payload.exceptionType}: ${payload.message}`.slice(0, 200),
    description: `Exception capturada pelo Sentry${payload.externalId ? ` (id ${payload.externalId})` : ""}.`,
    module: payload.module ?? "geral",
    environment: payload.environment ?? "producao",
    severity: sentrySeverity(payload) === "critical" ? "critico" : "alto",
    origin: payload.platform === "backend" ? "backend" : "frontend",
    current_version: payload.release ?? null,
    error_message: payload.message,
    stack_trace: payload.stackTrace ?? null,
    metadata: {
      sentry: {
        external_id: payload.externalId ?? null,
        users_affected: payload.usersAffected ?? null,
        occurrences: payload.occurrences ?? null,
      },
    },
  };
}
