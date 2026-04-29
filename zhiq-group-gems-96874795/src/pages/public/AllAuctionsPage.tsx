import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketAuctionCard } from "@/components/advertiser/MarketAuctionCard";
import { Button } from "@/components/ui/button";
import { InstitutionalSafetyBanner } from "@/components/public/InstitutionalSafetyBanner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SlidersHorizontal, Gavel, Tag, Timer, ShieldCheck, Zap, Users } from "lucide-react";
import type { AuctionListing } from "@/hooks/useAuctions";
import { cn, formatCurrencyBRL } from "@/lib/utils";

export default function AllAuctionsPage() {
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [neighborhoodFilter, setNeighborhoodFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "auction" | "arremate">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "ended" | "sold">("all");
  const [priceRangeFilter, setPriceRangeFilter] = useState("all");
  const [sortOption, setSortOption] = useState("ends_at"); // ends_at, price_asc, price_desc, recent, bids

  // Fetch public auction listings
  const { data: rawAuctionListings = [], isLoading: auctionsLoading } = useQuery<AuctionListing[]>({
    queryKey: ["public-auctions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auction_listings")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[AllAuctionsPage] auction_listings query error:", error);
        return [];
      }

      // Enriquecer listings sem product_image_url — busca por product_id OU por título
      // Buscar TODOS os produtos em batch (uma vez só, não por listing)
      const [plAll, alAll, vlAll] = await Promise.all([
        supabase.from("product_listings" as any).select("id, title, cover_image_url").limit(500),
        supabase.from("advertiser_listings" as any)
          .select("id, title, cover_image_url, advertiser_listing_media(media_url)").limit(500),
        supabase.from("vehicle_listings" as any)
          .select("id, title, cover_image_url, vehicle_media(original_storage_path, public_masked_storage_path)").limit(500),
      ]);

      // Montar mapa: id -> imgUrl e title -> imgUrl
      const imageById = new Map<string, string>();
      const imageByTitle = new Map<string, string>();

      const resolveImg = (raw: string | null, bucket: string) => {
        if (!raw) return null;
        return raw.startsWith("http") ? raw : supabase.storage.from(bucket).getPublicUrl(raw).data.publicUrl;
      };

      for (const p of (plAll.data || []) as any[]) {
        const img = resolveImg(p.cover_image_url, "marketing-materials");
        if (img) {
          imageById.set(p.id, img);
          imageByTitle.set((p.title || "").toLowerCase().trim(), img);
        }
      }
      for (const a of (alAll.data || []) as any[]) {
        // media_url já é URL completa; cover_image_url pode ser path ou URL
        const mediaUrl = a.advertiser_listing_media?.[0]?.media_url || null;
        const raw = mediaUrl || a.cover_image_url;
        let img: string | null = null;
        if (raw) {
          img = raw.startsWith("http") ? raw : supabase.storage.from("marketing-materials").getPublicUrl(raw).data.publicUrl;
        }
        if (img) {
          imageById.set(a.id, img);
          imageByTitle.set((a.title || "").toLowerCase().trim(), img);
        }
      }
      for (const v of (vlAll.data || []) as any[]) {
        let img = resolveImg(v.cover_image_url, "real-estate-original");
        if (!img && v.vehicle_media?.length > 0) {
          const path = v.vehicle_media[0].public_masked_storage_path || v.vehicle_media[0].original_storage_path;
          img = resolveImg(path, "real-estate-original");
        }
        if (img) {
          imageById.set(v.id, img);
          imageByTitle.set((v.title || "").toLowerCase().trim(), img);
        }
      }

      const enriched = ((data as any[]) || []).map((listing) => {
        if (listing.product_image_url) return listing;

        // Match 1: por product_id
        if (listing.product_id && imageById.has(listing.product_id)) {
          return { ...listing, product_image_url: imageById.get(listing.product_id) };
        }

        // Match 2: por título — remove prefixos "[Anúncio] ", "[Produto] ", etc.
        const cleanTitle = (listing.title || "").replace(/^\[.*?\]\s*/, "").toLowerCase().trim();
        if (cleanTitle.length > 2) {
          // Busca exata
          if (imageByTitle.has(cleanTitle)) {
            return { ...listing, product_image_url: imageByTitle.get(cleanTitle) };
          }
          // Busca parcial
          for (const [title, img] of imageByTitle.entries()) {
            if (title.length > 2 && (title.includes(cleanTitle) || cleanTitle.includes(title))) {
              return { ...listing, product_image_url: img };
            }
          }
        }

        return listing;
      });

      return enriched as AuctionListing[];
    },
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  // Derive filtered list
  const auctionListings = useMemo(() => {
    return rawAuctionListings.filter(l => {
      // Filtro de cidade
      if (cityFilter !== "all" && l.city?.trim().toLowerCase() !== cityFilter) return false;

      // Filtro de bairro
      if (neighborhoodFilter !== "all") {
        const nb = String(l.neighborhood || "").trim().toLowerCase();
        if (nb !== neighborhoodFilter.toLowerCase()) return false;
      }

      // Filtro de tipo
      if (typeFilter !== "all" && l.listing_type !== typeFilter) return false;

      // Filtro de status
      if (statusFilter !== "all" && l.status !== statusFilter) return false;

      // Filtro de faixa de preço
      if (priceRangeFilter !== "all") {
        const val = l.current_bid || l.starting_bid || 0;
        if (priceRangeFilter === "0-100" && val > 100) return false;
        if (priceRangeFilter === "100-500" && (val < 100 || val > 500)) return false;
        if (priceRangeFilter === "500-1000" && (val < 500 || val > 1000)) return false;
        if (priceRangeFilter === "1000-5000" && (val < 1000 || val > 5000)) return false;
        if (priceRangeFilter === "5000-20000" && (val < 5000 || val > 20000)) return false;
        if (priceRangeFilter === "20000-100000" && (val < 20000 || val > 100000)) return false;
        if (priceRangeFilter === "100000+" && val < 100000) return false;
      }

      // Busca textual
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !l.title?.toLowerCase().includes(q) &&
          !l.description?.toLowerCase().includes(q) &&
          !l.city?.toLowerCase().includes(q) &&
          !l.neighborhood?.toLowerCase().includes(q)
        ) return false;
      }

      return true;
    });
  }, [rawAuctionListings, search, cityFilter, neighborhoodFilter, typeFilter, statusFilter, priceRangeFilter]);

  // Sorting
  const sortedListings = useMemo(() => {
    const list = [...auctionListings];
    const now = Date.now();
    switch (sortOption) {
      case "ends_at":
        return list.sort((a, b) => new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime());
      case "price_asc":
        return list.sort((a, b) => (a.current_bid || a.starting_bid || 0) - (b.current_bid || b.starting_bid || 0));
      case "price_desc":
        return list.sort((a, b) => (b.current_bid || b.starting_bid || 0) - (a.current_bid || a.starting_bid || 0));
      case "recent":
        return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case "bids":
        return list.sort((a, b) => (b.total_bids || 0) - (a.total_bids || 0));
      default:
        return list;
    }
  }, [auctionListings, sortOption]);

  // Derived data for filters (cities, neighborhoods)
  const cities = useMemo(() => {
    const seen = new Map<string, string>();
    rawAuctionListings.forEach(l => {
      const raw = String(l.city || "").trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      if (!seen.has(key)) seen.set(key, raw);
    });
    return Array.from(seen.entries())
      .map(([key, raw]) => ({ key, label: raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rawAuctionListings]);

  const neighborhoods = useMemo(() => {
    if (cityFilter === "all") return [];
    const seen = new Map<string, string>();
    rawAuctionListings.forEach(l => {
      if (cityFilter !== "all" && l.city?.trim().toLowerCase() !== cityFilter) return;
      const raw = String(l.neighborhood || "").trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      if (!seen.has(key)) seen.set(key, raw);
    });
    return Array.from(seen.entries())
      .map(([key, raw]) => ({ key, label: raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rawAuctionListings, cityFilter]);

  // Stats
  const stats = useMemo(() => {
    const now = new Date();
    const active = rawAuctionListings.filter(l => l.status === "active" && new Date(l.ends_at) > now).length;
    const ended = rawAuctionListings.filter(l => l.status === "ended" || l.status === "sold" || new Date(l.ends_at) <= now).length;
    const auctions = rawAuctionListings.filter(l => l.listing_type === "auction").length;
    const arremates = rawAuctionListings.filter(l => l.listing_type === "arremate").length;
    return { total: rawAuctionListings.length, active, ended, auctions, arremates };
  }, [rawAuctionListings]);

  return (
    <MarketLayout
      search={search}
      setSearch={setSearch}
      showSearch={true}
      hideCart={true}
      headerRight={null}
      headerChildren={null}
    >
      <InstitutionalSafetyBanner />
      {/* HERO SECTION */}
      <section className="relative h-[420px] flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#FF6A00] via-[#FF8C00] to-[#E65C00]">
        {/* Padrão decorativo */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.3),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.2),transparent_40%)]" />
        </div>

        <div className="container relative z-10 px-4 text-center space-y-6">
          {/* Badge premium */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 border border-white/30 text-white text-xs font-black uppercase tracking-widest backdrop-blur-md">
            <Zap className="w-4 h-4" />
            Oportunidades Únicas
          </div>

          {/* Título */}
          <div className="space-y-3">
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-white leading-none drop-shadow-lg">
              LEILÕES E <span className="text-yellow-300 italic">ARRAMATES</span>
            </h1>
            <p className="text-xl text-white/90 font-medium max-w-3xl mx-auto tracking-tight">
              Produtos e oportunidades em disputa, com transparência, tempo real e uso de créditos.
              <br />
              Aproveite os melhores descontos em tempo real.
            </p>
          </div>

          {/* Stats rápidas */}
          <div className="flex items-center justify-center gap-8 pt-6">
            <div className="text-center">
              <p className="text-3xl font-black text-white">{stats.active}</p>
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Ativos Agora</p>
            </div>
            <div className="w-px h-10 bg-white/30" />
            <div className="text-center">
              <p className="text-3xl font-black text-white">{stats.auctions}</p>
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Leilões</p>
            </div>
            <div className="w-px h-10 bg-white/30" />
            <div className="text-center">
              <p className="text-3xl font-black text-white">{stats.arremates}</p>
              <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Arremates</p>
            </div>
          </div>
        </div>
      </section>

      {/* CRÉDITOS / TRANSPARÊNCIA BANNER */}
      <section className="bg-[#1B1F24] border-y-4 border-[#FF6A00] py-6">
        <div className="container px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-[#FF6A00]/20 border-2 border-[#FF6A00]/30 flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-[#FF6A00]" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-tight">
                  Sistema de Créditos Transparente
                </h3>
                <p className="text-sm font-bold text-[#A7B0BE]">
                  Crie leilões, destaque ofertas e pague taxas com créditos. Sem surpresas.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap justify-center">
              <div className="text-center px-4">
                <p className="text-xl font-black text-[#FF6A00]">7 CRÉDITOS</p>
                <p className="text-[10px] font-bold text-[#A7B0BE] uppercase">por leilão criado</p>
              </div>
              <div className="text-center px-4">
                <p className="text-xl font-black text-emerald-400">2-5 CRÉDITOS</p>
                <p className="text-[10px] font-bold text-[#A7B0BE] uppercase">destaque/recursos</p>
              </div>
              <div className="text-center px-4">
                <p className="text-xl font-black text-blue-400">% variável</p>
                <p className="text-[10px] font-bold text-[#A7B0BE] uppercase">comissão convertida</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* MAIN CONTENT */}
      <main className="min-h-screen bg-[#F5E62B]">
        <div className="container px-4 py-8 space-y-8">

          {/* FILTROS RÁPIDOS (topo da página) */}
          <div className="space-y-4">
            {/* Tabs de tipo (simples) */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => setTypeFilter("all")}
                className={`px-4 py-2 rounded-xl text-sm font-black whitespace-nowrap transition-all ${
                  typeFilter === "all"
                    ? "bg-[#FF6A00] text-white shadow-lg"
                    : "bg-white text-zinc-700 hover:bg-zinc-100 shadow"
                }`}
              >
                Todos ({stats.total})
              </button>
              <button
                onClick={() => setTypeFilter("auction")}
                className={`px-4 py-2 rounded-xl text-sm font-black whitespace-nowrap transition-all flex items-center gap-2 ${
                  typeFilter === "auction"
                    ? "bg-[#FF6A00] text-white shadow-lg"
                    : "bg-white text-zinc-700 hover:bg-zinc-100 shadow"
                }`}
              >
                <Gavel className="w-4 h-4" />
                Leilões ({stats.auctions})
              </button>
              <button
                onClick={() => setTypeFilter("arremate")}
                className={`px-4 py-2 rounded-xl text-sm font-black whitespace-nowrap transition-all flex items-center gap-2 ${
                  typeFilter === "arremate"
                    ? "bg-blue-500 text-white shadow-lg"
                    : "bg-white text-zinc-700 hover:bg-zinc-100 shadow"
                }`}
              >
                <Tag className="w-4 h-4" />
                Arremates ({stats.arremates})
              </button>
            </div>

            {/* Filtros de cidade + busca */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <select
                  value={cityFilter}
                  onChange={e => setCityFilter(e.target.value)}
                  className="w-full h-12 rounded-xl border-0 bg-white px-4 text-sm font-bold shadow-md focus:ring-2 focus:ring-[#FF6A00] outline-none"
                >
                  <option value="all">Todas as cidades</option>
                  {cities.map(c => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>

              {cityFilter !== "all" && neighborhoods.length > 0 && (
                <div className="flex-1">
                  <select
                    value={neighborhoodFilter}
                    onChange={e => setNeighborhoodFilter(e.target.value)}
                    className="w-full h-12 rounded-xl border-0 bg-white px-4 text-sm font-bold shadow-md focus:ring-2 focus:ring-[#FF6A00] outline-none"
                  >
                    <option value="all">Todos os bairros</option>
                    {neighborhoods.map(nb => (
                      <option key={nb.key} value={nb.key}>{nb.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex-1">
                <select
                  value={sortOption}
                  onChange={e => setSortOption(e.target.value)}
                  className="w-full h-12 rounded-xl border-0 bg-white px-4 text-sm font-bold shadow-md focus:ring-2 focus:ring-[#FF6A00] outline-none"
                >
                  <option value="ends_at">Encerrando primeiro</option>
                  <option value="price_asc">Menor lance</option>
                  <option value="price_desc">Maior lance</option>
                  <option value="recent">Mais recentes</option>
                  <option value="bids">Mais lances</option>
                </select>
              </div>
            </div>
          </div>

          {/* GRID DE LEILÕES */}
          {auctionsLoading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#FF6A00]"></div>
              <p className="text-sm font-bold text-[#A7B0BE] mt-4 uppercase tracking-widest">
                Carregando leilões...
              </p>
            </div>
          ) : sortedListings.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl shadow-lg border border-[#FF6A00]/20">
              <Gavel className="h-20 w-20 text-[#FF6A00]/20 mx-auto mb-6" />
              <h3 className="text-2xl font-black text-[#1B1F24] mb-2 uppercase tracking-tight">
                Nenhum leilão encontrado
              </h3>
              <p className="text-[#A7B0BE] font-bold max-w-md mx-auto">
                {search || cityFilter !== "all" || typeFilter !== "all"
                  ? "Nenhum resultado para os filtros atuais. Tente ajustar sua busca."
                  : "Novos leilões e arremates são publicados regularmente. Volte em breve!"}
              </p>
              {(search || cityFilter !== "all" || typeFilter !== "all") && (
                <Button
                  onClick={() => {
                    setSearch("");
                    setCityFilter("all");
                    setNeighborhoodFilter("all");
                    setTypeFilter("all");
                    setStatusFilter("all");
                    setPriceRangeFilter("all");
                  }}
                  className="mt-6 bg-[#FF6A00] hover:bg-[#E65C00] text-white font-black uppercase tracking-widest"
                >
                  Limpar Filtros
                </Button>
              )}
            </div>
          ) : (
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-[#FF6A00]/10 via-white/40 to-[#FF8C00]/10 rounded-[40px] -z-10" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-2">
                {sortedListings.map((listing) => (
                  <MarketAuctionCard key={listing.id} listing={listing} />
                ))}
              </div>
            </div>
          )}

          {/* BOTÃO CTA - Criar Leilão (apenas para logados - futuro) */}
          <div className="py-8 text-center">
            <div className="inline-flex items-center gap-4 p-6 bg-white rounded-2xl shadow-xl border-2 border-[#FF6A00]/30 max-w-2xl">
              <div className="w-12 h-12 rounded-full bg-[#FF6A00]/10 flex items-center justify-center">
                <Gavel className="w-6 h-6 text-[#FF6A00]" />
              </div>
              <div className="text-left flex-1">
                <h3 className="font-black text-[#1B1F24]">Quer criar seu próprio leilão?</h3>
                <p className="text-sm font-bold text-[#A7B0BE]">
                  Acesse sua conta de anunciante para publicar leilões e arremates.
                </p>
              </div>
              <Button
                onClick={() => window.location.href = '/anunciante/leiloes'}
                className="bg-[#FF6A00] hover:bg-[#E65C00] text-white font-black uppercase tracking-wider"
              >
                Acessar Painel
              </Button>
            </div>
          </div>

        </div>
      </main>

      {/* FOOTER - usar o padrão ou FooterNeutral? */}
    </MarketLayout>
  );
}
