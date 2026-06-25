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

  return (
    <>
      <MarketLayout showSearch={false} hideCart={true} mainClassName="bg-[#F5E62B] min-h-screen relative" blueFooter blueFooterLabel="🚚 Fretes & Mudanças" myAccountPath="/minha-conta">
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

        <div className="w-full px-4 sm:px-6 lg:px-10 py-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
            <div className="lg:col-span-8 space-y-8">
              <div className="space-y-4">
                <div className="relative aspect-[16/10] rounded-[32px] lg:rounded-[40px] overflow-hidden bg-white shadow-2xl ring-1 ring-zinc-900/10">
                  {mainImageUrl ? (
                    <img
                      src={mainImageUrl}
                      alt={freightTitle}
                      className="w-full h-full object-cover animate-in fade-in zoom-in duration-500"
                      onError={(e) => {
                        const fallback = getMediaFallbackUrl(
                          (e.target as HTMLImageElement).src
                        );
                        if (fallback) (e.target as HTMLImageElement).src = fallback;
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
                      <span className="flex items-center justify-center w-28 h-28 rounded-full bg-white/80 text-blue-600 ring-1 ring-blue-200 shadow-md">
                        <TypeIcon className="w-14 h-14" />
                      </span>
                    </div>
                  )}
                  <div className="absolute top-6 left-6 flex gap-2">
                    <Badge className="font-black uppercase text-[10px] bg-blue-600 text-white py-1.5 px-4 backdrop-blur-md shadow-lg">
                      {freight.vehicle_type}
                    </Badge>
                    {freight.is_featured && (
                      <Badge className="font-black uppercase text-[10px] bg-amber-500 text-white py-1.5 px-4 backdrop-blur-md shadow-lg flex items-center gap-1">
                        <Star className="w-3 h-3 fill-current" /> Destaque
                      </Badge>
                    )}
                  </div>
                </div>

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

              <div className="space-y-6">
                <div className="space-y-2">
                  <h1 className="text-4xl lg:text-6xl font-black text-zinc-900 tracking-tighter leading-[0.95]">
                    {freightTitle}
                  </h1>
                  <div className="flex items-center gap-2 text-zinc-700 font-bold text-xs uppercase tracking-widest pt-2">
                    <MapPin className="w-4 h-4 text-blue-600" />
                    {freight.public_address_label ||
                      `${freight.neighborhood ? freight.neighborhood + ', ' : ''}${freight.city}/${freight.state}`}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-2 gap-4 p-6 rounded-3xl bg-white shadow-xl ring-1 ring-zinc-900/10">
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                      Tipo de Veículo
                    </span>
                    <div className="flex items-center gap-2.5 font-black text-xl text-zinc-900">
                      <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700 ring-1 ring-blue-200/60 shrink-0">
                        <TypeIcon className="h-[19px] w-[19px]" />
                      </span>
                      {freight.vehicle_type}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                      Valor
                    </span>
                    <div className="flex items-center gap-2 font-black text-xl text-zinc-900">
                      {freight.price_label?.trim() || 'Consulte'}
                    </div>
                  </div>
                  {!!freight.price_per_km && (
                    <div className="space-y-2 col-span-2 sm:col-span-1">
                      <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                        Preço por km
                      </span>
                      <div className="flex items-center gap-2 font-black text-xl text-blue-600">
                        R$ {Number(freight.price_per_km).toFixed(2)}/km
                      </div>
                    </div>
                  )}
                  {!!freight.coverage_routes?.trim() && (
                    <div className="space-y-2 col-span-2">
                      <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                        Rotas Atendidas
                      </span>
                      <div className="font-bold text-sm text-zinc-700">
                        {freight.coverage_routes}
                      </div>
                    </div>
                  )}
                </div>

                {freight.description && (
                  <div className="space-y-4 p-6 rounded-3xl bg-white shadow-xl ring-1 ring-zinc-900/10">
                    <h3 className="text-xl font-black uppercase tracking-tight text-zinc-900">
                      Descrição do Serviço
                    </h3>
                    <p className="text-zinc-600 font-medium leading-relaxed whitespace-pre-line text-base lg:text-lg">
                      {freight.description}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-4 space-y-6">
              <div className="sticky top-24 space-y-6">
                <Card className="border-none shadow-2xl rounded-[35px] overflow-hidden ring-1 ring-zinc-900/10 bg-white">
                  <CardContent className="p-8 space-y-8">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                        Valor
                      </span>
                      <div className="text-4xl lg:text-5xl font-black text-blue-600 tracking-tighter">
                        {freight.price_label?.trim() || 'Consulte'}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <Button
                        onClick={handleInterest}
                        className="w-full h-16 rounded-2xl font-black text-lg text-white shadow-xl shadow-blue-600/30 bg-blue-600 hover:bg-blue-700 transition-all active:scale-95"
                      >
                        ESTOU INTERESSADO
                      </Button>
                    </div>

                    <div className="pt-6 border-t border-zinc-100 flex items-start gap-3">
                      <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                      <p className="text-[10px] text-zinc-500 font-bold uppercase leading-relaxed tracking-tight">
                        Contato Seguro Protegido por IA. Suas informações não são expostas
                        sem sua autorização.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <div className="p-6 bg-white shadow-xl ring-1 ring-zinc-900/10 rounded-3xl space-y-3">
                  <h4 className="font-black text-zinc-900 text-sm uppercase flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-600" /> Dica de Segurança
                  </h4>
                  <p className="text-xs text-zinc-600 font-medium leading-relaxed">
                    Sempre confirme o endereço e a reputação da transportadora antes de fechar.
                    Negocie através da plataforma para sua segurança.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
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
