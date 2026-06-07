import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { debitSellerCredits } from "@/lib/credits/debitSellerCredits";
import { CREDIT_COSTS } from "@/lib/credits/creditPricing";
import { useContactIntentions } from "@/hooks/useContactIntentions";
import { useAdvertiserCredits } from "@/hooks/useAdvertiserCredits";
import { useAdvertiserAccountData } from "@/hooks/useAdvertiserAccountData";
import { useAdvertiserPurchaseHistory } from "@/hooks/useAdvertiserCreditPurchase";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Lock, Unlock, Phone, Clock, MapPin, AlertCircle, Building2, Car, Trash2, Volume2, VolumeX, User, Mail, Package, CheckCircle2, ShoppingBag, XCircle, Hourglass } from "lucide-react";
import { toast } from "sonner";
import LoadingTransition from "@/pages/LoadingTransition";
import { isLeadSoundEnabled, setLeadSoundEnabled, playLeadNotificationSound, stopLeadNotificationSound } from "@/lib/notificationSound";

interface PurchaseIntentionCard {
  id: string;
  customer_name: string | null;
  customer_whatsapp: string | null;
  customer_email: string | null;
  customer_bairro: string | null;
  customer_city: string | null;
  subtotal: number | null;
  total_items: number | null;
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

export default function AdvertiserLeadsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { intentions, isLoading, pendingCount, unlockIntention, deleteIntention } = useContactIntentions();
  const { balance } = useAdvertiserCredits();
  const { data: accountData } = useAdvertiserAccountData();
  const { data: purchaseHistory = [], isLoading: isLoadingHistory } = useAdvertiserPurchaseHistory();
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => isLeadSoundEnabled());

  const { data: discountRequests = [], refetch: refetchDiscountRequests } = useQuery<any[]>({
    queryKey: ["advertiser-discount-requests-messages", user?.id],
    enabled: !!user?.id,
    refetchInterval: 15_000,
    queryFn: async () => {
      const storeIds: string[] = [];
      const { data: adv } = await (supabase.from("advertiser_accounts") as any)
        .select("id").eq("user_id", user!.id).maybeSingle();
      if ((adv as any)?.id) storeIds.push((adv as any).id);
      const { data: ms } = await (supabase.from("merchant_stores") as any)
        .select("id").eq("user_id", user!.id).maybeSingle();
      if ((ms as any)?.id) storeIds.push((ms as any).id);
      if (storeIds.length === 0) return [];

      const { data } = await (supabase.from("discount_requests") as any)
        .select("*")
        .in("store_id", storeIds)
        .neq("status", "deleted")
        .order("created_at", { ascending: false });

      const list = (data || []) as any[];
      const productIds = [...new Set(list.map(r => r.product_id).filter(Boolean))];
      const infoMap: Record<string, { title: string; image: string | null }> = {};

      const resolveStorage = async (raw: string | null | undefined): Promise<string | null> => {
        if (!raw) return null;
        if (/^https?:\/\//i.test(raw)) {
          const m = raw.match(/\/storage\/v1\/object\/(?:public|sign)\/marketing-materials\/([^?]+)/);
          if (m?.[1]) {
            try {
              const { data: signed } = await supabase.storage.from('marketing-materials').createSignedUrl(m[1], 60 * 60);
              if (signed?.signedUrl) return signed.signedUrl;
            } catch { /* ignore */ }
          }
          return raw;
        }
        try {
          const { data: signed } = await supabase.storage.from('marketing-materials').createSignedUrl(raw, 60 * 60);
          if (signed?.signedUrl) return signed.signedUrl;
        } catch { /* ignore */ }
        return supabase.storage.from('marketing-materials').getPublicUrl(raw).data.publicUrl;
      };

      if (productIds.length > 0) {
        const [adv2, mkt, mediaRows] = await Promise.all([
          (supabase.from("advertiser_listings") as any).select("id, title, cover_image_url").in("id", productIds),
          (supabase.from("merchant_marketing_products") as any).select("id, title, image_url").in("id", productIds),
          (supabase.from("advertiser_listing_media") as any).select("listing_id, media_url, storage_path").in("listing_id", productIds),
        ]);

        const mediaByListing: Record<string, string> = {};
        for (const m of (mediaRows?.data ?? []) as any[]) {
          if (!mediaByListing[m.listing_id]) mediaByListing[m.listing_id] = m.media_url || m.storage_path;
        }

        for (const row of (adv2.data ?? []) as any[]) {
          const candidate = row.cover_image_url || mediaByListing[row.id];
          const img = await resolveStorage(candidate);
          infoMap[row.id] = { title: row.title, image: img };
        }
        for (const row of (mkt.data ?? []) as any[]) {
          if (!infoMap[row.id]) infoMap[row.id] = { title: row.title, image: row.image_url ?? null };
        }
      }

      return list.map(r => ({
        ...r,
        product_title: infoMap[r.product_id]?.title ?? "Produto",
        product_image: infoMap[r.product_id]?.image ?? null,
      }));
    },
  });

  const respondDiscount = async (id: string, status: 'accepted' | 'rejected') => {
    // Debita 9 créditos apenas no aceite
    if (status === 'accepted') {
      const res = await debitSellerCredits({
        event: "advertiser_accept_offer",
        userId: user?.id,
        refType: "discount_request",
        refId: id,
      });
      if (!res.charged && res.reason === "insufficient_credits") {
        toast.error(`Saldo insuficiente. Precisa de ${res.required}, tem ${res.available}.`);
        return;
      }
      if (!res.charged && res.reason !== "deduped_in_session") {
        toast.error(`Erro ao debitar: ${res.reason}`);
        return;
      }
      if (res.charged) {
        toast.success(`${res.credits_charged} créditos debitados — Saldo: ${res.balance_after}`);
        queryClient.invalidateQueries({ queryKey: ["advertiser-credits"] });
      }
    }
    const { error } = await (supabase.from("discount_requests") as any)
      .update({ status })
      .eq("id", id);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(status === 'accepted' ? "Oferta aceita!" : "Oferta recusada.");
    refetchDiscountRequests();
  };

  const deleteDiscount = async (id: string) => {
    // 1. Tenta DELETE físico
    const { error: delErr, count } = await (supabase.from("discount_requests") as any)
      .delete({ count: 'exact' })
      .eq("id", id);

    let deleted = !delErr && (count ?? 0) > 0;

    // 2. Se RLS bloqueou (0 rows afetados), tenta soft-delete via UPDATE status='deleted'
    if (!deleted) {
      const { error: updErr } = await (supabase.from("discount_requests") as any)
        .update({ status: "deleted" })
        .eq("id", id);
      deleted = !updErr;
      if (updErr) {
        console.error("[deleteDiscount] falhou:", { delErr, updErr });
        toast.error("Erro ao excluir: " + (updErr.message || delErr?.message || "RLS bloqueou"));
        return;
      }
    }

    // 3. Remove do localStorage de offers chamadas (se estiver lá)
    setCalledOffers(prev => {
      const next = new Set(prev);
      next.delete(id);
      try { localStorage.setItem("called-offers", JSON.stringify([...next])); } catch {}
      return next;
    });

    // 4. Atualização otimista do cache do React Query — some imediatamente da UI
    queryClient.setQueryData<any[]>(["advertiser-discount-requests-messages", user?.id], (old) =>
      (old || []).filter((r: any) => r.id !== id && r.status !== "deleted")
    );

    toast.success("Oferta excluída.");
    refetchDiscountRequests();
  };

  const [calledOffers, setCalledOffers] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("called-offers");
      if (!raw) return new Set();
      return new Set(JSON.parse(raw));
    } catch { return new Set(); }
  });

  const [unlockedOrders, setUnlockedOrders] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("unlocked-orders");
      if (!raw) return new Set();
      return new Set(JSON.parse(raw));
    } catch { return new Set(); }
  });

  const markOrderUnlocked = (id: string) => {
    setUnlockedOrders(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem("unlocked-orders", JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  // Débito de créditos pra "Chamar Cliente no WhatsApp" no pedido (13 cr)
  const debitOrderCallCredits = async (orderId: string): Promise<boolean> => {
    if (unlockedOrders.has(orderId)) return true; // já debitou neste pedido
    const res = await debitSellerCredits({
      event: "advertiser_unlock_order_whatsapp",
      userId: user?.id,
      refType: "purchase_intention",
      refId: orderId,
      extraDescription: `Pedido ${orderId.slice(0, 8)}`,
    });
    if (!res.charged) {
      if (res.reason === "insufficient_credits") {
        toast.error(`Saldo insuficiente. Precisa de ${res.required}, tem ${res.available}.`);
      } else if (res.reason === "advertiser_not_found") {
        toast.error("Conta de anunciante não encontrada.");
      } else if (res.reason !== "deduped_in_session") {
        toast.error(`Erro ao debitar: ${res.reason}`);
      }
      return false;
    }
    toast.success(`${res.credits_charged} créditos debitados — Saldo: ${res.balance_after}`);
    queryClient.invalidateQueries({ queryKey: ["advertiser-credits"] });
    return true;
  };

  const markAsCalled = (id: string) => {
    setCalledOffers(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem("called-offers", JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const callOfferer = (req: any) => {
    const clean = String(req.customer_phone).replace(/\D/g, "").replace(/^55/, "");
    const msg = encodeURIComponent(
      `Olá ${req.customer_name || ''}! Sou da loja e aceitei sua oferta de ${formatCurrency(Number(req.requested_price))} para o produto "${req.product_title}". Vamos combinar a entrega?`
    );
    window.open(`https://wa.me/55${clean}?text=${msg}`, "_blank");
    markAsCalled(req.id);
  };

  const pendingDiscountRequests = discountRequests.filter(r => r.status === 'pending');

  const { data: purchaseIntentions = [], refetch: refetchPurchases } = useQuery<PurchaseIntentionCard[]>({
    queryKey: ["advertiser-purchase-intentions", user?.id],
    enabled: !!user?.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: stores } = await (supabase.from("merchant_stores") as any)
        .select("id")
        .eq("user_id", user!.id);
      const storeIds = (stores || []).map((s: any) => s.id);
      if (storeIds.length === 0) return [];

      const { data: pis } = await (supabase.from("purchase_intentions") as any)
        .select("id, customer_name, customer_whatsapp, customer_email, customer_bairro, customer_city, subtotal, total_items, created_at, store_id")
        .in("store_id", storeIds)
        .order("created_at", { ascending: false })
        .limit(100);

      const piList = (pis || []) as any[];
      if (piList.length === 0) return [];

      const ids = piList.map((p) => p.id);
      const { data: items } = await (supabase.from("purchase_intention_items") as any)
        .select("id, intention_id, product_title, product_image_url, quantity, unit_price, subtotal")
        .in("intention_id", ids);

      const itemsByIntention = new Map<string, any[]>();
      for (const it of (items || []) as any[]) {
        const arr = itemsByIntention.get(it.intention_id) || [];
        arr.push(it);
        itemsByIntention.set(it.intention_id, arr);
      }

      return piList.map((p) => ({
        id: p.id,
        customer_name: p.customer_name,
        customer_whatsapp: p.customer_whatsapp,
        customer_email: p.customer_email,
        customer_bairro: p.customer_bairro,
        customer_city: p.customer_city,
        subtotal: p.subtotal,
        total_items: p.total_items,
        created_at: p.created_at,
        items: itemsByIntention.get(p.id) || [],
      }));
    },
  });

  const handleDeletePurchase = async (id: string) => {
    if (!window.confirm("Excluir esta mensagem?")) return;
    const { error } = await (supabase.from("purchase_intentions") as any).delete().eq("id", id);
    if (error) toast.error("Erro ao excluir: " + error.message);
    else {
      toast.success("Mensagem excluída.");
      refetchPurchases();
    }
  };

  const formatCurrency = (v: number | null) =>
    (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Ao abrir a tela de Mensagens, parar completamente o bip de notificação.
  // Também para se novos leads chegarem enquanto a tela está aberta.
  useEffect(() => {
    stopLeadNotificationSound();
  }, []);

  useEffect(() => {
    stopLeadNotificationSound();
  }, [intentions.length]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setLeadSoundEnabled(next);
    if (next) {
      // Toca um bip de teste ao ativar (também "desbloqueia" o AudioContext)
      void playLeadNotificationSound();
      toast.success("Som de notificação ativado.");
    } else {
      toast.info("Som de notificação silenciado.");
    }
  };

  // Lojista tem acesso quando JÁ comprou pacote OU já tem créditos no saldo
  // (cobre tanto compras pendentes/processadas quanto grants administrativos).
  const hasPaidPackage = purchaseHistory.some(p => p.payment_status === 'paid');
  const hasCreditsOrPackage = hasPaidPackage || (balance.available_credits ?? 0) > 0;

  const handleUnlock = async (id: string) => {
    const currentBalance = balance.available_credits ?? 0;
    // Gate único: precisa ter pacote OU créditos no saldo, e pelo menos 13 créditos
    if (!hasCreditsOrPackage || currentBalance < 13) {
      toast.error(
        currentBalance < 13 && hasCreditsOrPackage
          ? `Saldo insuficiente: você tem ${currentBalance} créd., precisa de 13. Redirecionando…`
          : 'Adquira um pacote de créditos pra liberar a leitura de mensagens.',
        { duration: 3500 }
      );
      setTimeout(() => navigate('/anunciante/creditos'), 800);
      return;
    }
    try {
      // Feedback imediato: já avisa que começou a descontar
      toast.loading('Descontando 13 créditos do seu saldo…', { id: `unlock-${id}`, duration: 2000 });
      const result = await unlockIntention(id, 13);
      if (result.success) {
        toast.success(`Contato desbloqueado! ${result.credits_charged} créditos debitados do seu pacote.`, { id: `unlock-${id}` });
      } else {
        if (result.buy_credits_cta) {
          toast.error(`Saldo insuficiente: ${result.available} créd., precisa ${result.required}. Redirecionando…`, { id: `unlock-${id}`, duration: 3000 });
          setTimeout(() => navigate('/anunciante/creditos'), 800);
        } else {
          toast.error("Erro ao desbloquear contato: " + result.error, { id: `unlock-${id}` });
        }
      }
    } catch (err: any) {
      toast.error("Erro inesperado ao desbloquear contato.", { id: `unlock-${id}` });
    }
  };

  if (isLoading) return <LoadingTransition />;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-[#F5F7FA] flex items-center gap-3">
            <MessageSquare className="w-8 h-8 text-[#FF6A00]" />
            MENSAGENS & LEADS
          </h1>
          <p className="text-sm font-medium text-[#A7B0BE] mt-2">
            Gerencie as perguntas e intenções de contato dos visitantes em seus anúncios.
          </p>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={toggleSound}
              variant="outline"
              size="sm"
              title={soundEnabled ? "Silenciar som de novos leads" : "Ativar som de novos leads"}
              className={`h-8 px-3 gap-1.5 rounded-lg border-[#2A3038] bg-[#1B1F24] hover:bg-[#22272E] font-bold uppercase text-[10px] tracking-widest ${soundEnabled ? "text-emerald-400" : "text-[#A7B0BE]"}`}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              {soundEnabled ? "Som ON" : "Som OFF"}
            </Button>
            <div className="bg-[#1B1F24] border border-[#2A3038] px-3 py-1.5 rounded-lg flex items-center gap-2">
              <span className="text-[11px] font-medium text-[#A7B0BE] uppercase tracking-wider">Plano Atual:</span>
              <span className="text-[11px] font-black text-[#FF6A00] uppercase tracking-wider">{accountData?.plan?.name || "Básico / Gratuito"}</span>
            </div>
            <div className="bg-[#1B1F24] border border-[#2A3038] px-3 py-1.5 rounded-lg flex items-center gap-2">
              <span className="text-[11px] font-medium text-[#A7B0BE] uppercase tracking-wider">Créditos Ativos:</span>
              <span className="text-[11px] font-black text-emerald-400">{balance.available_credits}</span>
            </div>
            <Button 
              onClick={() => navigate('/anunciante/creditos')}
              className="h-8 bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-black uppercase text-[10px] tracking-widest px-4 ml-1"
            >
              Adquirir Créditos
            </Button>
          </div>
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 bg-[#1B1F24] border border-red-500/30 bg-red-500/10 px-4 py-2 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-xs font-bold text-red-100">{pendingCount} leads pendentes de desbloqueio</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Ofertas via "Minha Oferta é..." ── */}
      <Card className="bg-[#0F1419] border-[#2A3038] overflow-hidden">
        <CardHeader className="border-b border-[#2A3038] py-4 px-5 flex flex-row items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] flex items-center justify-center shrink-0">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight">OFERTAS DOS COMPRADORES</h2>
              <p className="text-[10px] sm:text-xs text-[#A7B0BE] uppercase tracking-widest">
                Propostas de preço enviadas via "Minha Oferta é..."
              </p>
            </div>
          </div>
          <span className="text-[11px] font-black text-[#A7B0BE] uppercase">
            {discountRequests.length} total · {pendingDiscountRequests.length} pendente{pendingDiscountRequests.length !== 1 ? 's' : ''}
          </span>
        </CardHeader>
        <CardContent className="p-5">
          {discountRequests.length === 0 ? (
            <div className="py-8 text-center text-[#A7B0BE] text-xs font-bold uppercase tracking-widest">
              Nenhuma oferta recebida ainda
            </div>
          ) : (
            <div className="space-y-3">
              {discountRequests.map((req) => (
                <div
                  key={req.id}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    req.status === 'pending' ? 'bg-[#14171B] border-[#2563EB]/30' :
                    req.status === 'accepted' ? 'bg-emerald-950/30 border-emerald-700/40' :
                    'bg-[#14171B] border-[#2A3038] opacity-60'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex flex-1 min-w-0 gap-3">
                      <div className="w-20 h-20 rounded-xl bg-[#14171B] border border-[#2A3038] overflow-hidden shrink-0 flex items-center justify-center">
                        {req.product_image ? (
                          <img
                            src={req.product_image}
                            alt={req.product_title}
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <Package className="w-6 h-6 text-[#2A3038]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-[#F5F7FA] uppercase tracking-tight">
                          {req.customer_name || 'Comprador'}
                        </span>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                          req.status === 'pending' ? 'bg-amber-500/20 text-amber-300' :
                          req.status === 'accepted' ? 'bg-emerald-500/20 text-emerald-300' :
                          'bg-zinc-700 text-zinc-400'
                        }`}>
                          {req.status === 'pending' ? 'Pendente' :
                           req.status === 'accepted' ? 'Aceita' :
                           req.status === 'rejected' ? 'Recusada' : req.status}
                        </span>
                        {req.status === 'accepted' && req.customer_phone && (
                          <span className="text-[10px] text-emerald-300 font-bold bg-emerald-900/40 px-2 py-0.5 rounded-full">
                            📱 {req.customer_phone}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#A7B0BE] font-medium">
                        Produto: <span className="text-[#F5F7FA]">{req.product_title}</span>
                        {req.product_price && (
                          <span className="ml-2 line-through opacity-60">R$ {req.product_price}</span>
                        )}
                      </p>
                      <p className="text-2xl font-black text-[#2563EB]">
                        {formatCurrency(Number(req.requested_price))}
                        <span className="text-[10px] text-[#A7B0BE] font-bold ml-2 uppercase">oferta</span>
                      </p>
                      {req.message && (
                        <p className="text-xs text-[#A7B0BE] italic line-clamp-2">"{req.message}"</p>
                      )}
                      <p className="text-[10px] text-[#5B6571]">
                        {new Date(req.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      </div>
                    </div>

                    {req.status === 'pending' && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => respondDiscount(req.id, 'accepted')}
                          className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-wide gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Aceitar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => respondDiscount(req.id, 'rejected')}
                          className="h-9 px-3 rounded-xl border border-[#2A3038] text-[#A7B0BE] hover:text-red-400 hover:border-red-500/40 font-black text-[10px] uppercase gap-1"
                        >
                          <XCircle className="w-3 h-3" /> Recusar
                        </Button>
                      </div>
                    )}

                    {req.status === 'accepted' && (
                      <div className="flex flex-col gap-2 items-end shrink-0">
                        {req.customer_phone && (
                          <Button
                            onClick={() => callOfferer(req)}
                            className="h-11 px-5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] hover:from-[#FF7A1A] hover:to-[#FF9A1A] text-white font-black text-[11px] uppercase tracking-widest gap-2 shadow-lg shadow-orange-500/40 animate-pulse"
                          >
                            <MessageSquare className="w-4 h-4" />
                            Chamar Ofertante
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteDiscount(req.id)}
                          className="h-8 px-3 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 font-black text-[10px] uppercase gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> Excluir
                        </Button>
                      </div>
                    )}

                    {req.status === 'rejected' && (
                      <div className="shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteDiscount(req.id)}
                          className="h-9 px-3 rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 font-black text-[10px] uppercase gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> Excluir
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>


      {/* ── Pacotes Adquiridos: histórico de compras + saldo atual ── */}
      <Card className="bg-[#0F1419] border-[#2A3038] overflow-hidden">
        <CardHeader className="border-b border-[#2A3038] py-4 px-5 flex flex-row items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF6A00] to-[#FF8A33] flex items-center justify-center shrink-0">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-white tracking-tight">PACOTES ADQUIRIDOS</h2>
              <p className="text-[10px] sm:text-xs text-[#A7B0BE] uppercase tracking-widest">
                Créditos usados pra ler mensagens e desbloquear leads
              </p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto">
            <div className="bg-emerald-500/10 border border-emerald-500/30 px-[30.5px] py-[13px] rounded-xl text-center shadow-lg shadow-emerald-500/10">
              <p className="text-[18.5px] font-bold uppercase tracking-widest text-emerald-300">Saldo atual</p>
              <p className="text-[37px] font-black text-emerald-400 leading-tight">{balance.available_credits} <span className="text-[20.7px] text-emerald-300">créd.</span></p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingHistory ? (
            <div className="p-6 text-center text-sm text-[#A7B0BE]">Carregando histórico…</div>
          ) : purchaseHistory.length === 0 ? (
            <div className="p-6 text-center space-y-3">
              <Package className="w-10 h-10 text-[#A7B0BE]/40 mx-auto" />
              <p className="text-sm text-[#A7B0BE]">Você ainda não comprou nenhum pacote de créditos.</p>
              <Button
                onClick={() => navigate('/anunciante/creditos')}
                className="bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-bold uppercase text-[11px] tracking-wider h-auto py-3 px-5 leading-tight whitespace-normal text-center max-w-[280px] mx-auto"
              >
                Adquira pacotes<br className="sm:hidden" />
                <span className="hidden sm:inline"> </span>
                e feche suas vendas
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-[#2A3038]">
              {purchaseHistory.slice(0, 10).map((p) => {
                const statusMap: Record<string, { label: string; icon: any; color: string }> = {
                  paid: { label: 'Pago', icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
                  pending: { label: 'Pendente', icon: Hourglass, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
                  processing: { label: 'Processando', icon: Hourglass, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
                  failed: { label: 'Falhou', icon: XCircle, color: 'text-red-400 bg-red-500/10 border-red-500/30' },
                  cancelled: { label: 'Cancelado', icon: XCircle, color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30' },
                  expired: { label: 'Expirado', icon: XCircle, color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30' },
                };
                const cfg = statusMap[p.payment_status] || statusMap.pending;
                const StatusIcon = cfg.icon;
                const dateBR = new Date(p.paid_at || p.created_at).toLocaleDateString('pt-BR', {
                  day: '2-digit', month: '2-digit', year: '2-digit',
                });
                return (
                  <div key={p.id} className="px-5 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-[#1B1F24] border border-[#2A3038] flex items-center justify-center">
                      <Package className="w-4 h-4 text-[#FF6A00]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">
                        {p.credits_total} crédito{p.credits_total > 1 ? 's' : ''}
                        <span className="text-[#A7B0BE] font-medium ml-2">· {p.amount_brl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                      </p>
                      <p className="text-[11px] text-[#A7B0BE]">
                        {dateBR}{p.provider_name && ` · via ${p.provider_name}`}
                      </p>
                    </div>
                    <div className={`shrink-0 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1 ${cfg.color}`}>
                      <StatusIcon className="w-3 h-3" />
                      {cfg.label}
                    </div>
                  </div>
                );
              })}
              {purchaseHistory.length > 10 && (
                <div className="px-5 py-2 text-center text-[10px] text-[#A7B0BE]">
                  Mostrando 10 mais recentes de {purchaseHistory.length} compras
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {purchaseIntentions.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-black tracking-widest uppercase text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Pedidos recebidos ({purchaseIntentions.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {purchaseIntentions.map((pi) => (
              <Card key={pi.id} className="bg-yellow-50 border-2 border-yellow-300 shadow-lg overflow-hidden flex flex-col relative">
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-yellow-400 to-amber-500" />
                <div className="px-4 pt-4 flex items-center justify-between gap-2 flex-wrap">
                  <div className="inline-flex items-center gap-2 bg-yellow-500 text-zinc-900 text-[16px] font-black uppercase tracking-widest px-4 py-2 rounded-full shadow">
                    <Package className="w-5 h-5" /> Pedido vindo de Marketplace
                  </div>
                  {unlockedOrders.has(pi.id) ? (
                    <span className="inline-flex items-center gap-1.5 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow">
                      <Unlock className="w-3 h-3" /> Desbloqueado
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 bg-zinc-700 text-zinc-200 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full shadow">
                      <Lock className="w-3 h-3" /> Bloqueado
                    </span>
                  )}
                </div>
                <CardHeader className="p-5 pt-3 pb-2">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-yellow-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-yellow-800">Dados confirmados</p>
                        <p className="text-[10px] text-yellow-600">Mini-cadastro ativo</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-yellow-800/70 font-bold flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(pi.created_at).toLocaleString("pt-BR")}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-yellow-700/60 hover:text-red-600 hover:bg-red-500/10 rounded-full"
                        onClick={() => handleDeletePurchase(pi.id)}
                        title="Excluir mensagem"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-5 pt-2 flex flex-col flex-1 space-y-3">
                  <div className="space-y-1.5 text-sm text-yellow-900">
                    <p className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> {pi.customer_name || "Anônimo"}</p>

                    {(pi.customer_bairro || pi.customer_city) && (
                      <p className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" />
                        {[pi.customer_bairro, pi.customer_city].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-yellow-300/70">
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-bold text-yellow-800 flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5" /> Itens do Pedido
                      </span>
                      <span className="text-xs font-bold text-yellow-800">{pi.total_items ?? 0} item(ns)</span>
                    </div>
                    <div className="space-y-2">
                      {pi.items.map((it) => (
                        <div key={it.id} className="flex items-center gap-2 text-xs text-yellow-800">
                          <div className="w-[99px] h-[99px] rounded-lg bg-white border border-yellow-300 overflow-hidden shrink-0 flex items-center justify-center">
                            {it.product_image_url ? (
                              <img
                                src={it.product_image_url}
                                alt={it.product_title || "Produto"}
                                className="w-full h-full object-cover"
                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : (
                              <Package className="w-10 h-10 text-yellow-400" />
                            )}
                          </div>
                          <span className="line-clamp-2 flex-1">{it.quantity}x {it.product_title || "Produto"}</span>
                          <span className="font-bold shrink-0">{formatCurrency(it.subtotal ?? (it.unit_price ?? 0) * it.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between pt-3 border-t border-yellow-300/70">
                    <span className="text-sm font-black text-yellow-900">Total Geral</span>
                    <span className="text-sm font-black text-yellow-900">{formatCurrency(pi.subtotal)}</span>
                  </div>

                  {pi.customer_whatsapp && (
                    <div className="mt-auto space-y-2">
                      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-yellow-100 border border-yellow-400">
                        <span className="text-[10px] font-black uppercase tracking-wider text-yellow-800 flex items-center gap-1">
                          ⚠️ Custa {CREDIT_COSTS.advertiser_unlock_order_whatsapp} créditos ao chamar
                        </span>
                        <span className="text-[10px] font-bold text-yellow-800">
                          Saldo: {balance.available_credits ?? 0}
                        </span>
                      </div>
                      <Button
                        disabled={(balance.available_credits ?? 0) < CREDIT_COSTS.advertiser_unlock_order_whatsapp}
                        onClick={async () => {
                          const ok = await debitOrderCallCredits(pi.id);
                          if (!ok) return;
                          markOrderUnlocked(pi.id);
                          window.open(`https://wa.me/55${pi.customer_whatsapp!.replace(/\D/g, "")}`, "_blank");
                        }}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-300 disabled:text-zinc-500 text-white font-black uppercase text-[11px] tracking-widest h-11 gap-2"
                      >
                        <MessageSquare className="w-4 h-4" /> Chamar Cliente no WhatsApp (-{CREDIT_COSTS.advertiser_unlock_order_whatsapp} cr)
                      </Button>
                      {(balance.available_credits ?? 0) < CREDIT_COSTS.advertiser_unlock_order_whatsapp && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] text-red-600 font-bold uppercase tracking-wider text-center">
                            saldo insuficiente
                          </p>
                          <Button
                            size="sm"
                            onClick={() => navigate('/anunciante/creditos')}
                            className="w-full h-9 rounded-lg bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] hover:from-[#FF7A1A] hover:to-[#FF9A1A] text-white font-black text-[10px] uppercase tracking-widest gap-1 shadow-lg shadow-orange-500/40 animate-pulse"
                          >
                            🪙 Comprar Créditos
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {intentions.length === 0 && purchaseIntentions.length === 0 ? (
        <Card className="bg-[#1B1F24] border-[#2A3038] py-16 flex flex-col items-center text-center shadow-xl shadow-black/20">
          <div className="w-20 h-20 bg-[#14171B] border border-[#2A3038] rounded-full flex items-center justify-center mb-6">
            <MessageSquare className="w-8 h-8 text-[#A7B0BE]" />
          </div>
          <h3 className="text-xl font-black text-[#F5F7FA] uppercase">Nenhum Lead Recebido</h3>
          <p className="text-[#A7B0BE] font-medium max-w-sm mt-3">
            Você ainda não recebeu contatos ou perguntas. Melhorar as fotos e descrições dos seus anúncios pode ajudar!
          </p>
        </Card>
      ) : intentions.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {intentions.map((lead) => {
            // Acesso gratuito: enquanto o lojista NÃO comprou nenhum pacote,
            // todas as mensagens aparecem desbloqueadas. Após a primeira compra,
            // só desbloqueia mediante crédito (lead.status === 'unlocked').
            const isUnlocked = lead.status === "unlocked";

            return (
              <Card key={lead.id} className="bg-[#F5E62B] border border-[#E0D020] shadow-lg overflow-hidden flex flex-col relative group">
                {!isUnlocked && (
                  <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-orange-500 to-red-500" />
                )}
                {isUnlocked && (
                  <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
                )}

                <CardHeader className="p-5 pb-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-full border border-zinc-800">
                      {isUnlocked ? (
                        <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Lock className="w-3.5 h-3.5 text-red-400" />
                      )}
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#F5F7FA]">
                        {isUnlocked ? "DESBLOQUEADO" : "BLOQUEADO"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-800 font-bold uppercase tracking-wider">
                        <Clock className="w-3 h-3" />
                        {new Date(lead.created_at).toLocaleDateString()}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-zinc-600 hover:text-red-600 hover:bg-red-500/10 rounded-full transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm("Tem certeza que deseja excluir esta mensagem?")) {
                            void (async () => {
                              const res = await deleteIntention(lead.id);
                              if (res.success) toast.success("Mensagem excluída.");
                              else toast.error("Erro ao excluir: " + res.error);
                            })();
                          }
                        }}
                        title="Excluir mensagem"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-5 pt-2 flex flex-col flex-1 space-y-4">
                  {/* Anúncio de interesse */}
                  {(() => {
                    const isRE = lead.listing_module === "real_estate";
                    const isProd = lead.listing_module === "product";
                    const ModuleIcon = isRE ? Building2 : isProd ? Package : Car;
                    const moduleLabel = isRE ? "Imóvel" : isProd ? "Produto" : "Veículo";
                    return (
                      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                        {lead.listing_image_url ? (
                          <img
                            src={lead.listing_image_url}
                            alt={lead.listing_title || "Anúncio"}
                            className="w-full h-40 object-cover"
                            loading="lazy"
                            onError={(e) => {
                              // Esconde a img quebrada e deixa o fallback aparecer no próximo render
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-40 flex flex-col items-center justify-center gap-2 bg-zinc-900 px-4">
                            <ModuleIcon className="w-10 h-10 text-zinc-700" />
                            {!lead.listing_title ? (
                              <p className="text-[10px] text-zinc-500 text-center leading-tight">
                                Anúncio removido pelo autor
                              </p>
                            ) : null}
                          </div>
                        )}
                        <div className="flex items-start gap-2 px-3 py-2 border-t border-zinc-800">
                          <ModuleIcon className="w-4 h-4 text-[#FF6A00] shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
                              Interesse em
                            </div>
                            <div className="text-[13px] font-bold text-[#F5F7FA] line-clamp-2 leading-tight">
                              {lead.listing_title || moduleLabel}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="space-y-1">
                    <div className="flex items-center gap-3 border-b border-zinc-900/20 pb-3 mb-3">
                      <h4 className="text-zinc-900 font-black text-lg line-clamp-1">
                        {isUnlocked
                          ? lead.visitor_name
                          : (() => {
                              const firstName = lead.visitor_name?.trim().split(/\s+/)[0];
                              if (!firstName) return "Mensagem anônima";
                              // Mostra só as 2 primeiras letras + ***  (ex: "Júlia" → "Jú***")
                              const visible = firstName.slice(0, 2);
                              return `${visible}***`;
                            })()}
                      </h4>
                      <svg className="w-10 h-10 shrink-0 fill-[#25D366] drop-shadow-lg" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                      </svg>
                    </div>
                    <p className="text-[#FF6A00] font-bold text-xl animate-pulse">
                      ⏳ está aguardando seu retorno!!!
                    </p>
                    {!isUnlocked ? (
                      <p className="text-zinc-900 font-mono text-sm tracking-widest bg-black/20 p-2 rounded-lg text-center border border-dashed border-zinc-900/30">
                        {lead.masked_preview}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-[#FF6A00] font-mono bg-[#FF6A00]/10 p-2.5 rounded-lg border border-[#FF6A00]/30">
                          <Phone className="w-4 h-4" />
                          {lead.visitor_phone || "Não informado"}
                        </div>
                        {lead.visitor_message && (
                          <div className="text-sm text-[#A7B0BE] bg-[#14171B] p-3 rounded-lg border border-[#2A3038] italic">
                            "{lead.visitor_message}"
                          </div>
                        )}
                        {(lead.city || lead.region) && (
                          <div className="flex items-center gap-2 text-[11px] text-zinc-800 font-bold uppercase tracking-widest">
                            <MapPin className="w-3.5 h-3.5 text-[#FF6A00]" /> 
                            {[lead.city, lead.region].filter(Boolean).join(" - ")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="mt-auto pt-4 border-t border-zinc-900/20">
                    {!isUnlocked ? (
                      <div className="space-y-2">
                        {(() => {
                          const hasEnoughCredits = (balance.available_credits ?? 0) >= 13;
                          const firstName = lead.visitor_name?.trim().split(/\s+/)[0] || "cliente";
                          // Mostra primeiro nome mascarado pro contexto, mas o lojista sabe quem é só após desbloquear
                          const maskedName = firstName.slice(0, 2) + "***";
                          return (
                            <>
                              <Button
                                onClick={() => handleUnlock(lead.id)}
                                className="w-full bg-zhiq-teal hover:bg-zhiq-green text-white font-black uppercase text-sm sm:text-base tracking-wider h-auto min-h-14 py-2 shadow-lg shadow-emerald-900/30 gap-2 px-3 flex-col"
                              >
                                <span className="flex items-center gap-2 leading-tight">
                                  <Unlock className="w-5 h-5 shrink-0" />
                                  Falar com {maskedName}
                                </span>
                                <span className="text-[10px] font-bold tracking-widest opacity-90">
                                  custo: 13 créditos
                                </span>
                              </Button>
                              <div className="text-center text-sm sm:text-base font-black text-zinc-700 uppercase tracking-wider mt-1">
                                Saldo Atual: <span className={hasEnoughCredits ? "text-emerald-700" : "text-red-600"}>{balance.available_credits} Créditos</span>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={() => window.open(`https://wa.me/55${lead.visitor_phone?.replace(/\D/g, "")}`, "_blank")}
                        className="w-full border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 font-black uppercase text-[11px] tracking-widest h-12 gap-2"
                      >
                        <MessageSquare className="w-4 h-4" /> 
                        Chamar no WhatsApp
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
