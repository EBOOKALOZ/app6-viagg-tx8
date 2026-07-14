/**
 * /admin/orion-growth — ORION Growth AI (ORION-AI-07)
 *
 * Camada estratégica: score de crescimento 0-100 por cidade (fórmula
 * explicável), radar de oportunidades e riscos, previsões multi-
 * horizonte (sempre marcadas como projeção), insights executivos e
 * IA executiva para perguntas estratégicas. 100% consultivo — a
 * decisão é da diretoria.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import {
  Rocket, Loader2, RefreshCw, TrendingUp, AlertTriangle, Lightbulb,
  Sparkles, Send, LineChart,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const CLS: Record<string, string> = {
  "Excelente": "bg-emerald-600 text-white", "Muito Bom": "bg-emerald-100 text-emerald-700",
  "Bom": "bg-sky-100 text-sky-700", "Regular": "bg-amber-100 text-amber-700",
  "Baixo": "bg-zinc-100 text-zinc-500",
};

export default function AdminOrionGrowth() {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState("");
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-growth-dash"], queryFn: () => rpc("orion_growth_dashboard"), refetchInterval: 60000,
  });

  const recalcular = async () => {
    setOcupado("calc");
    try {
      const r = await rpc("orion_growth_score_calcular");
      qc.invalidateQueries({ queryKey: ["orion-growth-dash"] });
      alert(`Scores recalculados para ${r.cidades} cidade(s).`);
    } catch (e: any) { alert("Erro: " + e.message); }
    finally { setOcupado(""); }
  };

  const perguntar = async () => {
    if (!pergunta.trim()) return;
    setOcupado("ia");
    setResposta("");
    try {
      const contexto = JSON.stringify({
        ranking: (dash?.ranking_cidades || []).slice(0, 5),
        oportunidades: dash?.oportunidades, riscos: dash?.riscos,
        previsoes: dash?.previsoes, demanda_oferta: dash?.demanda_oferta,
      });
      const r = await orionAiText("growth", `Dados estratégicos reais da plataforma: ${contexto}\n\nPergunta da diretoria: ${pergunta}`, {
        system: "Você é o estrategista-chefe da VIAGG-TX8 (marketplace multi-serviços, Brasil). Responda em pt-BR, direto, 4-8 frases, com recomendação clara, indicadores citados e riscos. Nunca invente números que não estejam nos dados.",
        maxTokens: 500,
      });
      setResposta(r.ok ? String(r.texto) : `IA indisponível (${r.error}) — os indicadores continuam abaixo.`);
    } finally { setOcupado(""); }
  };

  const prev = dash?.previsoes || {};
  const fmt = (v: any) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        <div className="rounded-3xl bg-gradient-to-r from-[#1a0533] via-[#3b0d6e] to-[#1a0533] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Rocket className="h-8 w-8 text-indigo-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Growth AI</h1>
              <p className="text-sm text-indigo-200/80">
                ORION-AI-07 · inteligência estratégica de expansão — analisa, prevê e recomenda; a decisão é sua
                {dash?.atualizado_em ? ` · atualizado ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <button onClick={recalcular} disabled={!!ocupado}
              className="flex items-center gap-2 rounded-xl bg-indigo-400 px-4 py-2.5 text-sm font-black text-[#1a0533] hover:brightness-110 disabled:opacity-50">
              {ocupado === "calc" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Recalcular scores
            </button>
          </div>
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>}

        {!isLoading && (
          <div className="mt-4 space-y-4">
            {/* IA EXECUTIVA */}
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 flex items-center gap-1 text-sm font-black text-zinc-700">
                <Sparkles className="h-4 w-4" /> IA Executiva — pergunte ao estrategista
              </h3>
              <div className="flex gap-2">
                <input value={pergunta} onChange={(e) => setPergunta(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && perguntar()}
                  placeholder="Ex.: Qual cidade devo expandir primeiro? Onde investir marketing?"
                  className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 text-sm" />
                <button onClick={perguntar} disabled={!!ocupado}
                  className="flex h-10 items-center gap-1 rounded-xl bg-[#3b0d6e] px-4 text-sm font-black text-white disabled:opacity-50">
                  {ocupado === "ia" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
              {resposta && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-indigo-50 p-3 text-sm text-zinc-800">{resposta}</p>}
            </div>

            {/* RANKING */}
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 flex items-center gap-1 text-sm font-black text-zinc-700">
                <TrendingUp className="h-4 w-4" /> Ranking de cidades — Score de Crescimento
              </h3>
              {!((dash?.ranking_cidades || []) as any[]).length ? (
                <p className="p-6 text-center text-sm text-zinc-400">Clique em "Recalcular scores".</p>
              ) : ((dash?.ranking_cidades || []) as any[]).map((s: any, i: number) => (
                <div key={s.cidade} className="mb-2 rounded-2xl border border-zinc-100 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-zinc-400">#{i + 1}</span>
                    <p className="min-w-0 flex-1 font-bold capitalize">{s.cidade}{s.uf ? ` — ${s.uf}` : ""}</p>
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-zinc-100">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${s.score}%` }} />
                    </div>
                    <span className="text-sm font-black">{s.score}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${CLS[s.classificacao] || ""}`}>{s.classificacao}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    {s.detalhe?.anuncios} anúncios · {s.detalhe?.grupos} grupos ({s.detalhe?.membros} membros) ·
                    {" "}{s.detalhe?.campanhas} campanhas · {s.detalhe?.publicacoes_confirmadas} publicações
                    {s.detalhe?.populacao ? ` · pop. ${Number(s.detalhe.populacao).toLocaleString("pt-BR")}` : ""}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* OPORTUNIDADES */}
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 flex items-center gap-1 text-sm font-black text-zinc-700">
                  <Lightbulb className="h-4 w-4" /> Radar de oportunidades
                </h3>
                <p className="text-xs font-bold text-zinc-500">Anúncios sem cobertura de grupos:</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {((dash?.oportunidades?.cidades_com_anuncios_sem_grupos || []) as any[]).map((c: any) => (
                    <span key={c.cidade} className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                      📍 {c.cidade} ({c.anuncios})
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs font-bold text-zinc-500">Grupos ociosos (sem anúncios locais):</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {((dash?.oportunidades?.cidades_com_grupos_sem_anuncios || []) as any[]).map((c: any) => (
                    <span key={c.cidade} className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-700">
                      📍 {c.cidade} ({c.grupos} grupos)
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs font-bold text-zinc-500">Categorias que mais faturam:</p>
                {((dash?.oportunidades?.categorias_top_receita || []) as any[]).map((c: any) => (
                  <p key={c.produto} className="text-xs text-zinc-600">• {c.produto}: {fmt(c.total)}</p>
                ))}
              </div>

              {/* RISCOS */}
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 flex items-center gap-1 text-sm font-black text-zinc-700">
                  <AlertTriangle className="h-4 w-4" /> Radar de risco
                </h3>
                <ul className="space-y-1.5 text-xs text-zinc-600">
                  <li>🏙️ Concentração territorial: <b className="capitalize">{dash?.riscos?.concentracao_territorial?.cidade}</b> com{" "}
                    <b>{dash?.riscos?.concentracao_territorial?.pct_dos_anuncios}%</b> dos anúncios
                    {dash?.riscos?.concentracao_territorial?.alerta && <span className="text-red-600"> ⚠ diversificar</span>}
                  </li>
                  <li>📦 Receita concentrada: <b>{dash?.riscos?.receita_concentrada?.produto}</b> ({dash?.riscos?.receita_concentrada?.pct}%)</li>
                  <li>📡 Dependência de canal: {JSON.stringify(dash?.riscos?.dependencia_canal || {})}</li>
                  <li>💰 Divergências financeiras abertas: <b>{dash?.riscos?.divergencias_financeiras_abertas}</b></li>
                  <li>📮 DLQ do Dispatcher: <b>{dash?.riscos?.dlq_dispatcher}</b></li>
                </ul>
                <h3 className="mb-1 mt-3 text-sm font-black text-zinc-700">Demanda × Oferta</h3>
                <ul className="space-y-1 text-xs text-zinc-600">
                  <li>Grupos ativos: {dash?.demanda_oferta?.grupos_ativos_total}</li>
                  <li>Lojistas ativos 30d: {dash?.demanda_oferta?.lojistas_ativos_30d} · inativos: {dash?.demanda_oferta?.lojistas_inativos_30d}</li>
                  <li>Profissionais inativos 30d: {dash?.demanda_oferta?.profissionais_inativos_30d}</li>
                </ul>
                <p className="mt-1 text-[10px] text-zinc-400">{dash?.demanda_oferta?.nota}</p>
              </div>
            </div>

            {/* PREVISÕES */}
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 flex items-center gap-1 text-sm font-black text-zinc-700">
                <LineChart className="h-4 w-4" /> Previsões de receita ({prev.base})
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[["30 dias", prev.receita_30d], ["60 dias", prev.receita_60d], ["90 dias", prev.receita_90d],
                  ["180 dias", prev.receita_180d], ["365 dias", prev.receita_365d]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className="text-sm font-black text-zinc-800">{fmt(v)}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-zinc-400">
                Custo de IA projetado 30d: US$ {Number(prev.custo_ia_30d_usd || 0).toFixed(4)} · CAC/LTV: {dash?.marketing?.cac_ltv}
              </p>
            </div>

            {/* INSIGHTS */}
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Insights executivos (automáticos, auditáveis)</h3>
              {!((dash?.insights || []) as any[]).length ? (
                <p className="p-4 text-center text-sm text-zinc-400">O tick horário gera insights automaticamente.</p>
              ) : ((dash?.insights || []) as any[]).map((i: any, k: number) => (
                <div key={k} className="mb-2 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3">
                  <p className="text-sm font-bold text-zinc-800">{i.titulo}{i.parcial && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-700">DADOS PARCIAIS</span>}</p>
                  <p className="mt-1 text-xs text-zinc-600">{i.conteudo?.motivo}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    Confiança {Math.round(Number(i.conteudo?.confianca || 0) * 100)}% ·
                    Riscos: {(i.conteudo?.riscos || []).join("; ")} ·
                    {new Date(i.quando).toLocaleString("pt-BR")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Growth AI v1.0 · ORION-AI-07 · camada estratégica do ecossistema · nunca executa — analisa,
          prevê, recomenda e prioriza · projeções sempre identificadas · a decisão final é humana
        </p>
      </div>
    </div>
  );
}
