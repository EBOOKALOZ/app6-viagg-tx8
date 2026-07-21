/**
 * AuctionPublicPage — Tela pública de LEILÃO
 * Layout com menu superior do marketplace + conteúdo premium
 */
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Gavel, Timer, TrendingUp, MapPin, Eye, Users, Zap, ArrowUp,
  Clock, Shield, ChevronRight, Loader2, AlertTriangle, Crown, Flame,
  ShoppingCart, Search, ShoppingBag, Truck, Store, Tag,
} from "lucide-react";
import { toast } from "sonner";
import { useGlobalCart } from "@/hooks/useGlobalCart";
import { GlobalCartDrawer } from "@/components/public/GlobalCartDrawer";
import { OfertaRapidaModal } from "@/components/public/MiniCadastroModal";
import type { AuctionListing, AuctionBid } from "@/hooks/useAuctions";
import { InstitutionalSafetyBanner } from '@/components/public/InstitutionalSafetyBanner';
import { CardDark, CardInfo, CardHighlight, DarkBadge, DarkButton, CardImageOverlay } from "@/components/ui/dark-card";

// ─── Helpers ────────────────────────────

function formatBRL(value: number | undefined | null) {
  if (value == null || isNaN(value)) return "R$ 0,00";
  return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
}

function useCountdown(endsAt: string) {
  const [timeLeft, setTimeLeft] = useState("");
  const [urgency, setUrgency] = useState<"normal" | "warning" | "critical">("normal");

  useEffect(() => {
    const tick = () => {
      const diff = new Date(endsAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("ENCERRADO");
        setUrgency("critical");
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);

      if (h > 0) setTimeLeft(`${h}h ${m}m ${s}s`);
      else if (m > 0) setTimeLeft(`${m}m ${s}s`);
      else setTimeLeft(`${s}s`);

      setUrgency(h < 1 ? "critical" : h < 6 ? "warning" : "normal");
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  return { timeLeft, urgency };
}

// ─── Top Bar Component ──────────────────

function TopBar({ navigate, globalCart, cartOpen, setCartOpen }: any) {
  return (
    <>
      {/* ═══ TOP BAR ═══ */}
      <div className="bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] sticky top-0 z-50 shadow-md">
        <div className="max-w-[1920px] mx-auto px-4 lg:px-6">
          <div className="flex items-center gap-4 h-14">
            <div className="flex items-center gap-2 shrink-0 cursor-pointer" onClick={() => navigate("/mercado")}>
              <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="h-9 w-9 rounded-lg object-contain" />
              <span className="text-lg font-black text-white tracking-tight hidden sm:block">
                Leilões <span className="text-yellow-200">Viagg-TX8</span>
              </span>
              <span className="text-lg font-black text-white tracking-tight sm:hidden">Leilões</span>
            </div>

            {/* Search */}
            <div className="flex-1 max-w-2xl mx-auto">
              <div className="relative flex cursor-pointer" onClick={() => navigate("/leiloes")}>
                <Input
                  placeholder="Buscar leilões, arremates..."
                  readOnly
                  className="w-full pl-4 pr-12 py-2 h-10 rounded-l-lg rounded-r-none border-0 bg-white text-gray-700 placeholder:text-gray-400 text-sm font-medium focus-visible:ring-0 cursor-pointer"
                />
                <button className="px-4 bg-[#e65c00] hover:bg-[#cc5200] transition-colors rounded-r-lg flex items-center">
                  <Search className="h-5 w-5 text-white" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 text-white shrink-0">
              {/* Navigation links */}
              <div className="hidden md:flex items-center gap-3">
                <button
                  onClick={() => navigate("/leiloes")}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white/15 hover:bg-white/25 transition-all flex items-center gap-1"
                >
                  <Gavel className="h-3 w-3" /> Leilões
                </button>
                <button
                  onClick={() => navigate("/mercado")}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white/15 hover:bg-white/25 transition-all flex items-center gap-1"
                >
                  <Store className="h-3 w-3" /> Mercado
                </button>
              </div>
              {/* Cart */}
              <button
                onClick={() => setCartOpen(true)}
                className={`relative flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${
                  globalCart.totalItems > 0
                    ? "bg-white text-[#FF6A00] shadow-lg hover:shadow-xl hover:scale-105"
                    : "bg-white/15 text-white hover:bg-white/25"
                }`}
              >
                <ShoppingBag className="h-5 w-5" />
                {globalCart.totalItems > 0 ? (
                  <>
                    <span className="text-[11px] font-bold hidden sm:block">
                      {globalCart.totalItems} {globalCart.totalItems === 1 ? "item" : "itens"}
                    </span>
                    <span className="absolute -top-1.5 -right-1.5 bg-[#FF6A00] text-white text-[10px] font-black rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1 shadow-md">
                      {globalCart.totalItems}
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] font-bold hidden sm:block">Cesta</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ TRUST BAR ═══ */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-[1920px] mx-auto px-4 lg:px-6 py-2 flex items-center justify-center gap-6 text-[11px] text-gray-500">
          <span className="flex items-center gap-1.5 font-medium">
            <Gavel className="h-3.5 w-3.5 text-[#FF6A00]" /> Leilão Verificado
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <Shield className="h-3.5 w-3.5 text-green-500" /> Pagamento Seguro
          </span>
          <span className="flex items-center gap-1.5 font-medium hidden sm:flex">
            <Truck className="h-3.5 w-3.5 text-blue-500" /> Entrega Local
          </span>
        </div>
      </div>
    </>
  );
}

// ─── Page ────────────────────────────────

export default function AuctionPublicPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [listing, setListing] = useState<AuctionListing | null>(null);
  const [bids, setBids] = useState<AuctionBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeName, setStoreName] = useState("");

  // Cart
  const [cartOpen, setCartOpen] = useState(false);
  const globalCart = useGlobalCart();
  const [q, setQ] = useState("");

  // Offer modal state
  const [showOfertaModal, setShowOfertaModal] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [ofertaFixedAmount, setOfertaFixedAmount] = useState<number | undefined>(undefined);
  const [ofertaAllowCustom, setOfertaAllowCustom] = useState(true);

  const { timeLeft, urgency } = useCountdown(listing?.ends_at || new Date().toISOString());

  // Fetch listing + bids
  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const { data: l, error } = await supabase
      .from("auction_listings")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !l) {
      setLoading(false);
      return;
    }

    setListing(l as AuctionListing);

    // Store name
    const { data: store } = await supabase
      .from("merchant_stores")
      .select("nome_loja")
      .eq("id", l.store_id)
      .single();
    if (store) setStoreName(store.nome_loja);

    // Bids
    const { data: b } = await supabase
      .from("auction_bids")
      .select("*")
      .eq("listing_id", id)
      .order("amount_cents", { ascending: false })
      .limit(20);
    setBids((b || []) as AuctionBid[]);

    // Increment view (silently ignore if views_count column is missing)
    try {
      await supabase
        .from("auction_listings")
        .update({ views_count: ((l as any).views_count || 0) + 1 } as any)
        .eq("id", id);
    } catch {}

    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime bids
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`auction-bids-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "auction_bids", filter: `listing_id=eq.${id}` }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchData]);

  // Resolve prices from DB (values are in R$, not cents)
  const currentBid = listing?.current_bid ?? listing?.starting_bid ?? 0;
  const buyNowPrice = listing?.buy_now_price ?? null;
  const minimumIncrement = listing?.minimum_increment ?? 1;
  const minNextBid = currentBid + minimumIncrement;
  const imgSrc = listing?.product_image_url || null;

  const savings = buyNowPrice && currentBid
    ? Math.round(((buyNowPrice - currentBid) / buyNowPrice) * 100)
    : null;

  // Place bid — opens modal with editable amount
  const handleBid = () => {
    setOfertaFixedAmount(minNextBid);
    setOfertaAllowCustom(true);
    setShowOfertaModal(true);
  };

  // Buy now — opens modal with fixed amount
  const handleBuyNow = () => {
    if (!buyNowPrice) return;
    setOfertaFixedAmount(buyNowPrice);
    setOfertaAllowCustom(false);
    setShowOfertaModal(true);
  };

  if (loading) {
    return (
      <MarketLayout search={q} setSearch={setQ} headerChildren={<MarketNavButtons />} lockHeaderExpanded
        mainClassName="flex flex-col bg-[#F5E62B]" blueFooter blueFooterLabel="🏷️ Leilões" myAccountPath="/minha-conta">
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-10 w-10 animate-spin text-orange-400" />
        </div>
      </MarketLayout>
    );
  }

  if (!listing) {
    return (
      <MarketLayout search={q} setSearch={setQ} headerChildren={<MarketNavButtons />} lockHeaderExpanded
        mainClassName="flex flex-col bg-[#F5E62B]" blueFooter blueFooterLabel="🏷️ Leilões" myAccountPath="/minha-conta">
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <AlertTriangle className="h-12 w-12 text-gray-400" />
          <p className="text-gray-600 font-medium">Leilão não encontrado</p>
          <Button variant="outline" onClick={() => navigate("/leiloes")}>Ver todos</Button>
        </div>
      </MarketLayout>
    );
  }

  const isActive = listing.status === "active" && new Date(listing.ends_at) > new Date();
  const totalBids = listing.total_bids || 0;

  return (
    <MarketLayout
      search={q}
      setSearch={setQ}
      headerChildren={<MarketNavButtons />}
      lockHeaderExpanded
      mainClassName="flex flex-col bg-[#F5E62B]"
      blueFooter
      blueFooterLabel="🏷️ Leilões"
      myAccountPath="/minha-conta"
    >
      {/* ── HERO — Decision Block ── */}
      <div className="relative overflow-hidden">
        <div className="relative max-w-lg mx-auto px-4 pt-6 pb-8">
          {/* Badge */}
          <div className="flex items-center justify-center gap-2 mb-5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500 text-white text-xs font-bold uppercase tracking-wider shadow-md">
              <Gavel className="h-3.5 w-3.5" /> Leilão {isActive ? "Ativo" : "Encerrado"}
            </span>
          </div>

          {/* ── Premium Card Container ── */}
          <CardDark className="rounded-3xl p-6 space-y-5">

            {/* Product image */}
            {imgSrc && (
              <div className="relative rounded-2xl overflow-hidden bg-[#252B33] border border-[#323A45]">
                <img src={imgSrc} alt={listing.title} className="w-full aspect-[16/9] object-contain bg-[#252B33]" />
                <CardImageOverlay />
              </div>
            )}

            {/* Title */}
            <h1 className="text-2xl md:text-3xl font-black text-white text-center leading-tight">
              {listing.title}
            </h1>

            {/* Store + Location */}
            <div className="flex items-center justify-center gap-3 text-sm text-[#B8C2CC]">
              <span className="flex items-center gap-1">
                <Crown className="h-3.5 w-3.5 text-amber-400" /> {storeName || "Loja"}
              </span>
              {listing.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-[#00C58E]" />
                  {listing.neighborhood ? `${listing.neighborhood}, ` : ""}{listing.city}
                </span>
              )}
            </div>

            {/* Description */}
            {listing.description && (
              <div className="text-center">
                <p className={`text-sm text-[#B8C2CC] whitespace-pre-wrap ${descExpanded ? "" : "line-clamp-3"}`}>
                  {listing.description}
                </p>
                {(listing.description.length > 120 || listing.description.split("\n").length > 3) && (
                  <button
                    onClick={() => setDescExpanded(v => !v)}
                    className="mt-1 text-xs font-bold text-[#FF7A00] hover:text-[#FF8E1F]"
                  >
                    {descExpanded ? "Ver menos" : "Ver descrição completa"}
                  </button>
                )}
              </div>
            )}

            {/* Countdown */}
            {(() => {
              const isCrit = urgency === "critical";
              const isWarn = urgency === "warning";
              const isNormal = !isCrit && !isWarn;
              return (
            <div
              className={`text-center py-4 rounded-2xl border shadow-md ${
                isCrit ? "bg-red-500/10 border-red-500/40"
                : isWarn ? "bg-amber-500/10 border-amber-500/40"
                : "border-transparent"
              }`}
              style={isNormal ? { backgroundColor: "#00a300" } : undefined}
            >
              <p className={`text-[10px] uppercase tracking-widest mb-1 flex items-center justify-center gap-1 ${
                isNormal ? "text-white/85" : "text-[#8E98A3]"
              }`}>
                <Timer className="h-3 w-3" /> Encerra em
              </p>
              <p className={`text-4xl md:text-5xl font-black tracking-tight ${
                isCrit ? "text-red-400 animate-pulse" : isWarn ? "text-amber-400" : "text-white"
              }`}>
                {timeLeft}
              </p>
            </div>
              );
            })()}

            {/* Current price */}
            <div className="text-center space-y-1">
              {buyNowPrice && buyNowPrice > currentBid && (
                <p className="text-sm text-[#8E98A3] line-through">{formatBRL(buyNowPrice)}</p>
              )}
              <p className="text-4xl font-black text-[#FF7A00]">{formatBRL(currentBid)}</p>
              <div className="flex items-center justify-center gap-3">
                <span className="text-xs text-[#8E98A3]">{totalBids} lance(s)</span>
                {savings && savings > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#00C58E]/15 text-[#00C58E] text-xs font-bold">
                    <TrendingUp className="h-3 w-3" /> {savings}% abaixo
                  </span>
                )}
              </div>
            </div>

            {/* Min next bid */}
            {isActive && (
              <CardHighlight className="text-center" label="Próximo lance mínimo" value={formatBRL(minNextBid)} />
            )}

            {/* CTAs */}
            {isActive && (
              <div className="space-y-3">
                {/* Place bid — opens modal */}
                <DarkButton
                  className="w-full h-14 text-base flex items-center justify-center"
                  onClick={handleBid}
                >
                  <Gavel className="h-5 w-5 mr-2" /> Dar Lance
                </DarkButton>

                {/* Buy now */}
                {buyNowPrice && (
                  <Button
                    className="w-full h-14 text-base font-bold bg-[#00C58E] hover:bg-[#00B583] text-white rounded-xl shadow-lg shadow-[#00C58E]/20"
                    onClick={handleBuyNow}
                  >
                    <ShoppingCart className="h-5 w-5 mr-2" />
                    Arrematar agora por {formatBRL(buyNowPrice)}
                  </Button>
                )}
              </div>
            )}

            {!isActive && (
              <CardInfo className="text-center py-6 rounded-2xl">
                <p className="text-lg font-bold text-[#B8C2CC]">Leilão encerrado</p>
              </CardInfo>
            )}
          </CardDark>
        </div>
      </div>

      {/* ── STATS ── */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <CardInfo className="text-center p-3">
            <Eye className="h-4 w-4 text-[#00C58E] mx-auto mb-1" />
            <p className="text-lg font-black text-white">{listing.views_count || 0}</p>
            <p className="text-[10px] text-[#8E98A3]">Visualizações</p>
          </CardInfo>
          <CardInfo className="text-center p-3">
            <Users className="h-4 w-4 text-[#B8C2CC] mx-auto mb-1" />
            <p className="text-lg font-black text-white">{listing.watchers_count || 0}</p>
            <p className="text-[10px] text-[#8E98A3]">Observando</p>
          </CardInfo>
          <CardInfo className="text-center p-3">
            <Flame className="h-4 w-4 text-[#FF7A00] mx-auto mb-1" />
            <p className="text-lg font-black text-white">{totalBids}</p>
            <p className="text-[10px] text-[#8E98A3]">Lances</p>
          </CardInfo>
        </div>

        {/* Social proof */}
        <div className="space-y-2">
          {totalBids > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1A1F24] border border-[#FF7A00]/40">
              <Zap className="h-3.5 w-3.5 text-[#FF7A00] shrink-0" />
              <p className="text-xs text-orange-300">
                {totalBids > 5
                  ? `🔥 Produto disputado — ${totalBids} lances registrados`
                  : `Lance mais recente: ${bids[0] ? formatBRL(bids[0].amount_cents ? bids[0].amount_cents / 100 : 0) : formatBRL(currentBid)}`}
              </p>
            </div>
          )}
          {urgency === "critical" && isActive && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1A1F24] border border-red-500/40">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
              <p className="text-xs text-red-300">⏰ Encerrando em breve — últimas chances!</p>
            </div>
          )}
          {listing.city && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1A1F24] border border-[#00C58E]/40">
              <MapPin className="h-3.5 w-3.5 text-[#00C58E] shrink-0" />
              <p className="text-xs text-[#00C58E]">📍 Produto da sua região — {listing.neighborhood || listing.city}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── BID HISTORY ── */}
      {bids.length > 0 && (
        <div className="max-w-lg mx-auto px-4 pb-8 space-y-3">
          <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider flex items-center gap-2">
            <ArrowUp className="h-4 w-4" /> Últimos Lances
          </h2>
          <div className="space-y-2">
            {bids.slice(0, 8).map((bid, i) => (
              <div
                key={bid.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                  i === 0 ? "bg-[#1A1F24] border-[#FF7A00]/50 shadow-sm" : "bg-[#1A1F24] border-[#323A45]"
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${
                  i === 0 ? "bg-[#FF7A00] text-white" : "bg-[#323A45] text-[#B8C2CC]"
                }`}>
                  {i + 1}º
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold ${i === 0 ? "text-[#FF7A00]" : "text-white"}`}>
                    {formatBRL(bid.amount_cents ? bid.amount_cents / 100 : 0)}
                  </p>
                  <p className="text-[10px] text-[#8E98A3]">
                    {new Date(bid.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
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
            <p className="text-[10px] text-[#8E98A3] uppercase mb-1">Retirada</p>
            <p className="text-sm font-bold text-white capitalize">
              {(listing as any).fulfillment_type === "both" ? "Entrega & Retirada" : (listing as any).fulfillment_type === "delivery" ? "Entrega" : "Retirada"}
            </p>
          </CardInfo>
        </div>

        {/* Trust signals */}
        <div className="flex items-center justify-center gap-4 py-4 text-[10px] text-gray-600">
          <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-emerald-500" /> Plataforma segura</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-blue-400" /> Atualizado em tempo real</span>
        </div>

        {/* Back */}
        <Button variant="ghost" className="w-full text-gray-600 hover:text-gray-900" onClick={() => navigate("/leiloes")}>
          <ChevronRight className="h-4 w-4 mr-1 rotate-180" /> Ver todos os leilões
        </Button>
      </div>

      {/* ═══ OFERTA RÁPIDA MODAL ═══ */}
      {listing && (
        <OfertaRapidaModal
          open={showOfertaModal}
          onClose={() => setShowOfertaModal(false)}
          listingId={listing.id}
          listingTitle={listing.title}
          defaultAmount={ofertaFixedAmount}
          allowCustomAmount={ofertaAllowCustom}
          context="auction"
          onSuccess={fetchData}
        />
      )}

      <InstitutionalSafetyBanner />
    </MarketLayout>
  );
}
