/**
 * MerchantArrematesPanel — 🏆 Centro operacional do PÓS-ARREMATE (vendedor).
 *
 * Leilões encerrados com vencedor viram "deals" (orion_alc_deals). Aqui o vendedor
 * acompanha cada um: contato → pagamento → envio → entrega → concluído, com timeline,
 * financeiro (comissão/líquido de orion_auction_settlements), chat e ações — TODAS
 * via RPC oficial do backend (nenhuma regra financeira no front). Realtime nos deals.
 *
 * NÃO substitui "Leilões" (anúncios em andamento) nem a página de ofertas.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Trophy, Search, RefreshCw, Loader2, TrendingUp, DollarSign, Package,
  CheckCircle2, XCircle, Users, MapPin, Clock, MessageSquare, Truck,
  AlertTriangle, Send, ChevronRight, Wallet, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CardDark, CardInfo, DarkBadge } from "@/components/ui/dark-card";
import { CreateArremateModal } from "@/components/merchant/CreateArremateModal";
import {
  useMerchantArremateDeals, useArremateKpis, useArremateSettlement, runDealAction,
  STATUS_META, TIMELINE_ORDER, type ArremateDeal, type AlcStatus,
} from "@/hooks/useMerchantArremateDeals";

function brl(v: number | null | undefined) {
  return `R$ ${Number(v ?? 0).toFixed(2).replace(".", ",")}`;
}
function maskBuyer(id: string | null) {
  if (!id) return "Comprador —";
  return "Comprador " + id.slice(0, 4).toUpperCase();
}

const FILTERS: { key: string; label: string; match: (s: AlcStatus) => boolean }[] = [
  { key: "all", label: "Todos", match: () => true },
  { key: "aguardando", label: "Aguardando", match: (s) => s === "aguardando_contato" },
  { key: "andamento", label: "Em andamento", match: (s) => ["contato_realizado", "em_andamento", "pagamento_combinado"].includes(s) },
  { key: "transporte", label: "Envio/Entrega", match: (s) => ["entregue", "servico_executado"].includes(s) },
  { key: "concluidos", label: "Concluídos", match: (s) => s === "concluida" },
  { key: "disputa", label: "Disputa", match: (s) => s === "em_disputa" },
  { key: "cancelados", label: "Cancelados", match: (s) => s === "cancelada" },
];

// ── Linha do tempo do processo ──
function Timeline({ status }: { status: AlcStatus }) {
  const cancelled = status === "cancelada";
  const disputed = status === "em_disputa";
  const idx = TIMELINE_ORDER.indexOf(status);
  return (
    <div className="flex items-center gap-1">
      {TIMELINE_ORDER.map((st, i) => {
        const done = idx >= 0 && i <= idx;
        return (
          <div key={st} className="flex items-center gap-1 flex-1">
            <div className={cn(
              "h-1.5 flex-1 rounded-full",
              cancelled ? "bg-red-500/30" : disputed ? "bg-orange-500/40" : done ? "bg-emerald-400" : "bg-[#323A45]"
            )} />
          </div>
        );
      })}
    </div>
  );
}

// ── Ações por status (todas via RPC oficial) ──
function DealActions({ deal, onDone }: { deal: ArremateDeal; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (label: string, fn: string, args: Record<string, unknown>, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(fn);
    const r = await runDealAction(fn, args);
    setBusy(null);
    if (!r.ok) { toast.error(`Não foi possível ${label.toLowerCase()}: ${r.error}`); return; }
    toast.success(`${label} ✓`);
    onDone();
  };

  const lid = deal.listing_id;
  const s = deal.status;
  const btn = "flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50";

  return (
    <div className="grid grid-cols-2 gap-2">
      {s === "aguardando_contato" && (
        <button disabled={!!busy} onClick={() => run("Liberar comprador", "arremate_release_contact", { p_listing_id: lid })}
          className={cn(btn, "col-span-2 bg-[#FF7A00] hover:bg-[#FF8E1F] text-white")}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />} Liberar comprador
        </button>
      )}
      {["contato_realizado", "em_andamento"].includes(s) && (
        <button disabled={!!busy} onClick={() => run("Confirmar pagamento", "arremate_seller_confirmar_pagamento", { p_listing_id: lid })}
          className={cn(btn, "bg-violet-500/15 border border-violet-500/40 text-violet-300 hover:bg-violet-500/25")}>
          {busy === "arremate_seller_confirmar_pagamento" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DollarSign className="h-3.5 w-3.5" />} Confirmar pagamento
        </button>
      )}
      {["pagamento_combinado", "em_andamento"].includes(s) && (
        <button disabled={!!busy} onClick={() => run("Marcar como enviado", "arremate_seller_enviar", { p_listing_id: lid })}
          className={cn(btn, "bg-teal-500/15 border border-teal-500/40 text-teal-300 hover:bg-teal-500/25")}>
          {busy === "arremate_seller_enviar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />} Enviar produto
        </button>
      )}
      {["entregue", "servico_executado"].includes(s) && (
        <button disabled={!!busy} onClick={() => run("Concluir", "arremate_concluir", { p_listing_id: lid }, "Confirmar conclusão deste arremate?")}
          className={cn(btn, "bg-emerald-600/20 border border-emerald-600/50 text-emerald-300 hover:bg-emerald-600/30")}>
          {busy === "arremate_concluir" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Concluir
        </button>
      )}
      {!["concluida", "cancelada", "em_disputa"].includes(s) && (
        <>
          <button disabled={!!busy}
            onClick={() => { const m = window.prompt("Descreva o motivo da disputa:"); if (m) run("Abrir disputa", "arremate_abrir_disputa", { p_listing_id: lid, p_motivo: m }); }}
            className={cn(btn, "bg-orange-500/15 border border-orange-500/40 text-orange-400 hover:bg-orange-500/25")}>
            <AlertTriangle className="h-3.5 w-3.5" /> Disputa
          </button>
          <button disabled={!!busy}
            onClick={() => { const m = window.prompt("Motivo do cancelamento (opcional):") ?? undefined; run("Cancelar", "arremate_cancelar", { p_listing_id: lid, p_motivo: m }, "Cancelar este arremate?"); }}
            className={cn(btn, "bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20")}>
            <XCircle className="h-3.5 w-3.5" /> Cancelar
          </button>
        </>
      )}
    </div>
  );
}

// ── Chat inline (histórico via arremate_list_messages, envio via arremate_send_message) ──
function DealChat({ listingId, onClose }: { listingId: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [msgs, setMsgs] = useState<any[] | null>(null);

  const load = async () => {
    const r = await runDealAction("arremate_list_messages", { p_listing_id: listingId });
    if (r.ok) setMsgs(Array.isArray(r.data) ? r.data : []);
  };
  useEffect(() => { load(); /* on mount */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    const r = await runDealAction("arremate_send_message", { p_listing_id: listingId, p_body: text.trim() });
    setSending(false);
    if (!r.ok) { toast.error("Não foi possível enviar: " + r.error); return; }
    setText("");
    load();
  };

  return (
    <CardInfo className="mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-black text-[#B8C2CC] uppercase tracking-wider">
          <MessageSquare className="h-3.5 w-3.5 text-[#00C58E]" /> Conversa
        </span>
        <button onClick={onClose} className="text-[10px] text-[#8E98A3] hover:text-white">fechar</button>
      </div>
      <div className="max-h-40 overflow-y-auto space-y-1.5">
        {msgs === null ? <Loader2 className="h-4 w-4 animate-spin text-[#8E98A3]" />
          : msgs.length === 0 ? <p className="text-[11px] text-[#8E98A3]">Sem mensagens ainda.</p>
          : msgs.map((m: any) => (
            <div key={m.id} className="rounded-lg bg-[#1A1F24] px-2.5 py-1.5">
              <p className="text-[9px] font-bold text-[#8E98A3] uppercase">{m.sender_party || "—"}</p>
              <p className="text-[12px] text-[#B8C2CC]">{m.body}</p>
            </div>
          ))}
      </div>
      <div className="flex gap-1.5">
        <input value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Escreva uma mensagem…"
          className="flex-1 h-9 px-3 rounded-lg bg-[#1A1F24] border border-[#323A45] text-[12px] text-white placeholder:text-[#8E98A3] outline-none focus:border-[#00C58E]/50" />
        <button onClick={send} disabled={sending || !text.trim()}
          className="h-9 w-9 flex items-center justify-center rounded-lg bg-[#00C58E] text-white disabled:opacity-50">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </CardInfo>
  );
}

// ── Card de deal ──
function DealCard({ deal, onRefresh }: { deal: ArremateDeal; onRefresh: () => void }) {
  const [chatOpen, setChatOpen] = useState(false);
  const meta = STATUS_META[deal.status];
  const { data: settle } = useArremateSettlement(deal.listing_id);
  const valorFinal = settle?.valor_final ?? deal.amount;
  const valorInicial = settle?.valor_inicial ?? null;
  const economia = valorInicial && valorFinal && valorInicial > valorFinal
    ? Math.round(((valorInicial - valorFinal) / valorInicial) * 100) : null;

  return (
    <CardDark className="p-4 space-y-3">
      {/* header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black text-[#8E98A3] uppercase tracking-widest">
            {deal.category || deal.listing_type || "Arremate"}
          </p>
          <p className="text-sm font-black text-white truncate">{maskBuyer(deal.buyer_user_id)}</p>
          <p className="flex items-center gap-1 text-[10px] text-[#8E98A3] mt-0.5">
            <Clock className="h-3 w-3" /> {new Date(deal.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            {deal.city && <><MapPin className="h-3 w-3 ml-1 text-[#00C58E]" /> {deal.city}</>}
          </p>
        </div>
        <DarkBadge tone={meta.dot.includes("red") ? "red" : meta.dot.includes("amber") || meta.dot.includes("orange") ? "orange" : meta.dot.includes("emerald") || meta.dot.includes("teal") ? "green" : "gray"}>
          {meta.emoji} {meta.label}
        </DarkBadge>
      </div>

      <Timeline status={deal.status} />

      {/* financeiro — SEMPRE do backend (orion_auction_settlements) */}
      <div className="grid grid-cols-3 gap-2">
        <CardInfo className="p-2.5">
          <p className="text-[9px] font-black text-[#8E98A3] uppercase">Arrematado</p>
          <p className="text-base font-black text-[#FF7A00]">{brl(valorFinal)}</p>
          {economia != null && <p className="text-[9px] text-emerald-400 font-bold">−{economia}% do inicial</p>}
        </CardInfo>
        <CardInfo className="p-2.5">
          <p className="text-[9px] font-black text-[#8E98A3] uppercase">Comissão</p>
          <p className="text-base font-black text-white">{settle?.comissao_valor != null ? brl(settle.comissao_valor) : "—"}</p>
          {settle?.comissao_pct != null && <p className="text-[9px] text-[#8E98A3]">{settle.comissao_pct}%</p>}
        </CardInfo>
        <CardInfo className="p-2.5">
          <p className="text-[9px] font-black text-[#8E98A3] uppercase">Líquido</p>
          <p className="text-base font-black text-[#00C58E]">{settle?.valor_liquido != null ? brl(settle.valor_liquido) : "—"}</p>
          {settle?.status && <p className="text-[9px] text-[#8E98A3]">{settle.status}</p>}
        </CardInfo>
      </div>

      <DealActions deal={deal} onDone={onRefresh} />

      <button onClick={() => setChatOpen(v => !v)}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white/5 border border-[#323A45] text-[10px] font-bold text-[#B8C2CC] hover:bg-white/10">
        <MessageSquare className="h-3.5 w-3.5 text-[#00C58E]" /> {chatOpen ? "Fechar conversa" : "Abrir conversa"}
      </button>
      {chatOpen && <DealChat listingId={deal.listing_id} onClose={() => setChatOpen(false)} />}
    </CardDark>
  );
}

export default function MerchantArrematesPanel() {
  const { data: deals, isLoading, refetch, isRefetching } = useMerchantArremateDeals();
  const kpis = useArremateKpis(deals);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const f = FILTERS.find(x => x.key === filter)!;
    let list = (deals || []).filter(d => f.match(d.status));
    const t = q.trim().toLowerCase();
    if (t) list = list.filter(d =>
      [d.city, d.category, d.listing_type, maskBuyer(d.buyer_user_id), d.status, d.id].filter(Boolean)
        .some(v => String(v).toLowerCase().includes(t)));
    return list;
  }, [deals, filter, q]);

  const KPIS = [
    { icon: Trophy, label: "Arremates", value: String(kpis.total), color: "text-[#FF7A00]" },
    { icon: DollarSign, label: "Valor total", value: brl(kpis.valorTotal), color: "text-[#00C58E]" },
    { icon: TrendingUp, label: "Ticket médio", value: brl(kpis.ticketMedio), color: "text-sky-400" },
    { icon: CheckCircle2, label: "Concluídos", value: String(kpis.entregues), color: "text-emerald-400" },
    { icon: XCircle, label: "Cancelados", value: String(kpis.cancelados), color: "text-red-400" },
    { icon: Users, label: "Conversão", value: `${kpis.conversao}%`, color: "text-violet-400" },
  ];

  return (
    <div className="px-4 pt-4 pb-28 lg:px-8 max-w-6xl w-full mx-auto space-y-5">
      {/* HEADER */}
      <div className="flex items-center justify-between bg-[#1A1F24] border border-[#323A45] p-5 rounded-3xl shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF7A00] to-[#FF8E1F] flex items-center justify-center shadow-lg shadow-[#FF7A00]/20">
            <Trophy className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white uppercase tracking-tight">🏆 Arremates</h1>
            <p className="text-xs font-bold text-[#8E98A3]">Centro operacional dos leilões arrematados</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-[#FF7A00] hover:bg-[#FF8E1F] text-white text-[11px] font-black uppercase tracking-wider shadow-lg shadow-[#FF7A00]/20 transition-all">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Novo arremate</span>
          </button>
          <button onClick={() => refetch()} disabled={isRefetching}
            className="p-3 rounded-2xl bg-[#252B33] border border-[#323A45] hover:border-[#FF7A00]/40 transition-all">
            <RefreshCw className={cn("h-5 w-5 text-[#8E98A3]", isRefetching && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {KPIS.map(({ icon: Icon, label, value, color }) => (
          <CardInfo key={label} className="flex items-center gap-3">
            <Icon className={cn("h-5 w-5 shrink-0", color)} />
            <div className="min-w-0">
              <p className={cn("text-lg font-black leading-none", color)}>{value}</p>
              <p className="text-[9px] font-black text-[#8E98A3] uppercase tracking-widest truncate">{label}</p>
            </div>
          </CardInfo>
        ))}
      </div>

      {/* FILTROS + BUSCA */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8E98A3]" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar por produto, comprador, cidade, status…"
            className="w-full h-11 pl-10 pr-4 rounded-2xl bg-[#1A1F24] border border-[#323A45] text-white text-sm placeholder:text-[#8E98A3] outline-none focus:border-[#FF7A00]/50" />
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {FILTERS.map(f => {
          const n = (deals || []).filter(d => f.match(d.status)).length;
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={cn(
                "shrink-0 px-3 py-2 rounded-xl font-black text-[11px] uppercase tracking-wider transition-all flex items-center gap-1.5",
                filter === f.key ? "bg-[#FF7A00] text-white" : "bg-[#1A1F24] border border-[#323A45] text-[#8E98A3] hover:border-[#FF7A00]/40"
              )}>
              {f.label} {n > 0 && <span className="text-[9px] opacity-80">({n})</span>}
            </button>
          );
        })}
      </div>

      {/* LISTA */}
      {isLoading ? (
        <div className="flex flex-col items-center py-20"><Loader2 className="h-10 w-10 animate-spin text-[#FF7A00]" /><p className="text-xs font-bold text-[#8E98A3] mt-3 uppercase tracking-widest">Carregando arremates…</p></div>
      ) : filtered.length === 0 ? (
        <CardDark className="flex flex-col items-center py-16">
          <Trophy className="h-14 w-14 text-[#FF7A00]/20 mb-3" />
          <p className="text-base font-black text-white uppercase">Nenhum arremate {filter !== "all" ? "neste filtro" : "ainda"}</p>
          <p className="text-sm font-bold text-[#8E98A3] mt-1 text-center max-w-sm">
            Quando um leilão seu encerrar com vencedor, ele aparece aqui para você acompanhar o pós-arremate.
          </p>
          <button onClick={() => setCreateOpen(true)}
            className="mt-5 flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#FF7A00] hover:bg-[#FF8E1F] text-white text-[11px] font-black uppercase tracking-wider shadow-lg shadow-[#FF7A00]/20 transition-all">
            <Plus className="h-4 w-4" /> Colocar produto em arremate
          </button>
        </CardDark>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(d => <DealCard key={d.id} deal={d} onRefresh={refetch} />)}
        </div>
      )}

      {createOpen && <CreateArremateModal open={createOpen} onOpenChange={setCreateOpen} />}
    </div>
  );
}
