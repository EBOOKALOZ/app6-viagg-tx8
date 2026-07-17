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
      <MarketLayout search={q} setSearch={setQ} headerChildren={<MarketNavButtons />}
        mainClassName="flex flex-col bg-[#F5E62B]" blueFooter blueFooterLabel="🏷️ Leilões" myAccountPath="/minha-conta">
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-10 w-10 animate-spin text-orange-400" />
        </div>
      </MarketLayout>
    );
  }

  if (!listing) {
    return (
      <MarketLayout search={q} setSearch={setQ} headerChildren={<MarketNavButtons />}
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
          <div className="bg-white/95 backdrop-blur-sm rounded-3xl shadow-2xl border border-white/60 p-6 space-y-5"
               style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 4px 20px rgba(0,0,0,0.08)' }}>

            {/* Product image */}
            {imgSrc && (
              <div className="rounded-2xl overflow-hidden bg-gray-50 shadow-inner border border-gray-100">
                <img src={imgSrc} alt={listing.title} className="w-full aspect-[16/9] object-contain bg-gray-50" />
              </div>
            )}

            {/* Title */}
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 text-center leading-tight">
              {listing.title}
            </h1>

            {/* Store + Location */}
            <div className="flex items-center justify-center gap-3 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Crown className="h-3.5 w-3.5 text-amber-400" /> {storeName || "Loja"}
              </span>
              {listing.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                  {listing.neighborhood ? `${listing.neighborhood}, ` : ""}{listing.city}
                </span>
              )}
            </div>

            {/* Countdown */}
            {(() => {
              const isCrit = urgency === "critical";
              const isWarn = urgency === "warning";
              const isNormal = !isCrit && !isWarn;
              return (
            <div
              className={`text-center py-4 rounded-2xl border shadow-md ${
                isCrit ? "bg-red-50 border-red-300"
                : isWarn ? "bg-amber-50 border-amber-300"
                : "border-transparent"
              }`}
              style={isNormal ? { backgroundColor: "#00a300" } : undefined}
            >
              <p className={`text-[10px] uppercase tracking-widest mb-1 flex items-center justify-center gap-1 ${
                isNormal ? "text-white/85" : "text-gray-500"
              }`}>
                <Timer className="h-3 w-3" /> Encerra em
              </p>
              <p className={`text-4xl md:text-5xl font-black tracking-tight ${
                isCrit ? "text-red-600 animate-pulse" : isWarn ? "text-amber-600" : "text-white"
              }`}>
                {timeLeft}
              </p>
            </div>
              );
            })()}

            {/* Current price */}
            <div className="text-center space-y-1">
              {buyNowPrice && buyNowPrice > currentBid && (
                <p className="text-sm text-gray-400 line-through">{formatBRL(buyNowPrice)}</p>
              )}
              <p className="text-4xl font-black text-gray-900">{formatBRL(currentBid)}</p>
              <div className="flex items-center justify-center gap-3">
                <span className="text-xs text-gray-500">{totalBids} lance(s)</span>
                {savings && savings > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600 text-xs font-bold">
                    <TrendingUp className="h-3 w-3" /> {savings}% abaixo
                  </span>
                )}
              </div>
            </div>

            {/* Min next bid */}
            {isActive && (
              <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl p-3 border border-orange-200 text-center shadow-sm">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Próximo lance mínimo</p>
                <p className="text-xl font-black text-orange-600">{formatBRL(minNextBid)}</p>
              </div>
            )}

            {/* CTAs */}
            {isActive && (
              <div className="space-y-3">
                {/* Place bid — opens modal */}
                <Button
                  className="w-full h-14 text-base font-bold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl shadow-lg shadow-orange-500/30"
                  onClick={handleBid}
                >
                  <Gavel className="h-5 w-5 mr-2" /> Dar Lance
                </Button>

                {/* Buy now */}
                {buyNowPrice && (
                  <Button
                    className="w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white rounded-xl shadow-lg shadow-emerald-500/20"
                    onClick={handleBuyNow}
                  >
                    <ShoppingCart className="h-5 w-5 mr-2" />
                    Arrematar agora por {formatBRL(buyNowPrice)}
                  </Button>
                )}
              </div>
            )}

            {!isActive && (
              <div className="text-center py-6 rounded-2xl bg-gray-50 border border-gray-200">
                <p className="text-lg font-bold text-gray-500">Leilão encerrado</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── STATS ── */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-xl bg-white border border-gray-200 shadow-sm">
            <Eye className="h-4 w-4 text-blue-500 mx-auto mb-1" />
            <p className="text-lg font-black text-gray-900">{listing.views_count || 0}</p>
            <p className="text-[10px] text-gray-500">Visualizações</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-white border border-gray-200 shadow-sm">
            <Users className="h-4 w-4 text-violet-500 mx-auto mb-1" />
            <p className="text-lg font-black text-gray-900">{listing.watchers_count || 0}</p>
            <p className="text-[10px] text-gray-500">Observando</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-white border border-gray-200 shadow-sm">
            <Flame className="h-4 w-4 text-orange-500 mx-auto mb-1" />
            <p className="text-lg font-black text-gray-900">{totalBids}</p>
            <p className="text-[10px] text-gray-500">Lances</p>
          </div>
        </div>

        {/* Social proof */}
        <div className="space-y-2">
          {totalBids > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 border border-orange-200">
              <Zap className="h-3.5 w-3.5 text-orange-500 shrink-0" />
              <p className="text-xs text-orange-700">
                {totalBids > 5
                  ? `🔥 Produto disputado — ${totalBids} lances registrados`
                  : `Lance mais recente: ${bids[0] ? formatBRL(bids[0].amount_cents ? bids[0].amount_cents / 100 : 0) : formatBRL(currentBid)}`}
              </p>
            </div>
          )}
          {urgency === "critical" && isActive && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
              <p className="text-xs text-red-700">⏰ Encerrando em breve — últimas chances!</p>
            </div>
          )}
          {listing.city && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
              <MapPin className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <p className="text-xs text-emerald-700">📍 Produto da sua região — {listing.neighborhood || listing.city}</p>
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
                  i === 0 ? "bg-orange-50 border-orange-300 shadow-sm" : "bg-white border-gray-200"
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${
                  i === 0 ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-500"
                }`}>
                  {i + 1}º
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold ${i === 0 ? "text-orange-600" : "text-gray-900"}`}>
                    {formatBRL(bid.amount_cents ? bid.amount_cents / 100 : 0)}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {new Date(bid.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </p>
                </div>
                {bid.is_winning && (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                    Vencendo
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DETAILS ── */}
      <div className="max-w-lg mx-auto px-4 pb-12 space-y-4">
        {listing.description && (
          <div className="rounded-xl bg-white border border-gray-200 p-4 space-y-2 shadow-sm">
            <h3 className="text-sm font-bold text-gray-700">Descrição</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{listing.description}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white border border-gray-200 p-3 text-center shadow-sm">
            <p className="text-[10px] text-gray-500 uppercase mb-1">Condição</p>
            <p className="text-sm font-bold text-gray-900 capitalize">{(listing as any).condition || "—"}</p>
          </div>
          <div className="rounded-xl bg-white border border-gray-200 p-3 text-center shadow-sm">
            <p className="text-[10px] text-gray-500 uppercase mb-1">Retirada</p>
            <p className="text-sm font-bold text-gray-900 capitalize">
              {(listing as any).fulfillment_type === "both" ? "Entrega & Retirada" : (listing as any).fulfillment_type === "delivery" ? "Entrega" : "Retirada"}
            </p>
          </div>
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
