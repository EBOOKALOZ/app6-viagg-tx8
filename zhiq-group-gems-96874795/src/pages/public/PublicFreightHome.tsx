import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
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

type SortKey = "recent" | "featured";

export default function PublicFreightHome() {
  const [searchParams, setSearchParams] = useSearchParams();
  const subcategoria = searchParams.get("subcategoria");
  const [search, setSearch] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [cityFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("recent");

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
      const withThumbs = rows.map((s) => ({ ...s, thumbnail_url: mediaMap.get(s.id) || null }));
      // DIVULGAÇÃO: anúncios PROMOVIDOS (pacotes Bronze→Diamante) aparecem
      // primeiro. Sort estável client-side — preserva featured/recentes dentro
      // de cada grupo e não quebra se a coluna ainda não existir no banco.
      const promoted = (s: any) =>
        s.is_promoted && (!s.promoted_until || new Date(s.promoted_until).getTime() > Date.now()) ? 1 : 0;
      withThumbs.sort((a, b) => promoted(b) - promoted(a));
      return withThumbs;
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

  /* Base: subcategoria + busca (usado pelas vitrines e pela listagem) */
  const baseFiltered = useMemo(() => {
    return rawFreightListings.filter((s) => {
      if (subcategoria) {
        if (subcategoria === "Fretes") {
          if (s.subcategoria && s.subcategoria !== "Fretes") return false;
        } else if (subcategoria === "Mudanças") {
          if (s.subcategoria && s.subcategoria !== "Mudanças") {
            const t = `${s.title || ''} ${s.description || ''}`.toLowerCase();
            if (!t.includes("mudanç") && !t.includes("carreto")) return false;
          }
        } else if (s.subcategoria && s.subcategoria !== subcategoria) {
          return false;
        }
      }
      if (cityFilter !== "all" && s.city?.trim().toLowerCase() !== cityFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        // Busca inteligente: título, empresa, cidade, estado, bairro,
        // tipo de veículo, tipo de serviço (subcategoria) e rotas de cobertura.
        const haystack = [
          s.title, s.city, s.state, s.neighborhood, s.subcategoria,
          s.vehicle_type, s.coverage_routes, s.public_address_label,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [rawFreightListings, cityFilter, search, subcategoria]);

  /* Listagem principal = base + chip de veículo + ordenação */
  const filteredFreight = useMemo(() => {
    let out = baseFiltered.filter((s) => vehicleFilter === "all" || s.vehicle_type === vehicleFilter);
    if (sort === "featured") {
      out = [...out].sort((a, b) => Number(!!b.is_featured) - Number(!!a.is_featured));
    }
    // "recent" mantém a ordem do banco (is_featured desc, published_at desc)
    return out;
  }, [baseFiltered, vehicleFilter, sort]);

  /* ── VITRINES por DADOS reais — só na visão "Todos" (sem chip/busca) ── */
  const showShelves = vehicleFilter === "all" && !search.trim();
  const shelves = useMemo(() => {
    if (!showShelves) return [] as Array<{ key: string; title: string; items: any[] }>;
    const out: Array<{ key: string; title: string; items: any[] }> = [];

    // ⭐ EMPRESAS PREMIUM — GATE de dados: só aparece se existir o sinal de
    // premium no banco (is_premium). O campo ainda NÃO existe → hoje fica
    // oculta automaticamente; pronta p/ ativar sem tocar no código.
    const premium = baseFiltered.filter((s) => s.is_premium === true);
    if (premium.length) out.push({ key: "premium", title: "⭐ Empresas Premium", items: premium });

    // 📍 PRÓXIMOS DE VOCÊ — GATE: precisa de geolocalização (lat/lng no
    // anúncio). Campos ainda não existem → seção oculta automaticamente.
    const geoReady = baseFiltered.filter((s) => s.latitude != null && s.longitude != null);
    if (geoReady.length >= 3) {
      // (ordenação por distância entra quando houver a posição do usuário)
      out.push({ key: "proximos", title: "📍 Próximos de Você", items: geoReady.slice(0, 12) });
    }

    // 🔥 MAIS PROCURADOS — GATE: usa métricas reais (views/contatos/interesses).
    // Nenhuma existe hoje → oculta. Pronta p/ ativar quando o backend expuser.
    const metric = (s: any) => Number(s.views_count ?? s.contact_count ?? s.interest_count ?? NaN);
    const withMetric = baseFiltered.filter((s) => Number.isFinite(metric(s)));
    if (withMetric.length >= 3) {
      const top = [...withMetric].sort((a, b) => metric(b) - metric(a)).slice(0, 12);
      out.push({ key: "mais_procurados", title: "🔥 Mais Procurados", items: top });
    }

    // 🚛 FRETES EM DESTAQUE (dado real: is_featured)
    const featured = baseFiltered.filter((s) => s.is_featured);
    if (featured.length) out.push({ key: "destaque", title: "🚛 Fretes em Destaque", items: featured });

    // 🆕 NOVOS ANÚNCIOS (dado real: published_at)
    const novos = [...baseFiltered]
      .sort((a, b) => new Date(b.published_at || b.created_at || 0).getTime() - new Date(a.published_at || a.created_at || 0).getTime())
      .slice(0, 12);
    if (novos.length >= 3) out.push({ key: "novos", title: "🆕 Novos Anúncios", items: novos });

    // Uma vitrine por tipo de veículo com anúncios (dado real: vehicle_type)
    for (const { type } of activeVehicleTypes) {
      const items = baseFiltered.filter((s) => s.vehicle_type === type.value);
      if (items.length >= 3) out.push({ key: `veh_${type.value}`, title: `🚚 ${type.label}`, items });
    }
    return out;
  }, [showShelves, baseFiltered, activeVehicleTypes]);

  // ── Indicadores institucionais do hero (SÓ dados reais; oculta se 0) ──
  const heroStats = useMemo(() => {
    const total = rawFreightListings.length;
    const cidades = new Set(rawFreightListings.map((s) => (s.city || "").trim().toLowerCase()).filter(Boolean)).size;
    const tipos = new Set(rawFreightListings.map((s) => s.vehicle_type).filter(Boolean)).size;
    return [
      { label: "Anúncios disponíveis", value: total },
      { label: "Cidades atendidas", value: cidades },
      { label: "Tipos de serviço", value: tipos },
    ].filter((s) => s.value > 0);
  }, [rawFreightListings]);

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

      {/* ─── 1. HERO PREMIUM (sem botão de anunciar) ─── */}
      <div className="w-full px-4 lg:px-6 pt-6 bg-institutional-yellow">
        <div className="max-w-[1920px] mx-auto flex flex-col items-center text-center gap-2">
          <div className="flex items-center gap-2 justify-center">
            <div className="p-2 bg-blue-600/10 rounded-lg">
              <Truck className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-xs font-black text-blue-600 uppercase tracking-widest">Transportadoras & Autônomos</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-zinc-900 tracking-tighter">Fretes &amp; Mudanças</h1>
          <p className="text-zinc-600 font-medium max-w-xl">
            Encontre empresas, caminhoneiros e profissionais para fretes, mudanças e transporte de cargas em todo o Brasil.
          </p>

          {/* Indicadores institucionais — só dados reais; some se 0 */}
          {heroStats.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
              {heroStats.map((s) => (
                <div key={s.label} className="flex items-baseline gap-1.5 rounded-full bg-white/70 border border-black/5 px-3 py-1 shadow-sm">
                  <span className="text-sm font-black text-zinc-900 tabular-nums">{s.value}</span>
                  <span className="text-[11px] font-bold text-zinc-500">{s.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* MODALIDADES: Encontrar um Frete (vitrine atual) × Solicitar Cotações (novo) */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-2 w-full max-w-2xl">
            <a
              href="#anuncios-fretes"
              className="flex-1 min-w-[220px] flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-emerald-500 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-500/25 hover:bg-emerald-600 transition-all"
            >
              🟢 Encontrar um Frete
            </a>
            <Link
              to="/fretes/solicitar"
              className="flex-1 min-w-[220px] flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-[#FF7A00] text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-[#FF7A00]/25 hover:bg-[#E65C00] transition-all"
            >
              🟠 Solicitar Cotações
            </Link>
            <Link
              to="/fretes/minhas-solicitacoes"
              className="w-full sm:w-auto text-[11px] font-black uppercase tracking-wider text-zinc-600 underline underline-offset-4 hover:text-[#FF7A00] py-1"
            >
              📋 Minhas solicitações e propostas
            </Link>
          </div>

          {/* Filtros rápidos: modalidade */}
          <div className="flex bg-white/70 p-1 rounded-xl border border-black/5 shadow-sm mt-1">
            <button
              onClick={() => setSearchParams({})}
              className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${!subcategoria ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}
            >Todos</button>
            <button
              onClick={() => setSearchParams({ subcategoria: "Fretes" })}
              className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1 ${subcategoria === "Fretes" ? "bg-[#FF7A00] text-white shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}
            >🚚 Fretes</button>
            <button
              onClick={() => setSearchParams({ subcategoria: "Mudanças" })}
              className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1 ${subcategoria === "Mudanças" ? "bg-[#00C58E] text-white shadow-sm" : "text-zinc-600 hover:text-zinc-900"}`}
            >📦 Mudanças</button>
          </div>
        </div>
      </div>

      {/* Widget de triagem (orçamento rápido) — logo abaixo do hero */}
      <div className="w-full px-4 lg:px-6 pt-4 bg-institutional-yellow">
        <div className="max-w-4xl mx-auto">
          <FreightTriageWidget />
        </div>
      </div>

      {/* Faixa de tipos de veículo (chips) — nunca vazia */}
      {activeVehicleTypes.length > 0 && (
        <div id="anuncios-fretes" className="w-full bg-emerald-900 py-3 px-4 lg:px-6 mt-6 scroll-mt-24">
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
        <div className="flex items-center gap-2 py-16 justify-center text-zinc-500">
          <Loader2 className="w-6 h-6 animate-spin" /> Carregando fretes...
        </div>
      ) : rawFreightListings.length === 0 ? (
        <div className="text-center py-20 space-y-3 px-4">
          <div className="text-6xl">🚚</div>
          <h2 className="text-2xl font-black text-zinc-700">Nenhum frete publicado ainda</h2>
          <p className="text-zinc-500">Volte em breve — novos transportadores chegam toda semana.</p>
        </div>
      ) : (
        <div className="w-full py-8 bg-institutional-yellow">
          <div className="max-w-[1920px] mx-auto space-y-10">

            {/* ─── 2. VITRINES DE DESTAQUE (só na visão "Todos") ─── */}
            {shelves.map((shelf) => (
              <section key={shelf.key} className="space-y-3">
                <h2 className="px-4 lg:px-6 text-lg font-black text-zinc-900 tracking-tight">{shelf.title}</h2>
                <div className="px-4 lg:px-6">
                  <HorizontalCarousel>
                    {shelf.items.map((s: any) => (
                      <MarketFreightCard key={`${shelf.key}-${s.id}`} freight={s} />
                    ))}
                  </HorizontalCarousel>
                </div>
              </section>
            ))}

            {/* ─── 3. LISTAGEM PRINCIPAL ─── */}
            <section className="space-y-3">
              <div className="px-4 lg:px-6 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-black text-zinc-900 tracking-tight">
                  {vehicleFilter === "all"
                    ? "Todos os fretes"
                    : `🚚 ${FREIGHT_VEHICLE_TYPES.find((v) => v.value === vehicleFilter)?.label ?? "Veículo"}`}
                  <span className="ml-2 text-sm font-bold text-zinc-500">({filteredFreight.length})</span>
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-zinc-500">Ordenar:</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortKey)}
                    className="text-xs font-bold text-zinc-800 bg-white border border-black/10 rounded-lg px-2.5 py-1.5 shadow-sm cursor-pointer"
                  >
                    <option value="recent">Mais recentes</option>
                    <option value="featured">Em destaque primeiro</option>
                  </select>
                </div>
              </div>

              {filteredFreight.length === 0 ? (
                <p className="px-4 lg:px-6 text-zinc-600 py-8 text-center">Nenhum frete encontrado com esses filtros.</p>
              ) : (
                <div className="px-4 lg:px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 justify-items-center">
                  {filteredFreight.map((s) => (
                    <MarketFreightCard key={s.id} freight={s} />
                  ))}
                </div>
              )}
            </section>

          </div>
        </div>
      )}

      {/* ─── 6. ÁREA DO ANUNCIANTE — SÓ NO FINAL ─── */}
      <section className="p-4">
        <SellFreightCTA variant="banner" />
      </section>
    </MarketLayout>
  );
}
