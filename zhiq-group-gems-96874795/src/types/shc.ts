/**
 * Tipos do domínio SHC — espelham o schema REAL de produção (ASHC FASE 2).
 *
 * Fonte: banco vivo 2026-07-27 (information_schema + pg_type). A versão
 * anterior deste arquivo descrevia colunas que nunca existiram no banco
 * (started_at, quality_score em runs, test_name/category em tests etc.) —
 * causa raiz de várias telas quebradas do painel.
 */

/** Enum público shc_status (compartilhado por módulos, runs.result e tests.result). */
export type SHCStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'error'
  | 'active'
  | 'inactive'
  | 'active_corrected';

export type SHCSeverity = 'critical' | 'high' | 'medium' | 'low';
export type SHCCorrectionStatus = 'pending' | 'fixing' | 'fixed' | 'validated';
export type SHCDecision = 'APPROVED' | 'APPROVED_WITH_WARNINGS' | 'FAILED';

/** report_json gravado pelo motor oficial (shc_run_module_audit v2.x). */
export interface SHCReportJson {
  decision: SHCDecision;
  decision_id: string;
  score: number;
  reason: string;
  deploy_allowed: boolean;
  certificate_allowed: boolean;
  blocking: boolean;
  warnings: number;
  critical: number;
  generated_at: string;
  decision_version: string;
  decision_hash: string;
  agents: string[];
}

export interface SHCModule {
  id: string;
  name: string;
  description: string | null;
  status: SHCStatus | null;
  quality_score: number | null;
  last_run_at: string | null;
  last_duration_ms: number | null;
  coordinator_ai: string | null;
  created_at: string;
  updated_at: string;
  slug: string;
}

export interface SHCRun {
  id: string;
  module_id: string | null;
  version: string | null;
  branch: string | null;
  commit_hash: string | null;
  files_changed: number | null;
  total_duration_ms: number | null;
  result: SHCStatus | null;
  coordinator_ai: string | null;
  created_at: string;
  updated_at: string | null;
  status: string | null;
  executed_by: string | null;
  report_json: SHCReportJson | null;
  decision_id: string | null;
  decision: SHCDecision | null;
  deploy_allowed: boolean | null;
  certificate_allowed: boolean | null;
  blocking: boolean | null;
  warnings: number | null;
  critical: number | null;
  decision_reason: string | null;
  decision_timestamp: string | null;
  decision_version: string | null;
  decision_hash: string | null;
  ia_solver: string | null;
}

export interface SHCTest {
  id: string;
  run_id: string | null;
  name: string;
  result: SHCStatus;
  duration_ms: number | null;
  responsible_ai: string | null;
  evidence: string | null;
  created_at: string;
  status: string | null;
  order_index: number | null;
}

export interface SHCLog {
  id: string;
  run_id: string | null;
  module_id: string | null;
  executed_by: string;
  result: SHCStatus;
  total_tests: number | null;
  passed_tests: number | null;
  failed_tests: number | null;
  duration_ms: number | null;
  logs: string | null;
  evidence: string | null;
  created_at: string;
}

export interface SHCCorrection {
  id: string;
  run_id: string | null;
  test_id: string | null;
  module_id: string | null;
  failure_description: string;
  severity: SHCSeverity;
  technical_description: string | null;
  affected_file: string | null;
  affected_line: number | null;
  responsible_ai: string | null;
  auto_suggestion: string | null;
  status: SHCCorrectionStatus | null;
  created_at: string;
  updated_at: string | null;
}

export interface SHCCertificate {
  id: string;
  module_id: string | null;
  run_id: string | null;
  version: string;
  quality_score: number;
  total_tests: number;
  duration_ms: number;
  coordinator_ai: string;
  issued_at: string | null;
  hash: string | null;
}
