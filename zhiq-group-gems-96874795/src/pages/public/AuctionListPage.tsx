/**
 * AuctionListPage — Feed público de leilões e arremates ativos
 * Usa o MESMO MarketLayout do Mercado (cabeçalho completo: clima, logo, busca,
 * MarketNavButtons — incluindo o botão Leilões — carrinho, áudio e rodapé).
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import {
  Gavel, Tag, Timer, MapPin, Eye, Flame,
  Loader2, Users, Truck, Shield, LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuctionListing } from "@/hooks/useAuctions";

// ─── Helpers ────────────────────────────

function formatBRL(value: number | undefined | null) {
  if (value == null || isNaN(value)) return "R$ 0,00";
  if (value > 10000) return `R$ ${(value / 100).toFixed(2).replace(".", ",")}`;
  return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
}

// ─── Live Countdown Hook ────────────────
function useCountdown(endsAt: string) {
  const calcRemaining = useCallback(() => {
    const diff = new Date(endsAt).getTime() - Date.now();
    if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, ended: true, total: 0 };
    return {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000),
      ended: false,
      total: diff,
    };
  }, [endsAt]);

  const [remaining, setRemaining] = useState(calcRemaining);

  useEffect(() => {
    const tick = () => setRemaining(calcRemaining());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [calcRemaining]);

  return remaining;
}

function CountdownDisplay({ endsAt }: { endsAt: string }) {
  const { days, hours, minutes, seconds, ended, total } = useCountdown(endsAt);
  const isUrgent = total > 0 && total < 3600000; // less than 1 hour

  if (ended) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-500/90 text-white text-[10px] font-bold backdrop-blur-sm">
        <Timer className="h-3 w-3" /> Encerrado
      </span>
    );
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-sm font-mono tracking-wider",
      isUrgent ? "bg-red-500/90 text-white animate-pulse" : "bg-black/60 text-white"
    )}>
      <Timer className="h-3 w-3" />
      {isUrgent && <Flame className="h-3 w-3" />}
      {days > 0 ? (
        <>{days}d {pad(hours)}:{pad(minutes)}:{pad(seconds)}</>
      ) : (
        <>{pad(hours)}:{pad(minutes)}:{pad(seconds)}</>
      )}
    </span>
  );
}

function getListingType(listing: any): "auction" | "arremate" {
  if (listing.listing_type === "arremate") return "arremate";
  return "auction";
}

function getPrice(listing: any): number {
  return listing.current_price_cents || listing.current_bid || listing.starting_bid || 0;
}
function getOriginalPrice(listing: any): number | null {
  return listing.original_price_cents || listing.buy_now_price || null;
}

function normalizeImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

// ─── ListingCard ─────────────────────────

function ListingCard({ listing, onClick }: { listing: AuctionListing; onClick: () => void }) {
  const isAuction = getListingType(listing) === "auction";
  const price = getPrice(listing);
  const originalPrice = getOriginalPrice(listing);
  const savings = originalPrice && price
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : null;
  const isEnding = new Date(listing.ends_at).getTime() - Date.now() < 3600000;
  const imgSrc = normalizeImageUrl((listing as any).product_image_url);

  return (
    <button
      className="w-full text-left bg-white rounded-2xl shadow-md hover:shadow-xl transition-all border border-gray-100 overflow-hidden group flex flex-col h-full"
      onClick={onClick}
    >
      {/* Product image */}
      {imgSrc ? (
        <div className="relative overflow-hidden bg-gray-50">
          <img
            src={imgSrc}
            alt={listing.title}
            className="w-full aspect-[16/9] object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          {/* Type badge overlay */}
          <div className="absolute top-2 left-2">
            {isAuction ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/90 text-white text-[10px] font-bold uppercase backdrop-blur-sm">
                <Gavel className="h-3 w-3" /> Leilão
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/90 text-white text-[10px] font-bold uppercase backdrop-blur-sm">
                <Tag className="h-3 w-3" /> Arremate
              </span>
            )}
          </div>
          {/* Timer overlay — live countdown */}
          <div className="absolute top-2 right-2">
            <CountdownDisplay endsAt={listing.ends_at} />
          </div>
        </div>
      ) : (
        <>
          <div className={`h-2 ${isAuction ? "bg-gradient-to-r from-orange-400 to-amber-400" : "bg-gradient-to-r from-violet-400 to-purple-500"}`} />
          <div className="flex items-start justify-between gap-2 px-4 pt-3">
            <div className="flex items-center gap-1.5">
              {isAuction ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 text-[10px] font-bold uppercase">
                  <Gavel className="h-3 w-3" /> Leilão
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 text-[10px] font-bold uppercase">
                  <Tag className="h-3 w-3" /> Arremate
                </span>
              )}
              {isEnding && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold animate-pulse">
                  <Flame className="h-3 w-3" /> Encerrando!
                </span>
              )}
            </div>
            <CountdownDisplay endsAt={listing.ends_at} />
          </div>
        </>
      )}

      <div className="p-4 space-y-3 flex-1 flex flex-col">
        {/* Title */}
        <h3 className="font-bold text-gray-800 text-base leading-tight group-hover:text-gray-900 min-h-[44px]">
          {listing.title}
        </h3>

        {/* Price */}
        <div className="flex items-baseline gap-2">
          <p className="text-xl font-black text-gray-900">{formatBRL(price)}</p>
          {originalPrice && originalPrice > price && (
            <p className="text-sm text-gray-400 line-through">{formatBRL(originalPrice)}</p>
          )}
          {savings && savings > 0 && (
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
              -{savings}%
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs text-gray-400">
          {isAuction && (
            <span className="flex items-center gap-1">
              <Gavel className="h-3 w-3" /> {listing.total_bids || 0} lances
            </span>
          )}
          {!isAuction && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" /> {listing.offer_count || 0} ofertas
            </span>
          )}
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" /> {listing.views_count || 0}
          </span>
        </div>

        {/* CTA indicator - Standardized Footer */}
        <div className="mt-auto space-y-2.5">
          {/* Store Location + Google Maps */}
          <div className="space-y-1.5 pt-2 border-t border-gray-50">
            <div className="flex items-center gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-tight">
              <MapPin className="h-3 w-3 text-blue-500 shrink-0" />
              {listing.city || "Região"}
            </div>

            <button className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-100 hover:bg-blue-100 transition-all shadow-sm group/map">
              <MapPin className="h-3.5 w-3.5" />
              <span>📍 Ver no Mapa</span>
            </button>
          </div>

          <button
            className={`w-full py-2.5 rounded-xl text-xs font-black text-white shadow-lg transition-all active:scale-95 ${
              isAuction
                ? "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
                : "bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600"
            }`}
          >
            {isAuction ? "🔨 Dar Lance" : "⚡ Fazer Oferta"}
          </button>
        </div>
      </div>
    </button>
  );
}

// ─── Page ────────────────────────────────

export default function AuctionListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [listings, setListings] = useState<AuctionListing[]>([]);
  const [loading, setLoading] = useState(true);

  const tabParam = searchParams.get("tab");
  const initialFilter = (tabParam === "auction" || tabParam === "arremate") ? tabParam : "all";
  const [filter, setFilter] = useState<"all" | "auction" | "arremate">(initialFilter);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState<string>("all");

  const handleFilterChange = (newFilter: "all" | "auction" | "arremate") => {
    setFilter(newFilter);
    if (newFilter === "all") {
      searchParams.delete("tab");
    } else {
      searchParams.set("tab", newFilter);
    }
    setSearchParams(searchParams, { replace: true });
  };

  // Fetch ALL active listings
  useEffect(() => {
    const fetchListings = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("auction_listings")
        .select("*")
        .eq("status", "active")
        .gte("ends_at", new Date().toISOString())
        .order("ends_at", { ascending: true })
        .limit(100);

      if (!error && data) {
        // Enriquecer listings que não têm product_image_url mas têm product_id
        const enriched = await Promise.all(
          (data as any[]).map(async (listing) => {
            if (listing.product_image_url) return listing;
            if (!listing.product_id) return listing;

            const { data: pl } = await supabase
              .from("product_listings" as any)
              .select("cover_image_url")
              .eq("id", listing.product_id)
              .maybeSingle();
            if (pl?.cover_image_url) {
              let imgUrl = pl.cover_image_url;
              if (imgUrl && !imgUrl.startsWith("http")) {
                imgUrl = supabase.storage.from("marketing-materials").getPublicUrl(imgUrl).data.publicUrl;
              }
              return { ...listing, product_image_url: imgUrl };
            }

            const { data: al } = await supabase
              .from("advertiser_listings" as any)
              .select("cover_image_url")
              .eq("id", listing.product_id)
              .maybeSingle();
            if (al?.cover_image_url) {
              let imgUrl = al.cover_image_url;
              if (imgUrl && !imgUrl.startsWith("http")) {
                imgUrl = supabase.storage.from("marketing-materials").getPublicUrl(imgUrl).data.publicUrl;
              }
              return { ...listing, product_image_url: imgUrl };
            }

            const { data: vl } = await supabase
              .from("vehicle_listings" as any)
              .select("cover_image_url, vehicle_media(original_storage_path, public_masked_storage_path)")
              .eq("id", listing.product_id)
              .maybeSingle();
            if (vl) {
              let imgUrl = vl.cover_image_url;
              if (!imgUrl && vl.vehicle_media?.length > 0) {
                const path = vl.vehicle_media[0].public_masked_storage_path || vl.vehicle_media[0].original_storage_path;
                if (path) imgUrl = supabase.storage.from("real-estate-original").getPublicUrl(path).data.publicUrl;
              }
              if (imgUrl) return { ...listing, product_image_url: imgUrl };
            }

            return listing;
          })
        );
        setListings(enriched as AuctionListing[]);
      }
      setLoading(false);
    };
    fetchListings();
  }, []);

  // ── Derived data ──
  const cities = useMemo(() => {
    const set = new Set<string>();
    listings.forEach(l => { if (l.city) set.add(l.city); });
    return [...set].sort();
  }, [listings]);

  const filteredListings = useMemo(() => {
    return listings.filter((l) => {
      if (filter !== "all" && getListingType(l) !== filter) return false;
      if (cityFilter !== "all" && l.city !== cityFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !l.title.toLowerCase().includes(q) &&
          !(l.description || "").toLowerCase().includes(q) &&
          !(l.city || "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [listings, filter, cityFilter, search]);

  const handleClick = (listing: AuctionListing) => {
    if (getListingType(listing) === "auction") {
      navigate(`/leilao/${listing.id}`);
    } else {
      navigate(`/arremate/${listing.id}`);
    }
  };

  const auctionCount = listings.filter(l => getListingType(l) === "auction").length;
  const arremateCount = listings.filter(l => getListingType(l) === "arremate").length;

  return (
    <MarketLayout
      search={search}
      setSearch={setSearch}
      headerChildren={<MarketNavButtons />}
      mainClassName="flex flex-col bg-[#F5E62B]"
      blueFooter
      blueFooterLabel="🏷️ Leilões"
      myAccountPath="/minha-conta"
    >
      {/* ═══ TRUST BAR ═══ */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-[1920px] mx-auto px-4 lg:px-6 py-2 flex items-center justify-center gap-6 text-[11px] text-gray-500">
          <span className="flex items-center gap-1.5 font-medium">
            <Gavel className="h-3.5 w-3.5 text-[#FF6A00]" /> Leilões Verificados
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <Shield className="h-3.5 w-3.5 text-green-500" /> Pagamento Seguro
          </span>
          <span className="flex items-center gap-1.5 font-medium hidden sm:flex">
            <Truck className="h-3.5 w-3.5 text-blue-500" /> Entrega Local
          </span>
        </div>
      </div>

      {/* ═══ FILTROS: CIDADE + TIPO ═══ */}
      <div className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-[1920px] mx-auto px-4 lg:px-6">
          {/* City filter pills */}
          <div className="flex items-center gap-2 pt-3 overflow-x-auto scrollbar-hide">
            <button
              className={cn("px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all",
                cityFilter === "all" ? "bg-[#FF6A00] text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-orange-50")}
              onClick={() => setCityFilter("all")}>
              Todas Cidades
            </button>
            {cities.map(city => (
              <button key={city}
                className={cn("px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1",
                  cityFilter === city ? "bg-[#FF6A00] text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-orange-50")}
                onClick={() => setCityFilter(city)}>
                <MapPin className="h-3 w-3" /> {city}
              </button>
            ))}
          </div>

          {/* Type tabs */}
          <div className="flex items-center gap-1 py-3 overflow-x-auto scrollbar-hide">
            {[
              { key: "all" as const, label: "Todos", icon: LayoutGrid, count: listings.length },
              { key: "auction" as const, label: "Leilões", icon: Gavel, count: auctionCount },
              { key: "arremate" as const, label: "Arremates", icon: Tag, count: arremateCount },
            ].map(({ key, label, icon: Icon, count }) => (
              <button
                key={key}
                className={cn(
                  "flex flex-col items-center gap-1 px-4 py-2 rounded-xl min-w-[80px] transition-all duration-200 shrink-0 relative",
                  filter === key
                    ? "bg-[#FF6A00] text-white shadow-md shadow-orange-200 scale-105"
                    : "bg-gray-50 text-gray-500 hover:bg-orange-50 hover:text-[#FF6A00]"
                )}
                onClick={() => handleFilterChange(key)}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-bold whitespace-nowrap">{label}</span>
                <span className={cn(
                  "absolute -top-1 -right-1 text-[8px] font-black rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1",
                  filter === key ? "bg-white text-[#FF6A00]" : "bg-[#FF6A00] text-white"
                )}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ LISTINGS GRID ═══ */}
      <div className="flex-1" style={{ backgroundColor: '#F5E62B' }}>
        <div className="w-full px-4 lg:px-6 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-[#FF6A00] mx-auto" />
                <p className="text-sm text-gray-400">Carregando leilões...</p>
              </div>
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl shadow-sm">
              <Gavel className="h-16 w-16 text-gray-200 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-600">
                {filter === "auction" ? "Nenhum leilão ativo" :
                 filter === "arremate" ? "Nenhum arremate disponível" :
                 "Nenhum leilão ou arremate ativo"}
              </h2>
              <p className="text-sm text-gray-400 mt-2 max-w-sm mx-auto">
                {search ? `Nenhum resultado para "${search}"` : "Volte em breve para novas oportunidades!"}
              </p>
              {filter !== "all" && (
                <button
                  className="mt-4 text-sm font-semibold text-orange-500 hover:text-orange-600 underline underline-offset-2"
                  onClick={() => handleFilterChange("all")}
                >
                  ← Ver todos
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 items-stretch">
              {filteredListings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} onClick={() => handleClick(listing)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </MarketLayout>
  );
}
