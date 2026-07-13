import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { MarketFreightCard } from "@/components/freight/MarketFreightCard";
import { SellFreightCTA } from "@/components/freight/SellFreightCTA";
import { FreightTriageWidget } from "@/components/freight/FreightTriageWidget";
import { InstitutionalSafetyBanner } from "@/components/public/InstitutionalSafetyBanner";
import { Truck, Loader2 } from "lucide-react";
import { FREIGHT_VEHICLE_TYPES } from "@/lib/freight/vehicleTypes";
import { CategoryFilterBar } from "@/components/ui/CategoryFilterBar";
import { HorizontalCarousel } from "@/components/ui/HorizontalCarousel";

export default function PublicFreightHome() {
  const navigate = useNavigate();
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

  const activeVehicleTypes = useMemo(() => {
    const counts = new Map<string, number>();
    rawFreightListings.forEach((s) => {
      if (s.vehicle_type) {
        counts.set(s.vehicle_type, (counts.get(s.vehicle_type) || 0) + 1);
      }
    });
    return FREIGHT_VEHICLE_TYPES
      .filter((v) => (counts.get(v.value) || 0) > 0)
      .map((v) => ({ type: v, count: counts.get(v.value) || 0 }));
  }, [rawFreightListings]);

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
      blueFooter
      blueFooterLabel="🚚 Fretes & Mudanças"
      myAccountPath="/minha-conta"
    >
      <InstitutionalSafetyBanner />

      {/* ── CTA para anunciantes ── */}
      <div className="w-full px-4 lg:px-6 pb-4 pt-2">
        <div className="bg-[#68c7f2] rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
          <div className="text-white space-y-1">
            <p className="text-xs font-black uppercase tracking-widest text-sky-200">Para transportadoras e autônomos</p>
            <h3 className="text-xl font-black leading-tight">🚚 Anuncie seu frete aqui!</h3>
            <p className="text-sm text-sky-100">Alcance clientes que precisam de transporte. Cadastro rápido e gratuito.</p>
          </div>
          <button
            onClick={() => navigate("/auth")}
            className="shrink-0 bg-[#F5E62B] hover:brightness-95 text-zinc-900 font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-all whitespace-nowrap"
          >
            Anunciar minha empresa →
          </button>
        </div>
      </div>

      <div className="w-full py-10 bg-[#F5E62B]">
        <div className="max-w-[1920px] mx-auto space-y-6">
          <div className="px-4 lg:px-6 flex flex-col items-center text-center gap-2">
            <div className="flex items-center gap-2 justify-center">
              <div className="p-2 bg-blue-600/10 rounded-lg">
                <Truck className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-xs font-black text-blue-600 uppercase tracking-widest">Transportadoras & Autônomos</span>
            </div>
            <h1 className="text-4xl font-black text-zinc-900 tracking-tighter w-full text-center">
              FRETES <span className="text-orange-500">&</span> MUDANÇAS
            </h1>
            <p className="text-zinc-500 font-medium max-w-xl text-center">
              Mudanças, móveis, eletrodomésticos e cargas grandes — peça orçamento direto.
            </p>
          </div>

          <div className="px-4 lg:px-6">
            <FreightTriageWidget />
          </div>

          {activeVehicleTypes.length > 0 && (
            <div className="w-full bg-emerald-900 py-3 px-4 lg:px-6">
              <CategoryFilterBar
                categories={activeVehicleTypes.map(({ type, count }) => ({
                  value: type.value,
                  label: type.label,
                  count,
                  Icon: type.icon,
                }))}
                activeValue={vehicleFilter}
                onSelect={setVehicleFilter}
                totalCount={rawFreightListings.length}
                allLabel="Todos"
                allEmoji="🚚"
                variant="dark"
              />
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center gap-2 py-16 justify-center text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin" /> Carregando fretes...
            </div>
          ) : filteredFreight.length === 0 ? (
            <div className="text-center py-20 space-y-4 px-4">
              <div className="text-6xl">🚚</div>
              <h2 className="text-2xl font-black text-zinc-700">Nenhum frete encontrado</h2>
              <p className="text-zinc-500">Seja o primeiro a anunciar aqui!</p>
            </div>
          ) : (
            <div className="px-4 lg:px-6">
              {vehicleFilter !== "all" ? (
                /* Categoria selecionada → um card abaixo do outro (posição fixa). */
                <div className="flex flex-col gap-4 w-[80vw] sm:w-80 mx-auto">
                  {filteredFreight.map((s) => (
                    <MarketFreightCard key={s.id} freight={s} />
                  ))}
                </div>
              ) : (
                /* Visão geral → rolagem horizontal deslizando (padrão /viagens). */
                <HorizontalCarousel cardWidth="w-[80vw] sm:w-80">
                  {filteredFreight.map((s) => (
                    <MarketFreightCard key={s.id} freight={s} />
                  ))}
                </HorizontalCarousel>
              )}
            </div>
          )}
        </div>
      </div>

      <section className="p-4">
        <SellFreightCTA variant="banner" />
      </section>
    </MarketLayout>
  );
}
