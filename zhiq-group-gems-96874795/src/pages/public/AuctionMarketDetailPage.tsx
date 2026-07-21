import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Gavel, Timer, MapPin, Users, Eye, TrendingUp, ArrowUp,
  Zap, Clock, AlertTriangle, Loader2, ChevronLeft,
  Heart, Share2, Store, Crown, Flame
} from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrencyBRL } from "@/lib/utils";
import { CardDark, CardInfo, DarkBadge, DarkButton, CardImageOverlay } from "@/components/ui/dark-card";
import type { AuctionListing, AuctionBid } from "@/hooks/useAuctions";
import { InstitutionalSafetyBanner } from '@/components/public/InstitutionalSafetyBanner';

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
    ? "text-red-400 animate-pulse"
    : remaining.total > 0 && remaining.total < 86400000
    ? "text-amber-400"
    : "text-[#FF7A00]";

  const urgencyBg = remaining.total > 0 && remaining.total < 3600000
    ? "bg-red-500/10 border-red-500/40"
    : remaining.total > 0 && remaining.total < 86400000
    ? "bg-amber-500/10 border-amber-500/40"
    : "bg-[#252B33] border-[#323A45]";

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
            <CardDark className="rounded-3xl ring-1 ring-[#FF7A00]/20">

              {/* Image area */}
              {imgSrc && (
                <div className="relative aspect-[16/9] bg-[#252B33] overflow-hidden">
                  <img src={imgSrc} alt={listing.title} className="w-full h-full object-contain" />
                  <CardImageOverlay />
                  <div className="absolute top-4 left-4">
                    <DarkBadge
                      tone={listing.listing_type === 'arremate' ? 'green' : 'orange'}
                      className="bg-[#1A1F24]/80 px-3 py-1.5 shadow-lg backdrop-blur-sm"
                    >
                      {listing.listing_type === 'arremate' ? 'Arremate' : 'Leilão'}
                    </DarkBadge>
                  </div>
                  {remaining.ended && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <div className="bg-[#1A1F24]/95 border border-[#323A45] px-6 py-3 rounded-2xl">
                        <p className="font-black text-xl text-white flex items-center gap-2">
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
                  <h1 className="text-2xl md:text-3xl font-black text-white leading-tight">
                    {listing.title}
                  </h1>
                  <div className="flex items-center gap-4 text-sm font-bold text-[#B8C2CC]">
                    {storeName && (
                      <span className="flex items-center gap-1.5">
                        <Store className="w-4 h-4 text-[#FF7A00]" /> {storeName}
                      </span>
                    )}
                    {listing.city && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-[#00C58E]" />
                        {listing.city}{listing.neighborhood ? `, ${listing.neighborhood}` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Urgency timer */}
                {isActive && (
                  <div className={cn("rounded-2xl border-2 p-6 text-center", urgencyBg)}>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[#8E98A3] mb-2 font-black">
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
                <CardInfo className="rounded-2xl p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[#8E98A3] mb-1 font-black">
                        {listing.listing_type === 'arremate' ? 'Preço' : 'Lance Atual'}
                      </p>
                      <p className="text-3xl md:text-4xl font-black text-[#FF7A00] tracking-tighter">
                        {formatCurrencyBRL(currentBid)}
                      </p>
                      {buyNowPrice && buyNowPrice > currentBid && (
                        <p className="text-sm text-[#8E98A3] line-through mt-1">
                          {formatCurrencyBRL(buyNowPrice)}
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[#8E98A3] mb-1 font-black">
                        {listing.listing_type === 'arremate' ? 'Oferta Mínima' : 'Próximo Lance'}
                      </p>
                      <p className="text-xl font-black text-white">
                        {formatCurrencyBRL(minNextBid)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-[#8E98A3] mb-1 font-black">
                        Participantes
                      </p>
                      <p className="text-xl font-black text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-[#00C58E]" />
                        {totalBids}
                      </p>
                    </div>
                  </div>

                  {savings && savings > 0 && (
                    <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00C58E]/15 text-[#00C58E] font-black text-sm">
                      <TrendingUp className="w-4 h-4" />
                      {savings}% de desconto!
                    </div>
                  )}
                </CardInfo>

                {/* CTAs */}
                {isActive && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <DarkButton
                      onClick={handleBid}
                      disabled={placeBid.isPending}
                      className="h-14 text-lg flex items-center justify-center gap-2 active:scale-95"
                    >
                      {placeBid.isPending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <Gavel className="w-5 h-5" />
                          {listing.listing_type === 'arremate' ? 'Fazer Oferta' : 'Dar Lance'}
                        </>
                      )}
                    </DarkButton>

                    {buyNowPrice && (
                      <Button
                        size="lg"
                        variant="outline"
                        onClick={() => {/* TODO: implement buy now */}}
                        className="h-14 text-lg font-black rounded-2xl border-2 border-[#00C58E] bg-transparent text-[#00C58E] hover:bg-[rgba(0,197,142,0.12)] hover:text-[#00C58E]"
                      >
                        <Crown className="w-5 h-5 mr-2" />
                        Arrematar Agora
                      </Button>
                    )}
                  </div>
                )}

                {/* Description */}
                {listing.description && (
                  <div className="prose prose-sm max-w-none">
                    <h3 className="text-lg font-black text-white mb-2">Descrição</h3>
                    <p className="text-[#B8C2CC] leading-relaxed whitespace-pre-wrap">
                      {listing.description}
                    </p>
                  </div>
                )}

                {/* Bids history */}
                {bids.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-black text-white flex items-center gap-2">
                      <ArrowUp className="w-5 h-5 text-[#FF7A00]" />
                      Últimos Lances
                    </h3>
                    <div className="space-y-2">
                      {bids.slice(0, 10).map((bid, i) => (
                        <div
                          key={bid.id}
                          className={cn(
                            "flex items-center gap-4 p-4 rounded-2xl border",
                            i === 0
                              ? "bg-[#FF7A00]/10 border-[#FF7A00]/40 shadow-md"
                              : "bg-[#252B33] border-[#323A45]"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center text-sm font-black",
                            i === 0 ? "bg-[#FF7A00] text-white" : "bg-[#323A45] text-[#B8C2CC]"
                          )}>
                            {i + 1}º
                          </div>
                          <div className="flex-1">
                            <p className={cn("text-lg font-black", i === 0 ? "text-[#FF7A00]" : "text-white")}>
                              {formatCurrencyBRL(bid.amount_cents ? bid.amount_cents / 100 : 0)}
                            </p>
                            <p className="text-xs text-[#8E98A3]">
                              {new Date(bid.created_at).toLocaleString("pt-BR")}
                            </p>
                          </div>
                          {bid.is_winning && (
                            <DarkBadge tone="green">Vencendo</DarkBadge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conditions */}
                <div className="grid grid-cols-2 gap-4">
                  <CardInfo className="p-4 text-center">
                    <p className="text-xs uppercase tracking-wider text-[#8E98A3] mb-1">Entrega</p>
                    <p className="font-bold text-white capitalize">
                      {(listing as any).fulfillment_type === "both" ? "Entrega/Retirada" : (listing as any).fulfillment_type || "Retirada"}
                    </p>
                  </CardInfo>
                  <CardInfo className="p-4 text-center">
                    <p className="text-xs uppercase tracking-wider text-[#8E98A3] mb-1">Status</p>
                    <p className="font-bold text-white capitalize">{listing.status}</p>
                  </CardInfo>
                </div>

              </div>
            </CardDark>
          </div>
        </section>

        <InstitutionalSafetyBanner />

        {/* FOOTER */}
        <footer className="py-8 text-center text-[10px] font-bold text-[#A7B0BE] border-t border-[#FF6A00]/10 mt-8">
          <p>© 2025 Viagg-TX8 • Marketplace Premium • Todos os direitos reservados</p>
        </footer>
      </div>
    </MarketLayout>
  );
}
