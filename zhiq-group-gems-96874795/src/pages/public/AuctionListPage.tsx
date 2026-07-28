/**
 * AuctionListPage — Feed público de leilões e arremates ativos
 * Usa o MESMO MarketLayout do Mercado (cabeçalho completo: clima, logo, busca,
 * MarketNavButtons — incluindo o botão Leilões — carrinho, áudio e rodapé).
 */
import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import {
  Gavel, MapPin, Truck,
  Sparkles, Trophy, ShieldCheck, BadgeCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CardDark, DarkSkeleton } from "@/components/ui/dark-card";
import { MarketAuctionCard } from "@/components/advertiser/MarketAuctionCard";
import { AuctionCarousel } from "@/components/public/AuctionCarousel";
import type { AuctionListing } from "@/hooks/useAuctions";

// ─── Helpers ────────────────────────────
// (formatBRL "/100" e useCountdown saíram com o card local — o MarketAuctionCard
//  já formata preço em reais e roda seu próprio timer ao vivo.)

function getListingType(listing: any): "auction" | "arremate" {
  if (listing.listing_type === "arremate") return "arremate";
  return "auction";
}

// ─── ListingCard (Modelo 2) REMOVIDO na padronização ORION 07-21 ─────────────
// TODA vitrine de leilão usa o componente ÚNICO MarketAuctionCard (sobre
// PremiumCard). Não reintroduzir card local aqui. O antigo formatBRL "/100"
// (bug de unidade) saiu junto — auction_listings guarda valores em REAIS.

// ─── Page ────────────────────────────────

export default function AuctionListPage() {
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


  const auctionCount = listings.filter(l => getListingType(l) === "auction").length;
  const arremateCount = listings.filter(l => getListingType(l) === "arremate").length;

  return (
    <MarketLayout
      search={search}
      setSearch={setSearch}
      headerChildren={<MarketNavButtons />}
      mainClassName="flex flex-col bg-institutional-yellow"
      blueFooter
      blueFooterLabel="🏷️ Leilões"
      myAccountPath="/minha-conta"
    >
      {/* ═══ TRUST BAR (futurista) ═══ */}
      <div className="relative bg-institutional-yellow border-b border-yellow-600/40 overflow-hidden shadow-md">
        {/* linha de scan neon */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
        <div className="max-w-[1920px] mx-auto px-4 lg:px-6 py-2 flex items-center justify-center gap-5 sm:gap-7 text-[11px] font-bold text-[#1A1F24]">
          <span className="flex items-center gap-1.5 drop-shadow-sm">
            <BadgeCheck className="h-3.5 w-3.5 text-[#1A1F24]" /> Leilões Verificados
          </span>
          <span className="flex items-center gap-1.5 drop-shadow-sm">
            <ShieldCheck className="h-3.5 w-3.5 text-[#1A1F24]" /> Pagamento Seguro
          </span>
          <span className="flex items-center gap-1.5 drop-shadow-sm hidden sm:flex">
            <Truck className="h-3.5 w-3.5 text-[#1A1F24]" /> Entrega Local
          </span>
        </div>
      </div>

      {/* ═══ FILTROS: CIDADE + TIPO (glassmorphism futurista) ═══ */}
      <div className="relative bg-[#68c7f2] border-b border-sky-400/30 shadow-[0_18px_45px_-18px_rgba(0,0,0,0.5)] overflow-hidden">
        {/* orbs de brilho */}
        <div className="pointer-events-none absolute -top-20 left-1/4 h-44 w-44 rounded-full bg-white/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-1/5 h-44 w-44 rounded-full bg-white/25 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.05] bg-[linear-gradient(to_right,#000_1px,transparent_1px),linear-gradient(to_bottom,#000_1px,transparent_1px)] bg-[size:22px_22px]" />

        <div className="relative max-w-[1920px] mx-auto px-4 lg:px-6">
          {/* City filter pills */}
          <div className="flex items-center gap-2 pt-3 overflow-x-auto scrollbar-hide">
            <button
              className={cn("flex items-center gap-1 px-3.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all border backdrop-blur",
                cityFilter === "all"
                  ? "bg-gradient-to-r from-[#FF6A00] to-[#FF9A00] text-white border-orange-300/50 shadow-[0_0_16px_-2px_rgba(255,106,0,0.7)]"
                  : "bg-black/15 text-[#1A1F24] border-black/15 hover:bg-black/25 hover:text-black")}
              onClick={() => setCityFilter("all")}>
              <Sparkles className="h-3 w-3" /> Todas Cidades
            </button>
            {cities.map(city => (
              <button key={city}
                className={cn("px-3.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all flex items-center gap-1 border backdrop-blur",
                  cityFilter === city
                    ? "bg-gradient-to-r from-[#FF6A00] to-[#FF9A00] text-white border-orange-300/50 shadow-[0_0_16px_-2px_rgba(255,106,0,0.7)]"
                    : "bg-black/15 text-[#1A1F24] border-black/15 hover:bg-black/25 hover:text-black")}
                onClick={() => setCityFilter(city)}>
                <MapPin className="h-3 w-3" /> {city}
              </button>
            ))}
          </div>

          {/* Type tabs */}
          <div className="flex items-center justify-center gap-4 py-3 w-full">
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
                    : "bg-black/15 text-[#1A1F24] border-black/15 hover:bg-black/25 hover:text-black"
                )}
                onClick={() => handleFilterChange(key)}
              >
                <Icon className={cn("h-5 w-5 transition-all", filter === key ? "drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]" : "group-hover:scale-110")} />
                <span className="text-[10px] font-bold whitespace-nowrap tracking-wide">{label}</span>
                <span className={cn(
                  "absolute -top-1.5 -right-1.5 text-[9px] font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 ring-2",
                  filter === key
                    ? "bg-[#1A1F24] text-[#FF7A00] ring-white/20"
                    : "bg-[#FF6A00] text-white ring-yellow-800 shadow-[0_0_8px_rgba(255,106,0,0.7)]"
                )}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ LISTINGS GRID ═══ */}
      <div className="flex-1 bg-institutional-yellow">
        <div className="w-full px-4 lg:px-6 py-6">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <CardDark key={i} className="overflow-hidden">
                  <DarkSkeleton className="aspect-[4/3] sm:aspect-[1.15] rounded-none" />
                  <div className="p-5 sm:p-6 space-y-3">
                    <DarkSkeleton className="h-5 w-3/4" />
                    <DarkSkeleton className="h-4 w-1/2" />
                    <DarkSkeleton className="h-10 w-full rounded-xl" />
                  </div>
                </CardDark>
              ))}
            </div>
          ) : filteredListings.length === 0 ? (
            <CardDark className="text-center py-20">
              <Gavel className="h-16 w-16 text-[#323A45] mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white">
                {filter === "auction" ? "Nenhum leilão ativo" :
                 filter === "arremate" ? "Nenhum arremate disponível" :
                 "Nenhum leilão ou arremate ativo"}
              </h2>
              <p className="text-sm text-[#B8C2CC] mt-2 max-w-sm mx-auto">
                {search ? `Nenhum resultado para "${search}"` : "Volte em breve para novas oportunidades!"}
              </p>
              {filter !== "all" && (
                <button
                  className="mt-4 text-sm font-semibold text-[#FF7A00] hover:text-[#FF8E1F] underline underline-offset-2"
                  onClick={() => handleFilterChange("all")}
                >
                  ← Ver todos
                </button>
              )}
            </CardDark>
          ) : (
            <AuctionCarousel listings={filteredListings} />
          )}
        </div>
      </div>
    </MarketLayout>
  );
}
