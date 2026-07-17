/**
 * /admin/orion-threat-intelligence — ORION Threat Intelligence AI (ORION-AI-43)
 *
 * Núcleo analítico do Security Ecosystem: consolida eventos de segurança (AI-40),
 * fraude (AI-41) e identidade (auth) num GRAFO DE AMEAÇAS, detecta campanhas,
 * correlaciona vulnerabilidades. Nenhuma relação sem evidência; nenhuma ação
 * destrutiva automática. Scores TIS/CS/CRS/VIS + MTTC/TRR.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Waypoints, Loader2, Gauge, Share2, Megaphone, ShieldAlert, GitBranch } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const tisColor = (s: number) => s >= 80 ? "text-red-300" : s >= 60 ? "text-amber-300" : s >= 40 ? "text-yellow-300" : "text-emerald-300";
const SEV: Record<string, string> = { critica: "bg-red-100 text-red-700", alta: "bg-amber-100 text-amber-700", media: "bg-yellow-100 text-yellow-700", baixa: "bg-slate-100 text-slate-600" };
const ST: Record<string, string> = { ativa: "bg-sky-100 text-sky-700", mitigada: "bg-amber-100 text-amber-700", resolvida: "bg-emerald-100 text-emerald-700", falso_positivo: "bg-slate-100 text-slate-500", aberta: "bg-red-100 text-red-700", recorrente: "bg-amber-100 text-amber-700" };
const NODE: Record<string, string> = { ataque: "bg-red-500", fraude: "bg-orange-500", usuario: "bg-sky-500", identidade: "bg-violet-500", api: "bg-emerald-500", ip: "bg-zinc-500", dispositivo: "bg-teal-500", sessao: "bg-indigo-500", evento: "bg-slate-500", edge_function: "bg-cyan-500" };

type Aba = "resumo" | "grafo" | "campanhas" | "vulnerabilidades" | "correlacoes";

export default function AdminOrionThreat() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["orion-threat"], queryFn: () => rpc("threat_dashboard"), refetchInterval: 60000,
  });

  const ov = dash?.overview || {};
  const graph = dash?.graph || {};
  const nodes = (graph?.nodes || []) as any[];
  const edges = (graph?.edges || []) as any[];
  const camps = (dash?.campaigns || []) as any[];
  const vuln = dash?.vulnerabilities || {};
  const vulnList = (vuln?.lista || []) as any[];
  const corr = dash?.correlations || {};
  const met = dash?.metrics || {};
  const lacunas = (dash?.lacunas || []) as string[];
  const tendencia = ov.tendencia_7d ?? 0;

  const markCampaign = async (id: number, status: string) => {
    setBusyId(id); setMsg("");
    try { await rpc("threat_mark_campaign", { p_campaign_id: id, p_status: status }); setMsg(`✓ Campanha #${id} → ${status}.`); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); }
    finally { setBusyId(null); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0b0f1a] via-[#161b2e] to-[#0b0f1a] p-6 text-white shadow-xl ring-1 ring-violet-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 ring-1 ring-violet-500/30">
              <Waypoints className="h-8 w-8 text-violet-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Threat Intelligence</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-43 · núcleo analítico do Security Ecosystem · correlaciona AI-40 + AI-41 + identidade · nada sem evidência
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-violet-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-200/70">Threat Intelligence Score</p>
              <p className={`text-4xl font-black ${tisColor(ov.tis ?? 0)}`}>{ov.tis ?? "—"}</p>
              <p className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">{ov.campanhas_criticas ?? 0} campanha(s) crítica(s)</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Campanhas ativas", ov.campanhas_ativas], ["Vulnerabilidades", ov.vulnerabilidades], ["Correlações", ov.correlacoes],
              ["Nós no grafo", ov.nos_grafo], ["MTTC", `${Math.round((ov.mttc_segundos ?? 0) / 60)}min`],
              ["Tendência 7d", `${tendencia >= 0 ? "+" : ""}${tendencia}`]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Gauge, "Visão Geral"], ["grafo", Share2, `Threat Graph${nodes.length ? ` (${nodes.length})` : ""}`],
             ["campanhas", Megaphone, `Campanhas${camps.length ? ` (${camps.length})` : ""}`],
             ["vulnerabilidades", ShieldAlert, "Vulnerabilidades"], ["correlacoes", GitBranch, "Correlações"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#161b2e] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {msg && <p className="mt-3 rounded-2xl bg-slate-100 px-4 py-2 text-xs font-bold text-zinc-700">{msg}</p>}
        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-violet-500" /></div>}

        {/* VISÃO GERAL */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Threat Intelligence (TIS)", ov.tis, "nível de ameaça da plataforma"],
                ["Correlation Score (CS)", ov.cs_medio, "confiança média das correlações"],
                ["Risco médio (IOCs)", ov.risco_medio, "TIS médio dos observáveis ativos"],
                ["Threat Resolution Rate", `${((ov.trr ?? 0) * 100).toFixed(0)}%`, "campanhas mitigadas/resolvidas"]].map(([l, v, d]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-2xl font-black text-violet-700">{v ?? "—"}</p>
                  <p className="text-[10px] text-zinc-400">{d}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">📈 Estatísticas (7 dias)</h3>
              {!(met.estatisticas_7d || []).length ? <p className="text-xs text-zinc-400">Sem estatísticas ainda.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead><tr className="text-zinc-400">
                      <th className="pb-1 pr-3">Dia</th><th className="pr-3">Ameaças</th><th className="pr-3">Campanhas</th>
                      <th className="pr-3">Vulns</th><th className="pr-3">Correlações</th><th className="pr-3">Risco médio</th><th>MTTC</th>
                    </tr></thead>
                    <tbody>{met.estatisticas_7d.map((s: any) => (
                      <tr key={s.dia} className="border-t border-zinc-50 font-semibold text-zinc-600">
                        <td className="py-1 pr-3">{s.dia}</td><td className="pr-3">{s.ameacas}</td><td className="pr-3">{s.campanhas}</td>
                        <td className="pr-3">{s.vulnerabilidades}</td><td className="pr-3">{s.correlacoes}</td><td className="pr-3">{s.risco_medio}</td>
                        <td>{Math.round((s.mttc_s ?? 0) / 60)}min</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🎯 Observáveis de maior risco (IOCs)</h3>
              <div className="flex flex-wrap gap-2">
                {(met.ioc_top || []).map((i: any, k: number) => (
                  <span key={k} className={`rounded-full px-3 py-1 text-[11px] font-bold ${SEV[i.severidade] || "bg-slate-100"}`}>{i.valor} · TIS {i.tis}</span>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="mb-1 text-sm font-black text-amber-800">Lacunas declaradas (nunca inventamos correlação)</h3>
              {lacunas.map((l, i) => <p key={i} className="text-[11px] font-semibold text-amber-700">· {l}</p>)}
            </div>
          </div>
        )}

        {/* THREAT GRAPH */}
        {aba === "grafo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(graph.por_tipo || {}).map(([t, n]: any) => (
                <span key={t} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-zinc-600 ring-1 ring-zinc-200">
                  <span className={`h-2.5 w-2.5 rounded-full ${NODE[t] || "bg-zinc-400"}`} /> {t}: {n}
                </span>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Nós (por risco)</h3>
                <div className="max-h-[28rem] space-y-1.5 overflow-auto">
                  {nodes.map((n: any) => (
                    <div key={n.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-2 py-1.5">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${NODE[n.type] || "bg-zinc-400"}`} />
                      <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-zinc-700">{n.label}</span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{n.type}</span>
                      <span className={`text-[11px] font-black ${n.risk >= 60 ? "text-red-600" : "text-zinc-500"}`}>{n.risk}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Arestas (correlações com evidência)</h3>
                <div className="max-h-[28rem] space-y-1.5 overflow-auto">
                  {edges.map((e: any, k: number) => (
                    <details key={k} className="rounded-xl bg-slate-50 px-2 py-1.5">
                      <summary className="flex cursor-pointer items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-zinc-600">{e.source} → {e.target}</span>
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700">{e.rel}</span>
                        <span className="text-[10px] font-black text-zinc-500">peso {e.peso}</span>
                      </summary>
                      <pre className="mt-1 overflow-auto rounded-lg bg-white p-2 text-[10px] text-zinc-500">{JSON.stringify(e.evidencias, null, 2)}</pre>
                    </details>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-[10px] text-zinc-400">{graph.nota}</p>
          </div>
        )}

        {/* CAMPANHAS */}
        {aba === "campanhas" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!camps.length ? <p className="text-xs text-zinc-400">Nenhuma campanha detectada.</p> : camps.map((c: any) => (
              <div key={c.id} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SEV[c.severidade] || ""}`}>{c.severidade}</span>
                  <span className="min-w-0 flex-1 truncate font-black text-zinc-800">#{c.id} · {c.nome}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{c.tipo}</span>
                  <span className="text-[11px] font-black text-violet-700">CRS {c.crs}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ST[c.status] || ""}`}>{c.status}</span>
                </div>
                <pre className="mt-2 overflow-auto rounded-xl bg-slate-50 p-2 text-[10px] text-zinc-500">{JSON.stringify(c.evidencias, null, 2)}</pre>
                <p className="mt-1 text-[10px] text-zinc-400">{c.eventos} evento(s) · {String(c.primeira).slice(0, 10)} → {String(c.ultima).slice(0, 10)} · confiança {c.confidence}</p>
                {c.status === "ativa" && (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => markCampaign(c.id, "mitigada")} disabled={busyId === c.id}
                      className="rounded-xl bg-amber-600 px-3 py-1 text-[11px] font-black text-white disabled:opacity-40">Mitigar</button>
                    <button onClick={() => markCampaign(c.id, "resolvida")} disabled={busyId === c.id}
                      className="rounded-xl bg-emerald-600 px-3 py-1 text-[11px] font-black text-white disabled:opacity-40">Resolver</button>
                    <button onClick={() => markCampaign(c.id, "falso_positivo")} disabled={busyId === c.id}
                      className="rounded-xl bg-slate-500 px-3 py-1 text-[11px] font-black text-white disabled:opacity-40">Falso positivo</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* VULNERABILIDADES */}
        {aba === "vulnerabilidades" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              {[["Abertas", vuln.abertas], ["Críticas", vuln.criticas], ["Recorrentes", vuln.recorrentes], ["Mitigadas", vuln.mitigadas]].map(([l, v]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-xl font-black text-zinc-800">{v ?? 0}</p>
                </div>
              ))}
            </div>
            {vulnList.map((v: any) => (
              <div key={v.id} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${SEV[v.criticidade] || ""}`}>{v.criticidade}</span>
                  <span className="min-w-0 flex-1 truncate font-black text-zinc-800">{v.vulnerabilidade}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{v.componente}</span>
                  <span className="text-[11px] font-black text-violet-700">VIS {v.vis}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${ST[v.status] || ""}`}>{v.status}</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-600"><b>Impacto:</b> {v.impacto}</p>
                <p className="text-[11px] text-zinc-600"><b>Mitigação:</b> {v.mitigacao}</p>
                <p className="mt-1 text-[10px] text-zinc-400">{v.ocorrencias} ocorrência(s) · {v.evidencias?.nota || ""}</p>
              </div>
            ))}
          </div>
        )}

        {/* CORRELAÇÕES */}
        {aba === "correlacoes" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Relações por tipo</h3>
              {Object.entries(corr.por_relacao || {}).sort((a: any, b: any) => b[1] - a[1]).map(([r, n]: any) => {
                const max = Math.max(1, ...Object.values(corr.por_relacao || {}).map((x: any) => Number(x)));
                return (
                  <div key={r} className="mb-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-zinc-600">{r}</span><span className="font-black text-zinc-700">{n}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full bg-violet-400" style={{ width: `${(Number(n) / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Correlações mais fortes</h3>
              <div className="max-h-96 space-y-1.5 overflow-auto">
                {(corr.top || []).map((c: any, k: number) => (
                  <details key={k} className="rounded-xl bg-slate-50 px-2 py-1.5">
                    <summary className="flex cursor-pointer items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-zinc-600">{c.origem} → {c.destino}</span>
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700">{c.rel}</span>
                      <span className="text-[10px] font-black text-zinc-500">CS {c.cs}</span>
                    </summary>
                    <pre className="mt-1 overflow-auto rounded-lg bg-white p-2 text-[10px] text-zinc-500">{JSON.stringify(c.evidencias, null, 2)}</pre>
                  </details>
                ))}
              </div>
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Threat Intelligence v1.0 · ORION-AI-43 · TIS/CS/CRS/VIS + MTTC/TRR · grafo de ameaças com evidência ·
          correlate_security_events · rollback por trace · encaminha ao AI-45 (Incident Response) · tick */3
        </p>
      </div>
    </div>
  );
}
