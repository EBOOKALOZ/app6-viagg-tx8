import { SHCAuditResult } from '../types/SHCAuditResult';
import { SHC_AUDIT_CONFIG, SHCProfile } from '../config/SHCAuditConfig';

export class ScoreCalculator {
  /**
   * Calcula o score final de acordo com a Matriz Oficial (SHC_AUDIT_CONFIG) e o Perfil Atual.
   */
  public static calculate(results: SHCAuditResult[], currentProfile: SHCProfile = 'production'): { score: number; memory: string[] } {
    let maxWeight = 0;
    let earnedWeight = 0;
    const memory: string[] = [];

    // Montar mapa rápido dos resultados por categoria para lookup
    const resultMap = new Map<string, SHCAuditResult>();
    for (const r of results) {
      resultMap.set(r.category, r);
    }

    for (const rule of SHC_AUDIT_CONFIG) {
      if (!rule.affectsScore) {
        memory.push(`[${rule.name}] Ignorado (affectsScore=false).`);
        continue;
      }

      // Se a regra não for estrita neste perfil, verificamos se ela perde peso ou não.
      // A instrução do usuário (Score depende do perfil) implica que, se for relaxada (required=false localmente),
      // o score ainda pode ser afetado, MAS o impacto real depende se o usuário quer isentar a pontuação.
      // Para manter a consistência, se affectsScore=true, ela participa, mas podemos dar um aviso.
      const appliesStrictly = rule.environments.includes(currentProfile);

      maxWeight += rule.weight;
      
      const res = resultMap.get(rule.category);
      if (!res) {
        memory.push(`[${rule.name}] Não auditado. Ganho 0 / ${rule.weight}.`);
        continue;
      }

      if (res.status === 'PASSED') {
        earnedWeight += rule.weight;
        memory.push(`[${rule.name}] PASSED. Ganho ${rule.weight} / ${rule.weight}.`);
      } else if (res.status === 'WARNING') {
        const partial = Math.floor(rule.weight * 0.5); // Perde 50% do peso em caso de warning
        earnedWeight += partial;
        memory.push(`[${rule.name}] WARNING. Ganho ${partial} / ${rule.weight}.`);
      } else {
        memory.push(`[${rule.name}] FAILED. Ganho 0 / ${rule.weight}. ${!appliesStrictly ? '(Relaxada no perfil)' : ''}`);
      }
    }

    const finalScore = maxWeight > 0 ? Math.round((earnedWeight / maxWeight) * 100) : 0;
    memory.push(`=== Cálculo Final [Perfil: ${currentProfile}] === Total Ganho: ${earnedWeight} / ${maxWeight} => Score: ${finalScore}%`);

    return {
      score: finalScore,
      memory
    };
  }
}
