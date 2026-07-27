import { describe, it, expect } from 'vitest';
import { ScoreCalculator } from '../core/ScoreCalculator';
import { SHC_AUDIT_CONFIG } from '../config/shc.config';
import { SHCAuditResult } from '../types/SHCAuditResult';

/**
 * Testes do contrato oficial (Matriz SHC_AUDIT_CONFIG, ponderado por peso):
 * - PASSED ganha o peso integral da categoria
 * - WARNING ganha 50% do peso (floor)
 * - FAILED / não auditado ganha 0
 * - score = round(ganho/total * 100), sempre inteiro entre 0 e 100
 */

const mk = (category: string, status: SHCAuditResult['status'], severity: SHCAuditResult['severity'] = 'NONE'): SHCAuditResult => ({
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
});

const scoredRules = SHC_AUDIT_CONFIG.filter(r => r.affectsScore);
const totalWeight = scoredRules.reduce((s, r) => s + r.weight, 0);
const fullPass = () => scoredRules.map(r => mk(r.category, 'PASSED'));

describe('ScoreCalculator', () => {
  it('deve calcular 100 quando todas as categorias da matriz passam', () => {
    const { score } = ScoreCalculator.calculate(fullPass());
    expect(score).toBe(100);
  });

  it('WARNING vale 50% do peso da categoria', () => {
    const results = fullPass().map(r =>
      r.category === 'frontend' ? { ...r, status: 'WARNING' as const, severity: 'LOW' as const } : r
    );
    const frontendWeight = scoredRules.find(r => r.category === 'frontend')!.weight;
    const expected = Math.round(((totalWeight - frontendWeight + Math.floor(frontendWeight * 0.5)) / totalWeight) * 100);

    const { score } = ScoreCalculator.calculate(results);
    expect(score).toBe(expected);
    expect(score).toBeLessThan(100);
  });

  it('FAILED zera o ganho da categoria (score nunca 100 com falha)', () => {
    const results = fullPass().map(r =>
      r.category === 'security' ? { ...r, status: 'FAILED' as const, severity: 'CRITICAL' as const } : r
    );
    const securityWeight = scoredRules.find(r => r.category === 'security')!.weight;
    const expected = Math.round(((totalWeight - securityWeight) / totalWeight) * 100);

    const { score } = ScoreCalculator.calculate(results);
    expect(score).toBe(expected);
    expect(score).toBeLessThan(100);
  });

  it('categorias não auditadas não pontuam (auditoria parcial não infla o score)', () => {
    const { score } = ScoreCalculator.calculate([mk('frontend', 'PASSED')]);
    const frontendWeight = scoredRules.find(r => r.category === 'frontend')!.weight;
    expect(score).toBe(Math.round((frontendWeight / totalWeight) * 100));
  });

  it('garante que score permaneça entre 0 e 100 e seja inteiro', () => {
    const mixed = scoredRules.map((r, i) =>
      mk(r.category, i % 3 === 0 ? 'FAILED' : i % 3 === 1 ? 'WARNING' : 'PASSED', i % 3 === 0 ? 'HIGH' : 'NONE')
    );
    const { score } = ScoreCalculator.calculate(mixed);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    expect(Number.isInteger(score)).toBe(true);
  });
});
