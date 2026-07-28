/**
 * Cliente do executor oficial ASHC (Edge Function shc-executor).
 *
 * ÚNICO caminho de execução de homologação exposto ao painel (ETAPA 4 —
 * arquitetura única). A execução acontece no servidor (RPC atômica
 * shc_run_module_audit v2.1, FAIL CLOSED): fechar a aba não interrompe nem
 * corrompe a run. O resultado chega ao painel via Realtime (shc_runs/
 * shc_tests/shc_logs estão na publication) e pelo retorno desta chamada.
 */
import { supabase } from '@/integrations/supabase/client';
import type { SHCDecision } from '@/types/shc';

export interface ExecutorCheck {
  name: string;
  status: 'passed' | 'warning' | 'failed';
  severity?: 'P0' | 'P1' | 'P2' | 'P3' | 'NONE';
  agent?: string;
  /** Obrigatória para status 'passed' — o motor reprova check aprovado sem evidência. */
  evidence?: string;
}

export interface ExecutorEvidence {
  version?: string;
  branch?: string;
  commit_hash?: string;
  executed_by?: string;
  evidence_summary?: string;
  /** Tabelas cuja existência/RLS/grants o motor verifica direto no catálogo. */
  tables?: string[];
  /** RPCs cuja existência o motor verifica em pg_proc. */
  rpcs?: string[];
  checks?: ExecutorCheck[];
  agents?: string[];
}

export interface ExecutorResult {
  ok: boolean;
  module?: string;
  run_id?: string;
  decision?: SHCDecision;
  score?: number;
  tests?: number;
  pass?: number;
  fail?: number;
  warnings?: number;
  p0p1?: number;
  certificate_hash?: string | null;
  error?: string;
}

export async function runModuleAudit(
  slug: string,
  evidence?: ExecutorEvidence,
): Promise<ExecutorResult> {
  const { data, error } = await supabase.functions.invoke('shc-executor', {
    body: { slug, evidence },
  });
  if (error) {
    // FunctionsHttpError carrega o body real da resposta em context.
    let message = error.message;
    try {
      const ctx = await (error as { context?: Response }).context?.json();
      if (ctx && typeof ctx.error === 'string') message = ctx.error;
    } catch {
      // body não-JSON: mantém a mensagem original do erro HTTP
    }
    return { ok: false, error: message };
  }
  return data as ExecutorResult;
}
