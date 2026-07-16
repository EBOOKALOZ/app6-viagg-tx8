/**
 * /admin/orion-search-discovery — ORION Search & Discovery AI (ORION-AI-32)
 *
 * Maximiza a DESCOBRIBILIDADE dos anúncios (VIAGG Discovery Engine — VDE):
 * 4 scores explicáveis por anúncio (Discovery / AI Discovery / Search /
 * Semantic) + plano de otimização priorizado, gap detection e busca semântica.
 * Nunca altera o conteúdo do anunciante — só enriquece, relaciona e recomenda.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { Search, Loader2, Sparkles, BarChart3, Package, Lightbulb, Braces, Send } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const vdeColor = (s: number) => s >= 80 ? "text-emerald-300" : s >= 60 ? "text-amber-300" : s >= 40 ? "text-orange-300" : "text-red-300";
const VIS: Record<string, string> = {
  excelente: "bg-emerald-100 text-emerald-700", bom: "bg-lime-100 text-lime-700",
  regular: "bg-amber-100 text-amber-700", invisivel: "bg-red-100 text-red-700",
};

type Aba = "resumo" | "anuncios" | "analytics" | "oportunidades" | "semantic";

export default function AdminOrionSearchDiscovery() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");
  const [termo, setTermo] = useState("");
  const [semRes, setSemRes] = useState<any>(null);

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-search-discovery"], queryFn: () => rpc("search_dashboard"), refetchInterval: 60000,
  });
  const { data: anuncios = [] } = useQuery({
    queryKey: ["orion-search-scores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orion_search_scores").select("*")
        .order("dia", { ascending: false }).order("vde_score", { ascending: true }).limit(200);
      if (error) throw new Error(error.message);
      const dias = (data || []).map((r: any) => r.dia).sort().reverse();
      const ultimo = dias[0];
      return (data || []).filter((r: any) => r.dia === ultimo).sort((a: any, b: any) => a.vde_score - b.vde_score);
    },
  });

  const score = dash?.score || {};
  const analytics = dash?.analytics || {};
  const gaps = dash?.gaps || {};
  const opp = dash?.opportunities || {};
  const dist = analytics.distribuicao || {};

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("search_summary");
      const r = await orionAiText("search_discovery", `Tipo: ${tipo}\nInteligência de descoberta: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 700 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(false); }
  };

  const buscarSemantico = async () => {
    if (!termo.trim()) return;
    setOcupado(true); setSemRes(null);
    try { setSemRes(await rpc("search_semantic", { p_termo: termo, p_origem: "probe" })); }
    finally { setOcupado(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER — VDE Ecosystem Score */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0b1f2a] via-[#12343b] to-[#0b1f2a] p-6 text-white shadow-xl ring-1 ring-cyan-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 ring-1 ring-cyan-500/30">
              <Search className="h-8 w-8 text-cyan-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Search & Discovery AI</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-32 · VIAGG Discovery Engine · enriquece e recomenda, nunca altera o anúncio
                {dash ? "" : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-cyan-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-200/70">Discovery Ecosystem</p>
              <p className={`text-4xl font-black ${vdeColor(score.discovery_ecosystem_score)}`}>{score.discovery_ecosystem_score ?? "—"}</p>
              <p className="text-[11px] font-bold text-cyan-200/80">{score.anuncios ?? 0} anúncios</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Discovery méd.", score.discovery_medio], ["AI Discovery", score.ai_discovery_medio],
              ["Search", score.search_medio], ["Semantic", score.semantic_medio],
              ["Excelentes", score.excelentes], ["Invisíveis", score.invisiveis]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Sparkles, "Visão Geral"], ["anuncios", Package, `Discovery Score${anuncios.length ? ` (${anuncios.length})` : ""}`],
             ["analytics", BarChart3, "Search Analytics"], ["oportunidades", Lightbulb, "Oportunidades & Gaps"],
             ["semantic", Braces, "Busca Semântica"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#12343b] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-cyan-500" /></div>}

        {/* VISÃO GERAL */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["search.summary", "Resumo IA"], ["search.analytics", "Análise de busca"], ["search.opportunity", "Oportunidades"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-slate-100">{narrativa}</p>}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Distribuição de visibilidade</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[["Excelente", dist.excelente, "text-emerald-600"], ["Bom", dist.bom, "text-lime-600"],
                  ["Regular", dist.regular, "text-amber-600"], ["Invisível", dist.invisivel, "text-red-600"]].map(([l, v, c]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className={`text-2xl font-black ${c}`}>{v ?? 0}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-amber-600">⚠ {analytics.lacuna_telemetria}</p>
            </div>
          </div>
        )}

        {/* DISCOVERY SCORE — anúncios */}
        {aba === "anuncios" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!anuncios.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">Sem scores. O motor roda de hora em hora (tick :11).</div>
            ) : anuncios.map((a: any) => (
              <div key={`${a.entidade_tipo}-${a.entidade_id}`} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${VIS[a.visibilidade] || "bg-zinc-100 text-zinc-600"}`}>{a.visibilidade}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{a.entidade_tipo}</span>
                  <p className="min-w-0 flex-1 truncate font-black text-zinc-800">{a.titulo || "(sem título)"}</p>
                  <span className="rounded-2xl bg-[#12343b] px-3 py-1 text-sm font-black text-white">VDE {a.vde_score}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {[["Discovery", a.discovery_score], ["AI Disc.", a.ai_discovery_score], ["Search", a.search_score], ["Semantic", a.semantic_score]].map(([l, v]: any) => (
                    <span key={l} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{l}: {v}</span>
                  ))}
                  {a.categoria && <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-700">{a.categoria}</span>}
                </div>
                {Array.isArray(a.pontos_fracos) && a.pontos_fracos.length > 0 && (
                  <p className="mt-1.5 text-[11px] text-red-500">Pontos fracos: {a.pontos_fracos.join(", ")}</p>
                )}
                {Array.isArray(a.plano) && a.plano[0] && (
                  <div className="mt-2 rounded-2xl bg-cyan-50/60 p-2 ring-1 ring-cyan-100">
                    <p className="text-[11px] font-bold text-cyan-800">🎯 Próxima ação: {a.plano[0].acao} <span className="font-black">(+{a.plano[0].impacto})</span></p>
                    <p className="text-[10px] text-cyan-600">{a.plano[0].motivo}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* SEARCH ANALYTICS */}
        {aba === "analytics" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[["VDE médio", analytics.vde_medio], ["Discovery méd.", analytics.discovery_medio],
                ["Buscas reg.", analytics.buscas_registradas], ["Sem resultado", analytics.buscas_sem_resultado]].map(([l, v]: any) => (
                <div key={l} className="rounded-2xl border border-zinc-100 bg-white p-3 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-2xl font-black text-zinc-800">{v ?? 0}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-red-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-red-700">🕳️ Anúncios invisíveis (VDE &lt; 40)</h3>
              {!(analytics.invisiveis || []).length ? <p className="text-xs text-zinc-400">Nenhum anúncio invisível 🎉</p> :
                (analytics.invisiveis || []).map((iv: any, i: number) => (
                  <div key={i} className="mb-1 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{iv.titulo || "(sem título)"}</span>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">VDE {iv.vde}</span>
                  </div>
                ))}
            </div>
            <p className="text-[11px] text-amber-600">⚠ {analytics.lacuna_telemetria}</p>
          </div>
        )}

        {/* OPORTUNIDADES & GAPS */}
        {aba === "oportunidades" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-emerald-700">💎 Maior potencial de descoberta</h3>
              {!(opp.maior_potencial || []).length ? <p className="text-xs text-zinc-400">—</p> :
                (opp.maior_potencial || []).map((o: any, i: number) => (
                  <div key={i} className="mb-2 rounded-2xl bg-emerald-50/60 p-2">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-bold text-zinc-700">{o.titulo || "(sem título)"}</span>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">+{o.ganho_estimado}</span>
                    </div>
                    {o.top_acao && <p className="text-[10px] text-emerald-600">→ {o.top_acao}</p>}
                  </div>
                ))}
            </div>
            <div className="rounded-3xl border border-cyan-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-cyan-700">🗺️ Gaps por cidade (demanda × oferta)</h3>
              {!(gaps.gaps_por_cidade || []).length ? <p className="text-xs text-zinc-400">—</p> :
                (gaps.gaps_por_cidade || []).map((g: any, i: number) => (
                  <div key={i} className="mb-1 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{g.cidade || "(sem cidade)"}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">dem {g.demanda} / of {g.oferta}</span>
                    <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-black text-cyan-700">pressão {g.pressao}</span>
                  </div>
                ))}
              {(gaps.buscas_sem_resultado || []).length > 0 && (
                <p className="mt-2 text-[11px] text-amber-600">Buscas sem resultado: {(gaps.buscas_sem_resultado || []).map((s: any) => s.termo).join(", ")}</p>
              )}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm md:col-span-2">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🔧 Recomendações agregadas (maior impacto)</h3>
              <div className="flex flex-wrap gap-2">
                {(opp.top_recomendacoes_agregadas || []).map((r: any, i: number) => (
                  <span key={i} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">
                    {r.acao} · {r.anuncios} anúncios · impacto {r.impacto_medio}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* BUSCA SEMÂNTICA */}
        {aba === "semantic" && !isLoading && (
          <div className="mt-4 space-y-3">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-2 text-xs text-zinc-500">Busca por intenção — expande termos, categorias e relações a partir dos anúncios reais. Buscas sem resultado viram gaps de sortimento.</p>
              <div className="flex flex-wrap gap-2">
                {["notebook gamer", "pizza", "corrida", "frete", "casa"].map((q) => (
                  <button key={q} onClick={() => setTermo(q)} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200">{q}</button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && buscarSemantico()}
                  placeholder="Digite um termo de busca…"
                  className="flex-1 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-400" />
                <button onClick={buscarSemantico} disabled={ocupado || !termo.trim()}
                  className="flex items-center gap-1 rounded-2xl bg-[#12343b] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
                  {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Buscar
                </button>
              </div>
            </div>
            {semRes && (
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <p className="font-black text-zinc-800">"{semRes.termo}"</p>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${semRes.resultados > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                    {semRes.resultados} resultado{semRes.resultados === 1 ? "" : "s"}
                  </span>
                </div>
                {(semRes.categorias_relacionadas || []).length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">Categorias relacionadas</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(semRes.categorias_relacionadas || []).map((c: string, i: number) => (
                        <span key={i} className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-700">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
                {(semRes.termos_relacionados || []).length > 0 && (
                  <div className="mt-2">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">Termos relacionados (co-ocorrência real)</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(semRes.termos_relacionados || []).map((t: string, i: number) => (
                        <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                <p className="mt-3 text-[11px] text-zinc-400">{semRes.nota}</p>
              </div>
            )}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Search & Discovery AI v1.0 · ORION-AI-32 · VIAGG Discovery Engine (4 scores + plano) ·
          read-only · enriquece/recomenda, nunca altera o anúncio · tick :11 · IA só via Gateway + Prompt Registry
        </p>
      </div>
    </div>
  );
}
