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

  return (
    <>
      <MarketLayout showSearch={false} hideCart={true} mainClassName="bg-[#F5E62B] min-h-screen relative" blueFooter blueFooterLabel="🚗 Veículos" myAccountPath="/minha-conta">
        {/* ─── HEADER BAR (sticky em amarelo) ─── */}
        <div className="sticky top-0 z-40 bg-[#F5E62B]/90 backdrop-blur-md border-b border-zinc-900/10">
          <div className="w-full px-4 sm:px-6 lg:px-10 h-16 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="rounded-full gap-2 font-bold text-zinc-900 hover:bg-zinc-900/10"
            >
              <ChevronLeft className="w-4 h-4" /> Voltar
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
                className="rounded-full h-10 w-10 p-0 border-zinc-900/20 bg-white text-zinc-900 hover:bg-zinc-50 shadow-md"
              >
                <Share2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>



        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_240px] gap-6 items-start">
            {/* ── Coluna esquerda ── */}
            <div className="hidden lg:flex flex-col gap-4">
              {sideListings.slice(0, 2).map((v: any) => (
                <MarketVehicleCard key={v.id} vehicle={v} />
              ))}
              {sideListings.length > 0 && (
                <button onClick={() => navigate('/veiculos')} className="text-xs font-bold text-[#FF6A00] hover:underline text-center py-1">Ver mais veículos →</button>
              )}
            </div>
          <div className="space-y-6">
              {/* Gallery */}
              <div className="space-y-4">
                <div className="relative aspect-[16/10] rounded-[32px] lg:rounded-[40px] overflow-hidden bg-white shadow-2xl ring-1 ring-zinc-900/10">
                  {mainImageUrl ? (
                    <img
                      src={mainImageUrl}
                      alt={vehicleTitle}
                      className="w-full h-full object-cover animate-in fade-in zoom-in duration-500"
                      onError={(e) => {
                        const fallback = getMediaFallbackUrl(
                          (e.target as HTMLImageElement).src
                        );
                        if (fallback) (e.target as HTMLImageElement).src = fallback;
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Car className="w-20 h-20 text-zinc-300" />
                    </div>
                  )}
                  <Badge className="absolute top-6 left-6 font-black uppercase text-[10px] bg-blue-500 text-white py-1.5 px-4 backdrop-blur-md shadow-lg">
                    {vehicleTypeLabel[vehicle.vehicle_type] || 'Veículo'}
                  </Badge>
                  {vehicle.condition && (
                    <Badge className="absolute top-6 right-6 font-black uppercase text-[10px] bg-emerald-500 text-white py-1.5 px-4 backdrop-blur-md shadow-lg">
                      {conditionLabel[vehicle.condition] || vehicle.condition}
                    </Badge>
                  )}
                </div>

                {/* Thumbnails */}
                {media.length > 1 && (
                  <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide py-2">
                    {media.map((m: any, idx: number) => {
                      const thumbUrl = getListingImageUrl(
                        m.original_storage_path,
                        'original'
                      );
                      return (
                        <button
                          key={idx}
                          onClick={() => setActiveImage(thumbUrl)}
                          className={cn(
                            'flex-shrink-0 w-24 h-24 rounded-2xl overflow-hidden border-2 transition-all',
                            activeImage === thumbUrl || (!activeImage && idx === 0)
                              ? 'border-blue-500 scale-105 shadow-lg'
                              : 'border-transparent opacity-60 grayscale hover:grayscale-0 hover:opacity-100'
                          )}
                        >
                          <img
                            src={thumbUrl!}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const fallback = getMediaFallbackUrl(
                                (e.target as HTMLImageElement).src
                              );
                              if (fallback)
                                (e.target as HTMLImageElement).src = fallback;
                            }}
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Vehicle Info */}
              <div className="space-y-6">
                <div className="space-y-2">
                  <h1 className="text-4xl lg:text-6xl font-black text-zinc-900 tracking-tighter leading-[0.95]">
                    {vehicleTitle}
                  </h1>
                  <div className="flex items-center gap-2 text-zinc-700 font-bold text-xs uppercase tracking-widest pt-2">
                    <MapPin className="w-4 h-4 text-[#FF6A00]" />
                    {vehicle.public_address_label ||
                      `${vehicle.neighborhood ? vehicle.neighborhood + ', ' : ''}${vehicle.city}/${vehicle.state}`}
                  </div>
                </div>

                {/* Specs Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-6 rounded-3xl bg-white shadow-xl ring-1 ring-zinc-900/10">
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                      Ano
                    </span>
                    <div className="flex items-center gap-2 font-black text-xl text-zinc-900">
                      <Calendar className="w-5 h-5 text-[#FF6A00]" />
                      {vehicle.year || '—'}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                      Km
                    </span>
                    <div className="flex items-center gap-2 font-black text-xl text-zinc-900">
                      <Gauge className="w-5 h-5 text-[#FF6A00]" />
                      {vehicle.kilometers
                        ? Number(vehicle.kilometers).toLocaleString('pt-BR')
                        : '0'}
                    </div>
                  </div>
                  {vehicle.fuel_type && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                        Combustível
                      </span>
                      <div className="flex items-center gap-2 font-black text-xl text-zinc-900">
                        <Fuel className="w-5 h-5 text-[#FF6A00]" />
                        {fuelLabel[vehicle.fuel_type] || vehicle.fuel_type}
                      </div>
                    </div>
                  )}
                  {vehicle.transmission && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                        Câmbio
                      </span>
                      <div className="flex items-center gap-2 font-black text-xl text-zinc-900">
                        <Settings className="w-5 h-5 text-[#FF6A00]" />
                        {transmissionLabel[vehicle.transmission] || vehicle.transmission}
                      </div>
                    </div>
                  )}
                </div>

                {/* Brand + Model + Color chips */}
                <div className="flex flex-wrap gap-3">
                  {vehicle.brand && (
                    <Badge
                      variant="secondary"
                      className="py-2 px-5 rounded-2xl font-black uppercase text-[10px] tracking-widest bg-[#FF6A00] text-white hover:bg-[#FF6A00] shadow-md"
                    >
                      <TrendingUp className="w-3 h-3 mr-2" />
                      {vehicle.brand}
                    </Badge>
                  )}
                  {vehicle.model && (
                    <Badge
                      variant="secondary"
                      className="py-2 px-5 rounded-2xl font-black uppercase text-[10px] tracking-widest bg-white text-zinc-900 ring-1 ring-zinc-900/10 hover:bg-zinc-50 shadow-md"
                    >
                      <Car className="w-3 h-3 mr-2" />
                      {vehicle.model}
                    </Badge>
                  )}
                  {vehicle.color && (
                    <Badge
                      variant="secondary"
                      className="py-2 px-5 rounded-2xl font-black uppercase text-[10px] tracking-widest bg-white text-zinc-900 ring-1 ring-zinc-900/10 hover:bg-zinc-50 shadow-md"
                    >
                      <Palette className="w-3 h-3 mr-2" />
                      {vehicle.color}
                    </Badge>
                  )}
                </div>

                {/* Description */}
                {vehicle.description && (
                  <div className="space-y-4 p-6 rounded-3xl bg-white shadow-xl ring-1 ring-zinc-900/10">
                    <h3 className="text-xl font-black uppercase tracking-tight text-zinc-900">
                      Descrição do Veículo
                    </h3>
                    <p className="text-zinc-600 font-medium leading-relaxed whitespace-pre-line text-base lg:text-lg">
                      {vehicle.description}
                    </p>
                  </div>
                )}

                {(vehicle.latitude && vehicle.longitude) && (
                  <div className="space-y-3 p-6 rounded-3xl bg-white shadow-xl ring-1 ring-zinc-900/10">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#FF6A00]" />
                      <h3 className="font-black text-zinc-900 text-sm">Localização do anunciante</h3>
                    </div>
                    {vehicle.public_address_label && (
                      <p className="text-xs text-zinc-500 font-medium">{vehicle.public_address_label}</p>
                    )}
                    <div className="rounded-2xl overflow-hidden border border-zinc-200 shadow-sm h-52">
                      <StoreLocationMap
                        initialLat={vehicle.latitude}
                        initialLng={vehicle.longitude}
                        addressLabel={vehicle.public_address_label ?? vehicle.city}
                        markerLabel={vehicle.title ?? `${vehicle.brand} ${vehicle.model}`}
                        readOnly
                        hasConfirmedLocation
                        onLocationSelect={() => {}}
                        className="w-full h-full"
                      />
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-3xl p-6 space-y-4 border border-zinc-200 shadow-xl">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Preço</span>
                    <div className="text-4xl lg:text-5xl font-black text-[#FF6A00] tracking-tighter">
                      {vehicle.price_brl ? formatCurrencyBRL(vehicle.price_brl) : 'Consulte'}
                    </div>
                  </div>
                  <Button
                    onClick={handleInterest}
                    className="w-full h-16 rounded-2xl font-black text-lg text-white shadow-xl shadow-[#FF6A00]/30 bg-[#FF6A00] hover:bg-[#E65C00] transition-all active:scale-95"
                  >
                    ESTOU INTERESSADO
                  </Button>
                  <div className="pt-4 border-t border-zinc-100 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-zinc-500 font-bold uppercase leading-relaxed tracking-tight">
                      Contato Seguro Protegido por IA. Suas informações não são expostas
                      sem sua autorização.
                    </p>
                  </div>
                </div>
              </div>
          </div>
            {/* ── Coluna direita ── */}
            <div className="hidden lg:flex flex-col gap-4">
              {sideListings.slice(2, 4).map((v: any) => (
                <MarketVehicleCard key={v.id} vehicle={v} />
              ))}
              {sideListings.length > 0 && (
                <button onClick={() => navigate('/veiculos')} className="text-xs font-bold text-[#FF6A00] hover:underline text-center py-1">Ver mais veículos →</button>
              )}
            </div>
          </div>
        </div>

        <InstitutionalSafetyBanner />
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
