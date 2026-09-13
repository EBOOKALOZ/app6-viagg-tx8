import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PackageSearch, ArrowLeft, Loader2, Package, User, Phone, MapPin, Clock, ShoppingBag, MessageSquare, Coins, X, EyeOff, Bike, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { unlockContact, quoteUnlockContact, centsToBRL } from "@/lib/credits/unlockContact";
import { useWalletCenter } from "@/hooks/useWalletCenter";

interface PurchaseIntentionCard {
  id: string;
  customer_name: string | null;
  customer_whatsapp: string | null;
  subtotal: number | null;
  total_items: number | null;
  status: string | null;
  created_at: string;
  items: Array<{
    id: string;
    product_title: string | null;
    product_image_url: string | null;
    quantity: number;
    unit_price: number | null;
    subtotal: number | null;
  }>;
}

const fmtBRL = (v: number | null) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function StoreOrdersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Saldo da CARTEIRA OFICIAL (unificada)
  const { totalCents: walletCents, refetch: refetchWallet } = useWalletCenter();
  
  // NOTA: o custo da liberação NÃO é calculado no front. Ele vem do backend
  // (wallet_unlock_charge_cents → orion_commission_policy: %, piso e teto).
  // Ver o `unlockCosts` abaixo, populado após carregar os pedidos.

  // Ocultar pedidos individuais (localStorage, por navegador)
  const HIDDEN_KEY = "viagg_hidden_orders";
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]"); } catch { return []; }
  });
  const [showHidden, setShowHidden] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const hideOrder = (id: string) => setHiddenIds((prev) => {
    const next = Array.from(new Set([...prev, id]));
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  const unhideOrder = (id: string) => setHiddenIds((prev) => {
    const next = prev.filter((x) => x !== id);
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  const handleContactBuyer = async (pi: PurchaseIntentionCard) => {
    if (!pi.customer_whatsapp) return;
    // Liberar comprador = desbloqueio de contato via Wallet Core (comissão do backend).
    // Permanente por (pedido, comprador); nunca recobra o mesmo comprador.
    const buyerKey = String(pi.customer_whatsapp).replace(/\D/g, "") || pi.id;

    // Confirmação com o valor VINDO DO BACKEND (unlockCosts). Front nunca calcula.
    const costCents = unlockCosts[pi.id];
    if (costCents != null && costCents > 0) {
      const ok = window.confirm(
        `Será debitado ${centsToBRL(costCents)} da sua carteira para liberar os dados deste comprador.`
      );
      if (!ok) return;
    }

    const res = await unlockContact("product", pi.id, buyerKey, Math.round(Number(pi.subtotal ?? 0) * 100));
    if (!res.success) {
      if (res.error === "insufficient_credits") {
        const reqC = Number(res.required_cents ?? 0);
        const availC = Number(res.available_cents ?? walletCents);
        const lackC = Math.max(0, reqC - availC);
        toast.error(
          `Saldo insuficiente. Você precisa de ${centsToBRL(lackC)} para liberar este contato.`,
          { duration: 5000, action: { label: "Adicionar Saldo", onClick: () => navigate("/centro-financeiro") } }
        );
        return;
      }
      toast.error(`Erro ao liberar comprador: ${res.error ?? "desconhecido"}`);
      return;
    }
    if (res.already_unlocked) toast.success("Comprador já estava liberado.");
    else if ((res.charged_cents ?? 0) > 0) toast.success(`Comprador liberado! ${centsToBRL(res.charged_cents)} debitados — Saldo: ${centsToBRL(res.balance_cents)}`);
    else toast.success("Comprador liberado!");
    
    // Atualiza saldo localmente e refaz a query
    refetchWallet();
    queryClient.invalidateQueries({ queryKey: ["store-orders", user?.id] });

    // Abre o WhatsApp do comprador
    const clean = String(pi.customer_whatsapp).replace(/\D/g, "").replace(/^55/, "");
    const msg = encodeURIComponent(
      `Olá ${pi.customer_name || ""}! Sobre seu pedido de ${fmtBRL(pi.subtotal)} feito na Viagg-TX8, vamos combinar a entrega?`
    );
    window.open(`https://wa.me/55${clean}?text=${msg}`, "_blank");
  };

  // Exclui o pedido (intenção de compra) definitivamente do banco.
  const handleDeleteOrder = async (pi: PurchaseIntentionCard) => {
    if (!window.confirm("Excluir este pedido definitivamente? Esta ação não pode ser desfeita.")) return;
    setDeletingId(pi.id);
    try {
      // Exclusão lógica: Marca como 'cancelled' via RPC blindada no backend.
      const { data: success, error } = await supabase.rpc("cancel_merchant_cesta_order", { p_order_id: pi.id });
      if (error) throw error;
      if (!success) throw new Error("Acesso negado ou pedido não encontrado");
      toast.success("Pedido excluído.");
      queryClient.invalidateQueries({ queryKey: ["store-orders", user?.id] });
    } catch (err: any) {
      toast.error(`Erro ao excluir: ${err?.message || "tente novamente"}`);
    } finally {
      setDeletingId(null);
    }
  };

  const { data: orders = [], isLoading } = useQuery<PurchaseIntentionCard[]>({
    queryKey: ["store-orders", user?.id],
    enabled: !!user?.id,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // Usa a RPC oficial que bypassa eventuais problemas de RLS no frontend
      // e cruza a identidade do lojista no backend com total segurança.
      const { data: pis } = await supabase.rpc("get_merchant_cesta_orders");

      // Filtra os cancelados no frontend (a badge na sidebar já os exclui no backend).
      const list = ((pis || []) as any[]).filter(p => p.status !== "cancelled");

      if (list.length === 0) return [];
      const ids = list.map((p) => p.id);
      const { data: items } = await (supabase.from("purchase_intention_items") as any)
        .select("id, intention_id, product_title, product_image_url, quantity, unit_price, subtotal")
        .in("intention_id", ids);
      const itemsBy = new Map<string, any[]>();
      for (const it of (items || []) as any[]) {
        const arr = itemsBy.get(it.intention_id) || [];
        arr.push(it);
        itemsBy.set(it.intention_id, arr);
      }
      return list.map((p) => ({ ...p, items: itemsBy.get(p.id) || [] }));
    },
  });

  // Custo (comissão) de liberação de CADA pedido — vindo do BACKEND, nunca
  // calculado no front. Chama wallet_unlock_charge_cents (fonte oficial:
  // orion_commission_policy). Mapa id_do_pedido → cents.
  const orderIds = (orders as PurchaseIntentionCard[]).map((o) => o.id).join(",");
  const { data: unlockCosts = {} } = useQuery<Record<string, number>>({
    queryKey: ["order-unlock-costs", orderIds],
    enabled: (orders as PurchaseIntentionCard[]).length > 0,
    queryFn: async () => {
      const out: Record<string, number> = {};
      await Promise.all(
        (orders as PurchaseIntentionCard[]).map(async (o) => {
          const cents = await quoteUnlockContact(
            "product",
            o.id,
            Math.round(Number(o.subtotal ?? 0) * 100),
          );
          if (cents != null) out[o.id] = cents;
        }),
      );
      return out;
    },
  });

  // Query para verificar quais pedidos já foram desbloqueados
  const { data: unlockedSet = new Set<string>() } = useQuery({
    queryKey: ["unlocked-contacts", orderIds],
    enabled: (orders as PurchaseIntentionCard[]).length > 0,
    queryFn: async () => {
      // Tentamos buscar na tabela de charges oficial. Se falhar por RLS, cai no fallback.
      const { data, error } = await supabase
        .from("orion_marketplace_contact_charges")
        .select("listing_id")
        .eq("listing_module", "product")
        .in("listing_id", (orders as PurchaseIntentionCard[]).map((o) => o.id));
      
      const set = new Set<string>();
      if (!error && data) {
        data.forEach((d) => set.add(d.listing_id));
      }
      return set;
    },
  });

  // custo do pedido pelo backend (0 = ainda carregando a cotação; nunca calcula)
  const costOf = (pi: PurchaseIntentionCard): number | null =>
    Object.prototype.hasOwnProperty.call(unlockCosts, pi.id) ? unlockCosts[pi.id] : null;

  const isUnlocked = (pi: PurchaseIntentionCard) => unlockedSet.has(pi.id);

  const hiddenCount = (orders as PurchaseIntentionCard[]).filter((o) => hiddenIds.includes(o.id)).length;
  const visibleOrders = (orders as PurchaseIntentionCard[]).filter((o) => showHidden || !hiddenIds.includes(o.id));

  return (
    <div className="p-4 md:p-8 animate-fade-in space-y-6 mt-4">
      <header className="mb-6 border-b border-[#2A3038] pb-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-[#A7B0BE] hover:text-[#FF6A00] text-xs font-black uppercase tracking-widest mb-4 transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Voltar ao Menu
        </button>

        <h1 className="text-2xl font-bold flex items-center gap-2 text-[#F5F7FA]">
          <PackageSearch className="text-[#FF6A00]" />
          PEDIDOS DA CESTA
          <span className="ml-2 text-sm font-bold text-[#A7B0BE] bg-[#1B1F24] border border-[#2A3038] px-3 py-1 rounded-full">
            {orders.length}
          </span>
        </h1>
        <p className="text-[#A7B0BE] mt-2 text-sm">Gerencie suas vendas locais.</p>
      </header>

      {hiddenCount > 0 && (
        <div className="flex justify-end">
          <button onClick={() => setShowHidden((v) => !v)}
            className="text-[10px] font-black uppercase tracking-widest text-[#A7B0BE] hover:text-white flex items-center gap-1">
            <EyeOff className="w-3 h-3" /> {showHidden ? "esconder ocultos" : `mostrar ${hiddenCount} oculto${hiddenCount > 1 ? "s" : ""}`}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#FF6A00]" />
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-[#1B1F24] border border-dashed border-[#2A3038] rounded-2xl p-12 text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-[#14171B] flex items-center justify-center mx-auto">
            <ShoppingBag className="w-8 h-8 text-[#A7B0BE]" />
          </div>
          <h3 className="text-lg font-black text-[#F5F7FA] uppercase">Nenhum pedido ainda</h3>
          <p className="text-sm text-[#A7B0BE] max-w-md mx-auto">
            Quando alguém finalizar uma compra na sua loja, o pedido aparece aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {visibleOrders.map((pi) => (
            <div
              key={pi.id}
              className={cn(
                "rounded-2xl border-2 p-5 flex flex-col gap-3 transition-all",
                pi.status === "completed" ? "bg-emerald-950/30 border-emerald-700/40" :
                pi.status === "cancelled" ? "bg-[#14171B] border-[#2A3038] opacity-60" :
                "bg-yellow-50 border-yellow-300"
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="inline-flex items-center gap-2 bg-yellow-500 text-zinc-900 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow">
                  <Package className="w-3 h-3" /> Pedido Marketplace
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-bold text-yellow-800 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(pi.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {hiddenIds.includes(pi.id) ? (
                    <button onClick={() => unhideOrder(pi.id)} title="Restaurar" className="text-yellow-700 hover:text-yellow-900 transition-colors">
                      <EyeOff className="w-4 h-4" />
                    </button>
                  ) : (
                    <button onClick={() => hideOrder(pi.id)} title="Ocultar este pedido" className="text-yellow-700 hover:text-yellow-900 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Cliente (mascarado) */}
              {(() => {
                const maskName = (n: string | null) => {
                  if (!n) return "Cliente";
                  const first = n.trim().split(/\s+/)[0] || "Cliente";
                  return first[0]?.toUpperCase() + "***";
                };
                const maskPhone = (p: string | null) => {
                  if (!p) return "";
                  const digits = String(p).replace(/\D/g, "");
                  if (digits.length < 4) return "(**) ****-****";
                  const ddd = digits.slice(-11, -9) || "**";
                  return `(${ddd}) *****-****`;
                };
                return (
                  <div className="space-y-1 text-sm text-yellow-900">
                    <p className="flex items-center gap-1.5 font-bold"><User className="w-3.5 h-3.5" /> {maskName(pi.customer_name)}</p>
                    {pi.customer_whatsapp && (
                      <p className="flex items-center gap-1.5 text-xs"><Phone className="w-3.5 h-3.5" /> {maskPhone(pi.customer_whatsapp)}</p>
                    )}
                  </div>
                );
              })()}

              {/* Itens */}
              <div className="pt-3 border-t border-yellow-300/70">
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-bold text-yellow-800 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" /> {pi.items.length} item(ns)
                  </span>
                  <span className="text-xs font-bold text-yellow-800">{pi.total_items ?? 0} unid.</span>
                </div>
                <div className="space-y-2">
                  {pi.items.slice(0, 4).map((it) => (
                    <div key={it.id} className="flex items-center gap-2 text-xs text-yellow-800">
                      <div className="w-10 h-10 rounded-lg bg-white border border-yellow-300 overflow-hidden shrink-0 flex items-center justify-center">
                        {it.product_image_url ? (
                          <img src={it.product_image_url} alt={it.product_title || ""} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <Package className="w-5 h-5 text-yellow-400" />
                        )}
                      </div>
                      <span className="line-clamp-2 flex-1">{it.quantity}x {it.product_title || "Produto"}</span>
                      <span className="font-bold shrink-0">{fmtBRL(it.subtotal ?? (it.unit_price ?? 0) * it.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="pt-3 border-t border-yellow-300/70 flex items-center justify-between font-black">
                <span className="text-sm text-yellow-900">Total</span>
                <span className="text-lg text-yellow-900">{fmtBRL(pi.subtotal)}</span>
              </div>

              {/* ─── BLOCO FINANCEIRO (valores 100% do backend, front nunca calcula) ─── */}
              {(() => {
                const cost = costOf(pi);                 // comissão (cents) do backend, ou null enquanto cota
                const quoting = cost == null;
                const afterCents = cost == null ? walletCents : walletCents - cost;
                const enough = cost != null && afterCents >= 0;
                const lackCents = cost != null && !enough ? cost - walletCents : 0;
                // tom: verde=sobra folgada · amarelo=sobra pouco · vermelho=insuficiente
                const tone = quoting ? "slate" : !enough ? "red" : afterCents < cost! ? "amber" : "emerald";
                const T = {
                  slate:   { box: "bg-slate-50 border-slate-200",     head: "text-slate-500",   strong: "text-slate-700" },
                  emerald: { box: "bg-emerald-50 border-emerald-200", head: "text-emerald-700", strong: "text-emerald-700" },
                  amber:   { box: "bg-amber-50 border-amber-300",     head: "text-amber-700",   strong: "text-amber-700" },
                  red:     { box: "bg-red-50 border-red-200",         head: "text-red-700",     strong: "text-red-700" },
                }[tone];
                const Row = ({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) => (
                  <div className="flex items-center justify-between text-xs">
                    <span className={cn("font-semibold", strong ? T.strong : "text-yellow-800/80")}>{label}</span>
                    <span className={cn("tabular-nums", strong ? cn("font-black text-sm", T.strong) : "font-bold text-yellow-900")}>{value}</span>
                  </div>
                );
                return (
                  <div className={cn("rounded-xl border p-3 space-y-1.5", T.box)}>
                    <Row label="Valor do pedido" value={fmtBRL(pi.subtotal)} />
                    <Row label="Custo para liberar contato" value={quoting ? "—" : centsToBRL(cost)} />
                    <div className="h-px bg-black/5 my-1" />
                    <Row label="Saldo da carteira" value={centsToBRL(walletCents)} />
                    {enough ? (
                      <Row label="Após liberar" value={centsToBRL(afterCents)} strong />
                    ) : !quoting ? (
                      <>
                        <Row label="Necessário" value={centsToBRL(cost)} />
                        <Row label="Faltam" value={centsToBRL(lackCents)} strong />
                      </>
                    ) : null}
                    {!quoting && !enough && (
                      <Button
                        onClick={() => navigate("/centro-financeiro")}
                        className="w-full h-9 mt-1 bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-black uppercase text-[10px] tracking-widest gap-1.5 rounded-lg"
                      >
                        <Coins className="w-3.5 h-3.5" /> Adicionar Saldo
                      </Button>
                    )}
                  </div>
                );
              })()}

              {/* Botão Liberar Comprador — confirma o débito (valor do backend) antes de liberar */}
              {pi.customer_whatsapp && (() => {
                const unlocked = isUnlocked(pi);
                
                if (unlocked) {
                  return (
                    <div className="w-full flex flex-col gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <div className="flex items-center justify-center gap-2 text-emerald-700 font-black uppercase text-[11px] tracking-widest">
                        <MessageSquare className="w-4 h-4" /> CONTATO LIBERADO
                      </div>
                      <Button
                        onClick={() => {
                          const clean = String(pi.customer_whatsapp).replace(/\D/g, "").replace(/^55/, "");
                          const msg = encodeURIComponent(`Olá ${pi.customer_name || ""}! Sobre seu pedido de ${fmtBRL(pi.subtotal)} feito na Viagg-TX8, vamos combinar a entrega?`);
                          window.open(`https://wa.me/55${clean}?text=${msg}`, "_blank");
                        }}
                        className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-[11px] tracking-widest gap-2 rounded-lg"
                      >
                        <Phone className="w-4 h-4" /> Enviar WhatsApp
                      </Button>
                    </div>
                  );
                }

                const cost = costOf(pi);
                const quoting = cost == null;
                const enough = cost != null && walletCents >= cost;
                return (
                  <Button
                    onClick={() => handleContactBuyer(pi)}
                    disabled={quoting || !enough}
                    className={cn(
                      "w-full h-12 text-white font-black uppercase text-[11px] tracking-widest flex flex-col items-center justify-center gap-0.5 rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed",
                      enough 
                        ? "bg-[#00C853] hover:bg-[#00E676] shadow-green-900/30" 
                        : "bg-slate-300 text-slate-500 shadow-none"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      {quoting ? "Calculando…" : enough ? `CHAMAR COMPRADOR — ${centsToBRL(cost)}` : "Saldo insuficiente"}
                    </div>
                    {enough && (
                      <span className="text-[9px] text-white/90 font-bold tracking-normal normal-case">
                        Negociar o produto
                      </span>
                    )}
                  </Button>
                );
              })()}

              <Button
                onClick={() => navigate('/anunciante/entregas')}
                className="w-full h-11 bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-black uppercase text-[11px] tracking-widest gap-2 rounded-xl shadow-lg shadow-orange-900/30 mt-2"
              >
                <Bike className="w-4 h-4" /> Chamar Motoboy
              </Button>

              <Button
                onClick={() => handleDeleteOrder(pi)}
                disabled={deletingId === pi.id}
                variant="outline"
                className="w-full h-11 border-2 border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 font-black uppercase text-[11px] tracking-widest gap-2 rounded-xl mt-2 disabled:opacity-50"
              >
                {deletingId === pi.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Excluir
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
