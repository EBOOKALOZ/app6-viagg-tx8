import { useNavigate } from "react-router-dom";
import { Tag, ArrowLeft, Loader2, Package, User, Phone, MapPin, Clock, MessageSquare, Coins, CheckCheck, X, Trash2, Bike } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { debitSellerCredits } from "@/lib/credits/debitSellerCredits";
import { CREDIT_COSTS } from "@/lib/credits/creditPricing";
import { formatCurrencyBRL } from "@/lib/utils";

interface OfferCard {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  product_id: string | null;
  product_title: string;
  product_image: string | null;
  product_price: string | null;
  requested_price: number;
  message: string | null;
  status: string;
  created_at: string;
}

export default function AdvertiserOffersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const ACCEPT_COST = CREDIT_COSTS.advertiser_accept_offer;

  // Saldo
  const { data: creditBalance = 0 } = useQuery({
    queryKey: ["seller-credit-balance-for-offers", user?.id],
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

  // Ofertas
  const { data: offers = [], isLoading } = useQuery<OfferCard[]>({
    queryKey: ["advertiser-offers-page", user?.id],
    enabled: !!user?.id,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const storeIds: string[] = [];
      const { data: advList } = await (supabase.from("advertiser_accounts" as any)
        .select("id").eq("user_id", user!.id)) as any;
      ((advList || []) as any[]).forEach((a: any) => { if (a?.id) storeIds.push(a.id); });
      const { data: msList } = await (supabase.from("merchant_stores" as any)
        .select("id").eq("user_id", user!.id)) as any;
      ((msList || []) as any[]).forEach((s: any) => { if (s?.id) storeIds.push(s.id); });

      if (storeIds.length === 0) return [];

      const { data } = await (supabase.from("discount_requests" as any)
        .select("*")
        .in("store_id", storeIds)
        .neq("status", "deleted")
        .order("created_at", { ascending: false })) as any;

      const list = (data || []) as any[];
      if (list.length === 0) return [];

      // Resolver título + imagem do produto
      const offerProductIds = [...new Set(list.map((r: any) => r.product_id).filter(Boolean))];
      const infoMap: Record<string, { title: string; image: string | null }> = {};

      const resolveStorage = async (raw: string | null | undefined): Promise<string | null> => {
        if (!raw) return null;
        if (/^https?:\/\//i.test(raw)) return raw;
        try {
          const { data: signed } = await supabase.storage.from("marketing-materials").createSignedUrl(raw, 60 * 60);
          if (signed?.signedUrl) return signed.signedUrl;
        } catch { /* ignore */ }
        return supabase.storage.from("marketing-materials").getPublicUrl(raw).data.publicUrl;
      };

      if (offerProductIds.length > 0) {
        const [adv2, mkt] = await Promise.all([
          (supabase.from("advertiser_listings") as any).select("id, title, cover_image_url").in("id", offerProductIds),
          (supabase.from("merchant_marketing_products") as any).select("id, title, image_url").in("id", offerProductIds),
        ]);
        for (const row of (adv2.data ?? []) as any[]) {
          infoMap[row.id] = { title: row.title, image: await resolveStorage(row.cover_image_url) };
        }
        for (const row of (mkt.data ?? []) as any[]) {
          if (!infoMap[row.id]) infoMap[row.id] = { title: row.title, image: row.image_url ?? null };
        }
      }

      return list.map((r) => ({
        id: r.id,
        customer_name: r.customer_name,
        customer_phone: r.customer_phone,
        product_id: r.product_id,
        product_title: infoMap[r.product_id]?.title ?? "Produto",
        product_image: infoMap[r.product_id]?.image ?? null,
        product_price: r.product_price,
        requested_price: Number(r.requested_price ?? 0),
        message: r.message,
        status: r.status,
        created_at: r.created_at,
      }));
    },
  });

  const handleAccept = async (offer: OfferCard) => {
    if (creditBalance < ACCEPT_COST) {
      toast.error(`Sem saldo (precisa ${ACCEPT_COST}, tem ${creditBalance}). Redirecionando para compra...`, { duration: 3000 });
      setTimeout(() => navigate("/anunciante/creditos"), 1200);
      return;
    }
    const res = await debitSellerCredits({
      event: "advertiser_accept_offer",
      userId: user?.id,
      refType: "discount_request",
      refId: offer.id,
    });
    if (!res.charged && res.reason === "insufficient_credits") {
      toast.error(`Saldo insuficiente.`);
      setTimeout(() => navigate("/anunciante/creditos"), 1200);
      return;
    }
    const { error } = await (supabase.from("discount_requests" as any).update({ status: "accepted" }).eq("id", offer.id)) as any;
    if (error) { toast.error("Erro: " + error.message); return; }
    if (res.charged) toast.success(`${res.credits_charged} créditos debitados — Saldo: ${res.balance_after}`);
    else toast.success("Oferta aceita!");
    queryClient.invalidateQueries({ queryKey: ["seller-credit-balance-for-offers", user?.id] });
    queryClient.invalidateQueries({ queryKey: ["advertiser-offers-page", user?.id] });
  };

  const handleReject = async (offer: OfferCard) => {
    const { error } = await (supabase.from("discount_requests" as any).update({ status: "rejected" }).eq("id", offer.id)) as any;
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Oferta recusada.");
    queryClient.invalidateQueries({ queryKey: ["advertiser-offers-page", user?.id] });
  };

  const handleDelete = async (offer: OfferCard) => {
    const { error: delErr, count } = await (supabase.from("discount_requests" as any).delete({ count: 'exact' }).eq("id", offer.id)) as any;
    let deleted = !delErr && (count ?? 0) > 0;
    if (!deleted) {
      const { error: updErr } = await (supabase.from("discount_requests" as any).update({ status: "deleted" }).eq("id", offer.id)) as any;
      deleted = !updErr;
      if (updErr) { toast.error("Erro: " + updErr.message); return; }
    }
    toast.success("Oferta excluída.");
    queryClient.invalidateQueries({ queryKey: ["advertiser-offers-page", user?.id] });
  };

  const handleCallOfferer = (offer: OfferCard) => {
    if (!offer.customer_phone) return;
    const clean = String(offer.customer_phone).replace(/\D/g, "").replace(/^55/, "");
    const msg = encodeURIComponent(
      `Olá ${offer.customer_name || ""}! Sobre sua oferta de ${formatCurrencyBRL(offer.requested_price)} para "${offer.product_title}", vamos combinar?`
    );
    window.open(`https://wa.me/55${clean}?text=${msg}`, "_blank");
  };

  // Máscaras
  const maskName = (n: string | null) => {
    if (!n) return "Comprador";
    const first = n.trim().split(/\s+/)[0] || "Comprador";
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
          <Tag className="text-[#FF6A00]" />
          Ofertas Recebidas
          <span className="ml-2 text-sm font-bold text-[#A7B0BE] bg-[#1B1F24] border border-[#2A3038] px-3 py-1 rounded-full">
            {offers.length}
          </span>
        </h1>
        <p className="text-[#A7B0BE] mt-2 text-sm">Propostas de preço dos compradores via "Minha Oferta é...".</p>
      </header>

      {isLoading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#FF6A00]" />
        </div>
      ) : offers.length === 0 ? (
        <div className="bg-[#1B1F24] border border-dashed border-[#2A3038] rounded-2xl p-12 text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-[#14171B] flex items-center justify-center mx-auto">
            <Tag className="w-8 h-8 text-[#A7B0BE]" />
          </div>
          <h3 className="text-lg font-black text-[#F5F7FA] uppercase">Nenhuma oferta ainda</h3>
          <p className="text-sm text-[#A7B0BE] max-w-md mx-auto">
            Quando um comprador enviar uma proposta pelo botão "Minha Oferta é...", ela aparece aqui.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {offers.map((offer) => {
            const hasEnough = creditBalance >= ACCEPT_COST;
            return (
              <div
                key={offer.id}
                className={cn(
                  "rounded-2xl border-2 p-5 flex flex-col gap-3 transition-all",
                  offer.status === "accepted" ? "bg-emerald-950/30 border-emerald-700/40" :
                  offer.status === "rejected" ? "bg-[#14171B] border-[#2A3038] opacity-60" :
                  "bg-yellow-50 border-yellow-300"
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="inline-flex items-center gap-2 bg-yellow-500 text-zinc-900 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow">
                    <Tag className="w-3 h-3" /> Oferta {offer.status === 'pending' ? '' : offer.status === 'accepted' ? '· Aceita' : '· Recusada'}
                  </div>
                  <span className="text-[10px] font-bold text-yellow-800 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(offer.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                {/* Cliente (mascarado) */}
                <div className="space-y-1 text-sm text-yellow-900">
                  <p className="flex items-center gap-1.5 font-bold"><User className="w-3.5 h-3.5" /> {maskName(offer.customer_name)}</p>
                  {offer.customer_phone && (
                    <p className="flex items-center gap-1.5 text-xs"><Phone className="w-3.5 h-3.5" /> {maskPhone(offer.customer_phone)}</p>
                  )}
                </div>

                {/* Produto + Imagem */}
                <div className="pt-3 border-t border-yellow-300/70">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-lg bg-white border border-yellow-300 overflow-hidden shrink-0 flex items-center justify-center">
                      {offer.product_image ? (
                        <img src={offer.product_image} alt={offer.product_title} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <Package className="w-7 h-7 text-yellow-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-yellow-700 font-bold uppercase tracking-wider">Produto</p>
                      <p className="text-sm font-bold text-yellow-900 line-clamp-1">{offer.product_title}</p>
                      {offer.product_price && (
                        <p className="text-xs text-yellow-700 line-through opacity-70">R$ {offer.product_price}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Mensagem */}
                {offer.message && (
                  <p className="text-xs text-yellow-800 italic line-clamp-2 px-1">"{offer.message}"</p>
                )}

                {/* Valores: Preço original + Oferta */}
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-yellow-300/70">
                  {offer.product_price && (
                    <div>
                      <p className="text-[9px] text-yellow-700 font-bold uppercase tracking-wider">Preço original</p>
                      <p className="text-lg font-black text-[#FF6A00] line-through">R$ {offer.product_price}</p>
                    </div>
                  )}
                  <div className={cn(offer.product_price ? "text-right" : "col-span-2 text-center")}>
                    <p className="text-[9px] text-yellow-700 font-bold uppercase tracking-wider">Oferta do comprador</p>
                    <p className="text-2xl font-black text-emerald-700">{formatCurrencyBRL(offer.requested_price)}</p>
                  </div>
                </div>

                {/* Saldo atual */}
                <div className={cn(
                  "flex items-center justify-between p-3 rounded-xl border",
                  hasEnough ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
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

                {/* Ações */}
                {offer.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleAccept(offer)}
                      className="flex-1 h-11 bg-emerald-700 hover:bg-emerald-800 text-white font-black uppercase text-[11px] tracking-widest gap-2 rounded-xl shadow-lg shadow-emerald-900/30"
                    >
                      <CheckCheck className="w-4 h-4" /> Aceitar (-{ACCEPT_COST} cr)
                    </Button>
                    <Button
                      onClick={() => handleReject(offer)}
                      variant="ghost"
                      className="h-11 px-4 rounded-xl border border-red-500/30 text-red-600 hover:bg-red-500/10 hover:text-red-700 font-black uppercase text-[11px] gap-1"
                    >
                      <X className="w-4 h-4" /> Recusar
                    </Button>
                  </div>
                )}

                {offer.status === "accepted" && offer.customer_phone && (
                  <Button
                    onClick={() => handleCallOfferer(offer)}
                    className="w-full h-11 bg-zhiq-teal hover:bg-zhiq-green text-white font-black uppercase text-[11px] tracking-widest gap-2 rounded-xl shadow-lg shadow-emerald-900/30"
                  >
                    <MessageSquare className="w-4 h-4" /> Contatar Ofertante
                  </Button>
                )}

                <Button
                  onClick={() => navigate('/anunciante/entregas')}
                  className="w-full h-11 bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-black uppercase text-[11px] tracking-widest gap-2 rounded-xl shadow-lg shadow-orange-900/30 mt-2"
                >
                  <Bike className="w-4 h-4" /> Chamar Motoboy
                </Button>

                {(offer.status === "rejected" || offer.status === "accepted") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(offer)}
                    className="w-full h-9 rounded-lg border border-red-500/30 text-red-600 hover:bg-red-500/10 hover:text-red-700 font-black text-[10px] uppercase gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Excluir
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
