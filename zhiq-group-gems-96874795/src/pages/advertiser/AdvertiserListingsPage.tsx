import { useNavigate } from "react-router-dom";
import React, { useState, useMemo } from "react";
import {
  Package,
  Plus,
  Search,
  ShoppingBag,
  Eye,
  Edit,
  MoreVertical,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Trash2,
  MapPin,
  Gavel,
  Tag,
  Timer,
  MessageSquare,
  CheckCheck,
  X,
  Inbox,
  Coins,
  Users,
  Bell,
  Lock as LockIcon,
  Unlock as UnlockIcon,
  Play,
  Pause,
  Send,
  Star,
  Brain,
  Sparkles,
  LayoutGrid,
  List as ListIcon,
  Share2,
  Activity,
  Calendar,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdvertiserCommercialRuleCard } from "@/components/advertiser/AdvertiserCommercialRuleCard";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useAdvertiserArremate } from "@/hooks/useAdvertiserArremate";
import { useAdvertiserCredits } from "@/hooks/useAdvertiserCredits";
import { useAdvertiserLeadsDashboard } from "@/hooks/useAdvertiserLeadsDashboard";
import { LeadCard } from "@/components/advertiser/LeadCard";
import { AdvertiserCreditPackagesPanel } from "@/components/advertiser/AdvertiserCreditPackagesPanel";
import { useAdvertiserCampaignDispatch } from "@/hooks/useAdvertiserCampaignDispatch";
import { unlockContact, centsToBRL } from "@/lib/credits/unlockContact";
import { playNotificationSound } from "@/lib/notificationSound";

// ─── Countdown inline ────────────────────────────────────────
function InlineCountdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const diff = new Date(endsAt).getTime() - now;
  if (diff <= 0) return <span className="text-[10px] text-red-500 font-bold">Encerrado</span>;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const isUrgent = diff < 3600000;
  return (
    <span className={cn("font-mono text-[10px] font-bold tabular-nums", isUrgent && "text-red-500 animate-pulse")}>
      {String(h).padStart(2,'0')}:{String(m).padStart(2,'0')}:{String(s).padStart(2,'0')}
    </span>
  );
}

// ─── Badge de modalidade ─────────────────────────────────────
function ListingModeBadge({ mode, endsAt }: { mode: string; endsAt?: string }) {
  if (mode === 'auction') {
    return (
      <span className="flex items-center gap-1 px-2.5 py-1 bg-[#FF6A00]/10 text-[#FF6A00] text-[9px] font-black uppercase rounded-full border border-[#FF6A00]/20">
        <Gavel className="w-2.5 h-2.5" />
        Leilão
        {endsAt && <> · <InlineCountdown endsAt={endsAt} /></>}
      </span>
    );
  }
  if (mode === 'arremate') {
    return (
      <span className="flex items-center gap-1 px-2.5 py-1 bg-[#E6E6FA]/10 text-[#E6E6FA] text-[9px] font-black uppercase rounded-full border border-[#E6E6FA]/20">
        <Tag className="w-2.5 h-2.5" />
        Arremate
      </span>
    );
  }
  return null;
}

type TabId = 'listings' | 'offers' | 'intentions';

export default function AdvertiserListingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>('listings');

  // ── Novas UI states ──
  const [statusFilter, setStatusFilter] = useState<"all"|"active"|"paused"|"review">("all");
  const [viewMode, setViewMode] = useState<"grid"|"list">("list");
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("viagg_fav_mercado") || "[]")); }
    catch { return new Set<string>(); }
  });

  const toggleFav = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem("viagg_fav_mercado", JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const handleShare = (id: string) => {
    const url = `${window.location.origin}/produto/${id}`;
    navigator.clipboard?.writeText(url).then(() => toast.success("Link copiado!")).catch(() => {});
  };

  // ── Hooks de leilão e créditos ──
  const { receivedOffers, loadingOffers, respondOffer } = useAdvertiserArremate();
  const { acceptArremateOfferWithCredits, balance, usageRules } = useAdvertiserCredits();

  // ── Hook unificado de leads + créditos (anunciante) ──
  const {
    dashboard,
    leads,
    leadsLoading: intentionsLoading,
    unlockLead,
    pollPurchaseStatus,
    refetchAll,
  } = useAdvertiserLeadsDashboard();

  const pendingCount = dashboard.leads_pending;

  // Custo por aceite (do admin)
  const contactCost = usageRules.find(r => r.feature_code === 'offer_accept_contact_unlock')?.credits_cost ?? 2;
  const intentionCost = usageRules.find(r => r.feature_code === 'purchase_intention_received')?.credits_cost ?? 5;
  const totalAcceptCost = contactCost + intentionCost;

  // ── Hook de envio para fila de postagem ──
  const { dispatch: dispatchToQueue, loadingId: dispatchingId } = useAdvertiserCampaignDispatch();

  // ── Estado da aba de Interessados ──
  const [showBuyPanel, setShowBuyPanel] = React.useState(false);

  const pendingOffersCount = receivedOffers.filter(o => o.status === 'pending').length;

  // ── Query de discount_requests (Minha Oferta é...) ──
  const discountRequestsQuery = useQuery({
    queryKey: ['advertiser-discount-requests', user?.id],
    enabled: !!user,
    refetchInterval: 10000,
    queryFn: async () => {
      const storeIds: string[] = [];

      // Coleta TODOS os advertiser_accounts do usuário
      const { data: advList } = await (supabase.from('advertiser_accounts' as any)
        .select('id').eq('user_id', user!.id)) as any;
      ((advList || []) as any[]).forEach((a: any) => { if (a?.id) storeIds.push(a.id); });

      // Coleta TODAS as merchant_stores do usuário
      const { data: msList } = await (supabase.from('merchant_stores' as any)
        .select('id').eq('user_id', user!.id)) as any;
      ((msList || []) as any[]).forEach((s: any) => { if (s?.id && !storeIds.includes(s.id)) storeIds.push(s.id); });

      if (storeIds.length === 0) return [] as any[];

      const { data, error } = await supabase
        .from('discount_requests' as any)
        .select('*')
        .in('store_id', storeIds)
        .neq('status', 'deleted')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[discount_requests] error:', error);
        return [] as any[];
      }

      // Buscar títulos + imagens dos produtos
      const productIds = [...new Set((data || []).map((r: any) => r.product_id).filter(Boolean))];
      const infoMap: Record<string, { title: string; image: string | null }> = {};

      const resolveStorage = async (raw: string | null | undefined): Promise<string | null> => {
        if (!raw) return null;
        if (/^https?:\/\//i.test(raw)) {
          // Tenta signed URL para URLs públicas que podem estar bloqueadas por RLS
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
        const [adv, mkt, mediaRows] = await Promise.all([
          supabase.from('advertiser_listings' as any).select('id, title, cover_image_url').in('id', productIds),
          supabase.from('merchant_marketing_products' as any).select('id, title, image_url').in('id', productIds),
          supabase.from('advertiser_listing_media' as any).select('listing_id, media_url, storage_path').in('listing_id', productIds),
        ]);

        // Mapa de fallbacks (primeiro media de cada listing)
        const mediaByListing: Record<string, string> = {};
        for (const m of (mediaRows.data ?? []) as any[]) {
          if (!mediaByListing[m.listing_id]) {
            mediaByListing[m.listing_id] = m.media_url || m.storage_path;
          }
        }

        for (const row of (adv.data ?? []) as any[]) {
          const candidate = row.cover_image_url || mediaByListing[row.id];
          const img = await resolveStorage(candidate);
          infoMap[row.id] = { title: row.title, image: img };
        }
        for (const row of (mkt.data ?? []) as any[]) {
          if (!infoMap[row.id]) infoMap[row.id] = { title: row.title, image: row.image_url ?? null };
        }
      }
      return (data || []).map((r: any) => ({
        ...r,
        product_title: infoMap[r.product_id]?.title ?? 'Produto',
        product_image: infoMap[r.product_id]?.image ?? null,
      }));
    },
  });
  const discountRequests = (discountRequestsQuery.data ?? []) as any[];
  const pendingDiscountCount = discountRequests.filter(r => r.status === 'pending').length;


  const [calledOffers, setCalledOffers] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('called-offers');
      if (!raw) return new Set();
      return new Set(JSON.parse(raw));
    } catch { return new Set(); }
  });

  const markAsCalled = (id: string) => {
    setCalledOffers(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem('called-offers', JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const deleteDiscountRequest = async (id: string) => {
    if (!window.confirm('Excluir esta oferta?')) return;
    const { error } = await supabase
      .from('discount_requests' as any)
      .delete()
      .eq('id', id);
    if (error) {
      toast.error(`Erro: ${error.message}`);
      return;
    }
    toast.success('Oferta excluída.');
    setCalledOffers(prev => {
      const next = new Set(prev);
      next.delete(id);
      try { localStorage.setItem('called-offers', JSON.stringify([...next])); } catch {}
      return next;
    });
    queryClient.invalidateQueries({ queryKey: ['advertiser-discount-requests', user?.id] });
  };

  const respondDiscountRequest = async (id: string, newStatus: 'accepted' | 'rejected') => {
    // Aceitar oferta = liberar comprador via Wallet Core (2% do valor anunciado, permanente).
    if (newStatus === 'accepted') {
      const req = discountRequests.find((r: any) => r.id === id);
      if (!req?.product_id) { toast.error("Oferta sem produto vinculado."); return; }
      const buyerKey = String(req.customer_phone ?? "").replace(/\D/g, "") || id;
      const res = await unlockContact(
        "product", req.product_id, buyerKey,
        Math.round(Number(req.product_price ?? req.requested_price ?? 0) * 100),
      );
      if (!res.success) {
        if (res.error === "insufficient_credits") {
          toast.error(`Saldo insuficiente (precisa ${centsToBRL(res.required_cents)}, tem ${centsToBRL(res.available_cents)}). Adicione créditos.`);
          setTimeout(() => navigate("/anunciante/carteira"), 1400);
          return;
        }
        toast.error(`Erro ao liberar comprador: ${res.error ?? "desconhecido"}`);
        return;
      }
      if (!res.already_unlocked && (res.charged_cents ?? 0) > 0) {
        toast.success(`Comprador liberado! ${centsToBRL(res.charged_cents)} debitados — Saldo: ${centsToBRL(res.balance_cents)}`);
      }
      queryClient.invalidateQueries({ queryKey: ["wallet-balance", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["advertiser-credits"] });
    }
    const { error } = await supabase
      .from('discount_requests' as any)
      .update({ status: newStatus })
      .eq('id', id);
    if (error) {
      toast.error(`Erro: ${error.message}`);
      return;
    }
    toast.success(newStatus === 'accepted' ? 'Oferta aceita!' : 'Oferta recusada.');
    queryClient.invalidateQueries({ queryKey: ['advertiser-discount-requests', user?.id] });
  };

  // ── Query de listings ──
  const listingsQuery = useQuery({
    queryKey: ["advertiser-unified-listings", user?.id],
    enabled: !!user,
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    staleTime: 0,
    queryFn: async () => {
      // Step 1: get all account IDs for this user
      const { data: accts } = await (supabase
        .from('advertiser_accounts' as any)
        .select('id')
        .eq('user_id', user!.id) as any);
      const accountIds = ((accts || []) as any[]).map((a: any) => a.id).filter(Boolean);

      const [pRes, mRes] = await Promise.all([
        accountIds.length > 0
          ? (supabase.from("advertiser_listings" as any)
              .select(`*, advertiser_listing_media(media_url)`)
              .in("advertiser_account_id", accountIds) as any)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("merchant_marketing_products" as any)
          .select(`id, title, image_url, price_label, category, is_active, created_at, campaign_type`)
          .eq("created_by_user_id", user?.id),
      ]);

      const normalized: any[] = [];

      ((pRes as any).data || []).forEach((item: any) => {
        const mediaFallback = item.advertiser_listing_media?.[0]?.media_url ?? null;
        let pUrl = item.cover_image_url || mediaFallback;
        if (pUrl && !pUrl.startsWith('http')) {
          pUrl = supabase.storage.from('marketing-materials').getPublicUrl(pUrl).data.publicUrl;
        }
        normalized.push({
          id: item.id, title: item.title, category: 'produto',
          city: item.city || '', state: '',
          price: item.price || 0,
          status: item.listing_status,
          image: pUrl,
          storageBucket: null,
          typeLabel: item.category || 'Produto',
          listingMode: 'normal',
          source: 'advertiser_listings',
          raw: item,
        });
      });

      ((mRes as any).data || []).forEach((item: any) => {
        const priceNum = parseFloat(String(item.price_label).replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
        normalized.push({
          id: item.id, title: item.title, category: 'produto',
          city: '', state: '',
          price: priceNum,
          status: item.is_active ? 'active' : 'paused',
          image: item.image_url || null,
          storageBucket: null,
          typeLabel: item.category || item.campaign_type || 'Produto da Loja',
          listingMode: 'normal',
          source: 'merchant_marketing_products',
          raw: item,
        });
      });

      return normalized.sort((a, b) => new Date(b.raw.created_at).getTime() - new Date(a.raw.created_at).getTime());
    }
  });

  // ── Realtime: novo/atualizado/excluído anúncio → revalida imediatamente ──
  React.useEffect(() => {
    if (!user?.id) return;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["advertiser-unified-listings", user.id] });
    };

    const invalidateDiscount = () => {
      queryClient.invalidateQueries({ queryKey: ['advertiser-discount-requests', user.id] });
    };

    const channel = supabase
      .channel(`advertiser-listings-realtime-${user.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "advertiser_listings",
      }, invalidate)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "merchant_marketing_products",
        filter: `created_by_user_id=eq.${user.id}`,
      }, invalidate)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "discount_requests",
      }, (payload) => {
        invalidateDiscount();
        if (payload.eventType === 'INSERT') {
          playNotificationSound(); // 🔔 cha-ching!
          toast.success('🔔 Nova oferta recebida!', {
            duration: 10000,
            action: {
              label: 'Ver Oferta',
              onClick: () => setActiveTab('offers'),
            },
            cancel: {
              label: 'Comprar Créditos',
              onClick: () => navigate('/anunciante/creditos'),
            },
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const getStatusBadge = (status: string) => {
    const s = status?.toLowerCase();
    if (s === 'published' || s === 'active') {
      return <span className="flex items-center gap-1.5 px-3 py-1 bg-[#22C55E]/10 text-[#22C55E] text-[10px] font-black uppercase rounded-full border border-[#22C55E]/20"><CheckCircle2 className="w-3 h-3" /> Publicado</span>;
    }
    if (s === 'pending_review' || s === 'moderating') {
      return <span className="flex items-center gap-1.5 px-3 py-1 bg-[#FF6A00]/10 text-[#FF6A00] text-[10px] font-black uppercase rounded-full border border-[#FF6A00]/20"><Clock className="w-3 h-3" /> Em Análise</span>;
    }
    if (s === 'draft') {
      return <span className="flex items-center gap-1.5 px-3 py-1 bg-[#2A3038] text-[#A7B0BE] text-[10px] font-black uppercase rounded-full border border-[#2A3038]"><Edit className="w-3 h-3" /> Rascunho</span>;
    }
    if (s === 'paused') {
      return <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-400/10 text-amber-400 text-[10px] font-black uppercase rounded-full border border-amber-400/20"><Clock className="w-3 h-3" /> Anúncio Pausado</span>;
    }
    return <span className="flex items-center gap-1.5 px-3 py-1 bg-[#EF4444]/10 text-[#EF4444] text-[10px] font-black uppercase rounded-full border border-[#EF4444]/20"><AlertCircle className="w-3 h-3" /> {status}</span>;
  };

  const deleteListing = useMutation({
    mutationFn: async ({ id, source }: { id: string, category: string, source?: string }) => {
      const table = source === 'merchant_marketing_products' ? 'merchant_marketing_products' : 'advertiser_listings';
      const { error } = await supabase.from(table as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { listingsQuery.refetch(); toast.success("Anúncio excluído com sucesso."); },
    onError: (err: any) => toast.error(`Erro: ${err.message}`)
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, currentStatus, source }: { id: string, category: string, currentStatus: string, source?: string }) => {
      const s = currentStatus?.toLowerCase();
      const isCurrentlyActive = s === 'active' || s === 'published' || s === 'active_published';
      if (source === 'merchant_marketing_products') {
        const { error } = await supabase.from("merchant_marketing_products" as any)
          .update({ is_active: !isCurrentlyActive }).eq("id", id);
        if (error) throw error;
      } else {
        const newStatus = isCurrentlyActive ? 'paused' : 'active';
        const { error } = await supabase.from("advertiser_listings" as any)
          .update({ listing_status: newStatus }).eq("id", id);
        if (error) throw error;
      }
      return isCurrentlyActive ? 'paused' : 'active';
    },
    onSuccess: (newStatus) => { 
      listingsQuery.refetch(); 
      if (newStatus === 'published' || newStatus === 'active') {
        toast.success("Anúncio ativado com sucesso!"); 
      } else {
        toast.success("Anúncio Pausado");
      }
    },
    onError: (err: any) => toast.error(`Erro ao alterar status: ${err.message}`)
  });

  // KPI computado dos dados carregados
  const kpi = useMemo(() => {
    const all = listingsQuery.data ?? [];
    return {
      total:  all.length,
      active: all.filter(l => ["active","published"].includes(l.status?.toLowerCase())).length,
      paused: all.filter(l => l.status?.toLowerCase() === "paused").length,
      review: all.filter(l => ["pending_review","moderating"].includes(l.status?.toLowerCase())).length,
    };
  }, [listingsQuery.data]);

  const filteredListings = listingsQuery.data?.filter(l => {
    const matchesSearch = (
      l.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.city?.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const s = l.status?.toLowerCase();
    const matchesStatus =
      statusFilter === "all" ? true :
      statusFilter === "active" ? ["active","published"].includes(s) :
      statusFilter === "paused" ? s === "paused" :
      statusFilter === "review" ? ["pending_review","moderating"].includes(s) : true;
    return matchesSearch && matchesStatus;
  });

  // ── Aceitar oferta com créditos ──
  const handleAcceptOffer = async (offerId: string) => {
    await acceptArremateOfferWithCredits(offerId);
    queryClient.invalidateQueries({ queryKey: ["advertiser-arremate-offers"] });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* ── Header com KPI ── */}
      <div className="bg-gradient-to-br from-[#FF6A00] to-[#E05A00] -mx-4 md:-mx-6 -mt-6 px-6 pt-8 pb-6 mb-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-3">
              <Package className="w-7 h-7 text-white/80" />
              MEUS ANÚNCIOS — MERCADO
            </h1>
            <p className="text-white/70 text-sm mt-1">Gerencie suas ofertas e acompanhe o status de cada publicação.</p>
          </div>
          <Button
            onClick={() => navigate("/anunciante/anuncios/novo")}
            className="bg-white text-[#FF6A00] font-black uppercase text-xs tracking-widest h-11 px-5 rounded-xl shadow-lg gap-2 hover:bg-white/90 shrink-0"
          >
            <Plus className="w-4 h-4" /> Novo Anúncio
          </Button>
        </div>

        {/* KPI bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: "Total",      value: kpi.total,  icon: Activity,     color: "text-white"       },
            { label: "Publicados", value: kpi.active, icon: CheckCircle2, color: "text-green-200"   },
            { label: "Pausados",   value: kpi.paused, icon: Clock,        color: "text-orange-200"  },
            { label: "Em Análise", value: kpi.review, icon: AlertCircle,  color: "text-yellow-200"  },
          ].map(k => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="bg-white/10 border border-white/20 rounded-xl px-3 py-2 flex items-center gap-2">
                <Icon className={cn("h-4 w-4 shrink-0", k.color)} />
                <div>
                  <div className="text-xl font-black text-white leading-none">{k.value}</div>
                  <div className="text-[10px] text-white/60">{k.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AdvertiserCommercialRuleCard />

      {/* ── Tabs ── */}
      <div className="flex gap-2 bg-[#0D0F12] p-1 rounded-2xl w-fit flex-wrap border border-[#2A3038]">
        <button
          onClick={() => setActiveTab('listings')}
          className={cn(
            'px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all',
            activeTab === 'listings' ? 'bg-[#FF6A00] text-white shadow-sm shadow-[#FF6A00]/30' : 'text-[#A7B0BE] hover:text-[#F5F7FA]'
          )}
        >
          Anúncios
        </button>
        <button
          onClick={() => setActiveTab('offers')}
          className={cn(
            'px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2',
            activeTab === 'offers' ? 'bg-[#FF6A00] text-white shadow-sm shadow-[#FF6A00]/30' : 'text-[#A7B0BE] hover:text-[#F5F7FA]'
          )}
        >
          Ofertas Recebidas
          {(pendingOffersCount + pendingDiscountCount) > 0 && (
            <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[9px] font-black flex items-center justify-center animate-bounce">
              {pendingOffersCount + pendingDiscountCount}
            </span>
          )}
        </button>
      </div>

      {/* ──────────────────────────────────────────────── */}
      {/* TAB: ANÚNCIOS                                   */}
      {/* ──────────────────────────────────────────────── */}
      {activeTab === 'listings' && (
        <>

          {/* Search + View Toggle */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A7B0BE] group-focus-within:text-[#FF6A00] transition-colors" />
              <Input
                placeholder="Buscar por título, cidade ou categoria..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 h-11 rounded-xl border-[#2A3038] bg-[#1B1F24] text-[#F5F7FA] placeholder:text-[#A7B0BE] focus-visible:ring-[#FF6A00]/20 focus-visible:border-[#FF6A00] transition-all font-medium"
              />
            </div>
            <div className="flex gap-1 bg-[#1B1F24] border border-[#2A3038] rounded-xl p-1 shrink-0">
              <button onClick={() => setViewMode("grid")} className={cn("p-2 rounded-lg transition-colors", viewMode === "grid" ? "bg-[#FF6A00] text-white" : "text-[#A7B0BE] hover:text-white")} title="Grade"><LayoutGrid className="h-4 w-4" /></button>
              <button onClick={() => setViewMode("list")} className={cn("p-2 rounded-lg transition-colors", viewMode === "list" ? "bg-[#FF6A00] text-white" : "text-[#A7B0BE] hover:text-white")} title="Lista"><ListIcon className="h-4 w-4" /></button>
            </div>
          </div>

          {/* Status filter tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {([
              { key: "all",    label: "Todos",       count: kpi.total  },
              { key: "active", label: "✓ Publicados", count: kpi.active },
              { key: "paused", label: "⏸ Pausados",  count: kpi.paused },
              { key: "review", label: "🕐 Em Análise",count: kpi.review },
            ] as const).map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap transition-all",
                  statusFilter === f.key
                    ? "bg-[#FF6A00] text-white border-[#FF6A00] shadow-sm shadow-[#FF6A00]/20"
                    : "bg-[#1B1F24] text-[#A7B0BE] border-[#2A3038] hover:border-[#FF6A00]/40 hover:text-white"
                )}
              >
                {f.label}{f.count > 0 ? ` (${f.count})` : ""}
              </button>
            ))}
          </div>

          {listingsQuery.isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-[#FF6A00]" />
              <p className="text-sm font-black text-[#A7B0BE] uppercase tracking-widest">Sincronizando Marketplace...</p>
            </div>
          ) : !filteredListings || filteredListings.length === 0 ? (
            <Card className="border border-dashed border-[#2A3038] bg-[#1B1F24] rounded-[40px] overflow-hidden shadow-none">
              <CardContent className="p-20 flex flex-col items-center text-center space-y-6">
                <div className="w-24 h-24 rounded-full bg-[#FF6A00]/10 flex items-center justify-center text-[#FF6A00] shadow-inner group relative">
                  <Package className="w-10 h-10 relative z-10" />
                  <div className="absolute inset-0 bg-[#FF6A00]/20 rounded-full animate-ping opacity-20" />
                </div>
                <h3 className="text-2xl font-black text-[#F5F7FA] uppercase tracking-tight">
                  {searchTerm ? "Nenhum resultado" : "Nenhum anúncio encontrado"}
                </h3>
                <Button onClick={() => navigate("/anunciante/anuncios/novo")} className="h-14 px-10 rounded-2xl bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-black uppercase tracking-widest text-xs shadow-lg shadow-[#FF6A00]/20">começar agora</Button>
              </CardContent>
            </Card>
          ) : viewMode === "grid" ? (
            /* ── Grade de cards ── */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredListings.map((listing) => {
                const isFav    = favorites.has(listing.id);
                const isActive = ["active","published"].includes(listing.status?.toLowerCase());
                const days     = (() => { try { return Math.max(0, Math.floor((Date.now() - new Date(listing.raw.created_at).getTime()) / 86_400_000)); } catch { return 0; } })();
                return (
                  <div key={listing.id} className="bg-[#1B1F24] border border-[#2A3038] rounded-2xl overflow-hidden flex flex-col hover:shadow-xl hover:shadow-black/30 transition-all hover:-translate-y-0.5">
                    {/* Imagem */}
                    <div className="relative h-44 bg-[#14171B] overflow-hidden">
                      {listing.image ? (
                        <img src={listing.image} alt="" className={cn("w-full h-full object-cover", !isActive && "opacity-50")} onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="w-10 h-10 text-[#2A3038]" /></div>
                      )}
                      <div className="absolute top-2 left-2">{getStatusBadge(listing.status)}</div>
                      <button onClick={e => toggleFav(listing.id, e)} className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 backdrop-blur-sm hover:bg-black/60">
                        <Star className={cn("h-3.5 w-3.5", isFav ? "fill-yellow-400 text-yellow-400" : "text-white/70")} />
                      </button>
                      {listing.listingMode && listing.listingMode !== "normal" && (
                        <div className="absolute bottom-2 left-2"><ListingModeBadge mode={listing.listingMode} endsAt={listing.auctionEndsAt} /></div>
                      )}
                    </div>
                    {/* Conteúdo */}
                    <div className="p-4 flex flex-col flex-1 gap-2">
                      <h3 className="font-bold text-[14px] text-[#F5F7FA] line-clamp-2 leading-snug">{listing.title || "Sem título"}</h3>
                      <div className="flex items-center gap-2 text-[11px] text-[#A7B0BE]">
                        <span className="text-sm">🛒</span>
                        <span className="font-semibold">{listing.typeLabel}</span>
                      </div>
                      {(listing.city || listing.state) && (
                        <div className="flex items-center gap-1 text-[11px] text-[#A7B0BE]">
                          <MapPin className="h-3 w-3 shrink-0 text-[#FF6A00]" />
                          {[listing.city, listing.state].filter(Boolean).join(", ")}
                        </div>
                      )}
                      <div className="text-lg font-black text-[#FF6A00] leading-none">{formatCurrencyBRL(listing.price)}</div>
                      <div className="flex items-center gap-3 text-[10px] text-[#A7B0BE] pt-1 border-t border-[#2A3038]">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {days}d</span>
                      </div>
                      {/* Ações */}
                      <div className="flex gap-2 mt-auto pt-2">
                        <Button size="sm" onClick={() => { if (listing.source === "merchant_marketing_products") navigate("/anunciante/minha-loja"); else navigate(`/anunciante/anuncios/editar/produto/${listing.id}`); }} className="flex-1 h-9 bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-black text-[10px] uppercase rounded-xl gap-1">
                          <Edit className="h-3 w-3" /> Editar
                        </Button>
                        <button onClick={() => handleShare(listing.id)} className="h-9 w-9 flex items-center justify-center rounded-xl border border-[#2A3038] text-[#A7B0BE] hover:text-white hover:border-[#FF6A00]/40 transition-colors" title="Copiar link"><Share2 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => window.open(`/produto/${listing.id}`, "_blank")} className="h-9 w-9 flex items-center justify-center rounded-xl border border-[#2A3038] text-[#A7B0BE] hover:text-white transition-colors" title="Ver anúncio"><Eye className="h-3.5 w-3.5" /></button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="h-9 w-9 flex items-center justify-center rounded-xl border border-[#2A3038] text-[#A7B0BE] hover:text-white transition-colors"><MoreVertical className="h-3.5 w-3.5" /></button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 p-2 rounded-2xl shadow-2xl border-zinc-100">
                            <DropdownMenuItem disabled={dispatchingId === listing.id} onClick={() => dispatchToQueue(listing.id, listing.category)} className="font-black text-[10px] uppercase gap-2 p-3 rounded-xl cursor-pointer text-[#25D366] hover:bg-[#25D366]/10 mb-1">
                              {dispatchingId === listing.id ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</> : <><Send className="w-4 h-4" /> Divulgar</>}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {isActive ? (
                              <DropdownMenuItem onClick={() => toggleStatus.mutate({ id: listing.id, category: listing.category, currentStatus: listing.status, source: listing.source })} className="font-black text-[10px] uppercase gap-2 p-3 rounded-xl cursor-pointer text-amber-600 hover:bg-amber-50 mb-1">
                                <Pause className="w-4 h-4" /> Pausar
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => toggleStatus.mutate({ id: listing.id, category: listing.category, currentStatus: listing.status, source: listing.source })} className="font-black text-[10px] uppercase gap-2 p-3 rounded-xl cursor-pointer text-emerald-600 hover:bg-emerald-50 mb-1">
                                <Play className="w-4 h-4" /> Ativar
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => deleteListing.mutate({ id: listing.id, category: listing.category, source: listing.source })} className="text-destructive font-black text-[10px] uppercase gap-2 p-3 rounded-xl cursor-pointer hover:bg-red-50">
                              <Trash2 className="w-4 h-4" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Tabela (modo lista, original) ── */
            <div className="bg-[#1B1F24] rounded-[32px] border border-[#2A3038] shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-[#14171B] border-b border-[#2A3038]">
                    <tr>
                      <th className="p-6 text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest">Anúncio</th>
                      <th className="p-6 text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest">Modalidade</th>
                      <th className="p-6 text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest text-center">Status</th>
                      <th className="p-6 text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest text-right">Valor</th>
                      <th className="p-6 text-[10px] font-black text-[#A7B0BE] uppercase tracking-widest text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2A3038]">
                    {filteredListings.map((listing) => (
                      <tr key={listing.id} className="hover:bg-[#14171B] transition-colors group">
                        <td className="p-6">
                          <div className="flex items-center gap-4">
                            <div className="relative w-12 h-12 rounded-xl bg-[#14171B] overflow-hidden shrink-0 border border-[#2A3038] flex items-center justify-center">
                              {listing.image ? (
                                <img
                                  src={listing.image.startsWith('http') ? listing.image : listing.image}
                                  className={`w-full h-full object-cover ${listing.status?.toLowerCase() === 'paused' ? 'opacity-40' : ''}`}
                                  alt=""
                                />
                              ) : (
                                <ShoppingBag className="w-5 h-5 text-[#2A3038]" />
                              )}
                              {listing.status?.toLowerCase() === 'paused' && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                  <span className="text-white text-[7px] font-black uppercase leading-tight text-center px-0.5">
                                    Pausado
                                  </span>
                                </div>
                              )}
                            </div>
                            <div>
                              <h3 className="font-black text-[#F5F7FA] text-sm line-clamp-1">{listing.title}</h3>
                              <p className="text-[10px] font-bold text-[#A7B0BE] uppercase tracking-wider flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> {[listing.city, listing.state].filter(Boolean).join(", ")}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="p-6">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">🛒</span>
                              <span className="text-[11px] font-black text-[#F5F7FA] uppercase tracking-tight">{listing.typeLabel}</span>
                            </div>
                            {listing.listingMode && listing.listingMode !== 'normal' && (
                              <ListingModeBadge mode={listing.listingMode} endsAt={listing.auctionEndsAt} />
                            )}
                          </div>
                        </td>
                        <td className="p-6">
                          <div className="flex justify-center">{getStatusBadge(listing.status)}</div>
                        </td>
                        <td className="p-6 text-right font-black text-[#F5F7FA] italic">
                          {formatCurrencyBRL(listing.price)}
                        </td>
                        <td className="p-6">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost" size="icon" className="h-10 w-10 hover:bg-[#FF6A00]/10 hover:text-[#FF6A00] rounded-xl text-[#A7B0BE]"
                              onClick={() => window.open(`/produto/${listing.id}`, '_blank')}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-10 w-10 hover:bg-[#FF6A00]/10 hover:text-[#FF6A00] rounded-xl text-[#A7B0BE]"
                              onClick={() => {
                                if (listing.source === 'merchant_marketing_products') {
                                  navigate('/anunciante/minha-loja');
                                } else {
                                  navigate(`/anunciante/anuncios/editar/produto/${listing.id}`);
                                }
                              }}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl"><MoreVertical className="w-4 h-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl shadow-2xl border-zinc-100">
                                <DropdownMenuItem
                                  disabled={dispatchingId === listing.id}
                                  onClick={() => dispatchToQueue(listing.id, listing.category)}
                                  className="font-black text-[10px] uppercase gap-2 p-3 rounded-xl cursor-pointer text-[#25D366] hover:bg-[#25D366]/10 mb-1"
                                >
                                  {dispatchingId === listing.id
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
                                    : <><Send className="w-4 h-4" /> Divulgar em Grupos</>
                                  }
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {listing.status?.toLowerCase() === 'active' || listing.status?.toLowerCase() === 'published' ? (
                                  <DropdownMenuItem
                                    onClick={() => toggleStatus.mutate({ id: listing.id, category: listing.category, currentStatus: listing.status, source: listing.source })}
                                    className="font-black text-[10px] uppercase gap-2 p-3 rounded-xl cursor-pointer text-amber-600 hover:bg-amber-50 mb-1"
                                  >
                                    <Pause className="w-4 h-4" /> Pausar Anúncio
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => toggleStatus.mutate({ id: listing.id, category: listing.category, currentStatus: listing.status, source: listing.source })}
                                    className="font-black text-[10px] uppercase gap-2 p-3 rounded-xl cursor-pointer text-emerald-600 hover:bg-emerald-50 mb-1"
                                  >
                                    <Play className="w-4 h-4" /> Ativar Anúncio
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => deleteListing.mutate({ id: listing.id, category: listing.category, source: listing.source })}
                                  className="text-destructive font-black text-[10px] uppercase gap-2 p-3 rounded-xl cursor-pointer hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" /> Excluir Anúncio
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ──────────────────────────────────────────────── */}
      {/* TAB: OFERTAS RECEBIDAS                          */}
      {/* ──────────────────────────────────────────────── */}
      {activeTab === 'offers' && (
        <div className="space-y-6">
          {/* Banner custo de aceite: ofertas dos compradores */}
          <div className="flex items-center justify-between p-4 bg-blue-50 rounded-2xl border border-blue-100">
            <div className="flex items-center gap-3">
              <Coins className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-xs font-black text-blue-700 uppercase">
                  Custo de aceite: 9 créditos por oferta
                </p>
                <p className="text-[11px] text-blue-500">
                  Aceitar oferta do comprador • Saldo: {balance.available_credits} créditos
                </p>
              </div>
            </div>
            <span className="text-xs font-black text-blue-700 bg-blue-100 px-3 py-1 rounded-full">
              {pendingDiscountCount} pendente{pendingDiscountCount !== 1 ? 's' : ''}
            </span>
          </div>

          {/* ── Ofertas via "Minha Oferta é..." (discount_requests) ── */}
          <div className="bg-[#1B1F24] rounded-2xl border border-[#2A3038] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-[#F5F7FA] uppercase tracking-widest flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#2563EB]" />
                Ofertas dos Compradores
              </h2>
              <span className="text-[10px] font-black text-[#A7B0BE] uppercase">
                {discountRequests.length} no total · {pendingDiscountCount} pendente{pendingDiscountCount !== 1 ? 's' : ''}
              </span>
            </div>

            {discountRequestsQuery.isLoading ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-[#2563EB]" />
              </div>
            ) : discountRequests.length === 0 ? (
              <div className="py-10 text-center text-[#A7B0BE] text-xs font-bold uppercase tracking-widest">
                Nenhuma oferta recebida ainda
              </div>
            ) : (
              <div className="space-y-3">
                {discountRequests.map((req) => (
                  <div
                    key={req.id}
                    className={cn(
                      "p-4 rounded-xl border-2 transition-all",
                      req.status === 'pending' ? 'bg-[#14171B] border-[#2563EB]/30' :
                      req.status === 'accepted' ? 'bg-emerald-950/30 border-emerald-700/40' :
                      'bg-[#14171B] border-[#2A3038] opacity-60'
                    )}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex flex-1 min-w-0 gap-3">
                        {/* Imagem do produto */}
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
                            <span className={cn(
                              'text-[9px] font-black uppercase px-2 py-0.5 rounded-full',
                              req.status === 'pending' ? 'bg-amber-500/20 text-amber-300' :
                              req.status === 'accepted' ? 'bg-emerald-500/20 text-emerald-300' :
                              'bg-zinc-700 text-zinc-400'
                            )}>
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
                          <p className="text-[11px] text-[#A7B0BE] font-medium line-clamp-1">
                            Produto: <span className="text-[#F5F7FA]">{req.product_title}</span>
                          </p>
                          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                            {req.product_price && (
                              <div className="flex flex-col">
                                <p className="text-lg font-black text-[#FF6A00] leading-none">
                                  R$ {req.product_price}
                                </p>
                                <span className="text-[9px] text-[#A7B0BE] font-bold uppercase tracking-wider mt-0.5">preço do produto</span>
                              </div>
                            )}
                            <div className="flex flex-col">
                              <p className="text-2xl font-black text-emerald-400 leading-none">
                                {formatCurrencyBRL(req.requested_price)}
                              </p>
                              <span className="text-[9px] text-[#A7B0BE] font-bold uppercase tracking-wider mt-0.5">oferta do comprador</span>
                            </div>
                          </div>
                          {req.message && (
                            <p className="text-xs text-[#A7B0BE] italic line-clamp-2">"{req.message}"</p>
                          )}
                          <p className="text-[10px] text-[#5B6571] flex items-center gap-1 mt-1">
                            <Clock className="w-3 h-3" />
                            {new Date(req.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                            {' às '}
                            {new Date(req.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>

                      {req.status === 'pending' && (() => {
                        const saldo = balance.available_credits ?? 0;
                        const hasEnough = saldo >= 9;
                        return (
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => {
                                  if (!hasEnough) {
                                    toast.error(`Sem saldo (precisa 9, tem ${saldo}). Redirecionando para compra...`, { duration: 3000 });
                                    setTimeout(() => navigate('/anunciante/creditos'), 1200);
                                    return;
                                  }
                                  respondDiscountRequest(req.id, 'accepted');
                                }}
                                className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-wide gap-1"
                              >
                                <CheckCheck className="w-3 h-3" /> Aceitar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => respondDiscountRequest(req.id, 'rejected')}
                                className="h-9 px-3 rounded-xl border border-[#2A3038] text-[#A7B0BE] hover:text-red-400 hover:border-red-500/40 font-black text-[10px] uppercase gap-1"
                              >
                                <X className="w-3 h-3" /> Recusar
                              </Button>
                            </div>
                            {/* Badge de saldo (30% maior, vermelho/verde dinâmico) */}
                            <div className="flex items-center gap-2 text-[14px] font-bold">
                              <span className={cn(
                                "flex items-center gap-1.5 border px-3 py-1 rounded-full",
                                hasEnough
                                  ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/30"
                                  : "text-red-300 bg-red-500/15 border-red-500/40"
                              )}>
                                <Coins className="w-3.5 h-3.5" /> Saldo: <span className="font-black text-base">{saldo}</span>
                              </span>
                              <span className="flex items-center gap-1 text-orange-300 bg-orange-500/10 border border-orange-500/20 px-3 py-1 rounded-full text-[12px]">
                                -9 ao aceitar
                              </span>
                            </div>
                            {!hasEnough && (
                              <div className="flex flex-col items-end gap-1.5">
                                <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">
                                  saldo insuficiente
                                </span>
                                <Button
                                  size="sm"
                                  onClick={() => navigate('/anunciante/creditos')}
                                  className="h-8 px-3 rounded-lg bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] hover:from-[#FF7A1A] hover:to-[#FF9A1A] text-white font-black text-[10px] uppercase tracking-widest gap-1 shadow-lg shadow-orange-500/40 animate-pulse"
                                >
                                  <Coins className="w-3 h-3" /> Comprar Créditos
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {req.status === 'accepted' && (
                        <div className="flex flex-col gap-2 items-end shrink-0">
                          {req.customer_phone && (
                            <Button
                              onClick={() => {
                                const clean = String(req.customer_phone).replace(/\D/g, '').replace(/^55/, '');
                                const msg = encodeURIComponent(
                                  `Olá ${req.customer_name || ''}! Sou da loja e aceitei sua oferta de ${formatCurrencyBRL(req.requested_price)} para o produto "${req.product_title}". Vamos combinar a entrega?`
                                );
                                window.open(`https://wa.me/55${clean}?text=${msg}`, '_blank');
                                markAsCalled(req.id);
                              }}
                              className="h-11 px-5 rounded-xl bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] hover:from-[#FF7A1A] hover:to-[#FF9A1A] text-white font-black text-[11px] uppercase tracking-widest gap-2 shadow-lg shadow-orange-500/40 animate-pulse"
                            >
                              <MessageSquare className="w-4 h-4" />
                              Chamar Ofertante
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteDiscountRequest(req.id)}
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
                            onClick={() => deleteDiscountRequest(req.id)}
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
          </div>

          {receivedOffers.length > 0 && (
            <div className="space-y-3">
              {receivedOffers.map((offer) => (
                <div
                  key={offer.id}
                  className={cn(
                    "p-5 rounded-2xl border-2 bg-white transition-all",
                    offer.status === 'pending' ? 'border-violet-200 hover:border-violet-300 shadow-sm' :
                    offer.status === 'accepted' ? 'border-emerald-200 bg-emerald-50/30' :
                    'border-zinc-100 opacity-60'
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className={cn(
                        'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0',
                        offer.status === 'pending' ? 'bg-violet-100' :
                        offer.status === 'accepted' ? 'bg-emerald-100' : 'bg-zinc-100'
                      )}>
                        <MessageSquare className={cn(
                          'w-5 h-5',
                          offer.status === 'pending' ? 'text-violet-600' :
                          offer.status === 'accepted' ? 'text-emerald-600' : 'text-zinc-400'
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black text-zinc-900 uppercase tracking-tight">
                            {offer.customer_name || 'Comprador'}
                          </span>
                          {offer.customer_whatsapp && offer.status === 'accepted' && (
                            <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">
                              📱 {offer.customer_whatsapp}
                            </span>
                          )}
                          <span className={cn(
                            'text-[9px] font-black uppercase px-2 py-0.5 rounded-full',
                            offer.status === 'pending' ? 'bg-amber-50 text-amber-600' :
                            offer.status === 'accepted' ? 'bg-emerald-50 text-emerald-600' :
                            'bg-zinc-100 text-zinc-500'
                          )}>
                            {offer.status === 'pending' ? 'Pendente' :
                             offer.status === 'accepted' ? 'Aceita' :
                             offer.status === 'rejected' ? 'Recusada' : offer.status}
                          </span>
                        </div>
                        <p className="text-xl font-black text-zinc-900 mt-1">
                          {formatCurrencyBRL(offer.offer_amount)}
                          <span className="text-xs text-zinc-400 font-normal ml-2">
                            {offer.quantity > 1 ? `× ${offer.quantity} unidades` : ''}
                          </span>
                        </p>
                        {offer.note && (
                          <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{offer.note}</p>
                        )}
                        <p className="text-[10px] text-zinc-400 mt-1">
                          {new Date(offer.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>

                    {offer.status === 'pending' && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleAcceptOffer(offer.id)}
                          className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-wide gap-1"
                        >
                          <CheckCheck className="w-3 h-3" /> Aceitar
                          <span className="opacity-60">（{totalAcceptCost}cr）</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => respondOffer.mutate({ offerId: offer.id, accept: false })}
                          className="h-9 px-3 rounded-xl border border-zinc-200 text-zinc-500 hover:text-red-600 hover:border-red-200 font-black text-[10px] uppercase gap-1"
                        >
                          <X className="w-3 h-3" /> Recusar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────── */}
      {/* TAB: INTERESSADOS (oculto)                      */}
      {/* ──────────────────────────────────────────────── */}
      {false && activeTab === 'intentions' && (
        <div className="space-y-6">

          {/* ── Stats cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* Saldo */}
            <div className="rounded-2xl bg-orange-50 border border-orange-200 p-4 space-y-1">
              <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest flex items-center gap-1.5">
                <Coins className="w-3 h-3" /> Saldo
              </p>
              <p className="text-3xl font-black text-orange-600 tabular-nums leading-none">
                {dashboard.available_credits}
              </p>
              <p className="text-[10px] text-orange-400 font-medium">créditos disponíveis</p>
            </div>

            {/* Pendentes */}
            <div className={cn(
              "rounded-2xl border p-4 space-y-1 transition-colors",
              pendingCount > 0 ? "bg-amber-50 border-amber-200" : "bg-zinc-50 border-zinc-200"
            )}>
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                <LockIcon className="w-3 h-3" /> Aguardando
              </p>
              <p className={cn(
                "text-3xl font-black tabular-nums leading-none",
                pendingCount > 0 ? "text-amber-600" : "text-zinc-400"
              )}>
                {dashboard.leads_pending}
              </p>
              <p className="text-[10px] text-zinc-400 font-medium">leads bloqueados</p>
            </div>

            {/* Desbloqueados */}
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 space-y-1">
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1.5">
                <UnlockIcon className="w-3 h-3" /> Desbloqueados
              </p>
              <p className="text-3xl font-black text-emerald-600 tabular-nums leading-none">
                {dashboard.leads_unlocked}
              </p>
              <p className="text-[10px] text-emerald-400 font-medium">contatos liberados</p>
            </div>

            {/* Consumidos */}
            <div className="rounded-2xl bg-zinc-50 border border-zinc-200 p-4 space-y-1">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                Consumido
              </p>
              <p className="text-3xl font-black text-zinc-600 tabular-nums leading-none">
                {dashboard.consumed_credits}
              </p>
              <p className="text-[10px] text-zinc-400 font-medium">créditos usados</p>
            </div>
          </div>

          {/* ── Header saldo + toggle compra ── */}
          <div className="rounded-2xl border overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-orange-50 border-b border-orange-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-100 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm font-black text-orange-700 uppercase tracking-tight">
                    Leads de Imóveis e Veículos
                  </p>
                  <p className="text-[11px] text-orange-500 font-medium">
                    Saldo: <strong>{dashboard.available_credits} créditos</strong>
                    {pendingCount > 0 && (
                      <span className="ml-2">
                        · <strong className="text-amber-600">{pendingCount}</strong> aguardando desbloqueio
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setShowBuyPanel(v => !v)}
                variant="outline"
                size="sm"
                className="shrink-0 font-black uppercase text-[10px] tracking-widest border-orange-300 text-orange-700 hover:bg-orange-100 rounded-xl h-9 gap-1.5"
              >
                <Coins className="w-3.5 h-3.5" />
                {showBuyPanel ? 'Fechar pacotes' : 'Comprar créditos'}
              </Button>
            </div>

            {/* Painel de compra expansível com PIX integrado */}
            {showBuyPanel && (
              <div className="p-6 bg-white border-t border-orange-100">
                <AdvertiserCreditPackagesPanel
                  availableCredits={dashboard.available_credits}
                  pollStatus={pollPurchaseStatus}
                  onPurchaseConfirmed={() => {
                    setShowBuyPanel(false);
                    refetchAll();
                  }}
                />
              </div>
            )}
          </div>

          {/* ── Lista de leads ── */}
          {intentionsLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
              <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">Carregando interessados...</p>
            </div>
          ) : leads.length === 0 ? (
            <Card className="border-2 border-dashed border-orange-100 bg-orange-50/20 rounded-[40px]">
              <CardContent className="p-16 flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center relative">
                  <Users className="w-8 h-8 text-orange-400" />
                  <div className="absolute inset-0 bg-orange-400/20 rounded-full animate-ping opacity-20" />
                </div>
                <h3 className="text-xl font-black text-zinc-800 uppercase tracking-tight">Nenhum interessado ainda</h3>
                <p className="text-sm text-zinc-500 font-medium max-w-xs leading-relaxed">
                  Quando um visitante clicar em "Estou Interessado" ou "WhatsApp" em um dos seus anúncios,
                  ele aparecerá aqui aguardando desbloqueio.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Filtro rápido de status */}
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Mostrar:</p>
                {[
                  { key: "all", label: "Todos", count: leads.length },
                  { key: "pending_unlock", label: "Aguardando", count: dashboard.leads_pending },
                  { key: "unlocked", label: "Desbloqueados", count: dashboard.leads_unlocked },
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => {}}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black border border-zinc-200 bg-white hover:border-orange-300 hover:text-orange-600 transition-colors"
                  >
                    {f.label}
                    <span className="w-4 h-4 rounded-full bg-zinc-100 flex items-center justify-center text-[8px] font-black">
                      {f.count}
                    </span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {leads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    availableCredits={dashboard.available_credits}
                    onUnlock={unlockLead}
                    onBuyCredits={() => setShowBuyPanel(true)}
                  />
                ))}
              </div>
            </>
          )}

          {/* ── Histórico de compras recentes ── */}
          {dashboard.recent_purchases.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-zinc-100">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                Últimas compras de créditos
              </p>
              <div className="space-y-2">
                {dashboard.recent_purchases.slice(0, 5).map(p => {
                  const statusColors: Record<string, string> = {
                    paid:             "bg-emerald-100 text-emerald-700",
                    awaiting_payment: "bg-amber-100 text-amber-700",
                    pending:          "bg-zinc-100 text-zinc-500",
                    failed:           "bg-red-100 text-red-600",
                    expired:          "bg-zinc-100 text-zinc-400",
                    cancelled:        "bg-zinc-100 text-zinc-400",
                  };
                  const statusLabels: Record<string, string> = {
                    paid:             "Pago ✓",
                    awaiting_payment: "Aguardando Pagamento",
                    pending:          "Pendente",
                    failed:           "Falhou",
                    expired:          "Expirado",
                    cancelled:        "Cancelado",
                  };
                  return (
                    <div key={p.id} className="flex items-center justify-between p-3 bg-zinc-50 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center">
                          <Coins className="w-4 h-4 text-orange-600" />
                        </div>
                        <div>
                          <p className="text-xs font-black text-zinc-900">{p.package_name}</p>
                          <p className="text-[10px] text-zinc-400 font-medium">
                            {p.credits_total} créditos · R$ {Number(p.amount_brl).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                      <span className={cn("text-[10px] font-black px-2.5 py-1 rounded-full", statusColors[p.payment_status] ?? "bg-zinc-100 text-zinc-500")}>
                        {statusLabels[p.payment_status] ?? p.payment_status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
