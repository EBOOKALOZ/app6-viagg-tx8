import { describe, it, expect } from 'vitest';
import { DecisionCalculator } from '../core/DecisionCalculator';
import { SHC_AUDIT_CONFIG } from '../config/shc.config';
import { SHCAuditResult } from '../types/SHCAuditResult';
import { DecisionStatus } from '../types/DecisionStatus';

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

const scoredRules = SHC_AUDIT_CONFIG.filter(r => r.affectsScore);
const fullPass = () => scoredRules.map(r => mk(r.category, 'PASSED'));

describe('DecisionCalculator', () => {
  it('todos aprovados -> APPROVED', () => {
    const decision = DecisionCalculator.calculateDecision(fullPass());
    expect(decision.status).toBe(DecisionStatus.APPROVED);
    expect(decision.score).toBe(100);
    expect(decision.deploy).toBe(true);
    expect(decision.certificate).toBe(true);
  });

  it('apenas warnings -> APPROVED_WITH_WARNINGS', () => {
    const results = fullPass().map(r =>
      r.category === 'frontend' ? { ...r, status: 'WARNING' as const, severity: 'LOW' as const } : r
    );
    const decision = DecisionCalculator.calculateDecision(results);
    expect(decision.status).toBe(DecisionStatus.APPROVED_WITH_WARNINGS);
    expect(decision.score).toBeLessThan(100);
    expect(decision.deploy).toBe(true);
  });

  it('falha obrigatória bloqueante -> FAILED', () => {
    // frontend (SHC-01) é required + blocksDeployment na matriz
    const results = [mk('frontend', 'FAILED', 'CRITICAL', true)];
    const decision = DecisionCalculator.calculateDecision(results);
    expect(decision.status).toBe(DecisionStatus.FAILED);
    expect(decision.deploy).toBe(false);
    expect(decision.certificate).toBe(false);
    expect(decision.blocking).toBe(true);
  });

  it('falha não obrigatória -> REVIEW_REQUIRED', () => {
    // categoria fora da matriz + severidade média => falha opcional
    const results = [mk('unknown_optional', 'FAILED', 'MEDIUM', false)];
    const decision = DecisionCalculator.calculateDecision(results);
    expect(decision.status).toBe(DecisionStatus.REVIEW_REQUIRED);
    expect(decision.blocking).toBe(true);
  });

  it('múltiplos warnings e múltiplas falhas são agregados', () => {
    const results = [
      mk('frontend', 'WARNING', 'LOW'),
      // backend (SHC-05) é required (falha obrigatória), mas não bloqueia deploy
      mk('backend', 'FAILED', 'CRITICAL'),
    ];
    const decision = DecisionCalculator.calculateDecision(results);
    expect(decision.warnings).toBeGreaterThanOrEqual(1);
    expect(decision.critical).toBeGreaterThanOrEqual(1);
    expect(decision.status).toBe(DecisionStatus.FAILED);
  });

  it('score nunca igual a 100 quando existir FAILED', () => {
    const results = fullPass().map(r =>
      r.category === 'backend' ? { ...r, status: 'FAILED' as const, severity: 'CRITICAL' as const } : r
    );
    const decision = DecisionCalculator.calculateDecision(results);
    expect(decision.score).toBeLessThan(100);
    expect(decision.status).toBe(DecisionStatus.FAILED);
  });
});
