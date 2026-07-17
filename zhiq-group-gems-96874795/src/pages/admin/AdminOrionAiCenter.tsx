/**
 * /admin/orion-ai-center — ORION AI Cost & Intelligence Center (ORION-AI-37)
 *
 * O "CFO das IAs": monitora, audita e otimiza custos, tokens, desempenho e ROI
 * de todas as IAs do ORION em tempo real. Fonte real = orion_ai_log (Gateway).
 * KPIs: ACS/AES/ARS/CES/TES + CPR/CPS/CPC/CPO. Simulador financeiro + forecast.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Coins, Loader2, Gauge, Layers, LineChart, Calculator, Scale } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const usd = (v: any) => v == null ? "—" : `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 6 })}`;
const brl = (v: any) => v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
const kpiColor = (s: number) => s >= 70 ? "text-emerald-300" : s >= 45 ? "text-amber-300" : "text-red-300";

type Aba = "resumo" | "custos" | "timeline" | "simulador" | "comparador";

export default function AdminOrionAiCenter() {
  const [aba, setAba] = useState<Aba>("resumo");
  const [users, setUsers] = useState(10000);
  const [sim, setSim] = useState<any>(null);
  const [simLoad, setSimLoad] = useState(false);

  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-ai-center"], queryFn: () => rpc("ai_center_dashboard"), refetchInterval: 60000,
  });
  const { data: comparador = [] } = useQuery({
    queryKey: ["orion-ai-center-comp"], queryFn: () => rpc("ai_center_comparator"),
  });

  const score = dash?.score || {};
  const kpis = dash?.kpis || {};
  const porModulo = (dash?.por_modulo || []) as any[];
  const porModelo = (dash?.por_modelo || []) as any[];
  const ranking = dash?.ranking || {};
  const timeline = (dash?.timeline || []) as any[];
  const forecast = dash?.forecast || {};
  const alertas = (dash?.alertas || []) as any[];

  const simular = async (n: number) => {
    setUsers(n); setSimLoad(true); setSim(null);
    try { setSim(await rpc("ai_center_simulator", { p_users: n })); }
    finally { setSimLoad(false); }
  };

  const maxCusto = Math.max(...timeline.map((t) => Number(t.custo_usd) || 0), 0.000001);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#052e2b] via-[#064e3b] to-[#052e2b] p-6 text-white shadow-xl ring-1 ring-emerald-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
              <Coins className="h-8 w-8 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION AI Cost & Intelligence Center</h1>
              <p className="text-sm text-slate-300/80">ORION-AI-37 · o CFO das IAs · governança financeira em tempo real · fonte real: Gateway log</p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-emerald-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/70">Custo total (IA)</p>
              <p className="text-3xl font-black text-emerald-300">{usd(score.custo_total_usd)}</p>
              <p className="text-[11px] font-bold text-emerald-200/80">ROI {score.roi ?? "—"}× · margem {score.margem_pct ?? "—"}%</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Chamadas", score.chamadas_total], ["Tokens", score.tokens_total], ["Cache hit", `${score.cache_hit_rate ?? 0}%`],
              ["Receita atr.", brl(score.receita_brl)], ["ACS", score.acs], ["ARS", score.ars]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-300/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["resumo", Gauge, "Resumo Executivo"], ["custos", Layers, "Custos por IA/Modelo"],
             ["timeline", LineChart, "Timeline & Forecast"], ["simulador", Calculator, "Simulador Financeiro"],
             ["comparador", Scale, "Comparador"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#064e3b] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>}

        {/* RESUMO */}
        {aba === "resumo" && !isLoading && (
          <div className="mt-4 space-y-4">
            {alertas.length > 0 && (
              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                {alertas.map((a: any, i: number) => (
                  <p key={i} className="text-sm font-bold text-amber-800">⚠ {a.mensagem}</p>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[["ACS", score.acs, "Cost Score"], ["AES", score.aes, "Efficiency"], ["ARS", score.ars, "ROI Score"],
                ["CES", score.ces, "Cache"], ["TES", score.tes, "Token"]].map(([l, v, s]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className={`text-3xl font-black ${kpiColor(v)}`}>{v ?? "—"}</p>
                  <p className="text-[10px] text-zinc-400">{s}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Custo por funcionalidade (KPIs)</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[["Por pedido (CPO)", kpis.cpo_usd], ["Por busca (CPS)", kpis.cps_usd], ["Por recomendação (CPR)", kpis.cpr_usd], ["Por conversa (CPC)", kpis.cpc_usd]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className="text-base font-black text-emerald-700">{usd(v)}</p>
                  </div>
                ))}
              </div>
              {kpis.nota && <p className="mt-2 text-[11px] text-zinc-400">{kpis.nota}</p>}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Ranking</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[["🔥 Mais usada", ranking.mais_usada?.module, `${ranking.mais_usada?.chamadas ?? 0} ch`],
                  ["💸 Mais cara", ranking.mais_cara?.module, usd(ranking.mais_cara?.custo_usd)],
                  ["🪙 Mais barata", ranking.mais_barata?.module, usd(ranking.mais_barata?.custo_usd)],
                  ["♻ Maior cache", ranking.maior_cache?.module, `${ranking.maior_cache?.cache ?? 0}`]].map(([l, m, v]: any) => (
                  <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className="truncate text-sm font-black text-zinc-800">{m ?? "—"}</p>
                    <p className="text-[11px] text-zinc-500">{v}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CUSTOS */}
        {aba === "custos" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="overflow-x-auto rounded-3xl border border-zinc-100 bg-white shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase text-zinc-400">
                  <tr>{["Módulo", "Chamadas", "Tokens", "Custo", "Médio", "Latência", "Cache", "Erros", "Disp."].map((h) => <th key={h} className="px-3 py-2 font-bold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {porModulo.map((m: any, i: number) => (
                    <tr key={i} className="border-t border-zinc-50">
                      <td className="px-3 py-2 font-bold text-zinc-800">{m.module}</td>
                      <td className="px-3 py-2">{m.chamadas}</td>
                      <td className="px-3 py-2">{m.tokens}</td>
                      <td className="px-3 py-2 font-bold text-emerald-700">{usd(m.custo_usd)}</td>
                      <td className="px-3 py-2 text-zinc-500">{usd(m.custo_medio_usd)}</td>
                      <td className="px-3 py-2">{m.latencia_ms}ms</td>
                      <td className="px-3 py-2">{m.cache}</td>
                      <td className="px-3 py-2">{m.erros}</td>
                      <td className="px-3 py-2">{m.disponibilidade}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Custos por modelo</h3>
              {porModelo.map((m: any, i: number) => (
                <div key={i} className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{m.model}</span>
                  <span className="text-[11px] text-zinc-500">{m.chamadas} ch · {m.tokens} tok · in ${m.preco_in_mtok}/Mtok · out ${m.preco_out_mtok}/Mtok</span>
                  <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">{usd(m.custo_usd)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TIMELINE & FORECAST */}
        {aba === "timeline" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-black text-zinc-700">Custo diário (USD)</h3>
              <div className="flex items-end gap-2" style={{ height: 160 }}>
                {timeline.map((t: any, i: number) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div className="w-full rounded-t bg-emerald-500" style={{ height: `${Math.max(4, (Number(t.custo_usd) / maxCusto) * 130)}px` }} title={usd(t.custo_usd)} />
                    <p className="text-[9px] text-zinc-400">{String(t.dia).slice(5)}</p>
                    <p className="text-[9px] font-bold text-zinc-600">{usd(t.custo_usd)}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Amanhã", forecast.amanha_usd], ["Mês", forecast.mes_usd]].map(([l, v]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">Previsão {l}</p>
                  <p className="text-2xl font-black text-emerald-700">{usd(v)}</p>
                </div>
              ))}
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm sm:col-span-2">
                <p className="text-[10px] font-bold uppercase text-zinc-400">Método</p>
                <p className="text-[11px] text-zinc-500">Projeção linear da média diária histórica (declarado)</p>
              </div>
            </div>
          </div>
        )}

        {/* SIMULADOR */}
        {aba === "simulador" && !isLoading && (
          <div className="mt-4 space-y-3">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-2 text-xs text-zinc-500">Escala o consumo/custo/receita a partir da base real (pedidos pagos como proxy de pagante). Premissas declaradas.</p>
              <div className="flex flex-wrap gap-2">
                {[100, 1000, 10000, 100000, 1000000].map((n) => (
                  <button key={n} onClick={() => simular(n)} disabled={simLoad}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${users === n ? "bg-[#064e3b] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"} disabled:opacity-50`}>
                    {n.toLocaleString("pt-BR")} usuários
                  </button>
                ))}
              </div>
            </div>
            {simLoad && <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-emerald-500" /></div>}
            {sim && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[["Consumo tokens", Number(sim.consumo_tokens_estimado).toLocaleString("pt-BR")],
                  ["Custo OpenAI", usd(sim.custo_openai_usd)], ["Custo infra (est)", usd(sim.custo_infra_usd_est)],
                  ["Receita estimada", brl(sim.receita_estimada_brl)], ["Lucro líquido (est)", brl(sim.lucro_liquido_brl_est)],
                  ["Margem", `${sim.margem_pct_est}%`]].map(([l, v]: any) => (
                  <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className="text-xl font-black text-emerald-700">{v}</p>
                  </div>
                ))}
                <p className="text-[11px] text-amber-600 sm:col-span-2 lg:col-span-3">⚠ {sim.premissas}</p>
              </div>
            )}
          </div>
        )}

        {/* COMPARADOR */}
        {aba === "comparador" && !isLoading && (
          <div className="mt-4 overflow-x-auto rounded-3xl border border-zinc-100 bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase text-zinc-400">
                <tr>{["Modelo", "Label", "Ativo", "In $/Mtok", "Out $/Mtok", "Chamadas reais", "Custo real"].map((h) => <th key={h} className="px-3 py-2 font-bold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {(comparador as any[]).map((m: any, i: number) => (
                  <tr key={i} className="border-t border-zinc-50">
                    <td className="px-3 py-2 font-bold text-zinc-800">{m.model}</td>
                    <td className="px-3 py-2 text-zinc-500">{m.label}</td>
                    <td className="px-3 py-2">{m.ativo ? "✅" : "—"}</td>
                    <td className="px-3 py-2">${m.preco_in_mtok}</td>
                    <td className="px-3 py-2">${m.preco_out_mtok}</td>
                    <td className="px-3 py-2">{m.chamadas_reais}</td>
                    <td className="px-3 py-2 font-bold text-emerald-700">{usd(m.custo_real_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION AI Cost & Intelligence Center v1.0 · ORION-AI-37 · ACS/AES/ARS/CES/TES + CPR/CPS/CPC/CPO ·
          fonte real: orion_ai_log (Gateway) · read-only · tick */5 incremental · nunca reescreve histórico
        </p>
      </div>
    </div>
  );
}
