import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Gavel, Timer, MapPin, Users, Eye, TrendingUp, ArrowUp,
  ShieldCheck, Zap, Clock, AlertTriangle, Loader2, ChevronLeft,
  Heart, Share2, Store, Crown, Flame
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import type { AuctionListing, AuctionBid } from "@/hooks/useAuctions";

// ─── Helpers ────────────────────────────

function useLiveCountdown(endsAt: string) {
  const calc = () => {
    const diff = new Date(endsAt).getTime() - Date.now();
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0, ended: true };
    return {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
      total: diff,
      ended: false
    };
  };

  const [remaining, setRemaining] = useState(calc);

  useEffect(() => {
    const tick = () => setRemaining(calc());
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [endsAt]);

  return remaining;
}

export default function AuctionMarketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [favorited, setFavorited] = useState(false);

  // Fetch listing
  const { data: listing, isLoading: loadingListing, error } = useQuery<AuctionListing>({
    queryKey: ["auction-detail", id],
    queryFn: async () => {
      if (!id) throw new Error("ID não fornecido");
      const { data, error } = await supabase
        .from("auction_listings")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as AuctionListing;
    },
    enabled: !!id,
    refetchInterval: 10000,
  });

  // Fetch bids
  const { data: bids = [], isLoading: loadingBids } = useQuery<AuctionBid[]>({
    queryKey: ["auction-bids", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("auction_bids")
        .select("*")
        .eq("listing_id", id)
        .order("amount_cents", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as AuctionBid[];
    },
    enabled: !!id,
    refetchInterval: 5000,
  });

  // Fetch store name (if applicable)
  const { data: storeName } = useQuery({
    queryKey: ["store-name", listing?.store_id],
    queryFn: async () => {
      if (!listing?.store_id) return null;
      const { data } = await supabase
        .from("merchant_stores")
        .select("nome_loja")
        .eq("id", listing.store_id)
        .single();
      return data?.nome_loja || null;
    },
    enabled: !!listing?.store_id,
  });

  // Increment view
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        await (supabase.from("auction_listings") as any)
          .update({ views_count: ((listing as any)?.views_count || 0) + 1 })
          .eq("id", id);
      } catch { /* ignore */ }
    })();
  }, [id]);

  // ✅ Hook sempre chamado incondicionalmente — usa data fallback se listing ainda não carregou
  const remaining = useLiveCountdown(listing?.ends_at ?? new Date(Date.now() + 86400000).toISOString());

  const isActive = listing && listing.status === "active" && !remaining.ended;
  const currentBid = listing?.current_bid ?? listing?.starting_bid ?? 0;
  const minNextBid = currentBid + (listing?.minimum_increment || 1);
  const buyNowPrice = listing?.buy_now_price || null;
  const imgSrc = listing?.product_image_url || null;

  // Place bid mutation
  const queryClient = useQueryClient();
  const placeBid = useMutation({
    mutationFn: async ({ amountCents }: { amountCents: number }) => {
      if (!id) throw new Error("ID ausente");
      const { data, error } = await supabase.rpc("place_auction_bid", {
        p_listing_id: id,
        p_amount_cents: amountCents,
      });
      if (error) throw error;
      const result = data as any;
      if (!result.success) throw new Error(result.error || "Erro ao dar lance");
      return result;
    },
    onSuccess: () => {
      toast.success("Lance registrado! 🔥");
      queryClient.invalidateQueries({ queryKey: ["auction-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["auction-bids", id] });
      queryClient.invalidateQueries({ queryKey: ["public-auctions"] });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao dar lance");
    },
  });

  const handleBid = () => {
    const amount = minNextBid * 100; // convert to cents
    placeBid.mutate({ amountCents: amount });
  };

  // Formatar mensagem de urgência
  const urgencyClass = remaining.total > 0 && remaining.total < 3600000
    ? "text-red-600 animate-pulse"
    : remaining.total > 0 && remaining.total < 86400000
    ? "text-amber-600"
    : "text-[#FF6A00]";

  const urgencyBg = remaining.total > 0 && remaining.total < 3600000
    ? "bg-red-50 border-red-200"
    : remaining.total > 0 && remaining.total < 86400000
    ? "bg-amber-50 border-amber-200"
    : "bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200";

  // Stats
  const totalBids = listing?.total_bids || 0;
  const savings = buyNowPrice && currentBid
    ? Math.round(((buyNowPrice - currentBid) / buyNowPrice) * 100)
    : null;

  if (loadingListing) {
    return (
      <MarketLayout search="" setSearch={() => {}} hideCart={true} headerRight={null}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-12 w-12 animate-spin text-[#FF6A00]" />
        </div>
      </MarketLayout>
    );
  }

  if (!listing) {
    return (
      <MarketLayout search="" setSearch={() => {}} hideCart={true} headerRight={null}>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <AlertTriangle className="h-16 w-16 text-[#FF6A00]/30" />
          <h2 className="text-2xl font-black text-[#1B1F24]">Leilão não encontrado</h2>
          <Button onClick={() => navigate("/mercado/leiloes")} className="bg-[#FF6A00] hover:bg-[#E65C00]">
            <ChevronLeft className="w-4 h-4 mr-2" /> Voltar aos Leilões
          </Button>
        </div>
      </MarketLayout>
    );
  }

  return (
    <MarketLayout
      search=""
      setSearch={() => {}}
      hideCart={true}
      headerRight={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFavorited(f => !f)}
            className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-all"
          >
            <Heart className={cn("w-5 h-5", favorited ? "fill-red-500 text-red-500" : "")} />
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/20"
            onClick={() => navigator.share?.({
              title: listing.title,
              url: window.location.href
            })}
          >
            <Share2 className="w-5 h-5" />
          </Button>
        </div>
      }
    >
      <div className="min-h-screen bg-[#F5E62B] pb-12">
        {/* ── HERO / DECISION BLOCK ── */}
        <section className="relative py-8 px-4">
          <div className="max-w-4xl mx-auto space-y-6">

            {/* Breadcrumb */}
            <button
              onClick={() => navigate("/mercado/leiloes")}
              className="flex items-center gap-2 text-sm font-bold text-[#1B1F24] hover:text-[#FF6A00] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Voltar aos Leilões
            </button>

            {/* Main card */}
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border-4 border-[#FF6A00] ring-4 ring-[#FF6A00]/10">

              {/* Image area */}
              {imgSrc && (
                <div className="relative aspect-[16/9] bg-[#F5F7FA] overflow-hidden">
                  <img src={imgSrc} alt={listing.title} className="w-full h-full object-contain" />
                  <div className="absolute top-4 left-4">
                    <Badge className={cn(
                      "font-black uppercase tracking-widest text-[10px] px-3 py-1.5 shadow-lg",
                      listing.listing_type === 'arremate'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gradient-to-r from-[#FF6A00] to-[#FF8C33] text-white'
                    )}>
                      {listing.listing_type === 'arremate' ? 'Arremate' : 'Leilão'}
                    </Badge>
                  </div>
                  {remaining.ended && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <div className="bg-white/95 px-6 py-3 rounded-2xl">
                        <p className="font-black text-xl text-gray-900 flex items-center gap-2">
                          <Clock className="w-5 h-5" /> Encerrado
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="p-6 md:p-8 space-y-6">
                {/* Title & location */}
                <div className="space-y-2">
                  <h1 className="text-2xl md:text-3xl font-black text-[#1B1F24] leading-tight">
                    {listing.title}
                  </h1>
                  <div className="flex items-center gap-4 text-sm font-bold text-[#A7B0BE]">
                    {storeName && (
                      <span className="flex items-center gap-1.5">
                        <Store className="w-4 h-4 text-[#FF6A00]" /> {storeName}
                      </span>
                    )}
                    {listing.city && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-blue-500" />
                        {listing.city}{listing.neighborhood ? `, ${listing.neighborhood}` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Urgency timer */}
                {isActive && (
                  <div className={cn("rounded-2xl border-2 p-6 text-center", urgencyBg)}>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-gray-600 mb-2 font-black">
                      <Timer className="inline w-4 h-4 mr-1" /> Encerra em
                    </p>
                    <p className={cn("text-4xl md:text-5xl font-black tabular-nums tracking-tighter", urgencyClass)}>
                      {remaining.days > 0 && <><span className="text-2xl mr-1">{remaining.days}</span>d </>}
                      <span className="text-4xl">{String(remaining.hours).padStart(2,'0')}</span>:
                      <span className="text-4xl">{String(remaining.minutes).padStart(2,'0')}</span>:
                      <span className="text-4xl">{String(remaining.seconds).padStart(2,'0')}</span>
                    </p>
                    {remaining.total < 3600000 && (
                      <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500 text-white text-xs font-black animate-pulse">
                        <Flame className="w-3 h-3" /> ÚLTIMAS CHANCES!
                      </div>
                    )}
                  </div>
                )}

                {/* Pricing block */}
                <div className="bg-gradient-to-r from-[#FF6A00]/5 to-amber-50 rounded-2xl p-6 border-2 border-[#FF6A00]/20">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-1 font-black">
                        {listing.listing_type === 'arremate' ? 'Preço' : 'Lance Atual'}
                      </p>
                      <p className="text-3xl md:text-4xl font-black text-[#FF6A00] tracking-tighter">
                        {formatCurrencyBRL(currentBid)}
                      </p>
                      {buyNowPrice && buyNowPrice > currentBid && (
                        <p className="text-sm text-gray-400 line-through mt-1">
                          {formatCurrencyBRL(buyNowPrice)}
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-1 font-black">
                        {listing.listing_type === 'arremate' ? 'Oferta Mínima' : 'Próximo Lance'}
                      </p>
                      <p className="text-xl font-black text-[#1B1F24]">
                        {formatCurrencyBRL(minNextBid)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mb-1 font-black">
                        Participantes
                      </p>
                      <p className="text-xl font-black text-[#1B1F24] flex items-center gap-2">
                        <Users className="w-5 h-5 text-emerald-500" />
                        {totalBids}
                      </p>
                    </div>
                  </div>

                  {savings && savings > 0 && (
                    <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-600 font-black text-sm">
                      <TrendingUp className="w-4 h-4" />
                      {savings}% de desconto!
                    </div>
                  )}
                </div>

                {/* CTAs */}
                {isActive && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Button
                      size="lg"
                      onClick={handleBid}
                      disabled={placeBid.isPending}
                      className={cn(
                        "h-14 text-lg font-black rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2",
                        listing.listing_type === 'arremate'
                          ? "bg-blue-500 hover:bg-blue-600 text-white"
                          : "bg-gradient-to-r from-[#FF6A00] to-[#FF8C33] hover:from-[#FF7A1A] hover:to-[#FFA357] text-white"
                      )}
                    >
                      {placeBid.isPending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <Gavel className="w-5 h-5" />
                          {listing.listing_type === 'arremate' ? 'Fazer Oferta' : 'Dar Lance'}
                        </>
                      )}
                    </Button>

                    {buyNowPrice && (
                      <Button
                        size="lg"
                        variant="outline"
                        onClick={() => {/* TODO: implement buy now */}}
                        className="h-14 text-lg font-black rounded-2xl border-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                      >
                        <Crown className="w-5 h-5 mr-2" />
                        Arrematar Agora
                      </Button>
                    )}
                  </div>
                )}

                {/* Credit transparency banner */}
                <div className="bg-[#1B1F24] rounded-2xl p-5 border-l-4 border-[#FF6A00]">
                  <h3 className="text-white font-black uppercase tracking-wider mb-3 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-[#FF6A00]" />
                    Transparência de Créditos
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-[#A7B0BE] text-xs uppercase">Criação</p>
                      <p className="text-white font-black">7 CRÉDITOS</p>
                    </div>
                    <div>
                      <p className="text-[#A7B0BE] text-xs uppercase">Destaque</p>
                      <p className="text-white font-black">2-5 CRÉDITOS</p>
                    </div>
                    <div>
                      <p className="text-[#A7B0BE] text-xs uppercase">Comissão</p>
                      <p className="text-white font-black">% VARIÁVEL</p>
                    </div>
                    <div>
                      <p className="text-[#A7B0BE] text-xs uppercase">Por lance</p>
                      <p className="text-white font-black">0 CRÉDITOS</p>
                    </div>
                  </div>
                </div>

                {/* Description */}
                {listing.description && (
                  <div className="prose prose-sm max-w-none">
                    <h3 className="text-lg font-black text-[#1B1F24] mb-2">Descrição</h3>
                    <p className="text-[#A7B0BE] leading-relaxed whitespace-pre-wrap">
                      {listing.description}
                    </p>
                  </div>
                )}

                {/* Bids history */}
                {bids.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-black text-[#1B1F24] flex items-center gap-2">
                      <ArrowUp className="w-5 h-5 text-[#FF6A00]" />
                      Últimos Lances
                    </h3>
                    <div className="space-y-2">
                      {bids.slice(0, 10).map((bid, i) => (
                        <div
                          key={bid.id}
                          className={cn(
                            "flex items-center gap-4 p-4 rounded-2xl border",
                            i === 0
                              ? "bg-gradient-to-r from-[#FF6A00]/10 to-amber-50 border-[#FF6A00]/30 shadow-md"
                              : "bg-white border-gray-200"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center text-sm font-black",
                            i === 0 ? "bg-[#FF6A00] text-white" : "bg-gray-100 text-gray-500"
                          )}>
                            {i + 1}º
                          </div>
                          <div className="flex-1">
                            <p className={cn("text-lg font-black", i === 0 ? "text-[#FF6A00]" : "text-[#1B1F24]")}>
                              {formatCurrencyBRL(bid.amount_cents ? bid.amount_cents / 100 : 0)}
                            </p>
                            <p className="text-xs text-[#A7B0BE]">
                              {new Date(bid.created_at).toLocaleString("pt-BR")}
                            </p>
                          </div>
                          {bid.is_winning && (
                            <Badge className="bg-emerald-500 text-white">Vencendo</Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conditions */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl p-4 border border-gray-200 text-center shadow-sm">
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Entrega</p>
                    <p className="font-bold text-[#1B1F24] capitalize">
                      {(listing as any).fulfillment_type === "both" ? "Entrega/Retirada" : (listing as any).fulfillment_type || "Retirada"}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl p-4 border border-gray-200 text-center shadow-sm">
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-1">Status</p>
                    <p className="font-bold text-[#1B1F24] capitalize">{listing.status}</p>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="py-8 text-center text-[10px] font-bold text-[#A7B0BE] border-t border-[#FF6A00]/10 mt-8">
          <p>© 2025 Viagg-TX8 • Marketplace Premium • Todos os direitos reservados</p>
        </footer>
      </div>
    </MarketLayout>
  );
}
