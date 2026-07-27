import { supabase } from '@/integrations/supabase/client';
import { FinalDecision } from '../types/FinalDecision';

export class DecisionHistory {
  /**
   * Persiste a decisão no banco de dados nas tabelas shc_runs e shc_decision_history.
   */
  public static async saveDecision(decision: FinalDecision): Promise<void> {
    // 1. Atualizar shc_runs com a decisão final no report_json e result
    const { error: runError } = await supabase
      .from('shc_runs')
      .update({
        status: decision.status === 'APPROVED' || decision.status === 'APPROVED_WITH_WARNINGS' ? 'passed' : 'failed',
        result: decision.status === 'APPROVED' || decision.status === 'APPROVED_WITH_WARNINGS' ? 'passed' : 'failed',
        report_json: {
          decision: decision.status,
          decision_id: decision.decisionId,
          reason: decision.reason,
          deploy_allowed: decision.deploy,
          certificate_allowed: decision.certificate,
          blocking: decision.blocking,
          warnings: decision.warnings,
          critical: decision.critical,
          score: decision.score,
          generated_at: decision.generatedAt.toISOString(),
          decision_version: '1.4',
          decision_hash: this.generateHash(decision),
          agents: decision.agents
        }
      })
      .eq('id', decision.runId);

    if (runError) {
      console.error('Falha ao atualizar run no shc_runs:', runError);
      throw runError;
    }
  }

  private static generateHash(decision: FinalDecision): string {
    // Simulação de HASH para certificação de imutabilidade
    // Em produção poderia usar crypto.createHash('sha256')
    const raw = `${decision.decisionId}-${decision.runId}-${decision.status}-${decision.score}-${decision.generatedAt.toISOString()}`;
    // Garantir compatibilidade UTF-8 para btoa no browser
    return typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(raw))) : Buffer.from(raw).toString('base64');
  }
}
