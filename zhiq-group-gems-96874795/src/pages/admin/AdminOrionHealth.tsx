/**
 * /admin/orion-health — ORION Health & Observability Center (ORION-AI-10)
 *
 * Centro oficial de saúde: status board de todos os componentes,
 * Health Score (disponibilidade + core_health + performance),
 * Centro de Incidentes (abre/fecha automático + resolução auditada),
 * eventos em tempo real, predições e Narrative Engine (Prompt
 * Registry). O que o ambiente não expõe aparece como indisponível —
 * nunca estimado.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import {
  HeartPulse, Loader2, Siren, Radio, Sparkles, LineChart as LineChartIcon, CheckCircle2,
} from "lucide-react";
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip } from "recharts";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const DOT: Record<string, string> = {
  operacional: "bg-emerald-500", sem_trafego: "bg-emerald-300", ocioso: "bg-sky-400",
  sem_dados: "bg-zinc-300", atencao: "bg-amber-500", degradado: "bg-orange-500",
  parado: "bg-red-600", indisponivel: "bg-red-600",
};
const SEV: Record<string, string> = {
  informativo: "bg-sky-100 text-sky-700", baixo: "bg-sky-100 text-sky-700",
  medio: "bg-amber-100 text-amber-700", alto: "bg-orange-100 text-orange-700",
  critico: "bg-red-100 text-red-700",
};

type Aba = "status" | "incidentes" | "eventos" | "predicoes" | "narrativas";

export default function AdminOrionHealth() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("status");
  const [ocupado, setOcupado] = useState("");
  const [filtro, setFiltro] = useState("");
  const [narrativa, setNarrativa] = useState("");

  const { data: rep, isLoading } = useQuery({
    queryKey: ["orion-health-report"], queryFn: () => rpc("health_report"), refetchInterval: 20000,
  });
  const { data: eventos } = useQuery({
    queryKey: ["orion-health-eventos", filtro],
    queryFn: () => rpc("health_events", { p_filtro: filtro || null, p_limite: 60 }),
    refetchInterval: 20000,
  });
  const { data: pred } = useQuery({
    queryKey: ["orion-health-pred"], queryFn: () => rpc("health_predictions"), refetchInterval: 120000,
  });

  const sc = rep?.score || {};
  const status = (sc.status || {}) as Record<string, string>;
  const inc = rep?.incidentes || {};
  const alertas = rep?.alertas || {};

  const resolver = async (id: string) => {
    const causa = window.prompt("Causa raiz (auditada):");
    if (!causa) return;
    setOcupado(id);
    try { await rpc("health_incident_resolver", { p_id: id, p_causa: causa });
      qc.invalidateQueries({ queryKey: ["orion-health-report"] }); }
    catch (e: any) { alert("Erro: " + e.message); }
    finally { setOcupado(""); }
  };

  const gerar = async (tipo: string) => {
    setOcupado("narr"); setNarrativa("");
    try {
      const r = await orionAiText("health",
        `Tipo de resumo: ${tipo}\nEstado real: ${JSON.stringify({ health_score: sc.health_score, disponibilidade: sc.disponibilidade, core: sc.core_health, performance: sc.performance_score, status, incidentes_abertos: (inc.abertos || []).length, consumo_ia: rep?.consumo_ia })}`,
        { promptKey: "health.narrativa", maxTokens: 550 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(""); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        <div className="rounded-3xl bg-gradient-to-r from-[#2b1205] via-[#7a2e0e] to-[#2b1205] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <HeartPulse className="h-8 w-8 text-orange-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">Health & Observability Center</h1>
              <p className="text-sm text-orange-200/80">
                ORION-AI-10 · disponibilidade e incidentes de todo o ecossistema
                {rep?.gerado_em ? ` · atualizado ${rep.gerado_em}` : ""}
              </p>
            </div>
            {[["Health", sc.health_score], ["Disponib.", sc.disponibilidade],
              ["Core", sc.core_health], ["Perf.", sc.performance_score]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-4 py-2.5 text-center ring-1 ring-white/20">
                <p className="text-[10px] font-bold uppercase tracking-wider text-orange-200/70">{l}</p>
                <p className="text-2xl font-black">{v ?? "—"}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["status", HeartPulse, "Status"], ["incidentes", Siren, `Incidentes${(inc.abertos || []).length ? ` (${inc.abertos.length})` : ""}`],
             ["eventos", Radio, "Eventos"], ["predicoes", LineChartIcon, "Predições & Série"],
             ["narrativas", Sparkles, "Narrativas"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#7a2e0e] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-orange-500" /></div>}

        {/* STATUS BOARD */}
        {aba === "status" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {Object.entries(status).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 rounded-2xl border border-zinc-100 p-2.5">
                    {String(v).startsWith("Dado indisponível") || String(v).startsWith("não existe") ? (
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-200" />
                    ) : (
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[v] || "bg-zinc-300"}`} />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-zinc-700">{k.replaceAll("_", " ")}</p>
                      <p className="truncate text-[10px] text-zinc-400">{String(v)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-zinc-400">{sc.formula}</p>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Alertas agregados (health + performance + finance)</h3>
              {[...(alertas.incidentes_abertos || []), ...(alertas.performance || []), ...(alertas.finance || [])].length === 0 ? (
                <p className="text-sm text-zinc-400">✅ Nenhum alerta aberto em nenhuma fonte.</p>
              ) : [...(alertas.incidentes_abertos || []), ...(alertas.performance || []), ...(alertas.finance || [])].map((a: any, i: number) => (
                <p key={i} className="text-xs text-zinc-600">
                  <span className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-black ${SEV[a.severidade] || SEV.informativo}`}>{a.severidade}</span>
                  [{a.fonte}] {a.titulo} · {new Date(a.quando).toLocaleString("pt-BR")}
                </p>
              ))}
              <p className="mt-2 text-[11px] text-zinc-500">
                Consumo IA 30d: {rep?.consumo_ia?.tokens_30d} tokens · US$ {rep?.consumo_ia?.custo_30d_usd} ·
                latência média {rep?.consumo_ia?.latencia_media_ms}ms
              </p>
            </div>
          </div>
        )}

        {/* INCIDENTES */}
        {aba === "incidentes" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Incidentes ativos</h3>
              {!((inc.abertos || []) as any[]).length ? (
                <p className="p-6 text-center text-sm text-zinc-400">✅ Nenhum incidente ativo.</p>
              ) : ((inc.abertos || []) as any[]).map((i: any) => (
                <div key={i.id} className="mb-2 rounded-2xl border border-zinc-100 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${SEV[i.severidade] || ""}`}>{i.severidade}</span>
                    <p className="min-w-0 flex-1 text-sm font-bold text-zinc-800">{i.titulo}</p>
                    <span className="text-[11px] text-zinc-400">aberto há {Number(i.horas_aberto).toFixed(1)}h</span>
                    <button onClick={() => resolver(i.id)} disabled={ocupado === i.id}
                      className="flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Resolver
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-400">origem: {i.origem} {i.impacto && `· impacto: ${i.impacto}`}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Histórico (tempo de resolução)</h3>
              {!((inc.historico || []) as any[]).length ? (
                <p className="text-sm text-zinc-400">Sem incidentes resolvidos ainda.</p>
              ) : ((inc.historico || []) as any[]).map((h: any) => (
                <p key={h.id} className="text-xs text-zinc-600">
                  • {h.titulo} — resolvido em {Number(h.horas_resolucao).toFixed(1)}h
                  {h.causa_raiz && <> · causa: {h.causa_raiz}</>}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* EVENTOS */}
        {aba === "eventos" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <input value={filtro} onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar por módulo, tipo, cidade, severidade…"
              className="mb-3 h-9 w-full rounded-xl border border-zinc-200 px-3 text-sm" />
            <div className="max-h-[30rem] space-y-1 overflow-y-auto">
              {((eventos || []) as any[]).map((e: any, i: number) => (
                <p key={i} className="rounded-lg bg-slate-50 px-3 py-1.5 text-[12px] text-zinc-600">
                  <b className="text-zinc-800">{e.tipo}</b> · {e.origem} · {new Date(e.quando).toLocaleString("pt-BR")}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* PREDIÇÕES */}
        {aba === "predicoes" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Série do Health Score (7 dias · imutável)</h3>
              {!((rep?.serie_7d || []) as any[]).length ? (
                <p className="p-6 text-center text-sm text-zinc-400">O tick (20 min) constrói a série.</p>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={(rep?.serie_7d || []).map((h: any) => ({
                      quando: new Date(h.quando).toLocaleString("pt-BR", { day: "2-digit", hour: "2-digit" }), score: h.score,
                    }))}>
                      <XAxis dataKey="quando" fontSize={10} /><YAxis domain={[0, 100]} fontSize={10} />
                      <Tooltip /><Line dataKey="score" stroke="#ea580c" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm text-xs text-zinc-600">
              <p>Tendência de disponibilidade: <b>{pred?.tendencia_disponibilidade}</b></p>
              <p className="mt-1">Custo IA projetado 30d: US$ {pred?.reuso_performance?.custo_ia_projetado_30d_usd} ·
                Storage: {pred?.reuso_performance?.storage_atual_mb} MB — {pred?.reuso_performance?.nota_upgrade}</p>
              <p className="mt-1 text-[10px] text-zinc-400">{pred?.nota}</p>
            </div>
          </div>
        )}

        {/* NARRATIVAS */}
        {aba === "narrativas" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              {["executivo", "tecnico", "operacional", "financeiro", "diario", "semanal", "mensal"].map((t) => (
                <button key={t} onClick={() => gerar(t)} disabled={!!ocupado}
                  className="flex items-center gap-1 rounded-xl bg-[#7a2e0e] px-3 py-2 text-xs font-black capitalize text-white disabled:opacity-50">
                  {ocupado === "narr" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {t}
                </button>
              ))}
            </div>
            {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-orange-50 p-3 text-sm text-zinc-800">{narrativa}</p>}
            <p className="mt-2 text-[10px] text-zinc-400">Prompt Registry: health.narrativa · via Gateway v3 · nunca inventa números.</p>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Health & Observability Center v2.0 · ORION-AI-10 · Core Monitoring · incidentes auto-abrem/fecham ·
          Trace Engine (orion_trace) · histórico imutável · limitações declaradas, nunca estimadas
        </p>
      </div>
    </div>
  );
}
