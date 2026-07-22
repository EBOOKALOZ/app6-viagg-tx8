import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  Star,
} from 'lucide-react';
import { getListingImageUrl, getMediaFallbackUrl } from '@/lib/real-estate/mediaUtils';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getVisitorFingerprint } from '@/lib/cpcTracker';
import { ContactIntentionModal } from '@/components/listings/ContactIntentionModal';
import { MarketLayout } from '@/components/layout/MarketLayout';
import { resolveFreightVehicleIcon } from '@/lib/freight/vehicleTypes';
import { MarketFreightCard } from '@/components/freight/MarketFreightCard';
import { InstitutionalSafetyBanner } from '@/components/public/InstitutionalSafetyBanner';
import { StoreLocationMap } from '@/components/StoreLocationMap';
import { DetailPageLayout } from '@/components/detail/DetailPageLayout';

export const FreightDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [intentionModal, setIntentionModal] = useState<{
    open: boolean;
    interestType: 'whatsapp_click' | 'message_request';
  }>({ open: false, interestType: 'message_request' });

  const {
    data: freight,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['public-freight-detail', id],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from('freight_listings' as any)
        // NÃO usar select('*'): total_price é base INTERNA da comissão de 2% e
        // não pode vazar no payload público. Selecionar só o que a página exibe.
        .select('id, title, description, vehicle_type, price_label, price_per_km, coverage_routes, city, state, neighborhood, public_address_label, is_featured, subcategoria, visibility_status')
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
    queryKey: ['public-freight-media', id],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from('freight_media' as any)
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
    queryKey: ['freight-side-listings', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('freight_listings' as any)
        .select('id, title, vehicle_type, price_label, price_per_km, coverage_routes, city, state, thumbnail_url, is_featured, visibility_status')
        .eq('visibility_status', 'published')
        .neq('id', id!)
        .order('is_featured', { ascending: false })
        .limit(4);
      return (data ?? []) as any[];
    },
    enabled: !!id,
  });

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: freight?.title,
        text: freight?.description?.slice(0, 100),
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link copiado para a área de transferência!');
    }
  };

  // Visita do anúncio de frete → cobra o clique (dívida sem pacote, igual serviços).
  const chargedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!id || chargedIdRef.current === id) return;
    chargedIdRef.current = id;
    supabase.rpc('charge_freight_listing_click' as any, {
      p_listing_id: id,
      p_fingerprint: getVisitorFingerprint(),
    }).then(({ data }: any) => console.log('[FREIGHT_CLICK]', data)).catch(() => { /* noop */ });
  }, [id]);

  const handleInterest = () => {
    try {
      supabase.rpc('charge_freight_interest_click' as any, {
        p_listing_id: id,
        p_fingerprint: getVisitorFingerprint()
      }).then((result) => console.log("[CPC_RESULT_FREIGHT_INTEREST]", result));
    } catch (err) {
      console.error("[CPC_TRY_CATCH]", err);
    }
    setIntentionModal({ open: true, interestType: 'message_request' });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5E62B]">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-zinc-900 animate-spin mx-auto" />
          <p className="font-black text-zinc-400 uppercase tracking-widest text-xs">
            Carregando Frete...
          </p>
        </div>
      </div>
    );
  }

  if (error || !freight) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5E62B] p-6">
        <Card className="max-w-md w-full border-none shadow-2xl rounded-3xl p-10 text-center space-y-6">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto">
            <Info className="w-10 h-10 text-red-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black tracking-tight">Frete Indisponível</h2>
            <p className="text-zinc-500 font-medium leading-relaxed">
              Não foi possível localizar este anúncio. Ele pode ter sido removido ou ainda está em
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

  const TypeIcon = resolveFreightVehicleIcon(freight.vehicle_type);
  const freightTitle = freight.title;

  const galeria: string[] = media.length
    ? media.map((m: any) => getListingImageUrl(m.original_storage_path, 'original')!).filter(Boolean)
    : (mainImageUrl ? [mainImageUrl] : []);

  return (
    <>
      <MarketLayout hideCart={true} mainClassName="min-h-screen relative bg-[#F5E62B]" blueFooter blueFooterLabel="🚚 Fretes & Mudanças" myAccountPath="/minha-conta">
        <DetailPageLayout
          bg="#F5E62B"
          accent="#ca8a04"
          moduloLabel="Fretes & Mudanças"
          titulo={freightTitle}
          preco={freight.price_label?.trim() || 'Consulte'}
          precoSufixo={freight.price_per_km ? `ou R$ ${Number(freight.price_per_km).toFixed(2)}/km` : undefined}
          categoria={freight.vehicle_type}
          cidade={freight.public_address_label || `${freight.neighborhood ? freight.neighborhood + ', ' : ''}${freight.city}/${freight.state}`}
          badges={freight.is_featured ? [{ label: '⭐ Destaque', bg: '#fef3c7', color: '#b45309' }] : []}
          imagens={galeria}
          caracteristicas={[
            { icone: <TypeIcon className="h-3.5 w-3.5" />, label: freight.vehicle_type },
            ...(freight.price_per_km ? [{ label: `R$ ${Number(freight.price_per_km).toFixed(2)}/km` }] : []),
          ]}
          descricao={freight.description}
          especificacoes={[
            { label: 'Tipo de Veículo', value: freight.vehicle_type },
            { label: 'Valor', value: freight.price_label?.trim() || 'Consulte' },
            ...(freight.price_per_km ? [{ label: 'Preço por km', value: `R$ ${Number(freight.price_per_km).toFixed(2)}` }] : []),
            ...(freight.coverage_routes?.trim() ? [{ label: 'Rotas Atendidas', value: freight.coverage_routes }] : []),
            ...(freight.city ? [{ label: 'Cidade', value: `${freight.city}/${freight.state ?? ''}` }] : []),
          ]}
          mapa={freight.latitude && freight.longitude ? (
            <div className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <MapPin className="h-4 w-4" style={{ color: '#ca8a04' }} />
                <p className="text-sm text-slate-900" style={{ fontWeight: 800 }}>Localização da transportadora</p>
              </div>
              {freight.public_address_label && <p className="mb-2 text-xs text-slate-500">{freight.public_address_label}</p>}
              <div className="h-52 overflow-hidden rounded-2xl border border-slate-200">
                <StoreLocationMap
                  initialLat={freight.latitude}
                  initialLng={freight.longitude}
                  addressLabel={freight.public_address_label ?? freight.city}
                  markerLabel={freight.title}
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
          acoes={{ onInteresse: handleInterest, interesseLabel: 'Tenho Interesse' }}
          relacionados={sideListings.map((f: any) => ({
            id: f.id,
            titulo: f.title || 'Frete',
            imagem: f.thumbnail_url,
            preco: f.price_label?.trim() || (f.price_per_km ? `R$ ${Number(f.price_per_km).toFixed(2)}/km` : null),
            cidade: f.city,
            href: `/fretes/${f.id}`,
          }))}
        />
      </MarketLayout>

      {id && freight && (
        <ContactIntentionModal
          open={intentionModal.open}
          onClose={() => setIntentionModal((prev) => ({ ...prev, open: false }))}
          listingId={id}
          listingModule="freight"
          interestType={intentionModal.interestType}
          listingTitle={freightTitle}
        />
      )}
    </>
  );
};

export default FreightDetailPage;
