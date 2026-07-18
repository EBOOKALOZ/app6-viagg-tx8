/**
 * /admin/auction-intelligence — ORION Auction Intelligence Center
 *
 * Painel admin que CONSOLIDA (read-only) os motores de IA de leilão já vivos:
 *  • AI-67 Intelligence  → orion_auction_intelligence_dashboard (KPIs/mercado/heatmap/rankings)
 *  • AI-65 Settlement    → orion_auction_settlement_dashboard (liquidação/comissão)
 *  • AI-73 Dynamic Price → orion_dprice_dashboard + recommend/simulate
 *  • AI-71 Score         → orion_auction_score (drill-down por leilão)
 * Nada é recalculado no front — só exibe o que o banco computou.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Gavel, Loader2, Coins, TrendingUp, Trophy, Flame, MapPin, Store,
  Sparkles, Timer, ShieldAlert, Calculator, Gauge,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};
const brl = (v: any) => `R$ ${Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Kpi = ({ l, v }: { l: string; v: any }) => (
  <div className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
    <p className="truncate text-[10px] font-bold uppercase tracking-wider text-indigo-200/70">{l}</p>
    <p className="text-lg font-black">{String(v ?? 0)}</p>
  </div>
);
const Card = ({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) => (
  <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
    <h3 className="mb-2 flex items-center gap-1.5 text-sm font-black text-zinc-700">{icon}{title}</h3>
    {children}
  </div>
);
const Stat = ({ l, v, accent }: { l: string; v: any; accent?: string }) => (
  <div className="rounded-2xl bg-slate-50 p-3 text-center">
    <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
    <p className={`text-lg font-black ${accent ?? "text-zinc-800"}`}>{v}</p>
  </div>
);

export default function AdminAuctionIntelligence() {
  const { data: intel, isLoading: l1 } = useQuery({ queryKey: ["ai-intel"], queryFn: () => rpc("orion_auction_intelligence_dashboard"), refetchInterval: 60000 });
  const { data: settle } = useQuery({ queryKey: ["ai-settle"], queryFn: () => rpc("orion_auction_settlement_dashboard"), refetchInterval: 60000 });
  const { data: dprice } = useQuery({ queryKey: ["ai-dprice"], queryFn: () => rpc("orion_dprice_dashboard"), refetchInterval: 60000 });
  const { data: listings } = useQuery({
    queryKey: ["ai-listings"],
    queryFn: async () => {
      const { data } = await supabase.from("auction_listings").select("id,title,city,current_bid,starting_bid,status").order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  const [sel, setSel] = useState<string>("");
  const { data: score, isFetching: sf } = useQuery({ queryKey: ["ai-score", sel], queryFn: () => rpc("orion_auction_score", { p_listing: sel }), enabled: !!sel });
  const { data: rec } = useQuery({ queryKey: ["ai-rec", sel], queryFn: () => rpc("orion_dprice_recommend", { p_listing: sel }), enabled: !!sel });

  // Simulador
  const [preco, setPreco] = useState(""); const [reserva, setReserva] = useState(""); const [dur, setDur] = useState("7");
  const [sim, setSim] = useState<any>(null); const [simLoading, setSimLoading] = useState(false);
  const runSim = async () => {
    if (!sel) return;
    setSimLoading(true);
    try {
      const r = await rpc("orion_dprice_simulate", {
        p_listing: sel,
        p_new_starting: preco ? Number(preco) : null,
        p_new_reserve: reserva ? Number(reserva) : null,
        p_new_duration_days: dur ? Number(dur) : null,
      });
      setSim(r);
    } catch (e: any) { setSim({ erro: e.message }); } finally { setSimLoading(false); }
  };

  const k = intel?.kpis || {};
  const per = intel?.receita_por_periodo || {};
  const heat = (intel?.heatmap || []) as any[];
  const rk = intel?.rankings || {};
  const precos = intel?.precos || {};

  const kpis: [string, any][] = [
    ["GMV Leilões", brl(k.gmv_leiloes)], ["Comissão", brl(k.comissao_arrecadada)],
    ["Ticket Médio", brl(k.ticket_medio)], ["Conversão", `${k.taxa_conversao ?? 0}%`],
    ["Arremates", settle?.arremates ?? 0], ["Tempo Médio", `${k.tempo_medio_venda_h ?? 0}h`],
    ["Receita Pacotes", k.receita_pacotes_divulgacao ?? 0], ["Comissão Pend.", brl(settle?.comissao_pendente)],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#1e1b4b] via-[#4338ca] to-[#1e1b4b] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Sparkles className="h-8 w-8 text-indigo-200" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">ORION Auction Intelligence</h1>
                <span className="rounded-full bg-indigo-500/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ring-1 ring-indigo-300/40">AI-65·67·71·73</span>
              </div>
              <p className="text-sm text-indigo-100/80">
                Liquidação · Inteligência de mercado · Score · Precificação dinâmica · dados reais + motores ORION{intel?.atualizado_em ? ` · ${intel.atualizado_em}` : ""}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {kpis.map(([l, v]) => <Kpi key={l} l={l} v={v} />)}
          </div>
        </div>

        {l1 && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-[#4338ca]" /></div>}

        {!l1 && (
          <div className="mt-6 space-y-4">
            {/* Receita por período + preços */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Receita de comissão por período" icon={<Coins className="h-4 w-4 text-emerald-500" />}>
                <div className="grid grid-cols-4 gap-2">
                  <Stat l="Dia" v={brl(per.dia)} accent="text-emerald-600" />
                  <Stat l="Semana" v={brl(per.semana)} accent="text-emerald-600" />
                  <Stat l="Mês" v={brl(per.mes)} accent="text-emerald-600" />
                  <Stat l="Ano" v={brl(per.ano)} accent="text-emerald-600" />
                </div>
              </Card>
              <Card title="Preços de mercado (AI-73)" icon={<TrendingUp className="h-4 w-4 text-[#4338ca]" />}>
                <div className="grid grid-cols-3 gap-2">
                  <Stat l="Inicial médio" v={brl(precos.preco_inicial_medio)} />
                  <Stat l="Final médio" v={brl(precos.preco_final_medio)} />
                  <Stat l="Valorização" v={`${precos.valorizacao_media_pct ?? 0}%`} accent="text-[#4338ca]" />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Stat l="Acima do mercado" v={dprice?.acima_do_mercado ?? 0} accent="text-red-500" />
                  <Stat l="Abaixo do mercado" v={dprice?.abaixo_do_mercado ?? 0} accent="text-emerald-600" />
                </div>
              </Card>
            </div>

            {/* Heatmap + rankings */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card title="Heatmap (estado × cidade)" icon={<MapPin className="h-4 w-4 text-emerald-500" />}>
                {!heat.length ? <p className="py-3 text-center text-xs text-zinc-400">Sem dados.</p> : (
                  <div className="space-y-1 max-h-56 overflow-y-auto">
                    {heat.slice(0, 12).map((h: any, i: number) => (
                      <div key={i} className="flex items-center justify-between border-b border-zinc-50 py-1 text-sm">
                        <span className="truncate text-zinc-600">{h.cidade}/{h.estado}</span>
                        <span className="font-black text-zinc-800">{h.leiloes} <span className="text-[10px] text-emerald-600">({h.arremates}✓)</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card title="Top vendedores" icon={<Store className="h-4 w-4 text-[#FF6A00]" />}>
                {((settle?.ranking_vendedores || []) as any[]).slice(0, 8).map((v: any, i: number) => (
                  <div key={i} className="flex items-center justify-between border-b border-zinc-50 py-1.5 text-sm">
                    <span className="font-mono text-[10px] text-zinc-500">{String(v.vendedor).slice(0, 8)}…</span>
                    <span className="font-black text-zinc-800">{v.arremates} · {brl(v.valor)}</span>
                  </div>
                ))}
                {!((settle?.ranking_vendedores || []) as any[]).length && <p className="py-3 text-center text-xs text-zinc-400">Sem arremates.</p>}
              </Card>
              <Card title="Maiores arremates" icon={<Trophy className="h-4 w-4 text-amber-500" />}>
                {((rk.maiores_arremates || []) as any[]).slice(0, 8).map((l: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-2 border-b border-zinc-50 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate text-zinc-700">{l.titulo}</span>
                    <span className="font-black text-emerald-600">{brl(l.valor)}</span>
                  </div>
                ))}
                {!((rk.maiores_arremates || []) as any[]).length && <p className="py-3 text-center text-xs text-zinc-400">Sem dados.</p>}
              </Card>
            </div>

            {/* ═══ DRILL-DOWN POR LEILÃO (Score AI-71 + Pricing/Simulador AI-73) ═══ */}
            <Card title="Análise por leilão — Score · Preço · Simulador" icon={<Gauge className="h-4 w-4 text-[#4338ca]" />}>
              <select
                value={sel} onChange={(e) => { setSel(e.target.value); setSim(null); }}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#4338ca]/40"
              >
                <option value="">Selecione um leilão…</option>
                {(listings as any[] ?? []).map((l: any) => (
                  <option key={l.id} value={l.id}>{l.title} · {l.city || "—"} · {brl(l.current_bid ?? l.starting_bid)}</option>
                ))}
              </select>

              {sel && (
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {/* Score AI-71 */}
                  <div className="rounded-2xl bg-slate-50 p-3">
                    {sf ? <Loader2 className="mx-auto my-6 h-6 w-6 animate-spin text-[#4338ca]" /> : score && !score.erro ? (
                      <>
                        <div className="flex items-center gap-3">
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4338ca] text-2xl font-black text-white">{score.score}</div>
                          <div>
                            <p className="text-sm font-black text-zinc-800">{score.label}</p>
                            <p className="text-xs text-zinc-500">Prob. venda {score.probabilidade_venda_pct}% · previsto {brl(score.valor_previsto)}</p>
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-5 gap-1 text-center">
                          {Object.entries(score.breakdown || {}).map(([kk, vv]: any) => (
                            <div key={kk} className="rounded-lg bg-white p-1"><p className="text-[8px] uppercase text-zinc-400">{kk.slice(0, 5)}</p><p className="text-xs font-black text-zinc-700">{String(vv)}</p></div>
                          ))}
                        </div>
                        {!!(score.sugestoes || []).length && (
                          <ul className="mt-2 space-y-0.5">
                            {(score.sugestoes as string[]).map((s, i) => <li key={i} className="flex items-start gap-1 text-[11px] text-zinc-500"><Flame className="mt-0.5 h-3 w-3 shrink-0 text-[#FF6A00]" />{s}</li>)}
                          </ul>
                        )}
                      </>
                    ) : <p className="py-6 text-center text-xs text-zinc-400">Sem score.</p>}
                  </div>

                  {/* Recomendação de preço AI-73 */}
                  <div className="rounded-2xl bg-slate-50 p-3">
                    {rec && !rec.erro ? (
                      <>
                        <p className="text-xs font-black uppercase tracking-wider text-zinc-500">Preço · valor de mercado {brl(rec.valor_mercado)}</p>
                        <div className="mt-1 grid grid-cols-4 gap-1 text-center">
                          <Stat l="Mín" v={brl(rec.faixa_recomendada?.minimo)} />
                          <Stat l="Ideal" v={brl(rec.faixa_recomendada?.ideal)} accent="text-emerald-600" />
                          <Stat l="Premium" v={brl(rec.faixa_recomendada?.premium)} />
                          <Stat l="Máx" v={brl(rec.faixa_recomendada?.maximo)} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-bold text-indigo-700">Competitividade: {rec.competitividade}</span>
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-700">{rec.situacao}</span>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-700">Início leilão: {brl(rec.preco_inicial_sugerido_leilao)}</span>
                        </div>
                      </>
                    ) : <p className="py-6 text-center text-xs text-zinc-400">Sem recomendação.</p>}
                  </div>
                </div>
              )}

              {/* Simulador */}
              {sel && (
                <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#4338ca]"><Calculator className="h-4 w-4" /> Simulador de cenário</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <input value={preco} onChange={(e) => setPreco(e.target.value)} type="number" placeholder="Preço inicial" className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm" />
                    <input value={reserva} onChange={(e) => setReserva(e.target.value)} type="number" placeholder="Reserva" className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm" />
                    <select value={dur} onChange={(e) => setDur(e.target.value)} className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm">
                      <option value="7">7 dias</option><option value="15">15 dias</option><option value="30">30 dias</option>
                    </select>
                    <button onClick={runSim} disabled={simLoading} className="rounded-lg bg-[#4338ca] px-3 py-1.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50">
                      {simLoading ? "…" : "Simular"}
                    </button>
                  </div>
                  {sim && !sim.erro && (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Stat l="Prob. venda" v={`${sim.probabilidade_venda_pct}%`} accent="text-emerald-600" />
                      <Stat l="Tempo est." v={`${sim.tempo_estimado_dias}d`} />
                      <Stat l="Receita esp." v={brl(sim.receita_esperada)} accent="text-[#4338ca]" />
                      <Stat l="Ranking" v={<span className="text-[11px]">{sim.impacto_ranking}</span>} />
                    </div>
                  )}
                  {sim?.erro && <p className="mt-2 text-xs text-red-500">{sim.erro}</p>}
                  <p className="mt-1.5 flex items-center gap-1 text-[10px] text-zinc-400"><ShieldAlert className="h-3 w-3" /> Heurística declarada — refina com histórico de vendas.</p>
                </div>
              )}
            </Card>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          ORION Auction Intelligence · consolida AI-65 (liquidação) · AI-67 (inteligência) · AI-71 (score) · AI-73 (pricing) · read-only
        </p>
      </div>
    </div>
  );
}
