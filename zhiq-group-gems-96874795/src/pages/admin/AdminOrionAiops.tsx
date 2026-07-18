/**
 * /admin/orion-aiops — ORION AI Operations (AIOps) (ORION-AI-53)
 *
 * Centro Inteligente de Operações Autônomas: monitora a operação técnica (cron,
 * Gateway, frontend, observability/SLO), detecta anomalias, prevê falhas, faz RCA
 * e automatiza SÓ ações seguras sob governança. NUNCA executa ação destrutiva
 * automaticamente. Scores AOS/APS/OAS/FRS/RHS.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Cpu, Loader2, Gauge, AlertTriangle, TrendingUp, Wrench, Server, BarChart3, Settings, Search } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const SEV: Record<string, string> = { critica: "bg-red-100 text-red-700", alta: "bg-amber-100 text-amber-700", media: "bg-yellow-100 text-yellow-700", baixa: "bg-slate-100 text-slate-600", info: "bg-slate-100 text-slate-500" };
const EST: Record<string, string> = { operacional: "bg-emerald-100 text-emerald-700", atencao: "bg-yellow-100 text-yellow-700", degradado: "bg-amber-100 text-amber-700", critico: "bg-red-100 text-red-700" };
const scoreCol = (s: number, inv = false) => (inv ? s <= 30 : s >= 75) ? "text-emerald-300" : (inv ? s <= 60 : s >= 50) ? "text-amber-300" : "text-red-300";
const fmt = (v: any) => v ? String(v).slice(0, 19).replace("T", " ") : "—";

type Aba = "resumo" | "anomalias" | "predicoes" | "acoes" | "infra" | "estatisticas" | "config";

export default function AdminOrionAiops() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [rca, setRca] = useState<Record<number, any>>({});
  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-aiops"], queryFn: () => rpc("aiops_dashboard"), refetchInterval: 30000,
  });

  const ov = dash?.overview || {};
  const anomalies = (dash?.anomalies?.lista || []) as any[];
  const predictions = (dash?.predictions || []) as any[];
  const actions = dash?.actions || {};
  const acoes = (actions?.acoes || []) as any[];
  const recs = (actions?.recomendacoes || []) as any[];
  const politicas = (actions?.politicas || []) as any[];
  const infra = dash?.infra || {};
  const servicos = (infra?.servicos || []) as any[];
  const stats = (dash?.statistics?.serie_14d || []) as any[];
  const config = dash?.config || {};

  const loadRca = async (id: number) => {
    if (rca[id]) { setRca((p) => ({ ...p, [id]: null })); return; }
    try { const r = await rpc("aiops_rca", { p_anomaly_id: id }); setRca((p) => ({ ...p, [id]: r })); }
    catch (e: any) { setRca((p) => ({ ...p, [id]: { erro: e.message } })); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0a1020] via-[#141d33] to-[#0a1020] p-6 text-white shadow-xl ring-1 ring-cyan-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 ring-1 ring-cyan-500/30">
              <Cpu className="h-8 w-8 text-cyan-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION AI Operations · AIOps</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-53 · operação autônoma · detecta anomalias, prevê falhas, RCA · nunca executa ação destrutiva sozinho
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-cyan-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-200/70">AI Operations Score</p>
              <p className={`text-4xl font-black ${scoreCol(ov.aos ?? 0)}`}>{ov.aos ?? "—"}</p>
              <p className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">{ov.anomalias_criticas ?? 0} crítica(s)</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Runtime Health", ov.rhs], ["Failure Risk", ov.frs], ["Automação", `${ov.oas ?? "—"}%`],
              ["Anomalias", ov.anomalias_abertas], ["Serviços ruins", ov.servicos_degradados], ["Disponibilidade", `${ov.disponibilidade ?? "—"}%`]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-slate-400">Snapshot: {fmt(ov.gerado_em)} · tick */2</p>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Gauge, "Resumo"], ["anomalias", AlertTriangle, `Anomalias${ov.anomalias_abertas ? ` (${ov.anomalias_abertas})` : ""}`],
             ["predicoes", TrendingUp, "Predições"], ["acoes", Wrench, "Ações & Automação"], ["infra", Server, "Infraestrutura"],
             ["estatisticas", BarChart3, "Estatísticas"], ["config", Settings, "Config"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#141d33] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-cyan-500" /></div>}

        {/* RESUMO */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {[["AI Operations (AOS)", ov.aos, false, "saúde + risco + automação"],
                ["Runtime Health (RHS)", ov.rhs, false, "saúde de runtime"],
                ["Failure Risk (FRS)", ov.frs, true, "risco de falha (menor=melhor)"],
                ["Automation (OAS)", ov.oas, false, "% ações auto-executadas"],
                ["Prediction (APS)", ov.aps, false, "confiança das predições"]].map(([l, v, inv, d]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className={`text-2xl font-black ${(inv ? v <= 30 : v >= 75) ? "text-emerald-600" : (inv ? v <= 60 : v >= 50) ? "text-amber-600" : "text-red-600"}`}>{v ?? "—"}</p>
                  <p className="text-[10px] text-zinc-400">{d}</p>
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[["Saúde geral", `${ov.saude_geral ?? "—"}`], ["Anomalias ativas", ov.anomalias_abertas], ["Críticas", ov.anomalias_criticas],
                ["Serviços degradados", ov.servicos_degradados], ["Ações 24h", ov.acoes_24h], ["MTTR", `${ov.mttr_min ?? 0}min`]].map(([l, v]: any) => (
                <div key={l} className="rounded-2xl border border-zinc-100 bg-white p-3 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-xl font-black text-zinc-800">{String(v ?? 0)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-cyan-100 bg-cyan-50/50 p-4">
              <p className="text-[11px] font-semibold text-cyan-800">
                Predições ativas: {ov.predicoes_6h ?? 0} · risco máx. predito {ov.risco_max_predito ?? 0}% · ações bloqueadas por governança {ov.acoes_bloqueadas ?? 0}
              </p>
              <p className="mt-1 text-[10px] text-cyan-700/70">Automação segura executa sozinha; ações destrutivas (reprocessar fila, reiniciar, limpar cache) exigem aprovação humana (política AI-50).</p>
            </div>
          </div>
        )}

        {/* ANOMALIAS (com RCA) */}
        {aba === "anomalias" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!anomalies.length ? <p className="text-xs text-zinc-400">Nenhuma anomalia ativa. 🎉</p> : anomalies.map((a: any) => (
              <div key={a.id} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SEV[a.severidade] || ""}`}>{a.severidade}</span>
                  <span className="min-w-0 flex-1 truncate font-black text-zinc-800">{a.tipo} · {a.alvo}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{a.categoria}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{a.status}</span>
                  <button onClick={() => loadRca(a.id)} className="flex items-center gap-1 rounded-lg bg-cyan-600 px-2 py-1 text-[10px] font-black text-white"><Search className="h-3 w-3" /> RCA</button>
                </div>
                <p className="mt-1 text-[11px] text-zinc-600">{a.descricao}</p>
                {rca[a.id] && (
                  <div className="mt-2 rounded-2xl bg-slate-50 p-3 text-[11px] text-zinc-600">
                    {rca[a.id].erro ? <span className="text-red-600">{rca[a.id].erro}</span> : (<>
                      <p><b>Causa provável:</b> {rca[a.id].causa_provavel}</p>
                      <p><b>Serviço responsável:</b> {rca[a.id].servico_responsavel} · <b>impacto:</b> {rca[a.id].impacto_operacional} · <b>prioridade:</b> {rca[a.id].prioridade_correcao}</p>
                      <p><b>Cadeia:</b> {(rca[a.id].cadeia_dependencias || []).join(" → ")}</p>
                      {rca[a.id].evidencias?.erro && <pre className="mt-1 overflow-auto rounded-lg bg-white p-2 text-[10px] text-red-600">{String(rca[a.id].evidencias.erro).slice(0, 400)}</pre>}
                    </>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* PREDIÇÕES */}
        {aba === "predicoes" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!predictions.length ? <p className="text-xs text-zinc-400">Nenhuma predição de falha ativa.</p> : predictions.map((p: any) => (
              <div key={p.id} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-black text-zinc-800">{p.tipo} · {p.alvo}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">horizonte {p.horizonte}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${p.impacto === "alto" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>impacto {p.impacto}</span>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-[10px] text-zinc-400"><span>probabilidade</span><span className="font-black text-zinc-700">{p.probabilidade}%</span></div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-red-400" style={{ width: `${p.probabilidade}%` }} /></div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">confiança {p.confianca}%</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-600">{p.justificativa}</p>
              </div>
            ))}
          </div>
        )}

        {/* AÇÕES & AUTOMAÇÃO */}
        {aba === "acoes" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Ações automáticas (seguras)</h3>
              <div className="max-h-96 space-y-1 overflow-auto">
                {!acoes.length ? <p className="text-xs text-zinc-400">Nenhuma ação.</p> : acoes.map((a: any) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 border-b border-zinc-50 pb-1 text-[11px]">
                    <span className="font-bold text-zinc-700">{a.acao}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${a.resultado === "executada" ? "bg-emerald-100 text-emerald-700" : a.resultado === "bloqueada_governanca" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{a.resultado}</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-500">{a.motivo}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Recomendações (exigem aprovação)</h3>
              <div className="max-h-96 space-y-1.5 overflow-auto">
                {!recs.length ? <p className="text-xs text-zinc-400">Nenhuma recomendação.</p> : recs.map((r: any) => (
                  <div key={r.id} className="rounded-2xl bg-slate-50 p-2">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-700">{r.titulo}</span>
                      <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-black text-cyan-700">P{r.prioridade}</span>
                    </div>
                    <p className="text-[10px] text-zinc-500">{r.acao}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm md:col-span-2">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Políticas de automação</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {politicas.map((p: any) => (
                  <div key={p.acao} className="flex items-center gap-2 rounded-xl bg-slate-50 px-2 py-1.5 text-[11px]">
                    <span className={`h-2 w-2 rounded-full ${p.auto ? "bg-emerald-500" : "bg-zinc-300"}`} />
                    <span className="min-w-0 flex-1 truncate font-bold text-zinc-600">{p.acao}</span>
                    {p.destrutiva && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-black text-red-700">destrutiva</span>}
                    <span className="text-[9px] text-zinc-400">{p.auto ? "auto" : "aprovação"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* INFRAESTRUTURA / SERVIÇOS */}
        {aba === "infra" && !isLoading && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {Object.entries(infra.por_categoria || {}).map(([c, n]: any) => (
                <span key={c} className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-zinc-600 ring-1 ring-zinc-200">{c}: {n}</span>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="max-h-[32rem] space-y-1 overflow-auto">
                {servicos.map((s: any, k: number) => (
                  <div key={k} className="flex flex-wrap items-center gap-2 border-b border-zinc-50 py-1 text-[11px]">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${EST[s.estado] || "bg-slate-100"}`}>{s.estado}</span>
                    <span className="min-w-0 flex-1 truncate font-bold text-zinc-700">{s.servico}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{s.categoria}</span>
                    <span className={`text-[11px] font-black ${s.rhs >= 75 ? "text-emerald-600" : s.rhs >= 45 ? "text-amber-600" : "text-red-600"}`}>RHS {s.rhs}</span>
                    {s.sucesso_pct != null && <span className="text-[10px] text-zinc-400">{s.sucesso_pct}% ok</span>}
                    {s.latencia_ms != null && <span className="text-[10px] text-zinc-400">{s.latencia_ms}ms</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ESTATÍSTICAS */}
        {aba === "estatisticas" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">Série (14 dias)</h3>
            {!stats.length ? <p className="text-xs text-zinc-400">Sem estatísticas ainda.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead><tr className="text-zinc-400">
                    <th className="pb-1 pr-3">Dia</th><th className="pr-3">AOS</th><th className="pr-3">RHS</th><th className="pr-3">FRS</th><th className="pr-3">OAS</th>
                    <th className="pr-3">Anomalias</th><th className="pr-3">Críticas</th><th className="pr-3">Ações</th><th className="pr-3">MTTR</th><th>Disp.</th>
                  </tr></thead>
                  <tbody>{stats.map((s: any) => (
                    <tr key={s.dia} className="border-t border-zinc-50 font-semibold text-zinc-600">
                      <td className="py-1 pr-3">{s.dia}</td><td className="pr-3">{s.aos}</td><td className="pr-3">{s.rhs}</td><td className="pr-3">{s.frs}</td><td className="pr-3">{s.oas}%</td>
                      <td className="pr-3">{s.anomalias}</td><td className="pr-3">{s.criticas}</td><td className="pr-3">{s.acoes}</td><td className="pr-3">{s.mttr}min</td><td>{s.disp}%</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* CONFIG */}
        {aba === "config" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="grid gap-2 sm:grid-cols-3">
                {[["Cron", `${config.cron?.job || "—"} ${config.cron?.schedule || ""}`], ["Modelo IA", config.modelo_ia], ["Fontes", (config.fontes || []).length]].map(([l, v]: any) => (
                  <div key={l}><p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p><p className="text-sm font-black text-zinc-700">{String(v ?? "—")}</p></div>
                ))}
              </div>
              <p className="mt-3 text-[11px] font-bold text-zinc-600">Fontes de telemetria real</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(config.fontes || []).map((f: string, i: number) => (
                  <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{f}</span>
                ))}
              </div>
              <p className="mt-3 rounded-2xl bg-cyan-50 px-3 py-2 text-[11px] font-bold text-cyan-800">⚙ {config.regra}</p>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Playbooks operacionais</h3>
              {(config.playbooks || []).map((p: any, i: number) => (
                <details key={i} className="mb-2 rounded-2xl bg-slate-50 p-3">
                  <summary className="flex cursor-pointer items-center gap-2 text-xs font-black text-zinc-700">
                    {p.nome} {p.destrutivo && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-black text-red-700">requer humano</span>}
                    <span className="font-normal text-zinc-400">· {p.gatilho}</span>
                  </summary>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[11px] text-zinc-600">
                    {(p.acoes || []).map((s: string, j: number) => <li key={j}>{String(s).replace(/^\d+\.\s*/, "")}</li>)}
                  </ol>
                </details>
              ))}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION AI Operations (AIOps) v1.0 · ORION-AI-53 · AOS/APS/OAS/FRS/RHS · detecção + predição + RCA + automação segura ·
          fontes reais (cron/Gateway/client/observability) · nunca executa ação destrutiva sozinho · tick */2
        </p>
      </div>
    </div>
  );
}
