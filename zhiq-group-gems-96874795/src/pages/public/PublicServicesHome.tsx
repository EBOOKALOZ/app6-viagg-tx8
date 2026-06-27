import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { MarketServiceCard } from "@/components/services/MarketServiceCard";
import { SellServiceCTA } from "@/components/services/SellServiceCTA";
import { InstitutionalSafetyBanner } from "@/components/public/InstitutionalSafetyBanner";
import { Wrench, Loader2 } from "lucide-react";
import { CategoryFilterBar } from "@/components/ui/CategoryFilterBar";
import { resolveServiceTypeIcon, resolveServiceTypeLabel } from "@/lib/services/serviceCategories";

export default function PublicServicesHome() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cityFilter] = useState("all");

  const { data: rawServiceListings = [], isLoading } = useQuery<any[]>({
    queryKey: ["public-services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_service_listings" as any)
        .select("*")
        .order("published_at", { ascending: false });
      if (error) {
        console.error("[PublicServicesHome] public_service_listings query error:", error);
        return [];
      }
      const rows = (data as any[]) || [];
      if (rows.length === 0) return [];

      const ids = rows.map((s) => s.id);
      const { data: mediaRows } = await supabase
        .from("service_media" as any)
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

  /* Categorias com pelo menos 1 listing — nunca mostra vazia */
  const activeServiceCategories = useMemo(() => {
    const counts = new Map<string, number>();
    rawServiceListings.forEach((s) => {
      if (s.service_type) {
        counts.set(s.service_type, (counts.get(s.service_type) || 0) + 1);
      }
    });
    return Array.from(counts.entries())
      .map(([value, count]) => ({
        value,
        label: resolveServiceTypeLabel(value),
        count,
        Icon: resolveServiceTypeIcon(value),
      }))
      .sort((a, b) => b.count - a.count);
  }, [rawServiceListings]);

  const filteredServices = useMemo(() => {
    return rawServiceListings.filter((s) => {
      if (categoryFilter !== "all" && s.service_type !== categoryFilter) return false;
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
  }, [rawServiceListings, categoryFilter, cityFilter, search]);

  return (
    <MarketLayout
      search={search}
      setSearch={setSearch}
      showSearch={true}
      hideCart={true}
      headerRight={null}
      headerChildren={<MarketNavButtons />}
      blueFooter
      blueFooterLabel="🔧 Serviços"
      myAccountPath="/minha-conta"
    >
      <InstitutionalSafetyBanner />

      {/* ── CTA para anunciantes ── */}
      <div className="w-full px-4 lg:px-6 pb-4 pt-2">
        <div className="bg-sky-700 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
          <div className="text-white space-y-1">
            <p className="text-xs font-black uppercase tracking-widest text-sky-200">Para prestadores de serviço</p>
            <h3 className="text-xl font-black leading-tight">🔧 Ofereça seus serviços aqui!</h3>
            <p className="text-sm text-sky-100">Alcance clientes na sua região. Cadastro rápido e gratuito.</p>
          </div>
          <button
            onClick={() => navigate("/auth")}
            className="shrink-0 bg-[#F5E62B] hover:brightness-95 text-zinc-900 font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-all whitespace-nowrap"
          >
            Anunciar meu serviço →
          </button>
        </div>
      </div>

      <div className="w-full py-10 bg-[#F5E62B]">
        <div className="max-w-[1920px] mx-auto space-y-6">
          <div className="px-4 lg:px-6 flex flex-col items-center text-center gap-2">
            <div className="flex items-center gap-2 justify-center">
              <div className="p-2 bg-violet-600/10 rounded-lg">
                <Wrench className="w-5 h-5 text-violet-600" />
              </div>
              <span className="text-xs font-black text-violet-600 uppercase tracking-widest">Prestadores & Empresas</span>
            </div>
            <h1 className="text-4xl font-black text-zinc-900 tracking-tighter w-full text-center">
              SERVIÇOS <span className="text-orange-500">&</span> PROFISSIONAIS
            </h1>
            <p className="text-zinc-500 font-medium max-w-xl text-center">
              Encontre prestadores de serviço na sua região — fale direto com quem faz.
            </p>
          </div>

          {activeServiceCategories.length > 0 && (
            <div className="w-full bg-emerald-900 py-3 px-4 lg:px-6">
              <CategoryFilterBar
                categories={activeServiceCategories}
                activeValue={categoryFilter}
                onSelect={setCategoryFilter}
                totalCount={rawServiceListings.length}
                allLabel="Todos"
                allEmoji="🔧"
                variant="dark"
              />
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center gap-2 py-16 justify-center text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin" /> Carregando serviços...
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="text-center py-20 space-y-4 px-4">
              <div className="text-6xl">🔧</div>
              <h2 className="text-2xl font-black text-zinc-700">Nenhum serviço encontrado</h2>
              <p className="text-zinc-500">Seja o primeiro a anunciar aqui!</p>
            </div>
          ) : (
            <div className="px-4 lg:px-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredServices.map((s) => (
                  <MarketServiceCard key={s.id} service={s} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <section className="p-4">
        <SellServiceCTA variant="banner" />
      </section>
    </MarketLayout>
  );
}
