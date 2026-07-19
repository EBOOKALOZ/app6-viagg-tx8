/**
 * /admin/orion-auction-lifecycle — ORION-AI-66 · Auction Lifecycle & Reputation
 *
 * Ciclo de vida PÓS-ARREMATE (read-only): negociações do vencedor até o
 * encerramento — status, confirmações, avaliações, disputas, reputação e
 * Trust Score determinístico. Agrega via a RPC orion_alc_dashboard().
 * Recomenda-nunca-executa · dados reais + evidência.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  HeartHandshake, Loader2, Trophy, Timer, CheckCircle2, XCircle,
  ShieldAlert, Coins, MapPin, Store,
} from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};

const brl = (v: any) => `R$ ${Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const uid = (v: any) => (v ? `${String(v).slice(0, 8)}…` : "—");

const STATUS_LABEL: Record<string, string> = {
  aguardando_contato: "Aguardando contato",
  contato_realizado: "Contato realizado",
  em_andamento: "Em andamento",
  pagamento_combinado: "Pagamento combinado",
  entregue: "Entregue",
  servico_executado: "Serviço executado",
  concluida: "Concluída",
  cancelada: "Cancelada",
  em_disputa: "Em disputa",
};

const Kpi = ({ l, v }: { l: string; v: any }) => (
  <div className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
    <p className="truncate text-[10px] font-bold uppercase tracking-wider text-emerald-200/70">{l}</p>
    <p className="text-lg font-black">{String(v ?? 0)}</p>
  </div>
);

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-3xl border border-zinc-100 bg-white p-4 shadow-sm">
    <h3 className="mb-2 text-sm font-black text-zinc-700">{title}</h3>
    {children}
  </div>
);

export default function AdminOrionAuctionLifecycle() {
  const { data: dash, isLoading } = useQuery({
    queryKey: ["orion-alc-dashboard"],
    queryFn: () => rpc("orion_alc_dashboard"),
    refetchInterval: 45000,
  });

  const m = dash?.metrics || {};
  const rankV = (dash?.ranking_vendedores || []) as any[];
  const rankC = (dash?.ranking_compradores || []) as any[];
  const andamento = (dash?.em_andamento || []) as any[];
  const porStatus = (dash?.por_status || {}) as Record<string, number>;
  const receitaCat = (m.receita_por_categoria || {}) as Record<string, number>;
  const receitaReg = (m.receita_por_regiao || {}) as Record<string, number>;

  const kpis: [string, any][] = [
    ["Total", m.total], ["Em andamento", m.em_andamento], ["Concluídas", m.concluidas],
    ["Canceladas", m.canceladas], ["Em disputa", m.em_disputa], ["Taxa sucesso", `${m.taxa_sucesso ?? 0}%`],
    ["Satisfação", `${m.indice_satisfacao ?? 0}★`], ["Movimentado", brl(m.valor_movimentado)],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
        {/* HEADER */}
        <div className="rounded-3xl bg-gradient-to-r from-[#065f46] via-[#10b981] to-[#065f46] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <HeartHandshake className="h-8 w-8 text-emerald-100" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">Auction Lifecycle & Reputation</h1>
                <span className="rounded-full bg-emerald-500/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ring-1 ring-emerald-300/40">AI-66</span>
              </div>
              <p className="text-sm text-emerald-100/80">
                Pós-arremate · negociação → conclusão · reputação, Trust Score e disputas · recomenda-nunca-executa
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/70">Disputas abertas</p>
              <p className="text-3xl font-black">{dash?.disputas_abertas ?? "—"}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {kpis.map(([l, v]) => <Kpi key={l} l={l} v={v} />)}
          </div>
        </div>

        {isLoading && <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>}

        {!isLoading && (
          <div className="mt-6 space-y-4">
            {/* Tempos + status */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Tempos médios">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">1º contato</p>
                    <p className="text-xl font-black text-zinc-800">{m.tempo_medio_1o_contato_h ?? 0}h</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-bold uppercase text-zinc-400">Conclusão</p>
                    <p className="text-xl font-black text-zinc-800">{m.tempo_medio_conclusao_h ?? 0}h</p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-emerald-50 p-2 text-center">
                    <p className="text-[10px] font-bold uppercase text-emerald-500">Taxa sucesso</p>
                    <p className="text-lg font-black text-emerald-600 flex items-center justify-center gap-1"><CheckCircle2 className="h-4 w-4" />{m.taxa_sucesso ?? 0}%</p>
                  </div>
                  <div className="rounded-2xl bg-red-50 p-2 text-center">
                    <p className="text-[10px] font-bold uppercase text-red-400">Cancelamento</p>
                    <p className="text-lg font-black text-red-500 flex items-center justify-center gap-1"><XCircle className="h-4 w-4" />{m.taxa_cancelamento ?? 0}%</p>
                  </div>
                </div>
              </Card>
              <Card title="Por status">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(porStatus).length === 0 && <span className="text-[11px] text-zinc-400">Sem negociações.</span>}
                  {Object.entries(porStatus).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                      {STATUS_LABEL[k] || k}: <b className="text-zinc-800">{String(v)}</b>
                    </span>
                  ))}
                </div>
              </Card>
            </div>

            {/* Receita */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Receita por categoria">
                {Object.entries(receitaCat).length === 0 ? <p className="py-3 text-center text-xs text-zinc-400">Sem receita concluída.</p> : (
                  <div className="space-y-1.5">
                    {Object.entries(receitaCat).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between border-b border-zinc-50 py-1.5 text-sm">
                        <span className="flex items-center gap-1 text-zinc-600"><Coins className="h-3 w-3 text-emerald-500" />{k}</span>
                        <span className="font-black text-emerald-600">{brl(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              <Card title="Receita por região">
                {Object.entries(receitaReg).length === 0 ? <p className="py-3 text-center text-xs text-zinc-400">Sem receita concluída.</p> : (
                  <div className="space-y-1.5">
                    {Object.entries(receitaReg).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between border-b border-zinc-50 py-1.5 text-sm">
                        <span className="flex items-center gap-1 text-zinc-600"><MapPin className="h-3 w-3 text-blue-500" />{k}</span>
                        <span className="font-black text-zinc-800">{brl(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Rankings */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card title="Top vendedores">
                {rankV.length === 0 ? <p className="py-3 text-center text-xs text-zinc-400">Sem dados.</p> : rankV.slice(0, 10).map((v, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-zinc-50 py-1.5 text-sm">
                    <span className="flex items-center gap-1 text-zinc-600"><Store className="h-3 w-3 text-emerald-500" /><span className="font-mono text-[10px]">{uid(v.user_id)}</span></span>
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] text-emerald-600 font-bold">{v.concluidas} concl.</span>
                      <span className="text-[11px] text-zinc-400">{brl(v.valor)}</span>
                      <span className="font-black text-zinc-800">{v.deals}</span>
                    </span>
                  </div>
                ))}
              </Card>
              <Card title="Top compradores">
                {rankC.length === 0 ? <p className="py-3 text-center text-xs text-zinc-400">Sem dados.</p> : rankC.slice(0, 10).map((c, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-zinc-50 py-1.5 text-sm">
                    <span className="flex items-center gap-1 text-zinc-600"><Trophy className="h-3 w-3 text-amber-500" /><span className="font-mono text-[10px]">{uid(c.user_id)}</span></span>
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] text-emerald-600 font-bold">{c.concluidas} concl.</span>
                      <span className="font-black text-zinc-800">{c.deals}</span>
                    </span>
                  </div>
                ))}
              </Card>
            </div>

            {/* Em andamento */}
            <Card title="Negociações em andamento">
              {andamento.length === 0 ? <p className="py-4 text-center text-sm text-zinc-400">Nenhuma negociação em andamento.</p> : (
                <div className="space-y-1.5">
                  {andamento.map((d: any) => (
                    <div key={d.deal_id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                      <span className="rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-bold text-white">{STATUS_LABEL[d.status] || d.status}</span>
                      <span className="text-[11px] font-black text-emerald-700">{brl(d.amount)}</span>
                      {d.cidade && <span className="flex items-center gap-1 text-[10px] text-zinc-400"><MapPin className="h-3 w-3" />{d.cidade}</span>}
                      <span className="flex items-center gap-1 text-[10px] text-zinc-400"><Timer className="h-3 w-3" />{String(d.desde).replace("T", " ").slice(0, 16)}</span>
                      <span className="ml-auto font-mono text-[10px] text-zinc-400">deal {uid(d.deal_id)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-[11px] text-zinc-300">
          <ShieldAlert className="h-3 w-3" />
          ORION-AI-66 · Auction Lifecycle & Reputation v1.0 · orion_alc_* · reputação + Trust Score determinístico · emite p/ AI-20 Trust · read-only
        </p>
      </div>
    </div>
  );
}
