export interface SHCAuditResult {
  id: string;
  code: string;
  name: string;

  /** Categoria da Matriz Oficial (SHC_AUDIT_CONFIG) — chave do RuleEvaluator/ScoreCalculator. */
  category?: string;
  /** Override explícito: false rebaixa o resultado a opcional (não trava deploy). */
  blocking?: boolean;

  status: "NOT_STARTED" | "RUNNING" | "PASSED" | "FAILED" | "WARNING";

  progress: number;

  totalTests: number;
  executedTests: number;

  totalFiles: number;
  analyzedFiles: number;

  issuesFound: number;
  issuesFixed: number;

  score: number;
  severity: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

  reason: string;

  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
}
