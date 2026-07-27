import { SHCAuditResult } from '../types/SHCAuditResult';
import { SHC_AUDIT_CONFIG, SHCProfile, SHCRule } from '../config/SHCAuditConfig';

export class RuleEvaluator {
  /**
   * Avalia as regras com base na Matriz Oficial e no Perfil Atual.
   */
  public static evaluateBlocks(results: SHCAuditResult[], currentProfile: SHCProfile = 'production'): {
    isBlocked: boolean, 
    hasMandatoryFailure: boolean,
    hasOptionalFailure: boolean,
    warnings: number,
    critical: number,
    reasons: string[],
    appliedRulesLog: string[]
  } {
    let isBlocked = false;
    let hasMandatoryFailure = false;
    let hasOptionalFailure = false;
    let warnings = 0;
    let critical = 0;
    const reasons: string[] = [];
    const appliedRulesLog: string[] = [];

    const ruleMap = new Map<string, SHCRule>();
    for (const config of SHC_AUDIT_CONFIG) {
      ruleMap.set(config.category, config);
    }

    for (const res of results) {
      if (res.severity === 'CRITICAL') critical++;
      if (res.status === 'WARNING') warnings++;

      const configRule = ruleMap.get(res.category);
      
      if (configRule) {
        // Verificar downgrade de perfil
        const appliesStrictly = configRule.environments.includes(currentProfile);
        // `blocking: false` explícito no resultado rebaixa a regra a opcional
        // (o auditor da rodada sabe que aquele resultado não deve travar deploy).
        const explicitOptional = res.blocking === false;
        const isRequired = explicitOptional ? false : (appliesStrictly ? configRule.required : false);
        const blocksDeploy = explicitOptional ? false : (appliesStrictly ? configRule.blocksDeployment : false);
        
        let statusLog = `✔ Aprovada`;
        if (res.status === 'FAILED') statusLog = `✖ Falhou`;
        else if (res.status === 'WARNING') statusLog = `⚠ Warning`;
        
        appliedRulesLog.push(`${configRule.name}`);
        appliedRulesLog.push(isRequired ? `✔ Obrigatória` : `✖ Opcional`);
        appliedRulesLog.push(statusLog);
        appliedRulesLog.push(`Peso: ${configRule.weight}`);
        
        if (!appliesStrictly) {
          appliedRulesLog.push(`Perfil: ${currentProfile} (Regra relaxada)`);
          appliedRulesLog.push(`Bloqueio: Não`);
        } else {
          appliedRulesLog.push(`Perfil: ${currentProfile} (Regra estrita)`);
          appliedRulesLog.push(`Bloqueio: ${blocksDeploy ? 'Sim' : 'Não'}`);
        }
        appliedRulesLog.push(`------------------------`);

        if (res.status === 'FAILED') {
          if (isRequired) {
            hasMandatoryFailure = true;
            if (blocksDeploy) {
              isBlocked = true;
              reasons.push(`[${configRule.name}] Falha bloqueante no perfil ${currentProfile}. Deploy interrompido.`);
            } else {
              reasons.push(`[${configRule.name}] Falha obrigatória, mas não-bloqueante no perfil ${currentProfile}.`);
            }
          } else {
            hasOptionalFailure = true;
            reasons.push(`[${configRule.name}] Falha em requisito opcional no perfil ${currentProfile}.`);
          }
        }
      } else {
        // Fallback
        if (res.status === 'FAILED') {
          if (res.severity === 'CRITICAL') {
            isBlocked = true;
            hasMandatoryFailure = true;
            reasons.push(`[${res.name}] Falha Crítica (Não listada na matriz). Deploy bloqueado.`);
          } else {
            hasOptionalFailure = true;
            reasons.push(`[${res.name}] Falha em regra desconhecida.`);
          }
        }
      }
    }

    return {
      isBlocked,
      hasMandatoryFailure,
      hasOptionalFailure,
      warnings,
      critical,
      reasons,
      appliedRulesLog
    };
  }
}
