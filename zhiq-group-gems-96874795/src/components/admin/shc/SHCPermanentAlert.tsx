import { useState, useEffect } from "react";
import { AlertTriangle, ShieldAlert, CheckCircle2, PauseCircle, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { SHCModule } from "@/types/shc";

/**
 * Centro de Alertas SHC (ASHC FASE 2).
 * Correções da auditoria 2026-07-27: a query anterior usava coluna
 * (last_execution) e valor de enum (in_test) inexistentes — falhava 100% das
 * vezes e o erro era engolido, exibindo "sistema 100% saudável" com módulos
 * reprovados no banco. Agora consulta o schema real, trata erro e mostra
 * apenas dados do banco.
 */
export function SHCPermanentAlert() {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<SHCModule[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAlerts = async () => {
      const { data, error } = await supabase
        .from("shc_modules")
        .select("id, name, status, quality_score, last_run_at, coordinator_ai, slug")
        .in("status", ["failed", "error", "inactive"])
        .order("last_run_at", { ascending: false, nullsFirst: false })
        .limit(20);

      if (error) {
        console.error("[SHCPermanentAlert] falha ao carregar alertas:", error);
        setLoadError(error.message);
        return;
      }
      setLoadError(null);
      setAlerts((data ?? []) as SHCModule[]);
    };

    fetchAlerts();

    const channel = supabase
      .channel("shc-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "shc_modules" }, () => {
        fetchAlerts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const totalPending = alerts.length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="fixed bottom-6 right-6 z-50 flex items-center justify-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-full shadow-2xl hover:bg-slate-800 transition-all border border-slate-700 hover:scale-105 group"
        >
          <div className="relative">
            <AlertTriangle className="w-5 h-5 text-amber-400 group-hover:animate-pulse" />
            {totalPending > 0 && (
              <span className="absolute -top-2 -right-2 flex items-center justify-center min-w-[20px] h-5 bg-red-500 text-white text-[10px] font-bold rounded-full px-1 border-2 border-slate-900">
                {totalPending}
              </span>
            )}
          </div>
          <span className="font-semibold tracking-wide text-sm hidden sm:inline-block">Alertas SHC</span>
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[700px] h-[80vh] flex flex-col p-0 overflow-hidden bg-slate-50">
        <DialogHeader className="p-6 pb-4 bg-white border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">Centro de Alertas SHC</DialogTitle>
              <p className="text-sm text-slate-500 mt-1">Módulos reprovados, com erro ou inativos — direto do banco.</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loadError ? (
            <div className="text-center text-red-500 py-10 flex flex-col items-center">
              <XCircle className="w-12 h-12 mb-3 opacity-60" />
              <p className="font-semibold">Não foi possível carregar os alertas.</p>
              <p className="text-sm text-red-400 mt-1 font-mono break-all px-6">{loadError}</p>
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center text-slate-400 py-10 flex flex-col items-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3 opacity-50" />
              <p>Nenhum módulo em estado de falha no momento.</p>
            </div>
          ) : (
            alerts.map((alert) => (
              <div key={alert.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    {alert.status === 'failed' && <ShieldAlert className="w-5 h-5 text-red-500" />}
                    {alert.status === 'error' && <XCircle className="w-5 h-5 text-red-500" />}
                    {alert.status === 'inactive' && <PauseCircle className="w-5 h-5 text-slate-400" />}
                    <h3 className="font-bold text-slate-800 text-lg">{alert.name}</h3>
                  </div>
                  <Badge variant={alert.status === 'inactive' ? 'secondary' : 'destructive'}>
                    {alert.status === 'failed' ? 'Reprovado' : alert.status === 'error' ? 'Erro de Execução' : 'Inativo'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm mt-4 p-3 bg-slate-50 rounded-lg">
                  <div>
                    <span className="text-slate-500 block text-xs uppercase font-semibold mb-1">Coordenador</span>
                    <span className="font-medium text-slate-700">{alert.coordinator_ai ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-xs uppercase font-semibold mb-1">Última Execução</span>
                    <span className="font-medium text-slate-700">
                      {alert.last_run_at ? new Date(alert.last_run_at).toLocaleString('pt-BR') : 'Nunca'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-xs uppercase font-semibold mb-1">Score Atual</span>
                    <span className="font-bold font-mono text-slate-800">
                      {alert.quality_score != null ? `${alert.quality_score}%` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-xs uppercase font-semibold mb-1">Prioridade</span>
                    <span className={`font-bold ${alert.status === 'inactive' ? 'text-slate-500' : 'text-red-600'}`}>
                      {alert.status === 'inactive' ? 'BAIXA' : 'MÁXIMA / BLOQUEANTE'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
