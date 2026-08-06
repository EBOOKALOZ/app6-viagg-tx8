/**
 * ORION-QA Fase 3 — integração BrowserStack (PREPARADA).
 *
 * Contrato tipado + normalizador prontos: quando sessões BrowserStack forem
 * conectadas (API/webhook), `registerBrowserStackSession` registra
 * dispositivo, sistema, browser, resolução e falhas sem outra mudança.
 */
import { emitQaEvent, QA_EVENT_TYPES } from "../events";
import type { QaIntegrationRunInsert } from "../events/types";
import { qaIntegrations } from "./registry";
import { recordIntegrationRun } from "./runRecorder";

qaIntegrations.register({
  source: "browserstack",
  label: "BrowserStack",
  version: "1.0",
  status: "preparada",
  captures: [
    "Dispositivo e sistema operacional",
    "Browser e versão",
    "Resolução de tela",
    "Falhas por sessão",
  ],
});

export interface BrowserStackFailure {
  test: string;
  errorMessage?: string;
  screenshot?: string;
}

export interface BrowserStackSessionPayload {
  sessionId: string;
  device: string;
  operatingSystem: string;
  browser: string;
  resolution: string;
  startedAt: string;
  finishedAt: string;
  totalTests: number;
  failures: BrowserStackFailure[];
  videoUrl?: string;
}

/** Normaliza a sessão BrowserStack para a linha de qa_integration_runs. */
export function mapBrowserStackSessionToRun(
  payload: BrowserStackSessionPayload,
): QaIntegrationRunInsert {
  return {
    source: "browserstack",
    kind: "sessao",
    status: payload.failures.length > 0 ? "reprovado" : "aprovado",
    started_at: payload.startedAt,
    finished_at: payload.finishedAt,
    total: payload.totalTests,
    passed: Math.max(0, payload.totalTests - payload.failures.length),
    failed: payload.failures.length,
    environment: "homologacao",
    external_ref: payload.sessionId,
    details: {
      device: payload.device,
      operating_system: payload.operatingSystem,
      browser: payload.browser,
      resolution: payload.resolution,
      video_url: payload.videoUrl ?? null,
      failures: payload.failures.map((f) => ({
        test: f.test,
        error: f.errorMessage ?? null,
        screenshot: f.screenshot ?? null,
      })),
    },
  };
}

/** Registra uma sessão BrowserStack no ecossistema QA (fire-and-forget). */
export async function registerBrowserStackSession(
  payload: BrowserStackSessionPayload,
): Promise<void> {
  try {
    const run = mapBrowserStackSessionToRun(payload);
    const runId = await recordIntegrationRun(run);
    const failed = payload.failures.length > 0;
    emitQaEvent({
      type: failed
        ? QA_EVENT_TYPES.BrowserStackFailed
        : QA_EVENT_TYPES.BrowserStackExecuted,
      title: failed
        ? `BrowserStack: ${payload.failures.length} falha(s) em ${payload.device} · ${payload.browser}`
        : `BrowserStack aprovado em ${payload.device} · ${payload.browser}`,
      source: "browserstack",
      severity: failed ? "error" : "info",
      runId: runId ?? undefined,
      payload: {
        session: payload.sessionId,
        device: payload.device,
        operating_system: payload.operatingSystem,
        browser: payload.browser,
        resolution: payload.resolution,
        failures: payload.failures.length,
      },
    });
  } catch (err) {
    console.warn(
      `[ORION-QA] integração BrowserStack falhou ao registrar sessão: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
