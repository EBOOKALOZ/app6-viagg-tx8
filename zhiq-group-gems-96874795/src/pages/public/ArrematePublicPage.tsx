/**
 * ArrematePublicPage — Tela pública de ARREMATE
 * Layout com menu superior do marketplace + fundo amarelo
 */
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { FooterNeutral } from "@/components/FooterNeutral";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tag, MapPin, Eye, Users, Zap, Clock, Shield, ChevronRight,
  Loader2, AlertTriangle, Crown, TrendingUp, ShoppingCart, Send,
  Package, Timer, Flame, CheckCircle, Search, ShoppingBag, Truck,
  Store, Gavel,
} from "lucide-react";
import { toast } from "sonner";
import { useGlobalCart } from "@/hooks/useGlobalCart";
import { GlobalCartDrawer } from "@/components/public/GlobalCartDrawer";
import { OfertaRapidaModal } from "@/components/public/MiniCadastroModal";
import type { AuctionListing } from "@/hooks/useAuctions";
import { InstitutionalSafetyBanner } from '@/components/public/InstitutionalSafetyBanner';

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

// ─── Top Bar ────────────────────────────

function TopBar({ navigate, globalCart, cartOpen, setCartOpen }: any) {
  return (
    <>
      <div className="bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] sticky top-0 z-50 shadow-md">
        <div className="max-w-[1920px] mx-auto px-4 lg:px-6">
          <div className="flex items-center gap-4 h-14">
            <div className="flex items-center gap-2 shrink-0 cursor-pointer" onClick={() => navigate("/mercado")}>
              <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="h-9 w-9 rounded-lg object-contain" />
              <span className="text-lg font-black text-white tracking-tight hidden sm:block">
                Arremate <span className="text-yellow-200">Viagg-TX8</span>
              </span>
              <span className="text-lg font-black text-white tracking-tight sm:hidden">Arremate</span>
            </div>

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
              <div className="hidden md:flex items-center gap-3">
                <button onClick={() => navigate("/leiloes")} className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white/15 hover:bg-white/25 transition-all flex items-center gap-1">
                  <Gavel className="h-3 w-3" /> Leilões
                </button>
                <button onClick={() => navigate("/mercado")} className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white/15 hover:bg-white/25 transition-all flex items-center gap-1">
                  <Store className="h-3 w-3" /> Mercado
                </button>
              </div>
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

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-[1920px] mx-auto px-4 lg:px-6 py-2 flex items-center justify-center gap-6 text-[11px] text-gray-500">
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
    </>
  );
}

// ─── Page ────────────────────────────────

export default function ArrematePublicPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [listing, setListing] = useState<AuctionListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [storeName, setStoreName] = useState("");
  // Offer modal state
  const [showOfertaModal, setShowOfertaModal] = useState(false);
  const [ofertaFixedAmount, setOfertaFixedAmount] = useState<number | undefined>(undefined);
  const [ofertaAllowCustom, setOfertaAllowCustom] = useState(true);

  // Cart
  const [cartOpen, setCartOpen] = useState(false);
  const globalCart = useGlobalCart();

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

      await supabase
        .from("auction_listings")
        .update({ views_count: (data.views_count || 0) + 1 })
        .eq("id", id);
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
    return (
      <div className="min-h-screen flex flex-col">
        <TopBar navigate={navigate} globalCart={globalCart} cartOpen={cartOpen} setCartOpen={setCartOpen} />
        <div className="flex items-center justify-center flex-1" style={{ backgroundColor: '#F5E62B' }}>
          <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen flex flex-col">
        <TopBar navigate={navigate} globalCart={globalCart} cartOpen={cartOpen} setCartOpen={setCartOpen} />
        <div className="flex flex-col items-center justify-center flex-1 gap-4" style={{ backgroundColor: '#F5E62B' }}>
          <AlertTriangle className="h-12 w-12 text-gray-300" />
          <p className="text-gray-600 font-medium">Arremate não encontrado</p>
          <Button variant="outline" onClick={() => navigate("/leiloes")}>Ver todos</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5E62B' }}>
      {/* ═══ TOP BAR ═══ */}
      <TopBar navigate={navigate} globalCart={globalCart} cartOpen={cartOpen} setCartOpen={setCartOpen} />

      {/* ── HERO ── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-violet-100/50 via-transparent to-transparent" />

        <div className="relative max-w-lg mx-auto px-4 pt-6 pb-8 space-y-5">
          {/* Badge */}
          <div className="flex items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-500 text-white text-xs font-bold uppercase tracking-wider shadow-md">
              <Tag className="h-3.5 w-3.5" /> Oportunidade
            </span>
          </div>

          {/* Product image */}
          {imgSrc && (
            <div className="rounded-2xl overflow-hidden bg-white shadow-lg border border-gray-200">
              <img src={imgSrc} alt={listing.title} className="w-full aspect-[16/9] object-contain bg-gray-50" />
            </div>
          )}

          {/* Title */}
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 text-center leading-tight">
            {listing.title}
          </h1>

          {/* Store + Location */}
          <div className="flex items-center justify-center gap-3 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <Crown className="h-3.5 w-3.5 text-amber-500" /> {storeName || "Loja"}
            </span>
            {listing.city && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-emerald-500" />
                {listing.neighborhood ? `${listing.neighborhood}, ` : ""}{listing.city}
              </span>
            )}
          </div>

          {/* Prices */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 shadow-md">
            {normalPrice && normalPrice > opportunityPrice && (
              <div className="text-center">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Preço normal</p>
                <p className="text-xl text-gray-400 line-through">{formatBRL(normalPrice)}</p>
              </div>
            )}
            <div className="text-center">
              <p className="text-[10px] text-violet-600 uppercase tracking-wider font-bold">Preço de oportunidade</p>
              <p className="text-4xl font-black text-gray-900">{formatBRL(opportunityPrice)}</p>
              {savings && savings > 0 && (
                <span className="inline-flex items-center gap-1 mt-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-sm font-bold">
                  <TrendingUp className="h-4 w-4" /> Economize {savings}%
                </span>
              )}
            </div>
          </div>

          {/* Quick info */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 rounded-xl bg-white border border-gray-200 shadow-sm">
              <Package className="h-4 w-4 text-blue-500 mx-auto mb-1" />
              <p className="text-lg font-black text-gray-900">{(listing as any).stock_quantity || "—"}</p>
              <p className="text-[10px] text-gray-500">Estoque</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-white border border-gray-200 shadow-sm">
              <Timer className="h-4 w-4 text-amber-500 mx-auto mb-1" />
              <p className="text-lg font-black text-gray-900">{(listing as any).response_deadline_hours || "—"}h</p>
              <p className="text-[10px] text-gray-500">Prazo resposta</p>
            </div>
            <div className="text-center p-3 rounded-xl bg-white border border-gray-200 shadow-sm">
              <Users className="h-4 w-4 text-violet-500 mx-auto mb-1" />
              <p className="text-lg font-black text-gray-900">{listing.offer_count || 0}</p>
              <p className="text-[10px] text-gray-500">Ofertas</p>
            </div>
          </div>

          {/* Countdown */}
          {isActive && (
            <div className={`text-center py-3 rounded-xl border shadow-sm ${
              urgency === "critical" ? "bg-red-50 border-red-300" : "bg-white border-gray-200"
            }`}>
              <p className="text-[10px] text-gray-500 mb-0.5">Oportunidade disponível por</p>
              <p className={`text-2xl font-black ${urgency === "critical" ? "text-red-600 animate-pulse" : "text-gray-900"}`}>
                {timeLeft}
              </p>
            </div>
          )}

          {/* CTAs */}
          {isActive && (
            <div className="space-y-3">
              {/* Arrematar direto */}
              <Button
                className="w-full h-14 text-base font-bold bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white rounded-xl shadow-lg shadow-violet-500/30"
                onClick={handleArremate}
              >
                <ShoppingCart className="h-5 w-5 mr-2" />
                Arrematar por {formatBRL(opportunityPrice)}
              </Button>

              {/* Enviar oferta personalizada */}
              <Button
                variant="outline"
                className="w-full h-12 text-sm font-bold border-gray-300 text-gray-700 hover:bg-gray-100 rounded-xl"
                onClick={handleSendOffer}
              >
                <Send className="h-4 w-4 mr-2" /> Enviar minha oferta
              </Button>
            </div>
          )}

          {!isActive && (
            <div className="text-center py-6 rounded-2xl bg-white border border-gray-200 shadow-sm">
              <p className="text-lg font-bold text-gray-500">
                {listing.status === "sold" ? "Vendido!" : "Oportunidade encerrada"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── SOCIAL PROOF ── */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-3">
        {(listing.offer_count || 0) > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200">
            <Flame className="h-3.5 w-3.5 text-violet-500 shrink-0" />
            <p className="text-xs text-violet-700">
              {(listing.offer_count || 0) > 3
                ? `🔥 Alta demanda — ${listing.offer_count} ofertas recebidas`
                : `${listing.offer_count} pessoa(s) já fizeram oferta`}
            </p>
          </div>
        )}
        {(listing as any).stock_quantity && (listing as any).stock_quantity <= 3 && (listing as any).stock_quantity > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700">⚡ Apenas {(listing as any).stock_quantity} unidade(s) disponíveis</p>
          </div>
        )}
        {listing.city && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
            <MapPin className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            <p className="text-xs text-emerald-700">📍 Produto da sua região — {listing.neighborhood || listing.city}</p>
          </div>
        )}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200">
          <CheckCircle className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          <p className="text-xs text-blue-700">
            {(listing as any).fulfillment_type === "both" ? "📦 Entrega ou retirada disponível" : (listing as any).fulfillment_type === "delivery" ? "🚚 Entrega disponível" : "🏪 Retirada na loja"}
          </p>
        </div>
      </div>

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
            <p className="text-[10px] text-gray-500 uppercase mb-1">Categoria</p>
            <p className="text-sm font-bold text-gray-900 capitalize">{(listing as any).category || "—"}</p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 py-4 text-[10px] text-gray-600">
          <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-emerald-500" /> Plataforma segura</span>
          <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-blue-400" /> Resposta em até {(listing as any).response_deadline_hours || "24"}h</span>
        </div>

        <Button variant="ghost" className="w-full text-gray-600 hover:text-gray-900" onClick={() => navigate("/leiloes")}>
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

      {/* ═══ FOOTER ═══ */}
      <InstitutionalSafetyBanner />
      <FooterNeutral compact />
    </div>
  );
}
