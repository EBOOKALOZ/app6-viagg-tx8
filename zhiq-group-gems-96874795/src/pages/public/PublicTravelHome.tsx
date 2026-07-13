import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { MarketTravelCard } from "@/components/travel/MarketTravelCard";
import { HorizontalCarousel } from "@/components/ui/HorizontalCarousel";
import { TRAVEL_CATEGORIES } from "@/lib/viagem/travelCategories";
import { Plane, Loader2 } from "lucide-react";
import { InstitutionalSafetyBanner } from "@/components/public/InstitutionalSafetyBanner";
import { CategoryFilterBar } from "@/components/ui/CategoryFilterBar";

export default function PublicTravelHome() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data: listings = [], isLoading } = useQuery({
    queryKey: ["public-travel-home"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("travel_listings") as any)
        .select("id, title, category, destination, city, state, price_per_person, total_price, entry_price, is_featured, departure_date, duration_days, available_spots, visibility_status, published_at, created_at")
        .eq("visibility_status", "published")
        .order("is_featured", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) { console.warn("[travel-home]", error.message); return []; }
      const rows = (data as any[]) || [];
      if (rows.length === 0) return [];
      const ids = rows.map((r: any) => r.id);
      const { data: media } = await (supabase.from("travel_media") as any)
        .select("listing_id, original_storage_path, public_masked_storage_path, sort_order")
        .in("listing_id", ids)
        .order("sort_order", { ascending: true });
      const mediaMap = new Map<string, string>();
      for (const row of (media as any[]) || []) {
        if (!mediaMap.has(row.listing_id)) {
          const p = row.public_masked_storage_path || row.original_storage_path;
          if (p) mediaMap.set(row.listing_id, p.startsWith("http") ? p : supabase.storage.from("real-estate-original").getPublicUrl(p).data.publicUrl);
        }
      }
      return rows.map((r: any) => ({ ...r, thumbnail_url: mediaMap.get(r.id) || null }));
    },
    refetchOnWindowFocus: true,
  });

  /* Categorias com pelo menos 1 listing — nunca mostra vazia */
  const activeCategories = useMemo(() => {
    const counts = new Map<string, number>();
    listings.forEach((l: any) => {
      if (l.category) counts.set(l.category, (counts.get(l.category) || 0) + 1);
    });
    return TRAVEL_CATEGORIES
      .filter((c) => (counts.get(c.value) || 0) > 0)
      .map((c) => ({ value: c.value, label: c.label, emoji: c.emoji, count: counts.get(c.value) || 0 }));
  }, [listings]);

  const filtered = useMemo(() => {
    return (listings as any[]).filter((l: any) => {
      if (categoryFilter !== "all" && l.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!l.title?.toLowerCase().includes(q) && !l.destination?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [listings, categoryFilter, search]);

  return (
    <MarketLayout
      search={search}
      setSearch={setSearch}
      showSearch
      headerChildren={<MarketNavButtons />}
      mainClassName="flex flex-col bg-[#F5E62B]"
      hideFooter
      hideStoreNav
      myAccountPath="/viagens/minha-conta"
    >
      <InstitutionalSafetyBanner />

      <div className="w-full px-4 lg:px-6 pt-0 bg-[#F5E62B]">
        {/* CTA para agências */}
        <div className="pb-4 pt-2">
          <div className="bg-[#68c7f2] rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
            <div className="text-white space-y-1">
              <p className="text-xs font-black uppercase tracking-widest text-sky-200">Para agências e operadoras</p>
              <h3 className="text-xl font-black leading-tight">✈️ Anuncie sua viagem aqui!</h3>
              <p className="text-sm text-sky-100">Alcance viajantes na sua região. Cadastro rápido e gratuito.</p>
            </div>
            <button
              onClick={() => navigate("/auth?entry=advertiser")}
              className="shrink-0 bg-[#F5E62B] hover:brightness-95 text-zinc-900 font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-all whitespace-nowrap"
            >
              Anunciar minha viagem →
            </button>
          </div>
        </div>
      </div>

      <div className="w-full py-12 bg-[#F5E62B]">
        <div className="max-w-[1920px] mx-auto space-y-8">

          <div className="px-4 lg:px-6 flex flex-col items-center text-center gap-2">
            <div className="flex items-center gap-2 justify-center">
              <div className="p-2 bg-sky-600/10 rounded-lg">
                <Plane className="w-5 h-5 text-sky-600" />
              </div>
              <span className="text-xs font-black text-sky-600 uppercase tracking-widest">Pacotes & Destinos</span>
            </div>
            <h1 className="text-4xl font-black text-zinc-900 tracking-tighter w-full text-center">
              VIAGENS <span className="text-orange-500">&</span> TURISMO
            </h1>
            <p className="text-zinc-500 font-medium max-w-xl text-center">
              Pacotes completos, roteiros nacionais e internacionais — fale direto com a agência.
            </p>
          </div>

          {/* ── Faixa de categorias — fundo verde, edge-to-edge, nunca vazia ── */}
          {activeCategories.length > 0 && (
            <div className="-mx-0 w-full bg-emerald-900 py-3 px-4 lg:px-6">
              <CategoryFilterBar
                categories={activeCategories}
                activeValue={categoryFilter}
                onSelect={setCategoryFilter}
                totalCount={listings.length}
                allLabel="Todas"
                allEmoji="✈️"
                variant="dark"
              />
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center gap-2 py-16 justify-center text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin" /> Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 space-y-4 px-4">
              <div className="text-6xl">✈️</div>
              <h2 className="text-2xl font-black text-zinc-700">Nenhuma viagem encontrada</h2>
              <p className="text-zinc-500">Seja a primeira agência a anunciar aqui!</p>
              <button
                onClick={() => navigate("/auth?entry=advertiser")}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 rounded-xl"
              >
                Anunciar viagem
              </button>
            </div>
          ) : (
            <div className="px-4 lg:px-6">
              {categoryFilter !== "all" ? (
                /* Categoria selecionada → cards um abaixo do outro (lista
                   vertical centrada — posição idêntica em qualquer chip). */
                <div className="flex flex-col gap-4 w-[80vw] sm:w-80 mx-auto">
                  {filtered.map((tr: any) => (
                    <MarketTravelCard key={tr.id} travel={tr} />
                  ))}
                </div>
              ) : (
                /* Visão geral (Todas) → rolagem HORIZONTAL (mesmo carrossel
                   do /mercado), deslizando. */
                <HorizontalCarousel cardWidth="w-[80vw] sm:w-80">
                  {filtered.map((tr: any) => (
                    <MarketTravelCard key={tr.id} travel={tr} />
                  ))}
                </HorizontalCarousel>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer minimalista do módulo de Viagens */}
      <footer className="w-full bg-[#68c7f2] text-zinc-900 text-center py-1.5 text-xs font-medium space-y-0">
        <p className="flex items-center justify-center gap-1.5">
          <img src="/logo.png" alt="Viagg" className="h-8 w-auto object-contain rounded-lg shadow-sm mt-1" />
          Viagg-TX8™ · Viagens &amp; Turismo
        </p>
        <p className="text-zinc-900/70 text-[10px]">© 2026 Desenvolvido por VIAGG-TX8</p>
      </footer>
    </MarketLayout>
  );
}
