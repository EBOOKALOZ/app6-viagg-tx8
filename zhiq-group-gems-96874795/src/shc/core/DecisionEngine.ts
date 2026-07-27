import { SHCAuditResult } from '../types/SHCAuditResult';
import { FinalDecision } from '../types/FinalDecision';
import { DecisionCalculator } from './DecisionCalculator';
import { DecisionHistory } from './DecisionHistory';
import { supabase } from '@/integrations/supabase/client';
import { SHCProfile } from '../config/SHCAuditConfig';
import { v4 as uuidv4 } from 'uuid';

export class DecisionEngine {
  /**
   * Avalia os resultados consolidados do SHCEngine e gera a Decisão Final.
   */
  public static async evaluate(runId: string, results: SHCAuditResult[], currentProfile: SHCProfile = 'production'): Promise<FinalDecision> {
    const calc = DecisionCalculator.calculateDecision(results, currentProfile);

    const decision: FinalDecision = {
      decisionId: uuidv4(),
      runId,
      status: calc.status as any,
      score: calc.score,
      blocking: calc.blocking,
      deploy: calc.deploy,
      certificate: calc.certificate,
      warnings: calc.warnings,
      critical: calc.critical,
      reason: calc.reason,
      agents: Array.from(new Set(results.map(r => r.name ?? (r as any).agent))),
      generatedAt: new Date()
    };

    // Anexamos a explicabilidade ao objeto apenas temporariamente,
    // ou se precisarmos dela fora, mas o FinalDecision original não tem.
    // Vamos injetar diretamente no relatório ou adicionar à interface FinalDecision se aplicável.
    // O mais limpo é que o SHCReportEngine fará uso desse explicability depois chamando o DecisionCalculator?
    // Não, é melhor colocar na FinalDecision. Vamos usar o (decision as any).explicability por agora.
    (decision as any).explicability = calc.explicability;

    // Persistir a decisão
    await DecisionHistory.saveDecision(decision);

    return decision;
  }

  /**
   * Recupera a decisão final associada a um runId.
   */
  public static async getDecision(runId: string): Promise<FinalDecision | null> {
    const { data, error } = await supabase
      .from('shc_runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (error || !data || !data.decision_id) return null;

    return {
      decisionId: data.decision_id,
      runId: data.id,
      status: data.decision as any,
      score: 100, // Na prática precisaria estar persistido se formos usar getDecision para score exato, ou buscar do history. O history tem o score.
      blocking: data.blocking,
      deploy: data.deploy_allowed,
      certificate: data.certificate_allowed,
      warnings: data.warnings,
      critical: data.critical,
      reason: data.decision_reason,
      agents: [], // Simplificado
      generatedAt: new Date(data.decision_timestamp)
    };
  }

  public static async canDeploy(runId: string): Promise<boolean> {
    const dec = await this.getDecision(runId);
    return dec ? dec.deploy : false;
  }

  public static async canIssueCertificate(runId: string): Promise<boolean> {
    const dec = await this.getDecision(runId);
    return dec ? dec.certificate : false;
  }

  public static async generateCertificate(runId: string): Promise<any> {
    const canIssue = await this.canIssueCertificate(runId);
    if (!canIssue) throw new Error("A certificação foi negada pelo Decision Engine.");
    
    // Simulação da emissão
    return {
      runId,
      certifiedAt: new Date(),
      issuer: 'ORION MASTER (SHC-00)',
      authority: 'Decision Engine'
    };
  }

  public static async getHistory(limit: number = 20) {
    const { data, error } = await supabase
      .from('shc_runs')
      .select('id, result, report_json, status, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Falha ao obter histórico:', error);
      return [];
    }
    
    return data.map(d => ({
      run_id: d.id,
      status: d.report_json?.decision || (d.status === 'passed' ? 'APPROVED' : 'FAILED'),
      score: d.report_json?.score || 0,
      reason: d.report_json?.reason || 'Sem histórico detalhado',
      generated_at: d.report_json?.generated_at || d.created_at,
      agents: d.report_json?.agents || []
    }));
  }
}
