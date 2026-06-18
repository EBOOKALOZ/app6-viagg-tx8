import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Maximize2, BedDouble, Bath, MapPin,
  ChevronLeft, Share2, ShieldCheck,
  Loader2, Info, Tag, Home, CheckCircle2, Sparkles
} from 'lucide-react';
import { getListingImageUrl } from '@/lib/real-estate/mediaUtils';
import { cn, formatCurrencyBRL } from '@/lib/utils';
import { toast } from 'sonner';
import { ContactIntentionModal } from '@/components/listings/ContactIntentionModal';
import { getVisitorFingerprint } from '@/lib/cpcTracker';
import { MarketLayout } from '@/components/layout/MarketLayout';
import { StoreHeader } from '@/components/public/store/StoreHeader';

export const RealEstateDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [intentionModal, setIntentionModal] = useState<{ open: boolean; interestType: 'whatsapp_click' | 'message_request' }>({ open: false, interestType: 'message_request' });

  // ─── QUERY: Listing Principal ─────────────────────────────────────────────
  const { data: property, isLoading: isPropertyLoading, error: propertyError } = useQuery({
    queryKey: ['public-real-estate-detail', id],
    queryFn: async () => {
      const { data: viewData, error: viewError } = await supabase
        .from('public_real_estate_listings' as any)
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (!viewError && viewData) {
        return viewData;
      }

      const { data: rawData, error: rawError } = await supabase
        .from('real_estate_listings' as any)
        .select('*')
        .eq('id', id)
        .in('visibility_status', ['published', 'approved', 'active'])
        .maybeSingle();

      if (rawError) throw rawError;

      if (rawData) {
        const d = rawData as any;
        if (!d.public_address_label) {
          d.public_address_label = d.neighborhood
            ? `${d.neighborhood}, ${d.city}/${d.state}`
            : `${d.city}/${d.state}`;
        }
        if (!d.public_location) {
          d.public_location = `${d.city}/${d.state}`;
        }
      }

      return rawData;
    },
    enabled: !!id,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  // ─── Cobrança por CLIQUE no anúncio (6 cr do dono, anti-spam no backend) ──
  const clickChargedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!id || !property) return;
    if (clickChargedRef.current === id) return; // 1x por carga deste anúncio
    clickChargedRef.current = id;
    (async () => {
      try {
        const fp = await getVisitorFingerprint();
        await supabase.rpc('charge_real_estate_listing_click' as any, { p_listing_id: id, p_fingerprint: fp });
      } catch { /* best-effort: nunca bloqueia a visualização */ }
    })();
  }, [id, property]);

  // ─── QUERY: Mídias ───────────────────────────────────────────────────────
  const { data: media = [], isLoading: isMediaLoading } = useQuery({
    queryKey: ['public-real-estate-media', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('real_estate_media' as any)
        .select('original_storage_path, thumb_masked_storage_path, sort_order')
        .eq('listing_id', id)
        .order('sort_order', { ascending: true });

      if (error) return [];
      return data || [];
    },
    enabled: !!id,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  // ─── QUERY: Store Info ───────────────────────────────────────────────────
  const { data: storeInfo } = useQuery({
    queryKey: ['public-store-info-by-user', property?.user_id],
    enabled: !!property?.user_id,
    queryFn: async () => {
      const { data: storeData } = await (supabase.from('merchant_stores') as any).select('*').eq('user_id', property.user_id).maybeSingle();
      const { data: pData } = await (supabase.from("profiles") as any).select("*").eq("id", property.user_id).single();

      return {
          ...storeData,
          store_name: storeData?.nome_loja || pData?.nome_loja || storeData?.store_name || "Imobiliária / Corretor",
          logo_url: storeData?.logo_url || pData?.logo_url,
          city: storeData?.cidade || pData?.cidade || storeData?.city,
          region: storeData?.estado || pData?.estado || storeData?.region,
          bairro: storeData?.bairro || storeData?.neighborhood || pData?.bairro,
          logradouro: storeData?.rua || storeData?.street || pData?.rua || storeData?.endereco || pData?.endereco || storeData?.logradouro,
          description: storeData?.descricao || pData?.descricao || storeData?.description,
          categoria: storeData?.categoria || "Imóveis"
      };
    },
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });


  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: property?.title,
        text: property?.description?.slice(0, 100),
        url: window.location.href
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link copiado para a área de transferência!');
    }
  };

  const handleInterest = () => {
    try {
      supabase.rpc('rpc_register_property_click', {
        p_listing_id: id,
        p_visitor_fingerprint: getVisitorFingerprint(),
        p_amount: 5
      }).then((result) => console.log("[CPC_RESULT_INTEREST]", result));
    } catch (err) {
      console.error("[CPC_TRY_CATCH]", err);
    }
    setIntentionModal({ open: true, interestType: 'message_request' });
  };

  const handleWhatsApp = () => {
    setIntentionModal({ open: true, interestType: 'whatsapp_click' });
  };

  if (isPropertyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F5E62B] via-[#F8EC4A] to-[#F5E62B]">
        <div className="text-center space-y-4 bg-white/70 backdrop-blur-xl px-10 py-8 rounded-3xl shadow-xl border border-white/60">
          <Loader2 className="w-10 h-10 text-[#FF6A00] animate-spin mx-auto" />
          <p className="font-bold text-zinc-600 uppercase tracking-[0.2em] text-[11px]">Carregando imóvel…</p>
        </div>
      </div>
    );
  }

  if (propertyError || !property) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F5E62B] via-[#F8EC4A] to-[#F5E62B] p-6">
        <Card className="max-w-md w-full border-none shadow-2xl rounded-3xl p-10 text-center space-y-6 bg-white">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto">
             <Info className="w-10 h-10 text-red-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black tracking-tight">Anúncio Indisponível</h2>
            <p className="text-zinc-500 font-medium leading-relaxed">
              Não foi possível localizar este anúncio. Ele pode ter sido pausado, removido ou ainda está em análise.
            </p>
          </div>
          <Button onClick={() => navigate('/imoveis')} className="w-full h-12 rounded-2xl font-black bg-[#FF6A00] hover:bg-[#e55f00]">
            VOLTAR PARA LISTAGEM
          </Button>
        </Card>
      </div>
    );
  }

  const mainImageUrl = activeImage || (media.length > 0 ? getListingImageUrl(media[0].original_storage_path) : null);

  const priceFormatted = formatCurrencyBRL(property.price_brl);
  const isLoteArea = ['lote', 'terreno'].includes(String(property.property_type || '').toLowerCase());
  const areaLabel = property.total_area_m2
    ? (isLoteArea
        ? `${property.total_area_m2.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m²`
        : `${(property.total_area_m2 / 10000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ha`)
    : null;

  return (
    <>
      <MarketLayout showSearch={false} hideCart={true} mainClassName="bg-gradient-to-b from-[#F5E62B] via-[#F8EC4A] to-[#FFF9B8] pb-24">

      {/* ─── HEADER BAR premium ─── */}
      <div className="sticky top-0 z-40 bg-[#F5E62B]/80 backdrop-blur-xl border-b border-zinc-900/5">
        <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="rounded-full gap-2 font-semibold text-zinc-800 hover:bg-white/60"
          >
            <ChevronLeft className="w-4 h-4" /> Voltar
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="rounded-full h-10 w-10 p-0 bg-white/80 hover:bg-white border-white shadow-sm"
            >
               <Share2 className="w-4 h-4 text-zinc-700" />
            </Button>
          </div>
        </div>
      </div>

      {/* ─── STORE HEADER ─── */}
      {storeInfo && (
          <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
              <StoreHeader
                store={storeInfo}
                stats={null}
                productsCount={0}
                whatsappNumber={null}
                onShare={handleShare}
                logoUrl={storeInfo.logo_url || null}
                bannerUrl={storeInfo.banner_url || null}
              />
          </div>
      )}

      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">

          {/* ─── COLUNA PRINCIPAL ─── */}
          <div className="lg:col-span-8 space-y-8">

            {/* GALERIA PREMIUM */}
            <section className="space-y-4">
              <div className="relative aspect-[4/3] sm:aspect-[16/10] rounded-[28px] overflow-hidden bg-zinc-100 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] ring-1 ring-black/5">
                {mainImageUrl ? (
                  <>
                    <img
                      src={mainImageUrl}
                      alt={property.title}
                      className="w-full h-full object-cover animate-in fade-in zoom-in duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="w-10 h-10 text-zinc-300 animate-spin" />
                  </div>
                )}

                {/* Badge categoria – elegante */}
                {property.property_type && (
                  <div className="absolute top-5 left-5 inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-md text-zinc-900 text-[10px] font-bold uppercase tracking-[0.15em] px-3 py-1.5 rounded-full shadow-lg ring-1 ring-black/5">
                    <Tag className="w-3 h-3 text-[#FF6A00]" />
                    {property.property_type}
                  </div>
                )}

                {/* Contador de fotos */}
                {media.length > 0 && (
                  <div className="absolute bottom-5 right-5 bg-black/60 backdrop-blur-md text-white text-[11px] font-semibold px-3 py-1.5 rounded-full">
                    {media.length} {media.length === 1 ? 'foto' : 'fotos'}
                  </div>
                )}
              </div>

              {/* Thumbnails padronizadas */}
              {media.length > 1 && (
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  {media.map((m: any, idx: number) => {
                    const url = getListingImageUrl(m.original_storage_path);
                    const isActive = activeImage === url || (!activeImage && idx === 0);
                    return (
                      <button
                        key={idx}
                        onClick={() => setActiveImage(url)}
                        className={cn(
                          "relative flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden transition-all duration-300",
                          isActive
                            ? "ring-2 ring-[#FF6A00] ring-offset-2 ring-offset-[#F5E62B] shadow-lg scale-[1.02]"
                            : "ring-1 ring-black/10 opacity-70 hover:opacity-100 hover:scale-[1.02]"
                        )}
                      >
                        <img
                          src={url}
                          className="w-full h-full object-cover"
                          alt={`Foto ${idx + 1}`}
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* TÍTULO + LOCALIZAÇÃO */}
            <section className="bg-white rounded-3xl p-6 sm:p-8 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.2)] ring-1 ring-black/5 space-y-5">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#FF6A00] bg-orange-50 px-2.5 py-1 rounded-full">
                  <Sparkles className="w-3 h-3" />
                  Destaque Premium
                </div>
                <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-black text-zinc-900 tracking-tight leading-[1.05]">
                  {property.title}
                </h1>
                <div className="flex items-center gap-2 text-zinc-600 font-medium text-sm">
                  <MapPin className="w-4 h-4 text-[#FF6A00] flex-shrink-0" />
                  <span>{property.public_address_label}</span>
                </div>
              </div>

              {/* Chips de informação rápida */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {areaLabel && (
                  <InfoChip
                    icon={<Maximize2 className="w-4 h-4" />}
                    label="Área Total"
                    value={areaLabel}
                  />
                )}
                {property.bedrooms > 0 && (
                  <InfoChip
                    icon={<BedDouble className="w-4 h-4" />}
                    label="Quartos"
                    value={String(property.bedrooms)}
                  />
                )}
                {property.bathrooms > 0 && (
                  <InfoChip
                    icon={<Bath className="w-4 h-4" />}
                    label="Banheiros"
                    value={String(property.bathrooms)}
                  />
                )}
                {property.property_type && (
                  <InfoChip
                    icon={<Home className="w-4 h-4" />}
                    label="Tipo"
                    value={property.property_type}
                  />
                )}
              </div>
            </section>

            {/* CTA MOBILE (aparece só no mobile, acima da descrição) */}
            <div className="lg:hidden">
              <PriceCard
                price={priceFormatted}
                onInterest={handleInterest}
              />
            </div>

            {/* DESCRIÇÃO */}
            {property.description && (
              <section className="bg-white rounded-3xl p-6 sm:p-8 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.2)] ring-1 ring-black/5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-8 bg-[#FF6A00] rounded-full" />
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-900">
                    Sobre o imóvel
                  </h2>
                </div>
                <div className="max-w-prose">
                  <p className="text-zinc-700 font-normal leading-[1.8] whitespace-pre-line text-[15px] sm:text-base">
                    {property.description}
                  </p>
                </div>
              </section>
            )}

            {/* CARD DE SEGURANÇA MOBILE */}
            <div className="lg:hidden">
              <SecurityCard />
            </div>
          </div>

          {/* ─── COLUNA LATERAL (desktop sticky) ─── */}
          <aside className="hidden lg:block lg:col-span-4">
            <div className="sticky top-24 space-y-5">
              <PriceCard
                price={priceFormatted}
                onInterest={handleInterest}
              />
              <SecurityCard />
            </div>
          </aside>

        </div>
      </div>
    </MarketLayout>

    {/* Modal de interesse de contato */}
    {id && property && (
      <ContactIntentionModal
        open={intentionModal.open}
        onClose={() => setIntentionModal(prev => ({ ...prev, open: false }))}
        listingId={id}
        listingModule="real_estate"
        interestType={intentionModal.interestType}
        listingTitle={property.title}
      />
    )}
  </>);
};

// ─── SUBCOMPONENTES PREMIUM ─────────────────────────────────────────────────

const InfoChip: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-3 bg-gradient-to-br from-zinc-50 to-white rounded-2xl px-4 py-3 ring-1 ring-black/5">
    <div className="w-9 h-9 rounded-xl bg-[#FF6A00]/10 text-[#FF6A00] flex items-center justify-center flex-shrink-0">
      {icon}
    </div>
    <div className="min-w-0">
      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider truncate">{label}</div>
      <div className="text-sm font-black text-zinc-900 truncate">{value}</div>
    </div>
  </div>
);

const PriceCard: React.FC<{ price: string; onInterest: () => void }> = ({ price, onInterest }) => (
  <Card className="border-none rounded-3xl overflow-hidden shadow-[0_20px_60px_-20px_rgba(0,0,0,0.25)] ring-1 ring-black/5 bg-white">
    <CardContent className="p-0">
      {/* Faixa superior premium */}
      <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 px-6 py-3 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">
          Valor de Investimento
        </span>
        <Sparkles className="w-3.5 h-3.5 text-[#F5E62B]" />
      </div>

      <div className="p-6 sm:p-7 space-y-6">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
            A partir de
          </div>
          <div className="text-[2.5rem] sm:text-5xl font-black text-zinc-900 tracking-tight leading-none">
            {price}
          </div>
          <div className="text-xs text-zinc-500 font-medium">
            Negociação direta com o anunciante
          </div>
        </div>

        <Button
          onClick={onInterest}
          className="w-full h-14 rounded-2xl font-black text-[15px] tracking-wide text-white
                     bg-gradient-to-r from-[#FF6A00] to-[#FF8A2B]
                     hover:from-[#e55f00] hover:to-[#ff7a15]
                     shadow-[0_10px_30px_-8px_rgba(255,106,0,0.55)]
                     hover:shadow-[0_15px_35px_-8px_rgba(255,106,0,0.7)]
                     transition-all active:scale-[0.98]"
        >
          ESTOU INTERESSADO
        </Button>

        {/* Lista de benefícios */}
        <div className="space-y-2.5 pt-2">
          {[
            'Contato direto com o anunciante',
            'Sem taxas ocultas na plataforma',
            'Suas informações permanecem privadas',
          ].map((item) => (
            <div key={item} className="flex items-start gap-2.5 text-xs text-zinc-600 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </CardContent>
  </Card>
);

const SecurityCard: React.FC = () => (
  <div className="relative overflow-hidden rounded-3xl bg-white ring-1 ring-black/5 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.15)] p-6">
    <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-50 rounded-full opacity-70" />
    <div className="relative space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-inner">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-600">
            Proteção Viagg
          </div>
          <h4 className="font-black text-zinc-900 text-sm">Dica de Segurança</h4>
        </div>
      </div>
      <p className="text-[13px] text-zinc-600 font-normal leading-relaxed">
        Sempre agende visitas em horários comerciais e em locais públicos antes de ir a propriedades rurais isoladas. Negocie através da plataforma para a sua segurança.
      </p>
    </div>
  </div>
);

export default RealEstateDetailPage;
