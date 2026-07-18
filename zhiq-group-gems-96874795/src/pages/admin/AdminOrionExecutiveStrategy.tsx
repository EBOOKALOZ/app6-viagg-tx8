/**
 * /admin/orion-executive-strategy — ORION Executive Strategy AI (ORION-AI-59)
 *
 * Conselheiro estrategico maximo (Chief Strategy Intelligence Officer). CONSOLIDA
 * a inteligencia de todo o ecossistema ORION e do AI-30 (Executive/CEO Copilot) —
 * que REUSA e nunca reescreve — em: overview executivo, scores (ESS), cenarios,
 * Risk Center, Opportunity Center, recomendacoes com ROI/prob, Decision Engine,
 * relatorios (diario->anual), consolidacao cross-AI e um CEO Copilot fundamentado
 * SOMENTE em dados reais. RECOMENDA, nunca executa; NUNCA move dinheiro.
 * Fonte unica: RPC exstrat_dashboard().
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Compass, Loader2, Gauge, TrendingUp, ShieldAlert, Lightbulb,
  Brain, LineChart, FileText, MessageSquare, History, Send,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const scoreColor = (s: number) => s >= 90 ? "text-emerald-300" : s >= 75 ? "text-lime-300" : s >= 50 ? "text-amber-300" : "text-red-300";
const scoreBg = (s: number) => s >= 90 ? "text-emerald-600" : s >= 75 ? "text-lime-600" : s >= 50 ? "text-amber-600" : "text-red-600";
const SEV: Record<string, string> = { critico: "bg-red-100 text-red-700", alto: "bg-amber-100 text-amber-700", medio: "bg-yellow-100 text-yellow-700", baixo: "bg-slate-100 text-slate-600" };
const CEN: Record<string, string> = { conservador: "bg-slate-100 text-slate-600", realista: "bg-violet-100 text-violet-700", otimista: "bg-emerald-100 text-emerald-700" };
const brl = (v: any) => v == null ? "—" : "R$ " + Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const num = (v: any) => v == null ? "—" : Number(v).toLocaleString("pt-BR");

type Aba = "resumo" | "scores" | "recomendacoes" | "oportunidades" | "riscos" | "decisoes" | "cenarios" | "ia" | "relatorio" | "copilot" | "estrategia";

function Evid({ dados }: { dados: any }) {
  if (!dados) return null;
  return <pre className="mt-1 max-h-40 overflow-auto rounded-xl bg-white p-2 text-[10px] text-zinc-500">{JSON.stringify(dados, null, 2)}</pre>;
}

export default function AdminOrionExecutiveStrategy() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState<any>(null);
  const [asking, setAsking] = useState(false);
  const [erro, setErro] = useState("");

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-exstrat"], queryFn: () => rpc("exstrat_dashboard"), refetchInterval: 60000,
  });

  const m = dash?.metricas || {};
  const sc = dash?.scores || {};
  const riscos = (dash?.riscos || []) as any[];
  const opps = (dash?.oportunidades || []) as any[];
  const recs = (dash?.recomendacoes || []) as any[];
  const decs = (dash?.decisoes || []) as any[];
  const cenarios = (dash?.cenarios || []) as any[];
  const ia = dash?.ai_summary || {};
  const rel = dash?.relatorio_diario || {};
  const estr = dash?.estrategia || {};
  const hist = (dash?.historico_ess || []) as any[];
  const seg = dash?.seguranca || {};

  const ess = sc.executive_strategy_score ?? 0;

  const perguntar = async () => {
    if (!pergunta.trim()) return;
    setAsking(true); setErro(""); setResposta(null);
    try { const r = await rpc("exstrat_questions", { p_pergunta: pergunta.trim() }); setResposta(r?.resposta || r); }
    catch (e: any) { setErro(e.message); }
    finally { setAsking(false); }
  };

  const TAB_META: [Aba, any, string][] = [
    ["resumo", Gauge, "Resumo"], ["scores", TrendingUp, "Painel Estratégico"], ["recomendacoes", Lightbulb, "Recomendações"],
    ["oportunidades", Compass, "Oportunidades"], ["riscos", ShieldAlert, "Riscos"], ["decisoes", Gauge, "Decisões"],
    ["cenarios", LineChart, "Cenários"], ["ia", Brain, "IA Consolidadas"], ["relatorio", FileText, "Relatórios"],
    ["copilot", MessageSquare, "CEO Copilot"], ["estrategia", History, "Estratégia"],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50/40 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#1a1030] via-[#2a1a4a] to-[#1a1030] p-6 text-white shadow-xl ring-1 ring-violet-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 ring-1 ring-violet-500/30">
              <Compass className="h-8 w-8 text-violet-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">Executive Strategy Center</h1>
              <p className="text-sm text-violet-200/70">
                ORION-AI-59 · conselheiro estratégico do CEO · consolida todo o ORION + reusa o AI-30 · recomenda, nunca executa
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-violet-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-200/70">Executive Strategy Score</p>
              <p className={`text-4xl font-black ${scoreColor(ess)}`}>{ess || "—"}</p>
              <p className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">Executive {sc.executive_score ?? "—"} · conf. {sc.confianca ?? "—"}%</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Receita", brl(m.receita)], ["Pedidos pagos", num(m.pedidos_pagos)], ["Usuários", num(m.usuarios)],
              ["Riscos abertos", riscos.length], ["Oportunidades", opps.length], ["Recomendações", recs.length]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-violet-200/60">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {TAB_META.map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-bold ${aba === k ? "bg-[#2a1a4a] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-violet-500" /></div>}

        {/* RESUMO */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Receita (paga)", brl(m.receita)], ["Conversão", m.conversao_pct != null ? m.conversao_pct + "%" : "—"],
                ["Taxa pagamento", m.taxa_pagamento_pct != null ? m.taxa_pagamento_pct + "%" : "—"], ["Custo IA (USD)", m.custo_ia_usd != null ? "$ " + m.custo_ia_usd : "—"]].map(([l, v]: any) => (
                <div key={l} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{l}</p>
                  <p className="mt-1 text-2xl font-black text-zinc-800">{String(v)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
              <p className="text-sm font-black text-violet-800">🔒 Faixa de segurança estratégica</p>
              <ul className="mt-2 space-y-1 text-xs text-violet-900/80">
                <li>• <b>Nunca move dinheiro</b> — decisões financeiras são sempre humanas ({seg.financeiro_nunca_executa ? "garantido" : "—"}).</li>
                <li>• <b>Recomenda, nunca executa</b> ({seg.apenas_recomenda ? "garantido" : "—"}).</li>
                <li>• <b>Reusa o AI-30</b> (não recalcula o executive score) e <b>nunca inventa</b> — só dados reais.</li>
              </ul>
              <p className="mt-2 text-[11px] text-violet-700/70">Atualizado em {dash?.atualizado_em || "—"}</p>
            </div>
            {rel?.resumo && (
              <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
                <p className="text-sm font-black text-zinc-700">Relatório diário</p>
                <p className="mt-1 text-sm text-zinc-600">{rel.resumo}</p>
              </div>
            )}
          </div>
        )}

        {/* SCORES */}
        {aba === "scores" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Executive Strategy (ESS)", ess], ["Executive (AI-30)", sc.executive_score], ["Risk Score", sc.risk_score],
                ["Opportunity", sc.opportunity_score], ["Health", sc.health_score], ["Growth", sc.growth_score],
                ["Innovation", sc.innovation_score], ["Confiança", sc.confianca]].map(([l, v]: any) => (
                <div key={l} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{l}</p>
                  <p className={`mt-1 text-3xl font-black ${scoreBg(v ?? 0)}`}>{v ?? "—"}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
              <p className="text-sm font-black text-zinc-700">Histórico ESS (30d)</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {hist.length === 0 && <p className="text-xs text-zinc-400">Série curta — consolida com o tempo (declarado).</p>}
                {hist.map((h: any) => (
                  <span key={h.dia} className="rounded-lg bg-violet-50 px-2 py-1 text-[11px] font-bold text-violet-700 ring-1 ring-violet-100" title={h.dia}>
                    {h.ess}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* RECOMENDAÇÕES */}
        {aba === "recomendacoes" && !isLoading && (
          <div className="mt-4 space-y-3">
            {recs.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm text-zinc-400 ring-1 ring-zinc-200">Sem recomendações hoje.</p>}
            {recs.map((r: any) => (
              <div key={r.id} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black text-violet-700 uppercase">{r.area}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">prioridade {r.prioridade}</span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">ROI {r.roi_estimado}</span>
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">prob {r.prob_sucesso}% · conf {r.confianca}%</span>
                  <p className="w-full text-sm font-black text-zinc-800">{r.titulo}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-600">{r.descricao}</p>
                <div className="mt-2 grid gap-1 text-[11px] text-zinc-500 sm:grid-cols-2">
                  <p><b>Benefícios:</b> {r.beneficios}</p>
                  <p><b>Riscos:</b> {r.riscos}</p>
                  <p><b>Impacto financeiro:</b> {r.impacto_financeiro}</p>
                  <p><b>Prazo:</b> {r.prazo} · <b>Complexidade:</b> {r.complexidade}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* OPORTUNIDADES */}
        {aba === "oportunidades" && !isLoading && (
          <div className="mt-4 space-y-3">
            {opps.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm text-zinc-400 ring-1 ring-zinc-200">Sem oportunidades hoje.</p>}
            {opps.map((o: any) => (
              <div key={o.id} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700 uppercase">{o.tipo}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">potencial {o.potencial_score} · conf {o.confianca}%</span>
                  {o.janela && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">janela: {o.janela}</span>}
                  <p className="w-full text-sm font-black text-zinc-800">{o.titulo}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-600">{o.descricao}</p>
                <Evid dados={o.evidencias} />
              </div>
            ))}
          </div>
        )}

        {/* RISCOS */}
        {aba === "riscos" && !isLoading && (
          <div className="mt-4 space-y-3">
            {riscos.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm text-zinc-400 ring-1 ring-zinc-200">Sem riscos abertos hoje. 🟢</p>}
            {riscos.map((r: any) => (
              <div key={r.id} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${SEV[r.severidade] || "bg-slate-100 text-slate-600"}`}>{r.severidade}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{r.categoria}</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">prob {r.probabilidade}% · impacto {r.impacto}</span>
                  <p className="w-full text-sm font-black text-zinc-800">{r.titulo}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-600">{r.descricao}</p>
                {r.mitigacao && <p className="mt-1 text-[11px] text-emerald-700"><b>Mitigação:</b> {r.mitigacao}</p>}
                <Evid dados={r.evidencias} />
              </div>
            ))}
          </div>
        )}

        {/* DECISÕES */}
        {aba === "decisoes" && !isLoading && (
          <div className="mt-4 space-y-3">
            {decs.length === 0 && <p className="rounded-2xl bg-white p-6 text-center text-sm text-zinc-400 ring-1 ring-zinc-200">Sem decisões hoje.</p>}
            {decs.map((d: any) => (
              <div key={d.id} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
                <div className="flex flex-wrap items-center gap-2">
                  {d.financeiro && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700">🔒 FINANCEIRA — HUMANO</span>}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">prioridade {d.prioridade}</span>
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">prob {d.prob_sucesso}% · conf {d.confianca}%</span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{d.status}</span>
                  <p className="w-full text-sm font-black text-zinc-800">{d.titulo}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-600">{d.recomendacao}</p>
                <div className="mt-1 grid gap-1 text-[11px] text-zinc-500 sm:grid-cols-2">
                  <p><b>Objetivo:</b> {d.objetivo}</p>
                  <p><b>ROI:</b> {d.roi_estimado} · <b>Prazo:</b> {d.prazo}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CENÁRIOS */}
        {aba === "cenarios" && !isLoading && (
          <div className="mt-4 space-y-3">
            <p className="rounded-2xl border border-violet-100 bg-violet-50 p-3 text-xs text-violet-800">
              Cenários com <b>fatores declarados</b> sobre base real do AI-30/AI-55 — projeção nunca é apresentada como certeza.
            </p>
            <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-zinc-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 text-[10px] uppercase text-zinc-400">
                  <tr><th className="p-2">Cenário</th><th className="p-2">Horizonte</th><th className="p-2">Métrica</th><th className="p-2">Base</th><th className="p-2">Projeção</th><th className="p-2">Δ%</th><th className="p-2">Conf.</th></tr>
                </thead>
                <tbody>
                  {cenarios.map((c: any) => (
                    <tr key={c.id} className="border-t border-zinc-100">
                      <td className="p-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${CEN[c.cenario] || ""}`}>{c.cenario}</span></td>
                      <td className="p-2 font-bold text-zinc-600">{c.horizonte}</td>
                      <td className="p-2 text-zinc-600">{c.metrica}</td>
                      <td className="p-2 text-zinc-500">{num(c.valor_base)}</td>
                      <td className="p-2 font-black text-zinc-800">{num(c.valor_proj)}</td>
                      <td className="p-2 text-emerald-600">+{c.variacao_pct}%</td>
                      <td className="p-2 text-zinc-500">{c.confianca}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* IA CONSOLIDADAS */}
        {aba === "ia" && !isLoading && (
          <div className="mt-4 space-y-3">
            <p className="rounded-2xl bg-white p-3 text-sm font-black text-zinc-700 ring-1 ring-zinc-200">
              {ia.total_modulos ?? 0} módulos ORION consolidados (auto-descobertos, read-only)
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(ia.modulos || []).map((mod: any) => (
                <div key={mod.modulo} className="rounded-2xl bg-white p-3 ring-1 ring-zinc-200">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-black text-zinc-800">{mod.modulo}</p>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{mod.status}</span>
                  </div>
                  {mod.score != null && <p className="text-[11px] text-zinc-500">score {mod.score}</p>}
                  <p className="text-[11px] text-zinc-500">{mod.valor}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RELATÓRIOS */}
        {aba === "relatorio" && !isLoading && (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
              <p className="text-sm font-black text-zinc-700">{rel.titulo || "Relatório diário"}</p>
              <p className="mt-1 text-sm text-zinc-600">{rel.resumo}</p>
              <p className="mt-1 text-[11px] text-zinc-400">versão {rel.versao ?? "—"} · gerado {rel.gerado_em || "—"}</p>
              <Evid dados={rel.conteudo} />
            </div>
            <p className="text-[11px] text-zinc-400">Relatórios semanal/mensal/trimestral/anual são gerados automaticamente pelo tick nas viradas de período.</p>
          </div>
        )}

        {/* CEO COPILOT */}
        {aba === "copilot" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
              <p className="text-sm font-black text-zinc-700">Pergunte ao CEO Copilot</p>
              <p className="text-[11px] text-zinc-400">Resposta fundamentada SOMENTE em dados reais (nunca inventa).</p>
              <div className="mt-2 flex gap-2">
                <input value={pergunta} onChange={(e) => setPergunta(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && perguntar()}
                  placeholder="Ex.: Onde devemos investir este mês?"
                  className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-violet-400" />
                <button onClick={perguntar} disabled={asking}
                  className="flex items-center gap-2 rounded-xl bg-[#2a1a4a] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                  {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Perguntar
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {["Onde devemos investir este mês?", "Qual é o maior risco atual?", "Qual cidade abrir primeiro?"].map((q) => (
                  <button key={q} onClick={() => setPergunta(q)} className="rounded-full bg-violet-50 px-2 py-1 text-[11px] font-bold text-violet-700 hover:bg-violet-100">{q}</button>
                ))}
              </div>
            </div>
            {erro && <p className="rounded-2xl bg-red-50 px-4 py-2 text-xs font-bold text-red-700">Erro: {erro}</p>}
            {resposta && (
              <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200 space-y-2">
                <p className="text-sm font-black text-violet-800">{resposta.resumo}</p>
                <div className="grid gap-1 text-xs text-zinc-600 sm:grid-cols-2">
                  <p><b>Recomendação:</b> {resposta.recomendacao}</p>
                  <p><b>Riscos:</b> {resposta.riscos}</p>
                </div>
                {resposta.proximos_passos && (
                  <div>
                    <p className="text-xs font-bold text-zinc-700">Próximos passos</p>
                    <ul className="ml-4 list-disc text-xs text-zinc-600">
                      {(resposta.proximos_passos as string[]).map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </div>
                )}
                <details className="text-[11px] text-zinc-400">
                  <summary className="cursor-pointer font-bold">Evidências / métricas</summary>
                  <Evid dados={resposta.metricas} />
                </details>
              </div>
            )}
          </div>
        )}

        {/* ESTRATÉGIA (loop de aprendizado) */}
        {aba === "estrategia" && !isLoading && (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
              <p className="text-sm font-black text-zinc-700">Estratégia contínua</p>
              <p className="mt-1 text-xs text-zinc-500">{estr.ciclo}</p>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[["Decisões", estr.decisoes_total], ["Executadas", estr.decisoes_executadas], ["Aprendizados", estr.aprendizados], ["Precisão média", estr.precisao_media != null ? estr.precisao_media + "%" : "—"]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-zinc-50 px-3 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{l}</p>
                    <p className="text-lg font-black text-zinc-800">{String(v ?? "—")}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-zinc-400">{estr.nota}</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
