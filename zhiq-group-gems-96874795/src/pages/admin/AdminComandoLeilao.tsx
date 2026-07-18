/**
 * /admin/comando-leilao — COMANDO LEILÃO · Auction Command Center
 *
 * Centro operacional do módulo de leilões. Agrega (read-only) os dados reais
 * (auction_listings/auction_bids) + a camada ORION (orion_auction_* — Fase 1:
 * encerramento/vencedor/comissão/auditoria) + encerramento automático (cron)
 * via a RPC auction_command_dashboard(). Fraude = AI-41 (declarado).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Gavel, Loader2, TrendingUp, Users, Timer, Trophy, MapPin, Store, Flame, ShieldAlert, Coins } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const brl = (v: any) => `R$ ${Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Kpi = ({ l, v }: { l: string; v: any }) => (
  <div className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
    <p className="truncate text-[10px] font-bold uppercase tracking-wider text-orange-200/70">{l}</p>
    <p className="text-lg font-black">{String(v ?? 0)}</p>
  </div>
);

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
    <h3 className="mb-2 text-sm font-black text-zinc-700">{title}</h3>
    {children}
  </div>
);

export default function AdminComandoLeilao() {
  const { data: dash, isLoading } = useQuery({
    queryKey: ["comando-leilao"], queryFn: () => rpc("auction_command_dashboard"), refetchInterval: 45000,
  });

  const s = dash?.stats || {};
  const ranking = dash?.ranking || {};
  const proximos = (s.proximos_encerramentos || []) as any[];
  const ultimosLeiloes = (dash?.ultimos_leiloes || []) as any[];
  const porTipo = (dash?.por_tipo || {}) as Record<string, number>;

  const kpis: [string, any][] = [
    ["Ativos", s.ativos], ["Encerrados", s.encerrados], ["Valor Movimentado", brl(s.valor_movimentado)],
    ["Lances", s.total_lances], ["Maior Lance", brl(s.maior_lance)], ["Usuários Ativos", s.usuarios_ativos],
    ["Taxa Conversão", `${s.taxa_conversao ?? 0}%`], ["Comissão (cr)", s.comissao_creditos],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#7a2e00] via-[#FF6A00] to-[#7a2e00] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Gavel className="h-8 w-8 text-orange-200" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">COMANDO LEILÃO</h1>
                <span className="rounded-full bg-orange-500/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ring-1 ring-orange-300/40">Command Center</span>
              </div>
              <p className="text-sm text-orange-100/80">
                Motor operacional do módulo de leilões · dados reais + ORION (encerramento/comissão/auditoria) · encerramento automático (cron 1/min)
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-orange-200/70">Leilões Ativos</p>
              <p className="text-3xl font-black">{s.ativos ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {kpis.map(([l, v]) => <Kpi key={l} l={l} v={v} />)}
          </div>
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-[#FF6A00]" /></div>}

        {!isLoading && (
          <div className="mt-6 space-y-4">
            {/* Duração + próximos */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Por duração (ativos)">
                <div className="grid grid-cols-3 gap-2">
                  {[["7 dias", s.ativos_7d], ["15 dias", s.ativos_15d], ["30 dias", s.ativos_30d]].map(([l, v]: any) => (
                    <div key={l} className="rounded-2xl bg-slate-50 p-3 text-center">
                      <p className="text-[10px] font-bold uppercase text-zinc-400">{l}</p>
                      <p className="text-xl font-black text-zinc-800">{String(v ?? 0)}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-orange-50 p-2 text-center">
                    <p className="text-[10px] font-bold uppercase text-orange-500">Encerrando hoje</p>
                    <p className="text-lg font-black text-orange-600">{s.encerrando_hoje ?? 0}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-2 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">Tempo médio restante</p>
                    <p className="text-lg font-black text-zinc-800">{s.tempo_medio_restante_horas ?? 0}h</p>
                  </div>
                </div>
              </Card>
              <Card title="Próximos encerramentos">
                {!proximos.length ? <p className="py-4 text-center text-sm text-zinc-400">Nenhum leilão ativo com data futura.</p> : (
                  <div className="space-y-1.5">
                    {proximos.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                        <span className="min-w-0 flex-1 truncate text-sm text-zinc-700">{p.titulo}</span>
                        <span className="flex items-center gap-1 text-[11px] font-bold text-orange-600"><Timer className="h-3 w-3" />{String(p.fim).replace("T", " ").slice(0, 16)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Financeiro + tipos */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card title="Financeiro (créditos)">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-emerald-50 p-3 text-center"><p className="text-[10px] font-bold uppercase text-emerald-500">Receita</p><p className="text-xl font-black text-emerald-600 flex items-center justify-center gap-1"><Coins className="h-4 w-4" />{s.receita_creditos ?? 0}</p></div>
                  <div className="rounded-2xl bg-slate-50 p-3 text-center"><p className="text-[10px] font-bold uppercase text-zinc-400">Comissão</p><p className="text-xl font-black text-zinc-800">{s.comissao_creditos ?? 0}</p></div>
                </div>
                <p className="mt-2 flex items-center gap-1 text-[10px] text-zinc-400"><ShieldAlert className="h-3 w-3" /> {s.nota_fraude}</p>
              </Card>
              <Card title="Por tipo">
                <div className="flex flex-wrap gap-1">
                  {Object.entries(porTipo).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{k}: {String(v)}</span>
                  ))}
                  {!Object.keys(porTipo).length && <span className="text-[11px] text-zinc-400">Sem leilões.</span>}
                </div>
              </Card>
              <Card title="Conversão">
                <div className="text-center py-2">
                  <p className="text-4xl font-black text-[#FF6A00]">{s.taxa_conversao ?? 0}%</p>
                  <p className="text-[11px] text-zinc-400 mt-1">{s.com_vencedor ?? 0} com vencedor / {s.encerrados ?? 0} encerrados</p>
                </div>
              </Card>
            </div>

            {/* Rankings */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card title="Top cidades">
                {((ranking.top_cidades || []) as any[]).slice(0, 8).map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between border-b border-zinc-50 py-1.5 text-sm">
                    <span className="flex items-center gap-1 text-zinc-700"><MapPin className="h-3 w-3 text-emerald-500" />{c.cidade}</span>
                    <span className="font-black text-zinc-800">{c.leiloes}</span>
                  </div>
                ))}
                {!((ranking.top_cidades || []) as any[]).length && <p className="py-3 text-center text-xs text-zinc-400">Sem dados.</p>}
              </Card>
              <Card title="Top vendedores">
                {((ranking.top_vendedores || []) as any[]).slice(0, 8).map((v: any, i: number) => (
                  <div key={i} className="flex items-center justify-between border-b border-zinc-50 py-1.5 text-sm">
                    <span className="flex items-center gap-1 text-zinc-600 truncate"><Store className="h-3 w-3 text-[#FF6A00]" /><span className="font-mono text-[10px]">{String(v.vendedor).slice(0, 8)}…</span></span>
                    <span className="font-black text-zinc-800">{v.leiloes}</span>
                  </div>
                ))}
                {!((ranking.top_vendedores || []) as any[]).length && <p className="py-3 text-center text-xs text-zinc-400">Sem dados.</p>}
              </Card>
              <Card title="Top leilões (lances)">
                {((ranking.top_leiloes || []) as any[]).slice(0, 8).map((l: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-2 border-b border-zinc-50 py-1.5 text-sm">
                    <span className="min-w-0 flex-1 truncate text-zinc-700">{l.titulo}</span>
                    <span className="flex items-center gap-1 font-black text-zinc-800"><Flame className="h-3 w-3 text-orange-500" />{l.lances || 0}</span>
                  </div>
                ))}
                {!((ranking.top_leiloes || []) as any[]).length && <p className="py-3 text-center text-xs text-zinc-400">Sem dados.</p>}
              </Card>
            </div>

            {/* Últimos leilões */}
            <Card title="Últimos leilões">
              {!ultimosLeiloes.length ? <p className="py-4 text-center text-sm text-zinc-400">Nenhum leilão.</p> : (
                <div className="space-y-1.5">
                  {ultimosLeiloes.map((l: any) => (
                    <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-zinc-700">{l.titulo}</span>
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-white">{l.status}</span>
                      <span className="text-[11px] font-black text-emerald-600">{brl(l.valor_atual)}</span>
                      <span className="flex items-center gap-1 text-[10px] text-zinc-400"><Gavel className="h-3 w-3" />{l.lances || 0}</span>
                      {l.cidade && <span className="flex items-center gap-1 text-[10px] text-zinc-400"><MapPin className="h-3 w-3" />{l.cidade}</span>}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          COMANDO LEILÃO v1.0 · Auction Command Center · dados reais + motor ORION (orion_auction_*) · encerramento automático 1/min · fraude via AI-41 · read-only
        </p>
      </div>
    </div>
  );
}
