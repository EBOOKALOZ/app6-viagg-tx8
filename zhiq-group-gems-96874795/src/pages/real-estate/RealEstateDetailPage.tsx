import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
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
import { MarketNavButtons } from '@/components/layout/MarketNavButtons';
import { StoreHeader } from '@/components/public/store/StoreHeader';
import { AdvertiserSummaryCard } from '@/components/public/advertiser/AdvertiserSummaryCard';
import { MarketPropertyCard } from '@/components/real-estate/MarketPropertyCard';
import { InstitutionalSafetyBanner } from '@/components/public/InstitutionalSafetyBanner';
import { StoreThemeScope } from '@/components/public/store/StoreThemeScope';
import { StoreLocationMap } from '@/components/StoreLocationMap';
import { DetailPageLayout } from '@/components/detail/DetailPageLayout';
import { StorePropertyCarousel } from '@/components/store/StorePropertyCarousel';
import { StoreProductsCarousel } from '@/components/store/StoreProductsCarousel';
import { RelatedPropertiesCarousel } from '@/components/store/RelatedPropertiesCarousel';
import { DetailSeoHead } from '@/components/seo/DetailSeoHead';
import { useAdvertiserSummary } from '@/components/public/advertiser/AdvertiserSummaryCard';

export const RealEstateDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeImage, setActiveImage] = useState<string | null>(null);
  
  const outletContext = useOutletContext<{ isStoreContext?: boolean }>();
  const isStoreContext = outletContext?.isStoreContext;
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

  // ─── QUERY: Side listings ──────────────────────────────────────────────────
  const { data: sideListings = [] } = useQuery({
    queryKey: ['realestate-side-listings', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('real_estate_listings' as any)
        .select('id, title, description, property_type, price_brl, total_area_m2, bedrooms, bathrooms, public_location, thumbnail_url, visibility_status')
        .eq('visibility_status', 'published')
        .neq('id', id!)
        .limit(4);
      return (data ?? []) as any[];
    },
    enabled: !!id,
  });

  // ─── Reset scroll to top on mount ──────────────────────────────────────────
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [id]);

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
  const { data: advertiserData } = useAdvertiserSummary(property?.owner_user_id, 'imoveis');
  const storeInfo = advertiserData?.store;
  const storeTargetId = advertiserData?.targetId || property?.owner_user_id;


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
      supabase.rpc('charge_real_estate_interest_click' as any, {
        p_listing_id: id,
        p_fingerprint: getVisitorFingerprint(),
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-institutional-yellow via-[#F8EC4A] to-institutional-yellow">
        <div className="text-center space-y-4 bg-white/70 backdrop-blur-xl px-10 py-8 rounded-3xl shadow-xl border border-white/60">
          <Loader2 className="w-10 h-10 text-[#FF6A00] animate-spin mx-auto" />
          <p className="font-bold text-zinc-600 uppercase tracking-[0.2em] text-[11px]">Carregando imóvel…</p>
        </div>
      </div>
    );
  }

  if (propertyError || !property) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-institutional-yellow via-[#F8EC4A] to-institutional-yellow p-6">
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

  const mainImageUrl = activeImage || (media.length > 0 ? getListingImageUrl(media[0].original_storage_path, 'original') : null);

  const priceFormatted = formatCurrencyBRL(property.price_brl);
  const isLoteArea = ['lote', 'terreno'].includes(String(property.property_type || '').toLowerCase());
  const areaLabel = property.total_area_m2
    ? (isLoteArea
        ? `${property.total_area_m2.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} m²`
        : `${(property.total_area_m2 / 10000).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ha`)
    : null;

  const galeria: string[] = media.length
    ? media.map((m: any) => getListingImageUrl(m.original_storage_path, 'original')!).filter(Boolean)
    : (mainImageUrl ? [mainImageUrl] : []);

  const operationLabel = String(property.operation_type || '').toLowerCase() === 'aluguel' ? 'Aluguel' : 'Venda';
  const tipoLabel = String(property.property_type || 'Imóvel').replace(/_/g, ' ');

  const content = (
      <>
        {storeInfo && !isStoreContext && (
          <StoreThemeScope appearance={storeInfo.appearance}>
            <div className="w-full bg-institutional-yellow">
              <StoreHeader
                store={storeInfo}
                productsCount={advertiserData?.totalCount || 0}
                profileType={advertiserData?.type || "imoveis"}
                showProfileButton={true}
                profileId={storeTargetId}
                compact={false}
              />
            </div>
          </StoreThemeScope>
        )}
        <DetailPageLayout
          bg="#F5E62B"
          accent="#2563eb"
          moduloLabel="Imóveis"
          titulo={property.title}
          preco={priceFormatted}
          precoSufixo={operationLabel === 'Aluguel' ? '/mês' : undefined}
          categoria={`${tipoLabel} · ${operationLabel}`}
          cidade={property.public_address_label || property.public_location}
          badges={[
            ...(property.is_promoted ? [{ label: '⭐ Patrocinado', bg: '#fef3c7', color: '#b45309' }] : []),
            { label: operationLabel, bg: '#dbeafe', color: '#1d4ed8' },
          ]}
          imagens={galeria}
          caracteristicas={[
            ...(areaLabel ? [{ icone: <Maximize2 className="h-3.5 w-3.5" />, label: areaLabel }] : []),
            ...(property.bedrooms ? [{ icone: <BedDouble className="h-3.5 w-3.5" />, label: `${property.bedrooms} quarto${property.bedrooms > 1 ? 's' : ''}` }] : []),
            ...(property.bathrooms ? [{ icone: <Bath className="h-3.5 w-3.5" />, label: `${property.bathrooms} banheiro${property.bathrooms > 1 ? 's' : ''}` }] : []),
            ...(property.parking_spots ? [{ icone: <Home className="h-3.5 w-3.5" />, label: `${property.parking_spots} vaga${property.parking_spots > 1 ? 's' : ''}` }] : []),
          ]}
          descricao={property.description}
          especificacoes={[
            { label: 'Tipo', value: tipoLabel },
            { label: 'Operação', value: operationLabel },
            ...(areaLabel ? [{ label: 'Área total', value: areaLabel }] : []),
            ...(property.built_area_m2 ? [{ label: 'Área construída', value: `${Number(property.built_area_m2).toLocaleString('pt-BR')} m²` }] : []),
            ...(property.bedrooms ? [{ label: 'Quartos', value: String(property.bedrooms) }] : []),
            ...(property.bathrooms ? [{ label: 'Banheiros', value: String(property.bathrooms) }] : []),
            ...(property.parking_spots ? [{ label: 'Vagas', value: String(property.parking_spots) }] : []),
            ...(property.agency_name ? [{ label: 'Imobiliária', value: property.agency_name }] : []),
          ]}
          mapa={property.lat && property.lng ? (
            <div className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <MapPin className="h-4 w-4" style={{ color: '#2563eb' }} />
                <p className="text-sm text-slate-900" style={{ fontWeight: 800 }}>Localização aproximada</p>
              </div>
              {property.public_address_label && <p className="mb-2 text-xs text-slate-500">{property.public_address_label}</p>}
              <div className="h-52 overflow-hidden rounded-2xl border border-slate-200">
                <StoreLocationMap
                  initialLat={property.lat}
                  initialLng={property.lng}
                  addressLabel={property.public_address_label ?? property.city}
                  markerLabel={property.title}
                  readOnly hasConfirmedLocation onLocationSelect={() => {}}
                  className="h-full w-full"
                />
              </div>
            </div>
          ) : undefined}
          extras={(
            <>
              <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p className="text-[11px] leading-relaxed text-emerald-800" style={{ fontWeight: 600 }}>
                  Contato Seguro Protegido por IA. Suas informações não são expostas sem sua autorização.
                </p>
              </div>
              <InstitutionalSafetyBanner />
            </>
          )}
          acoes={{
            onContatar: handleWhatsApp,
            onInteresse: handleInterest,
            interesseLabel: 'Tenho Interesse',
          }}
          relacionados={sideListings.map((r: any) => ({
            id: r.id,
            titulo: r.title || 'Imóvel',
            imagem: r.thumbnail_url,
            preco: r.price_brl ? formatCurrencyBRL(r.price_brl) : null,
            cidade: r.public_location,
            href: `/imoveis/${r.id}`,
          }))}
        />
        {storeInfo && (
          <div className="mx-auto max-w-4xl px-4 pb-24">
            <StorePropertyCarousel storeId={storeTargetId} currentPropertyId={property.id} />
            <StoreProductsCarousel storeId={storeTargetId} />
            <RelatedPropertiesCarousel currentProperty={property} />
          </div>
        )}
      </>
  );

  return (
    <>
      <DetailSeoHead property={property} storeInfo={storeInfo} />
      
      {isStoreContext ? (
          <div className="min-h-screen relative bg-institutional-yellow">
              {content}
          </div>
      ) : (
          <MarketLayout hideCart={true} mainClassName="min-h-screen relative bg-institutional-yellow" blueFooter blueFooterLabel="🏠 Imóveis" myAccountPath="/imoveis/minha-conta" headerChildren={<MarketNavButtons />}>
              {content}
          </MarketLayout>
      )}

      {id && property && (
        <ContactIntentionModal
          open={intentionModal.open}
          onClose={() => setIntentionModal((prev) => ({ ...prev, open: false }))}
          listingId={id}
          listingModule="real_estate"
          interestType={intentionModal.interestType}
          listingTitle={property.title}
        />
      )}
    </>
  );
};

export default RealEstateDetailPage;
