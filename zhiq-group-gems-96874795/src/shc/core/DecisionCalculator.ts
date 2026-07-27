import { ScoreCalculator } from './ScoreCalculator';
import { RuleEvaluator } from './RuleEvaluator';
import { SHCAuditResult } from '../types/SHCAuditResult';
import { SHCProfile } from '../config/SHCAuditConfig';

export class DecisionCalculator {
  /**
   * Avalia os resultados, aciona o ScoreCalculator e o RuleEvaluator,
   * e produz a decisão final de status, bloqueio e mensagens formatadas para explicabilidade.
   */
  public static calculateDecision(results: SHCAuditResult[], currentProfile: SHCProfile = 'production'): {
    status: 'APPROVED' | 'APPROVED_WITH_WARNINGS' | 'REVIEW_REQUIRED' | 'FAILED';
    score: number;
    blocking: boolean;
    deploy: boolean;
    certificate: boolean;
    warnings: number;
    critical: number;
    reason: string;
    explicability: string;
  } {
    const { score, memory } = ScoreCalculator.calculate(results, currentProfile);
    const rules = RuleEvaluator.evaluateBlocks(results, currentProfile);

    let status: 'APPROVED' | 'APPROVED_WITH_WARNINGS' | 'REVIEW_REQUIRED' | 'FAILED' = 'APPROVED';
    let blocking = false;
    let deploy = true;
    let certificate = true;

    if (rules.isBlocked) {
      status = 'FAILED';
      blocking = true;
      deploy = false;
      certificate = false;
    } else if (rules.hasMandatoryFailure) {
      // Falha obrigatória, mas não bloqueante (blocksDeployment = false no perfil)
      status = 'FAILED';
      blocking = false;
      deploy = true;
      certificate = false;
    } else if (rules.hasOptionalFailure) {
      status = 'REVIEW_REQUIRED';
      blocking = true;
      deploy = false;
      certificate = false;
    } else if (rules.warnings > 0) {
      status = 'APPROVED_WITH_WARNINGS';
    } else {
      status = 'APPROVED';
    }

    const requiredCount = results.length; // Simplificação para manter a contagem de auditorias
    const passedCount = results.filter(r => r.status === 'PASSED' || r.status === 'WARNING').length;

    let explicability = `========================\n`;
    explicability += `DECISÃO EXPLICADA\n`;
    explicability += `========================\n\n`;
    explicability += `Perfil:\n${currentProfile}\n\n`;
    explicability += `Resultado:\n${status}\n\n`;
    explicability += `Auditorias executadas:\n${requiredCount}\n\n`;
    explicability += `Aprovadas:\n${passedCount}\n\n`;
    
    if (rules.reasons.length > 0) {
      explicability += `Problemas Identificados:\n`;
      rules.reasons.forEach(r => {
        explicability += `- ${r}\n`;
      });
      explicability += `\n`;
    }

    explicability += `Impacto:\n`;
    if (certificate) {
      explicability += `Certificação Aprovada.\n\n`;
    } else {
      explicability += `Certificação Negada.\n\n`;
    }

    explicability += `Deploy:\n`;
    if (deploy) {
      explicability += `Permitido.\n\n`;
    } else {
      explicability += `Bloqueado.\n\n`;
    }

    explicability += `========================\n`;
    explicability += `REGRAS APLICADAS\n`;
    explicability += `========================\n\n`;
    rules.appliedRulesLog.forEach(log => {
      explicability += `${log}\n`;
    });

    explicability += `\nMemória do Score:\n`;
    memory.forEach(m => {
      explicability += `${m}\n`;
    });

    const reason = rules.reasons.length > 0 
      ? rules.reasons.join(' | ') 
      : (status === 'APPROVED' ? `Todos os critérios do perfil ${currentProfile} foram atendidos.` : 'Aprovado com ressalvas de warning.');

    return {
      status,
      score,
      blocking,
      deploy,
      certificate,
      warnings: rules.warnings,
      critical: rules.critical,
      reason,
      explicability
    };
  }
}
