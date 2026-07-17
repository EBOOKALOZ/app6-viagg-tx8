/**
 * /admin/orion-observability — ORION Observability AI (ORION-AI-51)
 *
 * Centro de Observabilidade do ORION: visao unificada em tempo real de
 * metricas, logs, traces distribuidos, performance, disponibilidade, SLI/SLO,
 * health e RCA. Somente leitura das fontes reais (cron.job_run_details,
 * pg_stat_statements, client_errors, orion_ai_log, orion_eventos). Nunca
 * registra secrets (obs_sanitize). 6 scores explicaveis (OHS/PHS/DAS/LQS/TPS/
 * SLO Compliance). Tick a cada 1 min.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity, Loader2, Gauge, LineChart, ScrollText, GitBranch, Zap, ShieldCheck,
  Target, Server, Network, Bell, BarChart3, Settings2,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const scoreColor = (s: number) => s >= 90 ? "text-emerald-300" : s >= 75 ? "text-lime-300" : s >= 50 ? "text-amber-300" : "text-red-300";
const EST: Record<string, string> = {
  saudavel: "bg-emerald-100 text-emerald-700", atencao: "bg-amber-100 text-amber-700",
  degradado: "bg-orange-100 text-orange-700", critico: "bg-red-100 text-red-700",
};
const NIVEL: Record<string, string> = {
  INFO: "bg-slate-100 text-slate-600", WARNING: "bg-amber-100 text-amber-700",
  ERROR: "bg-orange-100 text-orange-700", CRITICAL: "bg-red-100 text-red-700", FATAL: "bg-red-200 text-red-800",
};
const IMP: Record<string, string> = { baixo: "bg-slate-100 text-slate-600", medio: "bg-amber-100 text-amber-700", alto: "bg-red-100 text-red-700" };

type Aba = "resumo" | "metricas" | "logs" | "traces" | "performance" | "disponibilidade" | "sli" | "slo" | "servicos" | "dependencias" | "alertas" | "estatisticas" | "config";

function Evid({ dados }: { dados: any }) {
  return <pre className="overflow-auto rounded-xl bg-white p-2 text-[10px] text-zinc-500">{JSON.stringify(dados, null, 2)}</pre>;
}

export default function AdminOrionObservability() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [rcaSrv, setRcaSrv] = useState("");
  const [rca, setRca] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-observability"], queryFn: () => rpc("obs_dashboard"), refetchInterval: 30000,
  });

  const ov = dash?.overview || {};
  const met = dash?.metricas || {};
  const logs = dash?.logs || {};
  const traces = dash?.traces || {};
  const perf = dash?.performance || {};
  const disp = dash?.disponibilidade || {};
  const sli = dash?.sli || {};
  const slo = dash?.slo || {};
  const srv = dash?.servicos || {};
  const deps = dash?.dependencias || {};
  const alertas = dash?.alertas || {};
  const est = dash?.estatisticas || {};
  const cfg = dash?.config || {};

  const runRca = async (servico: string) => {
    setBusy(true); setRca(null);
    try { setRca(await rpc("observability_rca", { p_servico: servico })); }
    catch (e: any) { setRca({ erro: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER — Dashboard Executivo */}
        <div className="rounded-3xl bg-gradient-to-r from-[#071018] via-[#0e2230] to-[#071018] p-6 text-white shadow-xl ring-1 ring-cyan-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 ring-1 ring-cyan-500/30">
              <Activity className="h-8 w-8 text-cyan-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Observability</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-51 · visão unificada em tempo real · métricas + logs + traces + SLI/SLO + RCA · evidência real, nunca inventa
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-cyan-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-200/70">Observability Health Score</p>
              <p className={`text-4xl font-black ${scoreColor(ov.ohs ?? 0)}`}>{ov.ohs ?? "—"}</p>
              <p className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">uptime {ov.uptime_pct ?? "—"}%</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[["Disponibilidade", `${ov.disponibilidade_geral ?? "—"}%`], ["Resp. média", `${ov.tempo_medio_resposta_ms ?? "—"}ms`],
              ["Taxa erro", `${ov.taxa_erro ?? "—"}%`], ["Serviços ativos", ov.servicos_ativos],
              ["Degradados", ov.servicos_degradados], ["Logs/min", ov.logs_por_min],
              ["Usuários online", ov.usuarios_online]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Gauge, "Resumo"], ["metricas", LineChart, "Métricas"], ["logs", ScrollText, "Logs"],
             ["traces", GitBranch, "Traces"], ["performance", Zap, "Performance"], ["disponibilidade", ShieldCheck, "Disponibilidade"],
             ["sli", Target, "SLI"], ["slo", Target, "SLO"], ["servicos", Server, "Serviços"],
             ["dependencias", Network, "Dependências"], ["alertas", Bell, "Alertas"],
             ["estatisticas", BarChart3, "Estatísticas"], ["config", Settings2, "Configurações"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-bold ${aba === k ? "bg-[#0e2230] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-cyan-600" /></div>}

        {/* RESUMO */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[["OHS · Observability Health", ov.ohs, "saúde geral (média ponderada)"],
                ["PHS · Performance Health", ov.phs, "penalizado por latência de RPC"],
                ["DAS · Availability", ov.das, "disponibilidade média dos serviços"],
                ["LQS · Log Quality", ov.lqs, "logs com contexto e não-fatais"],
                ["TPS · Trace Precision", ov.tps, "traces com duração e span"],
                ["SLO Compliance", ov.slo_compliance, "% de SLOs cumprindo a meta"]].map(([l, v, d]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className={`text-3xl font-black ${scoreColor(v ?? 0).replace("300", "600")}`}>{v ?? "—"}</p>
                  <p className="text-[10px] text-zinc-400">{d}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              {[["Traces (2h)", ov.traces_2h], ["Eventos/min", ov.eventos_por_min], ["Lojas online", ov.lojas_online], ["Alertas abertos", ov.alertas_abertos]].map(([l, v]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-xl font-black text-zinc-800">{String(v ?? 0)}</p>
                </div>
              ))}
            </div>
            <p className="rounded-2xl bg-cyan-50 border border-cyan-200 px-4 py-2 text-[11px] font-semibold text-cyan-800">
              DAS aqui é <b>Availability Score</b> (distinto do Device Assurance do AI-42/47). Todos os scores trazem fórmula/evidência.
            </p>
          </div>
        )}

        {/* MÉTRICAS */}
        {aba === "metricas" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">📈 Métricas correntes (origem rastreável)</h3>
            {!(met.recentes || []).length ? <p className="text-xs text-zinc-400">Sem métricas ainda.</p> : (met.recentes || []).map((m: any) => (
              <details key={m.metric} className="mb-1 rounded-2xl bg-slate-50 p-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-700">{m.metric} <span className="text-zinc-400">· {m.categoria}</span></span>
                  <span className="text-sm font-black text-cyan-700">{m.valor} {m.unidade}</span>
                </summary>
                <div className="mt-2 text-[11px] text-zinc-600">
                  <p>Origem: {m.origem} · {String(m.em).slice(0, 19).replace("T", " ")}</p>
                  <Evid dados={m.evidencias} />
                </div>
              </details>
            ))}
          </div>
        )}

        {/* LOGS */}
        {aba === "logs" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(logs.por_nivel || {}).map(([k, v]: any) => (
                <span key={k} className={`rounded-full px-3 py-1 text-[11px] font-bold ${NIVEL[k] || "bg-slate-100 text-slate-600"}`}>{k}: {v}</span>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🧾 Logs centralizados (sanitizados — nunca secrets)</h3>
              {!(logs.lista || []).length ? <p className="text-xs text-zinc-400">Nenhum log.</p> : (logs.lista || []).map((l: any) => (
                <details key={l.log_id} className="mb-1 rounded-2xl bg-slate-50 p-2">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${NIVEL[l.nivel] || ""}`}>{l.nivel}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-zinc-700">{l.origem}/{l.servico ?? "-"} · {l.mensagem}</span>
                    <span className="text-[10px] text-zinc-400">{String(l.em).slice(5, 19).replace("T", " ")}</span>
                  </summary>
                  <Evid dados={l.contexto} />
                </details>
              ))}
            </div>
          </div>
        )}

        {/* TRACES */}
        {aba === "traces" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🕸 Traces distribuídos (ticks de cron = jornada real)</h3>
              {!(traces.lista || []).length ? <p className="text-xs text-zinc-400">Sem traces.</p> : (traces.lista || []).map((t: any) => (
                <div key={t.trace_id} className="mb-1 flex flex-wrap items-center gap-2 border-b border-zinc-50 pb-1 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${t.status === "ok" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{t.status}</span>
                  <span className="min-w-0 flex-1 truncate font-bold text-zinc-700">{t.servico} · {t.operacao}</span>
                  <span className="font-black text-zinc-600">{t.duracao_ms}ms</span>
                  <span className="text-zinc-400">{t.spans} span · {t.origem}</span>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🐢 Traces mais lentos (24h)</h3>
              {(traces.lentos || []).map((t: any) => (
                <p key={t.trace_id} className="mb-1 flex justify-between text-[11px] font-semibold text-zinc-600"><span className="truncate">{t.servico}</span><span className="font-black">{t.ms}ms</span></p>
              ))}
            </div>
          </div>
        )}

        {/* PERFORMANCE */}
        {aba === "performance" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                <p className="text-[10px] font-bold uppercase text-zinc-400">Latência média de RPC</p>
                <p className="text-2xl font-black text-cyan-700">{perf.rpc_mean_ms ?? "—"} ms</p>
              </div>
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                <p className="text-[10px] font-bold uppercase text-zinc-400">RPCs lentas (&gt;500ms)</p>
                <p className="text-2xl font-black text-zinc-800">{perf.rpc_lentas ?? "—"}</p>
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">⚡ Operações mais lentas (24h)</h3>
              {(perf.top_lentas || []).map((t: any, i: number) => (
                <p key={i} className="mb-1 flex justify-between text-[11px] font-semibold text-zinc-600"><span className="truncate">{t.servico} · {t.op}</span><span className="font-black">{t.ms}ms</span></p>
              ))}
              <p className="mt-2 text-[10px] text-zinc-400">{perf.nota_web_vitals}</p>
            </div>
          </div>
        )}

        {/* DISPONIBILIDADE */}
        {aba === "disponibilidade" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">🟢 Disponibilidade por serviço · uptime médio {disp.uptime_medio}%</h3>
            {(disp.por_servico || []).map((s: any) => (
              <details key={s.servico} className="mb-1 rounded-2xl bg-slate-50 p-2">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${EST[s.estado] || ""}`}>{s.estado}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-zinc-700">{s.servico} <span className="text-zinc-400">· {s.categoria}</span></span>
                  <span className="font-black text-zinc-600">{s.disponibilidade}%</span>
                  <span className="text-zinc-400">{s.latencia_ms}ms · erro {s.erro_rate}%</span>
                </summary>
                <Evid dados={s.evidencias} />
              </details>
            ))}
          </div>
        )}

        {/* SLI */}
        {aba === "sli" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">📐 SLIs medidos (fontes reais)</h3>
            {(sli.recentes || []).map((s: any) => (
              <div key={s.sli} className="mb-1 flex flex-wrap items-center gap-2 border-b border-zinc-50 pb-1 text-[11px]">
                <span className="min-w-0 flex-1 truncate font-bold text-zinc-700">{s.sli} <span className="text-zinc-400">· {s.tipo}</span></span>
                <span className="font-black text-cyan-700">{s.valor} {s.unidade}</span>
                <span className="text-zinc-400">janela {s.janela}</span>
              </div>
            ))}
          </div>
        )}

        {/* SLO */}
        {aba === "slo" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">🎯 SLOs (meta · atual · error budget)</h3>
            {(slo.lista || []).map((s: any) => (
              <details key={s.slo} className="mb-2 rounded-2xl bg-slate-50 p-3">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  {s.em_risco ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">EM RISCO</span>
                    : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">OK</span>}
                  <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-700">{s.slo}</span>
                  <span className="text-[11px] font-black text-zinc-600">{s.atual} {s.comparador} {s.alvo}</span>
                  <span className="text-[10px] text-zinc-400">budget {s.error_budget}%</span>
                </summary>
                <div className="mt-2 text-[11px] text-zinc-600"><p>{s.descricao} · compliance {s.compliance}% · escopo {s.escopo}</p><Evid dados={s.evidencias} /></div>
              </details>
            ))}
          </div>
        )}

        {/* SERVIÇOS */}
        {aba === "servicos" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(srv.por_estado || {}).map(([k, v]: any) => (
                <span key={k} className={`rounded-full px-3 py-1 text-[11px] font-bold ${EST[k] || "bg-slate-100 text-slate-600"}`}>{k}: {v}</span>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🖥 Serviços monitorados ({(srv.lista || []).length}) · clique p/ RCA</h3>
              {(srv.lista || []).map((s: any) => (
                <div key={s.servico} className="mb-1 flex flex-wrap items-center gap-2 border-b border-zinc-50 pb-1 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${EST[s.estado] || ""}`}>{s.estado}</span>
                  <button onClick={() => { setRcaSrv(s.servico); runRca(s.servico); }} className="min-w-0 flex-1 truncate text-left font-bold text-cyan-700 hover:underline">{s.servico}</button>
                  <span className="text-zinc-400">{s.categoria} · {s.disponibilidade}% · {s.latencia_ms}ms</span>
                </div>
              ))}
            </div>
            {(rca || busy) && (
              <div className="rounded-3xl border border-cyan-200 bg-cyan-50 p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-cyan-800">🔎 Root Cause Analysis · {rcaSrv}</h3>
                {busy ? <Loader2 className="h-5 w-5 animate-spin text-cyan-600" /> : (
                  <div className="space-y-1 text-[11px] text-zinc-700">
                    <p><b>Causa provável:</b> {rca?.causa_provavel}</p>
                    <p><b>Recomendação:</b> {rca?.recomendacao}</p>
                    <p><b>Tempo est. recuperação:</b> {rca?.tempo_estimado_recuperacao} · falhas 24h: {rca?.falhas_24h} · handoff: {rca?.handoff_ai45}</p>
                    <Evid dados={rca} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* DEPENDÊNCIAS */}
        {aba === "dependencias" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🔗 Cadeia de dependências</h3>
              {(deps.cadeia || []).map((c: any) => (
                <div key={c.nivel} className="mb-1 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded-full bg-cyan-100 px-2 py-0.5 font-black text-cyan-700">nível {c.nivel}</span>
                  <span className="font-bold text-zinc-700">{c.componente}</span>
                  <span className="text-zinc-400">→ {(c.depende_de || []).join(", ")}</span>
                </div>
              ))}
              <p className="mt-2 text-[10px] text-zinc-400">{deps.nota}</p>
            </div>
          </div>
        )}

        {/* ALERTAS */}
        {aba === "alertas" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">🔔 Alertas inteligentes (priorizados por impacto) · {alertas.abertos} abertos</h3>
            {!(alertas.lista || []).length ? <p className="text-xs text-zinc-400">Nenhum alerta. 🎉</p> : (alertas.lista || []).map((a: any) => (
              <details key={a.alert_id} className="mb-1 rounded-2xl bg-slate-50 p-2">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${IMP[a.impacto] || ""}`}>{a.impacto}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-zinc-700">{a.mensagem}</span>
                  <span className="text-[10px] font-black text-zinc-500">P{a.prioridade}</span>
                </summary>
                <Evid dados={a.evidencias} />
              </details>
            ))}
          </div>
        )}

        {/* ESTATÍSTICAS */}
        {aba === "estatisticas" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">📊 Estatísticas diárias</h3>
            {!(est.dias || []).length ? <p className="text-xs text-zinc-400">Sem estatísticas.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead><tr className="text-zinc-400">
                    <th className="pb-1 pr-3">Dia</th><th className="pr-3">OHS</th><th className="pr-3">PHS</th><th className="pr-3">DAS</th>
                    <th className="pr-3">LQS</th><th className="pr-3">TPS</th><th className="pr-3">SLO</th><th className="pr-3">Uptime</th>
                    <th className="pr-3">Logs</th><th className="pr-3">Erros</th><th className="pr-3">Traces</th><th>Degrad.</th>
                  </tr></thead>
                  <tbody>{(est.dias || []).map((s: any) => (
                    <tr key={s.dia} className="border-t border-zinc-50 font-semibold text-zinc-600">
                      <td className="py-1 pr-3">{s.dia}</td><td className="pr-3">{s.ohs}</td><td className="pr-3">{s.phs}</td><td className="pr-3">{s.das}</td>
                      <td className="pr-3">{s.lqs}</td><td className="pr-3">{s.tps}</td><td className="pr-3">{s.slo_compliance}</td><td className="pr-3">{s.uptime_pct}%</td>
                      <td className="pr-3">{s.logs_total}</td><td className="pr-3">{s.logs_erro}</td><td className="pr-3">{s.traces_total}</td><td>{s.servicos_degradados}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-[10px] text-zinc-400">OHS = 0.25·DAS + 0.25·PHS + 0.15·LQS + 0.15·TPS + 0.20·SLO Compliance.</p>
          </div>
        )}

        {/* CONFIGURAÇÕES */}
        {aba === "config" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">⚙️ Motor + contadores</h3>
              {(cfg.cron || []).map((c: any) => (
                <p key={c.job} className="text-[11px] font-semibold text-zinc-600">cron: {c.job} · {c.schedule}</p>
              ))}
              {Object.entries(cfg.contadores || {}).map(([k, v]: any) => (
                <p key={k} className="mt-0.5 flex justify-between text-[11px] text-zinc-600"><span>{k}</span><span className="font-black">{String(v)}</span></p>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🔗 Integrações</h3>
              {Object.entries(cfg.integracoes || {}).map(([k, v]: any) => (
                <p key={k} className="mb-1 flex justify-between text-[11px] text-zinc-600"><span>{k}</span><span className="font-black">{String(v)}</span></p>
              ))}
              <h4 className="mt-3 mb-1 text-[11px] font-black text-amber-800">Lacunas declaradas</h4>
              {(cfg.lacunas || []).map((l: string, i: number) => <p key={i} className="text-[10px] text-amber-700">· {l}</p>)}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Observability v1.0 · ORION-AI-51 · OHS/PHS/DAS/LQS/TPS/SLO · métricas+logs+traces reais · RCA c/ evidência ·
          nunca registra secrets (obs_sanitize) · SLI/SLO + error budget · selftest 12 testes · tick a cada 1 min
        </p>
      </div>
    </div>
  );
}
