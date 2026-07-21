import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  Package,
  Megaphone,
  LayoutDashboard,
  Plus,
  TrendingUp,
  Users,
  Eye,
  MessageSquare,
  Sparkles,
  ArrowUpRight,
  MapPin,
  CheckCircle2,
  Clock,
  Trash2,
  Star,
  Bike,
  Navigation,
  Hash
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrencyBRL } from "@/lib/utils";
import { AdvertiserAccountCard } from "@/components/advertiser/AdvertiserAccountCard";
import { useAdvertiserAccountData } from "@/hooks/useAdvertiserAccountData";
import { AdvertiserOverviewCards } from "@/components/advertiser/AdvertiserOverviewCards";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import LoadingTransition from "@/pages/LoadingTransition";

export default function AdvertiserDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchingOrder, setSearchingOrder] = useState<any | null>(null);

  // Modal "Chamar Consultor"
  const [consultorOpen, setConsultorOpen] = useState(false);
  const [consultorSubject, setConsultorSubject] = useState("");
  const [consultorMessage, setConsultorMessage] = useState("");
  const [consultorSubmitting, setConsultorSubmitting] = useState(false);

  const submitConsultor = async () => {
    if (!consultorSubject.trim() || !consultorMessage.trim()) {
      toast.error("Preencha assunto e mensagem.");
      return;
    }
    setConsultorSubmitting(true);
    try {
      const { error } = await (supabase.from("support_tickets" as any)).insert({
        user_id: user?.id,
        subject: consultorSubject.trim(),
        message: consultorMessage.trim(),
        category: "consultoria",
        status: "open",
        source: "advertiser_dashboard",
      });
      if (error) throw error;
      toast.success("Pedido enviado! Um consultor entrará em contato em breve.");
      setConsultorOpen(false);
      setConsultorSubject("");
      setConsultorMessage("");
    } catch (err: any) {
      // Fallback: abre WhatsApp se a tabela não existir ou der erro
      const msg = encodeURIComponent(
        `Olá! Sou anunciante da Viagg-TX8.\n\nAssunto: ${consultorSubject}\n\n${consultorMessage}${user?.email ? `\n\nE-mail: ${user.email}` : ""}`
      );
      window.open(`https://wa.me/5547999999999?text=${msg}`, "_blank");
      toast.info("Abrindo WhatsApp com seu pedido...");
      setConsultorOpen(false);
      setConsultorSubject("");
      setConsultorMessage("");
    } finally {
      setConsultorSubmitting(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;

    const SEARCHING = ['searching', 'awaiting_professional', 'pending', 'aguardando', 'waiting_acceptance', 'created', 'calculating'];

    const fetch = async () => {
      const { data } = await supabase
        .from('service_orders')
        .select('*')
        .eq('merchant_id', user.id)
        .in('status', SEARCHING)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setSearchingOrder(data ?? null);
    };
    fetch();

    const ch = supabase
      .channel(`adv-dash-order-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_orders', filter: `merchant_id=eq.${user.id}` },
        (payload) => {
          const rec = payload.new as any;
          if (!rec) { setSearchingOrder(null); return; }
          if (SEARCHING.includes(rec.status)) setSearchingOrder(rec);
          else setSearchingOrder(null);
        })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const { data: accountFull, isLoading } = useAdvertiserAccountData();
  // Adapta o retorno do hook completo para o formato esperado pelo AdvertiserAccountCard
  const account = accountFull ? {
    id: accountFull.id,
    full_name: accountFull.full_name || accountFull.profile?.name || null,
    email: accountFull.email || null,
    whatsapp: accountFull.whatsapp || accountFull.profile?.phone || null,
    account_status: accountFull.account_status || accountFull.status || 'active',
    created_at: accountFull.created_at,
  } : null;

  // ── Query de listings unificadas para o painel ──
  const { data: recentListings, isLoading: isLoadingListings } = useQuery({
    queryKey: ["dashboard-simplified-listings", user?.id],
    enabled: !!user,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
    queryFn: async () => {
      const { data: advertiserData } = await supabase.from('advertiser_accounts' as any).select('id').eq('user_id', user?.id).maybeSingle();
      const rePromise = supabase.from("real_estate_listings").select(`id, title, city, state, price_brl, visibility_status, property_type, created_at, real_estate_media(public_masked_storage_path, original_storage_path)`).eq("owner_user_id", user?.id);
      const vPromise = supabase.from("vehicle_listings" as any).select(`id, title, city, state, price, status, vehicle_type, cover_image_url, created_at`).eq("owner_user_id", user?.id);
      const pPromise = supabase.from("advertiser_listings" as any).select(`id, title, category, listing_status, cover_image_url, created_at, price, city, advertiser_listing_media(media_url, storage_path)`).eq("advertiser_account_id", advertiserData?.id);

      const [reRes, vRes, pRes] = await Promise.all([rePromise, vPromise, pPromise]);
      const normalized: any[] = [];

      // Helper: resolve storage path → signed URL (válido por 1h)
      const resolveProductImg = async (raw: string | null | undefined): Promise<string | null> => {
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

      (reRes.data || []).forEach(item => normalized.push({
        id: item.id, title: item.title, category: 'imovel', city: item.city, state: item.state, price: item.price_brl || 0,
        status: item.visibility_status, image: item.real_estate_media?.[0]?.public_masked_storage_path || item.real_estate_media?.[0]?.original_storage_path,
        storageBucket: 'real-estate-public', typeLabel: item.property_type, created_at: item.created_at
      }));

      (vRes.data || []).forEach(item => normalized.push({
        id: item.id, title: item.title, category: 'veiculo', city: item.city, state: item.state, price: item.price || 0,
        status: item.status, image: item.cover_image_url, storageBucket: null, typeLabel: item.vehicle_type || 'Veículo', created_at: item.created_at
      }));

      // Produtos: cover_image_url OU primeira mídia em advertiser_listing_media, resolvendo via signed URL
      for (const item of ((pRes.data || []) as any[])) {
        const mediaFirst = item.advertiser_listing_media?.[0];
        const candidate = item.cover_image_url || mediaFirst?.media_url || mediaFirst?.storage_path;
        const resolvedImg = await resolveProductImg(candidate);
        normalized.push({
          id: item.id, title: item.title, category: 'produto', city: item.city || '', state: '',
          price: item.price || 0, status: item.listing_status, image: resolvedImg, storageBucket: null,
          typeLabel: item.category || 'Produto', created_at: item.created_at
        });
      }

      return normalized.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  });

  // ── Stats do dashboard ──
  const { data: dashStats, refetch: refetchStats, isFetching: isFetchingStats } = useQuery({
    queryKey: ['advertiser-dashboard-stats', user?.id],
    enabled: !!user?.id,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    staleTime: 0,
    queryFn: async () => {
      // 1. Anúncios ativos (3 tabelas)
      const { data: adv } = await (supabase.from('advertiser_accounts' as any).select('id').eq('user_id', user!.id).maybeSingle()) as any;
      const accId = (adv as any)?.id;
      const { data: ms } = await (supabase.from('merchant_stores' as any).select('id').eq('user_id', user!.id).maybeSingle()) as any;
      const storeId = (ms as any)?.id;

      const [reActive, vActive, pActive] = await Promise.all([
        (supabase.from('real_estate_listings' as any).select('id', { count: 'exact', head: true }).eq('owner_user_id', user!.id).in('visibility_status', ['published','active'])) as any,
        (supabase.from('vehicle_listings' as any).select('id', { count: 'exact', head: true }).eq('owner_user_id', user!.id).in('visibility_status', ['published','active'])) as any,
        accId ? (supabase.from('advertiser_listings' as any).select('id', { count: 'exact', head: true }).eq('advertiser_account_id', accId).in('listing_status', ['published','active'])) as any : { count: 0 },
      ]);
      const totalAds = (reActive?.count ?? 0) + (vActive?.count ?? 0) + (pActive?.count ?? 0);

      // 2. IDs de todos os produtos do anunciante (pra filtrar eventos)
      const productIds: string[] = [];
      if (accId) {
        const { data: ownProducts } = await (supabase.from('advertiser_listings' as any).select('id').eq('advertiser_account_id', accId)) as any;
        for (const p of ((ownProducts as any[]) || [])) productIds.push(p.id);
      }
      if (storeId) {
        const { data: mktProducts } = await (supabase.from('merchant_marketing_products' as any).select('id').eq('merchant_store_id', storeId)) as any;
        for (const p of ((mktProducts as any[]) || [])) productIds.push(p.id);
      }

      // 3. Visualizações (soma de várias fontes)
      let totalViews = 0;
      const storeIdsAll = [...new Set([accId, storeId].filter(Boolean) as string[])];

      // a) product_interest_events — match por product_id OU store_id
      if (productIds.length > 0 || storeIdsAll.length > 0) {
        const queries: Promise<any>[] = [];
        if (productIds.length > 0) {
          queries.push((supabase.from('product_interest_events' as any)
            .select('id', { count: 'exact', head: true })
            .in('product_id', productIds)) as any);
        }
        if (storeIdsAll.length > 0) {
          queries.push((supabase.from('product_interest_events' as any)
            .select('id', { count: 'exact', head: true })
            .in('store_id', storeIdsAll)) as any);
        }
        const results = await Promise.all(queries);
        for (const r of results) totalViews += r?.count ?? 0;
      }

      // b) m1_billing_events — match por merchant_store_id OU product_id
      if (productIds.length > 0 || storeIdsAll.length > 0) {
        const queries: Promise<any>[] = [];
        if (storeIdsAll.length > 0) {
          queries.push((supabase.from('m1_billing_events' as any)
            .select('id', { count: 'exact', head: true })
            .in('merchant_store_id', storeIdsAll)
            .in('event_type', ['product_click', 'store_view'])) as any);
        }
        if (productIds.length > 0) {
          queries.push((supabase.from('m1_billing_events' as any)
            .select('id', { count: 'exact', head: true })
            .in('product_id', productIds)
            .in('event_type', ['product_click', 'store_view'])) as any);
        }
        const results = await Promise.all(queries);
        for (const r of results) totalViews += r?.count ?? 0;
      }

      // c) Visualizações de imóveis e veículos (próprios) — real_estate_listings NÃO tem
      // coluna view_count (causava erro silencioso); a fonte real é o ledger de cliques.
      const [reViewsRes, vViewsRes] = await Promise.all([
        (supabase.from('real_estate_credit_ledger' as any)
          .select('metadata').eq('owner_user_id', user!.id)) as any,
        (supabase.from('vehicle_credit_ledger' as any)
          .select('metadata').eq('owner_user_id', user!.id)) as any,
      ]);
      for (const r of ((reViewsRes?.data as any[]) || [])) if (r?.metadata?.event === 'listing_click') totalViews += 1;
      for (const v of ((vViewsRes?.data as any[]) || [])) if (v?.metadata?.event === 'listing_click') totalViews += 1;

      console.log('[Dashboard Stats] views/products', { productIds, storeIdsAll, totalViews, totalAds });

      // 4. Leads/Mensagens (contact_intentions + discount_requests + purchase_intentions)
      const storeIds: string[] = [];
      if (accId) storeIds.push(accId);
      if (storeId) storeIds.push(storeId);

      const [contactCount, discountCount, purchaseCount] = await Promise.all([
        (supabase.from('advertiser_contact_intentions' as any).select('id', { count: 'exact', head: true }).eq('advertiser_user_id', user!.id).neq('status','cancelled')) as any,
        storeIds.length > 0
          ? ((supabase.from('discount_requests' as any).select('id', { count: 'exact', head: true }).in('store_id', storeIds)) as any)
          : { count: 0 },
        storeId
          ? ((supabase.from('purchase_intentions' as any).select('id', { count: 'exact', head: true }).eq('store_id', storeId)) as any)
          : { count: 0 },
      ]);
      const totalLeads = (contactCount?.count ?? 0) + (discountCount?.count ?? 0) + (purchaseCount?.count ?? 0);

      // 5. Taxa de conversão
      const conversionRate = totalViews > 0 ? Math.round((totalLeads / totalViews) * 100) : 0;

      return { totalAds, totalViews, totalLeads, conversionRate };
    },
  });

  const getStatusBadge = (status: string) => {
    const s = status?.toLowerCase();
    if (s === 'published' || s === 'active') {
      return <span className="flex items-center gap-1.5 px-3 py-1 bg-[#22C55E]/10 text-[#22C55E] text-[10px] font-bold uppercase rounded-md border border-[#22C55E]/20"><CheckCircle2 className="w-3 h-3" /> Ativo</span>;
    }
    if (s === 'pending_review' || s === 'moderating') {
      return <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-400 text-[10px] font-bold uppercase rounded-md border border-amber-500/20"><Clock className="w-3 h-3" /> Em Análise</span>;
    }
    return <span className="flex items-center gap-1.5 px-3 py-1 bg-[#2A3038] text-[#A7B0BE] text-[10px] font-bold uppercase rounded-md border border-[#2A3038]">{status || 'Rascunho'}</span>;
  };

  if (isLoading) return <LoadingTransition />;

  // Resilient fallback for account data
  const displayName = account?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "MEMBRO";
  const isProfileComplete = !!account?.full_name;

  const stats = [
    {
      label: "Anúncios Ativos",
      value: String(dashStats?.totalAds ?? 0),
      icon: Package, color: "text-[#FF6A00]",
      trend: (dashStats?.totalAds ?? 0) > 0 ? "ativo" : "+0%",
      onClick: () => navigate('/anunciante/meus-anuncios'),
    },
    {
      label: "Visualizações",
      value: String(dashStats?.totalViews ?? 0),
      icon: Eye, color: "text-[#A7B0BE]",
      trend: (dashStats?.totalViews ?? 0) > 0 ? `${dashStats?.totalViews} views` : "+0%",
      onClick: () => navigate('/anunciante/meus-anuncios'),
    },
    {
      label: "Leads / Mensagens",
      value: String(dashStats?.totalLeads ?? 0),
      icon: MessageSquare, color: "text-[#22C55E]",
      trend: (dashStats?.totalLeads ?? 0) > 0 ? "novos" : "+0%",
      onClick: () => navigate('/anunciante/mensagens'),
    },
    {
      label: "Taxa de Conversão",
      value: `${dashStats?.conversionRate ?? 0}%`,
      icon: TrendingUp, color: "text-[#FF6A00]",
      trend: (dashStats?.conversionRate ?? 0) > 0 ? `${dashStats?.conversionRate}%` : "+0%",
      onClick: () => navigate('/anunciante/mensagens'),
    },
  ];

  const ACCEPTED_STATUSES = ['accepted', 'assigned', 'in_progress', 'a_caminho', 'entregando', 'buscando'];
  const isAccepted = searchingOrder && ACCEPTED_STATUSES.includes(searchingOrder.status);

  return (
    <div className="space-y-12 animate-in fade-in duration-700">

      {/* ── Card: Entrega em andamento ───────────────────────────────── */}
      {searchingOrder && (
        <div className={`rounded-2xl border-2 overflow-hidden ${isAccepted ? 'border-green-500/60 bg-green-950/30' : 'border-[#FF6A00]/60 bg-[#FF6A00]/5'}`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-[#A7B0BE] uppercase tracking-widest flex items-center gap-1">
                <Hash className="h-3 w-3" />
                {searchingOrder.id.slice(0, 8).toUpperCase()}
              </span>
              <span className="text-[10px] text-[#A7B0BE]">
                {format(new Date(searchingOrder.created_at), "HH:mm '•' dd/MM", { locale: ptBR })}
              </span>
            </div>
            {isAccepted ? (
              <span className="flex items-center gap-1 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-full">
                <CheckCircle2 className="h-3 w-3" /> Motoboy a caminho
              </span>
            ) : (
              <span className="flex items-center gap-1 bg-[#FF6A00] text-white text-[10px] font-bold px-2 py-1 rounded-full animate-pulse">
                <Bike className="h-3 w-3" /> Procurando Motoboy
              </span>
            )}
          </div>

          <div className="px-4 py-3 flex gap-3">
            <div className="flex flex-col items-center gap-1 pt-1">
              <div className="w-2.5 h-2.5 rounded-full bg-[#FF6A00]" />
              <div className="w-px flex-1 border-l-2 border-dashed border-[#FF6A00]/30" />
              <Navigation className="h-3 w-3 text-[#A7B0BE] rotate-180" />
            </div>
            <div className="flex-1 space-y-3 min-w-0">
              <div>
                <p className="text-[9px] font-bold text-[#A7B0BE] uppercase tracking-widest">Retirada</p>
                <p className="text-sm font-semibold text-[#F5F7FA] truncate">{searchingOrder.pickup_location || searchingOrder.store_address || '—'}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-[#A7B0BE] uppercase tracking-widest">Entrega</p>
                <p className="text-sm font-semibold text-[#F5F7FA] truncate">{searchingOrder.destination || '—'}</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[9px] text-[#A7B0BE] uppercase tracking-widest">Total</p>
              <p className="text-lg font-bold text-[#FF6A00]">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(searchingOrder.total_price || 0)}
              </p>
            </div>
          </div>

          {!isAccepted && (
            <div className="px-4 pb-4 flex items-center gap-4">
              <div className="relative h-12 w-12 shrink-0">
                <div className="absolute inset-0 rounded-full bg-[#FF6A00]/20 animate-ping" style={{ animationDuration: '2.5s' }} />
                <div className="absolute inset-0 rounded-full bg-[#FF6A00]/10 animate-ping" style={{ animationDuration: '1.8s', animationDelay: '0.4s' }} />
                <div className="relative h-12 w-12 rounded-full bg-[#1B1F24] border border-[#FF6A00]/30 flex items-center justify-center">
                  <Bike className="h-5 w-5 text-[#FF6A00]" />
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-[#F5F7FA]">Buscando motoboy na região…</p>
                <p className="text-xs text-[#A7B0BE]">Você será avisado assim que alguém aceitar.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Premium Welcome Hero */}
      <section className="relative overflow-hidden rounded-2xl sm:rounded-[32px] bg-[#0D0F12] p-5 sm:p-8 lg:p-12 text-white shadow-2xl shadow-black/40 border border-[#2A3038]/60">
        <div className="absolute top-0 right-0 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-orange-600/10 blur-[120px] rounded-full -mr-32 sm:-mr-64 -mt-32 sm:-mt-64 animate-pulse duration-5000" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6 sm:gap-10">
          <div className="space-y-4 sm:space-y-6 max-w-2xl min-w-0">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="h-1.5 sm:h-2 w-8 sm:w-12 bg-orange-500 rounded-full shrink-0" />
              <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.3em] sm:tracking-[0.4em] text-orange-500">Administrativo Premium</span>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight sm:tracking-tighter leading-tight sm:leading-none break-words">
                Seja bem vindo lojista{' '}
                <span className="text-orange-500 break-all">{displayName}</span>
              </h1>
            </div>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4 pt-2 sm:pt-4">
              <Button
                onClick={() => navigate("/anunciante/anuncios/novo")}
                className="bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-black uppercase text-[11px] sm:text-xs tracking-wider sm:tracking-widest h-12 sm:h-14 px-5 sm:px-10 rounded-xl sm:rounded-2xl shadow-xl shadow-[#FF6A00]/20 gap-2 sm:gap-3 group transition-all w-full sm:w-auto"
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:rotate-90 duration-300 shrink-0" />
                <span className="truncate">Criar Primeiro Anúncio</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/anunciante/conta")}
                className="bg-white/5 hover:bg-white/10 text-white font-black uppercase text-[11px] sm:text-xs tracking-wider sm:tracking-widest h-12 sm:h-14 px-5 sm:px-8 rounded-xl sm:rounded-2xl backdrop-blur-md transition-all border-none w-full sm:w-auto"
              >
                Completar Perfil
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/anunciante/divulgar-gratis")}
                className="bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 font-black uppercase text-[10px] sm:text-xs tracking-wider sm:tracking-widest h-12 sm:h-14 px-5 sm:px-8 rounded-xl sm:rounded-2xl border border-violet-500/30 transition-all w-full sm:w-auto gap-2"
              >
                <Megaphone className="w-4 h-4 shrink-0" />
                Divulgar Grátis
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  const { playNotificationSound } = await import("@/lib/notificationSound");
                  playNotificationSound();
                }}
                className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-black uppercase text-[10px] sm:text-xs tracking-wider sm:tracking-widest h-12 sm:h-14 px-5 sm:px-8 rounded-xl sm:rounded-2xl border border-emerald-500/30 transition-all w-full sm:w-auto"
              >
                🔔 Testar Som
              </Button>
            </div>
          </div>

          <div className="hidden lg:block shrink-0">
             <div className="w-64 h-64 rounded-[50px] bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/10 flex items-center justify-center relative shadow-inner overflow-hidden">
                <div className="absolute inset-0 bg-orange-500/5 blur-3xl rounded-full" />
                <img
                  src="/assets/brand/logo-advertiser.jpg"
                  alt="Viagg-Tx8"
                  className="w-56 h-auto max-h-[85%] rounded-[32px] opacity-90 filter brightness-110 saturate-[1.2] shadow-2xl transition-all duration-500 hover:scale-105 object-contain"
                />
             </div>
          </div>
        </div>
      </section>

      {/* Stats Grid - Ultra Premium Look */}
      <section className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <span className="text-[10px] font-bold text-[#A7B0BE] uppercase tracking-widest">
          {isFetchingStats ? "Atualizando..." : "Sincronizado"}
        </span>
        <button
          onClick={() => refetchStats()}
          disabled={isFetchingStats}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1B1F24] border border-[#2A3038] hover:border-[#FF6A00]/40 text-[10px] font-black text-[#A7B0BE] hover:text-[#FF6A00] uppercase tracking-widest transition-all disabled:opacity-50"
        >
          <ArrowUpRight className={cn("w-3 h-3", isFetchingStats && "animate-spin")} />
          Atualizar
        </button>
      </div>
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            onClick={stat.onClick}
            className="border border-[#2A3038] shadow-lg shadow-black/20 rounded-[28px] overflow-hidden group hover:shadow-xl hover:shadow-black/30 transition-all duration-500 bg-[#1B1F24] cursor-pointer hover:border-[#FF6A00]/40 hover:scale-[1.02]"
          >
            <CardContent className="p-10 space-y-6">
              <div className="flex items-center justify-between">
                <div className={cn("p-4 rounded-2xl bg-[#14171B] shadow-inner group-hover:scale-110 transition-transform duration-500", stat.color)}>
                  <stat.icon className="w-7 h-7" />
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-black text-[#22C55E] bg-[#22C55E]/10 px-3 py-1.5 rounded-full border border-[#22C55E]/20">
                  <ArrowUpRight className="w-3.5 h-3.5" /> {stat.trend}
                </div>
              </div>
              <div className="space-y-1">
                 <p className="text-4xl font-black text-[#F5F7FA] tracking-tighter">{stat.value}</p>
                 <p className="text-[10px] font-black text-[#A7B0BE] uppercase tracking-[0.2em]">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-12">
         {/* Identity & Status */}
         <div className="lg:col-span-2 space-y-8">
            <div className="flex items-center justify-between px-4">
              <h2 className="text-xl font-black text-[#F5F7FA] uppercase tracking-tight flex items-center gap-3">
                <LayoutDashboard className="w-6 h-6 text-[#FF6A00]" /> Identidade Operacional
              </h2>
            </div>
            <AdvertiserAccountCard account={account || { id: user?.id, full_name: displayName } as any} />
         </div>

         {/* Support Hub Card */}
         <Card className="border border-[#2A3038] shadow-xl shadow-black/30 rounded-[32px] overflow-hidden bg-[#0D0F12] text-[#F5F7FA] flex flex-col relative group h-full">
           <div className="absolute top-0 right-0 w-32 h-32 bg-orange-600/20 blur-[60px] rounded-full group-hover:bg-orange-600/40 transition-all duration-700" />
           <CardHeader className="p-10 pb-4 relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-orange-600 flex items-center justify-center text-white mb-8 shadow-2xl shadow-orange-600/40 transform -rotate-3 group-hover:rotate-0 transition-transform">
                 <Megaphone className="w-7 h-7" />
              </div>
              <CardTitle className="text-2xl font-black tracking-tight text-[#F5F7FA] uppercase italic">Suporte Especializado</CardTitle>
              <CardDescription className="text-[#A7B0BE] font-bold text-xs uppercase tracking-widest mt-2">Dúvidas ou problemas técnicos?</CardDescription>
           </CardHeader>
           <CardContent className="p-10 pt-0 space-y-8 flex-1 flex flex-col relative z-10">
              <p className="text-zinc-400 text-sm leading-relaxed font-medium">
                Nossa equipe de especialistas está treinada para ajudar você a otimizar sua taxa de conversão e gerenciar leads de forma eficiente.
              </p>
              <div className="space-y-4">
                {[
                  "Maximizando a visualização de faturas",
                  "Configuração de bots de resposta",
                  "Regeneração de QR Codes PIX",
                ].map(item => (
                  <div key={item} className="flex items-center gap-3 text-xs font-bold text-zinc-300 hover:text-white transition-all cursor-pointer group/item">
                     <div className="w-2 h-2 rounded-full bg-orange-600 scale-75 group-hover/item:scale-125 transition-all" />
                     {item}
                  </div>
                ))}
              </div>
              <Button
                onClick={() => setConsultorOpen(true)}
                className="mt-auto w-full bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-black uppercase text-xs tracking-widest h-14 rounded-2xl transition-all border-none shadow-lg shadow-[#FF6A00]/20"
              >
                Chamar Consultor
              </Button>
           </CardContent>
         </Card>
      </section>

      {/* Quick Access Grid */}
      <section className="pt-8">
        <div className="space-y-2 mb-10 px-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 bg-[#FF6A00] rounded-full animate-pulse" />
            <h2 className="text-2xl font-black text-[#F5F7FA] tracking-tight uppercase leading-none">Acesso Inteligente</h2>
          </div>
          <p className="text-xs font-bold text-[#A7B0BE] uppercase tracking-widest ml-5">Atalhos rápidos para alta produtividade</p>
        </div>
        <AdvertiserOverviewCards />
      </section>

      {/* Progress / Next Steps Checklist */}
      {!isProfileComplete && (
        <section className="bg-[#1B1F24] border border-[#FF6A00]/20 rounded-[32px] p-12 flex flex-col md:flex-row items-center gap-10 justify-between">
           <div className="flex items-center gap-8">
              <div className="w-20 h-20 rounded-3xl bg-[#FF6A00]/10 flex items-center justify-center text-[#FF6A00] shadow-xl shadow-[#FF6A00]/10 relative">
                <Sparkles className="w-10 h-10" />
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-[#EF4444] rounded-full border-4 border-[#1B1F24] animate-bounce" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xl font-black text-[#F5F7FA] uppercase tracking-tight">Complete seu Perfil Administrativo</h4>
                <p className="text-[#A7B0BE] font-medium max-w-md">Contas completas recebem 15% mais leads. Adicione seus contatos oficiais agora.</p>
              </div>
           </div>
           <Button 
             onClick={() => navigate("/anunciante/conta")}
             className="h-16 px-10 rounded-2xl bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-black uppercase text-xs tracking-widest transition-all shadow-xl shadow-[#FF6A00]/20"
           >
             Configurar Perfil
           </Button>
        </section>
      )}

      {/* ── SEÇÃO MERCADO LIVRE: PRODUTOS ── */}
      <section className="mt-12 space-y-6">
        <div className="flex items-center justify-between px-4">
          <h2 className="text-2xl font-black text-[#F5F7FA] tracking-tight uppercase">Seus Anúncios</h2>
          <Link to="/anunciante/meus-anuncios" className="text-xs font-black uppercase tracking-widest text-[#FF6A00] hover:text-[#FF7A1A]">Ver Catálogo Completo →</Link>
        </div>

        {isLoadingListings ? (
          <div className="h-32 flex items-center justify-center bg-white rounded-3xl border border-zinc-100 shadow-sm">
             <div className="animate-spin w-6 h-6 border-2 border-orange-600 border-t-transparent rounded-full" />
          </div>
        ) : recentListings?.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center bg-[#1B1F24] rounded-[28px] border border-[#2A3038] text-center shadow-sm">
             <Package className="w-16 h-16 text-[#2A3038] mb-6" />
             <h3 className="text-xl font-black text-[#F5F7FA] uppercase tracking-tight mb-2">Você ainda não tem anúncios</h3>
             <p className="text-[#A7B0BE] font-medium max-w-md mb-8">Crie seu primeiro anúncio e comece a vender no maior ecossistema da região.</p>
             <Button onClick={() => navigate("/anunciante/anuncios/novo")} className="h-14 px-10 rounded-2xl bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-black uppercase text-xs tracking-widest transition-all">
               Criar Primeiro Anúncio
             </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
             {/* Styled exactly like Mercado Livre seller listings */}
             {recentListings?.slice(0, 10).map((listing: any) => (
                <div key={listing.id} className="group flex flex-col sm:flex-row items-start sm:items-center p-5 bg-[#1B1F24] rounded-[24px] border border-[#2A3038] hover:border-[#FF6A00]/30 hover:shadow-xl hover:shadow-black/30 transition-all duration-300 gap-6">
                   <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 bg-[#14171B] rounded-2xl border border-[#2A3038] overflow-hidden relative">
                     {listing.image ? (
                       <img 
                         src={listing.storageBucket ? supabase.storage.from(listing.storageBucket).getPublicUrl(listing.image).data.publicUrl : listing.image} 
                         className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                         alt={listing.title} 
                       />
                     ) : (
                       <Package className="w-full h-full p-6 text-zinc-300" />
                     )}
                     <div className="absolute inset-0 ring-1 ring-inset ring-black/5 rounded-2xl" />
                   </div>
                   
                   <div className="flex-1 min-w-0 flex flex-col justify-center">
                     <p className="text-sm font-bold text-[#F5F7FA] line-clamp-1 mb-2 group-hover:text-[#FF6A00] transition-colors cursor-pointer">
                       {listing.title}
                     </p>
                     <p className="text-2xl font-black text-[#F5F7FA] tracking-tight mb-3">
                       {formatCurrencyBRL(listing.price)}
                     </p>
                     <div className="flex items-center gap-3">
                       {getStatusBadge(listing.status)}
                       <span className="text-[11px] font-bold text-[#A7B0BE] uppercase tracking-widest flex items-center gap-1.5">
                         <Star className="w-3.5 h-3.5 text-[#FF6A00] fill-[#FF6A00]" /> {listing.typeLabel}
                       </span>
                     </div>
                   </div>

                   <div className="w-full sm:w-auto flex sm:flex-col items-center justify-end gap-3 shrink-0 pt-4 sm:pt-0 mt-2 sm:mt-0 border-t border-[#2A3038] sm:border-0">
                      <Button onClick={() => navigate(`/anunciante/anuncios/editar/${listing.category}/${listing.id}`)} variant="outline" className="flex-1 sm:flex-none border-[#2A3038] bg-[#14171B] hover:bg-[#2A3038] hover:text-[#FF6A00] text-[#A7B0BE] font-black uppercase text-[10px] tracking-widest h-11 px-6 rounded-xl transition-all">
                        Modificar
                      </Button>
                      <Button variant="ghost" className="px-4 h-11 text-[#A7B0BE] hover:text-[#EF4444] hover:bg-[#EF4444]/10 rounded-xl transition-all">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                   </div>
                </div>
             ))}
          </div>
        )}
      </section>

      {/* Modal: Chamar Consultor */}
      <Dialog open={consultorOpen} onOpenChange={setConsultorOpen}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-zinc-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-[#FF6A00] flex items-center justify-center text-white">💬</span>
              Chamar Consultor
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-zinc-500 leading-relaxed">
              Conte rapidamente o que você precisa. Um consultor da Viagg-TX8 retornará pelo seu e-mail/WhatsApp cadastrado.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Assunto</label>
              <Input
                placeholder="Ex.: Quero divulgar em mais grupos"
                value={consultorSubject}
                onChange={(e) => setConsultorSubject(e.target.value)}
                maxLength={120}
                className="h-11 bg-zinc-50 border-zinc-200 focus-visible:ring-orange-400"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-zinc-600 uppercase tracking-widest">Mensagem</label>
              <Textarea
                placeholder="Descreva sua necessidade ou dúvida..."
                value={consultorMessage}
                onChange={(e) => setConsultorMessage(e.target.value)}
                maxLength={1000}
                rows={5}
                className="resize-none bg-zinc-50 border-zinc-200 focus-visible:ring-orange-400"
              />
              <p className="text-[10px] text-zinc-400 text-right">{consultorMessage.length}/1000</p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setConsultorOpen(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={submitConsultor}
                disabled={consultorSubmitting}
                className="flex-1 bg-[#FF6A00] hover:bg-[#FF7A1A] text-white font-black uppercase tracking-widest text-xs"
              >
                {consultorSubmitting ? "Enviando..." : "Enviar Pedido"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
