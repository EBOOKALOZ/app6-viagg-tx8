/**
 * /admin/orion-recommendations — ORION Recommendation Intelligence AI (ORION-AI-35)
 *
 * Motor de recomendações do Discovery Ecosystem: usa o grafo (AI-34), os scores
 * de descobribilidade (AI-32), GEO (AI-33) e comportamento real (cliques/aci).
 * NENHUMA recomendação sem evidência mensurável. Recommendation Intelligence
 * Score (RIS) + health verde/amarelo/vermelho. Read-only.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import { Wand2, Loader2, Sparkles, Trophy, BarChart3, PlayCircle, Send } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const risColor = (s: number) => s >= 70 ? "text-emerald-300" : s >= 45 ? "text-amber-300" : "text-red-300";
const HEALTH: Record<string, string> = { verde: "bg-emerald-100 text-emerald-700", amarelo: "bg-amber-100 text-amber-700", vermelho: "bg-red-100 text-red-700" };
const TIPO: Record<string, string> = { similar: "bg-fuchsia-100 text-fuchsia-700", proximity: "bg-sky-100 text-sky-700", popular: "bg-amber-100 text-amber-700" };

type Aba = "resumo" | "top" | "analytics" | "simulador";

export default function AdminOrionRecommendations() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [ocupado, setOcupado] = useState(false);
  const [narrativa, setNarrativa] = useState("");
  const [ctx, setCtx] = useState("home");
  const [loc, setLoc] = useState("");
  const [simRes, setSimRes] = useState<any>(null);

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-rec"], queryFn: () => rpc("recommendation_dashboard"), refetchInterval: 60000,
  });

  const ris = dash?.ris || {};
  const health = dash?.health || {};
  const analytics = dash?.analytics || {};
  const metrics = dash?.metrics || {};
  const porTipo = analytics.por_tipo || {};
  const eventos = analytics.eventos || {};

  const narrar = async (promptKey: string, tipo: string) => {
    setOcupado(true); setNarrativa("");
    try {
      const c = await rpc("recommendation_summary");
      const r = await orionAiText("recommendation_ai", `Tipo: ${tipo}\nEstado das recomendações: ${JSON.stringify(c)}`, { promptKey, maxTokens: 700 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(false); }
  };

  const simular = async () => {
    setOcupado(true); setSimRes(null);
    try { setSimRes(await rpc("generate_recommendations", { p_context: ctx, p_location: loc || null, p_limit: 8 })); }
    finally { setOcupado(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER — RIS */}
        <div className="rounded-3xl bg-gradient-to-r from-[#2a0b3a] via-[#4a1e6e] to-[#2a0b3a] p-6 text-white shadow-xl ring-1 ring-fuchsia-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-fuchsia-500/10 ring-1 ring-fuchsia-500/30">
              <Wand2 className="h-8 w-8 text-fuchsia-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Recommendation Intelligence AI</h1>
              <p className="text-sm text-slate-300/80">
                ORION-AI-35 · usa grafo/discovery/GEO/comportamento · nenhuma recomendação sem evidência
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-fuchsia-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-200/70">Recommendation Intelligence</p>
              <p className={`text-4xl font-black ${risColor(ris.ris)}`}>{ris.ris ?? "—"}</p>
              <p className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${HEALTH[health.status] || "bg-white/10 text-white"}`}>{health.status ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Score médio", ris.score_medio], ["Confiança", ris.confianca_media], ["Coverage", `${ris.coverage_pct ?? 0}%`],
              ["Freshness", `${ris.freshness_pct ?? 0}%`], ["Diversidade", ris.diversidade_categorias], ["Total", ris.total_recomendacoes]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Sparkles, "Visão Geral"], ["top", Trophy, "Top Recomendações"],
             ["analytics", BarChart3, "Analytics"], ["simulador", PlayCircle, "Simulador"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#4a1e6e] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-fuchsia-500" /></div>}

        {/* VISÃO GERAL */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["rec.detect_bad", "Auditar recomendações"], ["rec.diversify", "Diversificar"], ["rec.detect_repetition", "Detectar repetição"]].map(([pk, l]) => (
                  <button key={pk} onClick={() => narrar(pk, l.toLowerCase())} disabled={ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-50">
                    {ocupado ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-slate-100">{narrativa}</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Recomendações frescas", metrics.frescas], ["Perfis de usuário", metrics.perfis],
                ["Cache ativo", metrics.cache_entradas], ["Latência média", `${metrics.latencia_media_ms ?? 0}ms`]].map(([l, v]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-2xl font-black text-fuchsia-700">{String(v ?? 0)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-amber-50 p-3 text-[11px] text-amber-700">⚠ {ris.lacunas_declaradas}</div>
          </div>
        )}

        {/* TOP RECOMENDAÇÕES */}
        {aba === "top" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!(analytics.top || []).length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-10 text-center text-zinc-400 shadow-sm">Sem recomendações. O motor roda a cada 17 min (tick */17).</div>
            ) : (analytics.top || []).map((r: any, i: number) => (
              <div key={i} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-fuchsia-600 text-xs font-black text-white">{i + 1}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${TIPO[r.tipo] || "bg-zinc-100 text-zinc-600"}`}>{r.tipo}</span>
                  <p className="min-w-0 flex-1 truncate font-bold text-zinc-800">{r.target}</p>
                  <span className="rounded-2xl bg-[#4a1e6e] px-3 py-1 text-sm font-black text-white">{r.score}</span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">📎 {r.reason}</p>
              </div>
            ))}
          </div>
        )}

        {/* ANALYTICS */}
        {aba === "analytics" && !isLoading && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Recomendações por tipo</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(porTipo).map(([t, n]: any) => (
                  <span key={t} className={`rounded-full px-3 py-1 text-[11px] font-bold ${TIPO[t] || "bg-slate-100 text-slate-600"}`}>{t}: {n}</span>
                ))}
              </div>
              <h3 className="mb-2 mt-4 text-sm font-black text-emerald-700">🟢 Categorias fortes</h3>
              {(analytics.categorias_fortes || []).map((c: any, i: number) => (
                <div key={i} className="mb-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{c.categoria}</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">{c.score_medio}</span>
                </div>
              ))}
              <h3 className="mb-2 mt-3 text-sm font-black text-orange-700">🟠 Categorias fracas</h3>
              {(analytics.categorias_fracas || []).map((c: any, i: number) => (
                <div key={i} className="mb-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-600">{c.categoria}</span>
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-700">{c.score_medio}</span>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Eventos de recomendação</h3>
              {Object.keys(eventos).length === 0 ? (
                <p className="text-xs text-zinc-400">Sem eventos ainda — a telemetria (view/click/conversion) é registrada por <code>recommendation_event()</code> quando o front instrumentar.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(eventos).map(([t, n]: any) => (
                    <span key={t} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">{t}: {n}</span>
                  ))}
                </div>
              )}
              <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                <p className="text-[11px] font-bold text-zinc-600">Fórmula do Recommendation Score</p>
                <p className="mt-1 text-[11px] text-zinc-500">25% Semantic · 20% Knowledge Graph · 15% Discovery · 10% GEO · 10% CTR · 10% Conversão · 5% Recência · 5% Qualidade</p>
              </div>
            </div>
          </div>
        )}

        {/* SIMULADOR */}
        {aba === "simulador" && !isLoading && (
          <div className="mt-4 space-y-3">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-2 text-xs text-zinc-500">Simula <code>generate_recommendations()</code> — Top N com cache 30min, filtro de segurança e evidência.</p>
              <div className="flex flex-wrap items-center gap-2">
                <select value={ctx} onChange={(e) => setCtx(e.target.value)} className="rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-fuchsia-400">
                  <option value="home">Contexto: Home</option>
                  <option value="loja">Contexto: Loja</option>
                </select>
                <input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Localização (ex.: Aripuanã)"
                  className="flex-1 rounded-2xl border border-slate-200 px-4 py-2 text-sm outline-none focus:border-fuchsia-400" />
                <button onClick={simular} disabled={ocupado}
                  className="flex items-center gap-1 rounded-2xl bg-[#4a1e6e] px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                  {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Gerar
                </button>
              </div>
            </div>
            {simRes && (
              <div className="space-y-2">
                <p className="text-[11px] text-zinc-400">
                  {simRes.recomendacoes?.length ?? 0} recomendações · cache: {String(simRes.cache)} · contexto: {simRes.contexto}
                </p>
                {(simRes.recomendacoes || []).map((r: any, i: number) => (
                  <div key={i} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-fuchsia-600 text-xs font-black text-white">{i + 1}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${TIPO[r.recommendation_type] || "bg-zinc-100 text-zinc-600"}`}>{r.recommendation_type}</span>
                      <p className="min-w-0 flex-1 truncate font-bold text-zinc-800">{r.target}</p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">conf. {r.confidence}</span>
                      <span className="rounded-2xl bg-[#4a1e6e] px-3 py-1 text-sm font-black text-white">{r.score}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">📎 {r.reason}</p>
                    <pre className="mt-1 overflow-auto rounded-xl bg-slate-900 p-2 text-[10px] text-fuchsia-200">{JSON.stringify(r.evidence, null, 0)}</pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Recommendation Intelligence AI v1.0 · ORION-AI-35 · RIS + Recommendation Score (grafo/discovery/GEO/comportamento) ·
          read-only · nenhuma recomendação sem evidência · tick */17 · cache 30min · reusa AI-32/33/34 · IA só via Gateway
        </p>
      </div>
    </div>
  );
}
