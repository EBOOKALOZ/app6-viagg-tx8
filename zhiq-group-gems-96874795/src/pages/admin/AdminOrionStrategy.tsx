/**
 * /admin/orion-strategy — ORION Strategic Intelligence Suite (ORION-AI-14)
 *
 * Conselho Estratégico: 5 motores internos (Knowledge, Prediction,
 * Decision, Optimization, Simulation) — tudo por REUSO das APIs
 * certificadas; previsões sempre com confiança + erro estimado;
 * simulações nunca tocam produção (modelo declarado, histórico
 * imutável). Narrativas via Gateway v3 + Prompt Registry (5 chaves).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import {
  Telescope, Loader2, Sparkles, Send, BookOpen, TrendingUp, Scale, Wrench, FlaskConical, MapIcon,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

type Aba = "resumo" | "knowledge" | "prediction" | "decision" | "optimization" | "simulation" | "roadmap";

export default function AdminOrionStrategy() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("resumo");
  const [ocupado, setOcupado] = useState("");
  const [narrativa, setNarrativa] = useState("");
  const [simTipo, setSimTipo] = useState("investimento_campanha");
  const [simValor, setSimValor] = useState("5000");
  const [simResult, setSimResult] = useState<any>(null);

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-strategy"], queryFn: () => rpc("strategy_dashboard"), refetchInterval: 60000,
  });

  const sc = dash?.score || {};
  const pred = dash?.prediction || {};
  const kn = dash?.knowledge || {};

  const gerar = async (tipo: string, promptKey: string, ctx: any) => {
    setOcupado("narr"); setNarrativa("");
    try {
      const r = await orionAiText("strategy",
        `Tipo: ${tipo}\nEstado real: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 650 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(""); }
  };

  const simular = async () => {
    const pergunta = window.prompt("Descreva a pergunta da simulação:",
      simTipo === "investimento_campanha" ? `E se investir R$ ${simValor} em campanhas?`
      : simTipo === "motoboys" ? `E se contratar ${simValor} motoboys?` : `E se abrir ${simValor} novas cidades?`);
    if (!pergunta) return;
    setOcupado("sim");
    try {
      const r = await rpc("simulation_engine", { p_pergunta: pergunta, p_tipo: simTipo, p_valor: Number(simValor) });
      setSimResult(r);
      qc.invalidateQueries({ queryKey: ["orion-strategy"] });
    } catch (e: any) { alert("Erro: " + e.message); }
    finally { setOcupado(""); }
  };

  const ABAS: [Aba, any, string][] = [
    ["resumo", Sparkles, "Resumo Executivo"], ["knowledge", BookOpen, "Knowledge"],
    ["prediction", TrendingUp, "Prediction"], ["decision", Scale, "Decision"],
    ["optimization", Wrench, "Optimization"], ["simulation", FlaskConical, "Simulation"],
    ["roadmap", MapIcon, "Roadmap"],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        <div className="rounded-3xl bg-gradient-to-r from-[#1e1b4b] via-[#4338ca] to-[#1e1b4b] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Telescope className="h-8 w-8 text-indigo-200" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">Strategic Intelligence Suite</h1>
              <p className="text-sm text-indigo-200/80">
                ORION-AI-14 · Knowledge · Prediction · Decision · Optimization · Simulation
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-200/70">Strategic Score</p>
              <p className="text-3xl font-black">{sc.strategic_score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[["Knowledge", sc.knowledge_score], ["Prediction", sc.prediction_score],
              ["Decision", sc.decision_score], ["Optimization", sc.optimization_score],
              ["Simulation", sc.simulation_score]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-200/70">{l}</p>
                <p className="text-lg font-black">{v ?? "—"}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-indigo-200/60">{sc.formula}</p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {ABAS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold ${aba === k ? "bg-[#4338ca] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-indigo-500" /></div>}

        {/* RESUMO */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              {["executivo", "estrategico", "financeiro", "comercial", "operacional", "tecnologico", "ia"].map((t) => (
                <button key={t}
                  onClick={async () => gerar(t, "strategy.executive", await rpc("strategy_summary"))}
                  disabled={!!ocupado}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-bold capitalize text-zinc-700 ring-1 ring-indigo-200 hover:bg-indigo-100 disabled:opacity-50">
                  {ocupado === "narr" ? "…" : `Resumo ${t}`}
                </button>
              ))}
            </div>
            {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-indigo-100">{narrativa}</p>}
            <div className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-indigo-100">
              <p className="text-xs font-black text-zinc-700">Top decisões agora:</p>
              {(((dash?.decision || {}).top_decisoes || []) as any[]).slice(0, 5).map((d: any, i: number) => (
                <p key={i} className="mt-1 text-xs text-zinc-600">
                  {i + 1}. <b>{d.decisao}</b> <span className="text-zinc-400">[{d.classe}]</span>
                </p>
              ))}
            </div>
          </div>
        )}

        {/* KNOWLEDGE */}
        {aba === "knowledge" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs text-zinc-400">
              Memória institucional imutável: {kn.registros_total} registro(s) · {kn.padroes_recorrentes} padrão(ões) recorrente(s).
            </p>
            {((kn.top || []) as any[]).map((k: any, i: number) => (
              <div key={i} className="mb-2 rounded-2xl border border-zinc-100 p-3">
                <p className="text-sm font-bold text-zinc-800">
                  {k.titulo}
                  {k.recorrencias > 1 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">×{k.recorrencias}</span>}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {k.tipo} · {k.area}
                  {k.causa_raiz && <> · causa: {k.causa_raiz}</>}
                  {k.solucao && <> · solução: {k.solucao}</>}
                  {k.resultado && <> · {k.resultado}</>}
                </p>
              </div>
            ))}
            <button onClick={async () => gerar("licoes", "strategy.knowledge", kn)} disabled={!!ocupado}
              className="mt-2 flex items-center gap-1 rounded-xl bg-[#4338ca] px-3 py-2 text-xs font-black text-white disabled:opacity-50">
              <Sparkles className="h-3.5 w-3.5" /> O que já aprendemos? (IA)
            </button>
            {narrativa && aba === "knowledge" && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-indigo-50 p-3 text-sm text-zinc-800">{narrativa}</p>}
          </div>
        )}

        {/* PREDICTION */}
        {aba === "prediction" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="text-xs text-zinc-500">
              Método: {pred.metodo} · Confiança: <b>{pred.confianca}</b> · Erro estimado: <b>{pred.erro_estimado}</b> ·
              Dados: {pred.dados_utilizados}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[["24h", pred.receita?.h24], ["7 dias", pred.receita?.d7], ["30 dias", pred.receita?.d30],
                ["90 dias", pred.receita?.d90], ["1 ano", pred.receita?.ano]].map(([l, v]: any) => (
                <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-sm font-black text-zinc-800">
                    {Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-zinc-400">
              Indisponíveis (declarados): {((pred.indisponiveis_declarados || []) as string[]).join(" · ")}
            </p>
            <button onClick={() => gerar("previsao", "strategy.prediction", pred)} disabled={!!ocupado}
              className="mt-3 flex items-center gap-1 rounded-xl bg-[#4338ca] px-3 py-2 text-xs font-black text-white disabled:opacity-50">
              <Sparkles className="h-3.5 w-3.5" /> Interpretar previsões (IA)
            </button>
            {narrativa && aba === "prediction" && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-indigo-50 p-3 text-sm text-zinc-800">{narrativa}</p>}
          </div>
        )}

        {/* DECISION */}
        {aba === "decision" && !isLoading && (
          <div className="mt-4 space-y-2">
            {(((dash?.decision || {}).top_decisoes || []) as any[]).map((d: any, i: number) => (
              <div key={i} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-black text-white">#{i + 1}</span>
                  <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-[10px] font-black text-indigo-700">{d.classe}</span>
                  <p className="min-w-0 flex-1 text-sm font-bold">{d.decisao}</p>
                  <span className="text-[10px] text-zinc-400">confiança {Math.round(Number(d.confianca || 0) * 100)}%</span>
                </div>
                <p className="mt-1 text-xs text-zinc-600">{d.justificativa}</p>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  dados: {d.dados_utilizados} · impacto: {d.impacto_esperado || "—"} · risco: {d.risco}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* OPTIMIZATION */}
        {aba === "optimization" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs text-zinc-400">{(dash?.optimization || {}).nota}</p>
            {(((dash?.optimization || {}).plano || []) as any[]).map((s: any, i: number) => (
              <div key={i} className="mb-2 rounded-2xl border border-zinc-100 p-3">
                <p className="text-sm font-bold text-zinc-800">[{s.prioridade}] {s.sugestao}</p>
                <p className="text-[11px] text-zinc-500">{s.justificativa} · impacto: {s.impacto_estimado} · risco: {s.risco}</p>
              </div>
            ))}
          </div>
        )}

        {/* SIMULATION */}
        {aba === "simulation" && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <select value={simTipo} onChange={(e) => setSimTipo(e.target.value)}
                  className="h-10 rounded-xl border border-zinc-200 bg-white px-2 text-sm font-semibold">
                  <option value="investimento_campanha">E se investir R$ X em campanhas?</option>
                  <option value="motoboys">E se contratar X motoboys?</option>
                  <option value="novas_cidades">E se abrir X novas cidades?</option>
                </select>
                <input value={simValor} onChange={(e) => setSimValor(e.target.value)} type="number"
                  className="h-10 w-32 rounded-xl border border-zinc-200 px-3 text-sm" />
                <button onClick={simular} disabled={!!ocupado}
                  className="flex h-10 items-center gap-1 rounded-xl bg-[#4338ca] px-4 text-sm font-black text-white disabled:opacity-50">
                  {ocupado === "sim" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                  Simular (não toca produção)
                </button>
              </div>
              {simResult && (
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase text-zinc-400">Cenário atual</p>
                    <pre className="mt-1 whitespace-pre-wrap text-[11px] text-zinc-600">{JSON.stringify(simResult.cenario_atual, null, 1)}</pre>
                  </div>
                  <div className="rounded-2xl bg-indigo-50 p-3">
                    <p className="text-[10px] font-black uppercase text-indigo-500">Cenário simulado</p>
                    <pre className="mt-1 whitespace-pre-wrap text-[11px] text-zinc-600">{JSON.stringify(simResult.cenario_simulado, null, 1)}</pre>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-3">
                    <p className="text-[10px] font-black uppercase text-amber-600">Resultado</p>
                    <pre className="mt-1 whitespace-pre-wrap text-[11px] text-zinc-700">{JSON.stringify(simResult.resultado, null, 1)}</pre>
                    <button onClick={() => gerar("interpretacao", "strategy.simulation", simResult)} disabled={!!ocupado}
                      className="mt-2 flex items-center gap-1 rounded-xl bg-[#4338ca] px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-50">
                      <Sparkles className="h-3 w-3" /> Vale a pena? (IA)
                    </button>
                  </div>
                </div>
              )}
              {narrativa && aba === "simulation" && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-indigo-50 p-3 text-sm text-zinc-800">{narrativa}</p>}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <p className="mb-2 text-xs font-black text-zinc-700">Histórico de simulações (imutável)</p>
              {(((dash?.simulacoes_recentes) || []) as any[]).map((s: any, i: number) => (
                <p key={i} className="text-xs text-zinc-600">
                  🧪 <b>{s.pergunta}</b> → ROI {s.resultado?.roi_estimado_pct ?? "—"}% ·
                  prob. {s.resultado?.probabilidade} · {new Date(s.criado_em).toLocaleString("pt-BR")}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* ROADMAP */}
        {aba === "roadmap" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs text-zinc-400">{(dash?.roadmap || {}).fonte}</p>
            {(((dash?.roadmap || {}).proximos_modulos || []) as any[]).map((m: any) => (
              <div key={m.codigo} className="mb-2 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3">
                <p className="text-sm font-black text-zinc-800">{m.codigo} — {m.nome}</p>
                <p className="text-xs text-zinc-600">{m.motivo_real}</p>
              </div>
            ))}
            <p className="mt-2 text-xs font-black text-zinc-700">Dívida técnica (do CORE):</p>
            {(((dash?.roadmap || {}).divida_tecnica || []) as string[]).map((d, i) => (
              <p key={i} className="text-xs text-zinc-500">• {d}</p>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Strategic Intelligence Suite v1.0 · ORION-AI-14 · 1 módulo, 5 motores · reuso total ·
          projeções com confiança e erro · simulações nunca tocam produção · IA só via Gateway + Registry
        </p>
      </div>
    </div>
  );
}
