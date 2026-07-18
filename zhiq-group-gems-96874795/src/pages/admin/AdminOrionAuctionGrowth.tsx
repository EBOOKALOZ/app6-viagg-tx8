/**
 * /admin/orion-auction-growth — ORION Auction Growth & Expansion AI (ORION-AI-69)
 *
 * Centro de Crescimento do Ecossistema de Leilões. READ-ONLY: analisa, compara,
 * prevê e recomenda — nunca altera leilões/lances/comissões/créditos.
 * Fonte única: auction_growth_dashboard() (dados 100% reais; pré-lançamento declarado).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, Loader2, Gauge, MapPin, Lightbulb, LineChart, Target } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const BRL = (v: any) => "R$ " + Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const scoreCol = (s: number) => (s >= 70 ? "text-emerald-600" : s >= 40 ? "text-amber-600" : "text-red-600");
const scoreBg = (s: number) => (s >= 70 ? "text-emerald-300" : s >= 40 ? "text-amber-300" : "text-red-300");

type Aba = "dashboard" | "kpis" | "expansao" | "oportunidades" | "previsoes";

export default function AdminOrionAuctionGrowth() {
  const [aba, setAba] = useState<Aba>("dashboard");

  const { data, isLoading } = useQuery({
    queryKey: ["orion-auction-growth"], queryFn: () => rpc("auction_growth_dashboard"), refetchInterval: 60000,
  });

  const m = data?.metrics || {};
  const growth = data?.growth || {};
  const scores = data?.scores || {};
  const pen = data?.penetration || {};
  const exp = data?.expansion || {};
  const ret = data?.retention || {};
  const kpis = data?.kpis || {};
  const opp = (data?.oportunidades || []) as any[];
  const prev = (data?.previsoes || []) as any[];
  const serie = (data?.serie || []) as any[];
  const cfg = data?.config || {};
  const gscore = Number(growth.growth_score ?? scores.growth_score ?? 0);
  const cidades = (exp.oportunidades_cidades || []) as any[];
  const ufs = (exp.participacao_por_estado || []) as any[];

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/40 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">

        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#04241a] via-[#06392a] to-[#04241a] p-6 text-white shadow-xl ring-1 ring-emerald-500/20">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
              <TrendingUp className="h-8 w-8 text-emerald-300" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-black tracking-tight">ORION Auction Growth & Expansion</h1>
              <p className="text-sm text-emerald-100/70">
                ORION-AI-69 · Centro de Crescimento · <span className="font-bold">READ-ONLY</span> · analisa · prevê · recomenda · nunca altera o domínio
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-6 py-3 text-center ring-1 ring-emerald-500/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/70">Growth Score</p>
              <p className={`text-4xl font-black ${scoreBg(gscore)}`}>{gscore}</p>
              <p className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">{growth.nota?.includes("pré") ? "pré-lançamento" : "operacional"}</p>
            </div>
          </div>
          {m.estagio && (
            <div className="mt-3 rounded-2xl bg-amber-400/10 px-3 py-2 text-[11px] font-semibold text-amber-200 ring-1 ring-amber-400/20">
              ⓘ Estágio: {m.estagio} — todos os números são reais; scores baixos são honestos.
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {[["GMV", BRL(m.gmv)], ["Receita", BRL(m.receita)], ["Vendedores", m.vendedores], ["Compradores", m.compradores],
              ["Leilões", m.leiloes_total], ["Ticket médio", BRL(m.ticket_medio)]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-emerald-100/60">{l}</p>
                <p className="truncate text-base font-black">{String(v ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        {/* SCORES da certificação */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[["Growth", scores.growth_score], ["Expansion", scores.expansion_score], ["Prediction", scores.prediction_score],
            ["Analytics", scores.analytics_score], ["Performance", scores.performance_score]].map(([l, v]: any) => (
            <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-3 text-center shadow-sm">
              <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
              <p className={`text-2xl font-black ${scoreCol(Number(v ?? 0))}`}>{v ?? 0}</p>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([["dashboard", Gauge, "Dashboard"], ["kpis", Target, "KPIs & Retenção"], ["expansao", MapPin, "Expansão"],
             ["oportunidades", Lightbulb, `Oportunidades${opp.length ? ` (${opp.length})` : ""}`], ["previsoes", LineChart, "Previsões"]] as [Aba, any, string][]).map(([k, Icon, label]) => (
            <button key={k} onClick={() => setAba(k)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${aba === k ? "bg-[#06392a] text-white shadow" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>}

        {/* DASHBOARD */}
        {aba === "dashboard" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Composição do Growth Score</h3>
              <div className="grid gap-2 sm:grid-cols-5">
                {Object.entries(growth.parcelas || {}).map(([k, v]: any) => (
                  <div key={k} className="rounded-2xl bg-emerald-50 px-3 py-2 text-center">
                    <p className="text-[10px] font-bold uppercase text-emerald-700/70 capitalize">{k}</p>
                    <p className="text-lg font-black text-emerald-700">{v}</p>
                    <p className="text-[9px] text-emerald-600/60">/ 20</p>
                  </div>
                ))}
              </div>
              {growth.base && <p className="mt-2 text-[11px] text-zinc-400">Base: {growth.base}</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[["Liquidez", (Number(m.liquidez ?? 0) * 100).toFixed(1) + "%"], ["Conversão", (Number(m.conversao ?? 0) * 100).toFixed(1) + "%"],
                ["Leilões liquidados", m.leiloes_liquidados], ["Watchers", m.watchers]].map(([l, v]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-2xl font-black text-zinc-800">{String(v ?? 0)}</p>
                </div>
              ))}
            </div>
            {serie.length > 0 && (
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Série histórica (snapshots diários)</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead><tr className="text-zinc-400"><th className="pb-1 pr-3">Dia</th><th className="pr-3">Leilões</th><th className="pr-3">Lances</th><th className="pr-3">GMV</th><th className="pr-3">Receita</th><th>Growth</th></tr></thead>
                    <tbody>{serie.map((s: any) => (
                      <tr key={s.dia} className="border-t border-zinc-50 font-semibold text-zinc-600">
                        <td className="py-1 pr-3">{s.dia}</td><td className="pr-3">{s.leiloes_total}</td><td className="pr-3">{s.lances}</td>
                        <td className="pr-3">{BRL(s.gmv)}</td><td className="pr-3">{BRL(s.receita)}</td><td>{s.growth_placeholder}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* KPIs & RETENÇÃO */}
        {aba === "kpis" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[["GMV", BRL(kpis.gmv)], ["Receita", BRL(kpis.receita)], ["Ticket médio", BRL(kpis.ticket_medio)],
                ["LTV estimado", BRL(kpis.ltv_estimado)], ["Liquidez", (Number(kpis.liquidez ?? 0) * 100).toFixed(1) + "%"],
                ["Conversão", (Number(kpis.conversao ?? 0) * 100).toFixed(1) + "%"]].map(([l, v]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-xl font-black text-zinc-800">{String(v)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-[11px] font-bold text-amber-800">CAC estimado: <span className="font-black">indisponível</span></p>
              <p className="text-[11px] text-amber-700">{kpis.cac_nota}</p>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Retenção (lances por usuário)</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {[["Usuários c/ lance", ret.usuarios_com_lance], ["Recorrentes", ret.usuarios_recorrentes], ["Taxa de retorno", (ret.taxa_retorno_pct ?? 0) + "%"]].map(([l, v]: any) => (
                  <div key={l} className="rounded-2xl bg-zinc-50 px-3 py-2 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                    <p className="text-lg font-black text-zinc-700">{String(v ?? 0)}</p>
                  </div>
                ))}
              </div>
              {ret.nota && <p className="mt-2 text-[11px] text-zinc-400">{ret.nota}</p>}
            </div>
            {kpis.receita_por_uf && Object.keys(kpis.receita_por_uf).length > 0 && (
              <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <h3 className="mb-2 text-sm font-black text-zinc-700">Receita por UF</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(kpis.receita_por_uf).map(([uf, v]: any) => (
                    <span key={uf} className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">{uf}: {BRL(v)}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* EXPANSÃO */}
        {aba === "expansao" && !isLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {[["Penetração municipal", (pen.penetracao_municipal_pct ?? 0) + "%"], ["Penetração estadual", (pen.penetracao_estadual_pct ?? 0) + "%"],
                ["Universo IBGE", (exp.universo_municipios ?? 0).toLocaleString("pt-BR") + " municípios"]].map(([l, v]: any) => (
                <div key={l} className="rounded-3xl border border-zinc-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                  <p className="text-xl font-black text-emerald-700">{String(v)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-black text-zinc-700">Participação por estado (oferta real)</h3>
              <div className="flex flex-wrap gap-2">
                {ufs.map((u: any, i: number) => (
                  <span key={i} className="rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-bold text-zinc-600">{u.uf}: {u.oferta} leilão(ões) · {u.ativos} ativos</span>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
              <h3 className="mb-1 text-sm font-black text-zinc-700">Oportunidades de expansão (municípios sem oferta, por população)</h3>
              <p className="mb-3 text-[11px] text-zinc-400">{exp.nota}</p>
              <div className="space-y-1">
                {cidades.map((c: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 border-b border-zinc-50 pb-1 text-[12px]">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-black text-emerald-700">{i + 1}</span>
                    <span className="font-black text-zinc-800">{c.cidade}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{c.uf} · {c.regiao}</span>
                    <span className="ml-auto font-bold text-emerald-700">{Number(c.populacao).toLocaleString("pt-BR")} hab</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* OPORTUNIDADES */}
        {aba === "oportunidades" && !isLoading && (
          <div className="mt-4 space-y-2">
            {!opp.length ? <p className="text-xs text-zinc-400">Nenhuma oportunidade detectada ainda (o tick roda a cada 30 min).</p> : opp.map((o: any, i: number) => (
              <div key={i} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">{o.tipo}</span>
                  <span className="min-w-0 flex-1 truncate font-black text-zinc-800">{o.titulo}</span>
                  <div className="text-right">
                    <p className="text-lg font-black text-emerald-600">{Math.round(Number(o.potencial))}</p>
                    <p className="text-[9px] text-zinc-400">potencial · conf {Math.round(Number(o.confianca) * 100)}%</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PREVISÕES */}
        {aba === "previsoes" && !isLoading && (
          <div className="mt-4 space-y-2">
            <p className="text-[11px] text-zinc-400">Regressão linear sobre snapshots diários. Sem histórico suficiente, a IA declara e não emite previsão (honesto).</p>
            {prev.map((p: any, i: number) => (
              <div key={i} className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-black text-zinc-800 capitalize">{String(p.metrica).replace("_", " ")}</span>
                  <span className="text-[11px] text-zinc-400">+{p.horizonte_dias}d</span>
                  <div className="ml-auto text-right">
                    <p className="text-lg font-black text-zinc-800">{p.valor_previsto ?? "—"}</p>
                    <p className="text-[9px] text-zinc-400">conf {Math.round(Number(p.confianca) * 100)}% · n={p.n_amostras}</p>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">{p.base_estatistica}</p>
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Auction Growth & Expansion v1.0 · ORION-AI-69 · READ-ONLY · GMV/receita reais de orion_auction_settlements ·
          expansão sobre 5.571 municípios IBGE · previsão regr_slope declara base + n · tick */30 · namespace orion_agrowth_*
        </p>
      </div>
    </div>
  );
}
