/**
 * /admin/orion-ai-visibility — ORION AI Visibility & Answer Intelligence (ORION-AI-36)
 *
 * Camada de MEDIÇÃO do Discovery Ecosystem: mede quão preparado cada conteúdo
 * está para ser encontrado/compreendido/citado por IAs generativas (ChatGPT/
 * Gemini/Claude/Perplexity/Copilot) e busca tradicional. Consolida AI-32/33/34/
 * 35/20 em AIS (AI Visibility Score) + AQS (Answer Quality Score). Read-only.
 * NUNCA inventa fato; nunca altera conteúdo; toda sugestão tem evidência.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { Radar, Loader2, Sparkles, Trophy, BarChart3, Bot } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const aisColor = (s: number) => s >= 80 ? "text-emerald-300" : s >= 60 ? "text-teal-300" : s >= 40 ? "text-amber-300" : "text-red-300";
const HEALTH: Record<string, string> = { verde: "bg-emerald-100 text-emerald-700", amarelo: "bg-amber-100 text-amber-700", vermelho: "bg-red-100 text-red-700" };
const faixa = (s: number) => s >= 80 ? ["excelente", "bg-emerald-100 text-emerald-700"] : s >= 60 ? ["bom", "bg-teal-100 text-teal-700"] : s >= 40 ? ["regular", "bg-amber-100 text-amber-700"] : ["fraco", "bg-red-100 text-red-700"];

type Aba = "resumo" | "ranking" | "gargalos" | "engines";

export default function AdminOrionAiVisibility() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-aivis"], queryFn: () => rpc("ai_visibility_dashboard"), refetchInterval: 60000,
  });
  const { data: entidades = [] } = useQuery({
    queryKey: ["orion-aivis-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orion_ai_visibility").select("*")
        .order("dia", { ascending: false }).order("visibility_score", { ascending: false }).limit(300);
      if (error) throw new Error(error.message);
      const ultimo = (data || []).map((r: any) => r.dia).sort().reverse()[0];
      return (data || []).filter((r: any) => r.dia === ultimo).sort((a: any, b: any) => b.visibility_score - a.visibility_score);
    },
  });

  const score = dash?.score || {};
  const health = dash?.health || {};
  const analytics = dash?.analytics || {};
  const metrics = dash?.metrics || {};
  const dist = score.distribuicao || {};
  const gargalos = analytics.gargalos || {};

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const c = await rpc("ai_visibility_summary");
      const r = await orionAiText("ai_visibility", `Tipo: ${tipo}\nEstado de visibilidade para IA: ${JSON.stringify(c)}`, { promptKey, maxTokens: 700 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(false); }
  };

  const ENGINES = ["ChatGPT", "Gemini", "Claude", "Perplexity", "Copilot", "Busca tradicional"];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER — AIS */}
        <div className="rounded-3xl bg-gradient-to-r from-[#08211c] via-[#0f3d33] to-[#08211c] p-6 text-white shadow-xl ring-1 ring-teal-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500/10 ring-1 ring-teal-500/30">
              <Radar className="h-8 w-8 text-teal-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION AI Visibility & Answer Intelligence</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-36 · prontidão para IA generativa · padrões abertos, sem controlar respostas
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-teal-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-teal-200/70">AI Visibility Score</p>
              <p className={`text-4xl font-black ${aisColor(score.ais_medio)}`}>{score.ais_medio ?? "—"}</p>
              <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${HEALTH[health.status] || "bg-white/10 text-white"}`}>{health.status ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["AQS médio", score.aqs_medio], ["AI Readiness", score.ai_readiness_medio], ["Structured Data", score.structured_data_medio],
              ["Excelentes", dist.excelente], ["Regulares", dist.regular], ["Fracas", dist.fraco]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Sparkles, "Visão Geral"], ["ranking", Trophy, `Ranking${entidades.length ? ` (${entidades.length})` : ""}`],
             ["gargalos", BarChart3, "Gargalos"], ["engines", Bot, "Prontidão por Engine"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#0f3d33] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-teal-500" /></div>}

        {/* VISÃO GERAL */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["aivis.prioritize", "Priorizar otimizações"], ["aivis.improve_semantic", "Melhorias semânticas"], ["aivis.low_visibility", "Explicar baixa visibilidade"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-slate-100">{narrativa}</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Entidades medidas", score.entidades], ["Menções reais", metrics.mencoes], ["Logs", metrics.logs], ["Answer Quality", metrics.answer_quality_total]].map(([l, v]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-2xl font-black text-teal-700">{String(v ?? 0)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-amber-50 p-3 text-[11px] text-amber-700">⚠ {analytics.nota_mencoes}</div>
          </div>
        )}

        {/* RANKING */}
        {aba === "ranking" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!entidades.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">Sem dados. O motor roda a cada 21 min (tick */21).</div>
            ) : entidades.map((e: any) => {
              const [fx, cls] = faixa(e.visibility_score);
              return (
                <div key={`${e.entity_type}-${e.entity_id}`} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${cls}`}>{fx}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{e.entity_type}</span>
                    <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-600">{e.entity_id}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">AQS {e.answer_score}</span>
                    <span className="rounded-2xl bg-[#0f3d33] px-3 py-1 text-sm font-black text-white">AIS {e.visibility_score}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[["Semantic", e.semantic_score], ["Struct.Data", e.structured_data_score], ["Autoridade", e.authority_score],
                      ["Citação(prontidão)", e.citation_score], ["Freshness", e.freshness_score], ["Trust", e.trust_score], ["AI Readiness", e.ai_readiness]].map(([l, v]: any) => (
                      <span key={l} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{l}: {v}</span>
                    ))}
                  </div>
                  {Array.isArray(e.prioridades) && e.prioridades[0] && (
                    <div className="mt-2 rounded-2xl bg-teal-50/60 p-2 ring-1 ring-teal-100">
                      <p className="text-[11px] font-bold text-teal-800">🎯 {e.prioridades[0].acao} <span className="font-black">(+{e.prioridades[0].impacto})</span></p>
                      <p className="text-[10px] text-teal-600">evidência: {e.prioridades[0].evidencia}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* GARGALOS */}
        {aba === "gargalos" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-red-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-red-700">⛔ Gargalos de prontidão para IA</h3>
              {[["Sem dados estruturados (<50)", gargalos.sem_structured_data], ["Baixa semântica (<50)", gargalos.baixa_semantica], ["Baixa autoridade (<50)", gargalos.baixa_autoridade]].map(([l, v]: any) => (
                <div key={l} className="mb-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{l}</span>
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">{v ?? 0}</span>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-orange-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-orange-700">🔻 Entidades mais fracas</h3>
              {(analytics.mais_fracas || []).map((e: any, i: number) => (
                <div key={i} className="mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-600">{e.entity} <span className="text-zinc-400">({e.tipo})</span></span>
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-700">AIS {e.ais}</span>
                  </div>
                  {e.top_acao && <p className="text-[10px] text-orange-600">→ {e.top_acao}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PRONTIDÃO POR ENGINE */}
        {aba === "engines" && !isLoading && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-zinc-500">A prontidão é a mesma base (dados estruturados + semântica + autoridade) que cada engine consome de formas diferentes. O módulo <b>mede a preparação</b> — não controla nem observa respostas dos modelos.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {ENGINES.map((eng) => (
                <div key={eng} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-sm font-black text-zinc-800">{eng}</p>
                  <p className={`mt-1 text-3xl font-black ${aisColor(score.ai_readiness_medio)}`}>{score.ai_readiness_medio ?? "—"}</p>
                  <p className="text-[10px] text-zinc-400">AI Readiness médio (prontidão)</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-[11px] font-bold text-zinc-600">Fórmula do AIS</p>
              <p className="mt-1 text-[11px] text-zinc-500">20% Semantic · 18% Structured Data · 15% Discovery · 12% GEO · 12% Autoridade(grafo) · 10% Freshness · 8% Prontidão citação · 5% Trust</p>
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION AI Visibility & Answer Intelligence v1.0 · ORION-AI-36 · AIS + AQS (consolida AI-32/33/34/35/20) ·
          read-only · nunca inventa fato · menções reais declaradas (vazio) · tick */21 · IA só via Gateway
        </p>
      </div>
    </div>
  );
}
