import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { MarketVehicleCard } from "@/components/advertiser/MarketVehicleCard";
import { Button } from "@/components/ui/button";
import { InstitutionalSafetyBanner } from "@/components/public/InstitutionalSafetyBanner";
import { HorizontalCarousel } from "@/components/ui/HorizontalCarousel";
import { SlidersHorizontal } from "lucide-react";
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
    >
      <InstitutionalSafetyBanner />
      <section className="p-4">
        {vehiclesLoading && <p className="text-center text-white/70">Carregando veículos...</p>}
        {!vehiclesLoading && sortedVehicles.length === 0 && (
          <p className="text-center text-white/70">Nenhum veículo encontrado.</p>
        )}
        <HorizontalCarousel gap="gap-4">
          {sortedVehicles.map(v => (
            <MarketVehicleCard key={v.id} vehicle={v} />
          ))}
        </HorizontalCarousel>
      </section>
    </MarketLayout>
  );
}
