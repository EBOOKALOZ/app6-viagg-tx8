/**
 * /admin/orion-performance — ORION Performance AI (ORION-AI-11)
 *
 * Plataforma autoavaliável: Performance Score com componentes e
 * deduções explicáveis, diagnóstico técnico real (queries lentas,
 * índices sugeridos, bloat, storage, filas, crons, gateway P95/P99),
 * Centro de Otimização (sugestão + justificativa + impacto + risco),
 * histórico/tendência (nunca apagado) e Narrative Engine via
 * Gateway v3 + Prompt Registry. O que não é mensurável vem declarado.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import {
  Gauge, Loader2, RefreshCw, Stethoscope, Wrench, History as HistoryIcon,
  Bell, Sparkles, LineChart as LineChartIcon,
} from "lucide-react";
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip } from "recharts";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const SEV: Record<string, string> = {
  critico: "bg-red-100 text-red-700", urgente: "bg-orange-100 text-orange-700",
  importante: "bg-amber-100 text-amber-700", observacao: "bg-sky-100 text-sky-700",
};
const PRIO: Record<string, string> = {
  CRITICO: "bg-red-600 text-white", ALTO: "bg-red-100 text-red-700",
  MEDIO: "bg-amber-100 text-amber-700", BAIXO: "bg-sky-100 text-sky-700",
  INFORMATIVO: "bg-zinc-100 text-zinc-500",
};

type Aba = "diagnostico" | "otimizador" | "historico" | "alertas" | "narrativas";

export default function AdminOrionPerformance() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("diagnostico");
  const [ocupado, setOcupado] = useState("");
  const [narrativa, setNarrativa] = useState("");

  const { data: sc, isLoading } = useQuery({
    queryKey: ["orion-perf-score"], queryFn: () => rpc("performance_score"), refetchInterval: 30000,
  });
  const { data: hist } = useQuery({
    queryKey: ["orion-perf-hist"], queryFn: () => rpc("performance_history", { p_dias: 30 }), refetchInterval: 60000,
  });
  const { data: alertas } = useQuery({
    queryKey: ["orion-perf-alertas"], queryFn: () => rpc("performance_alerts"), refetchInterval: 60000,
  });
  const { data: pred } = useQuery({
    queryKey: ["orion-perf-pred"], queryFn: () => rpc("performance_predictions"), refetchInterval: 120000,
  });
  const [otim, setOtim] = useState<any>(null);

  const rep = sc?.report || {};
  const comps = (sc?.componentes || {}) as Record<string, any>;

  const rodarOtimizador = async () => {
    setOcupado("otim");
    try { setOtim(await rpc("performance_optimizer")); }
    catch (e: any) { alert("Erro: " + e.message); }
    finally { setOcupado(""); }
  };

  const gerarNarrativa = async (tipo: string) => {
    setOcupado("narr"); setNarrativa("");
    try {
      const r = await orionAiText("performance",
        `Tipo de resumo: ${tipo}\nMétricas reais: ${JSON.stringify({ score: sc?.score, componentes: comps, banco: rep.banco, gateway: rep.gateway_ia, filas: rep.filas, crons: rep.crons, previsoes: pred })}`,
        { promptKey: "performance.narrativa", maxTokens: 550 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(""); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        <div className="rounded-3xl bg-gradient-to-r from-[#12262b] via-[#1d4a52] to-[#12262b] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Gauge className="h-8 w-8 text-teal-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Performance AI</h1>
              <p className="text-sm text-teal-200/80">
                ORION-AI-11 · plataforma autoavaliável · nada inventado, lacunas declaradas
                {rep.gerado_em ? ` · atualizado ${rep.gerado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-200/70">Performance Score</p>
              <p className="text-4xl font-black">{sc?.score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Object.entries(comps).map(([k, v]: any) => (
              <div key={k} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-teal-200/70">{k.replaceAll("_", " ")}</p>
                <p className="text-lg font-black">{v.score}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["diagnostico", Stethoscope, "Diagnóstico"], ["otimizador", Wrench, "Otimizador"],
             ["historico", HistoryIcon, "Histórico & Tendência"],
             ["alertas", Bell, `Alertas${((alertas || []) as any[]).length ? ` (${(alertas as any[]).length})` : ""}`],
             ["narrativas", Sparkles, "Narrativas"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#1d4a52] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-teal-500" /></div>}

        {/* DIAGNÓSTICO */}
        {aba === "diagnostico" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Banco</h3>
                <ul className="space-y-1 text-xs text-zinc-600">
                  <li>Cache hit: <b>{rep.banco?.cache_hit_pct}%</b></li>
                  <li>Tamanho: <b>{rep.banco?.tamanho_mb} MB</b> · Conexões: {rep.banco?.conexoes}</li>
                  <li>Locks bloqueados: <b>{rep.banco?.locks_bloqueados}</b> · Deadlocks acum.: {rep.banco?.deadlocks_acumulados}</li>
                  <li>Queries ativas &gt;30s: <b>{rep.banco?.queries_ativas_longas}</b></li>
                </ul>
                <p className="mt-2 text-[10px] font-bold uppercase text-zinc-400">Deduções: {JSON.stringify(comps.banco?.deducoes)}</p>
              </div>
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Gateway IA</h3>
                <ul className="space-y-1 text-xs text-zinc-600">
                  <li>Chamadas 24h: <b>{rep.gateway_ia?.chamadas_24h}</b> · Erros: <b>{rep.gateway_ia?.erros_24h}</b></li>
                  <li>Cache hit 7d: <b>{rep.gateway_ia?.cache_hit_pct}%</b></li>
                  <li>P95: <b>{rep.gateway_ia?.p95_ms ? Math.round(rep.gateway_ia.p95_ms) + "ms" : "—"}</b> · P99: <b>{rep.gateway_ia?.p99_ms ? Math.round(rep.gateway_ia.p99_ms) + "ms" : "—"}</b></li>
                  <li>Custo 7d: <b>US$ {rep.gateway_ia?.custo_7d_usd}</b></li>
                </ul>
              </div>
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Filas & Crons</h3>
                <ul className="space-y-1 text-xs text-zinc-600">
                  <li>RIDV pendentes: {rep.filas?.ridv_pendentes} · Pacotes: {rep.filas?.pacotes_montando}</li>
                  <li>Motor aguardando: {rep.filas?.motor_aguardando} · Despacho: {rep.filas?.dispatch_agendadas}</li>
                  <li>DLQ total: <b>{rep.filas?.dlq_total}</b></li>
                  <li>Crons ativos: {rep.crons?.ativos} · Falhas 24h: <b>{rep.crons?.falhas_24h}</b> · média {rep.crons?.duracao_media_s}s</li>
                </ul>
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Consultas mais lentas (pg_stat_statements)</h3>
              {Array.isArray(rep.consultas_lentas) ? rep.consultas_lentas.map((q: any, i: number) => (
                <div key={i} className="mb-1.5 rounded-xl bg-slate-50 p-2.5">
                  <code className="block truncate text-[11px] text-zinc-600">{q.query}</code>
                  <p className="text-[10px] text-zinc-400">{q.chamadas} chamadas · média {q.media_ms}ms · total {q.total_s}s</p>
                </div>
              )) : <p className="text-sm text-zinc-400">{String(rep.consultas_lentas)}</p>}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Maiores tabelas</h3>
                {((rep.maiores_tabelas || []) as any[]).map((t: any) => (
                  <p key={t.tabela} className="text-xs text-zinc-600">• {t.tabela}: <b>{t.mb} MB</b></p>
                ))}
              </div>
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Dados parciais (declarados)</h3>
                {((rep.dados_parciais || []) as string[]).map((s, i) => (
                  <p key={i} className="text-xs text-zinc-500">• {s}</p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* OTIMIZADOR */}
        {aba === "otimizador" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <button onClick={rodarOtimizador} disabled={!!ocupado}
              className="flex items-center gap-2 rounded-xl bg-[#1d4a52] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
              {ocupado === "otim" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
              Executar Centro de Otimização
            </button>
            {otim && ((otim.sugestoes || []) as any[]).map((s: any, i: number) => (
              <div key={i} className="mt-3 rounded-2xl border border-zinc-100 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${PRIO[s.prioridade] || PRIO.INFORMATIVO}`}>{s.prioridade}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{s.area}</span>
                  <p className="min-w-0 flex-1 text-sm font-bold text-zinc-800">{s.sugestao}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-600">Justificativa: {s.justificativa}</p>
                <p className="text-xs text-zinc-500">Impacto estimado: {s.impacto_estimado} · Risco: {s.risco}</p>
              </div>
            ))}
          </div>
        )}

        {/* HISTÓRICO */}
        {aba === "historico" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 flex items-center gap-1 text-sm font-black text-zinc-700">
                <LineChartIcon className="h-4 w-4" /> Evolução do Score (30 dias · nunca apagado)
              </h3>
              {!((hist || []) as any[]).length ? (
                <p className="p-6 text-center text-sm text-zinc-400">O tick horário constrói a série automaticamente.</p>
              ) : (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={(hist || []).map((h: any) => ({
                      quando: new Date(h.quando).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit" }),
                      score: h.score,
                    }))}>
                      <XAxis dataKey="quando" fontSize={10} />
                      <YAxis domain={[0, 100]} fontSize={10} />
                      <Tooltip />
                      <Line dataKey="score" name="Score" stroke="#0d9488" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Predições ({pred?.base})</h3>
              <ul className="space-y-1 text-xs text-zinc-600">
                <li>Tendência do score: <b>{pred?.tendencia_score}</b></li>
                <li>Custo IA projetado 30d: <b>US$ {pred?.custo_ia_projetado_30d_usd}</b></li>
                <li>Storage: <b>{pred?.storage_atual_mb} MB</b> — {pred?.nota_upgrade}</li>
                <li>Carga: {pred?.carga?.chamadas_ia_por_dia_7d} chamadas IA/dia · {pred?.carga?.eventos_nervoso_por_dia_7d} eventos/dia</li>
              </ul>
            </div>
          </div>
        )}

        {/* ALERTAS */}
        {aba === "alertas" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            {!((alertas || []) as any[]).length ? (
              <div className="p-10 text-center text-zinc-400">✅ Nenhum alerta de performance aberto.</div>
            ) : ((alertas || []) as any[]).map((a: any) => (
              <div key={a.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 p-3">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${SEV[a.severidade] || SEV.observacao}`}>{a.severidade}</span>
                <p className="min-w-0 flex-1 text-sm font-semibold text-zinc-700">{a.titulo}</p>
                <span className="text-[11px] text-zinc-400">{new Date(a.criado_em).toLocaleString("pt-BR")}</span>
              </div>
            ))}
          </div>
        )}

        {/* NARRATIVAS */}
        {aba === "narrativas" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs text-zinc-400">
              Narrative Engine — resumos gerados pelo Gateway v3 com o prompt oficial versionado
              (Prompt Registry: performance.narrativa). Nunca inventa números.
            </p>
            <div className="flex flex-wrap gap-2">
              {["executivo", "tecnico", "financeiro", "operacional"].map((t) => (
                <button key={t} onClick={() => gerarNarrativa(t)} disabled={!!ocupado}
                  className="flex items-center gap-1 rounded-xl bg-[#1d4a52] px-4 py-2 text-xs font-black capitalize text-white disabled:opacity-50">
                  {ocupado === "narr" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Resumo {t}
                </button>
              ))}
            </div>
            {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-teal-50 p-3 text-sm text-zinc-800">{narrativa}</p>}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Performance AI v1.0 · ORION-AI-11 · Core Intelligence · histórico imutável ·
          toda sugestão com justificativa + impacto + risco · integrado ao orion_core_health()
        </p>
      </div>
    </div>
  );
}
