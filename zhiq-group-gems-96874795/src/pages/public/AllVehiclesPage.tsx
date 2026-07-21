import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { MarketVehicleCard } from "@/components/advertiser/MarketVehicleCard";
import { Button } from "@/components/ui/button";
import { InstitutionalSafetyBanner } from "@/components/public/InstitutionalSafetyBanner";
import { CategoryFilterBar } from "@/components/ui/CategoryFilterBar";
import { HorizontalCarousel } from "@/components/ui/HorizontalCarousel";
import { SlidersHorizontal, Car, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function AllVehiclesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [neighborhoodFilter, setNeighborhoodFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [registeredYearFilter, setRegisteredYearFilter] = useState("all");
  const [priceRangeFilter, setPriceRangeFilter] = useState("all");
  const [sortOption, setSortOption] = useState("default"); // default, year, brand, price

  // Fetch vehicle listings (same as in MercadoLocalViagg)
  const { data: rawVehicleListings = [], isLoading: vehiclesLoading } = useQuery<any[]>({
    queryKey: ["public-vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_listings" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[AllVehiclesPage] vehicle_listings query error:", error);
        return [];
      }
      const rows = (data as any[]) || [];
      if (rows.length === 0) return [];

      // Fetch media in a single query
      const ids = rows.map(v => v.id);
      const { data: mediaRows } = await supabase
        .from("vehicle_media" as any)
        .select("listing_id, original_storage_path, public_masked_storage_path, sort_order")
        .in("listing_id", ids)
        .order("sort_order", { ascending: true });

      const mediaMap = new Map<string, string>();
      for (const row of (mediaRows as any[]) || []) {
        if (!mediaMap.has(row.listing_id)) {
          const p = row.public_masked_storage_path || row.original_storage_path;
          if (p) {
            mediaMap.set(
              row.listing_id,
              p.startsWith("http") ? p : supabase.storage.from("real-estate-original").getPublicUrl(p).data.publicUrl
            );
          }
        }
      }
      return rows.map(v => ({ ...v, thumbnail_url: mediaMap.get(v.id) || null }));
    },
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  // Derive filtered list
  const vehicleListings = useMemo(() => {
    return rawVehicleListings.filter(v => {
      if (cityFilter !== "all" && v.city?.trim().toLowerCase() !== cityFilter) return false;
      if (neighborhoodFilter !== "all") {
        const nb = String(v.neighborhood || "").trim().toLowerCase();
        if (nb !== neighborhoodFilter.toLowerCase()) return false;
      }
      if (brandFilter !== "all") {
        if (String(v.brand || "").trim().toLowerCase() !== brandFilter) return false;
      }
      if (yearFilter !== "all") {
        if (String(v.year || "") !== yearFilter) return false;
      }
      if (registeredYearFilter !== "all") {
        const y = v.created_at ? new Date(v.created_at).getFullYear().toString() : "";
        if (y !== registeredYearFilter) return false;
      }
      if (priceRangeFilter !== "all") {
        const val = parseFloat(String(v.price || "0"));
        if (priceRangeFilter === "0-50000" && val > 50000) return false;
        if (priceRangeFilter === "50000-100000" && (val < 50000 || val > 100000)) return false;
        if (priceRangeFilter === "100000-200000" && (val < 100000 || val > 200000)) return false;
        if (priceRangeFilter === "200000-" && val < 200000) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !v.title?.toLowerCase().includes(q) &&
          !v.brand?.toLowerCase().includes(q) &&
          !v.city?.toLowerCase().includes(q) &&
          !v.neighborhood?.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [rawVehicleListings, search, cityFilter, neighborhoodFilter, brandFilter, yearFilter, registeredYearFilter, priceRangeFilter]);

  // Sorting
  const sortedVehicles = useMemo(() => {
    const list = [...vehicleListings];
    switch (sortOption) {
      case "year":
        return list.sort((a, b) => (b.year || 0) - (a.year || 0));
      case "brand":
        return list.sort((a, b) => (a.brand || "").localeCompare(b.brand || ""));
      case "price":
        return list.sort((a, b) => {
          const pa = parseFloat(String(a.price || "0"));
          const pb = parseFloat(String(b.price || "0"));
          return pb - pa;
        });
      default:
        return list; // default order (created_at desc from query)
    }
  }, [vehicleListings, sortOption]);

  // City list for filter (derived from data)
  const cities = useMemo(() => {
    const seen = new Map<string, string>();
    rawVehicleListings.forEach(v => {
      const raw = String(v.city || "").trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      if (!seen.has(key)) seen.set(key, raw);
    });
    return Array.from(seen.entries())
      .map(([key, raw]) => ({ key, label: raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rawVehicleListings]);

  // Brand list (derived from data)
  const brands = useMemo(() => {
    const seen = new Map<string, string>();
    rawVehicleListings.forEach(v => {
      const raw = String(v.brand || "").trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      if (!seen.has(key)) seen.set(key, raw);
    });
    return Array.from(seen.entries())
      .map(([key, raw]) => ({ key, label: raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rawVehicleListings]);

  // Vehicle year list (derived from data)
  const years = useMemo(() => {
    const seen = new Set<string>();
    rawVehicleListings.forEach(v => {
      const y = String(v.year ?? "").trim();
      if (y) seen.add(y);
    });
    return Array.from(seen).sort((a, b) => Number(b) - Number(a));
  }, [rawVehicleListings]);

  // Registered year list (from created_at)
  const registeredYears = useMemo(() => {
    const seen = new Set<string>();
    rawVehicleListings.forEach(v => {
      if (!v.created_at) return;
      const y = new Date(v.created_at).getFullYear();
      if (!isNaN(y)) seen.add(String(y));
    });
    return Array.from(seen).sort((a, b) => Number(b) - Number(a));
  }, [rawVehicleListings]);

  /* Marcas com pelo menos 1 listing — nunca mostra vazia */
  const activeBrands = useMemo(() => {
    const counts = new Map<string, number>();
    rawVehicleListings.forEach((v) => {
      const raw = String(v.brand || "").trim();
      if (raw) counts.set(raw.toLowerCase(), (counts.get(raw.toLowerCase()) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([key, count]) => ({
        value: key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        count,
        emoji: "🚗",
      }))
      .sort((a, b) => b.count - a.count);
  }, [rawVehicleListings]);

  // Neighborhood list (similar to MercadoLocalViagg)
  const neighborhoods = useMemo(() => {
    const seen = new Map<string, string>();
    rawVehicleListings.forEach(v => {
      const raw = String(v.neighborhood || "").trim();
      if (!raw) return;
      const key = raw.toLowerCase();
      if (!seen.has(key)) seen.set(key, raw);
    });
    return Array.from(seen.entries())
      .map(([key, raw]) => ({ key, label: raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rawVehicleListings]);

  return (
    <MarketLayout
      search={search}
      setSearch={setSearch}
      showSearch={true}
      hideCart={true}
      headerRight={null}
      headerChildren={<MarketNavButtons />}
      blueFooter
      blueFooterLabel="🚗 Veículos"
      myAccountPath="/minha-conta"
    >
      <InstitutionalSafetyBanner />

      {/* ── CTA para anunciantes ── */}
      <div className="w-full px-4 lg:px-6 pb-4 pt-2">
        <div className="bg-[#1A1F24] border border-[#323A45] rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
          <div className="text-white space-y-1">
            <p className="text-xs font-black uppercase tracking-widest text-[#00C58E]">Para revendas e proprietários</p>
            <h3 className="text-xl font-black leading-tight text-white">🚗 Anuncie seu veículo aqui!</h3>
            <p className="text-sm text-[#B8C2CC]">Alcance compradores na sua região. Cadastro rápido e gratuito.</p>
          </div>
          <button
            onClick={() => navigate("/auth")}
            className="shrink-0 bg-[#FF7A00] hover:bg-[#FF8E1F] text-white font-black text-sm px-6 py-3 rounded-2xl shadow-[0_6px_18px_rgba(255,122,0,0.30)] transition-all whitespace-nowrap"
          >
            Anunciar meu veículo →
          </button>
        </div>
      </div>

      <div className="w-full py-10 bg-[#10151A]">
        <div className="max-w-[1920px] mx-auto space-y-6">
          <div className="px-4 lg:px-6 flex flex-col items-center text-center gap-2">
            <div className="flex items-center gap-2 justify-center">
              <div className="p-2 bg-[#252B33] border border-[#323A45] rounded-lg">
                <Car className="w-5 h-5 text-[#00C58E]" />
              </div>
              <span className="text-xs font-black text-[#8E98A3] uppercase tracking-widest">Revendas & Proprietários</span>
            </div>
            <h1 className="text-4xl font-black text-white tracking-tighter w-full text-center">
              VEÍCULOS <span className="text-[#FF7A00]">&</span> AUTOMÓVEIS
            </h1>
            <p className="text-[#B8C2CC] font-medium max-w-xl text-center">
              Carros, motos, caminhões e mais — negocie direto com o dono.
            </p>
          </div>

          {activeBrands.length > 0 && (
            <div className="w-full bg-emerald-900 py-3 px-4 lg:px-6">
              <CategoryFilterBar
                categories={activeBrands}
                activeValue={brandFilter}
                onSelect={setBrandFilter}
                totalCount={rawVehicleListings.length}
                allLabel="Todos"
                allEmoji="🚗"
                variant="dark"
              />
            </div>
          )}

          {vehiclesLoading ? (
            <div className="flex items-center gap-2 py-16 justify-center text-[#8E98A3]">
              <Loader2 className="w-6 h-6 animate-spin" /> Carregando veículos...
            </div>
          ) : sortedVehicles.length === 0 ? (
            <div className="text-center py-20 space-y-4 px-4">
              <div className="text-6xl">🚗</div>
              <h2 className="text-2xl font-black text-white">Nenhum veículo encontrado</h2>
              <p className="text-[#B8C2CC]">Seja o primeiro a anunciar aqui!</p>
            </div>
          ) : (
            <div className="px-4 lg:px-6">
              {brandFilter !== "all" ? (
                /* Marca selecionada → um card abaixo do outro (posição fixa). */
                <div className="flex flex-col gap-4 w-[80vw] sm:w-80 mx-auto">
                  {sortedVehicles.map(v => (
                    <MarketVehicleCard key={v.id} vehicle={v} />
                  ))}
                </div>
              ) : (
                /* Visão geral → rolagem horizontal deslizando (padrão /viagens). */
                <HorizontalCarousel cardWidth="w-[80vw] sm:w-80">
                  {sortedVehicles.map(v => (
                    <MarketVehicleCard key={v.id} vehicle={v} />
                  ))}
                </HorizontalCarousel>
              )}
            </div>
          )}
        </div>
      </div>
    </MarketLayout>
  );
}
