/**
 * ArrematePublicPage — Tela pública de ARREMATE
 * Layout com menu superior do marketplace + fundo amarelo
 */
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Tag, MapPin, Eye, Users, Zap, Clock, Shield, ChevronRight,
  Loader2, AlertTriangle, Crown, TrendingUp, ShoppingCart, Send,
  Package, Timer, Flame, CheckCircle, Search, Truck, Store, Heart, Share2
} from "lucide-react";
import { toast } from "sonner";
import { useGlobalCart } from "@/hooks/useGlobalCart";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { GlobalCartDrawer } from "@/components/public/GlobalCartDrawer";
import { OfertaRapidaModal } from "@/components/public/MiniCadastroModal";
import type { AuctionListing } from "@/hooks/useAuctions";
import { InstitutionalSafetyBanner } from '@/components/public/InstitutionalSafetyBanner';
import { CardDark, CardInfo, DarkBadge, DarkButton, CardImageOverlay } from "@/components/ui/dark-card";
import { StoreHeader } from "@/components/public/store/StoreHeader";
import { StoreThemeScope } from "@/components/public/store/StoreThemeScope";
import { useAdvertiserSummary } from "@/components/public/advertiser/AdvertiserSummaryCard";

// ─── Helpers ────────────────────────────

function formatBRL(value: number | undefined | null) {
  if (value == null || isNaN(value)) return "R$ 0,00";
  return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
}

function normalizeImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function useCountdown(endsAt: string) {
  const [timeLeft, setTimeLeft] = useState("");
  const [urgency, setUrgency] = useState<"normal" | "warning" | "critical">("normal");

  useEffect(() => {
    const tick = () => {
      const diff = new Date(endsAt).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft("ENCERRADO"); setUrgency("critical"); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`);
      setUrgency(h < 1 ? "critical" : h < 6 ? "warning" : "normal");
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  return { timeLeft, urgency };
}

// ─── Trust Row (chips de confiança do arremate) ────────────────────────────
// O cabeçalho COMPLETO (logo/busca/categorias/conta/rádio) vem do MarketLayout;
// aqui fica só a faixa de confiança específica do Arremate, logo abaixo.

function TrustRow() {
  return (
    <div className="bg-[#10151A] border-b border-[#323A45]">
      <div className="max-w-[1920px] mx-auto px-4 lg:px-6 py-2 flex items-center justify-center gap-6 text-[11px] text-[#8E98A3]">
        <span className="flex items-center gap-1.5 font-medium">
          <Tag className="h-3.5 w-3.5 text-violet-500" /> Arremate Verificado
        </span>
        <span className="flex items-center gap-1.5 font-medium">
          <Shield className="h-3.5 w-3.5 text-green-500" /> Pagamento Seguro
        </span>
        <span className="flex items-center gap-1.5 font-medium hidden sm:flex">
          <Truck className="h-3.5 w-3.5 text-blue-500" /> Entrega Local
        </span>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────

export default function ArrematePublicPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [listing, setListing] = useState<AuctionListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [storeName, setStoreName] = useState("");
  const [favorited, setFavorited] = useState(false);
  // Offer modal state
  const [showOfertaModal, setShowOfertaModal] = useState(false);

  const outletContext = useOutletContext<{ isStoreContext?: boolean }>();
  const isStoreContext = outletContext?.isStoreContext;
  const [ofertaFixedAmount, setOfertaFixedAmount] = useState<number | undefined>(undefined);
  const [ofertaAllowCustom, setOfertaAllowCustom] = useState(true);

  // Identidade oficial da loja (mesmo padrão de Imóveis/Veículos): em contexto
  // de loja o StoreLayout já exibe o cabeçalho — aqui só na rota standalone.
  const { data: advertiserData } = useAdvertiserSummary(listing?.store_id, "leiloes");
  const storeInfo = advertiserData?.store;
  const storeTargetId = advertiserData?.targetId || listing?.store_id;

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: listing?.title, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Link copiado!");
    }
  };

  const handleBackToList = () => {
    if (isStoreContext && listing?.store_id) {
      navigate(`/loja/${listing.store_id}?tab=arremates`);
    } else {
      navigate("/leiloes");
    }
  };

  // Cart
  const [cartOpen, setCartOpen] = useState(false);
  const globalCart = useGlobalCart();
  // Busca do cabeçalho completo (MarketLayout)
  const [search, setSearch] = useState("");

  const { timeLeft, urgency } = useCountdown(listing?.ends_at || new Date().toISOString());

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("auction_listings")
      .select("*")
      .eq("id", id)
      .single();

    if (!error && data) {
      setListing(data as AuctionListing);
      const { data: store } = await supabase
        .from("merchant_stores")
        .select("nome_loja")
        .eq("id", data.store_id)
        .single();
      if (store) setStoreName(store.nome_loja);

      // Increment view — via RPC SECURITY DEFINER (UPDATE direto era negado pela
      // RLS para visitantes anônimos: 401 no console e métrica congelada).
      supabase.rpc("increment_auction_view" as any, { p_listing_id: id }).then(() => undefined, () => undefined);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Resolve real price fields (values in R$, not cents)
  const opportunityPrice = listing?.starting_bid ?? listing?.buy_now_price ?? 0;
  const normalPrice = listing?.buy_now_price ?? null;
  const savings = normalPrice && opportunityPrice
    ? Math.round(((normalPrice - opportunityPrice) / normalPrice) * 100)
    : null;
  const isActive = listing ? listing.status === "active" && new Date(listing.ends_at) > new Date() : false;
  const imgSrc = listing ? normalizeImageUrl((listing as any).product_image_url) : null;

  // Arrematar (buy at opportunity price) — opens modal with fixed amount
  const handleArremate = () => {
    setOfertaFixedAmount(opportunityPrice);
    setOfertaAllowCustom(false);
    setShowOfertaModal(true);
  };

  // Enviar oferta personalizada — opens modal with editable amount
  const handleSendOffer = () => {
    setOfertaFixedAmount(undefined);
    setOfertaAllowCustom(true);
    setShowOfertaModal(true);
  };

  if (loading) {
    if (isStoreContext) return (
        <>
          <TrustRow />
          <div className="flex items-center justify-center min-h-[50vh]">
            <Loader2 className="h-10 w-10 animate-spin text-orange-400" />
          </div>
        </>
    );

    return (
      <MarketLayout search={search} setSearch={setSearch} onSearchSubmit={(v) => navigate(`/busca?q=${encodeURIComponent(v)}`)} headerChildren={<MarketNavButtons />} mainClassName="flex flex-col bg-[#F5E62B]" blueFooter blueFooterLabel="👨‍⚖️ Arremates" myAccountPath="/meus-lances">
        <TrustRow />
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-10 w-10 animate-spin text-orange-400" />
        </div>
      </MarketLayout>
    );
  }

  if (!listing) {
    if (isStoreContext) return (
        <>
          <TrustRow />
          <div className="flex flex-col items-center justify-center flex-1 gap-4 py-24">
            <AlertTriangle className="h-12 w-12 text-gray-300" />
            <p className="text-gray-600 font-medium">Arremate não encontrado</p>
            <Button variant="outline" onClick={handleBackToList}>Ver todos</Button>
          </div>
        </>
    );

    return (
      <MarketLayout search={search} setSearch={setSearch} onSearchSubmit={(v) => navigate(`/busca?q=${encodeURIComponent(v)}`)} headerChildren={<MarketNavButtons />} mainClassName="flex flex-col bg-[#F5E62B]" blueFooter blueFooterLabel="👨‍⚖️ Arremates" myAccountPath="/meus-lances">
        <TrustRow />
        <div className="flex flex-col items-center justify-center flex-1 gap-4 py-24">
          <AlertTriangle className="h-12 w-12 text-gray-300" />
          <p className="text-gray-600 font-medium">Arremate não encontrado</p>
          <Button variant="outline" onClick={handleBackToList}>Ver todos</Button>
        </div>
      </MarketLayout>
    );
  }

  const content = (
      <>
      {/* ─── FAIXA DE CONFIANÇA DO ARREMATE (o cabeçalho completo vem do MarketLayout) ─── */}
      <TrustRow />

      {/* ─── CABEÇALHO OFICIAL DA LOJA (mesmo componente dos demais módulos) ─── */}
      {storeInfo && !isStoreContext && (
        <StoreThemeScope appearance={storeInfo.appearance}>
          <div className="w-full bg-[#F5E62B]">
            <StoreHeader
              store={storeInfo}
              productsCount={advertiserData?.totalCount || 0}
              profileType={advertiserData?.type || "leiloes"}
              showProfileButton={true}
              profileId={storeTargetId}
              compact={false}
              onShare={handleShare}
            />
          </div>
        </StoreThemeScope>
      )}

      {/* ─── HERO ─── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-violet-100/50 via-transparent to-transparent" />

        <div className="relative max-w-lg mx-auto px-4 pt-6 pb-8 space-y-5">
          {/* Badge */}
          <div className="flex items-center justify-center gap-2">
            <DarkBadge tone="green" className="bg-[#1A1F24] px-3 py-1 text-xs shadow-md">
              <Tag className="h-3.5 w-3.5" /> Oportunidade
            </DarkBadge>
          </div>

          {/* Product image */}
          {imgSrc && (
            <div className="relative rounded-2xl overflow-hidden bg-[#252B33] shadow-[0_8px_24px_rgba(0,0,0,0.35)] border border-[#323A45]">
              <img src={imgSrc} alt={listing.title} className="w-full aspect-[16/9] object-contain bg-[#252B33]" />
              <CardImageOverlay />
              <div className="absolute top-3 right-3 flex items-center gap-2">
                  <button onClick={() => setFavorited(!favorited)} className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition-colors">
                    <Heart className={`h-4 w-4 ${favorited ? "fill-red-500 text-red-500" : ""}`} />
                  </button>
                  <button onClick={() => {
                    if (navigator.share) {
                      navigator.share({ title: listing.title, url: window.location.href })
                    } else {
                      navigator.clipboard.writeText(window.location.href);
                      toast.success("Link copiado!");
                    }
                  }} className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition-colors">
                    <Share2 className="h-4 w-4" />
                  </button>
              </div>
            </div>
          )}

          {/* Title */}
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 text-center leading-tight">
            {listing.title}
          </h1>

          {/* Location (a identidade da loja vive no StoreHeader oficial, no topo) */}
          <div className="flex flex-col items-center justify-center gap-3 w-full my-6">
            {listing.city && (
              <span className="flex items-center justify-center gap-1 text-sm text-gray-600 mt-2">
                <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                {listing.neighborhood ? `${listing.neighborhood}, ` : ""}{listing.city}
              </span>
            )}
          </div>

          {/* Prices */}
          <CardDark className="p-5 space-y-3">
            {normalPrice && normalPrice > opportunityPrice && (
              <div className="text-center">
                <p className="text-[10px] text-[#8E98A3] uppercase tracking-wider">Preço normal</p>
                <p className="text-xl text-[#8E98A3] line-through">{formatBRL(normalPrice)}</p>
              </div>
            )}
            <div className="text-center">
              <p className="text-[10px] text-[#00C58E] uppercase tracking-wider font-bold">Preço de oportunidade</p>
              <p className="text-4xl font-black text-[#FF7A00]">{formatBRL(opportunityPrice)}</p>
              {savings && savings > 0 && (
                <span className="inline-flex items-center gap-1 mt-1 px-3 py-1 rounded-full bg-[#00C58E]/15 text-[#00C58E] text-sm font-bold">
                  <TrendingUp className="h-4 w-4" /> Economize {savings}%
                </span>
              )}
            </div>
          </CardDark>

          {/* Quick info */}
          <div className="grid grid-cols-3 gap-3">
            <CardInfo className="text-center p-3">
              <Package className="h-4 w-4 text-[#00C58E] mx-auto mb-1" />
              <p className="text-lg font-black text-white">{(listing as any).stock_quantity || "—"}</p>
              <p className="text-[10px] text-[#8E98A3]">Estoque</p>
            </CardInfo>
            <CardInfo className="text-center p-3">
              <Timer className="h-4 w-4 text-amber-400 mx-auto mb-1" />
              <p className="text-lg font-black text-white">{(listing as any).response_deadline_hours || "—"}h</p>
              <p className="text-[10px] text-[#8E98A3]">Prazo resposta</p>
            </CardInfo>
            <CardInfo className="text-center p-3">
              <Users className="h-4 w-4 text-[#B8C2CC] mx-auto mb-1" />
              <p className="text-lg font-black text-white">{listing.offer_count || 0}</p>
              <p className="text-[10px] text-[#8E98A3]">Ofertas</p>
            </CardInfo>
          </div>

          {/* Countdown */}
          {isActive && (
            <div className={`text-center py-3 rounded-xl border shadow-sm ${
              urgency === "critical" ? "bg-[#1A1F24] border-red-500/50" : "bg-[#1A1F24] border-[#323A45]"
            }`}>
              <p className="text-[10px] text-[#8E98A3] mb-0.5">Oportunidade disponível por</p>
              <p className={`text-2xl font-black ${urgency === "critical" ? "text-red-400 animate-pulse" : "text-white"}`}>
                {timeLeft}
              </p>
            </div>
          )}

          {/* CTAs */}
          {isActive && (
            <div className="space-y-3">
              {/* Arrematar direto */}
              <DarkButton
                className="w-full h-14 text-base flex items-center justify-center"
                onClick={handleArremate}
              >
                <ShoppingCart className="h-5 w-5 mr-2" />
                Arrematar por {formatBRL(opportunityPrice)}
              </DarkButton>

              {/* Enviar oferta personalizada */}
              <Button
                variant="outline"
                className="w-full h-12 text-sm font-bold border-[#323A45] bg-[#1A1F24] text-white hover:bg-[#252B33] hover:text-white rounded-xl"
                onClick={handleSendOffer}
              >
                <Send className="h-4 w-4 mr-2" /> Enviar minha oferta
              </Button>
            </div>
          )}

          {!isActive && (
            <CardDark className="text-center py-6">
              <p className="text-lg font-bold text-[#B8C2CC]">
                {listing.status === "sold" ? "Vendido!" : "Oportunidade encerrada"}
              </p>
            </CardDark>
          )}
        </div>
      </div>

      {/* ── SOCIAL PROOF ── */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-3">
        {(listing.offer_count || 0) > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1A1F24] border border-[#FF7A00]/40">
            <Flame className="h-3.5 w-3.5 text-[#FF7A00] shrink-0" />
            <p className="text-xs text-orange-300">
              {(listing.offer_count || 0) > 3
                ? `🔥 Alta demanda — ${listing.offer_count} ofertas recebidas`
                : `${listing.offer_count} pessoa(s) já fizeram oferta`}
            </p>
          </div>
        )}
        {(listing as any).stock_quantity && (listing as any).stock_quantity <= 3 && (listing as any).stock_quantity > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1A1F24] border border-amber-500/40">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">⚡ Apenas {(listing as any).stock_quantity} unidade(s) disponíveis</p>
          </div>
        )}
        {listing.city && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1A1F24] border border-[#00C58E]/40">
            <MapPin className="h-3.5 w-3.5 text-[#00C58E] shrink-0" />
            <p className="text-xs text-[#00C58E]">📍 Produto da sua região — {listing.neighborhood || listing.city}</p>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1A1F24] border border-[#323A45]">
          <CheckCircle className="h-3.5 w-3.5 text-[#00C58E] shrink-0" />
          <p className="text-xs text-[#B8C2CC]">
            {(listing as any).fulfillment_type === "both" ? "📦 Entrega ou retirada disponível" : (listing as any).fulfillment_type === "delivery" ? "🚚 Entrega disponível" : "🏪 Retirada na loja"}
          </p>
        </div>
      </div>

      {/* ── DETAILS ── */}
      <div className="max-w-lg mx-auto px-4 pb-12 space-y-4">
        {listing.description && (
          <CardInfo className="p-4 space-y-2">
            <h3 className="text-sm font-bold text-white">Descrição</h3>
            <p className="text-sm text-[#B8C2CC] whitespace-pre-wrap">{listing.description}</p>
          </CardInfo>
        )}

        <div className="grid grid-cols-2 gap-3">
          <CardInfo className="p-3 text-center">
            <p className="text-[10px] text-[#8E98A3] uppercase mb-1">Condição</p>
            <p className="text-sm font-bold text-white capitalize">{(listing as any).condition || "—"}</p>
          </CardInfo>
          <CardInfo className="p-3 text-center">
            <p className="text-[10px] text-[#8E98A3] uppercase mb-1">Categoria</p>
            <p className="text-sm font-bold text-white capitalize">{(listing as any).category || "—"}</p>
          </CardInfo>
        </div>

        <div className="flex items-center justify-center gap-4 py-4 text-[10px] text-gray-600">
          <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-emerald-500" /> Plataforma segura</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-blue-400" /> Resposta em até {(listing as any).response_deadline_hours || "24"}h</span>
        </div>

        <Button variant="ghost" className="w-full text-gray-600 hover:text-gray-900" onClick={handleBackToList}>
          <ChevronRight className="h-4 w-4 mr-1 rotate-180" /> Ver mais oportunidades
        </Button>
      </div>

      <GlobalCartDrawer
        open={cartOpen}
        onOpenChange={setCartOpen}
        globalCart={globalCart}
      />

      {/* ═══ OFERTA RÁPIDA MODAL ═══ */}
      {listing && (
        <OfertaRapidaModal
          open={showOfertaModal}
          onClose={() => setShowOfertaModal(false)}
          listingId={listing.id}
          listingTitle={listing.title}
          defaultAmount={ofertaFixedAmount}
          allowCustomAmount={ofertaAllowCustom}
          context="arremate"
          onSuccess={fetchData}
        />
      )}

      {/* ═══ FOOTER ═══ (o rodapé azul vem do MarketLayout via blueFooter) */}
      <InstitutionalSafetyBanner />
      </>
  );

  if (isStoreContext) {
      return (
          <div className="flex-1 flex flex-col bg-store-background text-store-primary min-h-screen">
              {content}
          </div>
      );
  }

  return (
    <MarketLayout
      search={search}
      setSearch={setSearch}
      onSearchSubmit={(v) => navigate(`/busca?q=${encodeURIComponent(v)}`)}
      headerChildren={<MarketNavButtons />}
      mainClassName="flex flex-col bg-[#F5E62B]"
      blueFooter
      blueFooterLabel="👨‍⚖️ Arremates"
      myAccountPath="/meus-lances"
    >
        {content}
    </MarketLayout>
  );
}
