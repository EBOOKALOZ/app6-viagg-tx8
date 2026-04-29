import React, { useState, useMemo } from 'react';
import { SellRealEstateCTA } from '@/components/real-estate/SellRealEstateCTA';
import { ShieldCheck, Zap, Users, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MarketPropertyCard } from '@/components/real-estate/MarketPropertyCard';
import { getListingImageUrl } from '@/lib/real-estate/mediaUtils';
import { MarketLayout } from '@/components/layout/MarketLayout';
import { InstitutionalSafetyBanner } from '@/components/public/InstitutionalSafetyBanner';

export const PublicRealEstateHome = () => {
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [neighborhoodFilter, setNeighborhoodFilter] = useState<string>("all");
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<string>("all");

  const { data: rawPropertyListings = [], isLoading } = useQuery<any[]>({
    queryKey: ['public-real-estate-home-unified'],
    queryFn: async () => {

      // 1ª tentativa: view pública
      const { data: viewData, error: viewError } = await supabase
        .from('public_real_estate_listings' as any)
        .select('*')
        .order('created_at', { ascending: false });

      const source = (!viewError && viewData && viewData.length > 0)
        ? viewData
        : await (async () => {
            // 2ª tentativa: tabela direta
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
        const storagePath = media?.thumb_masked_storage_path || media?.original_storage_path;
        if (storagePath) thumbnailUrl = getListingImageUrl(storagePath);
        
        return { ...prop, thumbnail_url: thumbnailUrl };
      }));

      return propertiesWithMedia;
    },
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });


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

  const propertyTypes = useMemo(() => {
      const seen = new Map<string, string>();
      rawPropertyListings.forEach(v => {
          const raw = String(v.property_type || "").trim();
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
      if (propertyTypeFilter !== "all" && p.property_type?.trim().toLowerCase() !== propertyTypeFilter) return false;
      
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
    <MarketLayout search={search} setSearch={setSearch} hideCart={true} headerRight={null}>
      <InstitutionalSafetyBanner />
      <div className="min-h-screen">
        {/* Hero / Module Identity */}
        <section className="relative h-[480px] flex items-center justify-center overflow-hidden bg-zinc-950">
          <div className="absolute inset-0 opacity-40">
            <img 
              src="/images/cidade-sunset.jpg" 
              className="w-full h-full object-cover grayscale"
              alt="Background"
            />
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

        {/* Main Content Area */}
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
                    onClick={() => setSearch("")}
                  >
                    Limpar Filtros
                  </Button>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-amber-50/40 rounded-[40px] -z-10" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 p-6 md:p-10">
                  {propertyListings.map((prop) => (
                    <MarketPropertyCard key={prop.id} property={prop} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* The BIG CTA Banner */}
          <div className="animate-in zoom-in-95 duration-1000">
            <SellRealEstateCTA variant="banner" />
          </div>

          {/* Features / Why Viagg Real Estate */}
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
