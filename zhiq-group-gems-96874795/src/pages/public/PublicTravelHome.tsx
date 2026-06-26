import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { MarketTravelCard } from "@/components/travel/MarketTravelCard";
import { TRAVEL_CATEGORIES } from "@/lib/viagem/travelCategories";
import { Plane, Loader2 } from "lucide-react";
import { HorizontalCarousel } from "@/components/ui/HorizontalCarousel";
import { InstitutionalSafetyBanner } from "@/components/public/InstitutionalSafetyBanner";

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

  const filtered = listings.filter((l: any) => {
    if (categoryFilter !== "all" && l.category !== categoryFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!l.title?.toLowerCase().includes(q) && !l.destination?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

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
      <div className="w-full px-4 lg:px-6 pt-0 bg-yellow-400">
        <InstitutionalSafetyBanner />

        {/* CTA para agências */}
        <div className="pb-4 pt-2">
          <div className="bg-sky-700 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
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

      <div className="w-full px-4 lg:px-6 py-12 bg-yellow-400">
        <div className="max-w-[1920px] mx-auto space-y-8">

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-sky-600/10 rounded-lg">
                <Plane className="w-5 h-5 text-sky-600" />
              </div>
              <span className="text-xs font-black text-sky-600 uppercase tracking-widest">Pacotes & Destinos</span>
            </div>
            <h1 className="text-4xl font-black text-zinc-900 tracking-tighter">VIAGENS & TURISMO</h1>
            <p className="text-zinc-500 font-medium max-w-xl">Pacotes completos, roteiros nacionais e internacionais — fale direto com a agencia.</p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden scroll-smooth -mx-4 px-4">
            <button
              onClick={() => setCategoryFilter("all")}
              className={`flex-none px-4 py-2 rounded-xl font-bold text-sm transition-all ${categoryFilter === "all" ? "bg-orange-500 text-white" : "bg-white text-zinc-600 border border-zinc-200 hover:border-orange-300"}`}
            >
              Todas
            </button>
            {TRAVEL_CATEGORIES.map(c => (
              <button
                key={c.value}
                onClick={() => setCategoryFilter(c.value)}
                className={`flex-none px-4 py-2 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${categoryFilter === c.value ? "bg-orange-500 text-white" : "bg-white text-zinc-600 border border-zinc-200 hover:border-orange-300"}`}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-16 justify-center text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin" /> Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 space-y-4">
              <div className="text-6xl">✈️</div>
              <h2 className="text-2xl font-black text-zinc-700">Nenhuma viagem encontrada</h2>
              <p className="text-zinc-500">Seja a primeira agencia a anunciar aqui!</p>
              <button onClick={() => navigate("/auth?entry=advertiser")} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 rounded-xl">
                Anunciar viagem
              </button>
            </div>
          ) : (
            <HorizontalCarousel gap="gap-4" snap cardWidth="w-[calc(100vw-2rem)] sm:w-80">
              {filtered.map((tr: any) => (
                <MarketTravelCard key={tr.id} travel={tr} />
              ))}
            </HorizontalCarousel>
          )}
        </div>
      </div>

      <footer className="w-full bg-sky-700 text-white text-center py-3 text-xs font-medium space-y-1">
        <p>✈️ Viagg-TX8™ · Viagens &amp; Turismo · viagg-tx8.com</p>
        <p className="text-white/70 text-[10px]">© 2026 Desenvolvido por VIAGG-TX8</p>
      </footer>
    </MarketLayout>
  );
}
