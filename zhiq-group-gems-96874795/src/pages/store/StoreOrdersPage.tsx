import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMyStore } from "@/hooks/useMyStore";
import { PackageSearch, ArrowLeft, Loader2, Package, User, Phone, MapPin, Clock, ShoppingBag, MessageSquare, Coins, X, EyeOff, Bike, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { debitSellerCredits } from "@/lib/credits/debitSellerCredits";
import { CREDIT_COSTS } from "@/lib/credits/creditPricing";

interface PurchaseIntentionCard {
  id: string;
  customer_name: string | null;
  customer_whatsapp: string | null;
  customer_bairro: string | null;
  customer_city: string | null;
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
  const { store, isLoading: storeLoading } = useMyStore();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const UNLOCK_COST = CREDIT_COSTS.advertiser_unlock_order_whatsapp;

  // Saldo de créditos do anunciante
  const { data: creditBalance = 0 } = useQuery({
    queryKey: ["seller-credit-balance-for-orders", user?.id],
    enabled: !!user?.id,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data: adv } = await (supabase.from("advertiser_accounts" as any)
        .select("id").eq("user_id", user!.id).maybeSingle()) as any;
      const accId = (adv as any)?.id;
      if (!accId) return 0;
      const { data: bal } = await (supabase.from("advertiser_credit_balances" as any)
        .select("available_credits").eq("advertiser_account_id", accId).maybeSingle()) as any;
      return Number((bal as any)?.available_credits ?? 0);
    },
  });

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
    // Se não tem saldo, manda comprar créditos
    if (creditBalance < UNLOCK_COST) {
      toast.error(
        `Você não tem saldo suficiente (precisa de ${UNLOCK_COST} créditos, tem ${creditBalance}). Redirecionando para a compra de créditos...`,
        { duration: 3500 }
      );
      setTimeout(() => navigate("/anunciante/creditos"), 1200);
      return;
    }
    // Debita os créditos
    const res = await debitSellerCredits({
      event: "advertiser_unlock_order_whatsapp",
      userId: user?.id,
      refType: "purchase_intention",
      refId: pi.id,
      extraDescription: `Pedido ${pi.id.slice(0, 8)}`,
    });
    if (!res.charged) {
      if (res.reason === "insufficient_credits") {
        toast.error(`Saldo insuficiente. Redirecionando...`);
        setTimeout(() => navigate("/anunciante/creditos"), 1200);
        return;
      }
      if (res.reason !== "deduped_in_session") {
        toast.error(`Erro ao debitar: ${res.reason}`);
        return;
      }
    } else {
      toast.success(`${res.credits_charged} créditos debitados — Saldo: ${res.balance_after}`);
    }
    queryClient.invalidateQueries({ queryKey: ["seller-credit-balance-for-orders", user?.id] });

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
      // Remove os itens primeiro (FK), depois a intenção de compra.
      await (supabase.from("purchase_intention_items") as any).delete().eq("intention_id", pi.id);
      const { error } = await (supabase.from("purchase_intentions") as any).delete().eq("id", pi.id);
      if (error) throw error;
      toast.success("Pedido excluído.");
      queryClient.invalidateQueries({ queryKey: ["store-orders", store?.id] });
    } catch (err: any) {
      toast.error(`Erro ao excluir: ${err?.message || "tente novamente"}`);
    } finally {
      setDeletingId(null);
    }
  };

  const { data: orders = [], isLoading } = useQuery<PurchaseIntentionCard[]>({
    queryKey: ["store-orders", store?.id],
    enabled: !!store?.id,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: pis } = await (supabase.from("purchase_intentions") as any)
        .select("id, customer_name, customer_whatsapp, customer_bairro, customer_city, subtotal, total_items, status, created_at")
        .eq("store_id", store!.id)
        .order("created_at", { ascending: false })
        .limit(100);

      const list = (pis || []) as any[];
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
          Pedidos
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

      {(isLoading || storeLoading) ? (
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
                const maskLocation = (b: string | null, c: string | null) => {
                  const m = (s: string | null) => s ? s[0].toUpperCase() + "***" : null;
                  return [m(b), m(c)].filter(Boolean).join(", ");
                };
                return (
                  <div className="space-y-1 text-sm text-yellow-900">
                    <p className="flex items-center gap-1.5 font-bold"><User className="w-3.5 h-3.5" /> {maskName(pi.customer_name)}</p>
                    {pi.customer_whatsapp && (
                      <p className="flex items-center gap-1.5 text-xs"><Phone className="w-3.5 h-3.5" /> {maskPhone(pi.customer_whatsapp)}</p>
                    )}
                    {(pi.customer_bairro || pi.customer_city) && (
                      <p className="flex items-center gap-1.5 text-xs">
                        <MapPin className="w-3.5 h-3.5" />
                        {maskLocation(pi.customer_bairro, pi.customer_city)}
                      </p>
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

              {/* Saldo de créditos atual — vermelho se insuficiente, verde se suficiente */}
              {(() => {
                const hasEnough = creditBalance >= UNLOCK_COST;
                return (
                  <div className={cn(
                    "flex items-center justify-between p-3 rounded-xl border",
                    hasEnough
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-red-50 border-red-200"
                  )}>
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-widest flex items-center gap-1",
                      hasEnough ? "text-emerald-700" : "text-red-700"
                    )}>
                      <Coins className="w-3.5 h-3.5" /> Saldo atual
                    </span>
                    <span className={cn(
                      "text-2xl font-black tabular-nums leading-none",
                      hasEnough ? "text-emerald-600" : "text-red-600"
                    )}>
                      {creditBalance}
                    </span>
                  </div>
                );
              })()}

              {/* Botão Contatar Comprador */}
              {pi.customer_whatsapp && (
                <Button
                  onClick={() => handleContactBuyer(pi)}
                  className="w-full h-11 bg-zhiq-teal hover:bg-zhiq-green text-white font-black uppercase text-[11px] tracking-widest gap-2 rounded-xl shadow-lg shadow-emerald-900/30"
                >
                  <MessageSquare className="w-4 h-4" /> Contatar Comprador (-{UNLOCK_COST} cr)
                </Button>
              )}

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
