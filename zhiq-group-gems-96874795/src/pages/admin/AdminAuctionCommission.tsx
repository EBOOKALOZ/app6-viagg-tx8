/**
 * /admin/leilao-comissoes — COMANDO LEILÃO · Comissões (motor 6%)
 *
 * Comissão de 6% sobre o arremate → convertida em créditos (R$0,30) →
 * debitada do lojista → libera o contato do comprador. Sem saldo =>
 * aguardando (abre Novo Pacote); após pagar => libera. Cobra SÓ quando há
 * vencedor. Comissão congelada no valor oficial (não muda em renegociação).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Gavel, Loader2, CircleDollarSign, Clock, CheckCircle2, RefreshCw } from "lucide-react";

const rpc = async (fn: string, args?: Record<string, unknown>) => {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};
const brl = (v: any) => `R$ ${Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AdminAuctionCommission() {
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState("");

  const { data: dash, isLoading, refetch } = useQuery({
    queryKey: ["auction-commission"], queryFn: () => rpc("orion_auction_commission_dashboard"), refetchInterval: 60000,
  });
  const cfg = dash?.config || {};
  const t = dash?.totais || {};
  const recentes = (dash?.recentes || []) as any[];
  const leiloes = (dash?.leiloes || []) as any[];

  const cobrarPendentes = async () => {
    setOcupado(true); setMsg("");
    try { await rpc("orion_auction_commission_tick"); setMsg("✓ Varredura executada (leilões encerrados com vencedor)."); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); } finally { setOcupado(false); }
  };
  const reprocessar = async (listing: string) => {
    setOcupado(true); setMsg("");
    try { const r = await rpc("orion_auction_release_after_payment", { p_listing: listing }); setMsg(`✓ ${listing.slice(0, 8)}…: ${r.status}${r.contato_liberado ? " · contato liberado" : ""}`); refetch(); }
    catch (e: any) { setMsg(`Erro: ${e.message}`); } finally { setOcupado(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-zinc-900">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
        <div className="rounded-3xl bg-gradient-to-r from-[#1a1305] via-[#a16207] to-[#1a1305] p-6 text-white shadow-xl">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Gavel className="h-8 w-8 text-amber-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">Comando Leilão · Comissões</h1>
                <span className="rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ring-1 ring-amber-300/40">6%</span>
              </div>
              <p className="text-sm text-amber-200/80">
                Comissão só quando há vencedor · {cfg.pct ?? 6}% do arremate → créditos (R$ {Number(cfg.credit_ref_brl ?? 0.30).toFixed(2)}/crédito) · libera o contato
                {dash?.atualizado_em ? ` · ${dash.atualizado_em}` : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center ring-1 ring-white/20">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200/70">Comissão paga (total)</p>
              <p className="text-2xl font-black">{brl(t.comissao_brl_total)}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[["Leilões ativos", t.leiloes_ativos], ["Comissão projetada", brl(t.comissao_projetada_ativos_brl)],
              ["Comissões pagas", t.pagas], ["Aguardando", t.aguardando],
              ["Contatos liberados", t.contatos_liberados], ["Pendente (R$)", brl(t.comissao_brl_pendente)]].map(([l, v]: any) => (
              <div key={l} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-amber-200/70">{l}</p>
                <p className="text-lg font-black">{String(v ?? 0)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <button onClick={cobrarPendentes} disabled={ocupado}
            className="flex items-center gap-2 rounded-full bg-amber-700 px-4 py-2 text-sm font-black text-white shadow hover:bg-amber-800 disabled:opacity-50">
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Varrer encerrados
          </button>
          <span className="text-[12px] text-zinc-500">O tick automático (a cada 5 min) já faz isso — este botão força agora.</span>
        </div>
        {msg && <p className="mt-2 text-[12px] font-bold text-zinc-600">{msg}</p>}

        {/* LEILÕES AO VIVO — comissão projetada (6% do lance atual), mesmo antes de encerrar */}
        {!isLoading && leiloes.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-black text-zinc-700">Leilões (ao vivo) · comissão projetada</h3>
            <div className="space-y-2">
              {leiloes.map((l: any) => (
                <div key={l.listing_id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${l.encerrado ? (l.tem_vencedor ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500") : "bg-sky-100 text-sky-700"}`}>
                    {l.encerrado ? (l.tem_vencedor ? "encerrado c/ vencedor" : "encerrado s/ vencedor") : "ativo"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-700">{l.titulo || "(sem título)"}</span>
                  {l.city && <span className="text-[10px] text-zinc-400">{l.city}</span>}
                  <span className="text-sm text-zinc-500">lance <b className="text-zinc-700">{brl(l.arremate_brl)}</b></span>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-700">
                    6% → {brl(l.comissao_projetada_brl)} · {l.creditos_projetados} cr
                  </span>
                  {l.comissao_status && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${l.comissao_status === "paga" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      comissão {l.comissao_status}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-zinc-400">Projeção = 6% do lance atual. Vira comissão REAL só quando o leilão encerra com vencedor (o tick a cada 5 min cobra automaticamente).</p>
          </div>
        )}

        {isLoading ? <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-amber-600" /></div> : (
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-black text-zinc-700">Comissões cobradas</h3>
            {!recentes.length ? (
              <div className="rounded-3xl border border-zinc-100 bg-white p-8 text-center text-sm text-zinc-400 shadow-sm">
                Nenhuma comissão cobrada ainda. Elas nascem quando um leilão encerra com vencedor.
              </div>
            ) : recentes.map((c: any) => (
              <div key={c.listing_id} className="rounded-2xl border border-zinc-100 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {c.status === "paga"
                    ? <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700"><CheckCircle2 className="h-3 w-3" /> paga</span>
                    : <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700"><Clock className="h-3 w-3" /> aguardando</span>}
                  {c.contato_liberado && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-black text-sky-700">contato liberado</span>}
                  <span className="font-mono text-[11px] text-zinc-400">{String(c.listing_id).slice(0, 8)}…</span>
                  <span className="ml-auto flex items-center gap-3 text-sm">
                    <span className="text-zinc-500">arremate <b className="text-zinc-700">{brl(c.arremate_brl)}</b></span>
                    <span className="flex items-center gap-1 font-black text-amber-700"><CircleDollarSign className="h-3.5 w-3.5" /> {brl(c.comissao_brl)}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500">{c.creditos_debitados || c.creditos_devidos} cr</span>
                  </span>
                </div>
                {c.status === "aguardando_pagamento" && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[11px] text-amber-600">Lojista sem saldo — abrir Novo Pacote. Após creditar, reprocessar p/ liberar o contato:</span>
                    <button onClick={() => reprocessar(c.listing_id)} disabled={ocupado}
                      className="rounded-full bg-amber-600 px-2.5 py-1 text-[10px] font-black text-white disabled:opacity-50">Reprocessar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-center text-[11px] text-zinc-300">
          COMANDO LEILÃO · Comissão 6% · cobra só no vencedor · vendedor paga em créditos (R$0,30) p/ liberar contato · valor congelado no arremate oficial ·
          idempotente (sem cobrança dupla) · ledger imutável · reusa orion_auction_charge · tick 5 min · suite orion_auction_commission_selftest (COMANDO TESTE)
        </p>
      </div>
    </div>
  );
}
