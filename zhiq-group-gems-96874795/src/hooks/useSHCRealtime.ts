import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SHCModule, SHCRun, SHCTest, SHCCorrection, SHCCertificate, SHCLog } from '../types/shc';

/**
 * Fonte única de dados do painel SHC (ASHC FASE 2).
 *
 * Correções da auditoria 2026-07-27:
 *  - shc_certificates não tem created_at (ordenava por coluna inexistente e a
 *    falha coletiva do Promise.all zerava TODAS as coleções → painel vazio).
 *    Agora cada tabela falha isoladamente e ordena por coluna real.
 *  - Canal realtime com nome único por instância (antes toda instância usava
 *    'shc-realtime', duplicando tópicos no mesmo socket).
 *  - shc_logs incluída (evidência de execução do motor oficial).
 *  - Consultas com limite explícito (select * ilimitado crescia sem teto).
 */
export function useSHCRealtime() {
  const [modules, setModules] = useState<SHCModule[]>([]);
  const [runs, setRuns] = useState<SHCRun[]>([]);
  const [tests, setTests] = useState<SHCTest[]>([]);
  const [corrections, setCorrections] = useState<SHCCorrection[]>([]);
  const [certificates, setCertificates] = useState<SHCCertificate[]>([]);
  const [logs, setLogs] = useState<SHCLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const channelId = useRef(`shc-realtime-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      const results = await Promise.allSettled([
        supabase.from('shc_modules').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('shc_runs').select('*').order('created_at', { ascending: false }).limit(400),
        supabase.from('shc_tests').select('*').order('created_at', { ascending: false }).limit(2000),
        supabase.from('shc_corrections').select('*').order('created_at', { ascending: false }).limit(400),
        supabase.from('shc_certificates').select('*').order('issued_at', { ascending: false }).limit(200),
        supabase.from('shc_logs').select('*').order('created_at', { ascending: false }).limit(400),
      ]);
      if (!mounted) return;

      const setters = [setModules, setRuns, setTests, setCorrections, setCertificates, setLogs] as const;
      const tables = ['shc_modules', 'shc_runs', 'shc_tests', 'shc_corrections', 'shc_certificates', 'shc_logs'];
      let firstError: Error | null = null;

      results.forEach((res, i) => {
        if (res.status === 'fulfilled' && !res.value.error) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setters[i](res.value.data as any[]);
        } else {
          const cause = res.status === 'fulfilled' ? res.value.error : res.reason;
          const err = new Error(`[SHC] falha ao carregar ${tables[i]}: ${cause?.message ?? cause}`);
          console.error(err);
          if (!firstError) firstError = err;
        }
      });

      setError(firstError);
      setIsLoading(false);
    };

    fetchData();

    const upsert = <T extends { id: string }>(setter: React.Dispatch<React.SetStateAction<T[]>>) =>
      (payload: { eventType: string; new: unknown; old: unknown }) => {
        if (payload.eventType === 'INSERT') setter(prev => [payload.new as T, ...prev]);
        if (payload.eventType === 'UPDATE') setter(prev => prev.map(x => x.id === (payload.new as T).id ? payload.new as T : x));
        if (payload.eventType === 'DELETE') setter(prev => prev.filter(x => x.id !== (payload.old as T).id));
      };

    const channel = supabase.channel(channelId.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shc_modules' }, upsert(setModules))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shc_runs' }, upsert(setRuns))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shc_tests' }, upsert(setTests))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shc_corrections' }, upsert(setCorrections))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shc_certificates' }, upsert(setCertificates))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shc_logs' }, upsert(setLogs))
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error(`[SHC] canal realtime em estado ${status}`);
        }
      });

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    modules,
    runs,
    tests,
    corrections,
    certificates,
    logs,
    isLoading,
    error,
    // Helper aggregations
    getLatestRunForModule: (moduleId: string) => runs.filter(r => r.module_id === moduleId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0],
    getTestsForRun: (runId: string) => tests.filter(t => t.run_id === runId)
  };
}
