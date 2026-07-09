import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SellRealEstateCTA } from '@/components/real-estate/SellRealEstateCTA';
import { ShieldCheck, Zap, Users, Trees, Tractor, MapPin, Wheat, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CategoryFilterBar } from '@/components/ui/CategoryFilterBar';
import { HorizontalCarousel } from '@/components/ui/HorizontalCarousel';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MarketPropertyCard } from '@/components/real-estate/MarketPropertyCard';
import { getListingImageUrl } from '@/lib/real-estate/mediaUtils';
import { MarketLayout } from '@/components/layout/MarketLayout';
import { MarketNavButtons } from '@/components/layout/MarketNavButtons';
import { InstitutionalSafetyBanner } from '@/components/public/InstitutionalSafetyBanner';

// Tira acento + minúsculas, p/ casar "Sítio" com "sitio" etc.
const normType = (s: unknown) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

const PROPERTY_TYPE_META: Record<string, { label: string; Icon: LucideIcon }> = {
  sitio:   { label: "Sítios",   Icon: Trees },
  fazenda: { label: "Fazendas", Icon: Wheat },
  chacara: { label: "Chácaras", Icon: Tractor },
  lote:    { label: "Lotes",    Icon: MapPin },
  terreno: { label: "Terrenos", Icon: MapPin },
};

// Normaliza variações ("lote urbano" → "lote") usando includes, igual ao filtro.
const canonicalizeType = (raw: string): string => {
  const n = normType(raw);
  for (const key of Object.keys(PROPERTY_TYPE_META)) {
    if (n.includes(key)) return key;
  }
  return n;
};

export const PublicRealEstateHome = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [neighborhoodFilter, setNeighborhoodFilter] = useState<string>("all");
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<string>("all");

  const { data: rawPropertyListings = [], isLoading } = useQuery<any[]>({
    queryKey: ['public-real-estate-home-unified'],
    queryFn: async () => {
      const { data: viewData, error: viewError } = await supabase
        .from('public_real_estate_listings' as any)
        .select('*')
        .order('created_at', { ascending: false });

      const source = (!viewError && viewData && viewData.length > 0)
        ? viewData
        : await (async () => {
            const { data: raw } = await supabase
              .from('real_estate_listings' as any)
              .select('*')
              .in('visibility_status', ['published', 'approved', 'active'])
              .order('created_at', { ascending: false });
            return (raw || []).map((d: any) => ({
              ...d,
              public_address_label: d.public_address_label || (d.neighborhood
                ? `${d.neighborhood}, ${d.city}/${d.state}`
                : `${d.city}/${d.state}`),
              public_location: `${d.city}/${d.state}`,
            }));
          })();

      const propertiesWithMedia = await Promise.all((source as any[]).map(async (prop) => {
        const { data: media } = await supabase
          .from('real_estate_media' as any)
          .select('original_storage_path, thumb_masked_storage_path')
          .eq('listing_id', prop.id)
          .order('sort_order', { ascending: true })
          .limit(1)
          .maybeSingle();

        let thumbnailUrl = null;
        const hasThumb = !!media?.thumb_masked_storage_path;
        const storagePath = media?.thumb_masked_storage_path || media?.original_storage_path;
        if (storagePath) thumbnailUrl = getListingImageUrl(storagePath, hasThumb ? 'public' : 'original');

        return { ...prop, thumbnail_url: thumbnailUrl };
      }));

      return propertiesWithMedia;
    },
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  /* Tipos de imóvel com pelo menos 1 listing — nunca mostra vazio */
  const activePropertyTypes = useMemo(() => {
    const counts = new Map<string, number>();
    rawPropertyListings.forEach((p) => {
      if (!p.property_type) return;
      const key = canonicalizeType(p.property_type);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([key, count]) => {
        const meta = PROPERTY_TYPE_META[key];
        return {
          value: key,
          label: meta?.label ?? (key.charAt(0).toUpperCase() + key.slice(1)),
          count,
          Icon: meta?.Icon as LucideIcon | undefined,
        };
      })
      .filter(({ count }) => count > 0)
      .sort((a, b) => b.count - a.count);
  }, [rawPropertyListings]);

  const cities = useMemo(() => {
    const seen = new Map<string, string>();
    rawPropertyListings.forEach(v => {
      const raw = String(v.city || "").trim();
      if (!raw) return;
      const k = raw.toLowerCase();
      if (!seen.has(k)) seen.set(k, raw);
    });
    return Array.from(seen.entries())
      .map(([key, raw]) => ({ key, label: raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rawPropertyListings]);

  const neighborhoods = useMemo(() => {
    const seen = new Map<string, string>();
    rawPropertyListings.forEach(v => {
      const raw = String(v.neighborhood || "").trim();
      if (!raw) return;
      const k = raw.toLowerCase();
      if (!seen.has(k)) seen.set(k, raw);
    });
    return Array.from(seen.entries())
      .map(([key, raw]) => ({ key, label: raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rawPropertyListings]);

  const propertyListings = useMemo(() => {
    return rawPropertyListings.filter(p => {
      if (cityFilter !== "all" && p.city?.trim().toLowerCase() !== cityFilter) return false;
      if (neighborhoodFilter !== "all" && p.neighborhood?.trim().toLowerCase() !== neighborhoodFilter) return false;
      if (propertyTypeFilter !== "all" && !normType(p.property_type).includes(propertyTypeFilter)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          p.title?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q) ||
          p.city?.toLowerCase().includes(q) ||
          p.neighborhood?.toLowerCase().includes(q) ||
          p.property_type?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rawPropertyListings, search, cityFilter, neighborhoodFilter, propertyTypeFilter]);

  return (
    <MarketLayout search={search} setSearch={setSearch} hideCart={true} headerRight={null} headerChildren={<MarketNavButtons />} blueFooter blueFooterLabel="🏠 Imóveis" myAccountPath="/minha-conta">
      <InstitutionalSafetyBanner />

      {/* ── CTA para anunciantes ── */}
      <div className="w-full px-4 lg:px-6 pb-4 pt-2">
        <div className="bg-sky-700 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
          <div className="text-white space-y-1">
            <p className="text-xs font-black uppercase tracking-widest text-sky-200">Para proprietários e corretores</p>
            <h3 className="text-xl font-black leading-tight">🏠 Anuncie seu imóvel aqui!</h3>
            <p className="text-sm text-sky-100">Alcance compradores e inquilinos na sua região. Cadastro rápido e gratuito.</p>
          </div>
          <button
            onClick={() => navigate("/auth")}
            className="shrink-0 bg-[#F5E62B] hover:brightness-95 text-zinc-900 font-black text-sm px-6 py-3 rounded-2xl shadow-lg transition-all whitespace-nowrap"
          >
            Anunciar meu imóvel →
          </button>
        </div>
      </div>

      <div className="min-h-screen">
        {/* Hero */}
        <section className="relative h-[480px] flex items-center justify-center overflow-hidden bg-zinc-950">
          <div className="absolute inset-0 opacity-40">
            <img src="/images/cidade-sunset.jpg" className="w-full h-full object-cover grayscale" alt="Background" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent z-0" />
          <div className="container relative z-10 px-4 text-center space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/20 border border-primary/30 text-primary text-xs font-black uppercase tracking-widest backdrop-blur-md">
              <ShieldCheck className="w-4 h-4" />
              Módulo Imobiliário Oficial
            </div>
            <div className="space-y-4">
              <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-white leading-none">
                ENCONTRE SEU <span className="text-primary italic">REFÚGIO</span> LOCAL
              </h1>
              <p className="text-xl text-zinc-400 font-medium max-w-2xl mx-auto tracking-tight">
                Chácaras, sítios, lotes e fazendas. <br/>
                Negociação direta com segurança e privacidade total.
              </p>
            </div>
          </div>
        </section>

        {/* ── Faixa de categorias — verde escuro, edge-to-edge, nunca vazia ── */}
        {activePropertyTypes.length > 0 && (
          <div className="w-full bg-emerald-900 py-3 px-4 lg:px-6">
            <CategoryFilterBar
              categories={activePropertyTypes}
              activeValue={propertyTypeFilter}
              onSelect={setPropertyTypeFilter}
              totalCount={rawPropertyListings.length}
              allLabel="Todos"
              allEmoji="🏠"
              variant="dark"
            />
          </div>
        )}

        {/* Main Content */}
        <main className="container px-4 py-20 space-y-32">

          {/* Listings Grid */}
          <div className="space-y-12">
            <div className="flex flex-col gap-3 items-center text-center">
              <h3 className="text-4xl font-black tracking-tighter uppercase">Vitrine de Oportunidades</h3>
              <div className="h-1.5 w-24 bg-primary rounded-full" />
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="aspect-[4/3] bg-zinc-900 animate-pulse rounded-[32px] border border-white/5 flex items-center justify-center text-zinc-500 italic text-sm">
                    Sincronizando Sentinela...
                  </div>
                ))}
              </div>
            ) : propertyListings.length === 0 ? (
              <div className="py-32 text-center bg-zinc-900/40 rounded-[40px] border-2 border-dashed border-zinc-800">
                <p className="text-zinc-500 font-bold text-lg">Nenhum imóvel encontrado para esta busca.</p>
                <Button
                  variant="link"
                  className="text-primary font-black uppercase tracking-widest mt-4"
                  onClick={() => { setSearch(""); setPropertyTypeFilter("all"); }}
                >
                  Limpar Filtros
                </Button>
              </div>
            ) : (
              <div className="relative w-screen left-1/2 -translate-x-1/2">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-amber-50/40 -z-10" />
                <div className="px-4 md:px-8 py-6 md:py-10">
                  {propertyTypeFilter !== "all" ? (
                    /* Categoria selecionada → um card abaixo do outro (posição fixa). */
                    <div className="flex flex-col gap-4 w-[80vw] sm:w-80 mx-auto">
                      {propertyListings.map((prop) => (
                        <MarketPropertyCard key={prop.id} property={prop} />
                      ))}
                    </div>
                  ) : (
                    /* Visão geral → rolagem horizontal deslizando (padrão /viagens). */
                    <HorizontalCarousel cardWidth="w-[80vw] sm:w-80">
                      {propertyListings.map((prop) => (
                        <MarketPropertyCard key={prop.id} property={prop} />
                      ))}
                    </HorizontalCarousel>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* CTA Banner */}
          <div className="animate-in zoom-in-95 duration-1000">
            <SellRealEstateCTA variant="banner" />
          </div>

          {/* Features */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-16 py-10">
            <div className="space-y-6 group">
              <div className="w-16 h-16 rounded-3xl bg-primary shadow-xl shadow-primary/20 flex items-center justify-center transition-transform group-hover:scale-110 group-hover:rotate-3">
                <ShieldCheck className="w-8 h-8 text-black" />
              </div>
              <div className="space-y-2">
                <h4 className="text-2xl font-black tracking-tight uppercase">Contato Protegido</h4>
                <p className="text-zinc-500 font-medium leading-relaxed">
                  Seu telefone e e-mail nunca são expostos. Nós gerenciamos os interessados via plataforma segura e anônima.
                </p>
              </div>
            </div>
            <div className="space-y-6 group">
              <div className="w-16 h-16 rounded-3xl bg-blue-500 shadow-xl shadow-blue-500/20 flex items-center justify-center transition-transform group-hover:scale-110 group-hover:-rotate-3">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <div className="space-y-2">
                <h4 className="text-2xl font-black tracking-tight uppercase">IA Sentinela Visual</h4>
                <p className="text-zinc-500 font-medium leading-relaxed">
                  Nossa IA inspeciona cada foto para garantir imagens limpas e profissionais, removendo poluições visuais e contatos.
                </p>
              </div>
            </div>
            <div className="space-y-6 group">
              <div className="w-16 h-16 rounded-3xl bg-emerald-500 shadow-xl shadow-emerald-500/20 flex items-center justify-center transition-transform group-hover:scale-110 group-hover:rotate-3">
                <Users className="w-8 h-8 text-white" />
              </div>
              <div className="space-y-2">
                <h4 className="text-2xl font-black tracking-tight uppercase">Leads Qualificados</h4>
                <p className="text-zinc-500 font-medium leading-relaxed">
                  Focamos em compradores reais da região, conectando você a quem realmente tem interesse e poder de compra local.
                </p>
              </div>
            </div>
          </section>

        </main>
      </div>
    </MarketLayout>
  );
};

export default PublicRealEstateHome;
