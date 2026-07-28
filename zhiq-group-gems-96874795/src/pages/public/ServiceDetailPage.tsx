import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  MapPin,
  ChevronLeft,
  Share2,
  ShieldCheck,
  Loader2,
  Info,
} from 'lucide-react';
import { getListingImageUrl, getMediaFallbackUrl } from '@/lib/real-estate/mediaUtils';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getVisitorFingerprint } from '@/lib/cpcTracker';
import { ContactIntentionModal } from '@/components/listings/ContactIntentionModal';
import { MarketLayout } from '@/components/layout/MarketLayout';
import { MarketServiceCard } from '@/components/services/MarketServiceCard';
import { resolveServiceTypeLabel, resolveServiceTypeIcon } from '@/lib/services/serviceCategories';
import { InstitutionalSafetyBanner } from '@/components/public/InstitutionalSafetyBanner';
import { AdvertiserSummaryCard } from '@/components/public/advertiser/AdvertiserSummaryCard';
import { StoreLocationMap } from '@/components/StoreLocationMap';
import { DetailPageLayout } from '@/components/detail/DetailPageLayout';

export const ServiceDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [intentionModal, setIntentionModal] = useState<{
    open: boolean;
    interestType: 'whatsapp_click' | 'message_request';
  }>({ open: false, interestType: 'message_request' });

  const outletContext = useOutletContext<{ isStoreContext?: boolean }>();
  const isStoreContext = outletContext?.isStoreContext;

  const {
    data: service,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['public-service-detail', id],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from('service_listings' as any)
        // NÃO usar select('*'): total_price é base INTERNA da comissão de 2% e
        // não pode vazar no payload público. Selecionar só o que a página exibe.
        .select('id, title, description, service_type, price_label, city, state, neighborhood, public_address_label, visibility_status, owner_user_id, store_id, profile_id, latitude, longitude')
        .eq('id', id)
        .maybeSingle();

      if (fetchError) throw fetchError;
      return data as any;
    },
    enabled: !!id,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  const { data: media = [] } = useQuery({
    queryKey: ['public-service-media', id],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from('service_media' as any)
        .select('original_storage_path, media_type, sort_order')
        .eq('listing_id', id)
        .order('sort_order', { ascending: true });

      if (fetchError) return [];
      return data || [];
    },
    enabled: !!id,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  /* ─── QUERY: Side listings ─── */
  const { data: sideListings = [] } = useQuery({
    queryKey: ['service-side-listings', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('service_listings' as any)
        .select('id, title, service_type, price_label, city, state, thumbnail_url, visibility_status')
        .eq('visibility_status', 'published')
        .neq('id', id!)
        .limit(4);
      return (data ?? []) as any[];
    },
    enabled: !!id,
  });

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: service?.title,
        text: service?.description?.slice(0, 100),
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link copiado para a área de transferência!');
    }
  };

  // Visita do anúncio de serviço → cobra o clique (dívida sem pacote, igual veículos).
  const chargedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!id || chargedIdRef.current === id) return;
    chargedIdRef.current = id;
    supabase.rpc('charge_service_listing_click' as any, {
      p_listing_id: id,
      p_fingerprint: getVisitorFingerprint(),
    }).then(({ data }: any) => console.log('[SERVICE_CLICK]', data)).catch(() => { /* noop */ });
  }, [id]);

  const handleInterest = () => {
    try {
      supabase.rpc('charge_service_interest_click' as any, {
        p_listing_id: id,
        p_fingerprint: getVisitorFingerprint()
      }).then((result) => console.log("[CPC_RESULT_SERVICE_INTEREST]", result));
    } catch (err) {
      console.error("[CPC_TRY_CATCH]", err);
    }
    setIntentionModal({ open: true, interestType: 'message_request' });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-institutional-yellow">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-zinc-900 animate-spin mx-auto" />
          <p className="font-black text-zinc-400 uppercase tracking-widest text-xs">
            Carregando Serviço...
          </p>
        </div>
      </div>
    );
  }

  if (error || !service) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-institutional-yellow p-6">
        <Card className="max-w-md w-full border-none shadow-2xl rounded-3xl p-10 text-center space-y-6">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto">
            <Info className="w-10 h-10 text-red-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black tracking-tight">Serviço Indisponível</h2>
            <p className="text-zinc-500 font-medium leading-relaxed">
              Não foi possível localizar este serviço. Ele pode ter sido removido ou ainda está em
              análise.
            </p>
          </div>
          <Button
            onClick={() => navigate('/mercado')}
            className="w-full h-12 rounded-2xl font-black"
          >
            VOLTAR AO MERCADO
          </Button>
        </Card>
      </div>
    );
  }

  const mainImageUrl =
    activeImage ||
    (media.length > 0
      ? getListingImageUrl((media[0] as any).original_storage_path, 'original')
      : null);

  const typeLabel = resolveServiceTypeLabel(service.service_type);
  const TypeIcon = resolveServiceTypeIcon(service.service_type);
  const serviceTitle = service.title;

  const galeria: string[] = media.length
    ? media.map((m: any) => getListingImageUrl(m.original_storage_path, 'original')!).filter(Boolean)
    : (mainImageUrl ? [mainImageUrl] : []);

  const content = (
        <DetailPageLayout
          bg="#F5E62B"
          accent="#7c3aed"
          moduloLabel="Serviços"
          titulo={serviceTitle}
          preco={service.price_label?.trim() || 'Consulte'}
          categoria={typeLabel}
          cidade={service.public_address_label || `${service.neighborhood ? service.neighborhood + ', ' : ''}${service.city}/${service.state}`}
          imagens={galeria}
          caracteristicas={[
            { icone: <TypeIcon className="h-3.5 w-3.5" />, label: typeLabel },
            ...(service.state ? [{ icone: <MapPin className="h-3.5 w-3.5" />, label: `${service.city}/${service.state}` }] : []),
          ]}
          descricao={service.description}
          especificacoes={[
            { label: 'Categoria', value: typeLabel },
            { label: 'Valor', value: service.price_label?.trim() || 'Consulte' },
            ...(service.city ? [{ label: 'Cidade', value: `${service.city}/${service.state ?? ''}` }] : []),
          ]}
          mapa={service.latitude && service.longitude ? (
            <div className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <MapPin className="h-4 w-4" style={{ color: '#7c3aed' }} />
                <p className="text-sm text-slate-900" style={{ fontWeight: 800 }}>Localização do prestador</p>
              </div>
              {service.public_address_label && <p className="mb-2 text-xs text-slate-500">{service.public_address_label}</p>}
              <div className="h-52 overflow-hidden rounded-2xl border border-slate-200">
                <StoreLocationMap
                  initialLat={service.latitude}
                  initialLng={service.longitude}
                  addressLabel={service.public_address_label ?? service.city}
                  markerLabel={service.title}
                  readOnly hasConfirmedLocation onLocationSelect={() => {}}
                  className="h-full w-full"
                />
              </div>
            </div>
          ) : undefined}
          extras={(
            <>
              <AdvertiserSummaryCard
                advertiserId={service.store_id || service.profile_id || service.owner_user_id}
                profileType="servicos"
              />
              <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p className="text-[11px] leading-relaxed text-emerald-800" style={{ fontWeight: 600 }}>
                  Contato Seguro Protegido por IA. Suas informações não são expostas sem sua autorização.
                </p>
              </div>
              <InstitutionalSafetyBanner />
            </>
          )}
          acoes={{ onInteresse: handleInterest, interesseLabel: 'Tenho Interesse' }}
          relacionados={sideListings.map((s: any) => ({
            id: s.id,
            titulo: s.title || 'Serviço',
            imagem: s.thumbnail_url,
            preco: s.price_label?.trim() || null,
            cidade: s.city,
            href: `/servicos/${s.id}`,
          }))}
        />
  );

  return (
    <>
      {isStoreContext ? (
          <div className="min-h-screen relative bg-institutional-yellow">
              {content}
          </div>
      ) : (
          <MarketLayout hideCart={true} mainClassName="min-h-screen relative bg-institutional-yellow" blueFooter blueFooterLabel="🛠️ Serviços" myAccountPath="/minha-conta">
              {content}
          </MarketLayout>
      )}

      {id && service && (
        <ContactIntentionModal
          open={intentionModal.open}
          onClose={() => setIntentionModal((prev) => ({ ...prev, open: false }))}
          listingId={id}
          listingModule="services"
          interestType={intentionModal.interestType}
          listingTitle={serviceTitle}
        />
      )}
    </>
  );
};

export default ServiceDetailPage;
