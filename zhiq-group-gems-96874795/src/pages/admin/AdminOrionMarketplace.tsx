/**
 * /admin/orion-marketplace — ORION Marketplace Intelligence AI (ORION-AI-18)
 *
 * O cérebro comercial da VIAGG-TX8: transforma dados reais do marketplace
 * (intenções de contato, cliques, anúncios, território) em tendências,
 * oportunidades, conversão e sugestões — tudo explicável e auditável.
 * Read-only sobre as fontes; sugere, nunca executa. IA só via Gateway
 * + Prompt Registry. Insights persistidos em orion_market_insights.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { Store, Loader2, Sparkles, TrendingUp, MapPin, Target, Megaphone, Search } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const TREND: Record<string, string> = {
  alta: "bg-emerald-100 text-emerald-700", queda: "bg-red-100 text-red-700", estavel: "bg-zinc-100 text-zinc-600",
};

type Aba = "central" | "tendencias" | "territorio" | "oportunidades" | "anuncios";

export default function AdminOrionMarketplace() {
  const [aba, setAba] = useState<Aba>("central");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-marketplace"], queryFn: () => rpc("market_dashboard"), refetchInterval: 60000,
  });

  const score = dash?.score || {};
  const metrics = dash?.metrics || {};
  const trends = dash?.trends || {};
  const territory = dash?.territory || {};
  const listings = dash?.listings || {};
  const opportunities = (dash?.opportunities || []) as any[];
  const search = dash?.search || {};

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("market_summary");
      const r = await orionAiText("marketplace", `Tipo: ${tipo}\nDados reais do marketplace: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 600 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(false); }
  };

  const kpis: [string, any][] = [
    ["Anúncios", metrics.anuncios], ["Cliques 30d", metrics.cliques_30d],
    ["Interesses 30d", metrics.intencoes_30d], ["Convertidos 30d", metrics.intencoes_convertidas_30d],
    ["Cidades c/ sinal", metrics.cidades_com_sinal], ["Verticais", metrics.verticais_ativas],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#053b2b] via-[#0a6b4d] to-[#053b2b] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Store className="h-8 w-8 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Marketplace Intelligence AI</h1>
              <p className="text-sm text-emerald-200/80">
                ORION-AI-18 · cérebro comercial · tendências, oportunidades e conversão explicáveis
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/70">Market Score</p>
              <p className="text-3xl font-black">{score.market_score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {kpis.map(([l, v]) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-emerald-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["central", Sparkles, "Central"], ["tendencias", TrendingUp, "Tendências"],
             ["territorio", MapPin, "Território"], ["oportunidades", Target, `Oportunidades${opportunities.length ? ` (${opportunities.length})` : ""}`],
             ["anuncios", Megaphone, "Anúncios"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#0a6b4d] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>}

        {/* CENTRAL */}
        {aba === "central" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["market.executive", "Resumo executivo"], ["market.trends", "Tendências"],
                  ["market.opportunities", "Oportunidades"], ["market.summary", "Panorama"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-emerald-200 hover:bg-emerald-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-emerald-100">{narrativa}</p>}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Componentes do Market Score</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Object.entries((score.componentes || {}) as Record<string, any>).map(([k, v]) => (
                  <div key={k} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{k.replaceAll("_", " ")}</p>
                    <p className="text-lg font-black text-zinc-800">{v}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-zinc-400">{score.formula}</p>
            </div>
          </div>
        )}

        {/* TENDÊNCIAS */}
        {aba === "tendencias" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Interesse por vertical (30d)</h3>
              {((trends.verticais || []) as any[]).map((v: any) => (
                <div key={v.vertical} className="mb-1.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-xs font-semibold text-zinc-600">{v.vertical}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${TREND[v.tendencia] || ""}`}>
                    {v.tendencia}{v.variacao_pct != null ? ` ${v.variacao_pct > 0 ? "+" : ""}${v.variacao_pct}%` : ""}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">{v.interesse_30d}</span>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Produtos mais clicados (7d)</h3>
              {!((trends.produtos_clicados || []) as any[]).length ? (
                <p className="text-xs text-zinc-400">Sem cliques em produtos de loja no período.</p>
              ) : ((trends.produtos_clicados || []) as any[]).map((p: any) => (
                <div key={p.produto_id} className="mb-1.5 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{p.nome || p.produto_id?.slice(0, 8)}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">30d: {p.cliques_30d}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">7d: {p.cliques_7d}</span>
                </div>
              ))}
              <p className="mt-2 text-[10px] text-zinc-400">{trends.nota}</p>
            </div>
          </div>
        )}

        {/* TERRITÓRIO */}
        {aba === "territorio" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Demanda × Oferta por cidade (30d)</h3>
              <div className="space-y-1.5">
                {((territory.cidades || []) as any[]).map((c: any) => (
                  <div key={c.cidade} className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2">
                    <span className="min-w-0 flex-1 font-bold text-zinc-700">{c.cidade}</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">demanda {c.demanda}</span>
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-black text-sky-700">oferta {c.oferta}</span>
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white">{c.sinal}</span>
                  </div>
                ))}
              </div>
              {territory.territorio_pre_computado?.status && (
                <p className="mt-2 text-[10px] text-amber-600">
                  Território pré-computado: {territory.territorio_pre_computado.status}
                </p>
              )}
              <p className="mt-1 text-[10px] text-zinc-400">{territory.nota}</p>
            </div>
            {!!((territory.growth_scores || []) as any[]).length && (
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Growth AI — score de expansão</h3>
                {((territory.growth_scores || []) as any[]).map((g: any) => (
                  <div key={`${g.cidade}${g.uf}`} className="mb-1.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1 text-xs font-semibold text-zinc-600">{g.cidade}/{g.uf}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{g.classificacao}</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">{g.score}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* OPORTUNIDADES */}
        {aba === "oportunidades" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!opportunities.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">
                Nenhuma oportunidade destacada hoje. O motor roda de hora em hora (tick :40).
              </div>
            ) : opportunities.map((o: any, i: number) => (
              <div key={i} className="rounded-3xl border border-emerald-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Target className="h-4 w-4 text-emerald-600" />
                  <p className="min-w-0 flex-1 font-black text-zinc-800">{o.titulo}</p>
                  <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-black text-white">conf {o.score_confianca}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-600">{o.descricao}</p>
                <p className="mt-1 text-[11px] text-zinc-400">{o.justificativa}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {((o.modulos || []) as string[]).map((m) => (
                    <span key={m} className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-500">{m}</span>
                  ))}
                </div>
              </div>
            ))}
            <div className="rounded-3xl border border-amber-100 bg-amber-50/50 p-4 text-xs text-amber-700">
              <div className="flex items-center gap-2 font-black"><Search className="h-4 w-4" /> Inteligência de busca</div>
              <p className="mt-1">{search.motivo || search.status}</p>
              {search.como_instrumentar && <p className="mt-1 text-[11px] text-amber-600">Como instrumentar: {search.como_instrumentar}</p>}
            </div>
          </div>
        )}

        {/* ANÚNCIOS */}
        {aba === "anuncios" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Conversão por vertical (30d)</h3>
              {((listings.conversao_por_vertical || []) as any[]).map((c: any) => (
                <div key={c.vertical} className="mb-2 rounded-2xl bg-slate-50 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 font-bold text-zinc-700">{c.vertical}</span>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">{c.taxa_conversao_pct ?? 0}%</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{c.convertidos}/{c.total_30d}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-400">{c.diagnostico}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Qualidade do catálogo</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {Object.entries((listings.qualidade_anuncios || {}) as Record<string, any>).map(([k, v]) => (
                  <div key={k} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{k.replaceAll("_", " ")}</p>
                    <p className="text-lg font-black text-zinc-800">{v}</p>
                  </div>
                ))}
              </div>
              {!!((listings.melhorias_sugeridas || []) as any[]).length && (
                <div className="mt-3">
                  <h4 className="mb-1 text-xs font-black text-zinc-500">Melhorias sugeridas (não aplicadas)</h4>
                  {((listings.melhorias_sugeridas || []) as any[]).map((m: any) => (
                    <div key={m.anuncio_id} className="mb-1 flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate font-semibold text-zinc-600">{m.titulo}</span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{m.sugestao}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[10px] text-zinc-400">{listings.nota}</p>
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Marketplace Intelligence AI v1.0 · ORION-AI-18 · read-only sobre as fontes · sugere, não executa ·
          insights idempotentes por dia · tick :40 · IA só via Gateway + Prompt Registry
        </p>
      </div>
    </div>
  );
}
