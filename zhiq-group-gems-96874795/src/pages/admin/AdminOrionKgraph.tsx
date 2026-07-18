/**
 * /admin/orion-kgraph — ORION Knowledge Graph (Corporativo) (ORION-AI-57)
 *
 * Grafo corporativo de conhecimento: conecta as entidades REAIS de negócio
 * (pessoas, produtos, anunciantes, leilões, cidades) numa rede de relacionamentos
 * derivada só de fatos do banco. Fornece contexto, caminhos, comunidades,
 * similaridade e busca semântica para as demais IAs. Distinto do AI-34 (semântico).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BrainCircuit, Loader2, Gauge, Share2, Users, Crown, Search, BarChart3, Route } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const TIPO: Record<string, string> = { pessoa: "bg-sky-500", produto: "bg-emerald-500", anunciante: "bg-violet-500", leilao: "bg-amber-500", cidade: "bg-teal-500", pagamento: "bg-rose-500", pedido: "bg-orange-500", ia: "bg-indigo-500" };
const TIPO_TXT: Record<string, string> = { pessoa: "text-sky-700 bg-sky-100", produto: "text-emerald-700 bg-emerald-100", anunciante: "text-violet-700 bg-violet-100", leilao: "text-amber-700 bg-amber-100", cidade: "text-teal-700 bg-teal-100" };

type Aba = "resumo" | "grafo" | "comunidades" | "influenciadores" | "explorar" | "estatisticas";

export default function AdminOrionKgraph() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [termo, setTermo] = useState("");
  const [busca, setBusca] = useState<any[]>([]);
  const [ctx, setCtx] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-kgraph"], queryFn: () => rpc("kg_dashboard"), refetchInterval: 60000,
  });

  const ov = dash?.overview || {};
  const graph = dash?.graph || {};
  const nodes = (graph?.nodes || []) as any[];
  const edges = (graph?.edges || []) as any[];
  const clusters = (dash?.clusters || []) as any[];
  const influencers = (dash?.influencers || []) as any[];
  const stats = (dash?.estatisticas_7d || []) as any[];
  const lacunas = (dash?.lacunas || []) as string[];

  const doSearch = async () => {
    if (!termo.trim()) return;
    setBusy(true);
    try { setBusca(await rpc("semantic_search", { p_termo: termo })); } catch { setBusca([]); } finally { setBusy(false); }
  };
  const loadCtx = async (node: string) => {
    setBusy(true);
    try { setCtx(await rpc("knowledge_context", { p_node: node })); } catch (e: any) { setCtx({ erro: e.message }); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#120a1e] via-[#1e1533] to-[#120a1e] p-6 text-white shadow-xl ring-1 ring-fuchsia-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-fuchsia-500/10 ring-1 ring-fuchsia-500/30">
              <BrainCircuit className="h-8 w-8 text-fuchsia-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Knowledge Graph · Corporativo</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-57 · rede de entidades reais de negócio · contexto/caminhos/comunidades/busca · nada inventado
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[["Nós", ov.nos], ["Arestas", ov.arestas], ["GHS", ov.ghs], ["Knowledge", ov.knowledge_score]].map(([l, v]: any) => (
                <div key={l} className="rounded-2xl bg-white/5 px-4 py-2 text-center ring-1 ring-fuchsia-500/20">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-fuchsia-200/70">{l}</p>
                  <p className="text-2xl font-black text-fuchsia-200">{v ?? "—"}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Clusters", ov.clusters], ["Similaridades", ov.similaridades], ["Densidade", ov.densidade],
              ["Grau médio", ov.grau_medio], ["Cobertura", `${ov.cobertura_pct ?? 0}%`], ["Tipos de nó", Object.keys(ov.nos_por_tipo || {}).length]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Gauge, "Resumo"], ["grafo", Share2, `Grafo${nodes.length ? ` (${nodes.length})` : ""}`],
             ["comunidades", Users, `Comunidades${clusters.length ? ` (${clusters.length})` : ""}`], ["influenciadores", Crown, "Influenciadores"],
             ["explorar", Search, "Busca & Contexto"], ["estatisticas", BarChart3, "Estatísticas"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#1e1533] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-fuchsia-500" /></div>}

        {/* RESUMO */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Nós por tipo</h3>
                {Object.entries(ov.nos_por_tipo || {}).sort((a: any, b: any) => b[1] - a[1]).map(([t, n]: any) => {
                  const max = Math.max(1, ...Object.values(ov.nos_por_tipo || {}).map((x: any) => Number(x)));
                  return (
                    <div key={t} className="mb-1.5">
                      <div className="flex items-center justify-between text-[11px]"><span className="font-bold text-zinc-600 capitalize">{t}</span><span className="font-black text-zinc-700">{n}</span></div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${TIPO[t] || "bg-zinc-400"}`} style={{ width: `${(Number(n) / max) * 100}%` }} /></div>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Arestas por relação</h3>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(ov.arestas_por_relacao || {}).sort((a: any, b: any) => b[1] - a[1]).map(([r, n]: any) => (
                    <span key={r} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{r}: {n}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-3xl border border-fuchsia-100 bg-fuchsia-50/50 p-4">
              <p className="text-[11px] font-semibold text-fuchsia-800">GHS {ov.ghs} · Knowledge Score {ov.knowledge_score} · densidade {ov.densidade} · grau médio {ov.grau_medio} · {ov.cobertura_pct}% dos nós conectados</p>
            </div>
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="mb-1 text-sm font-black text-amber-800">Lacunas declaradas (nada inventado)</h3>
              {lacunas.map((l, i) => <p key={i} className="text-[11px] font-semibold text-amber-700">· {l}</p>)}
            </div>
          </div>
        )}

        {/* GRAFO */}
        {aba === "grafo" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Nós (por grau)</h3>
              <div className="max-h-[30rem] space-y-1 overflow-auto">
                {nodes.map((n: any) => (
                  <button key={n.id} onClick={() => { setAba("explorar"); loadCtx(n.id); }} className="flex w-full items-center gap-2 rounded-xl bg-slate-50 px-2 py-1.5 text-left hover:bg-slate-100">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TIPO[n.tipo] || "bg-zinc-400"}`} />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-zinc-700">{n.label}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{n.tipo}</span>
                    <span className="text-[11px] font-black text-fuchsia-600">g{n.grau}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Arestas (por peso)</h3>
              <div className="max-h-[30rem] space-y-1 overflow-auto">
                {edges.map((e: any, k: number) => (
                  <div key={k} className="flex flex-wrap items-center gap-1 border-b border-zinc-50 pb-1 text-[10px]">
                    <span className="truncate font-semibold text-zinc-600" style={{ maxWidth: "40%" }}>{String(e.source).split(":")[0]}</span>
                    <span className="rounded-full bg-fuchsia-100 px-1.5 py-0.5 font-black text-fuchsia-700">{e.rel}</span>
                    <span className="truncate font-semibold text-zinc-600" style={{ maxWidth: "40%" }}>{String(e.target).split(":")[0]}</span>
                    <span className="ml-auto text-zinc-400">×{e.peso}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-zinc-400 md:col-span-2">{graph.nota}</p>
          </div>
        )}

        {/* COMUNIDADES */}
        {aba === "comunidades" && !isLoading && (
          <div className="mt-4 space-y-3">
            {!clusters.length ? <p className="text-xs text-zinc-400">Nenhuma comunidade (≥2 membros) detectada.</p> : clusters.map((c: any, k: number) => (
              <div key={k} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-black text-zinc-800">{c.descricao}</span>
                  <span className="rounded-full bg-fuchsia-100 px-2 py-0.5 text-[11px] font-black text-fuchsia-700">{c.tamanho} membros</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(c.membros || []).slice(0, 20).map((m: any, i: number) => (
                    <span key={i} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TIPO_TXT[m.tipo] || "bg-slate-100 text-slate-600"}`}>{m.label}</span>
                  ))}
                  {(c.membros || []).length > 20 && <span className="text-[10px] text-zinc-400">+{c.membros.length - 20}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* INFLUENCIADORES */}
        {aba === "influenciadores" && !isLoading && (
          <div className="mt-4 space-y-2">
            {influencers.map((n: any, k: number) => (
              <button key={n.node} onClick={() => { setAba("explorar"); loadCtx(n.node); }} className="flex w-full items-center gap-3 rounded-3xl border border-zinc-100 bg-white p-3 text-left shadow-sm hover:bg-slate-50">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-fuchsia-100 text-[11px] font-black text-fuchsia-700">{k + 1}</span>
                <span className={`h-2.5 w-2.5 rounded-full ${TIPO[n.tipo] || "bg-zinc-400"}`} />
                <span className="min-w-0 flex-1 truncate font-black text-zinc-800">{n.label}</span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{n.tipo}</span>
                <div className="w-28"><div className="h-2 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-fuchsia-500" style={{ width: `${n.score}%` }} /></div></div>
                <span className="text-[11px] font-black text-fuchsia-600">grau {n.grau}</span>
              </button>
            ))}
          </div>
        )}

        {/* BUSCA & CONTEXTO */}
        {aba === "explorar" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="flex gap-2">
                <input value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSearch()}
                  placeholder="Busca semântica (nome, tipo, cidade)…" className="min-w-0 flex-1 rounded-2xl border border-zinc-200 px-3 py-2 text-sm" />
                <button onClick={doSearch} disabled={busy} className="flex items-center gap-1 rounded-2xl bg-fuchsia-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40"><Search className="h-4 w-4" /> Buscar</button>
              </div>
              {busca.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {busca.map((n: any) => (
                    <button key={n.node} onClick={() => loadCtx(n.node)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${TIPO_TXT[n.tipo] || "bg-slate-100 text-slate-600"}`}>{n.label} · g{n.grau}</button>
                  ))}
                </div>
              )}
            </div>
            {ctx && (
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                {ctx.erro ? <p className="text-xs text-red-600">{ctx.erro}</p> : (<>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`h-3 w-3 rounded-full ${TIPO[ctx.node?.tipo] || "bg-zinc-400"}`} />
                    <span className="text-sm font-black text-zinc-800">{ctx.node?.label}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{ctx.node?.tipo}</span>
                    <span className="text-[11px] text-zinc-500">grau {ctx.node?.grau} · score {ctx.node?.score} {ctx.node?.cidade ? `· ${ctx.node.cidade}` : ""}</span>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div>
                      <p className="text-[10px] font-black uppercase text-zinc-400">Relações (saída)</p>
                      {(ctx.relacoes || []).map((r: any, i: number) => <p key={i} className="truncate text-[11px] text-zinc-600"><b className="text-fuchsia-600">{r.relacao}</b> → {r.label}</p>)}
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-zinc-400">Relações (entrada)</p>
                      {(ctx.relacoes_entrada || []).map((r: any, i: number) => <p key={i} className="truncate text-[11px] text-zinc-600">{r.label} <b className="text-fuchsia-600">{r.relacao}</b> →</p>)}
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-zinc-400">Similares</p>
                      {(ctx.similares || []).map((s: any, i: number) => <p key={i} className="truncate text-[11px] text-zinc-600">{String(s.node).split(":")[1]?.slice(0, 8)} · {s.score}%</p>)}
                    </div>
                  </div>
                </>)}
              </div>
            )}
            {!ctx && <p className="rounded-2xl bg-slate-50 px-4 py-3 text-[11px] text-zinc-500"><Route className="mr-1 inline h-3.5 w-3.5" /> Busque uma entidade acima e clique para ver o contexto completo (ego-network + similares) — a "consulta de contexto" que as outras IAs usam.</p>}
          </div>
        )}

        {/* ESTATÍSTICAS */}
        {aba === "estatisticas" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">Série (7 dias)</h3>
            {!stats.length ? <p className="text-xs text-zinc-400">Sem estatísticas ainda.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead><tr className="text-zinc-400"><th className="pb-1 pr-3">Dia</th><th className="pr-3">Nós</th><th className="pr-3">Arestas</th><th className="pr-3">Clusters</th><th className="pr-3">GHS</th><th>Knowledge</th></tr></thead>
                  <tbody>{stats.map((s: any) => (
                    <tr key={s.dia} className="border-t border-zinc-50 font-semibold text-zinc-600">
                      <td className="py-1 pr-3">{s.dia}</td><td className="pr-3">{s.nos}</td><td className="pr-3">{s.arestas}</td><td className="pr-3">{s.clusters}</td><td className="pr-3">{s.ghs}</td><td>{s.ks}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Knowledge Graph (Corporativo) v1.0 · ORION-AI-57 · nós/arestas reais + comunidades + similaridade + caminhos ·
          knowledge_context / find_shortest_path / semantic_search · fornece contexto às IAs ORION · tick */15
        </p>
      </div>
    </div>
  );
}
