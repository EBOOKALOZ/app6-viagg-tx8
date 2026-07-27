import { describe, it, expect } from 'vitest';
import { RuleEvaluator } from '../core/RuleEvaluator';
import { SHC_CONFIG } from '../config/shc.config';
import { SHCAuditResult } from '../types/SHCAuditResult';

const mk = (category: string, status: SHCAuditResult['status'], severity: SHCAuditResult['severity'] = 'NONE', blocking?: boolean): SHCAuditResult => ({
  id: category,
  code: category,
  name: category,
  category,
  status,
  progress: 100,
  totalTests: 1,
  executedTests: 1,
  totalFiles: 1,
  analyzedFiles: 1,
  issuesFound: 0,
  issuesFixed: 0,
  score: 100,
  severity,
  reason: '',
  ...(blocking !== undefined ? { blocking } : {}),
});

describe('RuleEvaluator', () => {
  it('deve aprovar se todas as regras obrigatórias passarem', () => {
    const evaluation = RuleEvaluator.evaluateBlocks([mk('frontend', 'PASSED')]);
    expect(evaluation.isBlocked).toBe(false);
    expect(evaluation.hasMandatoryFailure).toBe(false);
    expect(evaluation.hasOptionalFailure).toBe(false);
  });

  it('deve bloquear deploy se regra obrigatória falhar (Crítico)', () => {
    // 'security' (SHC-06): required + blocksDeployment na matriz
    const evaluation = RuleEvaluator.evaluateBlocks([mk('security', 'FAILED', 'CRITICAL')]);
    expect(evaluation.isBlocked).toBe(true);
    expect(evaluation.hasMandatoryFailure).toBe(true);
  });

  it('não deve bloquear deploy se o resultado for explicitamente opcional (blocking=false)', () => {
    const evaluation = RuleEvaluator.evaluateBlocks([mk('ux', 'FAILED', 'CRITICAL', false)]);
    expect(evaluation.isBlocked).toBe(false);
    expect(evaluation.hasOptionalFailure).toBe(true);
  });

  it('leitura correta do shc.config.ts', () => {
    expect(SHC_CONFIG).toBeDefined();
    expect(SHC_CONFIG.audits).toBeDefined();
    expect(SHC_CONFIG.audits.security.blocksDeploy).toBe(true);
  });
});
