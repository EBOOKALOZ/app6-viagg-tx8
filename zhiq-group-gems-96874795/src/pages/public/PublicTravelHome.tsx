import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MarketLayout } from "@/components/layout/MarketLayout";
import { MarketNavButtons } from "@/components/layout/MarketNavButtons";
import { MarketTravelCard } from "@/components/travel/MarketTravelCard";
import { HorizontalCarousel } from "@/components/ui/HorizontalCarousel";
import { TRAVEL_CATEGORIES, resolveTravelCategoryEmoji } from "@/lib/viagem/travelCategories";
import { Plane, Loader2 } from "lucide-react";
import { InstitutionalSafetyBanner } from "@/components/public/InstitutionalSafetyBanner";
import { CategoryFilterBar } from "@/components/ui/CategoryFilterBar";
import { AdvertiserCtaBanner } from "@/components/public/AdvertiserCtaBanner";

type SortKey = "recent" | "price_asc" | "price_desc";

/** preço "de vitrine" de um anúncio (o menor valor cheio disponível) */
function listingPrice(l: any): number {
  const cands = [l.price_per_person, l.total_price, l.entry_price]
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  return cands.length ? Math.min(...cands) : Number.POSITIVE_INFINITY;
}

export default function PublicTravelHome() {
  const [searchParams, setSearchParams] = useSearchParams();
  const subcategoria = searchParams.get("subcategoria");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("recent");

  const { data: listings = [], isLoading } = useQuery({
    queryKey: ["public-travel-home"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("travel_listings") as any)
        .select("id, title, subcategoria, category, destination, city, state, price_per_person, total_price, entry_price, is_featured, departure_date, duration_days, available_spots, visibility_status, published_at, created_at")
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

  /* Filtro base (subcategoria + busca) — usado pelas vitrines e pela listagem */
  const baseFiltered = useMemo(() => {
    return (listings as any[]).filter((l: any) => {
      if (subcategoria) {
        if (subcategoria === "Viagens") {
          if (l.subcategoria && l.subcategoria !== "Viagens") return false;
        } else if (subcategoria === "Turismo") {
          if (l.subcategoria && l.subcategoria !== "Turismo") {
            const t = `${l.title || ''} ${l.destination || ''}`.toLowerCase();
            if (!t.includes("passeio") && !t.includes("turismo")) return false;
          }
        } else if (l.subcategoria && l.subcategoria !== subcategoria) {
          return false;
        }
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!l.title?.toLowerCase().includes(q) && !l.destination?.toLowerCase().includes(q) && !l.subcategoria?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [listings, search, subcategoria]);

  /* Listagem principal = base + chip de categoria + ordenação */
  const filtered = useMemo(() => {
    let out = baseFiltered.filter((l: any) => categoryFilter === "all" || l.category === categoryFilter);
    if (sort === "price_asc") out = [...out].sort((a, b) => listingPrice(a) - listingPrice(b));
    else if (sort === "price_desc") out = [...out].sort((a, b) => listingPrice(b) - listingPrice(a));
    // "recent" mantém a ordem do banco (is_featured desc, created_at desc)
    return out;
  }, [baseFiltered, categoryFilter, sort]);

  /* ── VITRINES DE DESTAQUE — geradas por DADOS reais, nunca seção vazia ──
     Só aparecem na visão "Todas" (sem chip de categoria e sem busca ativa),
     para não competir com a listagem filtrada. */
  const showShelves = categoryFilter === "all" && !search.trim();
  const shelves = useMemo(() => {
    if (!showShelves) return [] as Array<{ key: string; title: string; items: any[] }>;
    const out: Array<{ key: string; title: string; items: any[] }> = [];

    const featured = baseFiltered.filter((l: any) => l.is_featured);
    if (featured.length) out.push({ key: "destaque", title: "🏖 Pacotes em Destaque", items: featured });

    // Última Hora: com data de partida futura, mais próximas primeiro
    const now = Date.now();
    const lastMinute = baseFiltered
      .filter((l: any) => l.departure_date && new Date(l.departure_date).getTime() > now)
      .sort((a: any, b: any) => new Date(a.departure_date).getTime() - new Date(b.departure_date).getTime())
      .slice(0, 12);
    if (lastMinute.length >= 3) out.push({ key: "ultima_hora", title: "✈️ Última Hora", items: lastMinute });

    // Uma vitrine por categoria que tem anúncios (usa emoji real da categoria)
    for (const c of activeCategories) {
      const items = baseFiltered.filter((l: any) => l.category === c.value);
      if (items.length >= 3) {
        out.push({ key: `cat_${c.value}`, title: `${c.emoji} ${c.label}`, items });
      }
    }
    return out;
  }, [showShelves, baseFiltered, activeCategories]);

  return (
    <MarketLayout
      search={search}
      setSearch={setSearch}
      showSearch
      headerChildren={<MarketNavButtons />}
      mainClassName="flex flex-col bg-[#F5E62B]"
      blueFooter
      blueFooterLabel="Viagens & Turismo"
      hideStoreNav
      myAccountPath="/viagens/minha-conta"
    >
      <InstitutionalSafetyBanner />

      {/* ─── 1. HERO ENXUTO (sem botão de anunciar) ─── */}
      <div className="w-full px-4 lg:px-6 pt-6 bg-[#F5E62B]">
        <div className="max-w-[1920px] mx-auto flex flex-col items-center text-center gap-2">
          <div className="flex items-center gap-2 justify-center">
            <div className="p-2 bg-sky-600/10 rounded-lg">
              <Plane className="w-5 h-5 text-sky-600" />
            </div>
            <span className="text-xs font-black text-sky-600 uppercase tracking-widest">Pacotes & Destinos</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-zinc-900 tracking-tighter">Viagens e Turismo</h1>
          <p className="text-zinc-600 font-medium max-w-xl">
            Encontre pacotes, excursões, hotéis e experiências em todo o Brasil e no exterior.
          </p>

          {/* Filtros rápidos: modalidade */}
          <div className="flex bg-white/70 p-1 rounded-xl border border-black/5 shadow-sm mt-1">
            <button
              onClick={() => setSearchParams({})}
              className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${!subcategoria ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}
            >Todos</button>
            <button
              onClick={() => setSearchParams({ subcategoria: "Viagens" })}
              className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1 ${subcategoria === "Viagens" ? "bg-[#FF7A00] text-white shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}
            >✈️ Viagens</button>
            <button
              onClick={() => setSearchParams({ subcategoria: "Turismo" })}
              className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1 ${subcategoria === "Turismo" ? "bg-[#00C58E] text-white shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}
            >🏖️ Turismo</button>
          </div>
        </div>
      </div>

      {/* Faixa de categorias (chips) — nunca vazia */}
      {activeCategories.length > 0 && (
        <div className="w-full bg-emerald-900 py-3 px-4 lg:px-6 mt-6">
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
        <div className="flex items-center gap-2 py-16 justify-center text-zinc-500">
          <Loader2 className="w-6 h-6 animate-spin" /> Carregando...
        </div>
      ) : listings.length === 0 ? (
        <div className="text-center py-20 space-y-3 px-4">
          <div className="text-6xl">✈️</div>
          <h2 className="text-2xl font-black text-zinc-700">Nenhuma viagem publicada ainda</h2>
          <p className="text-zinc-500">Volte em breve — novas ofertas chegam toda semana.</p>
        </div>
      ) : (
        <div className="w-full py-8 bg-[#F5E62B]">
          <div className="max-w-[1920px] mx-auto space-y-10">

            {/* ─── 2. VITRINES DE DESTAQUE (só na visão "Todas") ─── */}
            {shelves.map((shelf) => (
              <section key={shelf.key} className="space-y-3">
                <h2 className="px-4 lg:px-6 text-lg font-black text-zinc-900 tracking-tight">{shelf.title}</h2>
                <div className="px-4 lg:px-6">
                  <HorizontalCarousel>
                    {shelf.items.map((tr: any) => (
                      <MarketTravelCard key={`${shelf.key}-${tr.id}`} travel={tr} />
                    ))}
                  </HorizontalCarousel>
                </div>
              </section>
            ))}

            {/* ─── 3. LISTAGEM PRINCIPAL ─── */}
            <section className="space-y-3">
              <div className="px-4 lg:px-6 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-black text-zinc-900 tracking-tight">
                  {categoryFilter === "all"
                    ? "Todas as viagens"
                    : `${resolveTravelCategoryEmoji(categoryFilter)} ${activeCategories.find((c) => c.value === categoryFilter)?.label ?? "Categoria"}`}
                  <span className="ml-2 text-sm font-bold text-zinc-500">({filtered.length})</span>
                </h2>
                {/* Ordenação */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-zinc-500">Ordenar:</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                    className="text-xs font-bold text-zinc-800 bg-white border border-black/10 rounded-lg px-2.5 py-1.5 shadow-sm cursor-pointer"
                  >
                    <option value="recent">Mais recentes</option>
                    <option value="price_asc">Menor preço</option>
                    <option value="price_desc">Maior preço</option>
                  </select>
                </div>
              </div>

              {filtered.length === 0 ? (
                <p className="px-4 lg:px-6 text-zinc-600 py-8 text-center">Nenhuma viagem encontrada com esses filtros.</p>
              ) : (
                <div className="px-4 lg:px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 justify-items-center">
                  {filtered.map((tr: any) => (
                    <MarketTravelCard key={tr.id} travel={tr} />
                  ))}
                </div>
              )}
            </section>

          </div>
        </div>
      )}

      {/* ─── 6. CTA DE ANUNCIANTE — SÓ NO FINAL, depois dos anúncios ─── */}
      <AdvertiserCtaBanner
        eyebrow="Para agências e operadoras"
        title="Sua agência ainda não anuncia na Viagg-TX8?"
        subtitle="Cadastre seus pacotes, excursões e promoções e alcance milhares de turistas interessados."
        buttonLabel="Anunciar Pacote"
      />

    </MarketLayout>
  );
}
