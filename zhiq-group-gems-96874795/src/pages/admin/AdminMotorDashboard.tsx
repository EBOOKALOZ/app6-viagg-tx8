/**
 * AdminMotorDashboard — Painel Operacional do Motor Central (M53.2A)
 *
 * Página NOVA (não altera nenhum painel existente). Consome exclusivamente
 * as RPCs oficiais motor_dashboard() e motor_metrics() — dados reais.
 * Dark-theme padrão do admin (#0D0F12 / #1B1F24 / #FF6A00).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity, Gauge, Layers, Server, ShieldCheck, Timer,
  RefreshCw, Loader2, AlertCircle, Flag,
} from "lucide-react";

const MODE_COLORS: Record<string, string> = {
  off:     "bg-slate-500/15 text-slate-300 border-slate-500/30",
  observe: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  shadow:  "bg-violet-500/15 text-violet-300 border-violet-500/30",
  canary:  "bg-amber-500/15 text-amber-300 border-amber-500/30",
  active:  "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

function ModeBadge({ mode }: { mode: string }) {
  const cls = MODE_COLORS[mode] ?? MODE_COLORS.off;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wide ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {mode}
    </span>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-[#0D0F12] border border-[#2A3038] p-5 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-[#F5F7FA] font-black text-xs uppercase tracking-widest">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#2A3038]/50 last:border-0">
      <span className="text-[12px] text-[#A7B0BE]">{label}</span>
      <span className={`text-[13px] font-black tabular-nums ${accent ? "text-[#FF6A00]" : "text-[#F5F7FA]"}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}

export default function AdminMotorDashboard() {
  const [hours, setHours] = useState(24);

  const dash = useQuery({
    queryKey: ["motor-dashboard"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("motor_dashboard");
      if (error) throw error;
      return data as any;
    },
  });

  const metrics = useQuery({
    queryKey: ["motor-metrics", hours],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("motor_metrics", { p_hours: hours });
      if (error) throw error;
      return data as any;
    },
  });

  if (dash.isLoading) {
    return (
      <div className="min-h-screen bg-[#1B1F24] flex items-center justify-center gap-3 text-[#A7B0BE]">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-xs font-bold uppercase tracking-widest">Carregando Motor Central…</span>
      </div>
    );
  }

  if (dash.isError) {
    return (
      <div className="min-h-screen bg-[#1B1F24] p-6">
        <div className="max-w-xl mx-auto mt-20 rounded-2xl bg-red-500/10 border border-red-500/30 p-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <p className="text-red-300 font-bold text-sm">Motor Central indisponível</p>
            <p className="text-[#A7B0BE] text-xs mt-1">
              A camada de compatibilidade (migration 053/054) ainda não foi aplicada neste ambiente,
              ou você não tem permissão de admin. Nenhum fluxo da plataforma é afetado por isso.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const d = dash.data ?? {};
  const estado = d.estado ?? {};
  const flags: Record<string, string> = estado.flags ?? {};
  const motor = d.motor ?? {};
  const infra = d.infraestrutura ?? {};
  const rpcs: Record<string, boolean> = infra.rpcs_criticas ?? {};
  const m = metrics.data ?? d.fluxo_24h ?? {};
  const porModo: Record<string, number> = m.por_modo ?? {};
  const porStatus: Record<string, number> = m.por_status ?? {};

  return (
    <div className="min-h-screen bg-[#1B1F24] p-4 sm:p-6 space-y-4">
      {/* Cabeçalho */}
      <div className="rounded-2xl bg-gradient-to-br from-[#FF6A00]/20 to-[#0D0F12] border border-[#FF6A00]/30 p-5 flex flex-wrap items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[#FF6A00]/20 border border-[#FF6A00]/30 flex items-center justify-center">
          <Gauge className="w-6 h-6 text-[#FF6A00]" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <p className="text-[10px] font-black text-[#FF6A00] uppercase tracking-widest">Motor Central · Camada de Compatibilidade</p>
          <h1 className="text-[#F5F7FA] font-black text-xl">{estado.versao ?? "—"}</h1>
          <p className="text-[#A7B0BE] text-[11px]">
            uptime {estado.uptime_horas ?? "—"}h · instalado {estado.instalado_em ? new Date(estado.instalado_em).toLocaleString("pt-BR") : "—"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-2">
            <span className="text-[10px] text-[#A7B0BE] font-bold uppercase self-center">Postar:</span>
            <ModeBadge mode={flags["entry.manual"] ?? "off"} />
          </div>
          <div className="flex gap-2">
            <span className="text-[10px] text-[#A7B0BE] font-bold uppercase self-center">Operador:</span>
            <ModeBadge mode={flags["entry.operator"] ?? "off"} />
          </div>
          <button
            onClick={() => { dash.refetch(); metrics.refetch(); }}
            className="flex items-center gap-1.5 text-[10px] font-bold text-[#A7B0BE] hover:text-[#FF6A00] uppercase tracking-wide"
          >
            <RefreshCw className="w-3 h-3" /> Atualizar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Fluxo */}
        <Card icon={<Activity className="w-4 h-4 text-sky-400" />} title={`Fluxo (${m.janela_horas ?? hours}h)`}>
          <div className="flex gap-2 mb-2">
            {[6, 24, 72].map(h => (
              <button key={h} onClick={() => setHours(h)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                  hours === h ? "bg-[#FF6A00]/20 text-[#FF6A00] border-[#FF6A00]/40"
                              : "text-[#A7B0BE] border-[#2A3038]"}`}>
                {h}h
              </button>
            ))}
          </div>
          <Metric label="Requisições" value={m.throughput_total} accent />
          {Object.entries(porModo).map(([k, v]) => (
            <Metric key={k} label={`· modo ${k}`} value={v} />
          ))}
          <Metric label="Sucesso" value={m.sucesso} />
          <Metric label="Erros" value={m.erros} />
          <Metric label="Rejeições por limite" value={m.rejeicoes_limite} />
          <Metric label="Fallbacks ao legado" value={m.fallbacks} />
        </Card>

        {/* Latência */}
        <Card icon={<Timer className="w-4 h-4 text-amber-400" />} title="Latência do Motor">
          <Metric label="Média" value={m.latencia_ms?.media != null ? `${m.latencia_ms.media} ms` : "—"} accent />
          <Metric label="p95" value={m.latencia_ms?.p95 != null ? `${m.latencia_ms.p95} ms` : "—"} />
          <Metric label="Máx" value={m.latencia_ms?.max != null ? `${m.latencia_ms.max} ms` : "—"} />
          <Metric label="Fila de lotes (available)" value={m.fila_lotes_available} />
          <Metric label="Eventos na janela" value={m.eventos_janela} />
          <Metric label="Lotes do legado observados" value={m.legado_observado} />
        </Card>

        {/* Motor */}
        <Card icon={<Layers className="w-4 h-4 text-violet-400" />} title="Motor">
          <Metric label="Lotes criados pelo Motor (total)" value={motor.lotes_criados_motor_total} accent />
          <Metric label="Execuções de IA (24h)" value={motor.ia_execucoes_24h} />
          <Metric label="Verificações de limite (24h)" value={motor.limites_aplicados_24h} />
          <Metric label="Eventos de auditoria (total)" value={motor.auditorias_total} />
          {Object.entries(porStatus).slice(0, 6).map(([k, v]) => (
            <Metric key={k} label={`· ${k}`} value={v} />
          ))}
        </Card>

        {/* Flags */}
        <Card icon={<Flag className="w-4 h-4 text-[#FF6A00]" />} title="Feature Flags">
          {Object.entries(flags)
            .filter(([k]) => !k.startsWith("meta."))
            .map(([k, v]) => (
              <Metric key={k} label={k} value={
                ["off","observe","shadow","canary","active"].includes(v)
                  ? <ModeBadge mode={v} /> : v
              } />
            ))}
          <p className="text-[10px] text-[#A7B0BE]/50 italic mt-2">
            Alteração de flags: apenas via service role (SQL Editor / backoffice). Rollback imediato sem deploy.
          </p>
        </Card>

        {/* Canary */}
        <Card icon={<ShieldCheck className="w-4 h-4 text-amber-400" />} title="Regras de Canary">
          {(estado.canary_rules ?? []).length === 0 ? (
            <p className="text-[12px] text-[#A7B0BE]/60">Nenhuma regra configurada. No modo canary, tráfego sem regra roda como shadow.</p>
          ) : (
            (estado.canary_rules as any[]).map((r, i) => (
              <Metric key={i} label={`${r.kind} = ${r.value} (${r.origin})`}
                      value={r.enabled ? "ativa" : "inativa"} accent={r.enabled} />
            ))
          )}
        </Card>

        {/* Infra */}
        <Card icon={<Server className="w-4 h-4 text-emerald-400" />} title="Infraestrutura">
          {Object.entries(rpcs).map(([k, v]) => (
            <Metric key={k} label={k} value={v ? "✓ disponível" : "✗ ausente"} accent={!v} />
          ))}
          <Metric label="pg_cron" value={infra.pg_cron ? "instalado" : "ausente"} />
          <Metric label="Cron jobs" value={infra.cron_jobs} />
          <Metric label="Workers de longa duração" value={`${infra.workers ?? 0} (arquitetura sem workers)`} />
          <Metric label="Tamanho pub_events" value={infra.tamanho_pub_events} />
        </Card>
      </div>

      <p className="text-[10px] text-[#A7B0BE]/40 text-center italic">
        Dados 100% reais via motor_dashboard() / motor_metrics() · atualização automática a cada 30s
      </p>
    </div>
  );
}
