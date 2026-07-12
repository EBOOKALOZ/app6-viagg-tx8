import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Car,
  MapPin,
  ChevronLeft,
  Share2,
  ShieldCheck,
  Loader2,
  Info,
  Fuel,
  Settings,
  Gauge,
  Calendar,
  Palette,
  TrendingUp,
} from 'lucide-react';
import { getListingImageUrl, getMediaFallbackUrl } from '@/lib/real-estate/mediaUtils';
import { cn, formatCurrencyBRL } from '@/lib/utils';
import { toast } from 'sonner';
import { getVisitorFingerprint } from '@/lib/cpcTracker';
import { ContactIntentionModal } from '@/components/listings/ContactIntentionModal';
import { MarketLayout } from '@/components/layout/MarketLayout';
import { MarketVehicleCard } from '@/components/advertiser/MarketVehicleCard';
import { StoreHeader } from '@/components/public/store/StoreHeader';
import { InstitutionalSafetyBanner } from '@/components/public/InstitutionalSafetyBanner';
import { StoreLocationMap } from '@/components/StoreLocationMap';
import { DetailPageLayout } from '@/components/detail/DetailPageLayout';

/* ─────── helpers ─────── */
const vehicleTypeLabel: Record<string, string> = {
  carro: 'Carro',
  moto: 'Moto',
  barco: 'Barco',
  utilitario: 'Utilitário',
};

const fuelLabel: Record<string, string> = {
  flex: 'Flex',
  gasolina: 'Gasolina',
  diesel: 'Diesel',
  eletrico: 'Elétrico',
  hibrido: 'Híbrido',
};

const transmissionLabel: Record<string, string> = {
  manual: 'Manual',
  automatico: 'Automático',
  'semi-automatico': 'Semi-Automático',
};

const conditionLabel: Record<string, string> = {
  novo: 'Novo',
  seminovo: 'Seminovo',
  usado: 'Usado',
};

export const VehicleDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [intentionModal, setIntentionModal] = useState<{
    open: boolean;
    interestType: 'whatsapp_click' | 'message_request';
  }>({ open: false, interestType: 'message_request' });

  /* ─── QUERY: Vehicle Listing ─── */
  const {
    data: vehicle,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['public-vehicle-detail', id],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from('vehicle_listings' as any)
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (fetchError) throw fetchError;
      return data as any;
    },
    enabled: !!id,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  /* ─── QUERY: Side listings ─── */
  const { data: sideListings = [] } = useQuery({
    queryKey: ['vehicle-side-listings', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('vehicle_listings' as any)
        .select('id, title, vehicle_type, price_brl, brand, model, year, fuel_type, city, state, thumbnail_url, is_featured, visibility_status')
        .eq('visibility_status', 'published')
        .neq('id', id!)
        .order('is_featured', { ascending: false })
        .limit(4);
      return (data ?? []) as any[];
    },
    enabled: !!id,
  });

  /* ─── QUERY: Vehicle Media ─── */
  const { data: media = [] } = useQuery({
    queryKey: ['public-vehicle-media', id],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from('vehicle_media' as any)
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

  /* ─── QUERY: Store / Seller Info ─── */
  const { data: storeInfo } = useQuery({
    queryKey: ['public-store-info-vehicle', vehicle?.owner_user_id],
    enabled: !!vehicle?.owner_user_id,
    queryFn: async () => {
      const { data: storeData } = await (supabase.from('merchant_stores') as any)
        .select('*')
        .eq('user_id', vehicle.owner_user_id)
        .maybeSingle();
      const { data: pData } = await (supabase.from('profiles') as any)
        .select('*')
        .eq('id', vehicle.owner_user_id)
        .single();

      return {
        ...storeData,
        store_name:
          storeData?.nome_loja ||
          pData?.nome_loja ||
          storeData?.store_name ||
          'Vendedor Particular',
        logo_url: storeData?.logo_url || pData?.logo_url,
        city: storeData?.cidade || pData?.cidade || storeData?.city,
        region: storeData?.estado || pData?.estado || storeData?.region,
        bairro: storeData?.bairro || storeData?.neighborhood || pData?.bairro,
        description: storeData?.descricao || pData?.descricao || storeData?.description,
        categoria: storeData?.categoria || 'Veículos',
      };
    },
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
  });

  /* ─── Handlers ─── */
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: vehicle?.title,
        text: vehicle?.description?.slice(0, 100),
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success('Link copiado para a área de transferência!');
    }
  };

  // Visita do anúncio de veículo → cobra o clique (dívida sem pacote, igual imóveis).
  // chargedIdRef evita cobrança dupla: o React.StrictMode (main.tsx) monta o
  // componente 2x em dev, o que disparava esse efeito 2x (12cr em vez de 6cr).
  const chargedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!id || chargedIdRef.current === id) return;
    chargedIdRef.current = id;
    supabase.rpc('charge_vehicle_listing_click' as any, {
      p_listing_id: id,
      p_fingerprint: getVisitorFingerprint(),
    }).then(({ data }: any) => console.log('[VEHICLE_CLICK]', data)).catch(() => { /* noop */ });
  }, [id]);

  const handleInterest = () => {
    // Tenta descontar 9 créditos pelo botão de interesse da página de detalhes
    try {
      supabase.rpc('charge_vehicle_interest_click' as any, {
        p_listing_id: id,
        p_fingerprint: getVisitorFingerprint()
      }).then((result) => console.log("[CPC_RESULT_VEHICLE_INTEREST]", result));
    } catch (err) {
      console.error("[CPC_TRY_CATCH]", err);
    }
    setIntentionModal({ open: true, interestType: 'message_request' });
  };

  /* ─── Loading State ─── */
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5E62B]">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-zinc-900 animate-spin mx-auto" />
          <p className="font-black text-zinc-400 uppercase tracking-widest text-xs">
            Carregando Veículo...
          </p>
        </div>
      </div>
    );
  }

  /* ─── Error / Not Found ─── */
  if (error || !vehicle) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5E62B] p-6">
        <Card className="max-w-md w-full border-none shadow-2xl rounded-3xl p-10 text-center space-y-6">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto">
            <Info className="w-10 h-10 text-red-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black tracking-tight">Veículo Indisponível</h2>
            <p className="text-zinc-500 font-medium leading-relaxed">
              Não foi possível localizar este veículo. Ele pode ter sido removido ou ainda está em
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

  /* ─── Image Resolution ─── */
  const mainImageUrl =
    activeImage ||
    (media.length > 0
      ? getListingImageUrl((media[0] as any).original_storage_path, 'original')
      : null);

  const vehicleTitle =
    vehicle.title || `${vehicle.brand} ${vehicle.model} ${vehicle.year}`;

  /* ─── Galeria (todas as mídias) ─── */
  const galeria: string[] = media.length
    ? media.map((m: any) => getListingImageUrl(m.original_storage_path, 'original')!).filter(Boolean)
    : (mainImageUrl ? [mainImageUrl] : []);

  return (
    <>
      <MarketLayout showSearch={false} hideCart={true} mainClassName="min-h-screen relative bg-[#F5E62B]" blueFooter blueFooterLabel="🚗 Veículos" myAccountPath="/minha-conta">
        <DetailPageLayout
          bg="#F5E62B"
          accent="#dc2626"
          moduloLabel="Veículos"
          titulo={vehicleTitle}
          preco={vehicle.price_brl ? formatCurrencyBRL(vehicle.price_brl) : 'Consulte'}
          categoria={vehicleTypeLabel[vehicle.vehicle_type] || 'Veículo'}
          cidade={vehicle.public_address_label || `${vehicle.neighborhood ? vehicle.neighborhood + ', ' : ''}${vehicle.city}/${vehicle.state}`}
          badges={[
            ...(vehicle.condition ? [{ label: conditionLabel[vehicle.condition] || vehicle.condition, bg: '#dcfce7', color: '#15803d' }] : []),
            ...(vehicle.is_promoted ? [{ label: '⭐ Patrocinado', bg: '#fef3c7', color: '#b45309' }] : []),
          ]}
          imagens={galeria}
          caracteristicas={[
            ...(vehicle.year ? [{ icone: <Calendar className="h-3.5 w-3.5" />, label: String(vehicle.year) }] : []),
            ...(vehicle.kilometers != null ? [{ icone: <Gauge className="h-3.5 w-3.5" />, label: `${Number(vehicle.kilometers).toLocaleString('pt-BR')} km` }] : []),
            ...(vehicle.fuel_type ? [{ icone: <Fuel className="h-3.5 w-3.5" />, label: fuelLabel[vehicle.fuel_type] || vehicle.fuel_type }] : []),
            ...(vehicle.transmission ? [{ icone: <Settings className="h-3.5 w-3.5" />, label: transmissionLabel[vehicle.transmission] || vehicle.transmission }] : []),
            ...(vehicle.color ? [{ icone: <Palette className="h-3.5 w-3.5" />, label: vehicle.color }] : []),
          ]}
          descricao={vehicle.description}
          especificacoes={[
            ...(vehicle.brand ? [{ label: 'Marca', value: vehicle.brand }] : []),
            ...(vehicle.model ? [{ label: 'Modelo', value: vehicle.model }] : []),
            ...(vehicle.year ? [{ label: 'Ano', value: String(vehicle.year) }] : []),
            ...(vehicle.kilometers != null ? [{ label: 'Km', value: Number(vehicle.kilometers).toLocaleString('pt-BR') }] : []),
            ...(vehicle.fuel_type ? [{ label: 'Combustível', value: fuelLabel[vehicle.fuel_type] || vehicle.fuel_type }] : []),
            ...(vehicle.transmission ? [{ label: 'Câmbio', value: transmissionLabel[vehicle.transmission] || vehicle.transmission }] : []),
            ...(vehicle.color ? [{ label: 'Cor', value: vehicle.color }] : []),
            ...(vehicle.plate_end ? [{ label: 'Final da placa', value: String(vehicle.plate_end) }] : []),
          ]}
          mapa={vehicle.latitude && vehicle.longitude ? (
            <div className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <MapPin className="h-4 w-4" style={{ color: '#dc2626' }} />
                <p className="text-sm text-slate-900" style={{ fontWeight: 800 }}>Localização do anunciante</p>
              </div>
              {vehicle.public_address_label && <p className="mb-2 text-xs text-slate-500">{vehicle.public_address_label}</p>}
              <div className="h-52 overflow-hidden rounded-2xl border border-slate-200">
                <StoreLocationMap
                  initialLat={vehicle.latitude}
                  initialLng={vehicle.longitude}
                  addressLabel={vehicle.public_address_label ?? vehicle.city}
                  markerLabel={vehicle.title ?? `${vehicle.brand} ${vehicle.model}`}
                  readOnly hasConfirmedLocation onLocationSelect={() => {}}
                  className="h-full w-full"
                />
              </div>
            </div>
          ) : undefined}
          extras={(
            <>
              {storeInfo && <StoreHeader store={storeInfo} />}
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
          relacionados={sideListings.map((v: any) => ({
            id: v.id,
            titulo: v.title || `${v.brand ?? ''} ${v.model ?? ''}`.trim() || 'Veículo',
            imagem: v.thumbnail_url,
            preco: v.price_brl ? formatCurrencyBRL(v.price_brl) : null,
            cidade: v.city,
            href: `/veiculos/${v.id}`,
          }))}
        />
      </MarketLayout>

      {/* Contact Intention Modal */}
      {id && vehicle && (
        <ContactIntentionModal
          open={intentionModal.open}
          onClose={() => setIntentionModal((prev) => ({ ...prev, open: false }))}
          listingId={id}
          listingModule="vehicles"
          interestType={intentionModal.interestType}
          listingTitle={vehicleTitle}
        />
      )}
    </>
  );
};

export default VehicleDetailPage;
