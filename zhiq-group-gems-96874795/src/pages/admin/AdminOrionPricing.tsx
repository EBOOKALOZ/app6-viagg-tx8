/**
 * /admin/orion-pricing — ORION Pricing AI (ORION-AI-15)
 *
 * Revenue Optimization: recomenda preços/comissões/margens, simula
 * cenários (sem tocar produção) e aplica preço do CATÁLOGO de
 * divulgação SÓ sob política ativa (limites + aprovação + histórico
 * com rollback). Comissão é advisory (fonte única). Nunca move
 * dinheiro. Narrativas via Gateway v3 + Prompt Registry.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { orionAiText } from "@/lib/ai/orionAiGateway";
import {
  Tag, Loader2, Sparkles, FlaskConical, ShieldCheck, History as HistoryIcon, RotateCcw, Send,
  BrainCircuit, AlertTriangle, Map as MapIcon,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};
const fmt = (v: any) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Aba = "central" | "decisao" | "recomendacoes" | "anomalias" | "simulacao" | "heatmap" | "catalogo" | "politicas" | "historico";

export default function AdminOrionPricing() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("central");
  const [ocupado, setOcupado] = useState("");
  const [narrativa, setNarrativa] = useState("");
  const [simCenario, setSimCenario] = useState("preco");
  const [simPct, setSimPct] = useState("10");
  const [simResult, setSimResult] = useState<any>(null);

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-pricing"], queryFn: () => rpc("pricing_dashboard_v11"), refetchInterval: 60000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["orion-pricing"] });

  const score = dash?.score || {};
  const metrics = dash?.metrics || {};
  const recs = ((dash?.recomendacoes || {}).recomendacoes || []) as any[];

  const narrar = async (promptKey: string, tipo: string, ctx: any) => {
    setOcupado("narr"); setNarrativa("");
    try {
      const r = await orionAiText("pricing", `Tipo: ${tipo}\nEstado real: ${JSON.stringify(ctx)}`,
        { promptKey, maxTokens: 550 });
      setNarrativa(r.ok ? String(r.texto) : `IA indisponível (${r.error}).`);
    } finally { setOcupado(""); }
  };

  const simular = async () => {
    setOcupado("sim");
    try { setSimResult(await rpc("pricing_simulation", { p_cenario: simCenario, p_valor_pct: Number(simPct) })); }
    catch (e: any) { alert("Erro: " + e.message); }
    finally { setOcupado(""); }
  };

  const aplicar = async (pkg: any) => {
    const novo = window.prompt(`Novo preço para "${pkg.nome}" (atual R$ ${pkg.preco}) — respeita a política ativa:`, String(pkg.preco));
    if (!novo) return;
    const motivo = window.prompt("Motivo (auditado):");
    if (!motivo) return;
    setOcupado(pkg.id);
    try {
      const r = await rpc("pricing_apply_package", { p_pacote: pkg.id, p_novo_preco: Number(novo), p_motivo: motivo });
      refresh();
      alert(`Aplicado: ${fmt(r.de)} → ${fmt(r.para)} (histórico ${String(r.historico).slice(0, 8)}).`);
    } catch (e: any) { alert("Bloqueado pela governança: " + e.message); }
    finally { setOcupado(""); }
  };

  const rollback = async (hid: string) => {
    setOcupado(hid);
    try { const r = await rpc("pricing_rollback", { p_historico: hid }); refresh();
      alert(`Revertido para ${fmt(r.restaurado_para)}.`); }
    catch (e: any) { alert("Erro: " + e.message); }
    finally { setOcupado(""); }
  };

  const [decisao, setDecisao] = useState<any>(null);
  const [anomalias, setAnomalias] = useState<any>(null);
  const [heatmap, setHeatmap] = useState<any>(null);
  const carregar = async (setter: any, fn: string, args?: any) => {
    setOcupado(fn);
    try { setter(await rpc(fn, args)); }
    catch (e: any) { alert("Erro: " + e.message); }
    finally { setOcupado(""); }
  };

  const ABAS: [Aba, any, string][] = [
    ["central", Sparkles, "Central"], ["decisao", BrainCircuit, "Motor de Decisão"],
    ["recomendacoes", Tag, "Recomendações"], ["anomalias", AlertTriangle, "Anomalias"],
    ["simulacao", FlaskConical, "Simulação"], ["heatmap", MapIcon, "Heatmap"],
    ["catalogo", ShieldCheck, "Catálogo & Aplicar"],
    ["politicas", ShieldCheck, "Políticas"], ["historico", HistoryIcon, "Histórico"],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        <div className="rounded-3xl bg-gradient-to-r from-[#3d1a00] via-[#7c3a00] to-[#3d1a00] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Tag className="h-8 w-8 text-orange-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Pricing AI</h1>
              <p className="text-sm text-orange-200/80">
                ORION-AI-15 · Revenue Optimization · recomenda e aplica só sob política · comissão advisory
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-orange-200/70">Pricing Score</p>
              <p className="text-3xl font-black">{score.pricing_score ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Preço médio", fmt(metrics.preco_medio_catalogo)], ["Ticket médio", fmt(metrics.ticket_medio)],
              ["LTV médio", fmt(metrics.ltv_medio)], ["Recompra", `${metrics.recompra_pct ?? 0}%`],
              ["Promoções ativas", metrics.promocoes_ativas], ["Políticas ativas", metrics.politicas_ativas]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-orange-200/70">{l}</p>
                <p className="truncate text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {ABAS.map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold ${aba === k ? "bg-[#7c3a00] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-orange-500" /></div>}

        {/* CENTRAL */}
        {aba === "central" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-orange-200 bg-orange-50/50 p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                {[["pricing.executive", "Resumo executivo"], ["pricing.recommendations", "Priorizar recomendações"],
                  ["pricing.performance", "Performance"], ["pricing.summary", "Por cidade/categoria"]].map(([pk, l]) => (
                  <button key={pk} onClick={async () => narrar(pk, l.toLowerCase(), await rpc("pricing_summary"))}
                    disabled={!!ocupado}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 ring-1 ring-orange-200 hover:bg-orange-100 disabled:opacity-50">
                    {ocupado === "narr" ? "…" : l}
                  </button>
                ))}
              </div>
              {narrativa && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-3 text-sm text-zinc-800 ring-1 ring-orange-100">{narrativa}</p>}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Componentes do Pricing Score</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {Object.entries((score.componentes || {}) as Record<string, any>).map(([k, v]) => (
                  <div key={k} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{k}</p>
                    <p className="text-lg font-black text-zinc-800">{v}</p>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-zinc-400">{score.formula}</p>
            </div>
          </div>
        )}

        {/* RECOMENDAÇÕES */}
        {aba === "recomendacoes" && !isLoading && (
          <div className="mt-4 space-y-2">
            {recs.map((r: any, i: number) => (
              <div key={i} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-black text-orange-700">{r.area}</span>
                  <p className="min-w-0 flex-1 text-sm font-bold">{r.acao.replaceAll("_", " ")}</p>
                  <span className="text-[10px] text-zinc-400">confiança {Math.round(Number(r.confianca || 0) * 100)}%</span>
                </div>
                <p className="mt-1 text-xs text-zinc-600">🎯 {r.objetivo} · 📈 {r.impacto_esperado} · 💰 {r.margem_prevista}</p>
                <p className="mt-0.5 text-[11px] text-zinc-400">risco: {r.risco} · dados: {r.dados_utilizados}</p>
              </div>
            ))}
          </div>
        )}

        {/* SIMULAÇÃO */}
        {aba === "simulacao" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <select value={simCenario} onChange={(e) => setSimCenario(e.target.value)}
                className="h-10 rounded-xl border border-zinc-200 bg-white px-2 text-sm font-semibold">
                <option value="preco">Preço ±%</option>
                <option value="comissao">Comissão ±% (simulação)</option>
                <option value="frete_gratis">Frete grátis (custo %)</option>
                <option value="cashback">Cashback (custo %)</option>
              </select>
              <input value={simPct} onChange={(e) => setSimPct(e.target.value)} type="number"
                className="h-10 w-24 rounded-xl border border-zinc-200 px-3 text-sm" />
              <button onClick={simular} disabled={!!ocupado}
                className="flex h-10 items-center gap-1 rounded-xl bg-[#7c3a00] px-4 text-sm font-black text-white disabled:opacity-50">
                {ocupado === "sim" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                Simular (não toca produção)
              </button>
            </div>
            {simResult && (
              <div className="mt-3 rounded-2xl bg-slate-50 p-3">
                <pre className="whitespace-pre-wrap text-xs text-zinc-700">{JSON.stringify(simResult, null, 1)}</pre>
                <button onClick={() => narrar("pricing.simulation", "simulacao", simResult)} disabled={!!ocupado}
                  className="mt-2 flex items-center gap-1 rounded-xl bg-[#7c3a00] px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                  <Sparkles className="h-3.5 w-3.5" /> Vale a pena? (IA)
                </button>
                {narrativa && aba === "simulacao" && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-orange-50 p-3 text-sm text-zinc-800">{narrativa}</p>}
              </div>
            )}
          </div>
        )}

        {/* MOTOR DE DECISÃO */}
        {aba === "decisao" && (
          <div className="mt-4 rounded-3xl border border-orange-200 bg-orange-50/40 p-4 shadow-sm">
            <button onClick={() => carregar(setDecisao, "pricing_decision", { p_pacote: null })} disabled={!!ocupado}
              className="flex items-center gap-2 rounded-xl bg-[#7c3a00] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
              {ocupado === "pricing_decision" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
              Calcular Preço Inteligente
            </button>
            {decisao && (
              <div className="mt-4">
                <div className="flex flex-wrap items-baseline gap-3">
                  <p className="text-sm font-bold text-zinc-700">{decisao.pacote}</p>
                  <p className="text-2xl font-black text-zinc-800">{fmt(decisao.preco_atual)} → <span className="text-orange-700">{fmt(decisao.preco_inteligente)}</span></p>
                  <span className="rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-black text-orange-700">
                    ajuste {decisao.ajuste_pct}% · confiança {Math.round(Number(decisao.confianca) * 100)}%
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-600">{decisao.explicacao}</p>
                <div className="mt-3 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Fatores que pesaram (auditável)</p>
                  {(decisao.fatores || []).map((f: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-orange-100">
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-black text-white">{f.peso}</span>
                      <span className="min-w-0 flex-1 text-xs font-semibold text-zinc-700">{f.fator.replaceAll("_", " ")}</span>
                      <span className="text-[10px] text-zinc-400">valor {f.valor} · {f.fonte}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">{decisao.decisao}</p>
              </div>
            )}
          </div>
        )}

        {/* ANOMALIAS */}
        {aba === "anomalias" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <button onClick={() => carregar(setAnomalias, "pricing_anomalies")} disabled={!!ocupado}
              className="flex items-center gap-2 rounded-xl bg-[#7c3a00] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">
              {ocupado === "pricing_anomalies" ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
              Detectar anomalias de preço
            </button>
            {anomalias && (!anomalias.anomalias?.length ? (
              <p className="mt-4 p-6 text-center text-sm text-zinc-400">✅ Nenhuma anomalia — preços dentro da política e sem outliers.</p>
            ) : (anomalias.anomalias || []).map((a: any, i: number) => (
              <div key={i} className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 p-3">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${a.severidade === "alta" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{a.severidade}</span>
                <span className="text-sm font-bold text-zinc-700">{a.tipo.replaceAll("_", " ")}</span>
                <span className="text-xs text-zinc-500">{JSON.stringify(a)}</span>
              </div>
            )))}
            {anomalias && <p className="mt-2 text-[10px] text-zinc-400">{anomalias.nota}</p>}
          </div>
        )}

        {/* HEATMAP */}
        {aba === "heatmap" && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap gap-2">
              {["nacional", "estadual", "municipal"].map((n) => (
                <button key={n} onClick={() => carregar(setHeatmap, "pricing_heatmap", { p_nivel: n })} disabled={!!ocupado}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-bold capitalize text-zinc-700 ring-1 ring-orange-200 hover:bg-orange-100 disabled:opacity-50">
                  {n}
                </button>
              ))}
            </div>
            {heatmap && (Array.isArray(heatmap) ? (
              <div className="mt-3 space-y-1">
                {heatmap.map((c: any, i: number) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs font-bold capitalize text-zinc-700">
                      {c.cidade ? `📍 ${c.cidade}${c.uf ? ` — ${c.uf}` : ""}` : `🗺️ ${c.uf}`}
                    </p>
                    <span className="text-[10px] text-zinc-400">score {c.score ?? c.score_medio}{c.cidades ? ` · ${c.cidades} cidades` : ""}</span>
                    {c.intensidade && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${c.intensidade === "quente" ? "bg-red-100 text-red-700" : c.intensidade === "morno" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"}`}>{c.intensidade}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-xs text-zinc-700">{JSON.stringify(heatmap, null, 1)}</pre>
            ))}
          </div>
        )}

        {/* CATÁLOGO */}
        {aba === "catalogo" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs text-zinc-400">
              Aplicação de preço é <b>governada</b>: respeita min/max e desconto máximo da política ativa, exige motivo,
              grava histórico e permite rollback. Só o catálogo de divulgação (placeholder) — <b>nunca comissão nem dinheiro</b>.
            </p>
            {((dash?.catalogo || []) as any[]).map((c: any) => (
              <div key={c.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 p-3">
                <p className="min-w-0 flex-1 font-bold">{c.nome} <span className="text-[11px] text-zinc-400">· {c.qtd} divulgações</span></p>
                <span className="text-lg font-black text-zinc-800">{fmt(c.preco)}</span>
                <button onClick={() => aplicar(c)} disabled={ocupado === c.id}
                  className="rounded-xl bg-[#7c3a00] px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
                  Ajustar preço
                </button>
              </div>
            ))}
          </div>
        )}

        {/* POLÍTICAS */}
        {aba === "politicas" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            {((dash?.politicas || []) as any[]).map((p: any) => (
              <div key={p.id} className="mb-2 rounded-2xl border border-zinc-100 p-3 text-xs text-zinc-600">
                <p className="text-sm font-black text-zinc-800">Política {p.escopo}{p.escopo_valor ? `: ${p.escopo_valor}` : ""} (v{p.versao})</p>
                <p className="mt-1">
                  Preço R$ {p.preco_min}–{p.preco_max} · margem alvo {p.margem_alvo_pct}% (mín {p.margem_min_pct}%) ·
                  comissão {p.comissao_min_pct}–{p.comissao_max_pct}% · desconto máx {p.desconto_max_pct}% ·
                  {p.exige_aprovacao ? " exige aprovação" : " auto"}
                </p>
              </div>
            ))}
            <p className="mt-2 text-[11px] text-zinc-400">
              Comissão nos limites é referência/recomendação — a aplicação real de comissão é fonte única
              (official_motoboy_commission / commission_overrides pelo admin), fora do Pricing AI.
            </p>
          </div>
        )}

        {/* HISTÓRICO */}
        {aba === "historico" && !isLoading && (
          <div className="mt-4 rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
            {!((dash?.historico || []) as any[]).length ? (
              <p className="p-6 text-center text-sm text-zinc-400">Nenhuma alteração de preço registrada.</p>
            ) : ((dash?.historico || []) as any[]).map((h: any) => (
              <div key={h.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 p-3">
                <p className="min-w-0 flex-1 text-xs text-zinc-600">
                  {h.alvo_tabela}.{h.campo}: <b>{fmt(h.valor_antigo)} → {fmt(h.valor_novo)}</b>
                  {h.motivo && ` · ${h.motivo}`} · {new Date(h.criado_em).toLocaleString("pt-BR")}
                </p>
                {h.revertido ? (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-black text-zinc-400">revertido</span>
                ) : (
                  <button onClick={() => rollback(h.id)} disabled={ocupado === h.id}
                    className="flex items-center gap-1 rounded-xl bg-zinc-700 px-2.5 py-1 text-[11px] font-black text-white disabled:opacity-50">
                    <RotateCcw className="h-3 w-3" /> Rollback
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Pricing AI v1.0 · ORION-AI-15 · recomenda/simula/aplica sob política · comissão é fonte única (advisory) ·
          nunca move dinheiro · histórico imutável com rollback
        </p>
      </div>
    </div>
  );
}
