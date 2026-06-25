import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { MarketFreightCard } from "@/components/freight/MarketFreightCard";
import { SellFreightCTA } from "@/components/freight/SellFreightCTA";
import { FreightTriageWidget } from "@/components/freight/FreightTriageWidget";
import { InstitutionalSafetyBanner } from "@/components/public/InstitutionalSafetyBanner";
import { HorizontalCarousel } from "@/components/ui/HorizontalCarousel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FREIGHT_VEHICLE_TYPES } from "@/lib/freight/vehicleTypes";

export default function PublicFreightHome() {
  const [search, setSearch] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");

  const { data: rawFreightListings = [], isLoading } = useQuery<any[]>({
    queryKey: ["public-freight"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_freight_listings" as any)
        .select("*")
        .order("is_featured", { ascending: false })
        .order("published_at", { ascending: false });
      if (error) {
        console.error("[PublicFreightHome] public_freight_listings query error:", error);
        return [];
      }
      const rows = (data as any[]) || [];
      if (rows.length === 0) return [];

      const ids = rows.map((s) => s.id);
      const { data: mediaRows } = await supabase
        .from("freight_media" as any)
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
      return rows.map((s) => ({ ...s, thumbnail_url: mediaMap.get(s.id) || null }));
    },
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  const filteredFreight = useMemo(() => {
    return rawFreightListings.filter((s) => {
      if (vehicleFilter !== "all" && s.vehicle_type !== vehicleFilter) return false;
      if (cityFilter !== "all" && s.city?.trim().toLowerCase() !== cityFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !s.title?.toLowerCase().includes(q) &&
          !s.city?.toLowerCase().includes(q) &&
          !s.neighborhood?.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [rawFreightListings, vehicleFilter, cityFilter, search]);

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

      <section className="px-4 pt-6 space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-black text-white tracking-tight">🚚 Fretes & Transportes</h1>
          <p className="text-white/70 text-sm">
            Mudanças, móveis, eletrodomésticos, equipamentos e cargas grandes — peça orçamento direto.
          </p>
        </div>

        <FreightTriageWidget />

        <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
          <SelectTrigger className="w-full sm:w-[280px] h-12 rounded-2xl border-white/10 bg-white/5 text-white">
            <SelectValue placeholder="Tipo de veículo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os veículos</SelectItem>
            {FREIGHT_VEHICLE_TYPES.map((v) => (
              <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="p-4">
        {isLoading && <p className="text-center text-white/70">Carregando fretes...</p>}
        {!isLoading && filteredFreight.length === 0 && (
          <p className="text-center text-white/70">Nenhum frete encontrado.</p>
        )}
        <HorizontalCarousel gap="gap-4">
          {filteredFreight.map((s) => (
            <MarketFreightCard key={s.id} freight={s} />
          ))}
        </HorizontalCarousel>
      </section>

      <section className="p-4">
        <SellFreightCTA variant="banner" />
      </section>
    </MarketLayout>
  );
}
