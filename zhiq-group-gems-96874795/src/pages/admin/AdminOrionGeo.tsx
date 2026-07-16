/**
 * /admin/orion-geo — ORION GEO Optimization AI (ORION-AI-33)
 *
 * Generative Engine Optimization: prepara cada anúncio para descoberta por
 * mecanismos de busca e IA — dados estruturados reais (JSON-LD/OG/Twitter
 * Cards), FAQ, contexto semântico e o VIAGG GEO Index (VGI: Platinum/Gold/
 * Silver/Bronze). Otimização COMPLEMENTAR — nunca altera o conteúdo original.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { Globe, Loader2, Sparkles, Gauge, Braces, Network, ListChecks, MapPinned } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const vgiColor = (s: number) => s >= 85 ? "text-cyan-300" : s >= 70 ? "text-amber-300" : s >= 50 ? "text-slate-200" : "text-orange-300";
const CLASSE: Record<string, string> = {
  platinum: "bg-cyan-100 text-cyan-800", gold: "bg-amber-100 text-amber-800",
  silver: "bg-slate-200 text-slate-700", bronze: "bg-orange-100 text-orange-700",
};
const CLASSE_EMOJI: Record<string, string> = { platinum: "💎", gold: "🥇", silver: "🥈", bronze: "🥉" };

type Aba = "resumo" | "anuncios" | "estruturados" | "semantico" | "recomendacoes" | "landing";

export default function AdminOrionGeo() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");
  const [sel, setSel] = useState<any>(null);

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-geo"], queryFn: () => rpc("geo_dashboard"), refetchInterval: 60000,
  });
  const { data: anuncios = [] } = useQuery({
    queryKey: ["orion-geo-scores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orion_geo_scores").select("*")
        .order("dia", { ascending: false }).order("vgi", { ascending: false }).limit(200);
      if (error) throw new Error(error.message);
      const ultimo = (data || []).map((r: any) => r.dia).sort().reverse()[0];
      return (data || []).filter((r: any) => r.dia === ultimo).sort((a: any, b: any) => b.vgi - a.vgi);
    },
  });

  const score = dash?.score || {};
  const quality = dash?.quality || {};
  const gaps = dash?.gaps || {};
  const landing = dash?.landing || {};
  const recs = dash?.recommendations || {};
  const dist = score.distribuicao || {};

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const ctx = await rpc("geo_summary");
      const r = await orionAiText("geo_optimization", `Tipo: ${tipo}\nEstado GEO: ${JSON.stringify(ctx)}`, { promptKey, maxTokens: 700 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER — VGI Ecosystem */}
        <div className="rounded-3xl bg-gradient-to-r from-[#0a1a2f] via-[#123a5e] to-[#0a1a2f] p-6 text-white shadow-xl ring-1 ring-cyan-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 ring-1 ring-cyan-500/30">
              <Globe className="h-8 w-8 text-cyan-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION GEO Optimization AI</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-33 · Generative Engine Optimization · otimização complementar, nunca altera o anúncio
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-cyan-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-200/70">VIAGG GEO Index</p>
              <p className={`text-4xl font-black ${vgiColor(score.geo_ecosystem_score)}`}>{score.geo_ecosystem_score ?? "—"}</p>
              <p className="text-[11px] font-bold text-cyan-200/80">{score.anuncios ?? 0} anúncios</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["GEO médio", score.geo_medio], ["Content Quality", score.content_quality_medio],
              ["💎 Platinum", dist.platinum], ["🥇 Gold", dist.gold], ["🥈 Silver", dist.silver], ["🥉 Bronze", dist.bronze]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Sparkles, "Visão Geral"], ["anuncios", Gauge, `GEO Score${anuncios.length ? ` (${anuncios.length})` : ""}`],
             ["estruturados", Braces, "Dados Estruturados"], ["semantico", Network, "Contexto Semântico"],
             ["recomendacoes", ListChecks, "Recomendações"], ["landing", MapPinned, "Landing Pages"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#123a5e] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
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
                {[["geo.summary", "Resumo IA"], ["geo.quality", "Qualidade"], ["geo.optimize", "Otimização"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-slate-100">{narrativa}</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[["Com JSON-LD", quality.com_json_ld, "schema.org gerado"], ["Com FAQ", quality.com_faq, "≥2 perguntas reais"],
                ["Com imagem (OG)", quality.com_imagem, "og:image presente"]].map(([l, v, s]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-3xl font-black text-cyan-700">{v ?? 0}</p>
                  <p className="text-[10px] text-zinc-400">{s}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-red-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-red-700">🕳️ Anúncios pobres (VGI &lt; 50)</h3>
              {!(gaps.anuncios_pobres || []).length ? <p className="text-xs text-zinc-400">Nenhum anúncio pobre 🎉</p> :
                (gaps.anuncios_pobres || []).map((g: any, i: number) => (
                  <div key={i} className="mb-1 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{g.titulo || "(sem título)"}</span>
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-700">{CLASSE_EMOJI[g.classificacao]} VGI {g.vgi}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* GEO SCORE — anúncios */}
        {aba === "anuncios" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!anuncios.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">Sem scores. O motor roda de hora em hora (tick :13).</div>
            ) : anuncios.map((a: any) => (
              <div key={`${a.entidade_tipo}-${a.entidade_id}`} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${CLASSE[a.classificacao] || "bg-zinc-100 text-zinc-600"}`}>{CLASSE_EMOJI[a.classificacao]} {a.classificacao}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{a.entidade_tipo}</span>
                  <p className="min-w-0 flex-1 truncate font-black text-zinc-800">{a.titulo || "(sem título)"}</p>
                  <span className="rounded-2xl bg-[#123a5e] px-3 py-1 text-sm font-black text-white">VGI {a.vgi}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {[["GEO", a.geo_score], ["Content Q.", a.content_quality_score], ["Discovery", a.discovery_score], ["Semantic", a.semantic_score]].map(([l, v]: any) => (
                    <span key={l} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{l}: {v}</span>
                  ))}
                </div>
                {Array.isArray(a.plano) && a.plano[0] && (
                  <div className="mt-2 rounded-2xl bg-cyan-50/60 p-2 ring-1 ring-cyan-100">
                    <p className="text-[11px] font-bold text-cyan-800">🎯 Próxima melhoria: {a.plano[0].acao} <span className="font-black">(+{a.plano[0].impacto})</span></p>
                    <p className="text-[10px] text-cyan-600">{a.plano[0].motivo}</p>
                  </div>
                )}
                <button onClick={() => setSel(sel?.entidade_id === a.entidade_id ? null : a)}
                  className="mt-2 text-[11px] font-bold text-cyan-700 hover:underline">
                  {sel?.entidade_id === a.entidade_id ? "▲ ocultar dados estruturados" : "▼ ver JSON-LD / FAQ"}
                </button>
                {sel?.entidade_id === a.entidade_id && (
                  <pre className="mt-2 max-h-72 overflow-auto rounded-2xl bg-slate-900 p-3 text-[10px] leading-relaxed text-cyan-200">
{JSON.stringify({ structured_data: a.structured_data, faq: a.faq, contexto: a.contexto }, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}

        {/* DADOS ESTRUTURADOS */}
        {aba === "estruturados" && !isLoading && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-zinc-500">JSON-LD (schema.org) + Open Graph + Twitter Cards gerados a partir dos campos reais — padrões públicos, prontos para indexação. Nada é inventado.</p>
            {anuncios.filter((a: any) => a.structured_data?.json_ld).map((a: any) => (
              <details key={`${a.entidade_tipo}-${a.entidade_id}`} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <summary className="cursor-pointer font-bold text-zinc-800">{CLASSE_EMOJI[a.classificacao]} {a.titulo || "(sem título)"} <span className="text-[11px] font-normal text-zinc-400">— {a.entidade_tipo} · VGI {a.vgi}</span></summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded-2xl bg-slate-900 p-3 text-[10px] leading-relaxed text-cyan-200">
{JSON.stringify(a.structured_data, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        )}

        {/* CONTEXTO SEMÂNTICO */}
        {aba === "semantico" && !isLoading && (
          <div className="mt-4 space-y-2">
            {anuncios.map((a: any) => (
              <div key={`${a.entidade_tipo}-${a.entidade_id}`} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <p className="font-bold text-zinc-800">{CLASSE_EMOJI[a.classificacao]} {a.titulo || "(sem título)"}</p>
                {Array.isArray(a.contexto?.cadeia) && (
                  <p className="mt-1 text-[11px] text-zinc-500">Cadeia: {a.contexto.cadeia.filter(Boolean).join(" → ")}</p>
                )}
                {Array.isArray(a.contexto?.termos_relacionados) && a.contexto.termos_relacionados.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {a.contexto.termos_relacionados.map((t: string, i: number) => (
                      <span key={i} className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* RECOMENDAÇÕES */}
        {aba === "recomendacoes" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-zinc-700">🔧 Ações de maior impacto estrutural ({recs.total ?? 0} no total)</h3>
            <div className="space-y-1.5">
              {(recs.top_acoes || []).map((r: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-700">{r.acao}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{r.anuncios} anúncios</span>
                  <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-black text-cyan-700">impacto {r.impacto_medio}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LANDING PAGES */}
        {aba === "landing" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🗺️ Por cidade</h3>
              {(landing.por_cidade || []).map((c: any, i: number) => (
                <div key={i} className="mb-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{c.cidade}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{c.anuncios} anúncios · {c.platinum_gold} 💎🥇</span>
                  <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-black text-cyan-700">VGI {c.vgi_medio}</span>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">🏷️ Por categoria</h3>
              {(landing.por_categoria || []).map((k: any, i: number) => (
                <div key={i} className="mb-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{k.categoria}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{k.anuncios}</span>
                  <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-black text-cyan-700">VGI {k.vgi_medio}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-amber-600 md:col-span-2">⚠ {landing.nota}</p>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION GEO Optimization AI v1.0 · ORION-AI-33 · VIAGG GEO Index + JSON-LD/OG/Twitter Cards + FAQ ·
          read-only · otimização complementar, nunca altera o anúncio · tick :13 · reusa AI-32 · IA só via Gateway
        </p>
      </div>
    </div>
  );
}
