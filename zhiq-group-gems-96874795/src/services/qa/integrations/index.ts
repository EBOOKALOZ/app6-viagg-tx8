/**
 * ORION-QA Fase 3 — barrel das integrações do ecossistema.
 *
 * Importar este módulo instala todas as integrações no registro plugável
 * (cada adapter se registra ao ser carregado). Consumidores importam apenas
 * o que usam — nenhuma integração conhece a outra.
 */
import "./shc";
import "./testlab";
import "./playwright";
import "./qawolf";
import "./browserstack";
import "./sentry";
import "./pipeline";
import "./git";

export { qaIntegrations, type QaIntegrationDefinition, type QaIntegrationStatus } from "./registry";
export { recordIntegrationRun, finishIntegrationRun } from "./runRecorder";
export { registerShcRun, mapShcResultToRun, shcEventSeverity } from "./shc";
export { registerTestLabExecution, mapTestLabExecutionToRun } from "./testlab";
export {
  registerPlaywrightRun,
  mapPlaywrightRunToRun,
  type PlaywrightCaseResult,
  type PlaywrightRunPayload,
} from "./playwright";
export {
  registerQaWolfRun,
  mapQaWolfRunToRun,
  type QaWolfCaseResult,
  type QaWolfRunPayload,
} from "./qawolf";
export {
  registerBrowserStackSession,
  mapBrowserStackSessionToRun,
  type BrowserStackSessionPayload,
} from "./browserstack";
export {
  registerSentryException,
  createIssueInputFromSentry,
  sentrySeverity,
  type SentryExceptionPayload,
} from "./sentry";
export {
  recordDeployStarted,
  recordDeployFinished,
  recordBuild,
  recordMigration,
  recordRollback,
  emitReleasePublished,
  type DeployInfo,
  type BuildInfo,
  type MigrationInfo,
  type RollbackInfo,
  type PipelineResult,
} from "./pipeline";
export { linkIssueToGit, buildGitMetadata, type QaGitLink } from "./git";
