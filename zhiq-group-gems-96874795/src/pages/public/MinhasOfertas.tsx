/**
 * MinhasOfertas — Página do comprador para acompanhar suas ofertas enviadas
 * Mostra ofertas pendentes, aceitas e recusadas com dados da loja/produto
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Tag, Clock, CheckCircle, XCircle, Loader2, ArrowLeft,
  Store, ShoppingBag, Send, Package, MapPin, MessageSquare,
  Search, Gavel,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useGlobalCart } from "@/hooks/useGlobalCart";
import { GlobalCartDrawer } from "@/components/public/GlobalCartDrawer";

// ─── Helpers ────────────────────────────

function formatBRL(value: number | undefined | null) {
  if (value == null || isNaN(value)) return "R$ 0,00";
  return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

type OfferStatus = "pending" | "accepted" | "rejected" | "expired" | "cancelled";

interface OfferWithListing {
  id: string;
  arremate_listing_id: string;
  offer_amount: number;
  note: string | null;
  status: OfferStatus;
  created_at: string;
  updated_at: string | null;
  // Joined listing info
  listing_title?: string;
  listing_image?: string | null;
  listing_city?: string | null;
  listing_status?: string;
  store_name?: string;
  store_whatsapp?: string | null;
}

const STATUS_CONFIG: Record<OfferStatus, { label: string; color: string; icon: any; bg: string }> = {
  pending:   { label: "Pendente",  color: "text-amber-600",   icon: Clock,       bg: "bg-amber-50 border-amber-200" },
  accepted:  { label: "Aceita! 🎉", color: "text-emerald-600", icon: CheckCircle, bg: "bg-emerald-50 border-emerald-200" },
  rejected:  { label: "Recusada", color: "text-red-500",      icon: XCircle,     bg: "bg-red-50 border-red-200" },
  expired:   { label: "Expirada", color: "text-gray-400",     icon: Clock,       bg: "bg-gray-50 border-gray-200" },
  cancelled: { label: "Cancelada", color: "text-gray-400",    icon: XCircle,     bg: "bg-gray-50 border-gray-200" },
};

// ─── Page ────────────────────────────────

export default function MinhasOfertas() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [offers, setOffers] = useState<OfferWithListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | OfferStatus>("all");
  const [cartOpen, setCartOpen] = useState(false);
  const globalCart = useGlobalCart();

  useEffect(() => {
    if (!user?.id) return;
    fetchOffers();
  }, [user?.id]);

  const fetchOffers = async () => {
    if (!user?.id) return;
    setLoading(true);

    // Fetch user's offers
    const { data: rawOffers, error } = await supabase
      .from("arremate_offers")
      .select("*")
      .eq("customer_user_id", user.id)
      .order("created_at", { ascending: false });

    if (error || !rawOffers?.length) {
      setOffers([]);
      setLoading(false);
      return;
    }

    // Enrich with listing + store info
    const listingIds = [...new Set(rawOffers.map(o => o.arremate_listing_id))];
    const { data: listings } = await supabase
      .from("auction_listings")
      .select("id, title, product_image_url, city, status, store_id")
      .in("id", listingIds);

    const storeIds = [...new Set((listings || []).map(l => l.store_id).filter(Boolean))];
    const { data: stores } = storeIds.length > 0
      ? await supabase
          .from("merchant_stores")
          .select("id, nome_loja, whatsapp")
          .in("id", storeIds)
      : { data: [] };

    const listingMap = new Map((listings || []).map(l => [l.id, l]));
    const storeMap = new Map((stores || []).map(s => [s.id, s]));

    const enriched: OfferWithListing[] = rawOffers.map(o => {
      const listing = listingMap.get(o.arremate_listing_id);
      const store = listing ? storeMap.get(listing.store_id) : null;
      return {
        id: o.id,
        arremate_listing_id: o.arremate_listing_id,
        offer_amount: o.offer_amount,
        note: o.note,
        status: o.status as OfferStatus,
        created_at: o.created_at,
        updated_at: o.updated_at,
        listing_title: listing?.title || "Produto",
        listing_image: listing?.product_image_url || null,
        listing_city: listing?.city || null,
        listing_status: listing?.status,
        store_name: store?.nome_loja || "Loja",
        store_whatsapp: store?.whatsapp || null,
      };
    });

    setOffers(enriched);
    setLoading(false);
  };

  const filtered = filter === "all" ? offers : offers.filter(o => o.status === filter);
  const counts = {
    all: offers.length,
    pending: offers.filter(o => o.status === "pending").length,
    accepted: offers.filter(o => o.status === "accepted").length,
    rejected: offers.filter(o => o.status === "rejected").length,
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#F5E62B' }}>
      {/* ═══ TOP BAR ═══ */}
      <div className="bg-gradient-to-r from-[#FF6A00] to-[#FF8C00] sticky top-0 z-50 shadow-md">
        <div className="max-w-[1920px] mx-auto px-4 lg:px-6">
          <div className="flex items-center gap-4 h-14">
            <div className="flex items-center gap-2 shrink-0 cursor-pointer" onClick={() => navigate("/leiloes")}>
              <img src="/images/viagg-tx8-logo.jpg" alt="Viagg-TX8" className="h-9 w-9 rounded-lg object-contain" />
              <span className="text-lg font-black text-white tracking-tight hidden sm:block">
                Minhas <span className="text-yellow-200">Ofertas</span>
              </span>
              <span className="text-lg font-black text-white tracking-tight sm:hidden">Ofertas</span>
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
                <span className="text-[11px] font-bold hidden sm:block">Cesta</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-xl bg-white/80 hover:bg-white shadow-sm transition-all">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Minhas Ofertas</h1>
            <p className="text-sm text-gray-500">{offers.length} oferta(s) enviada(s)</p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {([
            { key: "all" as const, label: "Todas", count: counts.all },
            { key: "pending" as const, label: "Pendentes", count: counts.pending },
            { key: "accepted" as const, label: "Aceitas", count: counts.accepted },
            { key: "rejected" as const, label: "Recusadas", count: counts.rejected },
          ]).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                filter === key
                  ? "bg-violet-500 text-white shadow-md shadow-violet-200"
                  : "bg-white text-gray-500 hover:bg-violet-50 hover:text-violet-600 border border-gray-200"
              }`}
            >
              {label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                filter === key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"
              }`}>{count}</span>
            </button>
          ))}
        </div>

        {/* Offers list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-gray-100">
            <Send className="h-14 w-14 text-gray-200 mx-auto mb-4" />
            <p className="text-lg font-bold text-gray-500">
              {filter === "all" ? "Nenhuma oferta enviada" : `Nenhuma oferta ${STATUS_CONFIG[filter as OfferStatus]?.label.toLowerCase()}`}
            </p>
            <p className="text-sm text-gray-400 mt-1 max-w-[280px] mx-auto">
              Navegue pelos arremates e envie sua primeira oferta!
            </p>
            <Button
              className="mt-4 bg-violet-500 hover:bg-violet-600 text-white rounded-xl"
              onClick={() => navigate("/leiloes?tab=arremate")}
            >
              <Tag className="h-4 w-4 mr-1.5" /> Ver Arremates
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((offer) => {
              const sc = STATUS_CONFIG[offer.status] || STATUS_CONFIG.pending;
              const StatusIcon = sc.icon;

              return (
                <div
                  key={offer.id}
                  className={`rounded-2xl border overflow-hidden bg-white shadow-sm hover:shadow-md transition-all ${
                    offer.status === "accepted" ? "ring-2 ring-emerald-300" : ""
                  }`}
                >
                  <div className="flex gap-3 p-4">
                    {/* Product image */}
                    {offer.listing_image ? (
                      <img
                        src={offer.listing_image}
                        alt={offer.listing_title}
                        className="w-20 h-20 rounded-xl object-cover shrink-0"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                        <Package className="h-8 w-8 text-gray-300" />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm truncate">{offer.listing_title}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Store className="h-3 w-3" /> {offer.store_name}
                        {offer.listing_city && (
                          <><span className="mx-1">•</span><MapPin className="h-3 w-3" /> {offer.listing_city}</>
                        )}
                      </p>

                      {/* Amount */}
                      <p className="text-lg font-black text-violet-600 mt-1">{formatBRL(offer.offer_amount)}</p>

                      {/* Note */}
                      {offer.note && (
                        <p className="text-xs text-gray-400 mt-1 flex items-center gap-1 truncate">
                          <MessageSquare className="h-3 w-3 shrink-0" /> {offer.note}
                        </p>
                      )}
                    </div>

                    {/* Status badge */}
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${sc.bg} ${sc.color}`}>
                        <StatusIcon className="h-3 w-3" /> {sc.label}
                      </span>
                      <span className="text-[10px] text-gray-400">{formatDate(offer.created_at)}</span>
                    </div>
                  </div>

                  {/* Action bar for accepted offers */}
                  {offer.status === "accepted" && (
                    <div className="border-t bg-emerald-50 px-4 py-3 flex items-center justify-between">
                      <p className="text-xs font-medium text-emerald-700">
                        🎉 Oferta aceita pelo lojista! Entre em contato para combinar.
                      </p>
                      {offer.store_whatsapp && (
                        <a
                          href={`https://wa.me/55${offer.store_whatsapp.replace(/\D/g, "")}?text=Olá! Minha oferta de ${formatBRL(offer.offer_amount)} para "${offer.listing_title}" foi aceita!`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-all shrink-0"
                        >
                          💬 WhatsApp
                        </a>
                      )}
                    </div>
                  )}

                  {/* Tap to view listing */}
                  <button
                    onClick={() => navigate(`/arremate/${offer.arremate_listing_id}`)}
                    className="w-full border-t px-4 py-2 text-xs font-semibold text-violet-500 hover:bg-violet-50 transition-all text-center"
                  >
                    Ver arremate →
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart drawer */}
      <GlobalCartDrawer open={cartOpen} onOpenChange={setCartOpen} globalCart={globalCart} />
    </div>
  );
}
