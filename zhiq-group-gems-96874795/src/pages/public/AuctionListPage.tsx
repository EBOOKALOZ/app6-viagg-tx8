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
  Sparkles, Trophy, ShieldCheck, BadgeCheck,
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
      isUrgent ? "bg-red-500/90 text-white animate-pulse" : "bg-emerald-600/90 text-white"
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

// Contador regressivo PREMIUM — 4 caixas (Dias/Hrs/Min/Seg), ao vivo
function CountdownPremium({ endsAt }: { endsAt: string }) {
  const { days, hours, minutes, seconds, ended, total } = useCountdown(endsAt);
  if (ended) {
    return (
      <div className="rounded-xl bg-gray-100 border border-gray-200 py-2.5 text-center">
        <span className="text-xs font-black uppercase tracking-wider text-gray-500">🔒 Leilão Encerrado</span>
      </div>
    );
  }
  const urgent = total > 0 && total < 3600000; // < 1h
  const pad = (n: number) => String(n).padStart(2, "0");
  const units = [
    { v: days, l: "Dias" },
    { v: hours, l: "Hrs" },
    { v: minutes, l: "Min" },
    { v: seconds, l: "Seg" },
  ];
  return (
    <div className={cn(
      "rounded-2xl p-2.5 border shadow-md",
      urgent
        ? "bg-gradient-to-r from-red-600 via-red-500 to-orange-500 border-red-400"
        : "bg-gradient-to-br from-[#00a300] via-[#009200] to-[#007a00] border-[#00c400]/40"
    )}>
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/75 text-center mb-1.5 flex items-center justify-center gap-1">
        <Timer className="h-3 w-3" /> Encerra em {urgent && <Flame className="h-3 w-3 text-yellow-300" />}
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {units.map((u) => (
          <div key={u.l} className="rounded-lg bg-white/10 backdrop-blur-sm py-1.5 text-center ring-1 ring-white/10">
            <p className={cn("text-xl font-black leading-none tabular-nums text-white", urgent && "animate-pulse")}>{pad(u.v)}</p>
            <p className="text-[8px] font-bold uppercase tracking-wider text-white/60 mt-0.5">{u.l}</p>
          </div>
        ))}
      </div>
    </div>
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
          </div>
        </>
      )}

      <div className="p-4 space-y-3 flex-1 flex flex-col">
        {/* Title */}
        <h3 className="font-bold text-gray-800 text-base leading-tight group-hover:text-gray-900 min-h-[44px]">
          {listing.title}
        </h3>

        {/* Description */}
        {listing.description && (
          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
            {listing.description}
          </p>
        )}

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

        {/* Contador regressivo premium */}
        <CountdownPremium endsAt={listing.ends_at} />

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
      {/* ═══ TRUST BAR (futurista) ═══ */}
      <div className="relative bg-gradient-to-r from-[#08080f] via-[#14101f] to-[#08080f] border-b border-orange-500/20 overflow-hidden">
        {/* linha de scan neon */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FF6A00]/70 to-transparent" />
        <div className="max-w-[1920px] mx-auto px-4 lg:px-6 py-2 flex items-center justify-center gap-5 sm:gap-7 text-[11px]">
          <span className="flex items-center gap-1.5 font-semibold text-orange-100/90">
            <BadgeCheck className="h-3.5 w-3.5 text-[#FF6A00] drop-shadow-[0_0_6px_rgba(255,106,0,0.9)]" /> Leilões Verificados
          </span>
          <span className="flex items-center gap-1.5 font-semibold text-emerald-100/90">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.8)]" /> Pagamento Seguro
          </span>
          <span className="flex items-center gap-1.5 font-semibold text-sky-100/90 hidden sm:flex">
            <Truck className="h-3.5 w-3.5 text-sky-400 drop-shadow-[0_0_6px_rgba(56,189,248,0.8)]" /> Entrega Local
          </span>
        </div>
      </div>

      {/* ═══ FILTROS: CIDADE + TIPO (glassmorphism futurista) ═══ */}
      <div className="relative bg-gradient-to-b from-[#0d0b18] to-[#08080f] border-b border-white/5 shadow-[0_18px_45px_-18px_rgba(0,0,0,0.7)] overflow-hidden">
        {/* orbs de brilho */}
        <div className="pointer-events-none absolute -top-20 left-1/4 h-44 w-44 rounded-full bg-[#FF6A00]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-1/5 h-44 w-44 rounded-full bg-violet-600/15 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.04] bg-[linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] bg-[size:22px_22px]" />

        <div className="relative max-w-[1920px] mx-auto px-4 lg:px-6">
          {/* City filter pills */}
          <div className="flex items-center gap-2 pt-3 overflow-x-auto scrollbar-hide">
            <button
              className={cn("flex items-center gap-1 px-3.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all border backdrop-blur",
                cityFilter === "all"
                  ? "bg-gradient-to-r from-[#FF6A00] to-[#FF9A00] text-white border-orange-300/50 shadow-[0_0_16px_-2px_rgba(255,106,0,0.7)]"
                  : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white/90")}
              onClick={() => setCityFilter("all")}>
              <Sparkles className="h-3 w-3" /> Todas Cidades
            </button>
            {cities.map(city => (
              <button key={city}
                className={cn("px-3.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1 border backdrop-blur",
                  cityFilter === city
                    ? "bg-gradient-to-r from-[#FF6A00] to-[#FF9A00] text-white border-orange-300/50 shadow-[0_0_16px_-2px_rgba(255,106,0,0.7)]"
                    : "bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white/90")}
                onClick={() => setCityFilter(city)}>
                <MapPin className="h-3 w-3" /> {city}
              </button>
            ))}
          </div>

          {/* Type tabs */}
          <div className="flex items-center gap-2 py-3 overflow-x-auto scrollbar-hide">
            {[
              { key: "all" as const, label: "Todos", icon: Sparkles, count: listings.length },
              { key: "auction" as const, label: "Leilões", icon: Gavel, count: auctionCount },
              { key: "arremate" as const, label: "Arremates", icon: Trophy, count: arremateCount },
            ].map(({ key, label, icon: Icon, count }) => (
              <button
                key={key}
                className={cn(
                  "group relative flex flex-col items-center gap-1 px-4 py-2.5 rounded-2xl min-w-[86px] transition-all duration-300 shrink-0 border backdrop-blur",
                  filter === key
                    ? "bg-gradient-to-br from-[#FF6A00] to-[#FF9A00] text-white border-orange-300/40 shadow-[0_0_24px_-4px_rgba(255,106,0,0.8)] scale-105 -translate-y-0.5"
                    : "bg-white/[0.04] text-white/45 border-white/10 hover:bg-white/[0.09] hover:text-white/90 hover:border-white/20"
                )}
                onClick={() => handleFilterChange(key)}
              >
                <Icon className={cn("h-5 w-5 transition-all", filter === key ? "drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]" : "group-hover:scale-110")} />
                <span className="text-[10px] font-bold whitespace-nowrap tracking-wide">{label}</span>
                <span className={cn(
                  "absolute -top-1.5 -right-1.5 text-[9px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 ring-2",
                  filter === key
                    ? "bg-white text-[#FF6A00] ring-orange-200/40"
                    : "bg-[#FF6A00] text-white ring-[#0a0a12] shadow-[0_0_8px_rgba(255,106,0,0.7)]"
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
